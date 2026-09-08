import { createServerFn } from "@tanstack/react-start";
import { aiGuard } from "@/lib/ai/guard";
import { takeAiToken } from "@/lib/ai/bucket";
import { assembleEssay, heuristicEssay, searchFacts } from "@/lib/essay-kit";
import {
  applyZh,
  assembleRecap,
  compactTape,
  emptyRecap,
  essayReadyForClass,
  GOLD_CONTENT,
  GOLD_STUDY,
  isFilled,
  isStudyFilled,
  keepClassStudy,
  mergeAiJson,
  missingZh,
  pickRicherJson,
  studyHayFromClass,
} from "@/lib/recap-kit";
import { extractJsonObject } from "@/lib/json-object";
import { assembleCoach } from "@/lib/coach-assemble";
import { parseClassMode } from "@/lib/class-mode";
import { COACH_FALLBACK_MS, COACH_PRIMARY_MS } from "@/lib/live-queue";
import type { RecapTable } from "@/lib/types";

/** Fastest chat model. "Flash" is this repo's nickname — not an xAI product. */
const FLASH = "grok-4.20-0309-non-reasoning";
const FLASH_ALIAS = "grok-4.20-non-reasoning";
const FLASH_FALLBACK = "grok-4.3";
const FLASH_MODELS = [FLASH, FLASH_ALIAS, FLASH_FALLBACK] as const;

type ChatErr = { ok: false; error: string; code?: string };

async function postChat(body: Record<string, unknown>, signal?: AbortSignal) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false as const, error: "AI 暂不可用", res: null };
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  return { ok: true as const, res, error: "" };
}

async function readChat(res: Response, started: number) {
  if (!res.ok) return { ok: false as const, error: `xAI 错误 ${res.status}` };
  const body = (await res.json()) as {
    choices?: {
      message?: {
        content?: string | { type?: string; text?: string }[];
        reasoning_content?: string;
      };
    }[];
  };
  const msg = body.choices?.[0]?.message;
  let text = "";
  if (typeof msg?.content === "string") text = msg.content;
  else if (Array.isArray(msg?.content)) {
    text = msg.content.map((p) => (typeof p === "string" ? p : p.text ?? "")).join("");
  }
  if (!text && typeof msg?.reasoning_content === "string") text = msg.reasoning_content;
  return {
    ok: true as const,
    text,
    ms: Date.now() - started,
  };
}

function chatPayload(model: string, params: {
  messages: { role: string; content: string }[];
  maxTokens: number;
  temperature: number;
  json?: boolean;
  reasoning?: string;
}) {
  const body: Record<string, unknown> = {
    model,
    temperature: params.temperature,
    max_tokens: params.maxTokens,
    messages: params.messages,
  };
  if (params.json) body.response_format = { type: "json_object" };
  if (params.reasoning) body.reasoning_effort = params.reasoning;
  return body;
}

async function chatFlash(params: {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  json?: boolean;
}): Promise<{ ok: true; text: string; ms: number } | ChatErr> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "AI 暂不可用" };
  const started = Date.now();
  const messages = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];
  const temperature = params.temperature ?? 0.15;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), params.timeoutMs ?? 20000);
  try {
    let res: Response | null = null;
    for (const model of FLASH_MODELS) {
      const first = await postChat(
        chatPayload(model, { messages, maxTokens: params.maxTokens, temperature, json: params.json }),
        ac.signal,
      );
      if (!first.ok) return first;
      res = first.res!;
      if (res.status === 400 || res.status === 404) {
        const retry = await postChat(
          chatPayload(model, { messages, maxTokens: params.maxTokens, temperature }),
          ac.signal,
        );
        if (retry.ok && retry.res && retry.res.status !== 400 && retry.res.status !== 404) {
          res = retry.res;
          break;
        }
        continue;
      }
      break;
    }
    if (!res) return { ok: false, error: "AI 暂不可用" };
    return await readChat(res, started);
  } catch {
    return { ok: false, error: "timeout" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function chat46recap(params: {
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs?: number;
  json?: boolean;
}): Promise<{ ok: true; text: string; ms: number } | ChatErr> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "AI 暂不可用" };
  const started = Date.now();
  const messages = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), params.timeoutMs ?? 28000);
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: ac.signal,
      body: JSON.stringify(
        chatPayload("grok-4.6", {
          messages,
          maxTokens: params.maxTokens,
          temperature: 0.2,
          json: params.json,
          reasoning: "low",
        }),
      ),
    });
    clearTimeout(timer);
    if (res.ok) return readChat(res, started);
  } catch {
    clearTimeout(timer);
  }
  return chatFlash({
    system: params.system,
    user: params.user,
    maxTokens: params.maxTokens,
    temperature: 0.2,
    timeoutMs: Math.min(params.timeoutMs ?? 20000, 20000),
    json: params.json,
  });
}

