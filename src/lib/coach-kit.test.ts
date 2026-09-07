import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isHeardQuestion,
  resolveCoachSame,
  shouldAskCoach,
  shouldKeepCoachCard,
} from "./coach-kit.ts";

const opts = (en: string) => [{ en }, { en: `${en} two` }, { en: `${en} three` }];

describe("coach same / keep", () => {
  it("treats questions as a new beat even when the model says same", () => {
    assert.equal(isHeardQuestion("Who can wait for the payoff?"), true);
    assert.equal(
      resolveCoachSame({
        modelSame: true,
        move: "join",
        lastHeard: "Who can wait for the payoff?",
      }),
      false,
    );
    assert.equal(
      resolveCoachSame({
        modelSame: true,
        move: "answer",
        lastHeard: "The quarter missed again.",
      }),
      false,
    );
  });

  it("does not infer same from a matching topic name", () => {
    assert.equal(
      resolveCoachSame({
        modelSame: false,
        move: "join",
        lastHeard: "Retail investors sold on the first miss.",
      }),
      false,
    );
    assert.equal(
      resolveCoachSame({
        modelSame: true,
        move: "join",
        lastHeard: "Retail investors sold on the first miss.",
      }),
      true,
    );
  });

  it("uses a wider gap in audit so a busy room does not flood cards", () => {
    const prev = { prompt: "The quarter missed again this morning.", at: 10_000 };
    const last = "Retail investors sold on the first miss and walked.";
    assert.equal(shouldAskCoach({ last, prev, now: 14_000, minGapMs: 5500 }), false);
    assert.equal(shouldAskCoach({ last, prev, now: 16_000, minGapMs: 5500 }), true);
  });

  it("asks again on a new line; skips the same line within 12s", () => {
    const prev = { prompt: "The quarter missed again this morning.", at: 10_000 };
    assert.equal(
      shouldAskCoach({ last: "The quarter missed again this morning.", prev, now: 16_000 }),
      false,
    );
    assert.equal(
      shouldAskCoach({
        last: "Retail investors sold on the first miss and walked.",
        prev,
        now: 16_000,
      }),
      true,
    );
    assert.equal(
      shouldAskCoach({
        last: "Who can wait for the payoff?",
        prev,
        now: 16_000,
      }),
      true,
    );
  });

  it("keeps a written card when same=true but the lines are new", () => {
    const prev = {
      prompt: "The quarter missed again this morning.",
      options: opts("I can live with a miss this quarter."),
      at: 10_000,
    };
    assert.equal(
      shouldKeepCoachCard({
        source: "auto",
        lastHeard: "Retail investors sold on the first miss and walked.",
        prev,
        options: opts("I would rather fund the horizon than the quarter."),
        now: 20_000,
      }),
      true,
    );
  });

  it("drops only an exact reprint of the last 3+2", () => {
    const lines = opts("I can live with a miss this quarter.");
    const prev = {
      prompt: "The quarter missed again this morning.",
      options: lines,
      at: 10_000,
    };
    assert.equal(
      shouldKeepCoachCard({
        source: "auto",
        lastHeard: "The quarter missed again this morning.",
        prev,
        options: lines,
        now: 16_000,
      }),
      false,
    );
    assert.equal(
      shouldKeepCoachCard({
        source: "intent",
        lastHeard: "The quarter missed again this morning.",
        prev,
        options: lines,
        now: 16_000,
      }),
      true,
    );
  });
});
