import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recapStageView } from "./recap-stage.ts";

describe("recap stage copy", () => {
  it("is two honest steps, not a ticking percent", () => {
    const essay = recapStageView("essay");
    assert.equal(essay.step, 1);
    assert.equal(essay.of, 2);
    assert.match(essay.label, /导语和章节/);
    const study = recapStageView("study");
    assert.equal(study.step, 2);
    assert.match(study.label, /语言点/);
    assert.equal(recapStageView("essay-retry").step, 1);
  });
});
