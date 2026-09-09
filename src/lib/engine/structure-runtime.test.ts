import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { AppState } from "../state/app-state.ts";
import type { Caption, ClassSegment, ClassSession, CoachCard } from "../types.ts";
import { stampTitle } from "../utils.ts";
import { noNav, type AiApi } from "./context.ts";
import {
  CATCH_UP_MIN_LINES,
  SEGMENT_RETRY_MS,
  createStructureRuntime,
} from "./structure-runtime.ts";

const T0 = 1_000_000;

type Fake = {
  liveId: string | null;
  sessions: ClassSession[];
  captions: Caption[];
  coaches: CoachCard[];
  coach: CoachCard | null;
  jots: { id: string; en: string; zh: string; at: number }[];
  catchUp: unknown;
  renamed: string[];
  setSegments: (sid: string, segments: ClassSegment[]) => void;
  renameSession: (id: string, title: string) => void;
  setCatchUp: (v: unknown) => void;
};

function card(id: string, topic: string, at: number): CoachCard {
  return {
    id,
    topic,
    topicZh: "",
    briefZh: "",
    briefEn: `About ${topic}.`,
    move: "join",
    options: [],
    extras: [],
    source: "auto",
    prompt: "",
    latencyMs: 1,
    at,
  };
}

function fakeStore(opts: { title?: string } = {}) {
  const state: Fake = {
    liveId: "ses-1",
    sessions: [
      {
        id: "ses-1",
        title: opts.title ?? stampTitle(T0),
        classMode: "audit",
        startedAt: T0,
        endedAt: null,
        updatedAt: T0,
        notes: [],
        recap: null,
        transcript: [],
        coaches: [],
        essays: {},
        segments: [],
        sourceId: null,
        sourceTitle: null,
        starred: false,
        starredAt: null,
      },
    ],
    captions: [],
    coaches: [],
    coach: null,
    jots: [],
    catchUp: null,
    renamed: [],
    setSegments(sid, segments) {
      state.sessions = state.sessions.map((s) => (s.id === sid ? { ...s, segments } : s));
    },
    renameSession(id, title) {
      state.renamed.push(title);
      state.sessions = state.sessions.map((s) => (s.id === id ? { ...s, title } : s));
    },
    setCatchUp(v) {
      state.catchUp = v;
    },
  };
  return { state, getState: () => state as unknown as AppState };
}

function hear(store: ReturnType<typeof fakeStore>, count: number, from = T0, every = 10_000) {
  for (let i = 0; i < count; i += 1) {
    const seq = store.state.captions.length + 1;
    store.state.captions.push({ id: `DL-${seq}`, seq, at: from + i * every, en: `Line ${seq} of the class about something.`, zh: `第 ${seq} 句`, pending: false });
  }
}

type Segment = AiApi["segment"];
type CatchUp = AiApi["catchUp"];

function api(segment: Segment, catchUp?: CatchUp): AiApi {
  const never = (() => {
    throw new Error("not used in this test");
  }) as unknown;
  return {
    segment,
    catchUp: (catchUp ?? never) as AiApi["catchUp"],
    translate: never as AiApi["translate"],
    quick: never as AiApi["quick"],
    say: never as AiApi["say"],
    coach: never as AiApi["coach"],
    expand: never as AiApi["expand"],
    recap: never as AiApi["recap"],
    mintStt: never as AiApi["mintStt"],
  };
}

const settle = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

