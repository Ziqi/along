import type { ClassSession } from "@/lib/types";

/** The catalog's one-line summary: how many classes, topics, patterns, words, and drill cards. */
export function tally(sessions: ClassSession[]) {
  const topics = new Set<string>();
  const patterns = new Set<string>();
  const words = new Set<string>();
  let cards = 0;
  for (const s of sessions) {
    for (const t of s.recap?.topics ?? []) if (t.en) topics.add(t.en.toLowerCase());
    for (const t of s.recap?.patterns ?? []) {
      if (t.en) {
        patterns.add(t.en.toLowerCase());
        cards += 1;
      }
    }
    for (const t of s.recap?.collos ?? []) if (t.en) cards += 1;
    for (const t of s.recap?.grammar ?? []) if (t.en) cards += 1;
    for (const t of s.recap?.lines ?? []) if (t.en) cards += 1;
    for (const t of s.recap?.words ?? []) {
      if (t.en) {
        words.add(t.en.toLowerCase());
        cards += 1;
      }
    }
  }
  return {
    classes: sessions.length,
    topics: topics.size,
    patterns: patterns.size,
    words: words.size,
    cards,
  };
}
