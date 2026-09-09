import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { AppState } from "../state/app-state.ts";
import type { Caption } from "../types.ts";
import { MERGE_WINDOW_MS, TRANS_BATCH, TRANS_CAP } from "../live-queue.ts";
import { RATE_HOLD_MS, TRANSLATE_DEBOUNCE_MS, UNTRANSLATED, createCaptionPipeline } from "./caption-pipeline.ts";
import { noNav, type AiApi } from "./context.ts";

type Fake = {
  listening: boolean;
  captions: Caption[];
  seq: number;
  clockArmed: number;
  pushFinal: (en: string, opts?: { done?: boolean }) => string;
  armClock: () => void;
  setZh: (id: string, patch: { zh: string; ms: number; en?: string }) => void;
  markError: (id: string, error: string) => void;
};

/** A store whose clock the test drives; `pushFinal` joins a fragment onto an open, pending line like the real one. */
function fakeStore(clock: () => number) {
  const state: Fake = {
    listening: true,
    captions: [],
    seq: 0,
    clockArmed: 0,
    pushFinal(en, opts) {
      const last = state.captions.at(-1);
      if (last && last.pending && !last.done && clock() - last.at < MERGE_WINDOW_MS) {
        last.en = `${last.en} ${en}`;
        last.zh = "";
        if (opts?.done) last.done = true;
        return last.id;
      }
      state.seq += 1;
      const id = `DL-${state.seq}`;
      state.captions.push({ id, seq: state.seq, at: clock(), en, zh: "", pending: true, done: Boolean(opts?.done) });
      return id;
    },
    armClock() {
      state.clockArmed += 1;
    },
    setZh(id, patch) {
      state.captions = state.captions.map((c) => {
        if (c.id !== id) return c;
        if (patch.en && c.en !== patch.en) return c;
        return { ...c, zh: patch.zh, pending: false };
      });
    },
    markError(id, error) {
      state.captions = state.captions.map((c) => (c.id === id ? { ...c, pending: false, error } : c));
    },
  };
  return { state, getState: () => state as unknown as AppState };
}

type Translate = AiApi["translate"];

function api(translate: Translate): AiApi {
  const never = (() => {
    throw new Error("not used in this test");
  }) as unknown;
  return {
    translate,
    quick: never as AiApi["quick"],
    say: never as AiApi["say"],
    coach: never as AiApi["coach"],
    expand: never as AiApi["expand"],
    recap: never as AiApi["recap"],
    segment: never as AiApi["segment"],
    catchUp: never as AiApi["catchUp"],
    mintStt: never as AiApi["mintStt"],
  };
}

/** Let every settled promise run its continuation (mock timers leave microtasks alone). */
const settle = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

/** A clock the mock timers and the pipeline share. */
function harness(translate: Translate) {
  let t = 1_000_000;
  const now = () => t;
  const store = fakeStore(now);
  const pipe = createCaptionPipeline({ store, api: api(translate), nav: noNav, now }, { onLine: () => {} });
  const tick = async (ms: number) => {
    t += ms;
    mock.timers.tick(ms);
    await settle();
  };
  return { store, pipe, tick, now };
}

const echo: Translate = async ({ data }) => ({
  ok: true,
  items: data.lines.map((l) => ({ id: l.id, zh: `译:${l.en}` })),
  ms: 12,
});