describe("structure runtime", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  it("a stretch that closes is written up once and the first heading names the class", async () => {
    let clock = T0;
    const store = fakeStore();
    hear(store, 40); // 400 s
    store.state.coaches = [
      card("c1", "Quarterly pressure", T0 + 30_000),
      card("c2", "Quarterly pressure", T0 + 90_000),
      card("c3", "Reusable boosters", T0 + 200_000),
      card("c4", "Reusable boosters", T0 + 260_000),
    ];
    const calls: { lines: number; coach: number }[] = [];
    const segment: Segment = async ({ data }) => {
      calls.push({ lines: data.lines.length, coach: data.coach.length });
      return { ok: true, heading: "Quarterly earnings pressure", headingZh: "季报压力", claims: [{ en: "Ninety days.", zh: "九十天。" }], todo: [], ms: 300 };
    };
    const rt = createStructureRuntime({ store, api: api(segment), nav: noNav, now: () => clock });
    clock = T0 + 270_000;
    rt.beat();
    await settle();
    const segments = store.state.sessions[0]!.segments;
    assert.equal(segments.length, 2);
    assert.equal(calls.length, 1, "one write-up for the one closed stretch");
    assert.equal(calls[0]!.lines, 21, "the lines inside the stretch");
    assert.equal(calls[0]!.coach, 2);
    assert.equal(segments[0]!.heading, "Quarterly earnings pressure");
    assert.equal(segments[0]!.claims.length, 1);
    assert.equal(segments[0]!.endAt, T0 + 200_000, "closing time is kept");
    assert.deepEqual(store.state.renamed, [stampTitle(T0, "Quarterly earnings pressure")]);
    // Another beat: nothing new to write.
    rt.beat();
    await settle();
    assert.equal(calls.length, 1);
    assert.equal(store.state.renamed.length, 1, "the title is set once");
  });

  it("a student's own title is never overwritten", async () => {
    let clock = T0;
    const store = fakeStore({ title: "我的经济课" });
    hear(store, 40);
    store.state.coaches = [card("c1", "A", T0 + 30_000), card("c2", "A", T0 + 90_000), card("c3", "B", T0 + 200_000), card("c4", "B", T0 + 260_000)];
    const rt = createStructureRuntime({
      store,
      api: api(async () => ({ ok: true, heading: "Topic A", headingZh: "甲", claims: [], todo: [], ms: 1 })),
      nav: noNav,
      now: () => clock,
    });
    clock = T0 + 270_000;
    rt.beat();
    await settle();
    assert.deepEqual(store.state.renamed, []);
    assert.equal(store.state.sessions[0]!.title, "我的经济课");
  });

  it("a failed write-up waits before it is asked again; abort drops a result in flight", async () => {
    let clock = T0;
    const store = fakeStore();
    hear(store, 40);
    store.state.coaches = [card("c1", "A", T0 + 30_000), card("c2", "A", T0 + 90_000), card("c3", "B", T0 + 200_000), card("c4", "B", T0 + 260_000)];
    let n = 0;
    let release: (() => void) | null = null;
    const segment: Segment = () =>
      new Promise((resolve) => {
        n += 1;
        if (n === 1) {
          resolve({ ok: false, code: "timeout", error: "慢" });
          return;
        }
        release = () => resolve({ ok: true, heading: "Late", headingZh: "晚", claims: [], todo: [], ms: 1 });
      });
    const rt = createStructureRuntime({ store, api: api(segment), nav: noNav, now: () => clock });
    clock = T0 + 270_000;
    rt.beat();
    await settle();
    assert.equal(n, 1);
    rt.beat();
    await settle();
    assert.equal(n, 1, "not asked again at once");
    clock += SEGMENT_RETRY_MS + 1;
    rt.beat();
    await settle();
    assert.equal(n, 2, "asked again after the wait");
    rt.abort();
    release!();
    await settle();
    assert.equal(store.state.sessions[0]!.segments[0]!.heading, "", "the late result did not land");
  });

  it("刚才讲了什么 needs a few lines, then writes three into the live slice; a failure leaves nothing behind", async () => {
    let clock = T0;
    const store = fakeStore();
    const rt = createStructureRuntime({
      store,
      api: api(async () => ({ ok: false, code: "empty", error: "" }), async ({ data }) => {
        assert.ok(data.lines.length >= CATCH_UP_MIN_LINES);
        return { ok: true, topic: "Quarterly pressure", topicZh: "季报压力", lines: ["一", "二", "三"], ms: 1 };
      }),
      nav: noNav,
      now: () => clock,
    });
    hear(store, 3);
    clock = T0 + 60_000;
    const early = await rt.catchUp();
    assert.equal(early.ok, false);
    assert.equal(store.state.catchUp, null);
    hear(store, 10, T0 + 40_000);
    clock = T0 + 200_000;
    const ok = await rt.catchUp();
    assert.equal(ok.ok, true);
    assert.deepEqual((store.state.catchUp as { lines: string[] }).lines, ["一", "二", "三"]);

    const failing = createStructureRuntime({
      store,
      api: api(async () => ({ ok: false, code: "empty", error: "" }), async () => ({ ok: false, code: "rate_limited", error: "太频繁了，稍等一下。" })),
      nav: noNav,
      now: () => clock,
    });
    const bad = await failing.catchUp();
    assert.equal(bad.ok, false);
    assert.equal(store.state.catchUp, null, "no pending card left behind");
  });
});
