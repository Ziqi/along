import type { EssayTerm, TopicEssay } from "@/lib/types";

export type EssayBits = {
  topic: string;
  lastHeard: string;
  recent: string[];
  options: string[];
  extras?: string[];
};

function clip(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

function pair(en: string, zh = ""): EssayTerm {
  return { en: clip(en, 280), zh: clip(zh, 120) };
}

function list(raw: unknown, n: number): EssayTerm[] {
  if (!Array.isArray(raw)) return [];
  const out: EssayTerm[] = [];
  for (const it of raw) {
    if (typeof it === "string" && it.trim()) out.push(pair(it));
    else if (it && typeof it === "object") {
      const row = it as { en?: unknown; zh?: unknown };
      const en = typeof row.en === "string" ? row.en.trim() : "";
      const zh = typeof row.zh === "string" ? row.zh.trim() : "";
      if (en) out.push(pair(en, zh));
    }
  }
  return out.slice(0, n);
}

/** Waiting card only. Do NOT copy coach lines — that made DeepSearch look like coach. */
export function heuristicEssay(bits: EssayBits): TopicEssay {
  return {
    title: clip(bits.topic || "检索", 48),
    contextEn: "",
    contextZh: "",
    viewEn: "",
    viewZh: "",
    angles: [],
    facts: [],
    qEn: "",
    qZh: "",
    aEn: "",
    aZh: "",
    say: "",
    frames: [],
    terms: [],
    sources: [],
    latencyMs: 0,
    at: Date.now(),
    draft: true,
  };
}

export function searchFacts(parsed: Record<string, unknown> | null) {
  return list(parsed?.facts, 4);
}

export function assembleEssay(
  draft: TopicEssay,
  parsed: Record<string, unknown> | null,
  ms: number,
): TopicEssay {
  const str = (k: string) => {
    const v = parsed?.[k];
    return typeof v === "string" && v.trim() ? v.trim() : "";
  };
  const facts = list(parsed?.facts, 4);
  const aEn = str("aEn");
  const viewEn = str("viewEn");
  const filled = facts.length >= 1 && Boolean(aEn.length > 40 || viewEn);
  return {
    title: str("title") || draft.title,
    contextEn: str("contextEn"),
    contextZh: str("contextZh"),
    viewEn,
    viewZh: str("viewZh"),
    angles: list(parsed?.angles, 3),
    facts,
    qEn: str("qEn"),
    qZh: str("qZh"),
    aEn,
    aZh: str("aZh"),
    say: str("say"),
    frames: list(parsed?.frames, 3),
    terms: list(parsed?.terms, 8),
    sources: list(parsed?.sources, 4),
    latencyMs: ms,
    at: Date.now(),
    draft: !filled,
  };
}