async function extractResponsesText(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const row = body as {
    output_text?: unknown;
    output?: unknown;
  };
  if (typeof row.output_text === "string" && row.output_text.trim()) {
    return row.output_text.trim();
  }
  if (!Array.isArray(row.output)) return "";
  const bits: string[] = [];
  for (const item of row.output) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { type?: string; content?: unknown };
    if (rec.type !== "message") continue;
    if (typeof rec.content === "string") bits.push(rec.content);
    else if (Array.isArray(rec.content)) {
      for (const p of rec.content) {
        if (typeof p === "string") bits.push(p);
        else if (p && typeof p === "object") {
          const part = p as { text?: unknown; type?: string };
          if (typeof part.text === "string") bits.push(part.text);
        }
      }
    }
  }
  return bits.join("\n").trim();
}

/** Web search with the fastest chat model. grok-4.6 does not browse. */
async function chatDeepSearch(params: {
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs?: number;
}): Promise<{ ok: true; text: string; ms: number } | ChatErr> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "AI 暂不可用" };
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), params.timeoutMs ?? 15000);
  try {
    for (const model of FLASH_MODELS) {
      const res = await fetch("https://api.x.ai/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: ac.signal,
        body: JSON.stringify({
          model,
          tools: [{ type: "web_search" }],
          instructions: params.system,
          input: params.user,
          max_output_tokens: Math.min(params.maxTokens, 900),
        }),
      });
      if (res.status === 400 || res.status === 404) continue;
      if (!res.ok) continue;
      const body = await res.json();
      const text = await extractResponsesText(body);
      if (text) {
        const parsed = extractJsonObject(text) ?? { raw: text };
        const cites = extractCitations(body);
        if (cites.length && (!Array.isArray(parsed.sources) || !(parsed.sources as unknown[]).length)) {
          parsed.sources = cites;
        }
        clearTimeout(timer);
        return { ok: true, text: JSON.stringify(parsed), ms: Date.now() - started };
      }
    }
  } catch {
    /* timed out or failed — caller must not invent facts */
  }
  clearTimeout(timer);
  return { ok: false, error: "没检索到，再点一次。" };
}

function extractCitations(body: unknown): { en: string; zh: string }[] {
  if (!body || typeof body !== "object") return [];
  const urls: string[] = [];
  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object") return;
    const rec = node as { type?: string; url?: unknown; annotations?: unknown; content?: unknown };
    if (typeof rec.url === "string" && /^https?:\/\//.test(rec.url)) urls.push(rec.url);
    if (Array.isArray(rec.annotations)) walk(rec.annotations);
    if (rec.content) walk(rec.content);
    if (rec.type === "url_citation" || rec.type === "citation") {
      const extra = rec as { title?: unknown };
      if (typeof extra.title === "string" && extra.title.trim()) urls.push(extra.title.trim());
    }
  };
  walk((body as { output?: unknown }).output);
  walk((body as { citations?: unknown }).citations);
  return [...new Set(urls)].slice(0, 4).map((en) => ({ en, zh: "" }));
}

async function chat46low(params: {
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs?: number;
  fallbackTimeoutMs?: number;
  skipFallback?: boolean;
  json?: boolean;
}): Promise<{ ok: true; text: string; ms: number } | ChatErr> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "AI 暂不可用" };
  const started = Date.now();
  const messages = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), params.timeoutMs ?? 8000);
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: ac.signal,
      body: JSON.stringify(
        chatPayload("grok-4.6", {
          messages,
          maxTokens: params.maxTokens,
          temperature: 0.3,
          json: params.json,
          reasoning: "low",
        }),
      ),
    });
    clearTimeout(timer);
    if (res.ok) return readChat(res, started);
    if (params.skipFallback) return { ok: false, error: `xAI 错误 ${res.status}` };
  } catch {
    clearTimeout(timer);
    if (params.skipFallback) return { ok: false, error: "timeout" };
  }
  if (params.skipFallback) return { ok: false, error: "timeout" };
  return chatFlash({
    system: params.system,
    user: params.user,
    maxTokens: params.maxTokens,
    temperature: 0.3,
    timeoutMs: params.fallbackTimeoutMs ?? 10000,
    json: params.json,
  });
}

