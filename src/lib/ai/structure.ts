import { createServerFn } from "@tanstack/react-start";
import { extractJsonObject } from "@/lib/json-object";
import { takeAiToken } from "./bucket";
import { aiFail, type AiFail } from "./errors";
import { aiGuard } from "./guard";
import { chatFlash } from "./llm/transport";
import { hasHan, parsePairs, pick } from "./parse";
import { CATCH_UP_SYS, SEGMENT_SYS } from "./prompts";

/**
 * The 课程脉络's two server calls. Both are the fastest model, both are small:
 * a segment is written up once when it closes (a handful of times an hour),
 * a catch-up only when the student asks.
 */

const cleanLines = (input: unknown, max: number) =>
  Array.isArray(input)
    ? input
        .slice(-max)
        .map((l) => ({
          en: String((l as { en?: unknown })?.en ?? "")
            .trim()
            .slice(0, 240),
          zh: String((l as { zh?: unknown })?.zh ?? "")
            .trim()
            .slice(0, 160),
        }))
        .filter((l) => l.en)
    : [];

const cleanStrings = (input: unknown, max: number, len: number) =>
  Array.isArray(input) ? input.map((s) => String(s).trim().slice(0, len)).filter(Boolean).slice(-max) : [];

/** One closed stretch → heading, claims, todo. */
export const writeSegment = createServerFn({ method: "POST" })
  .validator(
    (input: {
      lines: { en: string; zh: string }[];
      coach: { topic: string; brief: string }[];
      notes: string[];
    }) => ({
      lines: cleanLines(input?.lines, 60),
      coach: Array.isArray(input?.coach)
        ? input.coach
            .slice(-8)
            .map((c) => ({
              topic: String(c?.topic ?? "").slice(0, 80),
              brief: String(c?.brief ?? "").slice(0, 240),
            }))
            .filter((c) => c.topic || c.brief)
        : [],
      notes: cleanStrings(input?.notes, 8, 160),
    }),
  )
  .middleware([aiGuard])
  .handler(async ({ data, context }): Promise<
    | {
        ok: true;
        heading: string;
        headingZh: string;
        claims: { en: string; zh: string }[];
        todo: { en: string; zh: string }[];
        ms: number;
      }
    | AiFail
  > => {
    const gate = takeAiToken(context.caller, "segment");
    if (!gate.ok) return aiFail("rate_limited");
    if (data.lines.length < 3) return aiFail("too_short");
    const result = await chatFlash({
      system: SEGMENT_SYS,
      user: JSON.stringify({ transcript: data.lines, coach: data.coach, student_notes: data.notes }),
      maxTokens: 500,
      temperature: 0.2,
      timeoutMs: 12000,
      json: true,
      tag: "segment",
    });
    if (!result.ok) return result;
    const parsed = extractJsonObject(result.text);
    const heading = pick(parsed, "heading").slice(0, 80);
    if (!heading) return aiFail("no_content");
    const headingZh = pick(parsed, "headingZh").slice(0, 40);
    return {
      ok: true,
      heading,
      headingZh: hasHan(headingZh) ? headingZh : "",
      claims: parsePairs(parsed?.claims, 3),
      todo: parsePairs(parsed?.todo, 3),
      ms: result.ms,
    };
  });

/** 「刚才讲了什么」: the last few minutes in three 简体 lines. */
export const catchUp = createServerFn({ method: "POST" })
  .validator(
    (input: { lines: { en: string; zh: string }[]; topic: string; before: string[] }) => ({
      lines: cleanLines(input?.lines, 60),
      topic: String(input?.topic ?? "").slice(0, 80),
      before: cleanStrings(input?.before, 3, 200),
    }),
  )
  .middleware([aiGuard])
  .handler(async ({ data, context }): Promise<
    { ok: true; topic: string; topicZh: string; lines: string[]; ms: number } | AiFail
  > => {
    const gate = takeAiToken(context.caller, "catchup");
    if (!gate.ok) return aiFail("rate_limited");
    if (data.lines.length < 3) return aiFail("too_short");
    const result = await chatFlash({
      system: CATCH_UP_SYS,
      user: JSON.stringify({ transcript: data.lines, topic: data.topic || null, before: data.before }),
      maxTokens: 320,
      temperature: 0.2,
      timeoutMs: 10000,
      json: true,
      tag: "catchup",
    });
    if (!result.ok) return result;
    const parsed = extractJsonObject(result.text);
    const lines = Array.isArray(parsed?.lines)
      ? parsed.lines
          .map((l) => String(l).trim().slice(0, 80))
          .filter((l) => hasHan(l))
          .slice(0, 3)
      : [];
    if (!lines.length) return aiFail("no_zh");
    const topicZh = pick(parsed, "topicZh").slice(0, 40);
    return {
      ok: true,
      topic: pick(parsed, "topic").slice(0, 80),
      topicZh: hasHan(topicZh) ? topicZh : "",
      lines,
      ms: result.ms,
    };
  });
