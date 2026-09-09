import { createServerFn } from "@tanstack/react-start";
import { parseClassMode } from "@/lib/class-mode";
import { extractJsonObject } from "@/lib/json-object";
import {
  applyZh,
  assembleRecap,
  compactTape,
  emptyRecap,
  essayReadyForClass,
  isFilled,
  isStudyFilled,
  keepClassStudy,
  mergeAiJson,
  missingZh,
  pickRicherJson,
  scoreContentJson,
  spread,
  studyHayFromClass,
} from "@/lib/recap-kit";
import type { RecapStudy, RecapTable } from "@/lib/types";
import { takeAiToken } from "./bucket";
import { aiFail, type AiFail } from "./errors";
import { aiGuard } from "./guard";
import { chatFlash, chatReasoning } from "./llm/transport";

/**
 * How many compacted lines of the hour the model reads. Spread over the whole
 * class (see `spread`), so a 300-line lecture is read from start to end, not
 * from its first minutes. About 12k tokens at the validator's caps, far below
 * either model's window.
 */
export const TAPE_LINES_MAX = 120;

/**
 * Soft ceiling for one `recapClass` call. Each stage is skipped or run without
 * its fallback when it could not finish inside this; a platform cutting the
 * function off would lose every model call already paid for.
 */
export const RECAP_BUDGET_MS = 75_000;
import {
  GLOSS_SYS,
  RECAP_STUDY_AGAIN_SYS,
  recapContentSystem,
  recapSlimSystem,
  recapStudySystem,
} from "./prompts";

type RecapSectionOk = {
  heading: string;
  headingZh: string;
  body: string;
  bodyZh: string;
  table?: RecapTable | null;
};

export type RecapOk = {
  ok: true;
  title: string;
  lede: string;
  ledeZh: string;
  sections: RecapSectionOk[];
  outline: { heading: string; bullets: string[] }[];
  topics: { en: string; zh: string }[];
  patterns: RecapStudy[];
  lines: RecapStudy[];
  words: RecapStudy[];
  collos: RecapStudy[];
  grammar: RecapStudy[];
  skills: { en: string; zh: string }[];
  takeaways: { en: string; zh: string }[];
  marks: string[];
  ms: number;
};

type RecapPrior = {
  title: string;
  lede: string;
  ledeZh: string;
  sections: RecapSectionOk[];
  outline: { heading: string; bullets: string[] }[];
  topics: { en: string; zh: string }[];
  takeaways: { en: string; zh: string }[];
};

function recapToOk(recap: ReturnType<typeof assembleRecap>): RecapOk {
  return {
    ok: true as const,
    title: recap.title,
    lede: recap.lede,
    ledeZh: recap.ledeZh,
    outline: recap.outline,
    sections: recap.sections,
    topics: recap.topics,
    takeaways: recap.takeaways,
    words: recap.words,
    collos: recap.collos,
    patterns: recap.patterns,
    grammar: recap.grammar,
    lines: recap.lines,
    skills: recap.skills,
    marks: recap.marks,
    ms: recap.latencyMs,
  };
}

const STUDY_KEYS = ["marks", "words", "collos", "patterns", "grammar", "lines", "skills"] as const;

function takeStudy(into: Record<string, unknown>, from: Record<string, unknown>) {
  for (const k of STUDY_KEYS) {
    if (Array.isArray(from[k]) && (from[k] as unknown[]).length) into[k] = from[k];
  }
}

/**
 * The handout. Essay: flash and the reasoning model write in parallel, the
 * richer JSON wins; if the gate (`essayReadyForClass`) fails, one slim rewrite;
 * still failing → error, the third attempt is the student's click. Study rows:
 * flash, then the reasoning model if words came back empty, then one targeted
 * retry if the study gate fails, then a gloss pass for missing Chinese.
 */
