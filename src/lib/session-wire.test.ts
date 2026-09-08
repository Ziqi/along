import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bodyFingerprint,
  fingerprint,
  joinSession,
  sessionMeta,
  slimBody,
  splitSession,
} from "./session-wire.ts";
import type { ClassRecap, ClassSession } from "./types.ts";

const recap: ClassRecap = {
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
};

const session: ClassSession = {
  id: "a",
  schemaVersion: 1,
  title: "Class",
  classMode: "audit",
  startedAt: 1000,
  endedAt: 2000,
  updatedAt: 3000,
  notes: [{ id: "j", en: "hi", zh: "嗨", src: "hand", at: 1 }],
  recap,
  transcript: [{ en: "One.", zh: "一。" }],
  coaches: [],
  essays: {},
  sourceId: null,
  sourceTitle: null,
  starred: true,
  starredAt: 2500,
};

test("a class splits into the hour and its handout, and joins back whole", () => {
  const { body, recap: r } = splitSession(session);
  assert.equal("recap" in body, false);
  assert.equal(r, recap);
  assert.deepEqual(joinSession(body, r), session);
  assert.equal(splitSession({ ...session, recap: null }).recap, null);
});

test("the catalog columns come from the body", () => {
  const meta = sessionMeta(splitSession(session).body);
  assert.deepEqual(meta, {
    title: "Class",
    classMode: "audit",
    startedAt: 1000,
    endedAt: 2000,
    starred: true,
    schemaVersion: 1,
    updatedAt: 3000,
  });
});

test("a slim body keeps the catalog row and the notes, not the tape", () => {
  const slim = slimBody(splitSession(session).body);
  assert.equal(slim.transcript.length, 0);
  assert.equal(slim.notes.length, 1);
  assert.equal(slim.title, "Class");
});

test("fingerprints are stable, short and sensitive to any change", () => {
  const { body } = splitSession(session);
  assert.equal(bodyFingerprint(body), bodyFingerprint({ ...body }));
  assert.notEqual(bodyFingerprint(body), bodyFingerprint({ ...body, title: "Other" }));
  assert.ok(fingerprint("abc").length <= 14);
  assert.notEqual(fingerprint("abc"), fingerprint("abd"));
});
