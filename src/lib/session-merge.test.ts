import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeOne, mergeSegments, mergeSessions, mergeTape, normalizeSessions, unionById } from "./session-merge.ts";
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
    segments: [],
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

test("a finished handout is never covered by a later draft or rename", () => {
  const polished = recap({
    lede: "The phone finished this handout offline, with a real lede.",
    sections: [{ heading: "H", headingZh: "标", body: "Body.", bodyZh: "正文。" }],
    draft: false,
    at: 10,
  });
  const renamedDraft = recap({ title: "Renamed on the laptop", lede: "", draft: true, at: 20 });
  const a = mergeOne(
    session("a", { recap: polished, updatedAt: 10 }),
    session("a", { recap: renamedDraft, updatedAt: 999 }),
  );
  assert.equal(a.recap?.draft, false);
  assert.equal(a.recap?.lede, polished.lede);
  // Two finished handouts: the one edited last still wins.
  const later = { ...polished, lede: "Edited later.", at: 30 };
  const b = mergeOne(session("a", { recap: polished }), session("a", { recap: later }));
  assert.equal(b.recap?.lede, "Edited later.");
  // Two drafts: the later one wins as before.
  const c = mergeOne(
    session("a", { recap: recap({ lede: "", draft: true, at: 1, title: "old" }) }),
    session("a", { recap: recap({ lede: "", draft: true, at: 2, title: "new" }) }),
  );
  assert.equal(c.recap?.title, "new");
});

test("mergeTape: the screen's tail is appended to the stored tape, never written over it", () => {
  const line = (i: number, zh = "") => ({ en: `Line number ${i} of the lecture.`, zh });
  const stored = Array.from({ length: 200 }, (_, i) => line(i, `第 ${i} 句`));
  // The HUD keeps only the newest 180: lines 25..204 after 205 heard.
  const screen = Array.from({ length: 180 }, (_, i) => line(25 + i));
  const merged = mergeTape(stored, screen);
  assert.equal(merged.length, 205);
  assert.equal(merged[0]!.en, line(0).en, "the opening survives");
  assert.equal(merged[204]!.en, line(204).en);
  assert.equal(merged[100]!.zh, "第 100 句", "stored translations stay");
  // After a reload with nothing seeded: three new lines only.
  const fresh = [line(200), line(201), line(202)];
  assert.equal(mergeTape(stored, fresh).length, 203);
  // The screen still starts where the tape starts and is longer: it is the fuller copy.
  const full = [...stored, line(200)];
  assert.equal(mergeTape(stored, full), full);
  // A translation that landed on screen fills a stored gap.
  const gap = [...stored.slice(0, 199), line(199, "")];
  const filled = mergeTape(gap, [line(199, "第 199 句"), line(200)]);
  assert.equal(filled[199]!.zh, "第 199 句");
  assert.equal(filled.length, 201);
  assert.deepEqual(mergeTape([], fresh), fresh);
  assert.deepEqual(mergeTape(stored, []), stored);
});

test("segments: old rows read as none; per id the written-up or closed copy wins; order is by time", () => {
  const old = normalizeSessions([{ id: "a", title: "T", startedAt: 1, updatedAt: 1 }]);
  assert.deepEqual(old[0]!.segments, []);
  const open = { id: "g1", startAt: 100, endAt: null, heading: "", headingZh: "", claims: [], todo: [], cardIds: ["c1"], seqFrom: 1, seqTo: 8 };
  const closed = { ...open, endAt: 900, heading: "Quarterly pressure", headingZh: "季报压力", claims: [{ en: "Ninety days.", zh: "九十天。" }], seqTo: 12 };
  const later = { id: "g2", startAt: 1000, endAt: null, heading: "", headingZh: "", claims: [], todo: [], cardIds: ["c2"], seqFrom: 13, seqTo: 15 };
  const merged = mergeOne(
    session("a", { segments: [later, open], updatedAt: 5 }),
    session("a", { segments: [closed], updatedAt: 1 }),
  );
  assert.deepEqual(merged.segments.map((g) => g.id), ["g1", "g2"]);
  assert.equal(merged.segments[0]!.heading, "Quarterly pressure", "the written-up copy wins over the open one");
  // Two open copies of one id: the one that reached further wins.
  const further = { ...open, seqTo: 20 };
  assert.equal(mergeSegments([open], [further])[0]!.seqTo, 20);
  assert.equal(mergeSegments([further], [open])[0]!.seqTo, 20);
  // A malformed row is dropped, a sparse one is filled in.
  const norm = normalizeSessions([{ id: "b", title: "T", startedAt: 1, updatedAt: 1, segments: [{ id: "x", startAt: 5 }, { nope: true }] }]);
  assert.equal(norm[0]!.segments.length, 1);
  assert.deepEqual(norm[0]!.segments[0]!.claims, []);
  assert.equal(norm[0]!.segments[0]!.endAt, null);
});

test("unionById keeps stored cards and appends new ones once", () => {
  const a = { id: "c1", n: 1 };
  const b = { id: "c2", n: 2 };
  const c = { id: "c3", n: 3 };
  assert.deepEqual(unionById([a, b], [b, c]), [a, b, c]);
  assert.deepEqual(unionById([], [c, c]), [c]);
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
