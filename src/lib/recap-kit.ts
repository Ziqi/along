import type {
  ClassRecap,
  CoachCard,
  RecapCoach,
  RecapDeep,
  RecapPair,
  RecapSection,
  RecapStudy,
  RecapTable,
  TopicEssay,
} from "./types.ts";
import { PACK_KEEP } from "./live-queue.ts";

const STOP = new Set(
  "the a an and or but if so to of in on at for from with as is are was were be been being it this that these those you we they i he she my our your their not no yes yeah yup yep just about into over after before than then also more some any can will would could should have has had do did does what when where which who how why there here very much many too own same other than into like think really people kind thing things something because actually maybe perhaps literally somehow already always never still even well right okay ok wait mean means said say says get got going gonna want need see look come take give make made hello subscribe best constantly world jobs it's that's don't didn't there's they're we're you're i've you've we've let's them they this that will would could should have been being very also".split(
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

function keyOf(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim();
}

export function compactTape(tape: { en: string; zh: string }[]) {
  const out: { en: string; zh: string }[] = [];
  for (const raw of tape) {
    const en = raw.en.replace(/\s+/g, " ").trim();
    if (en.length < 10) continue;
    const k = keyOf(en);
    const prev = out.at(-1);
    if (prev) {
      const pk = keyOf(prev.en);
      if (k === pk || pk.includes(k) || k.includes(pk)) {
        if (en.length > prev.en.length) prev.en = en;
        if ((raw.zh ?? "").length > (prev.zh ?? "").length) prev.zh = raw.zh;
        continue;
      }
    }
    if (out.slice(-4).some((p) => keyOf(p.en) === k)) continue;
    out.push({ en, zh: (raw.zh ?? "").trim() });
  }
  return out;
}

function formatBody(paras: string[], points: string[]) {
  const p = paras.map((x) => clip(x, 640)).filter(Boolean);
  const seen = new Set<string>();
  const n: string[] = [];
  for (const x of points) {
    const t = clip(x, 220);
    const k = keyOf(t);
    if (!t || seen.has(k)) continue;
    seen.add(k);
    n.push(`${n.length + 1}. ${t}`);
  }
  return [...p, n.length ? n.join("\n") : ""].filter(Boolean).join("\n\n");
}

export function polishBody(text: string) {
  const raw = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!raw.length) return "";
  const paras: string[] = [];
  const points: string[] = [];
  for (const line of raw) {
    if (/^\d+[.)]\s+/.test(line)) points.push(line.replace(/^\d+[.)]\s+/, ""));
    else if (/^[-•]\s+/.test(line)) points.push(line.replace(/^[-•]\s+/, ""));
    else paras.push(line);
  }
  return formatBody(paras.slice(0, 8), points.slice(0, 8));
}

export type ProseBlock = { type: "p" | "ol" | "ul"; items: string[] };

/** Same split the screen and the print sheet use. */
export function splitProse(text: string): ProseBlock[] {
  const raw = text.split("\n");
  const blocks: ProseBlock[] = [];
  let i = 0;
  while (i < raw.length) {
    const line = raw[i]?.trim() ?? "";
    if (!line) {
      i += 1;
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < raw.length) {
        const cur = raw[i]?.trim() ?? "";
        if (!cur) {
          i += 1;
          break;
        }
        if (/^\d+[.)]\s+/.test(cur)) {
          items.push(cur.replace(/^\d+[.)]\s+/, ""));
          i += 1;
          continue;
        }
        break;
      }
      if (items.length) blocks.push({ type: "ol", items });
      continue;
    }
    if (/^[-•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < raw.length) {
        const cur = raw[i]?.trim() ?? "";
        if (!cur) {
          i += 1;
          break;
        }
        if (/^[-•]\s+/.test(cur)) {
          items.push(cur.replace(/^[-•]\s+/, ""));
          i += 1;
          continue;
        }
        break;
      }
      if (items.length) blocks.push({ type: "ul", items });
      continue;
    }
    const items: string[] = [];
    while (i < raw.length) {
      const cur = raw[i]?.trim() ?? "";
      if (!cur) {
        i += 1;
        break;
      }
      if (/^\d+[.)]\s+/.test(cur) || /^[-•]\s+/.test(cur)) break;
      items.push(cur);
      i += 1;
    }
    if (items.length) blocks.push({ type: "p", items: [items.join(" ")] });
  }
  return blocks;
}

