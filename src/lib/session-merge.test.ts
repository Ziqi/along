import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeOne, mergeSessions, normalizeSessions } from "./session-merge.ts";
import type { ClassRecap, ClassSession, TopicEssay } from "./types.ts";

function recap(patch: Partial<ClassRecap> = {}): ClassRecap {
  return {
    title: "T",
    lede: "Lede.",
    ledeZh: "导语。",
    sections: [],
    topics: [],
    patterns: [],
    lines: [],
    words: [],
    collos: [],
    grammar: [],
    skills: [],
    outline: [],
    takeaways: [],
    marks: [],
    coachPack: [],
    draft: false,
    latencyMs: 0,
    at: 10,
    ...patch,
  };
}

function essay(at: number, title = "E"): TopicEssay {
  return {
    title,
    contextEn: "",
    contextZh: "",
    viewZh: "",
    viewEn: "",
    angles: [],
    facts: [],
    qZh: "",
    qEn: "",
    aZh: "",
    aEn: "",
    say: "",
    frames: [],
    terms: [],
    sources: [],
    latencyMs: 0,
    at,
  };
}

function session(id: string, patch: Partial<ClassSession> = {}): ClassSession {
  return {
    id,
    title: `Class ${id}`,
    classMode: "interactive",
    startedAt: 100,
    endedAt: 200,
    notes: [],
    recap: null,
    transcript: [],
    coaches: [],
    essays: {},
    sourceId: null,
    sourceTitle: null,
    starred: false,
    starredAt: null,
    updatedAt: 300,
    ...patch,
  };
}

test("the copy updated last leads the catalog fields", () => {
  const local = session("a", { title: "Old name", updatedAt: 300 });
  const remote = session("a", { title: "New name", starred: true, starredAt: 350, updatedAt: 400 });
  const merged = mergeOne(local, remote);
  assert.equal(merged.title, "New name");
  assert.equal(merged.starred, true);
  assert.equal(merged.updatedAt, 400);
  // Ties keep the copy already in hand.
  const tie = mergeOne(session("a", { title: "Mine" }), session("a", { title: "Theirs" }));
  assert.equal(tie.title, "Mine");
});

test("the handout edited last wins even when the older one is longer", () => {
  const longDraft = recap({
    lede: "A very long lede that a stale device still holds after the edit.",
    sections: [{ heading: "H", headingZh: "标", body: "Body.", bodyZh: "正文。" }],
    at: 10,
  });
  const shortEdit = recap({ lede: "Short, edited.", at: 20 });
  const merged = mergeOne(session("a", { recap: longDraft }), session("a", { recap: shortEdit }));
  assert.equal(merged.recap?.lede, "Short, edited.");
  // Same moment: the fuller one.
  const same = mergeOne(
    session("a", { recap: recap({ lede: "x", at: 5 }) }),
    session("a", { recap: { ...longDraft, at: 5 } }),
  );
  assert.equal(same.recap?.sections.length, 1);
});

test("the tape and the cards keep the longer copy; the hour never gets shorter", () => {
  const heard = session("a", {
    transcript: [
      { en: "One.", zh: "一。" },
      { en: "Two.", zh: "二。" },
    ],
    updatedAt: 300,
  });
  const renamedElsewhere = session("a", {
    title: "Renamed",
    transcript: [{ en: "One.", zh: "一。" }],
    updatedAt: 400,
  });
  const merged = mergeOne(heard, renamedElsewhere);
  assert.equal(merged.title, "Renamed");
  assert.equal(merged.transcript.length, 2);
});

test("notes are unioned by id, and a finished translation beats its pending twin", () => {
  const pending = { id: "j1", en: "", zh: "你好", src: "hand" as const, at: 1, pending: true };
  const done = { id: "j1", en: "Hello", zh: "你好", src: "hand" as const, at: 1, pending: false };
  const other = { id: "j2", en: "Bye", zh: "再见", src: "hand" as const, at: 2 };
  const a = session("a", { notes: [pending], updatedAt: 500 });
  const b = session("a", { notes: [done, other], updatedAt: 300 });
  const merged = mergeOne(a, b);
  assert.deepEqual(
    merged.notes.map((j) => [j.id, j.en]),
    [
      ["j1", "Hello"],
      ["j2", "Bye"],
    ],
  );
  // A note removed on this device stays removed.
  const kept = mergeOne(a, b, (id) => id === "j2");
  assert.deepEqual(
    kept.notes.map((j) => j.id),
    ["j1"],
  );
});

test("DeepSearch essays are unioned by card, each from the copy that wrote it last", () => {
  const a = session("a", { essays: { c1: essay(10, "old"), c2: essay(10, "only here") } });
  const b = session("a", { essays: { c1: essay(20, "new") }, updatedAt: 400 });
  const merged = mergeOne(a, b);
  assert.equal(merged.essays.c1.title, "new");
  assert.equal(merged.essays.c2.title, "only here");
});

test("normalizeSessions merges duplicate ids and keeps the newest forty", () => {
  const rows: unknown[] = [];
  for (let i = 0; i < 45; i += 1) rows.push(session(`s${i}`, { startedAt: i, updatedAt: i }));
  rows.push(session("s44", { title: "Later copy", startedAt: 44, updatedAt: 999 }));
  const out = normalizeSessions(rows);
  assert.equal(out.length, 40);
  assert.equal(out[0].id, "s44");
  assert.equal(out[0].title, "Later copy");
  // The five oldest fall off, whatever order the rows arrived in.
  assert.equal(out.some((s) => s.id === "s4"), false);
  assert.equal(out.some((s) => s.id === "s5"), true);
});

test("mergeSessions unions two catalogs by id", () => {
  const merged = mergeSessions([session("a"), session("b")], [session("b", { title: "B2", updatedAt: 999 }), session("c")]);
  assert.deepEqual(
    merged.map((s) => s.id).sort(),
    ["a", "b", "c"],
  );
  assert.equal(merged.find((s) => s.id === "b")?.title, "B2");
});
