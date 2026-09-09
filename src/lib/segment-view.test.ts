import assert from "node:assert/strict";
import { test } from "node:test";
import { packCoach } from "./recap-kit.ts";
import { groupPackBySegment, segmentChips, segmentLabel, segmentSpan } from "./segment-view.ts";
import type { ClassSegment, CoachCard } from "./types.ts";

const T0 = Date.UTC(2026, 8, 8, 6, 3, 0); // 14:03 in UTC+8; the tests only compare, never print
function card(id: string, topic: string, at: number): CoachCard {
  return {
    id,
    topic,
    topicZh: "",
    briefZh: "简介",
    briefEn: `About ${topic}.`,
    move: "join",
    options: [{ label: "同意", en: "Yes.", zh: "是。", keys: [] }],
    extras: [],
    source: "auto",
    prompt: "",
    latencyMs: 1,
    at,
  };
}
const seg = (id: string, startAt: number, endAt: number | null, cardIds: string[], heading = ""): ClassSegment => ({
  id,
  startAt,
  endAt,
  heading,
  headingZh: heading ? "中文" : "",
  claims: heading ? [{ en: "A claim.", zh: "一个论点。" }] : [],
  todo: [],
  cardIds,
  seqFrom: 1,
  seqTo: 10,
});

const cards = [card("c1", "Quarterly pressure", T0 + 30_000), card("c2", "Quarterly pressure", T0 + 90_000), card("c3", "Boosters", T0 + 200_000)];
const segments = [seg("g1", T0, T0 + 200_000, ["c1", "c2"], "Quarterly earnings pressure"), seg("g2", T0 + 200_000, null, ["c3"])];

test("chips: one per stretch, the open one reads 现在 with the newest topic; loose cards hang off the last", () => {
  const chips = segmentChips(segments, [...cards, card("c4", "Loose", T0 + 300_000)], {});
  assert.equal(chips.length, 2);
  assert.equal(chips[0]!.label, "Quarterly earnings pressure");
  assert.equal(chips[0]!.open, false);
  assert.deepEqual(chips[0]!.cardIds, ["c1", "c2"]);
  assert.match(chips[0]!.title, /一个论点/);
  assert.equal(chips[1]!.label, "现在 · Boosters");
  assert.deepEqual(chips[1]!.cardIds, ["c3", "c4"], "the card the segmenter has not placed yet is still reachable");
});

test("labels fall back to the cards' topic, then a placeholder; spans show minutes", () => {
  assert.equal(segmentLabel(segments[1]!, cards), "Boosters");
  assert.equal(segmentLabel(seg("x", T0, null, []), cards), "这一段");
  assert.match(segmentSpan(segments[0]!), /^\d\d:\d\d–\d\d:\d\d$/);
  assert.match(segmentSpan(segments[1]!), /^\d\d:\d\d–$/);
});

test("the appendix groups packed cards under the stretch they ran in; old packs stay one group", () => {
  const pack = packCoach(cards, {});
  assert.equal(pack[0]!.cardId, "c1");
  assert.equal(pack[0]!.at, T0 + 30_000);
  const groups = groupPackBySegment(pack, cards, segments);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]!.segment?.id, "g1");
  assert.deepEqual(groups[0]!.cards.map((c) => c.topic), ["Quarterly pressure", "Quarterly pressure"]);
  assert.equal(groups[1]!.segment?.id, "g2");
  assert.deepEqual(groups[1]!.cards.map((c) => c.topic), ["Boosters"]);
  // A pack written before 脉络 has neither cardId nor at: matched by topic.
  const old = pack.map(({ cardId: _c, at: _a, ...rest }) => rest);
  assert.equal(groupPackBySegment(old, cards, segments)[0]!.cards.length, 2);
  // No stretches at all (an old class): one group, no header.
  assert.deepEqual(groupPackBySegment(pack, cards, []).map((g) => g.segment), [null]);
  // A card outside every stretch lands in a trailing group.
  const stray = packCoach([card("c9", "Stray", T0 - 60_000)], {});
  const withStray = groupPackBySegment([...pack, ...stray], [...cards], segments);
  assert.equal(withStray.at(-1)!.segment, null);
  assert.equal(withStray.at(-1)!.cards[0]!.topic, "Stray");
});
