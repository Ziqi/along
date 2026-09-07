import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assembleRecap,
  emptyRecap,
  essayOf,
  extractStars,
  isEssayFilled,
  isFilled,
  isStudyFilled,
  lexiconReady,
  mergeAiJson,
  packCoach,
  pickRicherJson,
  polishBody,
  scoreContentJson,
  splitProse,
} from "./recap-kit.ts";
import type { CoachCard, TopicEssay } from "./types.ts";
import { extractJsonObject } from "./json-object.ts";
import {
  SPACEX_ID,
  SPACEX_TITLE,
  cleanRecapTitle,
  fillKnownHandout,
  looksLikeSpacexPacket,
  looksLikeSpacexSession,
  looksLikeSpacexText,
  spacexContentJson,
  spacexRecap,
  spacexSession,
  spacexTranscript,
} from "./recap-spacex.ts";

const LONG_EN =
  "This class argued that a ninety-day score cannot narrate a decade of engineering work without cutting the decade itself.";
const LONG_ZH =
  "这堂课认为九十天的成绩单讲不完十年的工程，硬讲就会砍掉十年。谁等得起回报，谁会在第一次不及预期时卖掉。";

function studyRow(en: string) {
  return {
    en,
    zh: `${en} 中文`,
    use: `How ${en} showed up in this hour.`,
    useZh: "这小时里怎么用的。",
    example: `They used ${en} when the quarter missed.`,
    exampleZh: "季报不及预期时他们用了这个词。",
  };
}

