import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AppState } from "../state/app-state.ts";
import type { Caption, Jot } from "../types.ts";
import { noNav, type AiApi } from "./context.ts";
import { createSayRuntime } from "./say-runtime.ts";

type Fake = {
  captions: Caption[];
  jots: Jot[];
  open: boolean;
  addJot: (draft: { en?: string; zh?: string; src: Jot["src"] }) => string | null;
  patchJot: (id: string, patch: Partial<Pick<Jot, "en" | "zh" | "pending">>) => void;
  removeJot: (id: string) => void;
};

function fakeStore(lines: string[] = []) {
  let seq = 0;
  const state: Fake = {
    captions: lines.map((en, i) => ({ id: `DL-${i}`, seq: i, at: i, en, zh: "", pending: false })),
    jots: [],
    open: true,
    addJot(draft) {
      if (!state.open) return null;
      seq += 1;
      const id = `jot-${seq}`;
      state.jots.push({ id, en: draft.en ?? "", zh: draft.zh ?? "", src: draft.src, at: seq, pending: !draft.en || !draft.zh });
      return id;
    },
    patchJot(id, patch) {
      state.jots = state.jots.map((j) => (j.id === id ? { ...j, ...patch, pending: patch.pending ?? false } : j));
    },
    removeJot(id) {
      state.jots = state.jots.filter((j) => j.id !== id);
    },
  };
  return { state, getState: () => state as unknown as AppState };
}

type Say = AiApi["say"];

function api(say: Say): AiApi {
  const never = (() => {
    throw new Error("not used in this test");
  }) as unknown;
  return {
    say,
    translate: never as AiApi["translate"],
    quick: never as AiApi["quick"],
    coach: never as AiApi["coach"],
    expand: never as AiApi["expand"],
    recap: never as AiApi["recap"],
    segment: never as AiApi["segment"],
    catchUp: never as AiApi["catchUp"],
    mintStt: never as AiApi["mintStt"],
  };
}

describe("say runtime", () => {
  it("keeps the line as a 我想说 note and hands the recent class lines to the model", async () => {
    const store = fakeStore(["Interest rates went up.", "So who pays?"]);
    let seen: unknown = null;
    let notes = 0;
    const rt = createSayRuntime(
      { store, api: api(async ({ data }) => { seen = data; return { ok: true, en: "I'd rather use an app.", zh: "我更愿意用 app。", ms: 3 }; }), nav: noNav, now: Date.now },
      { onNote: () => (notes += 1) },
    );
    const result = await rt.ask("  我更愿意  用 app ");
    assert.deepEqual(seen, { text: "我更愿意 用 app", recent: ["Interest rates went up.", "So who pays?"] });
    assert.equal(result.ok, true);
    assert.equal(store.state.jots.length, 1);
    assert.deepEqual(
      { src: store.state.jots[0]!.src, en: store.state.jots[0]!.en, zh: store.state.jots[0]!.zh, pending: store.state.jots[0]!.pending },
      { src: "say", en: "I'd rather use an app.", zh: "我更愿意用 app。", pending: false },
    );
    assert.equal(notes, 1);
  });

  it("a failed ask leaves no note behind and says why", async () => {
    const store = fakeStore();
    const rt = createSayRuntime(
      { store, api: api(async () => ({ ok: false, code: "rate_limited", error: "x" })), nav: noNav, now: Date.now },
      { onNote: () => {} },
    );
    const result = await rt.ask("我想说点什么");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /太频繁/);
    assert.equal(store.state.jots.length, 0);
  });

  it("with no class to write into, it says so instead of calling the model", async () => {
    const store = fakeStore();
    store.state.open = false;
    let called = 0;
    const rt = createSayRuntime(
      { store, api: api(async () => { called += 1; return { ok: true, en: "x", zh: "y", ms: 1 }; }), nav: noNav, now: Date.now },
      { onNote: () => {} },
    );
    const result = await rt.ask("你好");
    assert.equal(result.ok, false);
    assert.equal(called, 0);
  });

  it("one line at a time; after 结课 the answer still lands but stops redrawing the outline", async () => {
    const store = fakeStore();
    let release: (v: { ok: true; en: string; zh: string; ms: number }) => void = () => {};
    let notes = 0;
    const rt = createSayRuntime(
      { store, api: api(() => new Promise((r) => (release = r))), nav: noNav, now: Date.now },
      { onNote: () => (notes += 1) },
    );
    const first = rt.ask("第一句");
    const second = await rt.ask("第二句");
    assert.equal(second.ok, false);
    assert.equal(rt.busy, true);
    rt.abort();
    release({ ok: true, en: "First line.", zh: "第一句。", ms: 1 });
    const done = await first;
    assert.equal(done.ok, true);
    assert.equal(store.state.jots[0]!.en, "First line.");
    assert.equal(notes, 0);
    assert.equal(rt.busy, false);
  });
});
