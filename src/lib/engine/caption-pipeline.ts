import {
  TRANS_CAP,
  TRANS_KEEP,
  TRANS_TIMEOUT_MS,
  TRANS_TRIES,
  hasZh,
  mergeTranslateQueue,
  needsTranslate,
  withDeadline,
} from "../live-queue.ts";
import { debounceSlot, type EngineContext } from "./context.ts";

export const TRANSLATE_DEBOUNCE_MS = 600;
export const UNTRANSLATED = "未译";

/**
 * Final captions in, Chinese out. Chases the latest line: at most `TRANS_CAP`
 * translations in flight, the newest `TRANS_KEEP` lines kept, each line tried
 * `TRANS_TRIES` times before it is marked 未译. All state lives on the instance.
 */
export function createCaptionPipeline(ctx: EngineContext, hooks: { onLine: () => void }) {
  const { store, api } = ctx;
  const batch: { id: string; en: string }[] = [];
  const tries = new Map<string, number>();
  const inflight = new Set<string>();
  const timer = debounceSlot();
  let busy = 0;

  function trim() {
    const s = store.getState();
    const pending = s.captions
      .filter((c) => needsTranslate(c) && !inflight.has(c.id) && (tries.get(c.id) ?? 0) < TRANS_TRIES)
      .map((c) => ({ id: c.id, en: c.en }));
    const next = mergeTranslateQueue(
      batch,
      pending,
      s.captions.map((c) => c.id),
      TRANS_KEEP,
    );
    batch.length = 0;
    batch.push(...next);
  }

  function fail(line: { id: string; en: string }) {
    const n = (tries.get(line.id) ?? 0) + 1;
    tries.set(line.id, n);
    if (n < TRANS_TRIES) batch.push(line);
    else store.getState().markError(line.id, UNTRANSLATED);
  }

  async function flush() {
    if (busy >= TRANS_CAP) return;
    trim();
    const line = batch.pop();
    if (!line) return;
    busy += 1;
    inflight.add(line.id);
    try {
      const result = await withDeadline(api.translate({ data: { lines: [line] } }), TRANS_TIMEOUT_MS);
      const zh = result.ok ? (result.items[0]?.zh ?? "") : "";
      if (hasZh(zh)) {
        tries.delete(line.id);
        store.getState().setZh(line.id, { zh, ms: result.ok ? result.ms : 0, en: line.en });
      } else {
        fail(line);
      }
    } catch {
      fail(line);
    } finally {
      busy = Math.max(0, busy - 1);
      inflight.delete(line.id);
    }
    if (batch.length) void flush();
  }

  return {
    /** A final line from the speech backend. Returns the caption id, or "" when dropped. */
    ingest(en: string): string {
      const s = store.getState();
      if (!s.listening) return "";
      const id = s.pushFinal(en);
      if (!id) return "";
      s.armClock();
      const text = store.getState().captions.find((c) => c.id === id)?.en ?? en;
      const existing = batch.find((b) => b.id === id);
      if (existing) existing.en = text;
      else batch.push({ id, en: text });
      timer.schedule(TRANSLATE_DEBOUNCE_MS, () => void flush());
      hooks.onLine();
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
    },
    get queued() {
      return batch.length;
    },
    get inflight() {
      return busy;
    },
  };
}

export type CaptionPipeline = ReturnType<typeof createCaptionPipeline>;
