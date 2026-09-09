import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { AppState } from "../state/app-state.ts";
import type { Caption } from "../types.ts";
import { RATE_HOLD_MS, TRANSLATE_DEBOUNCE_MS, UNTRANSLATED, createCaptionPipeline } from "./caption-pipeline.ts";
import { noNav, type AiApi } from "./context.ts";

type Fake = {
  listening: boolean;
  captions: Caption[];
  seq: number;
  clockArmed: number;
  pushFinal: (en: string) => string;
  armClock: () => void;
  setZh: (id: string, patch: { zh: string; ms: number; en?: string }) => void;
  markError: (id: string, error: string) => void;
};

function fakeStore() {
  const state: Fake = {
    listening: true,
    captions: [],
    seq: 0,
    clockArmed: 0,
    pushFinal(en) {
      state.seq += 1;
      const id = `DL-${state.seq}`;
      state.captions.push({ id, seq: state.seq, at: Date.now(), en, zh: "", pending: true });
      return id;
    },
    armClock() {
      state.clockArmed += 1;
    },
    setZh(id, patch) {
      state.captions = state.captions.map((c) => (c.id === id ? { ...c, zh: patch.zh, pending: false } : c));
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

describe("caption pipeline", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  it("translates a final line once the debounce passes and writes the Chinese back", async () => {
    const store = fakeStore();
    const calls: { id: string; en: string }[][] = [];
    const translate: Translate = async ({ data }) => {
      calls.push(data.lines);
      return { ok: true, items: data.lines.map((l) => ({ id: l.id, zh: `译:${l.en}` })), ms: 12 };
    };
    const lines: string[] = [];
    const pipe = createCaptionPipeline({ store, api: api(translate), nav: noNav, now: Date.now }, { onLine: () => lines.push("x") });

    const id = pipe.ingest("We should raise prices next quarter.");
    assert.equal(id, "DL-1");
    assert.equal(store.state.clockArmed, 1);
    assert.equal(lines.length, 1, "each line notifies the engine once");
    assert.equal(calls.length, 0, "nothing goes out before the debounce");

    mock.timers.tick(TRANSLATE_DEBOUNCE_MS);
    await settle();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [{ id: "DL-1", en: "We should raise prices next quarter." }]);
    assert.equal(store.state.captions[0]?.zh, "译:We should raise prices next quarter.");
    assert.equal(store.state.captions[0]?.pending, false);
  });

  it("drops lines while not listening", () => {
    const store = fakeStore();
    store.state.listening = false;
    const pipe = createCaptionPipeline({ store, api: api(async () => ({ ok: false, code: "empty", error: "" })), nav: noNav, now: Date.now }, { onLine: () => {} });
    assert.equal(pipe.ingest("hello there friend"), "");
    assert.equal(store.state.captions.length, 0);
  });

  it("marks a line 未译 after three empty answers", async () => {
    const store = fakeStore();
    let n = 0;
    const translate: Translate = async () => {
      n += 1;
      return { ok: true, items: [], ms: 1 };
    };
    const pipe = createCaptionPipeline({ store, api: api(translate), nav: noNav, now: Date.now }, { onLine: () => {} });
    pipe.ingest("The market does not care about your feelings.");
    mock.timers.tick(TRANSLATE_DEBOUNCE_MS);
    await settle();
    // Each failure re-queues and the flush chain continues until the tries run out.
    for (let i = 0; i < 4; i += 1) {
      pipe.retryPending();
      await settle();
    }
    assert.equal(n, 3, "three tries, no more");
    assert.equal(store.state.captions[0]?.error, UNTRANSLATED);
    assert.equal(pipe.queued, 0);
  });

  it("keeps at most two translations in flight and chases the newest line", async () => {
    const store = fakeStore();
    const open: { line: { id: string; en: string }; resolve: () => void }[] = [];
    const translate: Translate = ({ data }) =>
      new Promise((resolve) => {
        const line = data.lines[0]!;
        open.push({
          line,
          resolve: () => resolve({ ok: true, items: [{ id: line.id, zh: `译${line.id}` }], ms: 1 }),
        });
      });
    const pipe = createCaptionPipeline({ store, api: api(translate), nav: noNav, now: Date.now }, { onLine: () => {} });
    pipe.ingest("first sentence about the economy today");
    pipe.ingest("second sentence about the weather outside");
    pipe.ingest("third sentence about the homework tonight");
    mock.timers.tick(TRANSLATE_DEBOUNCE_MS);
    await settle();
    assert.equal(pipe.inflight, 1, "the debounce fires one flush; the tick fills the rest");
    pipe.retryPending();
    await settle();
    assert.equal(pipe.inflight, 2);
    assert.deepEqual(
      open.map((o) => o.line.id),
      ["DL-3", "DL-2"],
      "newest first",
    );
    open[0]!.resolve();
    await settle();
    assert.equal(store.state.captions[2]?.zh, "译DL-3");
    assert.equal(open.length, 3, "a free slot pulls the last waiting line");
    assert.equal(open[2]!.line.id, "DL-1");
  });

  it("no key at all: one answer is enough to mark the line 未译", async () => {
    const store = fakeStore();
    let n = 0;
    const translate: Translate = async () => {
      n += 1;
      return { ok: false, code: "unavailable", error: "AI 暂不可用" };
    };
    const pipe = createCaptionPipeline({ store, api: api(translate), nav: noNav, now: Date.now }, { onLine: () => {} });
    pipe.ingest("A sentence nobody can translate without a key.");
    mock.timers.tick(TRANSLATE_DEBOUNCE_MS);
    await settle();
    for (let i = 0; i < 3; i += 1) {
      pipe.retryPending();
      await settle();
    }
    assert.equal(n, 1);
    assert.equal(store.state.captions[0]?.error, UNTRANSLATED);
  });

  it("a key xAI refuses (403) is asked once, not three times", async () => {
    const store = fakeStore();
    let n = 0;
    const translate: Translate = async () => {
      n += 1;
      return { ok: false, code: "upstream", error: "xAI 错误 403", status: 403 };
    };
    const pipe = createCaptionPipeline({ store, api: api(translate), nav: noNav, now: Date.now }, { onLine: () => {} });
    pipe.ingest("A sentence the account has no credits to translate.");
    mock.timers.tick(TRANSLATE_DEBOUNCE_MS);
    await settle();
    for (let i = 0; i < 3; i += 1) {
      pipe.retryPending();
      await settle();
    }
    assert.equal(n, 1);
    assert.equal(store.state.captions[0]?.error, UNTRANSLATED);
  });

  it("太频繁 is not a try: the queue rests and asks again, and the line is never marked 未译", async () => {
    let clock = 1_000_000;
    const now = () => clock;
    const store = fakeStore();
    let refusals = 2;
    const calls: number[] = [];
    const translate: Translate = async ({ data }) => {
      calls.push(clock);
      if (refusals > 0) {
        refusals -= 1;
        return { ok: false, code: "rate_limited", error: "太频繁了，稍等一下。" };
      }
      return { ok: true, items: [{ id: data.lines[0]!.id, zh: "终于译了" }], ms: 1 };
    };
    const pipe = createCaptionPipeline({ store, api: api(translate), nav: noNav, now }, { onLine: () => {} });
    pipe.ingest("Quarterly pressure bends long-term plans.");
    clock += TRANSLATE_DEBOUNCE_MS;
    mock.timers.tick(TRANSLATE_DEBOUNCE_MS);
    await settle();
    assert.equal(calls.length, 1);
    assert.ok(pipe.holding > 0, "the queue is resting");
    assert.equal(store.state.captions[0]?.error, undefined);

    // The heartbeat keeps knocking during the rest; nothing goes out.
    for (let i = 0; i < 3; i += 1) {
      pipe.retryPending();
      await settle();
    }
    assert.equal(calls.length, 1, "no call while resting");

    // After the rest, one more refusal, one more rest, then success.
    clock += RATE_HOLD_MS;
    mock.timers.tick(RATE_HOLD_MS);
    await settle();
    assert.equal(calls.length, 2);
    clock += RATE_HOLD_MS;
    mock.timers.tick(RATE_HOLD_MS);
    await settle();
    assert.equal(calls.length, 3);
    assert.equal(store.state.captions[0]?.zh, "终于译了");
    assert.equal(pipe.holding, 0);
  });

  it("abort forgets queued lines and retry counts; a late result still lands", async () => {
    const store = fakeStore();
    let release: (() => void) | null = null;
    const translate: Translate = ({ data }) =>
      new Promise((resolve) => {
        release = () => resolve({ ok: true, items: [{ id: data.lines[0]!.id, zh: "晚到的翻译" }], ms: 1 });
      });
    const pipe = createCaptionPipeline({ store, api: api(translate), nav: noNav, now: Date.now }, { onLine: () => {} });
    pipe.ingest("a sentence the student wants translated");
    mock.timers.tick(TRANSLATE_DEBOUNCE_MS);
    await settle();
    pipe.ingest("another sentence queued behind it now");
    assert.equal(pipe.queued, 1);
    pipe.abort();
    assert.equal(pipe.queued, 0);
    assert.equal(pipe.inflight, 0);
    release!();
    await settle();
    assert.equal(store.state.captions[0]?.zh, "晚到的翻译", "a heard line keeps its translation even after pause");
  });
});