describe("caption pipeline", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  it("a closed utterance is translated right after the debounce", async () => {
    const calls: { id: string; en: string }[][] = [];
    const h = harness(async (args) => {
      calls.push(args.data.lines);
      return echo(args);
    });
    const id = h.pipe.ingest("We should raise prices next quarter.", { done: true });
    assert.equal(id, "DL-1");
    assert.equal(h.store.state.clockArmed, 1);
    assert.equal(calls.length, 0, "nothing goes out before the debounce");
    await h.tick(TRANSLATE_DEBOUNCE_MS);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [{ id: "DL-1", en: "We should raise prices next quarter." }]);
    assert.equal(h.store.state.captions[0]?.zh, "译:We should raise prices next quarter.");
    assert.equal(h.store.state.captions[0]?.pending, false);
  });

  it("a line that may still grow waits for the merge window; fragments joined meanwhile cost no call", async () => {
    const calls: string[][] = [];
    const h = harness(async (args) => {
      calls.push(args.data.lines.map((l) => l.en));
      return echo(args);
    });
    h.pipe.ingest("We should raise");
    await h.tick(1000);
    h.pipe.ingest("prices next quarter");
    await h.tick(1000);
    assert.equal(calls.length, 0, "still inside the merge window: no call yet");
    assert.equal(h.store.state.captions.length, 1, "the fragment joined the line");
    await h.tick(MERGE_WINDOW_MS);
    assert.equal(calls.length, 1, "one call for the whole line once it settled");
    assert.deepEqual(calls[0], ["We should raise prices next quarter"]);
    assert.equal(h.store.state.captions[0]?.zh, "译:We should raise prices next quarter");
  });

  it("settled lines go several to a call, newest first, and come back by id", async () => {
    const calls: string[][] = [];
    const h = harness(async (args) => {
      calls.push(args.data.lines.map((l) => l.id));
      // Answer in reverse order to prove ids are honoured.
      return { ok: true, items: [...args.data.lines].reverse().map((l) => ({ id: l.id, zh: `译${l.id}` })), ms: 1 };
    });
    for (let i = 0; i < TRANS_BATCH + 2; i += 1) {
      h.pipe.ingest(`line number ${i} spoken in class today`, { done: true });
      await h.tick(50);
    }
    await h.tick(TRANSLATE_DEBOUNCE_MS);
    assert.equal(calls.length, 2, "six settled lines: one full batch and the rest");
    assert.equal(calls[0]!.length, TRANS_BATCH);
    assert.equal(calls[0]![0], `DL-${TRANS_BATCH + 2}`, "newest first");
    for (const c of h.store.state.captions) assert.equal(c.zh, `译${c.id}`);
  });

  it("a model that dropped the ids is read in order", async () => {
    const h = harness(async ({ data }) => ({ ok: true, items: data.lines.map((l) => ({ id: "", zh: `译:${l.en}` })), ms: 1 }));
    h.pipe.ingest("first line here", { done: true });
    h.pipe.ingest("second line here", { done: true });
    await h.tick(TRANSLATE_DEBOUNCE_MS);
    assert.equal(h.store.state.captions[0]?.zh, "译:first line here");
    assert.equal(h.store.state.captions[1]?.zh, "译:second line here");
  });

  it("drops lines while not listening", () => {
    const h = harness(async () => ({ ok: false, code: "empty", error: "" }));
    h.store.state.listening = false;
    assert.equal(h.pipe.ingest("hello there friend"), "");
    assert.equal(h.store.state.captions.length, 0);
  });

  it("marks a line 未译 after three empty answers", async () => {
    let n = 0;
    const h = harness(async () => {
      n += 1;
      return { ok: true, items: [], ms: 1 };
    });
    h.pipe.ingest("The market does not care about your feelings.", { done: true });
    await h.tick(TRANSLATE_DEBOUNCE_MS);
    for (let i = 0; i < 4; i += 1) {
      h.pipe.retryPending();
      await settle();
    }
    assert.equal(n, 3, "three tries, no more");
    assert.equal(h.store.state.captions[0]?.error, UNTRANSLATED);
    assert.equal(h.pipe.queued, 0);
  });

  it("keeps at most TRANS_CAP calls in flight and a free slot pulls the next waiting lines", async () => {
    const open: { ids: string[]; resolve: () => void }[] = [];
    const h = harness(
      ({ data }) =>
        new Promise((resolve) => {
          open.push({
            ids: data.lines.map((l) => l.id),
            resolve: () => resolve({ ok: true, items: data.lines.map((l) => ({ id: l.id, zh: `译${l.id}` })), ms: 1 }),
          });
        }),
    );
    for (let i = 0; i < TRANS_BATCH * (TRANS_CAP + 1); i += 1) h.pipe.ingest(`sentence ${i} about the economy`, { done: true });
    await h.tick(TRANSLATE_DEBOUNCE_MS);
    h.pipe.retryPending();
    await settle();
    assert.equal(h.pipe.inflight, TRANS_CAP);
    assert.equal(open.length, TRANS_CAP);
    open[0]!.resolve();
    await settle();
    assert.equal(open.length, TRANS_CAP + 1, "a free slot pulls the last waiting batch at once");
    for (const o of open.slice(1)) o.resolve();
    await settle();
    assert.equal(h.store.state.captions.filter((c) => c.pending).length, 0);
  });

  it("no key at all: one answer is enough to mark the line 未译", async () => {
    let n = 0;
    const h = harness(async () => {
      n += 1;
      return { ok: false, code: "unavailable", error: "AI 暂不可用" };
    });
    h.pipe.ingest("A sentence nobody can translate without a key.", { done: true });
    await h.tick(TRANSLATE_DEBOUNCE_MS);
    for (let i = 0; i < 3; i += 1) {
      h.pipe.retryPending();
      await settle();
    }
    assert.equal(n, 1);
    assert.equal(h.store.state.captions[0]?.error, UNTRANSLATED);
  });

  it("a key xAI refuses (403) is asked once, not three times", async () => {
    let n = 0;
    const h = harness(async () => {
      n += 1;
      return { ok: false, code: "upstream", error: "xAI 错误 403", status: 403 };
    });
    h.pipe.ingest("A sentence the account has no credits to translate.", { done: true });
    await h.tick(TRANSLATE_DEBOUNCE_MS);
    for (let i = 0; i < 3; i += 1) {
      h.pipe.retryPending();
      await settle();
    }
    assert.equal(n, 1);
    assert.equal(h.store.state.captions[0]?.error, UNTRANSLATED);
  });

  it("太频繁 is not a try: the queue rests and asks again, and the line is never marked 未译", async () => {
    let refusals = 2;
    const calls: number[] = [];
    const h = harness(async ({ data }) => {
      calls.push(1);
      if (refusals > 0) {
        refusals -= 1;
        return { ok: false, code: "rate_limited", error: "太频繁了，稍等一下。" };
      }
      return { ok: true, items: [{ id: data.lines[0]!.id, zh: "终于译了" }], ms: 1 };
    });
    h.pipe.ingest("Quarterly pressure bends long-term plans.", { done: true });
    await h.tick(TRANSLATE_DEBOUNCE_MS);
    assert.equal(calls.length, 1);
    assert.ok(h.pipe.holding > 0, "the queue is resting");
    assert.equal(h.store.state.captions[0]?.error, undefined);
    for (let i = 0; i < 3; i += 1) {
      h.pipe.retryPending();
      await settle();
    }
    assert.equal(calls.length, 1, "no call while resting");
    await h.tick(RATE_HOLD_MS);
    assert.equal(calls.length, 2);
    await h.tick(RATE_HOLD_MS);
    assert.equal(calls.length, 3);
    assert.equal(h.store.state.captions[0]?.zh, "终于译了");
    assert.equal(h.pipe.holding, 0);
  });

  it("abort forgets queued lines and retry counts; a late result still lands", async () => {
    let release: (() => void) | null = null;
    const h = harness(
      ({ data }) =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, items: [{ id: data.lines[0]!.id, zh: "晚到的翻译" }], ms: 1 });
        }),
    );
    h.pipe.ingest("a sentence the student wants translated", { done: true });
    await h.tick(TRANSLATE_DEBOUNCE_MS);
    assert.equal(h.pipe.inflight, 1);
    h.pipe.abort();
    assert.equal(h.pipe.queued, 0);
    assert.equal(h.pipe.inflight, 0);
    release!();
    await settle();
    assert.equal(h.store.state.captions[0]?.zh, "晚到的翻译", "a heard line keeps its translation even after pause");
  });
});
