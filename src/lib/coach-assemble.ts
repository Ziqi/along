import { parseClassMode, type ClassMode } from "./class-mode.ts";
import { isHeardQuestion, resolveCoachSame } from "./coach-kit.ts";

export type CoachMove = "answer" | "join";

export type CoachLine = {
  label: string;
  en: string;
  zh: string;
  keys: string[];
};

export type AssembledCoach = {
  ok: true;
  same: boolean;
  topic: string;
  topicZh: string;
  briefZh: string;
  briefEn: string;
  move: CoachMove;
  options: CoachLine[];
  extras: CoachLine[];
  ms: number;
};

export type AssembleCoachFail = { ok: false; error: string };

/** Canonical slots. The model writes English; this only stamps the three names. */
export function coachOptionLabels(mode: ClassMode, move: CoachMove): [string, string, string] {
  if (mode === "listen") return ["这句", "剖析", "背景"];
  if (move === "answer") return ["直接答", "补一层", "举个例"];
  return ["同意", "对比", "例子"];
}

export function coachExtraLabels(): [string, string] {
  return ["延展", "追深"];
}

export function coachMoveOf(last: string, mode: ClassMode, modelMove: unknown): CoachMove {
  if (mode === "listen") return "join";
  if (modelMove === "answer" || isHeardQuestion(last)) return "answer";
  return "join";
}

