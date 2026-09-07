import type { ClassRecap, CoachCard, RecapCoach, RecapDeep, RecapPair, RecapSection, RecapStudy, TopicEssay } from "@/lib/types";
import { topicKey } from "@/lib/utils";

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
  const p = paras.map((x) => clip(x, 420)).filter(Boolean);
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
    if (/^\d+[\.)]\s+/.test(line)) points.push(line.replace(/^\d+[\.)]\s+/, ""));
    else if (/^[-•]\s+/.test(line)) points.push(line.replace(/^[-•]\s+/, ""));
    else paras.push(line);
  }
  return formatBody(paras.slice(0, 2), points.slice(0, 4));
}

export const GOLD_CONTENT = `You have read the FULL class: live transcript, student notes, coach cards, DeepSearch.
Write the CONTENT half of a teaching 讲义 (handout) for a mainland student who was in this English class.
Synthesize the hour: the argument, the tension, examples, any DeepSearch facts (names, numbers) that belong, anything in the notes they wanted kept.
Do NOT reprint the coach's numbered 3+2 replies — those stay in a speaking appendix. You may teach the same ideas as claims.
title = 3-8 English words.
lede + ledeZh: 2-3 sentences, the point of the hour.
sections: one per theme. headingZh = 简体. body = paragraph + 1. 2. 3.
Star *only* what you would underline on the handout.
bodyZh = 简体 of that body. No stars in Chinese.
takeaways: 4 bilingual claims worth keeping.
REWRITE noisy STT. You are the teacher who just sat through the class.`;

export const GOLD_STUDY = `You have the same full class (transcript, notes, coach, DeepSearch) plus the 讲义 content just written.
Write the LANGUAGE half of the handout. YOU decide: words to take home, harder upgrades, collocations, what to underline, patterns worth stealing — including useful language from coach/DeepSearch, taught as study items (usage + example), not pasted replies.
marks = exact short strings (1-4 words) to underline in the essay.
Every study row: en, zh (precise 简体), use (how THIS class used it), useZh, example (clean 12-22 word sentence), exampleZh.
skills = speaking frames for this topic, not a copy of the 3 coach lines.`;

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

const BASIC = new Set(
  "people time year years company companies money make take good new old big small work working want need going really actually something things thing world jobs job life live living talk talking think thinking like just very much many also because about after before still even well right look come give get got see know known say said tell told use used using way ways part parts kind kinds lot lots bit stuff maybe perhaps basically honestly public private long short high low next last first second point points idea ideas problem problems question questions answer answers class student teacher english chinese today week month today tomorrow pressure pressures result results strong future focus support often show grow growing build building human earth moon mars view views goal goals investor investors thinking think",
);

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

