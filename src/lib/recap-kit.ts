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

export const GOLD_CONTENT = `coach_topics are the CONTENTS. Write the ESSAY under each heading — listing headings only is a failure.
title = 3-8 English words.
lede + ledeZh: 2-3 sentences of what the hour was ABOUT. 简体中文.
One section per coach_topic (3-5). heading matches the topic. headingZh = 简体.
body = 1 rewritten paragraph (claims, not STT) + blank line + 1. 2. 3. distinct points. Mark *topic terms*.
bodyZh MUST translate THAT body into 简体中文. Never borrow a caption from another line.
takeaways: 4 bilingual claims. zh = 简体 of en.
Transcript is noisy STT with repeats — REWRITE, never paste fragments.`;

export const GOLD_STUDY = `Topic vocabulary only. FORBIDDEN as words: think, like, really, people, much, other, it's, yeah, yes, well, just, kind, thing, world, jobs, hello, subscribe.
Each row: {"en":"...","zh":"gloss of en","use":"how to use","useZh":"...","example":"one clean classroom sentence","exampleZh":"translation of that sentence"}.
words=8 topic nouns/verbs. collos=6 (verb+noun or adj+noun). patterns=5. grammar=4. lines=5 steal-able sentences. skills=3.`;

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
    if (w.length < 4) return true;
    if (/^(it's|that's|don't|didn't|there's|they're|we're|you're)$/.test(w)) return true;
  }
  if (parts.every((p) => STOP.has(p))) return true;
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
    coachPack: base.coachPack ?? [],
    draft: !useSections.length,
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
  }
  for (const t of [...recap.topics, ...recap.takeaways, ...recap.skills]) add(t.en, t.zh);
  for (const t of [...recap.words, ...recap.collos, ...recap.patterns, ...recap.grammar, ...recap.lines]) {
    add(t.en, t.zh);
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
    })),
    topics: recap.topics.map((t) => ({ ...t, zh: zh(t.en, t.zh) })),
    takeaways: recap.takeaways.map((t) => ({ ...t, zh: zh(t.en, t.zh) })),
    skills: recap.skills.map((t) => ({ ...t, zh: zh(t.en, t.zh) })),
    words: recap.words.map((t) => ({ ...t, zh: zh(t.en, t.zh), exampleZh: zh(t.example, t.exampleZh) })),
    collos: recap.collos.map((t) => ({ ...t, zh: zh(t.en, t.zh), exampleZh: zh(t.example, t.exampleZh) })),
    patterns: recap.patterns.map((t) => ({ ...t, zh: zh(t.en, t.zh), exampleZh: zh(t.example, t.exampleZh) })),
    grammar: recap.grammar.map((t) => ({ ...t, zh: zh(t.en, t.zh), exampleZh: zh(t.example, t.exampleZh) })),
    lines: recap.lines.map((t) => ({ ...t, zh: zh(t.en, t.zh), exampleZh: zh(t.example, t.exampleZh) })),
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

function studyFromPack(pack: RecapCoach[]): RecapStudy[] {
  const rows: RecapStudy[] = [];
  for (const c of pack) {
    for (const o of [...c.options, ...c.extras]) {
      for (const k of o.keys ?? []) {
        if (!k.trim() || isGlue(k)) continue;
        rows.push({
          en: k.trim(),
          zh: "",
          use: "Heard in coach.",
          useZh: "课中教练。",
          example: o.en,
          exampleZh: o.zh,
        });
      }
    }
    for (const t of c.deep?.terms ?? []) {
      if (!t.en || isGlue(t.en)) continue;
      rows.push({
        en: t.en,
        zh: t.zh,
        use: "DeepSearch",
        useZh: "检索",
        example: c.deep?.aEn ?? "",
        exampleZh: c.deep?.aZh ?? "",
      });
    }
  }
  return uniqStudy(rows, 10);
}

/** If the model missed a topic, the assembler writes from the live coach card. */
export function fillFromCoach(recap: ClassRecap, pack: RecapCoach[]): ClassRecap {
  if (!pack.length && recap.lede) return { ...recap, coachPack: recap.coachPack ?? [] };
  const sections = recap.sections.map((s) => ({ ...s }));
  for (const c of pack) {
    const hit = sections.find(
      (s) =>
        s.heading.toLowerCase() === c.topic.toLowerCase() ||
        s.heading.toLowerCase().includes(c.topic.toLowerCase().slice(0, 16)),
    );
    const points = c.options
      .slice(0, 3)
      .map((o, i) => `${i + 1}. ${o.en}`)
      .join("\n");
    const pointsZh = c.options
      .slice(0, 3)
      .map((o, i) => `${i + 1}. ${o.zh}`)
      .filter((l) => /[\u4e00-\u9fff]/.test(l))
      .join("\n");
    const body = [c.briefEn, points].filter(Boolean).join("\n\n");
    const bodyZh = [c.briefZh, pointsZh].filter(Boolean).join("\n\n");
    if (hit) {
      if (!hit.body) hit.body = body;
      if (!hit.bodyZh) hit.bodyZh = bodyZh;
      if (!hit.headingZh) hit.headingZh = c.topicZh;
    } else if (body) {
      sections.push({
        heading: c.topic,
        headingZh: c.topicZh,
        body,
        bodyZh,
      });
    }
  }
  const lede =
    recap.lede ||
    pack
      .slice(0, 2)
      .map((c) => c.briefEn)
      .filter(Boolean)
      .join(" ");
  const ledeZh =
    recap.ledeZh ||
    pack
      .slice(0, 2)
      .map((c) => c.briefZh)
      .filter(Boolean)
      .join(" ");
  const outline = recap.outline.length
    ? recap.outline
    : pack.map((c) => ({
        heading: c.topic,
        bullets: c.options.slice(0, 2).map((o) => o.en).filter(Boolean),
      }));
  const topics = recap.topics.length
    ? recap.topics
    : pack.map((c) => ({ en: c.topic, zh: c.topicZh }));
  return {
    ...recap,
    lede,
    ledeZh,
    sections,
    outline,
    topics,
    words: recap.words.length ? recap.words : studyFromPack(pack),
    coachPack: pack.length ? pack : recap.coachPack ?? [],
    draft: !(lede || sections.length || pack.length),
    at: Date.now(),
  };
}
