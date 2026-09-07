export type ClassMode = "interactive" | "audit" | "listen";

export const CLASS_MODES: { id: ClassMode; label: string; hint: string }[] = [
  { id: "interactive", label: "互动", hint: "一对一，或网课里你要接老师的话" },
  { id: "audit", label: "旁听", hint: "群课。多半在听，偶尔要接" },
  { id: "listen", label: "只听", hint: "播客、Coursera、录音。没有对老师说一句" },
];

export function parseClassMode(raw: unknown): ClassMode {
  if (raw === "audit" || raw === "listen" || raw === "interactive") return raw;
  return "interactive";
}

export function modeLabel(mode: ClassMode) {
  return CLASS_MODES.find((m) => m.id === mode)?.label ?? "互动";
}

export function isSpeakMode(mode: ClassMode) {
  return mode === "interactive" || mode === "audit";
}

export function coachMinGapMs(mode: ClassMode) {
  return mode === "audit" ? 5500 : 3000;
}

export function isStudyCard(card: { mode?: ClassMode; options?: { label?: string }[] }) {
  if (card.mode === "listen") return true;
  return (card.options ?? [])[0]?.label === "这句";
}

export function topicBeatLabel(topic: string, cards: { id: string; topic: string }[], id: string) {
  const same = cards.filter((c) => c.topic === topic && topic);
  if (same.length < 2) return topic;
  const n = same.findIndex((c) => c.id === id) + 1;
  return n > 0 ? `${topic} · ${n}` : topic;
}