export function isBasic(en: string) {
  if (isGlue(en)) return true;
  const parts = en
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return true;
  if (parts.length === 1) return BASIC.has(parts[0]) || (parts[0].length < 5 && !/-/.test(en));
  const content = parts.filter((p) => !STOP.has(p));
  if (!content.length) return true;
  if (content.length <= 2 && content.every((p) => BASIC.has(p) || STOP.has(p))) return true;
  return false;
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
  if (!heading || heading.split(/\s+/).length > 12) return null;
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
  if (!body) return null;
  return {
    heading: clip(heading, 72),
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
  const title = typeof ai.title === "string" && ai.title.trim() ? ai.title.trim() : base.title;
  const lede = typeof ai.lede === "string" && ai.lede.trim() ? ai.lede.trim() : "";
  const ledeZh = typeof ai.ledeZh === "string" && ai.ledeZh.trim() ? ai.ledeZh.trim() : "";
  const filled = sections.some((s) => s.body.length > 40);
  const promoted = filled
    ? sections
    : outline
        .map((o) => {
          const para = o.bullets.length ? `${o.heading}. ${o.bullets.join(" ")}` : "";
          const body = formatBody(para ? [para] : [], o.bullets);
          return body
            ? {
                heading: o.heading,
                headingZh: "",
                body,
                bodyZh: "",
              }
            : null;
        })
        .filter((s): s is RecapSection => Boolean(s));
  const useSections = filled ? sections : promoted;
  const useLede =
    lede ||
    (useSections[0]?.body ? useSections[0].body.split("\n")[0] ?? "" : "");
  const marks = [
    ...((Array.isArray(ai.marks) ? ai.marks : []) as unknown[])
      .map((m) => String(m ?? "").trim())
      .filter((m) => m.length >= 3 && m.split(/\s+/).length <= 4 && !isGlue(m)),
    ...extractStars(lede),
    ...useSections.flatMap((s) => extractStars(s.body)),
  ];
  return {
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
    draft: !(lede.trim().length > 40 && useSections.some((s) => s.body.length > 80)),
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
    if (s.body && !s.bodyZh) add(clip(s.body, 280), s.bodyZh);
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

export function packCoach(
  cards: CoachCard[],
  essays: Record<string, TopicEssay>,
): RecapCoach[] {
  const seen = new Set<string>();
  const out: RecapCoach[] = [];
  for (const c of cards) {
    const topic = c.topic.trim();
    if (!topic) continue;
    const k = topicKey(topic) || c.id;
    if (seen.has(k)) continue;
    seen.add(k);
    const raw = essays[k] ?? essays[c.id] ?? essays[topicKey(topic)];
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
      options: c.options.slice(0, 3),
      extras: c.extras.slice(0, 2),
      deep,
    });
  }
  return out.slice(0, 16);
}

export function extractStars(text: string) {
  const out: string[] = [];
  for (const m of text.matchAll(/\*([^*]{3,40})\*/g)) {
    const t = m[1].trim();
    if (t && !isBasic(t)) out.push(t);
  }
  return [...new Set(out)];
}

function scoreToken(w: string) {
  let s = 0;
  if (w.length >= 10) s += 4;
  else if (w.length >= 8) s += 3;
  else if (w.length >= 6) s += 1;
  if (/-/.test(w)) s += 3;
  if (/(tion|sion|ment|ness|ility|izing|ised|ized|ous|ical|ance|ence|atory|ative|ual)$/i.test(w)) s += 3;
  if (/^[A-Z]{2,5}$/.test(w)) s += 4;
  if (/^[A-Z][a-z]{4,}/.test(w)) s += 1;
  return s;
}

/** Hard-word hints for the study model. Not a frequency list. */
export function studyHints(tape: { en: string; zh: string }[]) {
  const scored = new Map<string, number>();
  for (const row of tape) {
    const en = row.en.replace(/\s+/g, " ").trim();
    for (const w of en.match(/\b[A-Za-z][A-Za-z'-]{3,}\b/g) ?? []) {
      if (isBasic(w)) continue;
      const s = scoreToken(w);
      if (s < 3) continue;
      const k = /[A-Z]{2,}/.test(w) ? w : w.toLowerCase();
      scored.set(k, Math.max(scored.get(k) ?? 0, s));
    }
    for (const p of en.match(/\b[A-Za-z][A-Za-z'-]{3,}\s+[A-Za-z][A-Za-z'-]{3,}\b/g) ?? []) {
      if (isBasic(p)) continue;
      const parts = p.split(/\s+/);
      const s = parts.reduce((n, w) => n + scoreToken(w), 2);
      if (s < 4) continue;
      scored.set(p.toLowerCase(), Math.max(scored.get(p.toLowerCase()) ?? 0, s));
    }
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .slice(0, 16);
}

export function studyFromTape(tape: { en: string; zh: string }[]): {
  words: RecapStudy[];
  collos: RecapStudy[];
  lines: RecapStudy[];
} {
  const hints = studyHints(tape);
  const lineOf = (h: string) =>
    tape.find((t) => t.en.toLowerCase().includes(h.toLowerCase())) ?? { en: "", zh: "" };
  const toRow = (en: string): RecapStudy => {
    const hit = lineOf(en);
    return {
      en,
      zh: "",
      use: "",
      useZh: "",
      example: hit.en,
      exampleZh: hit.zh,
    };
  };
  return {
    words: uniqStudy(
      hints.filter((h) => !h.includes(" ")).map(toRow),
      8,
    ),
    collos: uniqStudy(
      hints.filter((h) => h.includes(" ") || h.includes("-")).map(toRow),
      6,
    ),
    lines: uniqStudy(
      tape
        .filter((t) => t.en.length >= 40 && t.en.length <= 140 && !isGlue(t.en))
        .slice(0, 5)
        .map((t) => ({
          en: t.en,
          zh: t.zh,
          use: "",
          useZh: "",
          example: t.en,
          exampleZh: t.zh,
        })),
      4,
    ),
  };
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

export function isFilled(recap: ClassRecap) {
  const ledeOk = (recap.lede ?? "").trim().length > 40;
  const bodyOk = recap.sections.some((s) => s.body.replace(/\s+/g, " ").trim().length > 80);
  return ledeOk && bodyOk;
}
