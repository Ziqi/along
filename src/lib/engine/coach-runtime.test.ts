import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { AppState } from "../state/app-state.ts";
import type { Caption, CoachCard } from "../types.ts";
import { coachMinGapMs } from "../class-mode.ts";
import { COACH_DEBOUNCE_MS, createCoachRuntime } from "./coach-runtime.ts";
import { noNav, type AiApi } from "./context.ts";

type Fake = {
  captions: Caption[];
  intent: string;
  autoCoach: boolean;
  listening: boolean;
  mic: string;
  coach: CoachCard | null;
  coaches: CoachCard[];
  coachPending: boolean;
  coachError: string | null;
  jots: never[];
  liveId: string | null;
  sessions: { id: string; classMode: string; endedAt: null }[];
  classMode: string;
  setCoachPending: (on: boolean) => void;
  setCoachError: (msg: string | null) => void;
  setCoach: (card: CoachCard | null) => void;
  setIntent: (t: string) => void;
  setAutoCoach: (on: boolean) => void;
  ensureSession: () => string;
};

function fakeStore(lines: string[]) {
  let t = 1_000;
  const state: Fake = {
    captions: lines.map((en, i) => ({ id: `DL-${i + 1}`, seq: i + 1, at: (t += 1000), en, zh: "", pending: false })),
    intent: "",
    autoCoach: true,
    listening: true,
    mic: "live",
    coach: null,
    coaches: [],
    coachPending: false,
    coachError: null,
    jots: [],
    liveId: "ses-1",
    sessions: [{ id: "ses-1", classMode: "interactive", endedAt: null }],
    classMode: "interactive",
    setCoachPending: (on) => {
      state.coachPending = on;
    },
    setCoachError: (msg) => {
      state.coachError = msg;
      state.coachPending = false;
    },
    setCoach: (card) => {
      if (!card) return;
      state.coach = card;
      state.coaches = [...state.coaches, card];
      state.coachError = null;
      state.coachPending = false;
    },
    setIntent: (v) => {
      state.intent = v;
    },
    setAutoCoach: (on) => {
      state.autoCoach = on;
    },
    ensureSession: () => "ses-1",
  };
  return { state, getState: () => state as unknown as AppState };
}

type Coach = AiApi["coach"];

function api(coach: Coach): AiApi {
  const never = (() => {
    throw new Error("not used in this test");
  }) as unknown;
  return {
    coach,
    translate: never as AiApi["translate"],
    quick: never as AiApi["quick"],
    say: never as AiApi["say"],
    expand: never as AiApi["expand"],
    recap: never as AiApi["recap"],
    segment: never as AiApi["segment"],
    catchUp: never as AiApi["catchUp"],
    mintStt: never as AiApi["mintStt"],
  };
}

const card = (topic: string) => ({
  ok: true as const,
  same: false,
  topic,
  topicZh: `${topic}·中`,
  briefZh: "概括",
  briefEn: "brief",
  move: "join" as const,
  options: [
    { label: "同意", en: `I agree about ${topic}.`, zh: "同意", keys: [] },
    { label: "对比", en: `But compare ${topic} with last year.`, zh: "对比", keys: [] },
    { label: "例子", en: `For example, ${topic} in Shenzhen.`, zh: "例子", keys: [] },
  ],
  extras: [],
  ms: 5,
});

const settle = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

const LINE = "Interest rates went up again this month and people are worried.";

describe("coach runtime", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout", "Date"] }));
  afterEach(() => mock.timers.reset());

  it("writes one card after the beat settles", async () => {
    const store = fakeStore([LINE]);
    const calls: string[] = [];
    const rt = createCoachRuntime({
      store,
      api: api(async ({ data }) => {
        calls.push(data.last);
        return card("rates");
      }),
      nav: noNav,
      now: Date.now,
    });
    rt.bump();
    assert.equal(calls.length, 0);
    mock.timers.tick(COACH_DEBOUNCE_MS);
    await settle();
    assert.deepEqual(calls, [LINE]);
    assert.equal(store.state.coach?.topic, "rates");
    assert.equal(store.state.coachPending, false);
  });

  it("an auto request during a write is remembered once and runs afterwards", async () => {
    const store = fakeStore([LINE]);
    const pending: ((v: ReturnType<typeof card>) => void)[] = [];
    const rt = createCoachRuntime({
      store,
      api: api(() => new Promise((resolve) => pending.push(resolve))),
      nav: noNav,
      now: Date.now,
    });
    rt.bump();
    mock.timers.tick(COACH_DEBOUNCE_MS);
    await settle();
    assert.equal(pending.length, 1);
    assert.equal(rt.inflight, true);
    // Two more beats land while the first card is still being written.
    store.state.captions.push({ id: "DL-2", seq: 2, at: Date.now(), en: "And the bank said nothing about it at all.", zh: "", pending: false });
    rt.bump();
    mock.timers.tick(COACH_DEBOUNCE_MS);
    await settle();
    rt.bump();
    mock.timers.tick(COACH_DEBOUNCE_MS);
    await settle();
    assert.equal(pending.length, 1, "no second call while one is in flight");
    pending[0]!(card("rates"));
    await settle();
    assert.equal(pending.length, 1, "the queued write waits for the class-mode gap");
    mock.timers.tick(coachMinGapMs("interactive"));
    await settle();
    assert.equal(pending.length, 2, "exactly one queued write follows");
    pending[1]!(card("the bank"));
    await settle();
    assert.equal(store.state.coaches.length, 2);
    assert.equal(rt.inflight, false);
  });

  it("abort drops a result that arrives afterwards", async () => {
    const store = fakeStore([LINE]);
    let release: ((v: ReturnType<typeof card>) => void) | null = null;
    const rt = createCoachRuntime({
      store,
      api: api(() => new Promise((resolve) => (release = resolve))),
      nav: noNav,
      now: Date.now,
    });
    rt.request("我想问利率");
    await settle();
    assert.equal(store.state.coachPending, true);
    rt.abort();
    assert.equal(store.state.coachPending, false);
    release!(card("late"));
    await settle();
    assert.equal(store.state.coach, null, "a card written for the old class never shows");
    assert.equal(store.state.coaches.length, 0);
  });

  it("停写 cancels the pending beat and 跟听 writes at once when there is no card", async () => {
    const store = fakeStore([LINE]);
    let calls = 0;
    const rt = createCoachRuntime({
      store,
      api: api(async () => {
        calls += 1;
        return card("rates");
      }),
      nav: noNav,
      now: Date.now,
    });
    rt.bump();
    rt.setLive(false);
    mock.timers.tick(COACH_DEBOUNCE_MS * 2);
    await settle();
    assert.equal(calls, 0, "nothing written while 停写");
    assert.equal(store.state.autoCoach, false);
    rt.setLive(true);
    await settle();
    assert.equal(calls, 1, "跟听 with no card writes immediately");
  });

  it("a failed write retries once, then reports", async () => {
    const store = fakeStore([LINE]);
    let calls = 0;
    const rt = createCoachRuntime({
      store,
      api: api(async () => {
        calls += 1;
        return { ok: false as const, code: "timeout" as const, error: "这轮慢了" };
      }),
      nav: noNav,
      now: Date.now,
    });
    rt.request();
    await settle();
    await settle();
    assert.equal(calls, 2);
    assert.match(store.state.coachError ?? "", /点重写再试/);
    assert.equal(store.state.coachPending, false);
  });
});
