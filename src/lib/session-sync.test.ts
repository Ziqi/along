import assert from "node:assert/strict";
import { test } from "node:test";
import { planCloudPush, type SyncLedger } from "./session-sync.ts";
import type { ClassSession } from "./types.ts";

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
    sourceId: null,
    sourceTitle: null,
    starred: false,
    starredAt: null,
    updatedAt: 2,
    ...patch,
  };
}

test("only sessions whose serialized form changed are pushed", () => {
  const a = session("a");
  const b = session("b");
  const ledger: SyncLedger = { pushed: new Map([["a", JSON.stringify(a)]]), dropped: new Set() };
  const plan = planCloudPush([a, b], [], ledger);
  assert.deepEqual(plan.dirty.map((d) => d.session.id), ["b"]);
  const edited = { ...a, title: "renamed" };
  const again = planCloudPush([edited, b], [], ledger);
  assert.deepEqual(again.dirty.map((d) => d.session.id), ["a", "b"]);
});

test("tombstones already acknowledged by the server are not resent", () => {
  const ledger: SyncLedger = { pushed: new Map(), dropped: new Set(["old"]) };
  const plan = planCloudPush([], ["old", "fresh"], ledger);
  assert.deepEqual(plan.drop, ["fresh"]);
});

test("an unchanged catalog yields an empty plan", () => {
  const a = session("a");
  const ledger: SyncLedger = { pushed: new Map([["a", JSON.stringify(a)]]), dropped: new Set(["x"]) };
  const plan = planCloudPush([a], ["x"], ledger);
  assert.equal(plan.dirty.length, 0);
  assert.equal(plan.drop.length, 0);
});
