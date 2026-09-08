import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assembleCoach,
  coachMoveOf,
  coachOptionLabels,
  isCoachFilled,
} from "./coach-assemble.ts";

const heard = "Wait times at the hospital are longer than last year in Manila.";
const question = "Who can wait for the payoff this quarter?";

describe("coach labels by class mode", () => {
  it("keeps interactive and audit on the same three openings", () => {
    assert.deepEqual(coachOptionLabels("interactive", "join"), ["同意", "对比", "例子"]);
    assert.deepEqual(coachOptionLabels("audit", "join"), ["同意", "对比", "例子"]);
    assert.deepEqual(coachOptionLabels("interactive", "answer"), ["直接答", "补一层", "举个例"]);
    assert.deepEqual(coachOptionLabels("audit", "answer"), ["直接答", "补一层", "举个例"]);
  });

  it("keeps listen on 这句 / 剖析 / 背景", () => {
    assert.deepEqual(coachOptionLabels("listen", "join"), ["这句", "剖析", "背景"]);
    assert.equal(coachMoveOf(question, "listen", "answer"), "join");
  });
});

describe("assembleCoach", () => {
  it("stamps interactive join labels and keeps extras", () => {
    const card = assembleCoach({
      mode: "interactive",
      last: heard,
      parsed: {
        topic: "Hospital wait times",
        topicZh: "医院等候",
        briefEn: "Waits got longer.",
        briefZh: "等候更久了。",
        move: "join",
        options: [
          { label: "Agree", en: "I can live with a longer wait if the care is safer.", zh: "安全更重要。" },
          { label: "对比", en: "Manila waits still beat the queues I saw last year.", zh: "比去年强。" },
          { en: "Last year the clinic finished me in forty minutes.", zh: "举个例。" },
        ],
        extras: [{ label: "延展", en: "That also changes how families plan a sick day." }],
      },
    });
    assert.equal(card.ok, true);
    if (!card.ok) return;
    assert.deepEqual(card.options.map((o) => o.label), ["同意", "对比", "例子"]);
    assert.equal(card.move, "join");
    assert.equal(card.extras[0]?.label, "延展");
    assert.equal(isCoachFilled(card, "interactive", "join"), true);
  });

  it("uses the same openings for audit and does not invent a fourth turn", () => {
    const card = assembleCoach({
      mode: "audit",
      last: heard,
      parsed: {
        topic: "Wait times",
        options: [
          "I would rather wait than rush a diagnosis.",
          "The private clinic next door still finishes people faster.",
          "My cousin sat four hours and still left without a number.",
        ],
      },
    });
    assert.equal(card.ok, true);
    if (!card.ok) return;
    assert.deepEqual(card.options.map((o) => o.label), ["同意", "对比", "例子"]);
    assert.equal(card.extras.length, 0);
    assert.equal(isCoachFilled(card, "audit", "join"), true);
  });

  it("switches to the three answers when the last line is a question", () => {
    const card = assembleCoach({
      mode: "interactive",
      last: question,
      parsed: {
        same: true,
        move: "join",
        topic: "Old title",
        options: {
          直接答: { en: "I can wait if the upside is still compounding." },
          补一层: { en: "The wait only works if cash lasts through next year." },
          举个例: { en: "I sat out 2022 and still caught the rebound." },
        },
      },
    });
    assert.equal(card.ok, true);
    if (!card.ok) return;
    assert.equal(card.move, "answer");
    assert.equal(card.same, false);
    assert.deepEqual(card.options.map((o) => o.label), ["直接答", "补一层", "举个例"]);
  });

  it("keeps a listen 这句 even when it is the caption itself", () => {
    const card = assembleCoach({
      mode: "listen",
      last: heard,
      parsed: {
        topic: "Wait times",
        options: [
          { label: "这句", en: heard },
          { label: "剖析", en: "Longer than last year sets a clean year-on-year contrast." },
          { label: "背景", en: "A clinic hour comparing public queues across cities." },
        ],
      },
    });
    assert.equal(card.ok, true);
    if (!card.ok) return;
    assert.equal(card.options[0]?.en, heard);
    assert.equal(card.options[0]?.label, "这句");
  });

  it("relabels listen cards and drops extras", () => {
    const card = assembleCoach({
      mode: "listen",
      last: heard,
      parsed: {
        topic: "Wait times",
        move: "answer",
        options: [
          { label: "同意", en: "Wait times are longer than last year in Manila." },
          { label: "剖析", en: "Longer than last year sets a clean year-on-year contrast." },
          { label: "背景", en: "A clinic hour comparing public queues across cities." },
        ],
        extras: [{ en: "I agree we should tell the teacher that." }],
      },
    });
    assert.equal(card.ok, true);
    if (!card.ok) return;
    assert.equal(card.move, "join");
    assert.deepEqual(card.options.map((o) => o.label), ["这句", "剖析", "背景"]);
    assert.deepEqual(card.extras, []);
    assert.equal(isCoachFilled(card, "listen", "join"), true);
  });

  it("English labels in any case and any order land by meaning, and a duplicate label is dropped", () => {
    const card = assembleCoach({
      mode: "interactive",
      last: heard,
      parsed: {
        topic: "Hospital wait times",
        move: "join",
        options: [
          { label: "Contrast", en: "Manila waits still beat the queues I saw last year.", zh: "比去年强。" },
          { label: "EXAMPLE", en: "Last year the clinic finished me in forty minutes.", zh: "举个例。" },
          { label: "Agree", en: "I can live with a longer wait if the care is safer.", zh: "安全更重要。" },
          { label: "agree", en: "A second agreement that must not steal another slot.", zh: "重复。" },
        ],
      },
    });
    assert.equal(card.ok, true);
    if (!card.ok) return;
    assert.deepEqual(card.options.map((o) => o.label), ["同意", "对比", "例子"]);
    assert.match(card.options[0]!.en, /live with a longer wait/);
    assert.match(card.options[1]!.en, /Manila/);
    assert.match(card.options[2]!.en, /forty minutes/);
  });

  it("fails instead of inventing a missing opening", () => {
    const card = assembleCoach({
      mode: "audit",
      last: heard,
      parsed: {
        topic: "Wait times",
        options: [
          { en: "I can live with a longer wait if the care is safer." },
          { en: "Manila waits still beat the queues I saw last year." },
        ],
      },
    });
    assert.equal(card.ok, false);
    if (card.ok) return;
    assert.match(card.error, /没给出三条/);
  });

  it("drops a line that only repeats the caption", () => {
    const card = assembleCoach({
      mode: "interactive",
      last: heard,
      parsed: {
        topic: "Wait times",
        options: [
          { en: heard },
          { en: "I would rather wait than rush a diagnosis today." },
          { en: "The private clinic next door still finishes people faster." },
        ],
      },
    });
    assert.equal(card.ok, false);
  });

  it("keeps an example that builds on the caption instead of failing the card", () => {
    const card = assembleCoach({
      mode: "interactive",
      last: heard,
      parsed: {
        topic: "Wait times",
        options: [
          { en: "I can live with a longer wait if the care is safer." },
          { en: "Manila waits still beat the queues I saw last year." },
          { en: `${heard} I would still wait if the diagnosis is careful.` },
        ],
      },
    });
    assert.equal(card.ok, true);
    if (!card.ok) return;
    assert.match(card.options[2]?.en ?? "", /still wait/);
  });

  it("uses the previous title or 这一拍 when the model omits a topic", () => {
    const reused = assembleCoach({
      mode: "audit",
      last: heard,
      prevTopic: "Hospital waits",
      parsed: {
        options: [
          { en: "I can live with a longer wait if the care is safer." },
          { en: "Manila waits still beat the queues I saw last year." },
          { en: "My cousin sat four hours and still left without a number." },
        ],
      },
    });
    assert.equal(reused.ok, true);
    if (!reused.ok) return;
    assert.equal(reused.topic, "Hospital waits");
    const fresh = assembleCoach({
      mode: "interactive",
      last: "umm the the wait uh something something today maybe",
      parsed: {
        options: [
          { en: "I can live with a longer wait if the care is safer." },
          { en: "Manila waits still beat the queues I saw last year." },
          { en: "My cousin sat four hours and still left without a number." },
        ],
      },
    });
    assert.equal(fresh.ok, true);
    if (!fresh.ok) return;
    assert.equal(fresh.topic, "这一拍");
  });

  it("clips 剖析 Chinese at a sentence, not at 40 characters", () => {
    const zh =
      "这一句用 year-on-year 把等候拉成对照，不是空说变久，而是把时间和城市都点出来。后半句落在马尼拉，让对比有地点，学生能马上接一句自己昨天在窗口排队的经历。后面还有一句不该露出来，装配器不该再往下收，也不该把半句硬切掉。";
    const card = assembleCoach({
      mode: "listen",
      last: heard,
      parsed: {
        topic: "Wait times",
        options: [
          { label: "这句", en: heard, zh: "医院等候比去年更久。" },
          { label: "剖析", en: "Longer than last year sets a clean year-on-year contrast.", zh },
          { label: "背景", en: "A clinic hour comparing public queues across cities.", zh: "这是在比公立医院的排队。" },
        ],
      },
    });
    assert.equal(card.ok, true);
    if (!card.ok) return;
    assert.match(card.options[1]?.zh ?? "", /经历。/);
    assert.equal((card.options[1]?.zh ?? "").includes("不该露出来"), false);
    assert.ok((card.options[1]?.zh ?? "").length > 40);
  });

  it("keeps the previous topic title when same=true on a join beat", () => {
    const card = assembleCoach({
      mode: "audit",
      last: heard,
      prevTopic: "Hospital waits",
      prevTopicZh: "医院等候",
      parsed: {
        same: true,
        topic: "New name",
        topicZh: "新名字",
        options: [
          { en: "I can live with a longer wait if the care is safer." },
          { en: "Manila waits still beat the queues I saw last year." },
          { en: "My cousin sat four hours and still left without a number." },
        ],
      },
    });
    assert.equal(card.ok, true);
    if (!card.ok) return;
    assert.equal(card.topic, "Hospital waits");
    assert.equal(card.topicZh, "医院等候");
  });
});
