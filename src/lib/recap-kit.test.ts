import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assembleRecap,
  emptyRecap,
  isFilled,
  mergeAiJson,
  pickRicherJson,
  scoreContentJson,
} from "./recap-kit.ts";
import { extractJsonObject } from "./json-object.ts";
import {
  SPACEX_TITLE,
  cleanRecapTitle,
  fillKnownHandout,
  looksLikeSpacexPacket,
  looksLikeSpacexSession,
  spacexContentJson,
  spacexRecap,
  spacexSession,
  spacexTranscript,
} from "./recap-spacex.ts";

describe("SpaceX 讲义 P0", () => {
  it("gold recap is a filled bilingual handout", () => {
    const recap = spacexRecap();
    assert.equal(recap.title, SPACEX_TITLE);
    assert.equal(recap.draft, false);
    assert.ok(isFilled(recap));
    assert.ok(recap.lede.length > 40);
    assert.match(recap.lede, /quarterly earnings/i);
    assert.match(recap.lede, /time horizon/i);
    assert.match(recap.ledeZh, /季报/);
    assert.match(recap.ledeZh, /年/);
    assert.ok(recap.sections.length >= 4);
    for (const s of recap.sections) {
      assert.ok(s.body.replace(/\s+/g, " ").trim().length > 80, s.heading);
      assert.ok(s.bodyZh.length > 40, s.headingZh);
      assert.match(s.body, /\n\n1\. /);
    }
    const ens = recap.words.map((w) => w.en.toLowerCase());
    for (const need of ["quarterly earnings", "time horizon", "payoff", "retail investor"]) {
      assert.ok(ens.includes(need), need);
    }
    for (const w of recap.words) {
      assert.ok(w.zh, w.en);
      assert.ok(w.use, w.en);
      assert.ok(w.useZh, w.en);
      assert.ok(w.example, w.en);
      assert.ok(w.exampleZh, w.en);
    }
    for (const mark of ["quarterly earnings", "time horizon", "payoff", "retail investor"]) {
      assert.ok(recap.marks.some((m) => m.toLowerCase() === mark), mark);
    }
    assert.ok(recap.coachPack.length >= 2);
    assert.ok(recap.coachPack.some((c) => c.deep && c.deep.aEn.length > 40));
  });

  it("assembleRecap keeps gold bodies and does not promote a bare outline", () => {
    const gold = assembleRecap(emptyRecap(SPACEX_TITLE), spacexContentJson());
    assert.ok(isFilled(gold));
    assert.ok(gold.sections.every((s) => s.bodyZh.length > 20));

    const outlineOnly = assembleRecap(emptyRecap("x", ["A", "B"]), {
      title: "Only a map",
      lede: "",
      outline: [
        { heading: "Quarterly pressure", bullets: ["ninety days"] },
        { heading: "Retail flinch", bullets: ["first miss"] },
      ],
      sections: [],
    });
    assert.equal(outlineOnly.sections.length, 0);
    assert.equal(isFilled(outlineOnly), false);
    assert.equal(outlineOnly.draft, true);
  });

  it("fillKnownHandout writes the SpaceX hour and strips · 再出", () => {
    const hollow = {
      ...spacexSession(),
      id: "ses-user-spacex",
      title: "Long-Term Vision vs Quarterly Pressure · 9月7日 01:02 · 再出",
      recap: emptyRecap("整理中"),
    };
    const filled = fillKnownHandout(hollow);
    assert.equal(filled.title.includes("再出"), false);
    assert.ok(filled.recap && isFilled(filled.recap));
    assert.match(filled.recap.lede, /time horizon/i);
    assert.ok(filled.recap.words.some((w) => w.en === "retail investor"));

    const untouched = fillKnownHandout({
      ...spacexSession(),
      id: "ses-money",
      title: "Money apps · 理财课",
      transcript: [{ en: "I'd rather use an app than a spreadsheet.", zh: "我宁愿用 App。" }],
      recap: emptyRecap("Money apps"),
      coaches: [],
      essays: {},
    });
    assert.equal(untouched.recap?.lede ?? "", "");
  });

  it("detects the SpaceX packet from transcript and topics", () => {
    assert.equal(
      looksLikeSpacexPacket({
        topics: ["Long-Term Vision vs Quarterly Pressure"],
        transcript: spacexTranscript().slice(0, 4),
      }),
      true,
    );
    assert.equal(looksLikeSpacexSession(spacexSession()), true);
    assert.equal(looksLikeSpacexPacket({ topics: ["coffee"], transcript: [{ en: "hello class" }] }), false);
    assert.equal(cleanRecapTitle("Vision · 再出"), "Vision");
  });
});

describe("recap JSON merge", () => {
  it("does not let an outline-only object wipe sections", () => {
    const good = {
      lede: "A full lede that is longer than forty characters for the hour.",
      sections: [{ heading: "One", headingZh: "一", body: "x".repeat(90), bodyZh: "段" }],
    };
    const thin = { title: "Map", outline: [{ heading: "One", bullets: ["a"] }] };
    const merged = mergeAiJson(good, thin);
    assert.ok(Array.isArray(merged.sections));
    assert.equal((merged.sections as unknown[]).length, 1);
    assert.ok(scoreContentJson(good) > scoreContentJson(thin));
    assert.equal(pickRicherJson(good, thin), good);
  });
});

describe("extractJsonObject salvage", () => {
  it("keeps finished sections when the model cuts the JSON", () => {
    const cut =
      '{"title":"Horizon","lede":"Quarterly earnings fight a five-to-ten-year time horizon in this class hour.","ledeZh":"季报和五到十年的尺度。","sections":[{"heading":"Clock","headingZh":"钟","body":"A listed firm is judged every ninety days and that calendar starts to rewrite the engineering.","bodyZh":"上市公司每九十天被审一次。"},{"heading":"Payoff","headingZh":"回报","body":"The payoff arrives late then all at once when the same booster flies again.';
    const parsed = extractJsonObject(cut);
    assert.ok(parsed);
    assert.equal(parsed?.title, "Horizon");
    assert.ok(String(parsed?.lede ?? "").includes("time horizon"));
    const sections = parsed?.sections as { heading?: string; body?: string }[] | undefined;
    assert.ok(sections && sections.length >= 1);
    assert.equal(sections[0]?.heading, "Clock");
    assert.ok((sections[0]?.body ?? "").length > 40);
  });
});
