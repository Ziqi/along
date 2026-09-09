import type { ClassSegment, CoachCard, RecapCoach, TopicEssay } from "./types.ts";
import { essayOf } from "./recap-kit.ts";
import { pad2 } from "./utils.ts";

/** `14:03` — the minute a stretch began; seconds are noise on a strip. */
export function segmentClock(ts: number) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** `14:03–14:11`, or `14:03–` while the stretch is still open. */
export function segmentSpan(g: { startAt: number; endAt: number | null }) {
  return `${segmentClock(g.startAt)}–${g.endAt ? segmentClock(g.endAt) : ""}`;
}

/** What a stretch is called before or without a write-up: its cards' topic, else a placeholder. */
export function segmentLabel(g: ClassSegment, cards: Pick<CoachCard, "id" | "topic">[]) {
  if (g.heading) return g.heading;
  const first = g.cardIds.map((id) => cards.find((c) => c.id === id)).find((c) => c?.topic?.trim());
  return first?.topic.trim() || "这一段";
}

export type SegmentChip = {
  id: string;
  label: string;
  when: string;
  title: string;
  open: boolean;
  deep: boolean;
  cardIds: string[];
};

/**
 * The strip above the coach cards: one chip per stretch, in order. The open
 * stretch reads 现在 and carries the newest topic. Cards that fell outside
 * every stretch (the segmenter has not caught up yet) hang off the last chip
 * so nothing is unreachable.
 */
export function segmentChips(
  segments: ClassSegment[],
  cards: CoachCard[],
  essays: Record<string, TopicEssay>,
): SegmentChip[] {
  const chips: SegmentChip[] = segments.map((g) => {
    const open = g.endAt === null;
    const ownCards = g.cardIds.map((id) => cards.find((c) => c.id === id)).filter((c): c is CoachCard => Boolean(c));
    const label = open ? (ownCards.at(-1)?.topic.trim() || segmentLabel(g, cards)) : segmentLabel(g, cards);
    const claims = g.claims.map((c) => c.zh || c.en).join("；");
    return {
      id: g.id,
      label: open ? `现在 · ${label}` : label,
      when: segmentClock(g.startAt),
      title: [segmentSpan(g), g.headingZh, claims].filter(Boolean).join("  "),
      open,
      deep: ownCards.some((c) => Boolean(essayOf(c, essays))),
      cardIds: [...g.cardIds],
    };
  });
  const placed = new Set(segments.flatMap((g) => g.cardIds));
  const loose = cards.filter((c) => !placed.has(c.id)).map((c) => c.id);
  if (loose.length) {
    const last = chips.at(-1);
    if (last) last.cardIds.push(...loose);
    else chips.push({ id: "g-now", label: `现在 · ${cards.at(-1)?.topic.trim() || "这一段"}`, when: "", title: "", open: true, deep: false, cardIds: loose });
  }
  return chips;
}

export type PackGroup = { segment: ClassSegment | null; cards: RecapCoach[] };

/**
 * The appendix by stretch: each written-up stretch with the packed cards that
 * fell inside it (by the card's time), any card outside every stretch in a
 * trailing group. Old classes with no stretches come back as one group.
 */
export function groupPackBySegment(
  pack: RecapCoach[],
  cards: Pick<CoachCard, "id" | "topic" | "at">[],
  segments: ClassSegment[],
): PackGroup[] {
  if (!segments.length) return pack.length ? [{ segment: null, cards: pack }] : [];
  const atOf = (row: RecapCoach) => {
    if (typeof row.at === "number") return row.at;
    const hit = cards.find((c) => (row.cardId ? c.id === row.cardId : c.topic.trim() === row.topic.trim()));
    return hit?.at ?? null;
  };
  const groups: PackGroup[] = segments.map((g) => ({ segment: g, cards: [] }));
  const rest: RecapCoach[] = [];
  for (const row of pack) {
    const at = atOf(row);
    const g = at === null ? null : segments.find((x) => at >= x.startAt && (x.endAt === null || at < x.endAt));
    const slot = g ? groups.find((grp) => grp.segment?.id === g.id) : null;
    if (slot) slot.cards.push(row);
    else rest.push(row);
  }
  const out = groups.filter((grp) => grp.cards.length || grp.segment?.claims.length);
  if (rest.length) out.push({ segment: null, cards: rest });
  return out;
}