export const GOLD_CONTENT = `You are writing THIS HOUR's paper — a teaching 讲义 the student can take home. Any subject. Do not assume SpaceX.

SHAPE (rewrite if a piece is missing; a table of contents is not a handout):
1. title: 3–8 English words, magazine-like. Never a caption crumb, never the first words of the transcript, never a spoken fragment.
2. lede + ledeZh: 1–2 sentences each. What this hour argued, and where it stuck.
3. sections: 2–4 themes. Each body AND bodyZh must be real prose (at least two sentences). A numbered 1. 2. 3. list may follow a paragraph. A list alone is not a section. A heading that repeats a caption is not a section.
Contrast table ONLY if the hour is a real contrast (X vs Y). Skip the table otherwise.

SOURCES — synthesize, do not paste:
- Coach cards: take the claim from topic / brief / briefZh — the stuck layer, not the three spoken lines. If there was no DeepSearch and no student note, the essay must still recognize at least one coach brief. NEVER paste the three spoken lines (agree / contrast / example, or answer / add a layer / give an example) into the essay.
- DeepSearch: names, numbers, years that were actually opened belong in the matching paragraph, not only in an appendix.
- Student notes: the line they wanted kept belongs in the related section.
- Transcript: use it to recognize the hour. Do not replay it. Do not turn a caption into a title or heading.

TONE from class_mode:
- interactive / audit: the hour's tension and how the student could have joined. Still an essay — not another 1. 2. 3. of coach lines.
- listen: listening notes. What this beat said and why the line is worth keeping. Never write as if they spoke to a teacher.

Do not invent paragraphs, numbers, or a contrast. Spoken originals stay in an appendix.`;

export const GOLD_STUDY = `Write the LANGUAGE half of THIS hour's paper. Every row must point back to something just heard — transcript, coach, DeepSearch, or a student note. Do not fill with dictionary leftovers (think / like / good / people).

Each row needs all of:
- en: word, collocation, or frame from this hour
- zh: precise 简体
- use + useZh: how THIS class used it and why it is worth keeping
- example + exampleZh: a sentence that could sit next to the tape / coach / search. Do not reprint the three coach openings.

listen: prefer collocations from the 剖析 cards.
interactive / audit: prefer upgrades they could say, still as study rows — not another 1. 2. 3. paste.

marks = exact short strings (1-4 words) to underline in the essay.
words AND collos are required. At least 4 complete rows, with ≥3 class-specific words and ≥2 phrases. Patterns or grammar alone are not enough.
Drop any row that has no shadow in this hour.
skills = frames for this topic, not a copy of the 3 coach lines.`;