function essayOnly() {
  return {
    ...emptyRecap("Clock"),
    lede: LONG_EN,
    ledeZh: LONG_ZH,
    sections: [
      { heading: "Clock", headingZh: "钟", body: LONG_EN, bodyZh: LONG_ZH, table: null },
      { heading: "Payoff", headingZh: "回报", body: LONG_EN, bodyZh: LONG_ZH, table: null },
    ],
  };
}

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
    const table = recap.sections[0]?.table;
    assert.ok(table);
    assert.match(table.leftHead, /quarterly/i);
    assert.match(table.rightHead, /year|physics/i);
    assert.ok(table.rows.length >= 3);
    assert.ok(table.rows.some((r) => /retail/i.test(r.left)));
    assert.ok(table.rows.some((r) => /SpaceX/i.test(r.right)));
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

  it("fillKnownHandout writes only the SpaceX fixture id", () => {
    const hollow = {
      ...spacexSession(),
      id: SPACEX_ID,
      title: "Long-Term Vision vs Quarterly Pressure · 9月7日 01:02 · 再出",
      recap: emptyRecap("整理中"),
    };
    const filled = fillKnownHandout(hollow);
    assert.equal(filled.title.includes("再出"), false);
    assert.ok(filled.recap && isFilled(filled.recap));
    assert.match(filled.recap.lede, /time horizon/i);
    assert.ok(filled.recap.words.some((w) => w.en === "retail investor"));

    const liveLookalike = fillKnownHandout({
      ...spacexSession(),
      id: "ses-user-spacex",
      title: "Long-Term Vision vs Quarterly Pressure",
      recap: emptyRecap("整理中"),
    });
    assert.equal(liveLookalike.recap?.lede ?? "", "");

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

  it("does not call a finance or grammar hour SpaceX", () => {
    assert.equal(
      looksLikeSpacexText("long-term vision and the payoff for a retail investor"),
      false,
    );
    assert.equal(
      looksLikeSpacexText("quarterly earnings force a ninety-day story; the time horizon is five years"),
      false,
    );
    assert.equal(
      looksLikeSpacexPacket({
        topics: ["Long-Term Vision vs Quarterly Pressure"],
        transcript: [{ en: "Who can wait for the payoff?" }],
      }),
      false,
    );
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

describe("handout gate and document close", () => {
  it("isFilled needs two bilingual sections plus four complete study rows", () => {
    const oneSection = {
      ...essayOnly(),
      sections: [{ heading: "Clock", headingZh: "钟", body: LONG_EN, bodyZh: LONG_ZH }],
      words: [studyRow("payoff"), studyRow("miss"), studyRow("horizon"), studyRow("retail")],
    };
    assert.equal(isEssayFilled(oneSection), false);
    assert.equal(isFilled(oneSection), false);

    const noZh = {
      ...essayOnly(),
      ledeZh: "",
      sections: [
        { heading: "Clock", headingZh: "", body: LONG_EN, bodyZh: "" },
        { heading: "Payoff", headingZh: "", body: LONG_EN, bodyZh: "" },
      ],
      words: [studyRow("payoff"), studyRow("miss"), studyRow("horizon"), studyRow("retail")],
    };
    assert.equal(isEssayFilled(noZh), false);
    assert.equal(isFilled(noZh), false);

    const emptyWords = essayOnly();
    assert.equal(isEssayFilled(emptyWords), true);
    assert.equal(isStudyFilled(emptyWords), false);
    assert.equal(isFilled(emptyWords), false);

    const bareWords = {
      ...essayOnly(),
      words: [
        { en: "payoff", zh: "", use: "", useZh: "", example: "", exampleZh: "" },
        { en: "miss", zh: "", use: "", useZh: "", example: "", exampleZh: "" },
        { en: "horizon", zh: "", use: "", useZh: "", example: "", exampleZh: "" },
        { en: "retail", zh: "", use: "", useZh: "", example: "", exampleZh: "" },
      ],
    };
    assert.equal(isStudyFilled(bareWords), false);
    assert.equal(isFilled(bareWords), false);

    const ready = {
      ...essayOnly(),
      words: [studyRow("payoff"), studyRow("miss"), studyRow("horizon"), studyRow("retail")],
    };
    assert.equal(isEssayFilled(ready), true);
    assert.equal(isStudyFilled(ready), true);
    assert.equal(lexiconReady(ready), true);
    assert.equal(isFilled(ready), true);

    const patternsOnly = {
      ...essayOnly(),
      patterns: [studyRow("even though"), studyRow("wait times"), studyRow("in contrast"), studyRow("for example")],
    };
    assert.equal(isStudyFilled(patternsOnly), false);
    assert.equal(lexiconReady(patternsOnly), false);
  });

  it("polishBody keeps a three-paragraph body plus numbered points", () => {
    const body = polishBody(
      [
        "First paragraph about the calendar versus the rocket.",
        "Second paragraph about who can wait for the payoff.",
        "Third paragraph about how to say a miss in class.",
        "1. Name the horizon.",
        "2. Name the miss.",
        "3. Name the payoff.",
      ].join("\n"),
    );
    assert.match(body, /First paragraph/);
    assert.match(body, /Second paragraph/);
    assert.match(body, /Third paragraph/);
    assert.match(body, /1\. Name the horizon/);
    assert.match(body, /3\. Name the payoff/);
  });

  it("splitProse keeps paragraphs and 1.2.3 as an ordered list", () => {
    const blocks = splitProse(
      "A listed firm is judged every ninety days.\n\n1. A quarter asks for a number.\n2. A rocket asks for years.\n3. Fund the horizon.",
    );
    assert.equal(blocks[0]?.type, "p");
    assert.match(blocks[0]?.items[0] ?? "", /listed firm/);
    assert.equal(blocks[1]?.type, "ol");
    assert.equal(blocks[1]?.items.length, 3);
    assert.equal(blocks[1]?.items[0], "A quarter asks for a number.");
  });

  it("Markdown and print paths never dump outline as the handout", () => {
    const src = readFileSync(new URL("./export-recap.ts", import.meta.url), "utf8");
    assert.equal(src.includes("outline"), false);
    assert.match(src, /splitProse/);
    assert.match(src, /<ol>/);
    assert.match(src, /class="card"/);
    assert.match(src, /tableMarkdown|table\.contrast/);
  });

  it("does not keep a frequency word picker", () => {
    const src = readFileSync(new URL("./recap-kit.ts", import.meta.url), "utf8");
    assert.equal(src.includes("studyFromTape"), false);
    assert.equal(src.includes("studyHints"), false);
    assert.equal(src.includes("scoreToken"), false);
    assert.equal(src.includes("function isBasic"), false);
    assert.match(src, /extractStars/);
  });

  it("does not paste the SpaceX gold into recapClass", () => {
    const src = readFileSync(new URL("./capcom-ai.ts", import.meta.url), "utf8");
    assert.equal(src.includes("spacexContentJson"), false);
    assert.equal(src.includes("looksLikeSpacexPacket"), false);
  });

  it("keeps model stars and assembles a contrast table on a grammar hour", () => {
    const recap = assembleRecap(emptyRecap("Used to"), {
      title: "Used to vs be used to",
      lede: "The hour split a past habit from a present comfort, and the class kept missing the complement.",
      ledeZh: "这堂课把过去的习惯和现在的习惯分开。班上一直补错后面的成分，有人把 used to 后面接了 -ing，也有人把 be used to 后面直接接了动词原形。",
      sections: [
        {
          heading: "Used to vs be used to",
          headingZh: "过去习惯对上现在习惯",
          body: LONG_EN,
          bodyZh: LONG_ZH,
          table: {
            leftHead: "used to",
            leftHeadZh: "过去常常",
            rightHead: "be used to",
            rightHeadZh: "习惯于",
            rows: [
              { left: "past habit", leftZh: "过去的习惯", right: "present comfort", rightZh: "现在习以为常" },
              { left: "used to + verb", leftZh: "后接动词原形", right: "be used to + -ing", rightZh: "后接动名词" },
            ],
          },
        },
        { heading: "The complement", headingZh: "后面接什么", body: LONG_EN, bodyZh: LONG_ZH },
      ],
      words: [studyRow("used to"), studyRow("be used to"), studyRow("get used to"), studyRow("complement")],
    });
    assert.equal(isFilled(recap), true);
    assert.ok(recap.sections[0]?.table);
    assert.equal(recap.sections[0]?.table?.rows.length, 2);
    assert.match(recap.sections[0]?.table?.leftHead ?? "", /used to/i);
    assert.deepEqual(
      extractStars("They *used to* smoke. Now they are *used to* the smell."),
      ["used to"],
    );
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

function coachCard(id: string, topic: string): CoachCard {
  return {
    id,
    topic,
    topicZh: "",
    briefZh: "",
    briefEn: "A brief.",
    move: "join",
    options: [],
    extras: [],
    source: "auto",
    prompt: "",
    latencyMs: 1,
    at: 1,
  };
}

function deepEssay(title: string): TopicEssay {
  return {
    title,
    contextEn: "",
    contextZh: "",
    viewEn: "The hour's example is reuse, not a prettier slide about patience.",
    viewZh: "这小时的例子是复用。",
    angles: [],
    facts: [{ en: "Falcon 9 first landed in 2015.", zh: "2015 年首次着陆。" }],
    qEn: "",
    qZh: "",
    aEn: "The first Falcon 9 landing in 2015 is the fact I can say in forty seconds.",
    aZh: "我能讲的事实是 2015 年着陆。",
    say: "",
    frames: [],
    terms: [],
    sources: [],
    latencyMs: 12,
    at: 1,
    draft: false,
  };
}

describe("DeepSearch keyed by coach card id", () => {
  it("reads the card id first and does not let a later topic overwrite an earlier card", () => {
    const a = coachCard("coach-a", "Quarterly pressure");
    const b = coachCard("coach-b", "Quarterly pressure");
    const essays = {
      "coach-a": deepEssay("First search"),
      "coach-b": deepEssay("Second search"),
      "quarterly pressure": deepEssay("Legacy shared"),
    };
    assert.equal(essayOf(a, essays)?.title, "First search");
    assert.equal(essayOf(b, essays)?.title, "Second search");
  });

  it("does not share DeepSearch across cards with the same topic", () => {
    const card = coachCard("coach-new", "Quarterly pressure");
    const essays = { "quarterly pressure": deepEssay("Legacy shared") };
    assert.equal(essayOf(card, essays), undefined);
  });

  it("keeps the newest coach cards when packing a long hour", () => {
    const cards = Array.from({ length: 24 }, (_, i) =>
      coachCard(`coach-${i}`, i < 4 ? "Early topic" : `Beat ${i}`),
    );
    const packed = packCoach(cards, {});
    assert.equal(packed.length, 20);
    assert.equal(packed[0]?.topic, "Beat 4");
    assert.equal(packed.at(-1)?.topic, "Beat 23");
  });

  it("keeps listen-mode cards as study rows in the pack", () => {
    const card = coachCard("coach-listen", "Even though");
    card.mode = "listen";
    card.options = [
      { label: "这句", en: "Even though hospitals are convenient, you still wait.", zh: "即使方便，你仍要等。", keys: [] },
      { label: "剖析", en: "Even though lets you concede first, then turn.", zh: "先让一步再转折。", keys: [] },
      { label: "背景", en: "The hour compared wait times in two countries.", zh: "这小时在比两国等候。", keys: [] },
    ];
    const packed = packCoach([card], {});
    assert.equal(packed[0]?.mode, "listen");
    assert.equal(packed[0]?.options[0]?.label, "这句");
  });

  it("packs two same-topic cards with their own DeepSearch", () => {
    const packed = packCoach(
      [coachCard("coach-a", "Quarterly pressure"), coachCard("coach-b", "Quarterly pressure")],
      {
        "coach-a": deepEssay("First search"),
        "coach-b": deepEssay("Second search"),
      },
    );
    assert.equal(packed.length, 2);
    assert.equal(packed[0]?.deep?.title, "First search");
    assert.equal(packed[1]?.deep?.title, "Second search");
  });
});
