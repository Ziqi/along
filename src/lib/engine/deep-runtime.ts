import type { AiFail } from "../ai/errors.ts";
import { heuristicEssay } from "../essay-kit.ts";
import { withDeadline } from "../live-queue.ts";
import { liveMode, type EngineContext } from "./context.ts";

export const ESSAY_CAP = 2;
/** Server budget is search 20 s + talk 20 s (both writers in parallel); past this the slot is freed. */
export const DEEP_TIMEOUT_MS = 50_000;

/** What the card says when its 检索 failed — by code, never the server's raw line. */
export function humanDeepError(fail: Pick<AiFail, "code" | "error">) {
  switch (fail.code) {
    case "no_facts":
    case "empty":
      return "没检索到，再点一次。";
    case "timeout":
      return "这一次检索超时了，再点一次。";
    case "rate_limited":
      return "检索太勤了，过几秒再点。";
    case "unavailable":
      return "检索没接到模型，稍后再点。";
    default:
      return fail.error || "检索没写出来，再点一次。";
  }
}

/**
 * DeepSearch for one coach card. Two searches may run at once; further clicks
 * wait in order. Each card has its own generation so a stale result after
 * pause / end never lands, while a fresh click on the same card is a no-op
 * until the running one settles.
 */
export function createDeepRuntime(ctx: EngineContext) {
  const { store, api, now } = ctx;
  const gens = new Map<string, number>();
  const inflight = new Set<string>();
  const queue: string[] = [];

  async function request(coachId?: string): Promise<void> {
    const s = store.getState();
    const card = (coachId ? s.coaches.find((c) => c.id === coachId) : null) ?? s.coach;
    const id = card?.id ?? "latest";
    if (!card) {
      s.ping("先写出三条，再检索。");
      return;
    }
    if (inflight.has(id)) return;
    const caps = s.captions;
    const bits = {
      lastHeard: caps.at(-1)?.en ?? card.prompt ?? "",
      recent: caps.slice(-12).map((c) => c.en),
      topic: card.topic ?? "",
      move: card.move ?? "",
      options: (card.options ?? []).map((o) => o.en),
      extras: (card.extras ?? []).map((o) => o.en),
    };
    // The card shows 检索中 from the click, whether it runs now or waits its turn:
    // the placeholder draft is the per-card pending state.
    s.setEssay(
      heuristicEssay({
        topic: bits.topic,
        lastHeard: bits.lastHeard,
        recent: bits.recent,
        options: bits.options,
        extras: bits.extras,
      }),
      card.id,
      true,
    );
    if (inflight.size >= ESSAY_CAP) {
      if (!queue.includes(id)) queue.push(id);
      return;
    }
    inflight.add(id);
    const mine = (gens.get(id) ?? 0) + 1;
    gens.set(id, mine);
    s.setEssayPending(true, id);
    try {
      const result = await withDeadline(
        api.expand({
          data: {
            lastHeard: bits.lastHeard,
            recent: bits.recent,
            topic: bits.topic,
            move: bits.move,
            options: bits.options,
            mode: card.mode ?? liveMode(store),
          },
        }),
        DEEP_TIMEOUT_MS,
      );
      if (gens.get(id) !== mine) return;
      if (!result.ok) {
        // The failure belongs to this card; another card's search is not disturbed.
        const live = store.getState();
        live.setEssay(null, card.id);
        live.setEssayError(humanDeepError(result), card.id);
        return;
      }
      store.getState().setEssay(
        {
          title: result.title,
          contextEn: result.contextEn,
          contextZh: result.contextZh,
          viewZh: result.viewZh,
          viewEn: result.viewEn,
          angles: result.angles,
          facts: result.facts,
          qZh: result.qZh,
          qEn: result.qEn,
          aZh: result.aZh,
          aEn: result.aEn,
          say: result.say,
          frames: result.frames,
          terms: result.terms,
          sources: result.sources ?? [],
          latencyMs: result.ms,
          at: now(),
          draft: result.draft,
        },
        card.id,
      );
    } catch {
      // A thrown call (network, 5xx, our deadline) must not leave the
      // placeholder draft behind: the card would say 检索中 forever.
      if (gens.get(id) === mine) {
        const live = store.getState();
        live.setEssay(null, card.id);
        live.setEssayError("检索超时，再点一次。", card.id);
      }
    } finally {
      if (gens.get(id) === mine) {
        inflight.delete(id);
        store.getState().setEssayPending(inflight.size > 0, inflight.size ? [...inflight][0] : null);
      }
      const next = queue.shift();
      if (next) void request(next);
    }
  }

  return {
    request,
    /** Pause / end: every running search becomes stale, the queue empties. */
    abort() {
      for (const id of gens.keys()) gens.set(id, (gens.get(id) ?? 0) + 1);
      // Results in flight are now stale and will never land; a placeholder left
      // on a running or waiting card would say 检索中 forever.
      const live = store.getState();
      for (const id of [...inflight, ...queue]) {
        if (live.essays[id]?.draft) live.setEssay(null, id);
      }
      inflight.clear();
      queue.length = 0;
      store.getState().setEssayPending(false);
    },
    get running() {
      return inflight.size;
    },
  };
}

export type DeepRuntime = ReturnType<typeof createDeepRuntime>;
