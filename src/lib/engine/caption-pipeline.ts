import {
  MERGE_WINDOW_MS,
  TRANS_BATCH,
  TRANS_CAP,
  TRANS_KEEP,
  TRANS_TIMEOUT_MS,
  TRANS_TRIES,
  hasZh,
  mergeTranslateQueue,
  needsTranslate,
  withDeadline,
} from "../live-queue.ts";
import { isTerminalAiFail } from "../ai/errors.ts";
import { debounceSlot, type EngineContext } from "./context.ts";

/** After the last line settled, how long before the queue asks. */
export const TRANSLATE_DEBOUNCE_MS = 300;
export const UNTRANSLATED = "未译";
/** How long the queue waits after the server says 太频繁 before asking again. */
export const RATE_HOLD_MS = 8000;

type Line = { id: string; en: string };

/**
 * Final captions in, Chinese out.
 *
 * A line is translated only once it has **settled**: the recognizer closed
 * the utterance (`done`), or `MERGE_WINDOW_MS` passed since the line began, so
 * no later fragment can be joined onto it. Translating a line that is still
 * growing throws the answer away and holds a slot for nothing — that was a
 * third of all calls. Settled lines go to the model several at a time
 * (`TRANS_BATCH`), newest first, at most `TRANS_CAP` calls in flight and the
 * newest `TRANS_KEEP` lines in view; each line is tried `TRANS_TRIES` times
 * before it is marked 未译. A refusal for being too frequent is not a try: the
 * whole queue rests `RATE_HOLD_MS`. All state lives on the instance.
 */
export function createCaptionPipeline(ctx: EngineContext, hooks: { onLine: () => void }) {
  const { store, api, now } = ctx;
  const batch: Line[] = [];
  const tries = new Map<string, number>();
  const inflight = new Set<string>();
  const timer = debounceSlot();
  let busy = 0;
  let holdUntil = 0;

  /** When this caption stops being joinable: at once if closed, else the merge window after it began. */
  function settleAt(c: { at: number; done?: boolean }) {
    return c.done ? 0 : c.at + MERGE_WINDOW_MS;
  }

  /** Rebuild the queue from the store: settled, untranslated, not in flight, tries left. Returns the next settle time, if any line is still growing. */
  function trim(): number | null {
    const s = store.getState();
    const t = now();
    let nextSettle: number | null = null;
    const pending: Line[] = [];
    for (const c of s.captions) {
      if (!needsTranslate(c) || inflight.has(c.id) || (tries.get(c.id) ?? 0) >= TRANS_TRIES) continue;
      const at = settleAt(c);
      if (at > t) {
        nextSettle = nextSettle === null ? at : Math.min(nextSettle, at);
        continue;
      }
      pending.push({ id: c.id, en: c.en });
    }
    const settledIds = new Set(pending.map((p) => p.id));
    const next = mergeTranslateQueue(
      batch.filter((b) => settledIds.has(b.id)),
      pending,
      s.captions.map((c) => c.id),
      TRANS_KEEP,
    );
    batch.length = 0;
    batch.push(...next);
    return nextSettle;
  }

  function fail(line: Line) {
    const n = (tries.get(line.id) ?? 0) + 1;
    tries.set(line.id, n);
    if (n < TRANS_TRIES) batch.push(line);
    else store.getState().markError(line.id, UNTRANSLATED);
  }

  /** Too frequent: keep the lines, count no try, and let the queue rest a while. */
  function hold(lines: Line[]) {
    batch.push(...lines);
    holdUntil = now() + RATE_HOLD_MS;
    timer.schedule(RATE_HOLD_MS, () => void flush());
  }

  async function flush() {
    if (busy >= TRANS_CAP) return;
    const wait = holdUntil - now();
    if (wait > 0) {
      if (!timer.pending) timer.schedule(wait, () => void flush());
      return;
    }
    const nextSettle = trim();
    // Newest settled lines first, several in one call.
    const lines = batch.splice(Math.max(0, batch.length - TRANS_BATCH)).reverse();
    if (!lines.length) {
      if (nextSettle !== null && !timer.pending) timer.schedule(Math.max(1, nextSettle - now()), () => void flush());
      return;
    }
    busy += 1;
    for (const l of lines) inflight.add(l.id);
    let rested = false;
    try {
      const result = await withDeadline(api.translate({ data: { lines } }), TRANS_TIMEOUT_MS);
      if (!result.ok && result.code === "rate_limited") {
        rested = true;
      } else if (!result.ok && isTerminalAiFail(result)) {
        // No key, a refused key, or nothing to translate: asking twice more changes nothing.
        for (const l of lines) {
          tries.set(l.id, TRANS_TRIES);
          fail(l);
        }
      } else if (!result.ok) {
        for (const l of lines) fail(l);
      } else {
        const wanted = new Set(lines.map((l) => l.id));
        const byId = new Map(result.items.filter((it) => wanted.has(it.id)).map((it) => [it.id, it.zh] as const));
        lines.forEach((l, i) => {
          // Matched by id; a model that dropped the ids answered in order.
          const zh = byId.get(l.id) ?? (byId.size === 0 ? result.items[i]?.zh : undefined) ?? "";
          if (hasZh(zh)) {
            tries.delete(l.id);
            store.getState().setZh(l.id, { zh, ms: result.ms, en: l.en });
          } else {
            fail(l);
          }
        });
      }
    } catch {
      for (const l of lines) fail(l);
    } finally {
      busy = Math.max(0, busy - 1);
      for (const l of lines) inflight.delete(l.id);
    }
    if (rested) {
      hold(lines);
      return;
    }
    // A slot just freed: look again at once, including lines that settled meanwhile.
    void flush();
  }

  return {
    /** A final line from the speech backend. `done` = the utterance ended here. Returns the caption id, or "" when dropped. */
    ingest(en: string, opts?: { done?: boolean }): string {
      const s = store.getState();
      if (!s.listening) return "";
      const id = s.pushFinal(en, opts);
      if (!id) return "";
      s.armClock();
      hooks.onLine();
      // Ask once the newest line has settled (now, if the utterance is closed).
      const c = store.getState().captions.find((x) => x.id === id);
      const wait = c ? Math.max(0, settleAt(c) - now()) : 0;
      timer.schedule(wait + TRANSLATE_DEBOUNCE_MS, () => void flush());
      return id;
    },
    /** Fill every free slot with lines still waiting for Chinese. */
    retryPending() {
      trim();
      const slots = Math.max(0, TRANS_CAP - busy);
      for (let i = 0; i < slots; i += 1) void flush();
    },
    /** Forget every queued line and every retry count; in-flight results still land. */
    abort() {
      timer.cancel();
      batch.length = 0;
      tries.clear();
      inflight.clear();
      busy = 0;
      holdUntil = 0;
    },
    /** Milliseconds the queue is still resting after a 太频繁, or 0. */
    get holding() {
      return Math.max(0, holdUntil - now());
    },
    /** Calls in flight. */
    get inflight() {
      return busy;
    },
    get queued() {
      return batch.length;
    },
  };
}

export type CaptionPipeline = ReturnType<typeof createCaptionPipeline>;
