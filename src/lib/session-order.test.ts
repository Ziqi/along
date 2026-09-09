import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ClassSession } from "./types.ts";
import { newerSession, sortSessions, toggleStar } from "./session-order.ts";

function ses(
  id: string,
  patch: Partial<ClassSession> = {},
): ClassSession {
  return {
    id,
    title: id,
    startedAt: 100,
    endedAt: 200,
    updatedAt: 100,
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
    ...patch,
  };
}

describe("置顶顺序", () => {
  it("pins sit above class time, newest pin first", () => {
    const olderPin = ses("old-pin", { starred: true, starredAt: 10, startedAt: 900, updatedAt: 10 });
    const newerPin = ses("new-pin", { starred: true, starredAt: 20, startedAt: 100, updatedAt: 20 });
    const fresh = ses("fresh", { startedAt: 800, updatedAt: 800 });
    const listed = sortSessions([fresh, olderPin, newerPin]);
    assert.deepEqual(
      listed.map((s) => s.id),
      ["new-pin", "old-pin", "fresh"],
    );
  });

  it("unpin returns the class to newest-class-first among the unpinned", () => {
    const spacex = ses("spacex", {
      starred: true,
      starredAt: 50,
      startedAt: 100,
      updatedAt: 50,
    });
    const money = ses("money", { startedAt: 200, updatedAt: 200 });
    assert.equal(sortSessions([spacex, money])[0]?.id, "spacex");
    const after = sortSessions([toggleStar(spacex, 300), money]);
    assert.equal(after[0]?.id, "money");
    assert.equal(after[1]?.id, "spacex");
    assert.equal(after[1]?.starred, false);
    assert.equal(after[1]?.starredAt, null);
    assert.equal(after[1]?.updatedAt, 300);
  });

  it("pin jumps to the top without starring anyone else", () => {
    const a = ses("a", { startedAt: 300 });
    const b = ses("b", { startedAt: 200 });
    const listed = sortSessions([toggleStar(b, 400), a]);
    assert.equal(listed[0]?.id, "b");
    assert.equal(listed[0]?.starred, true);
    assert.equal(listed[1]?.id, "a");
    assert.equal(listed[1]?.starred, false);
  });

  it("a stale pinned copy does not overwrite a newer unpin", () => {
    const unpinned = ses("spacex", {
      starred: false,
      starredAt: null,
      updatedAt: 500,
      startedAt: 100,
    });
    const fixture = ses("spacex", {
      starred: true,
      starredAt: 50,
      updatedAt: 50,
      startedAt: 100,
    });
    const kept = newerSession(unpinned, fixture);
    assert.equal(kept.starred, false);
    assert.equal(kept.updatedAt, 500);
    const tied = newerSession(unpinned, { ...fixture, updatedAt: 500, starred: true });
    assert.equal(tied.starred, false);
  });
});
