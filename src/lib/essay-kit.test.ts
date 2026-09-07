import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assembleEssay, heuristicEssay, searchFacts } from "./essay-kit.ts";

const draft = heuristicEssay({
  topic: "Quarterly pressure",
  lastHeard: "Who can wait for the payoff?",
  recent: [],
  options: ["I can live with a miss."],
});

describe("DeepSearch assemble", () => {
  it("does not mark invented prose as done when there are no facts", () => {
    const fake = assembleEssay(
      draft,
      {
        viewEn: "A long invented view about markets that never cites a year or a landing.",
        aEn: "I would tell the class a long invented answer about patience and rockets without a single retrieved fact in the packet.",
        facts: [],
      },
      12,
    );
    assert.equal(fake.draft, true);
    assert.equal(searchFacts({ facts: [] }).length, 0);
  });

  it("is filled only when search returned a fact", () => {
    const empty = searchFacts(null);
    assert.equal(empty.length, 0);
    const rows = searchFacts({
      facts: [
        { en: "Falcon 9 first landed in 2015.", zh: "2015 年 Falcon 9 首次着陆。" },
        { zh: "只有中文不算" },
        { en: "" },
      ],
    });
    assert.equal(rows.length, 1);
    const ready = assembleEssay(
      draft,
      {
        title: "Reusable rockets",
        facts: [{ en: "Falcon 9 first landed in 2015.", zh: "2015 年 Falcon 9 首次着陆。" }],
        viewEn: "The hour's example is reuse, not a prettier slide.",
        aEn: "The first Falcon 9 landing in 2015 is the fact I can say.",
      },
      80,
    );
    assert.equal(ready.draft, false);
    assert.equal(ready.facts[0]?.en.includes("2015"), true);
  });
});