function clip(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

function pick(parsed: Record<string, unknown> | null, key: string) {
  const v = parsed?.[key];
  return typeof v === "string" ? v.trim() : "";
}

function norm(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function echoesHeard(en: string, last: string) {
  const a = norm(en);
  const b = norm(last);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length > 24 && (a.includes(b) || b.includes(a));
}

export function parseCoachKeys(v: unknown, en: string): string[] {
  const out: string[] = [];
  if (Array.isArray(v)) {
    for (const it of v) {
      const w = String(it ?? "").trim();
      if (w.length > 1 && en.toLowerCase().includes(w.toLowerCase())) out.push(w);
      if (out.length === 4) break;
    }
  }
  if (out.length) return out;
  const stop = new Set([
    "that",
    "this",
    "with",
    "from",
    "have",
    "would",
    "could",
    "should",
    "about",
    "there",
    "their",
    "what",
    "when",
    "your",
    "will",
    "just",
    "them",
    "they",
    "then",
    "than",
    "also",
    "into",
    "more",
    "some",
    "been",
    "being",
    "because",
  ]);
  return en
    .replace(/[^A-Za-z' ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !stop.has(w.toLowerCase()))
    .slice(0, 3);
}

function rowOf(label: string, en: string, zh: string, keys: unknown): CoachLine | null {
  const line = clip(en, 180);
  if (!line) return null;
  return {
    label: label.replace(/\s+/g, " ").trim(),
    en: line,
    zh: clip(zh, 40),
    keys: parseCoachKeys(keys, line),
  };
}

function collectRows(v: unknown): CoachLine[] {
  const out: CoachLine[] = [];
  const push = (label: string, en: string, zh: string, keys: unknown) => {
    const row = rowOf(label, en, zh, keys);
    if (row) out.push(row);
  };
  if (Array.isArray(v)) {
    for (const it of v) {
      if (typeof it === "string") {
        push("", it, "", undefined);
        continue;
      }
      if (!it || typeof it !== "object") continue;
      const rec = it as { label?: unknown; en?: unknown; zh?: unknown; keys?: unknown; text?: unknown };
      const en =
        typeof rec.en === "string"
          ? rec.en
          : typeof rec.text === "string"
            ? rec.text
            : "";
      push(typeof rec.label === "string" ? rec.label : "", en, typeof rec.zh === "string" ? rec.zh : "", rec.keys);
    }
    return out;
  }
  if (v && typeof v === "object") {
    for (const [key, val] of Object.entries(v)) {
      if (typeof val === "string") {
        push(key, val, "", undefined);
        continue;
      }
      if (!val || typeof val !== "object") continue;
      const rec = val as { en?: unknown; zh?: unknown; keys?: unknown };
      push(key, typeof rec.en === "string" ? rec.en : "", typeof rec.zh === "string" ? rec.zh : "", rec.keys);
    }
  }
  return out;
}

function slotOf(label: string, names: string[]): number {
  const t = label.replace(/\s+/g, "");
  if (!t) return -1;
  const idx = names.findIndex((n) => t.includes(n) || n.includes(t));
  if (idx >= 0) return idx;
  if (/这句|steal|quote/.test(t)) return names[0] === "这句" ? 0 : -1;
  if (/剖析|pattern|collocation/.test(t)) return names[1] === "剖析" ? 1 : -1;
  if (/背景|context/.test(t)) return names[2] === "背景" ? 2 : -1;
  if (/直接答|^答$|answer/.test(t)) return names[0] === "直接答" ? 0 : -1;
  if (/补一层|补一句/.test(t)) return names[1] === "补一层" ? 1 : -1;
  if (/举个例/.test(t)) return names.includes("举个例") ? names.indexOf("举个例") : -1;
  if (/同意|agree/.test(t)) return names[0] === "同意" ? 0 : -1;
  if (/对比|contrast/.test(t)) return names[1] === "对比" ? 1 : -1;
  if (/例子|example/.test(t)) return names[2] === "例子" ? 2 : names.includes("举个例") ? names.indexOf("举个例") : -1;
  if (/延展|extend/.test(t)) return names[0] === "延展" ? 0 : -1;
  if (/追深|deeper/.test(t)) return names[1] === "追深" ? 1 : -1;
  return -1;
}

function placeLines(
  rows: CoachLine[],
  names: string[],
  last: string,
  allowEcho = false,
): CoachLine[] {
  const slots: Array<CoachLine | null> = names.map(() => null);
  const leftover: CoachLine[] = [];
  for (const row of rows) {
    if (!allowEcho && echoesHeard(row.en, last)) continue;
    const i = slotOf(row.label, names);
    if (i >= 0 && !slots[i]) slots[i] = row;
    else leftover.push(row);
  }
  for (const row of leftover) {
    const empty = slots.findIndex((s) => !s);
    if (empty < 0) break;
    slots[empty] = row;
  }
  return names.map((label, i) => {
    const hit = slots[i];
    return hit ? { ...hit, label } : { label, en: "", zh: "", keys: [] };
  });
}

function topicFromHeard(last: string) {
  const words = last.replace(/\s+/g, " ").trim().split(/\s+/).filter(Boolean);
  return clip(words.slice(0, 6).join(" "), 48);
}

export function isCoachFilled(
  card: { options: { en?: string; label?: string }[]; extras?: { en?: string }[] },
  mode: ClassMode,
  move: CoachMove,
) {
  const names = coachOptionLabels(mode, move);
  if (card.options.length !== names.length) return false;
  if (card.options.some((o, i) => !o.en?.trim() || o.label !== names[i])) return false;
  if (mode === "listen") return !(card.extras ?? []).length;
  return true;
}

/** Shape only. Never invent an opening the model did not write. */
export function assembleCoach(input: {
  parsed: Record<string, unknown> | null;
  last: string;
  prevTopic?: string;
  prevTopicZh?: string;
  mode?: string;
  ms?: number;
}): AssembledCoach | AssembleCoachFail {
  const mode = parseClassMode(input.mode);
  const move = coachMoveOf(input.last, mode, input.parsed?.move);
  const same = resolveCoachSame({
    modelSame: input.parsed?.same,
    move,
    lastHeard: input.last,
  });
  const labels = coachOptionLabels(mode, move);
  const options = placeLines(
    collectRows(input.parsed?.options),
    labels,
    input.last,
    mode === "listen",
  );
  if (options.some((o) => !o.en)) {
    return { ok: false, error: "教练没给出三条，再听一句。" };
  }
  const extras =
    mode === "listen"
      ? []
      : placeLines(collectRows(input.parsed?.extras), coachExtraLabels(), input.last).filter(
          (o) => o.en,
        );
  const topic =
    same && input.prevTopic
      ? input.prevTopic
      : pick(input.parsed, "topic") || topicFromHeard(input.last);
  if (!topic) return { ok: false, error: "教练没给出三条，再听一句。" };
  return {
    ok: true,
    same,
    topic,
    topicZh: same && input.prevTopicZh ? input.prevTopicZh : pick(input.parsed, "topicZh"),
    briefZh: pick(input.parsed, "briefZh"),
    briefEn: pick(input.parsed, "briefEn"),
    move,
    options,
    extras,
    ms: input.ms ?? 0,
  };
}
