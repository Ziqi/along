import { coachMinGapMs } from "../class-mode.ts";
import {
  humanCoachError,
  isRetryableCoachError,
  shouldAskCoach,
  shouldKeepCoachCard,
  shouldRescueCoach,
} from "../coach-kit.ts";
import { COACH_TIMEOUT_MS, withDeadline } from "../live-queue.ts";
import { debounceSlot, liveMode, type EngineContext } from "./context.ts";

export const COACH_DEBOUNCE_MS = 2200;

type Source = "auto" | "intent";
type Opts = { rescue?: boolean; retry?: boolean };

/**
 * One coach card at a time, always for the latest beat. An auto request that
 * arrives while one is in flight is remembered as "one more, later", never
 * queued deeper. A failed write retries once; a stale result (generation
 * bumped by pause / end / 停写) is dropped on the floor.
 */
export function createCoachRuntime(ctx: EngineContext) {
  const { store, api, now } = ctx;
  let gen = 0;
  let inflight = false;
  let queued = false;
  let lastOkAt = 0;
  const timer = debounceSlot();

  async function write(source: Source, spoken?: string, opts?: Opts) {
    const s = store.getState();
    const intent = source === "intent" ? (spoken ?? s.intent).trim() : "";
    const last = s.captions.at(-1)?.en ?? "";
    const mode = liveMode(store);
    if (!last && !intent) return;
    if (!s.autoCoach && source === "auto") return;
    if (inflight && source === "auto") {
      queued = true;
      return;
    }
    if (
      source === "auto" &&
      !opts?.rescue &&
      !opts?.retry &&
      !shouldAskCoach({
        last,
        now: now(),
        minGapMs: coachMinGapMs(mode),
        prev: s.coach ? { prompt: s.coach.prompt, at: s.coach.at } : null,
      })
    ) {
      return;
    }
    const mine = ++gen;
    inflight = true;
    s.setCoachPending(true);
    let again: "retry" | null = null;
    try {
      const result = await withDeadline(
        api.coach({
          data: {
            last,
            recent: s.captions.slice(-24).map((c) => c.en),
            intent,
            prevTopic: s.coach?.topic ?? "",
            prevTopicZh: s.coach?.topicZh ?? "",
            notes: s.jots.map((j) => j.en || j.zh).filter(Boolean),
            mode,
          },
        }),
        COACH_TIMEOUT_MS,
      );
      if (mine !== gen) return;
      const live = store.getState();
      if (!live.liveId && (live.listening || live.mic === "arming")) live.ensureSession();
      if (!store.getState().liveId) {
        store.getState().setCoachError("这堂还没挂上，点重写再试。");
        return;
      }
      if (!result.ok) {
        const retryable = isRetryableCoachError(result);
        store.getState().setCoachError(humanCoachError(result, !opts?.retry && retryable ? "retrying" : "failed"));
        if (!opts?.retry && retryable) again = "retry";
        return;
      }
      if (!result.options.length) {
        store.getState().setCoachError(opts?.retry ? "教练没给出三条，点重写再试。" : "教练没给出三条，正在重写");
        if (!opts?.retry) again = "retry";
        return;
      }
      const prev = store.getState().coach;
      if (
        !shouldKeepCoachCard({
          source,
          lastHeard: last,
          now: now(),
          prev: prev ? { prompt: prev.prompt, options: prev.options, at: prev.at } : null,
          options: result.options,
        })
      ) {
        lastOkAt = now();
        store.getState().setCoachPending(false);
        store.getState().setCoachError(null);
        return;
      }
      if (source === "intent") store.getState().setIntent("");
      lastOkAt = now();
      store.getState().setCoach({
        id: `c-${now().toString(36)}`,
        topic: result.topic,
        topicZh: result.topicZh,
        briefZh: result.briefZh,
        briefEn: result.briefEn,
        move: result.move,
        mode,
        options: result.options,
        extras: result.extras ?? [],
        source,
        prompt: intent || last,
        latencyMs: result.ms,
        at: now(),
      });
    } catch {
      if (mine === gen) {
        store.getState().setCoachError(opts?.retry ? "这轮没写出来，点重写再试。" : "这轮慢了，正在重写");
        if (!opts?.retry) again = "retry";
      }
    } finally {
      if (mine === gen) {
        inflight = false;
        if (again === "retry") {
          void write(source, spoken, { ...opts, retry: true, rescue: true });
        } else if (queued) {
          // A beat landed while writing: write again for it once the class-mode gap has passed.
          queued = false;
          timer.schedule(coachMinGapMs(mode), () => void write("auto"));
        }
      }
    }
  }

  return {
    /** A new caption landed: write again after the beat settles, if 跟听 is on. */
    bump() {
      if (!store.getState().autoCoach) return;
      timer.schedule(COACH_DEBOUNCE_MS, () => void write("auto"));
    },
    /** 重写 / a typed intent. */
    request(spoken?: string) {
      void write("intent", spoken);
    },
    /** The periodic tick: write once more if the class went quiet after a good card. */
    rescue() {
      const s = store.getState();
      const last = s.captions.at(-1);
      if (s.coachError && !isRetryableCoachError(s.coachError)) return;
      if (
        !shouldRescueCoach({
          autoCoach: s.autoCoach,
          listening: s.listening,
          inflight,
          lastCaptionAt: last?.at ?? null,
          lastCoachOkAt: lastOkAt,
          now: now(),
        })
      ) {
        return;
      }
      void write("auto", undefined, { rescue: true });
    },
    /** 跟听 / 停写. Off drops the in-flight write; on writes at once when there is no card yet. */
    setLive(on: boolean) {
      store.getState().setAutoCoach(on);
      if (!on) {
        gen += 1;
        inflight = false;
        queued = false;
        timer.cancel();
        store.getState().setCoachPending(false);
        return;
      }
      const live = store.getState();
      const kick = Boolean(live.coachError) || !live.coach;
      void write("auto", undefined, kick ? { rescue: true } : undefined);
    },
    /** Pause / end: no in-flight result may land, nothing queued survives. */
    abort() {
      gen += 1;
      inflight = false;
      queued = false;
      lastOkAt = 0;
      timer.cancel();
      store.getState().setCoachPending(false);
    },
    get inflight() {
      return inflight;
    },
  };
}

export type CoachRuntime = ReturnType<typeof createCoachRuntime>;