export const mintSttSecret = createServerFn({ method: "POST" })
  .middleware([aiGuard])
  .handler(async ({ context }): Promise<{ ok: true; token: string } | ChatErr> => {
    const gate = takeAiToken(context.caller.key, "stt");
    if (!gate.ok) return gate;
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "AI 暂不可用" };
    const res = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ expires_after: { seconds: 1800 } }),
    });
    if (!res.ok) return { ok: false, error: `xAI 错误 ${res.status}` };
    const body = (await res.json()) as { value?: string };
    if (!body.value) return { ok: false, error: "无听写密钥" };
    return { ok: true, token: body.value };
  });

const pick = (parsed: Record<string, unknown> | null, key: string) => {
  const v = parsed?.[key];
  return typeof v === "string" ? v.trim() : "";
};

const TRANS_SYS =
  'Translate classroom English into 简体中文. Return ONLY JSON: {"zh":"..."}. zh MUST include Chinese characters. Spoken, complete. NEVER copy the English. No pinyin.';

const COACH_SPEAK =
  'English-class coach. Intermediate student in mainland China. ALL zh/topicZh/briefZh MUST be 简体中文, never 繁體. Return ONLY JSON: {"same":true|false,"topic":"...","topicZh":"...","briefZh":"...","briefEn":"...","move":"answer"|"join","options":[3],"extras":[]}. Each option/extra: {"label":"...","en":"...","zh":"...","keys":["..."]}. prev_topic is the last card. same=true ONLY means keep the previous topic title — still return a full new card. same=false if last_heard is a question or a new angle; name a specific topic for THIS beat (≤6 English words). Never overwrite; each beat is a new card. student_notes are words the student marked — if present, use them in at least one option. briefZh=2 short 简体中文 sentences. briefEn=spoken English gloss. move=answer if last_heard is a question; else join. options: ALWAYS 3 turns to say NOW. answer labels: 直接答, 补一层, 举个例. join labels: 同意, 对比, 例子. extras: try for 延展 and 追深 when the beat can go further; omit a slot rather than invent; empty extras=[] is allowed. A card is valid with only the 3 options. en=12-22 words. option/extra zh≤64 chars 简体, complete clauses. keys=2-4 words. NEVER repeat last_heard as the whole line; building on it is fine. No markdown.';

const COACH_AUDIT =
  COACH_SPEAK +
  " class_mode=audit. The student is mostly listening and may jump in. Write as if they might speak, not as if they must answer now. Keep the same 3 labels.";

const COACH_LISTEN =
  'English-class listener notes. Intermediate student in mainland China. ALL zh MUST be 简体中文. Return ONLY JSON: {"same":true|false,"topic":"...","topicZh":"...","briefZh":"...","briefEn":"...","move":"join","options":[3],"extras":[]}. Each option: {"label":"...","en":"...","zh":"...","keys":["..."]}. This is a podcast / Coursera / recording. NEVER write turns to say to a teacher. NEVER use 同意/对比/例子 or 直接答. options MUST be exactly: 1 label 这句 = the sentence worth stealing (or a tight half-sentence), 2 label 剖析 = why the pattern/tone/collocation is good (en 12-22 words), 3 label 背景 = what this beat is about (en 12-22 words), not an encyclopedia. 这句 zh≤64 chars. 剖析/背景 zh≤100 chars, finish the clause. same=true only keeps the topic title. extras must be []. No markdown.';

function coachSystem(mode: string) {
  if (mode === "listen") return COACH_LISTEN;
  if (mode === "audit") return COACH_AUDIT;
  return COACH_SPEAK;
}