function uniqPairs(rows: RecapPair[], n: number) {
  const seen = new Set<string>();
  const out: RecapPair[] = [];
  for (const r of rows) {
    const k = keyOf(r.en);
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
    const k = keyOf(r.en);
    if (!r.en || seen.has(k)) continue;
    if (isGlue(r.en)) continue;
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

export function isGlue(en: string) {
  const w = en.trim().toLowerCase();
  if (!w) return true;
  const parts = w.split(/\s+/);
  if (parts.length === 1) {
    if (STOP.has(w)) return true;
    if (w.length < 3) return true;
  }
  if (parts.every((p) => STOP.has(p))) return true;
  return false;
}

/** Spoken crumbs and captions are not handout titles. */
export function looksLikeHeardFragment(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (/\?{3,}|\b(uh+|um+|erm+|you know)\b/i.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 9 && t === t.toLowerCase()) return true;
  if (words.length >= 12) return true;
  if (words.length >= 7 && /[.!?]$/.test(t)) return true;
  return false;
}

export function hasProseParagraph(body: string) {
  const parts = body
    .split(/\n\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return parts.some((p) => !/^\d+[.)]\s/.test(p) && p.length > 80);
}

function fallbackTitle(base: ClassRecap) {
  const t = (base.title ?? "").trim();
  if (t && t !== "整理中" && t !== "Class notes" && !looksLikeHeardFragment(t)) return t;
  const topic = base.topics[0]?.en?.trim();
  if (topic && !looksLikeHeardFragment(topic)) return topic;
  return "This hour";
}

function echoesLine(heading: string, heard: string[]) {
  const h = keyOf(heading);
  if (!h || h.split(" ").length < 4) return false;
  return heard.some((line) => {
    const k = keyOf(line);
    if (!k) return false;
    if (h === k) return true;
    const [a, b] = h.length <= k.length ? [h, k] : [k, h];
    return b.includes(a) && a.length / b.length >= 0.85;
  });
}

export function emptyRecap(title = "整理中", topics: string[] = []): ClassRecap {
  const heads = topics.map((t) => t.trim()).filter(Boolean).slice(0, 6);
  return {
    title,
    lede: "",
    ledeZh: "",
    sections: [],
    topics: heads.map((t) => ({ en: t, zh: "" })),
    patterns: [],
    lines: [],
    words: [],
    collos: [],
    grammar: [],
    skills: [],
    outline: heads.map((t) => ({ heading: t, bullets: [] })),
    takeaways: [],
    marks: [],
    coachPack: [],
    draft: true,
    latencyMs: 0,
    at: Date.now(),
  };
}

/** Kept for mid-class packing only. Never shown as a finished recap. */
export function heuristicRecap(input: RecapBits): ClassRecap {
  const draft = emptyRecap(clip(input.title || input.topics[0] || "整理中", 60));
  draft.topics = uniqPairs(
    input.topics.map((t) => ({ en: t, zh: "" })),
    8,
  );
  return draft;
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
  if (!en || isGlue(en)) return null;
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
  if (!heading || heading.split(/\s+/).length > 10 || looksLikeHeardFragment(heading)) return null;
  const points = Array.isArray(r.points)
    ? r.points.map((p) => p?.en).filter((x): x is string => Boolean(x))
    : [];
  const pointsZh = Array.isArray(r.points)
    ? r.points.map((p) => p?.zh).filter((x): x is string => Boolean(x))
    : [];
  const bodyRaw = typeof r.body === "string" ? r.body.trim() : "";
  const body = polishBody(bodyRaw || formatBody([], points));
  const bodyZh = polishBody(
    (typeof r.bodyZh === "string" ? r.bodyZh.trim() : "") || formatBody([], pointsZh),
  );
  if (!body || !hasProseParagraph(body)) return null;
  const table = asTable(r.table);
  return {
    heading: clip(heading, 72),
    headingZh: typeof r.headingZh === "string" ? r.headingZh.trim() : "",
    body,
    bodyZh,
    table,
  };
}

export function asTable(v: unknown): RecapTable | null {
  if (!v || typeof v !== "object") return null;
  const t = v as RecapTable;
  const rows = Array.isArray(t.rows)
    ? t.rows
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const left = String(row.left ?? "").trim();
          const right = String(row.right ?? "").trim();
          if (!left || !right) return null;
          return {
            left: clip(left, 160),
            leftZh: clip(String(row.leftZh ?? "").trim(), 120),
            right: clip(right, 160),
            rightZh: clip(String(row.rightZh ?? "").trim(), 120),
          };
        })
        .filter((row): row is RecapTable["rows"][number] => Boolean(row))
    : [];
  if (rows.length < 2) return null;
  return {
    leftHead: clip(String(t.leftHead ?? "").trim() || "This side", 40),
    leftHeadZh: clip(String(t.leftHeadZh ?? "").trim(), 24),
    rightHead: clip(String(t.rightHead ?? "").trim() || "That side", 40),
    rightHeadZh: clip(String(t.rightHeadZh ?? "").trim(), 24),
    rows: rows.slice(0, 6),
  };
}

