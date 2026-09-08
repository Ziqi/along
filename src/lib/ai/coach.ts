import { createServerFn } from "@tanstack/react-start";
import { assembleCoach } from "@/lib/coach-assemble";
import { extractJsonObject } from "@/lib/json-object";
import { COACH_FALLBACK_MS, COACH_PRIMARY_MS } from "@/lib/live-queue";
import { takeAiToken } from "./bucket";
import { aiFail, type AiFail } from "./errors";
import { aiGuard } from "./guard";
import { chatFlash, chatReasoning } from "./llm/transport";
import { coachSystem } from "./prompts";

export type CoachLine = { label: string; en: string; zh: string; keys: string[] };

export type CoachOk = {
  ok: true;
  same: boolean;
  topic: string;
  topicZh: string;
  briefZh: string;
  briefEn: string;
  move: "answer" | "join";
  options: CoachLine[];
  extras: CoachLine[];
  ms: number;
};

const parseMode = (v: unknown) =>
  v === "audit" || v === "listen" || v === "interactive" ? v : "interactive";

/**
 * One coach card for the latest beat: reasoning model first, flash on failure,
 * and the assembler stamps the three labels the class mode requires. A card
 * with fewer than three real openings is a failure, never a padded card.
 */
export const liveCoach = createServerFn({ method: "POST" })
  .validator(
    (input: {
      last: string;
      recent: string[];
      intent: string;
      prevTopic?: string;
      prevTopicZh?: string;
      notes?: string[];
      mode?: string;
    }) => ({
      last: String(input?.last ?? "")
        .trim()
        .slice(0, 400),
      recent: Array.isArray(input?.recent)
        ? input.recent.map((s) => String(s).slice(0, 220)).slice(-24)
        : [],
      intent: String(input?.intent ?? "")
        .trim()
        .slice(0, 400),
      prevTopic: String(input?.prevTopic ?? "")
        .trim()
        .slice(0, 80),
      prevTopicZh: String(input?.prevTopicZh ?? "")
        .trim()
        .slice(0, 40),
      notes: Array.isArray(input?.notes)
        ? input.notes.map((s) => String(s).slice(0, 120)).filter(Boolean).slice(-8)
        : [],
      mode: parseMode(input?.mode),
    }),
  )
  .middleware([aiGuard])
  .handler(async ({ data, context }): Promise<CoachOk | AiFail> => {
    const gate = takeAiToken(context.caller, "coach");
    if (!gate.ok) return aiFail("rate_limited");
    if (!data.last && !data.intent) return aiFail("empty");
    const system = coachSystem(data.mode);
    const user = JSON.stringify({
      last_heard: data.last || null,
      recent_class: data.recent,
      student_intent: data.intent || null,
      prev_topic: data.prevTopic || null,
      prev_topic_zh: data.prevTopicZh || null,
      student_notes: data.notes.length ? data.notes : null,
      class_mode: data.mode,
    });
    const assemble = (text: string, ms: number) =>
      assembleCoach({
        parsed: extractJsonObject(text),
        last: data.last,
        prevTopic: data.prevTopic,
        prevTopicZh: data.prevTopicZh,
        mode: data.mode,
        ms,
      });

    const first = await chatReasoning({
      system,
      user,
      maxTokens: 700,
      temperature: 0.3,
      timeoutMs: COACH_PRIMARY_MS,
      fallback: false,
      json: true,
      tag: "coach.primary",
    });
    let packed = first.ok ? assemble(first.text, first.ms) : null;
    if (packed?.ok) return packed;

    const fallback = await chatFlash({
      system,
      user,
      maxTokens: 700,
      timeoutMs: COACH_FALLBACK_MS,
      temperature: 0.3,
      json: true,
      tag: "coach.fallback",
    });
    if (fallback.ok) {
      packed = assemble(fallback.text, fallback.ms);
      if (packed.ok) return packed;
    }
    if (!first.ok && !fallback.ok) return fallback;
    return aiFail("coach_incomplete");
  });