export const recapClass = createServerFn({ method: "POST" })
  .validator(
    (input: {
      phase?: "essay" | "study" | "all";
      prior?: RecapPrior | null;
      lines: { en: string; zh: string }[];
      topics: string[];
      notes: string[];
      /** The 课程脉络: the hour by topic, each stretch with what was argued in it. */
      segments?: {
        heading: string;
        headingZh?: string;
        from?: number;
        to?: number;
        claims?: string[];
        todo?: string[];
      }[];
      coach?: {
        topic: string;
        brief?: string;
        briefZh?: string;
        say?: string[];
        extras?: string[];
        deep?: {
          title?: string;
          viewEn?: string;
          viewZh?: string;
          facts?: string[];
          terms?: string[];
          aEn?: string;
        } | null;
      }[];
      mode?: "interactive" | "audit" | "listen";
    }) => ({
      lines: Array.isArray(input?.lines)
        ? input.lines
            .slice(-240)
            .map((l) => ({
              en: String(l?.en ?? "")
                .trim()
                .slice(0, 280),
              zh: String(l?.zh ?? "")
                .trim()
                .slice(0, 200),
            }))
            .filter((l) => l.en)
        : [],
      // Topics run in class order; keep a spread so the end of the hour is
      // named too. Notes and cards: the newest, which a head cut used to drop.
      topics: Array.isArray(input?.topics)
        ? spread(input.topics.map((s) => String(s).slice(0, 80)), 8, 2, 3)
        : [],
      notes: Array.isArray(input?.notes)
        ? input.notes.map((s) => String(s).slice(0, 180)).slice(-24)
        : [],
      coach: Array.isArray(input?.coach)
        ? input.coach.slice(-12).map((c) => ({
            topic: String(c?.topic ?? "").slice(0, 80),
            brief: String(c?.brief ?? "").slice(0, 240),
            briefZh: String(c?.briefZh ?? "").slice(0, 160),
            say: Array.isArray(c?.say) ? c.say.map((s) => String(s).slice(0, 140)).slice(0, 3) : [],
            extras: Array.isArray(c?.extras) ? c.extras.map((s) => String(s).slice(0, 140)).slice(0, 2) : [],
            deep: c?.deep
              ? {
                  title: String(c.deep.title ?? "").slice(0, 80),
                  viewEn: String(c.deep.viewEn ?? "").slice(0, 400),
                  viewZh: String(c.deep.viewZh ?? "").slice(0, 240),
                  facts: Array.isArray(c.deep.facts)
                    ? c.deep.facts.map((s) => String(s).slice(0, 180)).slice(0, 4)
                    : [],
                  terms: Array.isArray(c.deep.terms)
                    ? c.deep.terms.map((s) => String(s).slice(0, 40)).slice(0, 6)
                    : [],
                  aEn: String(c.deep.aEn ?? "").slice(0, 400),
                }
              : null,
          }))
        : [],
      segments: Array.isArray(input?.segments)
        ? input.segments
            .slice(0, 12)
            .map((g) => ({
              heading: String(g?.heading ?? "").slice(0, 80),
              headingZh: String(g?.headingZh ?? "").slice(0, 40),
              from: typeof g?.from === "number" ? g.from : 0,
              to: typeof g?.to === "number" ? g.to : 0,
              claims: Array.isArray(g?.claims) ? g.claims.map((c) => String(c).slice(0, 200)).slice(0, 3) : [],
              todo: Array.isArray(g?.todo) ? g.todo.map((c) => String(c).slice(0, 160)).slice(0, 3) : [],
            }))
            .filter((g) => g.heading)
        : [],
      phase: input?.phase === "essay" || input?.phase === "study" ? input.phase : "all",
      prior:
        input?.prior && typeof input.prior === "object"
          ? {
              title: String(input.prior.title ?? "").slice(0, 80),
              lede: String(input.prior.lede ?? "").slice(0, 800),
              ledeZh: String(input.prior.ledeZh ?? "").slice(0, 600),
              sections: Array.isArray(input.prior.sections)
                ? input.prior.sections.slice(0, 6).map((s) => ({
                    heading: String(s?.heading ?? "").slice(0, 80),
                    headingZh: String(s?.headingZh ?? "").slice(0, 80),
                    body: String(s?.body ?? "").slice(0, 2400),
                    bodyZh: String(s?.bodyZh ?? "").slice(0, 1800),
                    table: s?.table ?? null,
                  }))
                : [],
              outline: Array.isArray(input.prior.outline)
                ? input.prior.outline.slice(0, 6).map((o) => ({
                    heading: String(o?.heading ?? "").slice(0, 80),
                    bullets: Array.isArray(o?.bullets)
                      ? o.bullets.map((b) => String(b).slice(0, 160)).slice(0, 4)
                      : [],
                  }))
                : [],
              topics: Array.isArray(input.prior.topics)
                ? input.prior.topics.slice(0, 8).map((t) => ({
                    en: String(t?.en ?? "").slice(0, 80),
                    zh: String(t?.zh ?? "").slice(0, 40),
                  }))
                : [],
              takeaways: Array.isArray(input.prior.takeaways)
                ? input.prior.takeaways.slice(0, 6).map((t) => ({
                    en: String(t?.en ?? "").slice(0, 220),
                    zh: String(t?.zh ?? "").slice(0, 160),
                  }))
                : [],
            }
          : null,
      mode: parseClassMode(input?.mode),
    }),
  )
  .middleware([aiGuard])
  .handler(async ({ data, context }): Promise<RecapOk | AiFail> => {
    const gate = takeAiToken(context.caller, "recap");
    if (!gate.ok) return aiFail("rate_limited");
    if (data.lines.length < 2) return aiFail("too_short");
    const started = Date.now();
    const remaining = () => RECAP_BUDGET_MS - (Date.now() - started);
    // The whole hour, thinned evenly, never just its first minutes.
    const tape = spread(compactTape(data.lines), TAPE_LINES_MAX);
    const clock = (ms: number) => {
      const d = new Date(ms);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };
    const packet = {
      transcript: tape,
      student_notes: data.notes,
      coach_and_deep: data.coach,
      // The hour by topic, as the class ran: the section plan the writer starts from.
      class_structure: data.segments.map((g, i) => ({
        order: i + 1,
        heading: g.heading,
        headingZh: g.headingZh,
        time: g.from && g.to ? `${clock(g.from)}–${clock(g.to)}` : "",
        claims: g.claims,
        todo: g.todo,
      })),
      topics: data.topics.length ? data.topics : data.segments.map((g) => g.heading),
      class_mode: data.mode,
    };
    const base = emptyRecap(data.topics[0] || data.segments[0]?.heading || "Class notes", packet.topics);
    const heard = tape.map((l) => l.en);
    const sources = { notes: data.notes, coach: data.coach };
    const stamp = (ai: Record<string, unknown>) => assembleRecap(base, ai, { heard });
    const closeStudy = (next: ReturnType<typeof stamp>) =>
      keepClassStudy(next, studyHayFromClass({ tape, notes: data.notes, coach: data.coach, recap: next }));

    let parsed: Record<string, unknown> = {};
    let recap = stamp(parsed);
    if (data.phase === "study" && data.prior) {
      parsed = {
        title: data.prior.title,
        lede: data.prior.lede,
        ledeZh: data.prior.ledeZh,
        sections: data.prior.sections,
        outline: data.prior.outline,
        topics: data.prior.topics,
        takeaways: data.prior.takeaways,
      };
      recap = stamp(parsed);
    } else {
      const contentSys = recapContentSystem(data.mode);
      const userPacket = JSON.stringify(packet);
      const [content, grok] = await Promise.all([
        chatFlash({
          system: contentSys,
          user: userPacket,
          maxTokens: 4000,
          temperature: 0.2,
          timeoutMs: 20000,
          json: true,
          tag: "recap.essay.flash",
        }),
        chatReasoning({
          system: contentSys,
          user: userPacket,
          maxTokens: 4000,
          temperature: 0.2,
          timeoutMs: 28000,
          // The flash leg is already running beside this one; a fallback
          // would run the same prompt a third time.
          fallback: false,
          json: true,
          tag: "recap.essay",
        }),
      ]);
      const fromFlash = content.ok ? (extractJsonObject(content.text) ?? {}) : {};
      const fromGrok = grok.ok ? (extractJsonObject(grok.text) ?? {}) : {};
      parsed = pickRicherJson(fromFlash, mergeAiJson(fromFlash, fromGrok));
      recap = stamp(parsed);
      recap.latencyMs = Math.max(content.ok ? content.ms : 0, grok.ok ? grok.ms : 0);
      if (!essayReadyForClass(recap, sources) && remaining() > 30_000) {
        const segmentHeads = data.segments.map((g) => g.heading).slice(0, 4);
        const outlineHeads = recap.outline.map((o) => o.heading).filter(Boolean).slice(0, 4);
        const heads = segmentHeads.length ? segmentHeads : outlineHeads.length ? outlineHeads : data.topics.slice(0, 4);
        const slim = await chatReasoning({
          system: recapSlimSystem(),
          user: JSON.stringify({ headings: heads, packet }),
          maxTokens: 3600,
          temperature: 0.2,
          timeoutMs: 28000,
          fallback: remaining() > 50_000 ? { timeoutMs: 20000 } : false,
          json: true,
          tag: "recap.essay.slim",
        });
        if (slim.ok) {
          const merged = mergeAiJson(parsed, extractJsonObject(slim.text) ?? {});
          const before = essayReadyForClass(stamp(parsed), sources);
          const after = essayReadyForClass(stamp(merged), sources);
          // Take the rewrite when it passes or when both fail and it is fuller.
          parsed = after || (!before && scoreContentJson(merged) >= scoreContentJson(parsed)) ? merged : parsed;
          recap = stamp(parsed);
          recap.latencyMs += slim.ms;
        }
      }
    }
    if (!essayReadyForClass(recap, sources)) return aiFail("essay_failed");
    if (data.phase === "essay") return recapToOk(recap);

    const studySys = recapStudySystem(data.mode);
    const studyUser = JSON.stringify({
      packet,
      recap: {
        lede: recap.lede,
        sections: recap.sections.map((s) => ({ heading: s.heading, body: s.body })),
      },
    });
    let study = await chatFlash({
      system: studySys,
      user: studyUser,
      maxTokens: 2800,
      temperature: 0.25,
      timeoutMs: 20000,
      json: true,
      tag: "recap.study.flash",
    });
    let studyParsed = study.ok ? (extractJsonObject(study.text) ?? {}) : {};
    const studyHasWords =
      Array.isArray(studyParsed.words) &&
      (studyParsed.words as { zh?: string; use?: string }[]).some((w) => w && (w.zh || w.use));
    if (!studyHasWords && remaining() > 26_000) {
      study = await chatReasoning({
        system: studySys,
        user: studyUser,
        maxTokens: 2800,
        temperature: 0.2,
        timeoutMs: 24000,
        fallback: remaining() > 46_000 ? { timeoutMs: 20000 } : false,
        json: true,
        tag: "recap.study",
      });
      if (study.ok) studyParsed = extractJsonObject(study.text) ?? studyParsed;
    }
    takeStudy(parsed, studyParsed);
    recap = closeStudy(stamp(parsed));
    recap.latencyMs += study.ok ? study.ms : 0;
    if (!isStudyFilled(recap) && remaining() > 26_000) {
      const again = await chatReasoning({
        system: RECAP_STUDY_AGAIN_SYS,
        user: studyUser,
        maxTokens: 2800,
        temperature: 0.2,
        timeoutMs: 24000,
        fallback: remaining() > 46_000 ? { timeoutMs: 20000 } : false,
        json: true,
        tag: "recap.study.again",
      });
      if (again.ok) {
        takeStudy(parsed, extractJsonObject(again.text) ?? {});
        recap = closeStudy(stamp(parsed));
        recap.latencyMs += again.ms;
      }
    }
    if (!isFilled(recap)) return aiFail("study_failed");
    recap.draft = false;
    const miss = missingZh(recap);
    if (miss.length && remaining() > 10_000) {
      const gloss = await chatFlash({
        system: GLOSS_SYS,
        user: JSON.stringify({ items: miss }),
        maxTokens: 900,
        timeoutMs: 8000,
        json: true,
        tag: "recap.gloss",
      });
      if (gloss.ok) {
        const g = extractJsonObject(gloss.text);
        const items = Array.isArray(g?.items) ? g.items : [];
        const map: Record<string, string> = {};
        for (const it of items) {
          if (!it || typeof it !== "object") continue;
          const row = it as { en?: unknown; zh?: unknown };
          const en = typeof row.en === "string" ? row.en : "";
          const zh = typeof row.zh === "string" ? row.zh.trim() : "";
          if (en && zh) {
            map[en] = zh;
            map[en.toLowerCase()] = zh;
          }
        }
        recap = applyZh(recap, map);
      }
    }
    return recapToOk(recap);
  });

