import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SEGMENT_MAX_MS,
  openSegmentOf,
  segmentClass,
  unwrittenSegments,
  type SegmentInput,
} from "./segmenter.ts";
import type { ClassSegment } from "./types.ts";

const T0 = 1_000_000;
const min = (m: number) => m * 60_000;

/** A caption every 10 s from the class start. */
function tape(count: number, from = T0, every = 10_000) {
  return Array.from({ length: count }, (_, i) => ({ seq: i + 1, at: from + i * every }));
}

function card(id: string, topic: string, at: number) {
  return { id, topic, at };
}

/** Run the segmenter the way the heartbeat does: repeatedly, feeding back its own output. */
function run(steps: Omit<SegmentInput, "segments" | "startedAt">[], startedAt = T0) {
  let segments: ClassSegment[] = [];
  const allClosed: ClassSegment[] = [];
  for (const step of steps) {
    const out = segmentClass({ ...step, segments, startedAt });
    segments = out.segments;
    allClosed.push(...out.closed);
  }
  return { segments, closed: allClosed };
}

test("nothing heard, nothing said: no stretch yet", () => {
  const out = segmentClass({ coaches: [], captions: [], segments: [], now: T0, startedAt: T0 });
  assert.deepEqual(out.segments, []);
  assert.deepEqual(out.closed, []);
});

test("the first stretch opens with the first line and follows the tape", () => {
  const out = segmentClass({ coaches: [], captions: tape(5), segments: [], now: T0 + min(1), startedAt: T0 });
  assert.equal(out.segments.length, 1);
  const g = out.segments[0]!;
  assert.equal(g.startAt, T0);
  assert.equal(g.endAt, null);
  assert.equal(g.seqFrom, 1);
  assert.equal(g.seqTo, 5);
  assert.equal(openSegmentOf(out.segments), g);
});

test("cards on one topic stay in one stretch; a confirmed change of topic cuts it", () => {
  const captions = tape(40); // 400 s of class
  const cards = [
    card("c1", "Quarterly pressure", T0 + 30_000),
    card("c2", "Quarterly pressure", T0 + 90_000),
    card("c3", "Reusable boosters", T0 + 200_000),
  ];
  // Only one card on the new topic so far: not yet a boundary.
  const first = segmentClass({ coaches: cards, captions, segments: [], now: T0 + 210_000, startedAt: T0 });
  assert.equal(first.segments.length, 1);
  assert.deepEqual(first.segments[0]!.cardIds, ["c1", "c2"], "the new-topic card waits for confirmation");
  assert.equal(first.closed.length, 0);
  // The next card agrees the class moved on.
  const cards2 = [...cards, card("c4", "Reusable boosters", T0 + 260_000)];
  const second = segmentClass({ coaches: cards2, captions, segments: first.segments, now: T0 + 270_000, startedAt: T0 });
  assert.equal(second.segments.length, 2);
  const [a, b] = second.segments;
  assert.equal(a!.endAt, T0 + 200_000);
  assert.equal(a!.seqTo, 21, "lines up to the boundary");
  assert.deepEqual(a!.cardIds, ["c1", "c2"]);
  assert.equal(b!.startAt, T0 + 200_000);
  assert.equal(b!.seqFrom, 22);
  assert.equal(b!.seqTo, 40, "the open stretch follows the tape");
  assert.deepEqual(b!.cardIds, ["c3", "c4"]);
  assert.deepEqual(second.closed.map((g) => g.id), [a!.id]);
  assert.deepEqual(unwrittenSegments(second.segments).map((g) => g.id), [a!.id], "closed but not written up");
});

test("a single stray card does not cut the stretch", () => {
  const captions = tape(40);
  const cards = [
    card("c1", "Quarterly pressure", T0 + 30_000),
    card("c2", "Something else", T0 + 150_000),
    card("c3", "Quarterly pressure", T0 + 200_000),
  ];
  const out = segmentClass({ coaches: cards, captions, segments: [], now: T0 + 210_000, startedAt: T0 });
  assert.equal(out.segments.length, 1);
  assert.deepEqual(out.segments[0]!.cardIds, ["c1", "c2", "c3"]);
});

test("a stretch too short to stand alone takes the new subject instead of closing", () => {
  const captions = tape(40);
  const cards = [
    card("c1", "Warm-up", T0 + 10_000),
    card("c2", "Quarterly pressure", T0 + 20_000),
    card("c3", "Quarterly pressure", T0 + 60_000),
  ];
  const out = segmentClass({ coaches: cards, captions, segments: [], now: T0 + 70_000, startedAt: T0 });
  assert.equal(out.segments.length, 1, "twenty seconds and two lines are not a stretch");
  assert.deepEqual(out.segments[0]!.cardIds, ["c1", "c2", "c3"]);
});

test("with the coach off, eight minutes on the tape cuts a stretch", () => {
  const captions = tape(60); // 10 minutes
  const steps = [
    { coaches: [], captions: captions.slice(0, 30), now: T0 + min(5) },
    { coaches: [], captions: captions.slice(0, 50), now: T0 + min(8) + 1000 },
    { coaches: [], captions, now: T0 + min(10) },
  ];
  const { segments, closed } = run(steps);
  assert.equal(closed.length, 1);
  assert.equal(closed[0]!.startAt, T0);
  assert.equal(closed[0]!.endAt, T0 + min(8) + 1000);
  assert.equal(closed[0]!.seqTo, 49, "lines heard within the eight minutes");
  assert.equal(segments.length, 2);
  assert.equal(segments[1]!.seqFrom, 50);
  assert.equal(segments[1]!.seqTo, 60);
});

test("idempotent: the same picture twice changes nothing and closes nothing again", () => {
  const captions = tape(40);
  const cards = [
    card("c1", "A topic", T0 + 30_000),
    card("c2", "A topic", T0 + 90_000),
    card("c3", "Another topic", T0 + 200_000),
    card("c4", "Another topic", T0 + 260_000),
  ];
  const once = segmentClass({ coaches: cards, captions, segments: [], now: T0 + 270_000, startedAt: T0 });
  const twice = segmentClass({ coaches: cards, captions, segments: once.segments, now: T0 + 271_000, startedAt: T0 });
  assert.deepEqual(twice.segments, once.segments);
  assert.deepEqual(twice.closed, []);
});

test("a written-up stretch keeps its heading; a heading also names the topic when its cards are gone", () => {
  const captions = tape(40);
  const done: ClassSegment = {
    id: "g-old",
    startAt: T0,
    endAt: T0 + 200_000,
    heading: "Quarterly pressure",
    headingZh: "季报压力",
    claims: [{ en: "Ninety days.", zh: "九十天。" }],
    todo: [],
    cardIds: ["gone-1"],
    seqFrom: 1,
    seqTo: 21,
  };
  const open: ClassSegment = { ...done, id: "g-open", startAt: T0 + 200_000, endAt: null, heading: "", headingZh: "", claims: [], cardIds: ["gone-2"], seqFrom: 22, seqTo: 30 };
  // The HUD only keeps the newest cards; the ones inside the open stretch are gone, but its heading is empty so
  // the next card on any topic simply joins it.
  const out = segmentClass({
    coaches: [card("c9", "Reusable boosters", T0 + 300_000)],
    captions,
    segments: [done, open],
    now: T0 + 310_000,
    startedAt: T0,
  });
  assert.equal(out.segments[0]!.heading, "Quarterly pressure");
  assert.deepEqual(out.segments[1]!.cardIds, ["gone-2", "c9"]);
  assert.equal(SEGMENT_MAX_MS, 8 * 60_000);
});
