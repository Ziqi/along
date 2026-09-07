import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coachMinGapMs,
  isSpeakMode,
  isStudyCard,
  parseClassMode,
  topicBeatLabel,
} from "./class-mode.ts";

describe("class mode", () => {
  it("reads a stored mode and defaults old sessions to interactive", () => {
    assert.equal(parseClassMode("listen"), "listen");
    assert.equal(parseClassMode("audit"), "audit");
    assert.equal(parseClassMode(undefined), "interactive");
    assert.equal(isSpeakMode("listen"), false);
    assert.equal(isSpeakMode("audit"), true);
  });

  it("slows audit cards and leaves interactive on the normal gap", () => {
    assert.equal(coachMinGapMs("audit") > coachMinGapMs("interactive"), true);
    assert.equal(coachMinGapMs("listen"), coachMinGapMs("interactive"));
  });

  it("numbers two cards that share a topic", () => {
    const cards = [
      { id: "a", topic: "Wait times" },
      { id: "b", topic: "Wait times" },
      { id: "c", topic: "Insurance" },
    ];
    assert.equal(topicBeatLabel("Wait times", cards, "b"), "Wait times · 2");
    assert.equal(topicBeatLabel("Insurance", cards, "c"), "Insurance");
  });

  it("treats a 这句 card as study even without mode stamped", () => {
    assert.equal(isStudyCard({ mode: "listen", options: [] }), true);
    assert.equal(
      isStudyCard({ options: [{ label: "这句" }, { label: "剖析" }, { label: "背景" }] }),
      true,
    );
    assert.equal(isStudyCard({ options: [{ label: "同意" }] }), false);
  });
});
