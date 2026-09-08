import type { DrillCard } from "./recap-kit.ts";

/**
 * What this device remembers about each flash card. 会了 moves a card up one
 * box and keeps it away for longer; 再来 drops it to box 0 and it comes back
 * this round. Nothing here leaves the device: it is one student's sense of
 * what stuck, not part of the handout.
 */
export type CardMemory = {
  /** 0 = not known; each 会了 adds one, up to the last gap. */
  box: number;
  /** When the card is next worth showing. */
  due: number;
  seen: number;
  last: number;
};

export type DrillMemory = Record<string, CardMemory>;

const DAY = 86_400_000;
/** Gap before a card in box n is due again. Box 0 is due at once. */
export const BOX_GAP_MS = [0, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY] as const;
export const TOP_BOX = BOX_GAP_MS.length - 1;
/** Cards remembered per device; older ones are forgotten first. */
export const MEMORY_KEEP = 2000;

export const DRILL_KEY = "along.drill";

function fresh(now: number): CardMemory {
  return { box: 0, due: now, seen: 0, last: now };
}

/** 会了: one box up, away for that box's gap. */
export function gradeKnown(mem: DrillMemory, id: string, now: number): DrillMemory {
  const cur = mem[id] ?? fresh(now);
  const box = Math.min(cur.box + 1, TOP_BOX);
  return { ...mem, [id]: { box, due: now + BOX_GAP_MS[box]!, seen: cur.seen + 1, last: now } };
}

/** 再来: back to box 0, due now, so it returns before the round ends. */
export function gradeAgain(mem: DrillMemory, id: string, now: number): DrillMemory {
  const cur = mem[id] ?? fresh(now);
  return { ...mem, [id]: { box: 0, due: now, seen: cur.seen + 1, last: now } };
}

/** Cards worth showing now: never seen, or due. */
export function dueCards<T extends { id: string }>(cards: T[], mem: DrillMemory, now: number): T[] {
  return cards.filter((c) => {
    const m = mem[c.id];
    return !m || m.due <= now;
  });
}

/**
 * A round's order: the ones that came back (box 0, seen before) first, then
 * never-seen cards in handout order, then the rest by how overdue they are.
 * Deterministic, so the same deck drills the same way on every device.
 */
export function orderRound<T extends { id: string }>(cards: T[], mem: DrillMemory, now: number): T[] {
  const rank = (c: T) => {
    const m = mem[c.id];
    if (!m) return 1;
    if (m.box === 0 && m.seen > 0) return 0;
    return 2;
  };
  return dueCards(cards, mem, now)
    .map((c, i) => ({ c, i, r: rank(c), due: mem[c.id]?.due ?? now }))
    .sort((a, b) => a.r - b.r || a.due - b.due || a.i - b.i)
    .map((x) => x.c);
}

/** How a deck stands: cards known at least once, cards that came back, cards never drilled. */
export function deckTally(cards: DrillCard[], mem: DrillMemory) {
  let known = 0;
  let again = 0;
  let unseen = 0;
  for (const c of cards) {
    const m = mem[c.id];
    if (!m) unseen += 1;
    else if (m.box > 0) known += 1;
    else again += 1;
  }
  return { known, again, unseen, total: cards.length };
}

/** Keep the map bounded: the least recently touched cards are dropped first. */
export function trimMemory(mem: DrillMemory, keep = MEMORY_KEEP): DrillMemory {
  const ids = Object.keys(mem);
  if (ids.length <= keep) return mem;
  const kept = ids.sort((a, b) => mem[b]!.last - mem[a]!.last).slice(0, keep);
  const out: DrillMemory = {};
  for (const id of kept) out[id] = mem[id]!;
  return out;
}

export function loadMemory(): DrillMemory {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(DRILL_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: DrillMemory = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const m = v as Partial<CardMemory>;
      if (typeof m.box !== "number" || typeof m.due !== "number") continue;
      out[id] = {
        box: Math.max(0, Math.min(TOP_BOX, Math.floor(m.box))),
        due: m.due,
        seen: typeof m.seen === "number" ? m.seen : 0,
        last: typeof m.last === "number" ? m.last : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function saveMemory(mem: DrillMemory) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DRILL_KEY, JSON.stringify(trimMemory(mem)));
  } catch {
    // Full or blocked storage: the round still runs, it is just not remembered.
  }
}
