import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { AppState } from "../state/app-state.ts";
import type { Caption, CoachCard, TopicEssay } from "../types.ts";
import { noNav, type AiApi } from "./context.ts";
import { ESSAY_CAP, createDeepRuntime, humanDeepError } from "./deep-runtime.ts";

type Fake = {
  coaches: CoachCard[];
  coach: CoachCard | null;
  captions: Caption[];
  essays: Record<string, TopicEssay>;
  essayErrors: Record<string, string>;
  essayPending: boolean;
  essayTarget: string | null;
  flashes: string[];
  liveId: string | null;
  sessions: { id: string; classMode: string; endedAt: null }[];
  classMode: string;
  setEssay: (essay: TopicEssay | null, coachId?: string, keepPending?: boolean) => void;
  setEssayPending: (on: boolean, coachId?: string | null) => void;
  setEssayError: (msg: string | null, coachId?: string) => void;
  ping: (msg: string) => void;
};

function card(id: string, topic: string): CoachCard {
  return {
    id,
    topic,
    topicZh: "",
    briefZh: "",
    briefEn: "",
    move: "join",
    mode: "interactive",
    options: [{ label: "同意", en: `Yes to ${topic}.`, zh: "", keys: [] }],
    extras: [],
    source: "auto",
    prompt: "",
    latencyMs: 1,
    at: 1,
  };
}

function fakeStore() {
  const state: Fake = {
    coaches: [card("A", "Quarterly pressure"), card("B", "Reusable boosters"), card("C", "Retail investors")],
    coach: null,
    captions: [{ id: "DL-1", seq: 1, at: 1, en: "The last line heard in class.", zh: "", pending: false }],
    essays: {},
    essayErrors: {},
    essayPending: false,
    essayTarget: null,
    flashes: [],
    liveId: "ses-1",
    sessions: [{ id: "ses-1", classMode: "interactive", endedAt: null }],
    classMode: "interactive",
    setEssay(essay, coachId, keepPending) {
      const id = coachId ?? state.coach?.id;
      if (!id) return;
      if (essay) state.essays[id] = essay;
      else delete state.essays[id];
      delete state.essayErrors[id];
      if (keepPending) {
        state.essayPending = true;
        state.essayTarget = id;
      }
    },
    setEssayPending(on, coachId) {
      state.essayPending = on;
      if (on) state.essayTarget = coachId ?? null;
    },
    setEssayError(msg, coachId) {
      if (!coachId) return;
      if (msg) state.essayErrors[coachId] = msg;
      else delete state.essayErrors[coachId];
    },
    ping(msg) {
      state.flashes.push(msg);
    },
  };
  state.coach = state.coaches[0]!;
  return { state, getState: () => state as unknown as AppState };
}

type Expand = AiApi["expand"];

function api(expand: Expand): AiApi {
  const never = (() => {
    throw new Error("not used in this test");
  }) as unknown;
  return {
    expand,
    translate: never as AiApi["translate"],
    quick: never as AiApi["quick"],
    say: never as AiApi["say"],
    coach: never as AiApi["coach"],
    recap: never as AiApi["recap"],
    segment: never as AiApi["segment"],
    catchUp: never as AiApi["catchUp"],
    mintStt: never as AiApi["mintStt"],
  };
}

const settle = async () => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
};

type Ok = Extract<Awaited<ReturnType<Expand>>, { ok: true }>;
const answer = (title: string): Ok =>
  ({
    ok: true,
    title,
    contextEn: "",
    contextZh: "",
    viewEn: "A forty-second view built from three facts, long enough to count as written.",
    viewZh: "四十秒的看法。",
    facts: [{ en: "Fact one.", zh: "事实一。" }],
    angles: [],
    qEn: "",
    qZh: "",
    aEn: "Something to say for seventy words or so, built only from the facts found.",
    aZh: "可以说的话。",
    say: "",
    frames: [],
    terms: [],
    sources: [],
    draft: false,
    ms: 5,
  }) as unknown as Ok;

/** A controllable expand: each call is settled by the test, by card topic. */
function controlled() {
  const open = new Map<string, { resolve: (v: Awaited<ReturnType<Expand>>) => void; reject: (e: unknown) => void }>();
  const expand: Expand = ({ data }) =>
    new Promise((resolve, reject) => {
      open.set(data.topic, { resolve, reject });
    });
  return { expand, open };
}

