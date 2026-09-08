import { createServerFn } from "@tanstack/react-start";
import { assembleEssay, heuristicEssay, searchFacts } from "@/lib/essay-kit";
import { extractJsonObject } from "@/lib/json-object";
import { takeAiToken } from "./bucket";
import { aiFail, type AiFail } from "./errors";
import { aiGuard } from "./guard";
import { chatReasoning, chatSearch } from "./llm/transport";
import { DEEP_SEARCH_SYS, deepTalkSystem } from "./prompts";

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
    const gate = takeAiToken(context.caller.key, "deep");
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
      timeoutMs: 15000,
      tag: "deep.search",
    });
    const found = web.ok ? extractJsonObject(web.text) : null;
    const facts = searchFacts(found);
    if (!facts.length) return aiFail("no_facts");
    const talk = await chatReasoning({
      system: deepTalkSystem(data.mode),
      user: JSON.stringify({
        topic: data.topic || null,
        facts,
        sources: found?.sources ?? [],
        live_options: data.options,
      }),
      maxTokens: 900,
      temperature: 0.3,
      timeoutMs: 12000,
      fallback: { timeoutMs: 10000 },
      json: true,
      tag: "deep.talk",
    });
    const spoken = talk.ok ? extractJsonObject(talk.text) : null;
    const parsed: Record<string, unknown> = {
      ...(found ?? {}),
      ...(spoken ?? {}),
      facts: found?.facts ?? facts,
      sources: found?.sources ?? [],
      title: (found?.title as string) || data.topic,
    };
    const body = assembleEssay(draft, parsed, (web.ok ? web.ms : 0) + (talk.ok ? talk.ms : 0));
    if (body.draft) return aiFail("no_facts");
    return { ok: true as const, ...body, draft: false, ms: body.latencyMs };
  });