export function assembleRecap(
  base: ClassRecap,
  ai: Record<string, unknown>,
  opts?: { heard?: string[] },
): ClassRecap {
  const sections = Array.isArray(ai.sections)
    ? (ai.sections.map(asSection).filter(Boolean) as RecapSection[])
    : [];
  const outline = Array.isArray(ai.outline)
    ? (ai.outline as { heading?: string; bullets?: string[] }[])
        .map((o) => ({
          heading: String(o.heading ?? "").trim(),
          bullets: Array.isArray(o.bullets)
            ? [...new Set(o.bullets.map((b) => String(b).trim()).filter((b) => b.length > 8 && b.length < 120))].slice(0, 4)
            : [],
        }))
        .filter((o) => o.heading && o.heading.split(/\s+/).length <= 10)
        .slice(0, 6)
    : [];
  const take = (key: string, n: number) => {
    const rows = Array.isArray(ai[key])
      ? ((ai[key] as unknown[]).map(asStudy).filter(Boolean) as RecapStudy[])
      : [];
    return uniqStudy(rows, n);
  };
  const pairs = (key: string, n: number) => {
    const rows = Array.isArray(ai[key])
      ? ((ai[key] as unknown[]).map(asPair).filter(Boolean) as RecapPair[])
      : [];
    return uniqPairs(rows, n);
  };
  const heard = opts?.heard ?? [];
  const rawTitle = typeof ai.title === "string" ? ai.title.trim() : "";
  const title =
    rawTitle && !looksLikeHeardFragment(rawTitle) && !echoesLine(rawTitle, heard)
      ? rawTitle
      : fallbackTitle(base);
  const lede = typeof ai.lede === "string" && ai.lede.trim() ? ai.lede.trim() : "";
  const ledeZh = typeof ai.ledeZh === "string" && ai.ledeZh.trim() ? ai.ledeZh.trim() : "";
  const useSections = sections.filter(
    (s) => writtenBody(s.body) && hasProseParagraph(s.body) && !echoesLine(s.heading, heard),
  );
  const looseTable = asTable(ai.table);
  if (looseTable) {
    const i = useSections.findIndex((s) => !s.table && /\bvs\.?\b|versus|对上|对比/.test(s.heading));
    const idx = i >= 0 ? i : useSections.findIndex((s) => !s.table);
    if (idx >= 0 && useSections[idx] && !useSections[idx].table) {
      useSections[idx] = { ...useSections[idx], table: looseTable };
    }
  }
  const useLede = lede.trim().length > 40 ? lede : "";
  const marks = [
    ...((Array.isArray(ai.marks) ? ai.marks : []) as unknown[])
      .map((m) => String(m ?? "").trim())
      .filter((m) => m.length >= 3 && m.split(/\s+/).length <= 4 && !isGlue(m)),
    ...extractStars(lede),
    ...useSections.flatMap((s) => extractStars(s.body)),
  ];
  const built: ClassRecap = {
    ...base,
    title: clip(title, 80),
    lede: useLede,
    ledeZh,
    outline: outline.length ? outline : useSections.map((s) => ({ heading: s.heading, bullets: [] })),
    sections: useSections,
    topics: pairs("topics", 8),
    takeaways: pairs("takeaways", 8),
    words: take("words", 10),
    collos: take("collos", 8),
    patterns: take("patterns", 6),
    grammar: take("grammar", 6),
    lines: take("lines", 6),
    skills: pairs("skills", 6),
    marks: [...new Set(marks)].slice(0, 24),
    coachPack: base.coachPack ?? [],
    draft: true,
    at: Date.now(),
  };
  built.draft = !isFilled(built);
  return built;
}

export function missingZh(recap: ClassRecap): string[] {
  const out: string[] = [];
  const add = (en: string, zh: string) => {
    if (en && !zh && !/[\u4e00-\u9fff]/.test(en)) out.push(en);
  };
  add(recap.lede, recap.ledeZh);
  for (const s of recap.sections) {
    add(s.heading, s.headingZh);
    if (s.body && !s.bodyZh) add(clip(s.body, 280), s.bodyZh);
    if (s.table) {
      add(s.table.leftHead, s.table.leftHeadZh);
      add(s.table.rightHead, s.table.rightHeadZh);
      for (const row of s.table.rows) {
        add(row.left, row.leftZh);
        add(row.right, row.rightZh);
      }
    }
  }
  for (const t of [...recap.topics, ...recap.takeaways, ...recap.skills]) add(t.en, t.zh);
  for (const t of [...recap.words, ...recap.collos, ...recap.patterns, ...recap.grammar, ...recap.lines]) {
    add(t.en, t.zh);
    add(t.use, t.useZh);
    add(t.example, t.exampleZh);
  }
  return [...new Set(out)].slice(0, 24);
}

