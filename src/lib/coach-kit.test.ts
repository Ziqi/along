import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coachEmptyCopy,
  coachHeaderLabel,
  coachUiPhase,
  humanCoachError,
  isHeardQuestion,
  resolveCoachSame,
  shouldAskCoach,
  shouldKeepCoachCard,
  shouldRescueCoach,
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

  it("rescues only when captions are still flowing and the last card is stale", () => {
    const base = {
      autoCoach: true,
      listening: true,
      inflight: false,
      lastCaptionAt: 20_000,
    };
    assert.equal(
      shouldRescueCoach({ ...base, lastCoachOkAt: 0, now: 36_000 }),
      true,
    );
    assert.equal(
      shouldRescueCoach({ ...base, lastCoachOkAt: 30_000, now: 36_000 }),
      false,
    );
    assert.equal(
      shouldRescueCoach({ ...base, lastCoachOkAt: 10_000, now: 42_000 }),
      false,
    );
    assert.equal(
      shouldRescueCoach({
        ...base,
        inflight: true,
        lastCoachOkAt: 0,
        now: 36_000,
      }),
      false,
    );
  });
});

describe("coach pane copy", () => {
  it("does not call a failed write 正在重写 unless it is actually writing", () => {
    assert.equal(
      coachHeaderLabel(
        coachUiPhase({
          autoCoach: true,
          pending: false,
          error: "这轮慢了，点重写再试。",
          hasCard: false,
          hasCaptions: true,
        }),
      ),
      "没写出来",
    );
    assert.equal(
      coachHeaderLabel(
        coachUiPhase({
          autoCoach: true,
          pending: true,
          error: "这轮慢了，正在重写",
          hasCard: false,
          hasCaptions: true,
        }),
      ),
      "正在重写",
    );
    assert.equal(
      coachHeaderLabel(
        coachUiPhase({
          autoCoach: true,
          pending: true,
          error: null,
          hasCard: false,
          hasCaptions: true,
        }),
      ),
      "在写",
    );
  });

  it("keeps audit empty copy honest while writing or idle", () => {
    assert.match(coachEmptyCopy("writing", "audit"), /若要开口/);
    assert.match(coachEmptyCopy("retrying", "audit"), /正在重写/);
    assert.match(coachEmptyCopy("idle", "audit"), /旁听/);
    assert.equal(coachEmptyCopy("idle", "audit").includes("正在写"), false);
  });

  it("turns raw timeouts into something a student can act on", () => {
    assert.equal(humanCoachError("deadline", "retrying"), "这轮慢了，正在重写");
    assert.equal(humanCoachError("timeout", "failed"), "这轮慢了，点重写再试。");
    assert.match(humanCoachError("AI 暂不可用"), /没接到模型/);
    assert.equal(humanCoachError("AI 暂不可用").includes("连不上"), false);
  });
});
