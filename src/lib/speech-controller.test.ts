import assert from "node:assert/strict";
import { test } from "node:test";
import { unsaidTail } from "./speech-controller.ts";

test("nothing committed yet: the whole result goes out", () => {
  assert.equal(unsaidTail("", "  Taylor Swift is huge  "), "Taylor Swift is huge");
});

test("a cumulative interim after a soft final contributes only its tail", () => {
  const committed = "M Taylor Swift";
  assert.equal(unsaidTail(committed, "M Taylor Swift is the biggest artist"), "is the biggest artist");
  assert.equal(unsaidTail(committed, "M Taylor Swift"), "", "same words again say nothing new");
  assert.equal(unsaidTail(committed, "M Taylor"), "", "a shorter revision retracts nothing and adds nothing");
});

test("the utterance's final repeats the shown words once more: only the new ones print", () => {
  assert.equal(
    unsaidTail("M Taylor Swift is the biggest", "Taylor Swift is the biggest artist in the world."),
    "artist in the world.",
  );
});

test("revised words inside the shown part stay as shown; the tail still goes out", () => {
  assert.equal(unsaidTail("we should raise prices next", "We should raise the prices next quarter"), "quarter");
});

test("a result that shares almost nothing with the shown words is a new utterance", () => {
  assert.equal(unsaidTail("M Taylor Swift is huge", "The market does not care"), "The market does not care");
});

test("punctuation and case do not count as differences", () => {
  assert.equal(unsaidTail("hello, class", "Hello class. Today we start"), "Today we start");
});