export function applyZh(recap: ClassRecap, map: Record<string, string>): ClassRecap {
  const zh = (en: string, cur: string) => map[en] || map[en.toLowerCase()] || cur;
  return {
    ...recap,
    ledeZh: zh(recap.lede, recap.ledeZh),
    sections: recap.sections.map((s) => ({
      ...s,
      headingZh: zh(s.heading, s.headingZh),
      bodyZh: s.bodyZh || zh(clip(s.body, 280), s.bodyZh),
      table: s.table
        ? {
            ...s.table,
            leftHeadZh: zh(s.table.leftHead, s.table.leftHeadZh),
            rightHeadZh: zh(s.table.rightHead, s.table.rightHeadZh),
            rows: s.table.rows.map((row) => ({
              ...row,
              leftZh: zh(row.left, row.leftZh),
              rightZh: zh(row.right, row.rightZh),
            })),
          }
        : s.table,
    })),
    topics: recap.topics.map((t) => ({ ...t, zh: zh(t.en, t.zh) })),
    takeaways: recap.takeaways.map((t) => ({ ...t, zh: zh(t.en, t.zh) })),
    skills: recap.skills.map((t) => ({ ...t, zh: zh(t.en, t.zh) })),
    words: recap.words.map((t) => ({
      ...t,
      zh: zh(t.en, t.zh),
      useZh: t.useZh || zh(t.use, t.useZh),
      exampleZh: zh(t.example, t.exampleZh),
    })),
    collos: recap.collos.map((t) => ({
      ...t,
      zh: zh(t.en, t.zh),
      useZh: t.useZh || zh(t.use, t.useZh),
      exampleZh: zh(t.example, t.exampleZh),
    })),
    patterns: recap.patterns.map((t) => ({
      ...t,
      zh: zh(t.en, t.zh),
      useZh: t.useZh || zh(t.use, t.useZh),
      exampleZh: zh(t.example, t.exampleZh),
    })),
    grammar: recap.grammar.map((t) => ({
      ...t,
      zh: zh(t.en, t.zh),
      useZh: t.useZh || zh(t.use, t.useZh),
      exampleZh: zh(t.example, t.exampleZh),
    })),
    lines: recap.lines.map((t) => ({
      ...t,
      zh: zh(t.en, t.zh),
      useZh: t.useZh || zh(t.use, t.useZh),
      exampleZh: zh(t.example, t.exampleZh),
    })),
  };
}

function clipPair(en: string, zh: string): RecapPair {
  return { en: clip(en, 400), zh: clip(zh, 180) };
}

/** Live + saved DeepSearch is keyed by coach card id only. Same topic ≠ same essay. */
export function essayOf(
  card: { id: string; topic?: string },
  essays: Record<string, TopicEssay>,
): TopicEssay | undefined {
  if (card.id && essays[card.id]) return essays[card.id];
  return undefined;
}

export function packCoach(
  cards: CoachCard[],
  essays: Record<string, TopicEssay>,
): RecapCoach[] {
  const out: RecapCoach[] = [];
  for (const c of cards) {
    const topic = c.topic.trim();
    if (!topic) continue;
    const raw = essayOf(c, essays);
    const deep: RecapDeep | null =
      raw && !raw.draft && (raw.viewEn || raw.facts.length || raw.aEn)
        ? {
            title: raw.title,
            contextEn: raw.contextEn,
            contextZh: raw.contextZh,
            viewEn: raw.viewEn,
            viewZh: raw.viewZh,
            facts: raw.facts.map((t) => clipPair(t.en, t.zh)),
            angles: raw.angles.map((t) => clipPair(t.en, t.zh)),
            aEn: raw.aEn,
            aZh: raw.aZh,
            terms: raw.terms.map((t) => clipPair(t.en, t.zh)),
            frames: raw.frames.map((t) => clipPair(t.en, t.zh)),
          }
        : null;
    out.push({
      topic,
      topicZh: c.topicZh,
      briefEn: c.briefEn,
      briefZh: c.briefZh,
      move: c.move,
      mode: c.mode,
      options: c.options.slice(0, 3),
      extras: c.extras.slice(0, 2),
      deep,
    });
  }
  return out.slice(-PACK_KEEP);
}

export function extractStars(text: string) {
  const out: string[] = [];
  for (const m of text.matchAll(/\*([^*]{3,40})\*/g)) {
    const t = m[1].trim();
    if (t && !isGlue(t)) out.push(t);
  }
  return [...new Set(out)];
}

/** Coach stays in Part 3. Never copy replies into the class essay or the word list. */
export function attachCoachPack(recap: ClassRecap, pack: RecapCoach[]): ClassRecap {
  return {
    ...recap,
    coachPack: pack.length ? pack : recap.coachPack ?? [],
    draft: !isFilled(recap),
    at: Date.now(),
  };
}