export const liveTranslate = createServerFn({ method: "POST" })
  .validator((input: { lines: { id: string; en: string }[] }) => ({
    lines: Array.isArray(input?.lines)
      ? input.lines
          .slice(0, 1)
          .map((l) => ({
            id: String(l?.id ?? "").slice(0, 16),
            en: String(l?.en ?? "")
              .trim()
              .slice(0, 280),
          }))
          .filter((l) => l.id && l.en)
      : [],
  }))
  .middleware([aiGuard])
  .handler(async ({ data, context }): Promise<
    | { ok: true; items: { id: string; zh: string }[]; ms: number }
    | ChatErr
  > => {
    const gate = takeAiToken(context.caller.key, "translate");
    if (!gate.ok) return gate;
    const line = data.lines[0];
    if (!line) return { ok: false, error: "empty" };
    const result = await chatFlash({
      system: TRANS_SYS,
      user: line.en,
      maxTokens: 80,
      temperature: 0,
      timeoutMs: 8000,
      json: true,
    });
    if (!result.ok) return result;
    const parsed = extractJsonObject(result.text);
    let zh = pick(parsed, "zh");
    if (!zh && Array.isArray(parsed?.items)) {
      const row = parsed.items[0] as { zh?: unknown } | undefined;
      zh = typeof row?.zh === "string" ? row.zh.trim() : "";
    }
    if (!/[\u4e00-\u9fff]/.test(zh)) {
      const m = result.text.match(/[\u4e00-\u9fff][^"\n]{0,120}/);
      zh = m?.[0]?.trim() ?? "";
    }
    if (!/[\u4e00-\u9fff]/.test(zh)) return { ok: false, error: "no-zh" };
    return { ok: true, items: [{ id: line.id, zh }], ms: result.ms };
  });

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
      mode:
        input?.mode === "audit" || input?.mode === "listen" || input?.mode === "interactive"
          ? input.mode
          : "interactive",
    }),
  )
  .middleware([aiGuard])
  .handler(async ({ data, context }): Promise<
    | {
        ok: true;
        same: boolean;
        topic: string;
        topicZh: string;
        briefZh: string;
        briefEn: string;
        move: "answer" | "join";
        options: { label: string; en: string; zh: string; keys: string[] }[];
        extras: { label: string; en: string; zh: string; keys: string[] }[];
        ms: number;
      }
    | ChatErr
  > => {
    const gate = takeAiToken(context.caller.key, "coach");
    if (!gate.ok) return gate;
    if (!data.last && !data.intent) return { ok: false, error: "empty" };
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
    const first = await chat46low({
      system,
      user,
      maxTokens: 700,
      timeoutMs: COACH_PRIMARY_MS,
      skipFallback: true,
      json: true,
    });
    let packed = first.ok
      ? assembleCoach({
          parsed: extractJsonObject(first.text),
          last: data.last,
          prevTopic: data.prevTopic,
          prevTopicZh: data.prevTopicZh,
          mode: data.mode,
          ms: first.ms,
        })
      : null;
    if (packed?.ok) return packed;

    const fallback = await chatFlash({
      system,
      user,
      maxTokens: 700,
      timeoutMs: COACH_FALLBACK_MS,
      temperature: 0.3,
      json: true,
    });
    if (fallback.ok) {
      packed = assembleCoach({
        parsed: extractJsonObject(fallback.text),
        last: data.last,
        prevTopic: data.prevTopic,
        prevTopicZh: data.prevTopicZh,
        mode: data.mode,
        ms: fallback.ms,
      });
      if (packed.ok) return packed;
    }
    if (!first.ok && !fallback.ok) return fallback;
    return packed && !packed.ok ? packed : { ok: false, error: "教练没给出三条，再听一句。" };
  });

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
      mode:
        input?.mode === "audit" || input?.mode === "listen" || input?.mode === "interactive"
          ? input.mode
          : "interactive",
    }),
  )
  .middleware([aiGuard])
  .handler(async ({ data, context }): Promise<
    | {
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
      }
    | ChatErr
  > => {
    const gate = takeAiToken(context.caller.key, "deep");
    if (!gate.ok) return gate;
    if (!data.topic && !data.lastHeard && !data.options.length) {
      return { ok: false, error: "empty" };
    }
    const draft = heuristicEssay({
      topic: data.topic,
      lastHeard: data.lastHeard,
      recent: data.recent,
      options: data.options,
    });
    const searchUser = JSON.stringify({
      topic: data.topic || null,
      last_heard: data.lastHeard || null,
      recent_class: data.recent,
      live_options: data.options,
    });
    const web = await chatDeepSearch({
      system:
        'You retrieve classroom facts. Use web_search. NEVER invent names, numbers, or years. NEVER write aEn or viewEn. NEVER copy live_options. ALL zh MUST be 简体中文. Return ONLY JSON: {"title":"...","facts":[{"en":"...","zh":"..."}],"sources":[{"en":"...","zh":"..."}]}. Give 3 facts with names/numbers/years. If search finds nothing, return {"title":"...","facts":[],"sources":[]}.',
      user: searchUser,
      maxTokens: 900,
      timeoutMs: 15000,
    });
    const found = web.ok ? extractJsonObject(web.text) : null;
    const facts = searchFacts(found);
    if (!facts.length) {
      return { ok: false, error: "没检索到，再点一次。" };
    }
    const talk = await chat46low({
      system:
        data.mode === "listen"
          ? 'Write classroom background FROM THESE FACTS ONLY. Do not invent names or numbers. Do not search the web. Do not copy live_options. Do not write a speech to a teacher. ALL zh MUST be 简体中文. Return ONLY JSON: {"viewEn":"...","viewZh":"...","aEn":"","aZh":"","angles":[{"en":"...","zh":"..."}],"qEn":"","qZh":"","say":"","frames":[{"en":"...","zh":"..."}],"terms":[{"en":"...","zh":"..."}]}. viewEn=40-70 words of background. aEn must be empty.'
          : 'Write a 40-second English-class talk FROM THESE FACTS ONLY. Do not invent names or numbers. Do not search the web. Do not copy live_options. ALL zh MUST be 简体中文. Return ONLY JSON: {"viewEn":"...","viewZh":"...","aEn":"...","aZh":"...","angles":[{"en":"...","zh":"..."}],"qEn":"...","qZh":"...","say":"...","frames":[{"en":"...","zh":"..."}],"terms":[{"en":"...","zh":"..."}]}. viewEn=40-70 words. aEn=70-110 words they can say.',
      user: JSON.stringify({
        topic: data.topic || null,
        facts,
        sources: found?.sources ?? [],
        live_options: data.options,
      }),
      maxTokens: 900,
      timeoutMs: 12000,
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
    if (body.draft) {
      return { ok: false, error: "没检索到，再点一次。" };
    }
    return { ok: true as const, ...body, draft: false, ms: body.latencyMs };
  });

export const quickTranslate = createServerFn({ method: "POST" })
  .validator((input: { text: string }) => ({
    text: String(input?.text ?? "")
      .trim()
      .slice(0, 280),
  }))
  .middleware([aiGuard])
  .handler(async ({ data, context }): Promise<
    | { ok: true; out: string; dir: "zh-en" | "en-zh"; ms: number }
    | ChatErr
  > => {
    const gate = takeAiToken(context.caller.key, "quick");
    if (!gate.ok) return gate;
    if (!data.text) return { ok: false, error: "empty" };
    const toEn = /[\u4e00-\u9fff]/.test(data.text);
    const dir = toEn ? "zh-en" : "en-zh";
    const result = await chatFlash({
      system: toEn
        ? "Translate Chinese to natural spoken English. Return ONLY the translation. No quotes, no notes."
        : "Translate English to spoken 简体中文. Return ONLY the translation. No quotes, no notes.",
      user: data.text,
      maxTokens: 80,
    });
    if (!result.ok) return result;
    return { ok: true, out: result.text.trim(), dir, ms: result.ms };
  });

function parseTerms(v: unknown, n = 4): { en: string; zh: string }[] {
  if (!Array.isArray(v)) return [];
  const out: { en: string; zh: string }[] = [];
  for (const it of v) {
    if (typeof it === "string") {
      const parts = it.split(/\s*[—–\-]\s*/);
      const en = (parts[0] ?? "").trim();
      const zh = (parts[1] ?? "").trim();
      if (en) out.push({ en, zh });
    } else if (it && typeof it === "object") {
      const row = it as { en?: unknown; zh?: unknown };
      const en = typeof row.en === "string" ? row.en.trim() : "";
      const zh = typeof row.zh === "string" ? row.zh.trim() : "";
      if (en) out.push({ en, zh });
    }
  }
  return out.slice(0, n);
}

function parseSections(v: unknown): {
  heading: string;
  headingZh: string;
  body: string;
  bodyZh: string;
}[] {
  if (!Array.isArray(v)) return [];
  const out: {
    heading: string;
    headingZh: string;
    body: string;
    bodyZh: string;
  }[] = [];
  for (const it of v) {
    if (!it || typeof it !== "object") continue;
    const row = it as {
      heading?: unknown;
      headingZh?: unknown;
      body?: unknown;
      bodyZh?: unknown;
    };
    const heading = typeof row.heading === "string" ? row.heading.trim() : "";
    const bodyRaw = typeof row.body === "string" ? row.body.trim() : "";
    const pointRows = Array.isArray((row as { points?: unknown }).points)
      ? ((row as { points: unknown[] }).points)
      : [];
    const fromPoints = pointRows
      .map((p, i) => {
        if (typeof p === "string") return `${i + 1}. ${p.trim()}`;
        if (!p || typeof p !== "object") return "";
        const r = p as { en?: unknown; zh?: unknown; n?: unknown };
        const en = typeof r.en === "string" ? r.en.trim() : "";
        const zh = typeof r.zh === "string" ? r.zh.trim() : "";
        if (!en) return "";
        return zh ? `${i + 1}. ${en}\n${zh}` : `${i + 1}. ${en}`;
      })
      .filter(Boolean);
    const body = [bodyRaw, fromPoints.join("\n")].filter(Boolean).join("\n\n");
    if (heading && body)
      out.push({
        heading,
        headingZh: typeof row.headingZh === "string" ? row.headingZh.trim() : "",
        body,
        bodyZh: typeof row.bodyZh === "string" ? row.bodyZh.trim() : "",
      });
    if (out.length === 6) break;
  }
  return out;
}

function parseOutline(v: unknown): { heading: string; bullets: string[] }[] {
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

function parsePairs(v: unknown, n: number): { en: string; zh: string }[] {
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

function parseStudy(v: unknown, n: number): {
  en: string;
  zh: string;
  use: string;
  useZh: string;
  example: string;
  exampleZh: string;
}[] {
  if (!Array.isArray(v)) return [];
  const out: {
    en: string;
    zh: string;
    use: string;
    useZh: string;
    example: string;
    exampleZh: string;
  }[] = [];
  for (const it of v) {
    if (!it || typeof it !== "object") continue;
    const row = it as {
      en?: unknown;
      zh?: unknown;
      use?: unknown;
      useZh?: unknown;
      example?: unknown;
      exampleZh?: unknown;
      note?: unknown;
    };
    const en = typeof row.en === "string" ? row.en.trim() : "";
    if (!en) continue;
    out.push({
      en,
      zh: typeof row.zh === "string" ? row.zh.trim() : "",
      use: typeof row.use === "string" ? row.use.trim() : typeof row.note === "string" ? row.note.trim() : "",
      useZh: typeof row.useZh === "string" ? row.useZh.trim() : "",
      example: typeof row.example === "string" ? row.example.trim() : "",
      exampleZh: typeof row.exampleZh === "string" ? row.exampleZh.trim() : "",
    });
    if (out.length === n) break;
  }
  return out;
}

type RecapSectionOk = {
  heading: string;
  headingZh: string;
  body: string;
  bodyZh: string;
  table?: RecapTable | null;
};

type RecapOk = {
  ok: true;
  title: string;
  lede: string;
  ledeZh: string;
  sections: RecapSectionOk[];
  outline: { heading: string; bullets: string[] }[];
  topics: { en: string; zh: string }[];
  patterns: ReturnType<typeof parseStudy>;
  lines: ReturnType<typeof parseStudy>;
  words: ReturnType<typeof parseStudy>;
  collos: ReturnType<typeof parseStudy>;
  grammar: ReturnType<typeof parseStudy>;
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

function recapToOk(recap: {
  title: string;
  lede: string;
  ledeZh: string;
  sections: RecapOk["sections"];
  outline: RecapOk["outline"];
  topics: RecapOk["topics"];
  takeaways: RecapOk["takeaways"];
  words: RecapOk["words"];
  collos: RecapOk["collos"];
  patterns: RecapOk["patterns"];
  grammar: RecapOk["grammar"];
  lines: RecapOk["lines"];
  skills: RecapOk["skills"];
  marks: string[];
  latencyMs: number;
}): RecapOk {
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

export const recapClass = createServerFn({ method: "POST" })
  .validator(
    (input: {
      phase?: "essay" | "study" | "all";
      prior?: RecapPrior | null;
      lines: { en: string; zh: string }[];
      topics: string[];
      notes: string[];
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
            .slice(0, 160)
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
      topics: Array.isArray(input?.topics)
        ? input.topics.map((s) => String(s).slice(0, 80)).slice(0, 8)
        : [],
      notes: Array.isArray(input?.notes)
        ? input.notes.map((s) => String(s).slice(0, 180)).slice(0, 12)
        : [],
      coach: Array.isArray(input?.coach)
        ? input.coach.slice(0, 10).map((c) => ({
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
  .handler(async ({ data, context }): Promise<RecapOk | ChatErr> => {
    const gate = takeAiToken(context.caller.key, "recap");
    if (!gate.ok) return gate;
    if (data.lines.length < 2) return { ok: false, error: "实录太短" };
    const tape = compactTape(data.lines).slice(0, 36);
    const listenOnly = data.mode === "listen";
    const packet = {
      transcript: tape,
      student_notes: data.notes,
      coach_and_deep: data.coach,
      topics: data.topics,
      class_mode: data.mode,
    };
    const kindNote = listenOnly
      ? " class_mode=listen. Write listening notes: what this beat argued and why a line is worth keeping. Never write as if they spoke to a teacher. 这句 / 剖析 / 背景 stay in a class-notes appendix."
      : ` class_mode=${data.mode}. Write the hour's claim and tension, and how they could have joined. Still an essay — do not reprint agree/contrast/example or answer/add-a-layer/example.`;
    const listenStudy = listenOnly
      ? " skills = sentence frames worth stealing later, not lines to say to a teacher. Prefer collocations from 剖析."
      : " skills = upgrades they could say, still as study rows, not a copy of 1. 2. 3.";
    const base = emptyRecap(data.topics[0] || "Class notes", data.topics);
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
    const contentSys =
      "CONTENT slot of a class 讲义. English primary, 简体中文 in *Zh. " +
      GOLD_CONTENT +
      kindNote +
      " Write 3 or 4 sections only. Each body = one paragraph of class claims (90-160 words) plus optional 1. 2. 3. A list alone is not a section. Contrast hours need a two-column table on that section. Fold coach briefs, DeepSearch names/numbers, and student notes into the matching paragraph. If there is no search and no note, the coach brief still belongs in the essay. Keep the JSON complete — fewer finished sections beat a cut-off dump. " +
      ' Return ONLY JSON: {"title":"...","lede":"...","ledeZh":"...","outline":[{"heading":"...","bullets":["..."]}],"sections":[{"heading":"...","headingZh":"...","body":"...","bodyZh":"...","table":{"leftHead":"...","leftHeadZh":"...","rightHead":"...","rightHeadZh":"...","rows":[{"left":"...","leftZh":"...","right":"...","rightZh":"..."}]}}],"takeaways":[{"en":"...","zh":"..."}],"topics":[{"en":"...","zh":"..."}]}. Omit table when the hour is not a contrast.';
    const userPacket = JSON.stringify(packet);
    const [content, grok] = await Promise.all([
      chatFlash({
        system: contentSys,
        user: userPacket,
        maxTokens: 4000,
        temperature: 0.2,
        timeoutMs: 20000,
        json: true,
      }),
      chat46recap({
        system: contentSys,
        user: userPacket,
        maxTokens: 4000,
        timeoutMs: 28000,
        json: true,
      }),
    ]);
    const fromFlash = content.ok ? extractJsonObject(content.text) ?? {} : {};
    const fromGrok = grok.ok ? extractJsonObject(grok.text) ?? {} : {};
    parsed = pickRicherJson(fromFlash, mergeAiJson(fromFlash, fromGrok));
    recap = stamp(parsed);
    recap.latencyMs = Math.max(content.ok ? content.ms : 0, grok.ok ? grok.ms : 0);
    if (!essayReadyForClass(recap, sources)) {
      const heads = (recap.outline.map((o) => o.heading).filter(Boolean).slice(0, 4).length
        ? recap.outline.map((o) => o.heading).filter(Boolean).slice(0, 4)
        : data.topics.slice(0, 4));
      const slim = await chat46recap({
        system:
          "The outline is not a handout. WRITE the 讲义 for THIS class. Fold coach briefs, DeepSearch names/numbers, and student notes into the paragraphs. If there is no search and no note, use the coach brief. Do not paste the three coach openings. Title is 3–8 words, not a caption. ONLY complete JSON: title, lede, ledeZh, sections[{heading,headingZh,body,bodyZh,table?}], takeaways[{en,zh}]. Three sections is enough. Each body = prose paragraph + optional 1. 2. 3. bodyZh = 简体. Table only for a real contrast. Star *handout words*. Finish the JSON.",
        user: JSON.stringify({ headings: heads, packet }),
        maxTokens: 3600,
        timeoutMs: 28000,
        json: true,
      });
      if (slim.ok) {
        parsed = mergeAiJson(parsed, extractJsonObject(slim.text) ?? {});
        recap = stamp(parsed);
        recap.latencyMs += slim.ms;
      }
    }
    if (!essayReadyForClass(recap, sources)) {
      return { ok: false, error: "纪要没写出来，再点一次整理。" };
    }
    }
    if (!essayReadyForClass(recap, sources)) {
      return { ok: false, error: "纪要没写出来，再点一次整理。" };
    }
    if (data.phase === "essay") {
      return recapToOk(recap);
    }
    const studySys =
      "STUDY slot. You are the English teacher. YOU pick the words, the harder ones, and what to underline. 简体中文 in zh/useZh/exampleZh. Return ONLY JSON: {\"marks\":[\"...\"],\"words\":[...],\"collos\":[...],\"patterns\":[...],\"grammar\":[...],\"lines\":[...],\"skills\":[{\"en\":\"...\",\"zh\":\"...\"}]}. Each study row {\"en\",\"zh\",\"use\",\"useZh\",\"example\",\"exampleZh\"}. " +
      GOLD_STUDY +
      listenStudy;
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
    });
    let studyParsed = study.ok ? extractJsonObject(study.text) ?? {} : {};
    const studyHasWords =
      Array.isArray(studyParsed.words) &&
      (studyParsed.words as { zh?: string; use?: string }[]).some((w) => w && (w.zh || w.use));
    if (!studyHasWords) {
      study = await chat46recap({
        system: studySys,
        user: studyUser,
        maxTokens: 2800,
        timeoutMs: 24000,
        json: true,
      });
      if (study.ok) studyParsed = extractJsonObject(study.text) ?? studyParsed;
    }
    const studyKeys = ["marks", "words", "collos", "patterns", "grammar", "lines", "skills"] as const;
    for (const k of studyKeys) {
      if (Array.isArray(studyParsed[k]) && (studyParsed[k] as unknown[]).length) parsed[k] = studyParsed[k];
    }
    recap = closeStudy(stamp(parsed));
    recap.latencyMs += study.ok ? study.ms : 0;
    if (!isStudyFilled(recap)) {
      const again = await chat46recap({
        system:
          "Language points only for THIS hour. Each row must point at a word that appears in the transcript, coach, DeepSearch, notes, or the essay. Not think/like/good/people. Do not paste the three coach openings. At least 3 words and 2 collocations. Each row: en, zh, use, useZh, example, exampleZh. Return ONLY JSON {marks,words,collos,patterns,grammar,lines,skills}.",
        user: studyUser,
        maxTokens: 2800,
        timeoutMs: 24000,
        json: true,
      });
      if (again.ok) {
        const extra = extractJsonObject(again.text) ?? {};
        for (const k of studyKeys) {
          if (Array.isArray(extra[k]) && (extra[k] as unknown[]).length) parsed[k] = extra[k];
        }
        recap = closeStudy(stamp(parsed));
        recap.latencyMs += again.ms;
      }
    }
    if (!isFilled(recap)) {
      return { ok: false, error: "语言点没写出来，再点一次整理。" };
    }
    recap.draft = false;
    const miss = missingZh(recap);
    if (miss.length) {
      const gloss = await chatFlash({
        system:
          'Translate each English string to spoken 简体中文. Return ONLY JSON {"items":[{"en":"...","zh":"..."}]}. zh is a translation of THAT en. No extras.',
        user: JSON.stringify({ items: miss }),
        maxTokens: 900,
        timeoutMs: 8000,
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

export const liveOutline = createServerFn({ method: "POST" })
  .validator(
    (input: {
      lines: { en: string; zh: string }[];
      topics: string[];
      notes: string[];
    }) => ({
      lines: Array.isArray(input?.lines)
        ? input.lines
            .slice(-20)
            .map((l) => ({
              en: String(l?.en ?? "")
                .trim()
                .slice(0, 180),
              zh: String(l?.zh ?? "")
                .trim()
                .slice(0, 120),
            }))
            .filter((l) => l.en)
        : [],
      topics: Array.isArray(input?.topics)
        ? input.topics.map((s) => String(s).slice(0, 80)).slice(0, 6)
        : [],
      notes: Array.isArray(input?.notes)
        ? input.notes.map((s) => String(s).slice(0, 160)).slice(0, 10)
        : [],
    }),
  )
  .middleware([aiGuard])
  .handler(async ({ data, context }): Promise<
    | {
        ok: true;
        title: string;
        outline: { heading: string; bullets: string[] }[];
        topics: { en: string; zh: string }[];
        ms: number;
      }
    | ChatErr
  > => {
    const gate = takeAiToken(context.caller.key, "outline");
    if (!gate.ok) return gate;
    if (data.lines.length < 2 && data.notes.length < 1) {
      return { ok: false, error: "还太短" };
    }
    const result = await chatFlash({
      system:
        'Living class outline. English PRIMARY. Return ONLY JSON: {"title":"...","outline":[{"heading":"...","bullets":["..."]}],"topics":[{"en":"...","zh":"..."}]}. title=3-6 English words naming the subject. outline=2-4 SHORT headings (≤6 words), each with 1-2 rewritten bullets (≤18 words). Never paste speech fragments. Never repeat a bullet. topics=en + Chinese gloss. No Chinese in title/headings/bullets.',
      user: JSON.stringify({
        transcript: data.lines,
        coach_topics: data.topics,
        student_notes: data.notes,
      }),
      maxTokens: 420,
      temperature: 0.2,
    });
    if (!result.ok) return result;
    const parsed = extractJsonObject(result.text);
    return {
      ok: true,
      title: pick(parsed, "title"),
      outline: parseOutline(parsed?.outline),
      topics: parsePairs(parsed?.topics, 5),
      ms: result.ms,
    };
  });
