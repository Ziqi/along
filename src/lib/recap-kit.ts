import type { ClassRecap, RecapPair, RecapSection, RecapStudy } from "@/lib/types";

const STOP = new Set(
  "the a an and or but if so to of in on at for from with as is are was were be been being it this that these those you we they i he she my our your their not no yes just about into over after before than then also more some any can will would could should have has had do did does what when where which who how why there here very much many too own same other than into".split(
    " ",
  ),
);

export type RecapBits = {
  transcript: { en: string; zh: string }[];
  topics: string[];
  notes: string[];
  title?: string;
};

function clip(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

function sentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

function tokens(text: string) {
  return text
    .toLowerCase()
    .match(/[a-z][a-z'-]{2,}/g)
    ?.filter((w) => !STOP.has(w) && w.length >= 4) ?? [];
}

function formatBody(paras: string[], points: string[]) {
  const p = paras.map((x) => clip(x, 420)).filter(Boolean);
  const n = points.map((x, i) => `${i + 1}. ${clip(x, 220)}`).filter(Boolean);
  return [...p, n.length ? n.join("\n") : ""].filter(Boolean).join("\n\n");
}

function uniqPairs(rows: RecapPair[], n: number) {
  const seen = new Set<string>();
  const out: RecapPair[] = [];
  for (const r of rows) {
    const k = r.en.toLowerCase();
    if (!r.en || seen.has(k)) continue;
    seen.add(k);
    out.push({ en: r.en, zh: r.zh ?? "" });
    if (out.length === n) break;
  }
  return out;
}

function uniqStudy(rows: RecapStudy[], n: number) {
  const seen = new Set<string>();
  const out: RecapStudy[] = [];
  for (const r of rows) {
    const k = r.en.toLowerCase();
    if (!r.en || seen.has(k)) continue;
    seen.add(k);
    out.push({
      en: r.en,
      zh: r.zh ?? "",
      use: r.use ?? "",
      useZh: r.useZh ?? "",
      example: r.example ?? "",
      exampleZh: r.exampleZh ?? "",
    });
    if (out.length === n) break;
  }
  return out;
}

function lineFor(word: string, tape: { en: string; zh: string }[]) {
  const k = word.toLowerCase();
  return tape.find((l) => l.en.toLowerCase().includes(k)) ?? null;
}

const FRAMES: { re: RegExp; en: string; zh: string; use: string; useZh: string }[] = [
  { re: /\bi'd rather\b/i, en: "I'd rather X than Y", zh: "我宁愿X也不Y", use: "preference", useZh: "表达更想做的选择" },
  { re: /\bas long as\b/i, en: "as long as", zh: "只要", use: "condition", useZh: "提出条件" },
  { re: /\binstead of\b/i, en: "instead of", zh: "而不是", use: "swap", useZh: "用A替代B" },
  { re: /\brather than\b/i, en: "rather than", zh: "而不是", use: "contrast", useZh: "对比选择" },
  { re: /\bnot only\b/i, en: "not only … but also", zh: "不但…而且", use: "add", useZh: "递进" },
  { re: /\beven if\b/i, en: "even if", zh: "即使", use: "concession", useZh: "让步" },
  { re: /\bso that\b/i, en: "so that", zh: "以便", use: "purpose", useZh: "目的" },
  { re: /\bhave to\b/i, en: "have to", zh: "必须", use: "obligation", useZh: "不得不" },
  { re: /\bused to\b/i, en: "used to", zh: "过去常常", use: "past habit", useZh: "过去习惯" },
  { re: /\bgoing to\b/i, en: "be going to", zh: "打算", use: "plan", useZh: "计划" },
  { re: /\bin order to\b/i, en: "in order to", zh: "为了", use: "purpose", useZh: "目的" },
  { re: /\bthe more\b/i, en: "the more … the more", zh: "越…越", use: "degree", useZh: "程度递进" },
];

export function heuristicRecap(input: RecapBits): ClassRecap {
  const tape = input.transcript.filter((l) => l.en.trim());
  const topicList = input.topics.map((t) => t.trim()).filter(Boolean);
  const nSec = Math.min(5, Math.max(3, Math.ceil(tape.length / 10) || 3));
  const size = Math.max(1, Math.ceil(tape.length / nSec));
  const sections: RecapSection[] = [];
  const outline: ClassRecap["outline"] = [];
  for (let i = 0; i < nSec; i++) {
    const chunk = tape.slice(i * size, (i + 1) * size);
    if (!chunk.length) continue;
    const sents = chunk.flatMap((l) => sentences(l.en));
    const zhSents = chunk.map((l) => l.zh).filter(Boolean);
    const heading =
      topicList[i] ||
      clip(sents[0] || chunk[0]?.en || `Part ${i + 1}`, 48);
    const headingZh = clip(zhSents[0] || "", 32);
    const paras = sents.slice(0, 2);
    const points = sents.slice(2, 6);
    const parasZh = zhSents.slice(0, 2);
    const pointsZh = zhSents.slice(2, 6);
    sections.push({
      heading,
      headingZh,
      body: formatBody(paras.length ? paras : [chunk.map((l) => l.en).join(" ")], points),
      bodyZh: formatBody(parasZh, pointsZh),
    });
    outline.push({
      heading,
      bullets: (points.length ? points : sents).slice(0, 4).map((b) => clip(b, 120)),
    });
  }

  const bag = new Map<string, number>();
  for (const l of tape) for (const w of tokens(l.en)) bag.set(w, (bag.get(w) ?? 0) + 1);
  const topWords = [...bag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const words: RecapStudy[] = topWords.map(([w]) => {
    const hit = lineFor(w, tape);
    return {
      en: w,
      zh: hit?.zh ? clip(hit.zh, 40) : "",
      use: "Heard in class.",
      useZh: "课上出现。",
      example: hit?.en ? clip(hit.en, 140) : "",
      exampleZh: hit?.zh ? clip(hit.zh, 80) : "",
    };
  });

  const collos: RecapStudy[] = [];
  const seenCol = new Set<string>();
  for (const l of tape) {
    const ws = tokens(l.en);
    for (let i = 0; i < ws.length - 1; i++) {
      const pair = `${ws[i]} ${ws[i + 1]}`;
      if (seenCol.has(pair)) continue;
      seenCol.add(pair);
      collos.push({
        en: pair,
        zh: "",
        use: "collocation",
        useZh: "搭配",
        example: clip(l.en, 140),
        exampleZh: clip(l.zh, 80),
      });
      if (collos.length === 8) break;
    }
    if (collos.length === 8) break;
  }

  const blob = tape.map((l) => l.en).join(" ");
  const patterns: RecapStudy[] = [];
  for (const f of FRAMES) {
    if (!f.re.test(blob)) continue;
    const hit = tape.find((l) => f.re.test(l.en));
    patterns.push({
      en: f.en,
      zh: f.zh,
      use: f.use,
      useZh: f.useZh,
      example: hit ? clip(hit.en, 140) : "",
      exampleZh: hit ? clip(hit.zh, 80) : "",
    });
    if (patterns.length === 8) break;
  }

  const grammar: RecapStudy[] = patterns.slice(0, 6).map((p) => ({
    ...p,
    use: p.use || "structure",
    useZh: p.useZh || "结构",
  }));

  const lineCands = tape
    .flatMap((l) => sentences(l.en).map((en) => ({ en, zh: l.zh })))
    .filter((s) => s.en.length >= 28 && s.en.length <= 180)
    .slice()
    .sort((a, b) => b.en.length - a.en.length);
  const lines: RecapStudy[] = uniqStudy(
    lineCands.map((s) => ({
      en: s.en,
      zh: s.zh,
      use: "Say this.",
      useZh: "可直接说。",
      example: s.en,
      exampleZh: s.zh,
    })),
    8,
  );

  const takeaways = uniqPairs(
    [
      ...input.notes.map((n) => ({ en: n, zh: /[\u4e00-\u9fff]/.test(n) ? n : "" })),
      ...sections.map((s) => ({ en: s.heading, zh: s.headingZh })),
    ],
    6,
  );

  const topics = uniqPairs(
    [
      ...topicList.map((t) => ({ en: t, zh: "" })),
      ...sections.map((s) => ({ en: s.heading, zh: s.headingZh })),
    ],
    8,
  );

  const first = tape.slice(0, 4);
  const lede = clip(first.map((l) => l.en).join(" "), 320);
  const ledeZh = clip(first.map((l) => l.zh).filter(Boolean).join(" "), 180);
  const title = clip(input.title || topicList[0] || sections[0]?.heading || "Class notes", 60);

  return {
    title,
    lede,
    ledeZh,
    sections,
    topics,
    patterns: uniqStudy(patterns, 8),
    lines,
    words: uniqStudy(words, 12),
    collos: uniqStudy(collos, 10),
    grammar: uniqStudy(grammar, 8),
    skills: [
      { en: "Restate the last point in one sentence.", zh: "用一句话复述刚才的观点。" },
      { en: "Ask one follow-up question.", zh: "追问一个问题。" },
      { en: "Give a short example from your life.", zh: "举一个自己的短例子。" },
    ],
    outline,
    takeaways,
    draft: true,
    latencyMs: 0,
    at: Date.now(),
  };
}

function asPair(v: unknown): RecapPair | null {
  if (!v || typeof v !== "object") return null;
  const r = v as { en?: unknown; zh?: unknown };
  const en = typeof r.en === "string" ? r.en.trim() : "";
  if (!en) return null;
  return { en, zh: typeof r.zh === "string" ? r.zh.trim() : "" };
}

function asStudy(v: unknown): RecapStudy | null {
  if (!v || typeof v !== "object") return null;
  const r = v as RecapStudy & { note?: string };
  const en = typeof r.en === "string" ? r.en.trim() : "";
  if (!en) return null;
  return {
    en,
    zh: typeof r.zh === "string" ? r.zh.trim() : "",
    use: typeof r.use === "string" ? r.use.trim() : typeof r.note === "string" ? r.note.trim() : "",
    useZh: typeof r.useZh === "string" ? r.useZh.trim() : "",
    example: typeof r.example === "string" ? r.example.trim() : "",
    exampleZh: typeof r.exampleZh === "string" ? r.exampleZh.trim() : "",
  };
}

function asSection(v: unknown): RecapSection | null {
  if (!v || typeof v !== "object") return null;
  const r = v as RecapSection & { points?: { en?: string; zh?: string }[] };
  const heading = typeof r.heading === "string" ? r.heading.trim() : "";
  if (!heading) return null;
  const points = Array.isArray(r.points)
    ? r.points.map((p) => p?.en).filter((x): x is string => Boolean(x))
    : [];
  const pointsZh = Array.isArray(r.points)
    ? r.points.map((p) => p?.zh).filter((x): x is string => Boolean(x))
    : [];
  const bodyRaw = typeof r.body === "string" ? r.body.trim() : "";
  const body = bodyRaw || formatBody([], points);
  const bodyZh =
    (typeof r.bodyZh === "string" ? r.bodyZh.trim() : "") || formatBody([], pointsZh);
  if (!body) return null;
  return {
    heading,
    headingZh: typeof r.headingZh === "string" ? r.headingZh.trim() : "",
    body,
    bodyZh,
  };
}

export function assembleRecap(base: ClassRecap, ai: Record<string, unknown>): ClassRecap {
  const sections = Array.isArray(ai.sections)
    ? (ai.sections.map(asSection).filter(Boolean) as RecapSection[])
    : [];
  const outline = Array.isArray(ai.outline)
    ? (ai.outline as { heading?: string; bullets?: string[] }[])
        .map((o) => ({
          heading: String(o.heading ?? "").trim(),
          bullets: Array.isArray(o.bullets) ? o.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 6) : [],
        }))
        .filter((o) => o.heading)
        .slice(0, 6)
    : [];
  const take = (key: string, n: number, fallback: RecapStudy[]) => {
    const rows = Array.isArray(ai[key])
      ? (ai[key] as unknown[]).map(asStudy).filter(Boolean) as RecapStudy[]
      : [];
    return uniqStudy(rows.length >= 3 ? rows : [...rows, ...fallback], n);
  };
  const pairs = (key: string, n: number, fallback: RecapPair[]) => {
    const rows = Array.isArray(ai[key])
      ? (ai[key] as unknown[]).map(asPair).filter(Boolean) as RecapPair[]
      : [];
    return uniqPairs(rows.length ? [...rows, ...fallback] : fallback, n);
  };
  const title = typeof ai.title === "string" && ai.title.trim() ? ai.title.trim() : base.title;
  const lede = typeof ai.lede === "string" && ai.lede.trim() ? ai.lede.trim() : base.lede;
  const ledeZh = typeof ai.ledeZh === "string" && ai.ledeZh.trim() ? ai.ledeZh.trim() : base.ledeZh;
  return {
    ...base,
    title: clip(title, 80),
    lede,
    ledeZh,
    outline: outline.length ? outline : base.outline,
    sections: sections.length ? sections : base.sections,
    topics: pairs("topics", 8, base.topics),
    takeaways: pairs("takeaways", 8, base.takeaways),
    words: take("words", 12, base.words),
    collos: take("collos", 10, base.collos),
    patterns: take("patterns", 8, base.patterns),
    grammar: take("grammar", 8, base.grammar),
    lines: take("lines", 8, base.lines),
    skills: pairs("skills", 6, base.skills),
    draft: false,
    at: Date.now(),
  };
}

export function missingZh(recap: ClassRecap): string[] {
  const out: string[] = [];
  const add = (en: string, zh: string) => {
    if (en && !zh && !/[\u4e00-\u9fff]/.test(en)) out.push(en);
  };
  add(recap.lede, recap.ledeZh);
  for (const s of recap.sections) {
    add(s.heading, s.headingZh);
    add(s.body.split("\n")[0] ?? "", s.bodyZh);
  }
  for (const t of [...recap.topics, ...recap.takeaways, ...recap.skills]) add(t.en, t.zh);
  for (const t of [...recap.words, ...recap.collos, ...recap.patterns, ...recap.grammar, ...recap.lines]) {
    add(t.en, t.zh);
    add(t.use, t.useZh);
    add(t.example, t.exampleZh);
  }
  return [...new Set(out)].slice(0, 36);
}

export function applyZh(recap: ClassRecap, map: Record<string, string>): ClassRecap {
  const zh = (en: string, cur: string) => cur || map[en] || map[en.toLowerCase()] || "";
  const pair = (p: RecapPair): RecapPair => ({ ...p, zh: zh(p.en, p.zh) });
  const study = (p: RecapStudy): RecapStudy => ({
    ...p,
    zh: zh(p.en, p.zh),
    useZh: zh(p.use, p.useZh),
    exampleZh: zh(p.example, p.exampleZh),
  });
  return {
    ...recap,
    ledeZh: zh(recap.lede, recap.ledeZh),
    sections: recap.sections.map((s) => ({
      ...s,
      headingZh: zh(s.heading, s.headingZh),
      bodyZh: s.bodyZh || map[s.body] || s.bodyZh,
    })),
    topics: recap.topics.map(pair),
    takeaways: recap.takeaways.map(pair),
    skills: recap.skills.map(pair),
    words: recap.words.map(study),
    collos: recap.collos.map(study),
    patterns: recap.patterns.map(study),
    grammar: recap.grammar.map(study),
    lines: recap.lines.map(study),
  };
}