describe("deep runtime", () => {
  // Deadline timers must not keep the process alive after a test ends.
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  it("two cards at once: each card's answer and failure stay its own", async () => {
    const store = fakeStore();
    const { expand, open } = controlled();
    const deep = createDeepRuntime({ store, api: api(expand), nav: noNav, now: () => 1000 });
    void deep.request("A");
    void deep.request("B");
    await settle();
    assert.equal(deep.running, 2);
    assert.equal(store.state.essays.A?.draft, true, "A shows 检索中");
    assert.equal(store.state.essays.B?.draft, true, "B shows 检索中");
    // A fails while B is still running.
    open.get("Quarterly pressure")!.resolve({ ok: false, code: "timeout", error: "模型没在时限内答完。" });
    await settle();
    assert.equal(store.state.essays.A, undefined, "A's placeholder is gone");
    assert.match(store.state.essayErrors.A ?? "", /超时.*再点一次/, "A shows its own failure, in plain words");
    assert.equal(store.state.essays.B?.draft, true, "B is still asking");
    // B succeeds: A's failure must survive it.
    open.get("Reusable boosters")!.resolve(answer("Boosters"));
    await settle();
    assert.equal(store.state.essays.B?.title, "Boosters");
    assert.equal(store.state.essays.B?.draft, false);
    assert.match(store.state.essayErrors.A ?? "", /再点一次/, "B's answer did not wipe A's failure");
    assert.equal(store.state.essayErrors.B, undefined);
    assert.equal(deep.running, 0);
  });

  it("a third click waits its turn but shows 检索中 at once, then runs when a slot frees", async () => {
    const store = fakeStore();
    const { expand, open } = controlled();
    const deep = createDeepRuntime({ store, api: api(expand), nav: noNav, now: () => 1000 });
    void deep.request("A");
    void deep.request("B");
    void deep.request("C");
    await settle();
    assert.equal(deep.running, ESSAY_CAP);
    assert.equal(store.state.essays.C?.draft, true, "queued, but the card already says 检索中");
    assert.equal(open.has("Retail investors"), false, "not sent yet");
    open.get("Quarterly pressure")!.resolve(answer("Pressure"));
    await settle();
    assert.equal(open.has("Retail investors"), true, "the freed slot takes the waiting card");
    open.get("Retail investors")!.resolve(answer("Retail"));
    open.get("Reusable boosters")!.resolve(answer("Boosters"));
    await settle();
    assert.deepEqual(
      Object.fromEntries(Object.entries(store.state.essays).map(([k, v]) => [k, v.title])),
      { A: "Pressure", B: "Boosters", C: "Retail" },
    );
  });

  it("a thrown call clears the placeholder and blames only that card; abort clears queued placeholders", async () => {
    const store = fakeStore();
    const { expand, open } = controlled();
    const deep = createDeepRuntime({ store, api: api(expand), nav: noNav, now: () => 1000 });
    void deep.request("A");
    void deep.request("B");
    void deep.request("C");
    await settle();
    open.get("Quarterly pressure")!.reject(new Error("network"));
    await settle();
    assert.equal(store.state.essays.A, undefined);
    assert.match(store.state.essayErrors.A ?? "", /超时/);
    assert.equal(store.state.essays.B?.draft, true);
    assert.equal(open.has("Retail investors"), true, "C took the freed slot");
    // Pause: everything running is stale; nothing may keep saying 检索中.
    deep.abort();
    assert.equal(deep.running, 0);
    assert.equal(store.state.essays.B, undefined, "a running card's placeholder is gone");
    assert.equal(store.state.essays.C, undefined, "so is the one that had just started");
    open.get("Reusable boosters")!.resolve(answer("Late"));
    open.get("Retail investors")!.resolve(answer("Later"));
    await settle();
    assert.equal(store.state.essays.B, undefined, "a stale answer does not land");
    assert.equal(store.state.essays.C, undefined);
  });

  it("failure wording is by code", () => {
    assert.match(humanDeepError({ code: "timeout", error: "模型没在时限内答完。" }), /检索超时/);
    assert.match(humanDeepError({ code: "no_facts", error: "" }), /没检索到/);
    assert.match(humanDeepError({ code: "rate_limited", error: "" }), /太勤/);
    assert.equal(humanDeepError({ code: "upstream", error: "xAI 错误 502" }), "xAI 错误 502");
  });
});
