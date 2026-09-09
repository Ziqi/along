import type { ClassSegment, CoachCard } from "./types.ts";
import { topicKey } from "./utils.ts";

/**
 * Cut the class into stretches by topic — the 课程脉络 — without a model.
 *
 * The coach already names a topic every beat (grok-4.6, all three class
 * modes), and `assembleCoach` keeps the previous title when the beat is the
 * same subject, so consecutive cards on one topic carry the same `topic`
 * string. A change of topic that the next card confirms is a boundary; a
 * single stray card is not. With the coach off (停写) or a long stretch on one
 * subject, time cuts instead. Pure and idempotent: called every heartbeat with
 * the whole picture, it returns the whole picture.
 */

/** A stretch on one topic runs at most this long before it is cut anyway. */
export const SEGMENT_MAX_MS = 8 * 60_000;
/** A stretch shorter than this (in lines and in time) is absorbed rather than closed. */
export const SEGMENT_MIN_LINES = 6;
export const SEGMENT_MIN_MS = 90_000;

export type SegmentInput = {
  /** Cards in time order; only those after the last assigned one are read. */
  coaches: Pick<CoachCard, "id" | "topic" | "at">[];
  /** Captions in time order; only `seq` and `at` are read. */
  captions: { seq: number; at: number }[];
  segments: ClassSegment[];
  now: number;
  /** When the class began; the first stretch starts here when no card has come yet. */
  startedAt: number;
};

export type SegmentOutput = {
  segments: ClassSegment[];
  /** Stretches that closed during this call, in order — each wants one write-up. */
  closed: ClassSegment[];
};

function segmentId(startAt: number) {
  return `g-${startAt.toString(36)}`;
}

function openSegment(startAt: number, seqFrom: number, cardIds: string[]): ClassSegment {
  return {
    id: segmentId(startAt),
    startAt,
    endAt: null,
    heading: "",
    headingZh: "",
    claims: [],
    todo: [],
    cardIds,
    seqFrom,
    seqTo: Math.max(seqFrom - 1, 0),
  };
}

/** The last caption `seq` heard at or before `t`, else `fallback`. */
function seqBefore(captions: SegmentInput["captions"], t: number, fallback: number) {
  let best = fallback;
  for (const c of captions) {
    if (c.at <= t) best = Math.max(best, c.seq);
    else break;
  }
  return best;
}

export function segmentClass(input: SegmentInput): SegmentOutput {
  const { coaches, captions, now, startedAt } = input;
  const segments = input.segments.map((g) => ({ ...g, cardIds: [...g.cardIds] }));
  const closed: ClassSegment[] = [];
  const maxSeq = captions.length ? Math.max(...captions.map((c) => c.seq)) : 0;
  const cardById = new Map(coaches.map((c) => [c.id, c] as const));
  const assigned = new Set(segments.flatMap((g) => g.cardIds));
  const pending = coaches.filter((c) => !assigned.has(c.id)).sort((a, b) => a.at - b.at);

  let open = segments.length && segments[segments.length - 1]!.endAt === null ? segments[segments.length - 1]! : null;

  // A stretch's subjects are the topics most of its cards carry (all of the
  // tied leaders), so one stray beat does not redefine it and a short opening
  // that took a new subject reads as that subject too.
  const topicsOf = (g: ClassSegment): Set<string> => {
    const counts = new Map<string, number>();
    for (const id of g.cardIds) {
      const c = cardById.get(id);
      if (!c) continue;
      const k = topicKey(c.topic);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    if (!counts.size) return new Set(g.heading ? [topicKey(g.heading)] : []);
    const top = Math.max(...counts.values());
    return new Set([...counts.entries()].filter(([, n]) => n === top).map(([k]) => k));
  };

  const close = (g: ClassSegment, at: number) => {
    g.endAt = at;
    g.seqTo = seqBefore(captions, at, g.seqFrom - 1);
    closed.push(g);
  };

  const begin = (startAt: number, cardIds: string[]) => {
    const seqFrom = (segments.length ? segments[segments.length - 1]!.seqTo : 0) + 1;
    const g = openSegment(startAt, seqFrom, cardIds);
    segments.push(g);
    open = g;
    return g;
  };

  // Nothing open yet: the class has begun once anything was heard or said.
  if (!open && (pending.length || maxSeq > 0)) {
    begin(segments.length ? (segments[segments.length - 1]!.endAt ?? startedAt) : startedAt, []);
  }

  for (let i = 0; i < pending.length; i += 1) {
    const card = pending[i]!;
    if (!open) begin(card.at, []);
    const cur = open!;
    const key = topicKey(card.topic);
    const subjects = cur.cardIds.length ? topicsOf(cur) : new Set<string>();
    if (!subjects.size || subjects.has(key)) {
      cur.cardIds.push(card.id);
      continue;
    }
    // A new topic. It is a boundary only when the next card agrees it moved on.
    const next = pending[i + 1];
    if (!next) break; // wait for confirmation; the card stays unassigned
    if (subjects.has(topicKey(next.topic))) {
      cur.cardIds.push(card.id); // a stray beat; the class did not move
      continue;
    }
    const lines = seqBefore(captions, card.at, cur.seqFrom - 1) - cur.seqFrom + 1;
    if (lines < SEGMENT_MIN_LINES && card.at - cur.startAt < SEGMENT_MIN_MS) {
      cur.cardIds.push(card.id); // too little to stand alone: the stretch takes the new subject
      continue;
    }
    close(cur, card.at);
    begin(card.at, [card.id]);
  }

  // The open stretch follows the tape, and eight minutes on one subject is a cut too.
  if (open) {
    const cur = open as ClassSegment;
    cur.seqTo = Math.max(cur.seqTo, maxSeq);
    const heard = cur.seqTo - cur.seqFrom + 1;
    if (now - cur.startAt >= SEGMENT_MAX_MS && (cur.cardIds.length || heard >= SEGMENT_MIN_LINES)) {
      close(cur, now);
      begin(now, []);
    }
  }

  return { segments, closed };
}

/** Stretches that have closed but were never written up (the write-up failed or is due). */
export function unwrittenSegments(segments: ClassSegment[]) {
  return segments.filter((g) => g.endAt !== null && !g.heading);
}

/** The stretch being heard now, if any. */
export function openSegmentOf(segments: ClassSegment[]) {
  const last = segments[segments.length - 1];
  return last && last.endAt === null ? last : null;
}