export function writtenBody(body: string) {
  return body.replace(/\s+/g, " ").trim().length > 80 && hasProseParagraph(body);
}

export function classSourceNeedles(input: {
  notes?: string[];
  briefs?: string[];
  facts?: string[];
  terms?: string[];
}) {
  const out: string[] = [];
  const push = (raw: string) => {
    const t = raw.replace(/\s+/g, " ").trim();
    if (t.length < 4) return;
    if (isGlue(t)) return;
    out.push(t);
  };
  for (const n of input.notes ?? []) push(n);
  for (const b of input.briefs ?? []) push(b);
  for (const f of input.facts ?? []) push(f);
  for (const t of input.terms ?? []) push(t);
  return [...new Set(out)].slice(0, 16);
}

function needleHits(hay: string, n: string) {
  const raw = n.toLowerCase();
  if (raw.length >= 4 && hay.includes(raw)) return true;
  const bits = raw
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
  if (bits.some((w) => hay.includes(w))) return true;
  const cjk = raw.match(/[\u4e00-\u9fff]{3,}/g) ?? [];
  return cjk.some((w) => hay.includes(w));
}

export function essayUsesSources(recap: ClassRecap, needles: string[]) {
  if (!needles.length) return true;
  const hay = [recap.lede, recap.ledeZh, ...recap.sections.flatMap((s) => [s.body, s.bodyZh, s.heading])]
    .join("\n")
    .toLowerCase();
  return needles.some((n) => needleHits(hay, n));
}

export function essayPastesCoachOpenings(recap: ClassRecap, say: string[]) {
  const lines = say.map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 24);
  if (!lines.length) return false;
  const hay = recap.sections.map((s) => s.body.toLowerCase()).join("\n");
  return lines.some((s) => hay.includes(s.toLowerCase()));
}

export function classStudyHay(input: { tape?: string[]; notes?: string[]; say?: string[]; essay?: string }) {
  return [...(input.tape ?? []), ...(input.notes ?? []), ...(input.say ?? []), input.essay ?? ""]
    .join("\n")
    .toLowerCase();
}

export function studyPointsAtClass(row: RecapStudy, hay: string) {
  if (!studyRowReady(row)) return false;
  if (!hay.trim()) return true;
  const en = row.en.toLowerCase();
  if (en.length >= 3 && hay.includes(en)) return true;
  const words = en.split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));
  return words.some((w) => hay.includes(w));
}

export function keepClassStudy(recap: ClassRecap, hay: string): ClassRecap {
  if (!hay.trim()) return recap;
  const keep = (rows: RecapStudy[]) => rows.filter((r) => studyPointsAtClass(r, hay));
  const next = {
    ...recap,
    words: keep(recap.words),
    collos: keep(recap.collos),
    patterns: keep(recap.patterns),
    grammar: keep(recap.grammar),
    lines: keep(recap.lines),
  };
  next.draft = !isFilled(next);
  return next;
}

export type RecapCoachBits = {
  topic?: string;
  brief?: string;
  briefZh?: string;
  say?: string[];
  extras?: string[];
  deep?: {
    title?: string;
    viewEn?: string;
    facts?: string[];
    terms?: string[];
    aEn?: string;
  } | null;
};

export function coachOpeningsOf(coach: RecapCoachBits[]) {
  return coach.flatMap((c) => [...(c.say ?? []), ...(c.extras ?? [])]);
}

export function classNeedlesOf(input: { notes?: string[]; coach?: RecapCoachBits[] }) {
  const coach = input.coach ?? [];
  return classSourceNeedles({
    notes: input.notes ?? [],
    briefs: coach.flatMap((c) => [c.topic ?? "", c.brief ?? "", c.briefZh ?? ""]),
    facts: coach.flatMap((c) => [...(c.deep?.facts ?? []), c.deep?.title ?? "", c.deep?.viewEn ?? ""]),
    terms: coach.flatMap((c) => c.deep?.terms ?? []),
  });
}

/** Essay is a paper for THIS hour: prose, sources in, coach openings out. */
export function essayReadyForClass(
  recap: ClassRecap,
  input: { notes?: string[]; coach?: RecapCoachBits[] },
) {
  if (!isEssayFilled(recap)) return false;
  if (essayPastesCoachOpenings(recap, coachOpeningsOf(input.coach ?? []))) return false;
  if (!essayUsesSources(recap, classNeedlesOf(input))) return false;
  return true;
}

