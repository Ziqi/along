/** Small readers for model JSON shared by the capability files. */

export const pick = (parsed: Record<string, unknown> | null, key: string) => {
  const v = parsed?.[key];
  return typeof v === "string" ? v.trim() : "";
};

export function parseOutline(v: unknown): { heading: string; bullets: string[] }[] {
  if (!Array.isArray(v)) return [];
  const out: { heading: string; bullets: string[] }[] = [];
  for (const it of v) {
    if (!it || typeof it !== "object") continue;
    const row = it as { heading?: unknown; bullets?: unknown };
    const heading = typeof row.heading === "string" ? row.heading.trim() : "";
    const bullets = Array.isArray(row.bullets)
      ? row.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 6)
      : [];
    if (heading) out.push({ heading, bullets });
    if (out.length === 6) break;
  }
  return out;
}

export function parsePairs(v: unknown, n: number): { en: string; zh: string }[] {
  if (!Array.isArray(v)) return [];
  const out: { en: string; zh: string }[] = [];
  for (const it of v) {
    if (!it || typeof it !== "object") continue;
    const row = it as { en?: unknown; zh?: unknown };
    const en = typeof row.en === "string" ? row.en.trim() : "";
    const zh = typeof row.zh === "string" ? row.zh.trim() : "";
    if (en) out.push({ en, zh });
    if (out.length === n) break;
  }
  return out;
}

export const hasHan = (s: string) => /[\u4e00-\u9fff]/.test(s);
