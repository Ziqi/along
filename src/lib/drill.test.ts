import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOX_GAP_MS,
  deckTally,
  dueCards,
  gradeAgain,
  gradeKnown,
  orderRound,
  TOP_BOX,
  trimMemory,
  type DrillMemory,
} from "./drill.ts";

const cards = ["a", "b", "c", "d"].map((id) => ({ id }));
const NOW = 1_700_000_000_000;

describe("drill memory", () => {
  it("会了 moves a card up a box and pushes it out for that box's gap", () => {
    let mem: DrillMemory = {};
    mem = gradeKnown(mem, "a", NOW);
    assert.equal(mem.a!.box, 1);
    assert.equal(mem.a!.due, NOW + BOX_GAP_MS[1]!);
    assert.equal(mem.a!.seen, 1);
    mem = gradeKnown(mem, "a", NOW + 1);
    assert.equal(mem.a!.box, 2);
    assert.equal(mem.a!.due, NOW + 1 + BOX_GAP_MS[2]!);
    for (let i = 0; i < 10; i += 1) mem = gradeKnown(mem, "a", NOW + 2 + i);
    assert.equal(mem.a!.box, TOP_BOX, "never past the last box");
  });

  it("再来 drops a card to box 0 and makes it due now", () => {
    let mem = gradeKnown(gradeKnown({}, "a", NOW), "a", NOW);
    mem = gradeAgain(mem, "a", NOW + 5);
    assert.equal(mem.a!.box, 0);
    assert.equal(mem.a!.due, NOW + 5);
    assert.equal(mem.a!.seen, 3);
  });

  it("a known card is not due until its gap has passed", () => {
    const mem = gradeKnown({}, "a", NOW);
    assert.deepEqual(dueCards(cards, mem, NOW).map((c) => c.id), ["b", "c", "d"]);
    assert.deepEqual(dueCards(cards, mem, NOW + BOX_GAP_MS[1]!).map((c) => c.id), ["a", "b", "c", "d"]);
  });

  it("a round shows the ones that came back first, then new cards, then overdue known ones", () => {
    let mem: DrillMemory = {};
    mem = gradeAgain(mem, "c", NOW); // came back
    mem = gradeKnown(mem, "a", NOW - BOX_GAP_MS[1]! - 10); // known, now overdue
    const round = orderRound(cards, mem, NOW);
    assert.deepEqual(round.map((c) => c.id), ["c", "b", "d", "a"]);
  });

  it("tallies known / came back / never seen", () => {
    let mem: DrillMemory = {};
    mem = gradeKnown(mem, "a", NOW);
    mem = gradeAgain(mem, "b", NOW);
    const deck = cards.map((c) => ({ ...c, sessionId: "s", kind: "单词", en: c.id, zh: "", use: "", useZh: "", example: "", exampleZh: "" }));
    assert.deepEqual(deckTally(deck, mem), { known: 1, again: 1, unseen: 2, total: 4 });
  });

  it("forgets the least recently touched cards past the cap", () => {
    const mem: DrillMemory = {};
    for (let i = 0; i < 6; i += 1) mem[`k${i}`] = { box: 1, due: 0, seen: 1, last: i };
    const kept = trimMemory(mem, 4);
    assert.deepEqual(Object.keys(kept).sort(), ["k2", "k3", "k4", "k5"]);
  });
});