export function studyHayFromClass(input: {
  tape?: { en: string }[];
  notes?: string[];
  coach?: RecapCoachBits[];
  recap?: ClassRecap;
}) {
  const coach = input.coach ?? [];
  const recap = input.recap;
  return classStudyHay({
    tape: (input.tape ?? []).map((l) => l.en),
    notes: input.notes ?? [],
    say: coach.flatMap((c) => [
      c.topic ?? "",
      c.brief ?? "",
      ...(c.say ?? []),
      ...(c.extras ?? []),
      c.deep?.title ?? "",
      c.deep?.viewEn ?? "",
      c.deep?.aEn ?? "",
      ...(c.deep?.facts ?? []),
      ...(c.deep?.terms ?? []),
    ]),
    essay: recap
      ? [recap.lede, recap.ledeZh, ...recap.sections.flatMap((s) => [s.heading, s.body, s.bodyZh])].join("\n")
      : "",
  });
}

export type DrillCard = {
  id: string;
  sessionId: string;
  kind: string;
  en: string;
  zh: string;
  use: string;
  useZh: string;
  example: string;
  exampleZh: string;
};

export function collectDrillCards(
  sessions: { id: string; recap?: ClassRecap | null }[],
  onlyId?: string,
): DrillCard[] {
  const bags: [string, "words" | "collos" | "patterns" | "grammar" | "lines"][] = [
    ["单词", "words"],
    ["搭配", "collos"],
    ["句式", "patterns"],
    ["语法", "grammar"],
    ["句子", "lines"],
  ];
  const out: DrillCard[] = [];
  for (const s of sessions) {
    if (onlyId && s.id !== onlyId) continue;
    const recap = s.recap;
    if (!recap) continue;
    for (const [kind, key] of bags) {
      for (const it of recap[key]) {
        if (!it.en.trim()) continue;
        out.push({
          id: `${s.id}-${kind}-${it.en}`,
          sessionId: s.id,
          kind,
          en: it.en,
          zh: it.zh,
          use: it.use,
          useZh: it.useZh,
          example: it.example,
          exampleZh: it.exampleZh,
        });
      }
    }
  }
  return out;
}

function writtenZh(body: string) {
  return body.replace(/\s+/g, " ").trim().length > 40;
}

export function studyRowReady(row: RecapStudy) {
  return Boolean(
    row.en.trim() &&
      row.zh.trim() &&
      (row.use ?? "").trim() &&
      (row.example ?? "").trim(),
  );
}

export function isEssayFilled(recap: ClassRecap) {
  const ledeOk = (recap.lede ?? "").trim().length > 40 && writtenZh(recap.ledeZh ?? "");
  const bilingual = recap.sections.filter(
    (s) => writtenBody(s.body) && writtenZh(s.bodyZh ?? "") && !looksLikeHeardFragment(s.heading),
  );
  return ledeOk && bilingual.length >= 2;
}

export function lexiconReady(recap: ClassRecap) {
  return [...recap.words, ...recap.collos].filter(studyRowReady).length >= 2;
}

export function isStudyFilled(recap: ClassRecap) {
  const rows = [...recap.words, ...recap.collos, ...recap.patterns, ...recap.grammar, ...recap.lines];
  return rows.filter(studyRowReady).length >= 4 && lexiconReady(recap);
}

export function isFilled(recap: ClassRecap) {
  return isEssayFilled(recap) && isStudyFilled(recap);
}

/** Merge model JSON without letting an outline-only object wipe real sections. */
export function mergeAiJson(a: Record<string, unknown>, b: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

export function scoreContentJson(ai: Record<string, unknown>) {
  const lede = typeof ai.lede === "string" ? ai.lede.trim().length : 0;
  const sections = Array.isArray(ai.sections) ? ai.sections : [];
  let body = 0;
  let n = 0;
  for (const row of sections) {
    if (!row || typeof row !== "object") continue;
    const text = typeof (row as { body?: unknown }).body === "string" ? (row as { body: string }).body : "";
    if (writtenBody(text)) {
      n += 1;
      body += text.trim().length;
    }
  }
  return lede + body + n * 80;
}

export function pickRicherJson(a: Record<string, unknown>, b: Record<string, unknown>) {
  return scoreContentJson(b) > scoreContentJson(a) ? b : a;
}
