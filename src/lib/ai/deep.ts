import { createServerFn } from "@tanstack/react-start";
import { assembleEssay, heuristicEssay, searchFacts } from "@/lib/essay-kit";
import { extractJsonObject } from "@/lib/json-object";
import { takeAiToken } from "./bucket";
import { aiFail, type AiFail } from "./errors";
import { aiGuard } from "./guard";
import { chatFlash, chatReasoning, chatSearch } from "./llm/transport";
import { DEEP_SEARCH_SYS, deepTalkSystem } from "./prompts";

/** Web search with the Responses API routinely takes 10–20 s; the talk on either writer, up to 20 s. */
export const DEEP_SEARCH_MS = 20_000;
export const DEEP_TALK_MS = 20_000;

export type DeepOk = {
  ok: true;
  title: string;
  contextEn: string;
  contextZh: string;
  viewZh: string;
  viewEn: string;
  angles: { en: string; zh: string }[];
  facts: { en: string; zh: string }[];
  qZh: string;
  qEn: string;
  aZh: string;
  aEn: string;
  say: string;
  frames: { en: string; zh: string }[];
  terms: { en: string; zh: string }[];
  sources: { en: string; zh: string }[];
  draft: boolean;
  ms: number;
};

const parseMode = (v: unknown) =>
  v === "audit" || v === "listen" || v === "interactive" ? v : "interactive";

/**
 * DeepSearch for one coach card: web search for facts first; no facts means a
 * failure, not an essay of opinions. With facts, the reasoning model writes the
 * forty-second talk (or, in listen mode, the background) from those facts only.
 */
export const expandTopic = createServerFn({ method: "POST" })
  .validator(
    (input: {
      lastHeard: string;
      recent: string[];
      topic: string;
      move: string;
      options: string[];
      mode?: string;
    }) => ({
      lastHeard: String(input?.lastHeard ?? "")
        .trim()
        .slice(0, 280),
      recent: Array.isArray(input?.recent)
        ? input.recent.map((s) => String(s).slice(0, 220)).slice(-12)
        : [],
      topic: String(input?.topic ?? "")
        .trim()
        .slice(0, 80),
      move: String(input?.move ?? "").slice(0, 12),
      options: Array.isArray(input?.options)
        ? input.options.map((s) => String(s).slice(0, 180)).slice(0, 3)
        : [],
      mode: parseMode(input?.mode),
    }),
  )
  .middleware([aiGuard])
  .handler(async ({ data, context }): Promise<DeepOk | AiFail> => {
    const gate = takeAiToken(context.caller, "deep");
    if (!gate.ok) return aiFail("rate_limited");
    if (!data.topic && !data.lastHeard && !data.options.length) return aiFail("empty");
    const draft = heuristicEssay({
      topic: data.topic,
      lastHeard: data.lastHeard,
      recent: data.recent,
      options: data.options,
    });
    const web = await chatSearch({
      system: DEEP_SEARCH_SYS,
      user: JSON.stringify({
        topic: data.topic || null,
        last_heard: data.lastHeard || null,
        recent_class: data.recent,
        live_options: data.options,
      }),
      maxTokens: 900,
      timeoutMs: DEEP_SEARCH_MS,
      tag: "deep.search",
    });
    // A refused key or a timeout on the search is its own failure, not "nothing found".
    if (!web.ok && web.code !== "no_facts") return web;
    const found = web.ok ? extractJsonObject(web.text) : null;
    const facts = searchFacts(found);
    if (!facts.length) return aiFail("no_facts");
    const talkSys = deepTalkSystem(data.mode);
    const talkUser = JSON.stringify({
      topic: data.topic || null,
      facts,
      sources: found?.sources ?? [],
      live_options: data.options,
    });
    // Both writers at once: 4.6 at low effort needs 10–15 s for this much
    // JSON, so run it beside the fast model instead of after it. The 4.6 draft
    // is preferred when both pass the gate; either alone will do.
    const [fast, deep] = await Promise.all([
      chatFlash({
        system: talkSys,
        user: talkUser,
        maxTokens: 900,
        temperature: 0.3,
        timeoutMs: DEEP_TALK_MS,
        json: true,
        tag: "deep.talk.flash",
      }),
      chatReasoning({
        system: talkSys,
        user: talkUser,
        maxTokens: 900,
        temperature: 0.3,
        timeoutMs: DEEP_TALK_MS,
        fallback: false,
        json: true,
        tag: "deep.talk",
      }),
    ]);
    // The search model was told not to write the talk; only the talk's prose
    // may fill viewEn / aEn, so a stray paragraph from the search step cannot
    // pass for a written essay.
    const { aEn: _a, viewEn: _v, aZh: _az, viewZh: _vz, ...foundRest } = (found ?? {}) as Record<string, unknown>;
    const assemble = (text: string, ms: number) => {
      const parsed: Record<string, unknown> = {
        ...foundRest,
        ...(extractJsonObject(text) ?? {}),
        facts: found?.facts ?? facts,
        sources: found?.sources ?? [],
        title: (found?.title as string) || data.topic,
      };
      return assembleEssay(draft, parsed, (web.ok ? web.ms : 0) + ms);
    };
    for (const talk of [deep, fast]) {
      if (!talk.ok) continue;
      const body = assemble(talk.text, talk.ms);
      if (!body.draft) return { ok: true as const, ...body, draft: false, ms: body.latencyMs };
    }
    // Neither writer produced a talk: report the writers' failure, not "nothing found".
    if (!deep.ok && !fast.ok) return deep.code === "timeout" ? deep : fast;
    return aiFail("no_facts");
  });
