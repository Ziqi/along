import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLOUD_BACKOFF_MS,
  CLOUD_RETRY_BASE_MS,
  chunkPlan,
  emptyLedger,
  exportLedger,
  importLedger,
  planCloudPush,
  retryWaitMs,
  type SyncLedger,
} from "./session-sync.ts";
import { bodyFingerprint, recapFingerprint, splitSession } from "./session-wire.ts";
import type { ClassRecap, ClassSession } from "./types.ts";

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

function session(id: string, patch: Partial<ClassSession> = {}): ClassSession {
  return {
    id,
    title: `Class ${id}`,
    classMode: "interactive",
    startedAt: 1,
    endedAt: 2,
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
    updatedAt: 2,
    ...patch,
  };
}

/** A ledger that has acknowledged exactly these sessions as they are now. */
function acknowledged(sessions: ClassSession[]): SyncLedger {
  const ledger = emptyLedger();
  for (const s of sessions) {
    const { body, recap } = splitSession(s);
    ledger.body.set(s.id, bodyFingerprint(body));
    if (recap) ledger.recap.set(s.id, recapFingerprint(recap));
  }
  return ledger;
}

test("only rows whose serialized form changed are pushed", () => {
  const a = session("a");
  const b = session("b");
  const plan = planCloudPush([a, b], [], acknowledged([a]));
  assert.deepEqual(plan.bodies.map((d) => d.id), ["b"]);
  assert.equal(plan.recaps.length, 0);
  const edited = { ...a, title: "renamed" };
  const again = planCloudPush([edited, b], [], acknowledged([a]));
  assert.deepEqual(again.bodies.map((d) => d.id), ["a", "b"]);
});

test("editing the handout pushes the handout alone, not the hour", () => {
  const a = session("a", { transcript: [{ en: "Long tape.", zh: "长实录。" }], recap: recap() });
  const ledger = acknowledged([a]);
  const edited = { ...a, recap: recap({ lede: "Edited lede.", at: 11 }) };
  const plan = planCloudPush([edited], [], ledger);
  assert.equal(plan.bodies.length, 0);
  assert.deepEqual(plan.recaps.map((r) => r.sessionId), ["a"]);
  assert.equal(plan.recaps[0].recap.lede, "Edited lede.");
  // A note added to the hour pushes the body alone.
  const noted = { ...a, notes: [{ id: "j1", en: "hi", zh: "嗨", src: "hand" as const, at: 3 }] };
  const plan2 = planCloudPush([noted], [], ledger);
  assert.deepEqual(plan2.bodies.map((d) => d.id), ["a"]);
  assert.equal(plan2.recaps.length, 0);
  assert.equal("recap" in plan2.bodies[0], false);
});

test("a class with no handout yet pushes no handout row", () => {
  const a = session("a");
  const plan = planCloudPush([a], [], emptyLedger());
  assert.equal(plan.bodies.length, 1);
  assert.equal(plan.recaps.length, 0);
});

test("tombstones already acknowledged by the server are not resent", () => {
  const ledger = emptyLedger();
  ledger.dropped.add("old");
  const plan = planCloudPush([], ["old", "fresh"], ledger);
  assert.deepEqual(plan.drop, ["fresh"]);
});

test("an unchanged catalog yields an empty plan", () => {
  const a = session("a", { recap: recap() });
  const ledger = acknowledged([a]);
  ledger.dropped.add("x");
  const plan = planCloudPush([a], ["x"], ledger);
  assert.equal(plan.bodies.length, 0);
  assert.equal(plan.recaps.length, 0);
  assert.equal(plan.drop.length, 0);
});

test("the plan carries the fingerprints to record once the server says ok", () => {
  const a = session("a", { recap: recap() });
  const plan = planCloudPush([a], [], emptyLedger());
  const ledger = emptyLedger();
  for (const [id, fp] of plan.marks.body) ledger.body.set(id, fp);
  for (const [id, fp] of plan.marks.recap) ledger.recap.set(id, fp);
  const again = planCloudPush([a], [], ledger);
  assert.equal(again.bodies.length + again.recaps.length, 0);
});

test("the ledger survives a round trip through JSON", () => {
  const a = session("a", { recap: recap() });
  const ledger = acknowledged([a]);
  ledger.dropped.add("gone");
  const back = importLedger(JSON.parse(JSON.stringify(exportLedger(ledger))));
  const plan = planCloudPush([a], ["gone"], back);
  assert.equal(plan.bodies.length + plan.recaps.length + plan.drop.length, 0);
  assert.equal(importLedger(null).body.size, 0);
});

test("a plan too large for one request is split into self-contained chunks", () => {
  const big = (id: string) =>
    session(id, {
      transcript: Array.from({ length: 40 }, (_, i) => ({ en: `line ${i} `.repeat(20), zh: "中文".repeat(40) })),
      recap: recap({ at: 5 }),
    });
  const sessions = ["a", "b", "c", "d"].map(big);
  const plan = planCloudPush(sessions, ["gone"], emptyLedger());
  const one = JSON.stringify(plan.bodies[0]).length;
  const chunks = chunkPlan(plan, one * 2 + 10);
  assert.ok(chunks.length >= 2, "more than one request");
  assert.deepEqual(chunks[0]!.drop, ["gone"], "tombstones ride in the first chunk only");
  assert.ok(chunks.slice(1).every((c) => c.drop.length === 0));
  const bodies = chunks.flatMap((c) => c.bodies.map((b) => b.id));
  assert.deepEqual(bodies.sort(), ["a", "b", "c", "d"], "every body goes once");
  for (const c of chunks) {
    assert.deepEqual(
      c.marks.body.map(([id]) => id).sort(),
      c.bodies.map((b) => b.id).sort(),
      "each chunk carries the marks for exactly its own rows",
    );
    assert.deepEqual(
      c.marks.recap.map(([id]) => id).sort(),
      c.recaps.map((r) => r.sessionId).sort(),
    );
  }
  assert.equal(chunkPlan(plan, Number.MAX_SAFE_INTEGER).length, 1, "small enough: one request");
});

test("retry waits grow with consecutive failures and stop at the ceiling", () => {
  assert.equal(retryWaitMs(1), CLOUD_RETRY_BASE_MS);
  assert.equal(retryWaitMs(2), CLOUD_RETRY_BASE_MS * 2);
  assert.equal(retryWaitMs(3), CLOUD_RETRY_BASE_MS * 4);
  assert.equal(retryWaitMs(20), CLOUD_BACKOFF_MS);
});
