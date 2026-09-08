import { extractJsonObject } from "@/lib/json-object";
import { aiFail, type AiFail } from "../errors";
import {
  FLASH_MODELS,
  REASONING_MODEL,
  XAI_CHAT_URL,
  XAI_RESPONSES_URL,
  xaiKey,
} from "./models";

/**
 * Transport for every model call: request shape, timeouts, model fallback
 * chains, response reading, and one structured log line per attempt. The
 * capability files (translate / coach / deep / recap) only choose prompts and
 * assemble results; nothing else in the repo talks to the xAI API.
 */
export type ChatOk = { ok: true; text: string; ms: number; model: string };
export type ChatResult = ChatOk | AiFail;

type Message = { role: "system" | "user"; content: string };

export type LogEntry = {
  tag: string;
  model: string;
  ms: number;
  ok: boolean;
  status?: number;
  reason?: string;
};

/** One JSON line per attempt so a deploy log answers "which model, how long, what failed". */
export function logAi(entry: LogEntry) {
  try {
    console.info(`[ai] ${JSON.stringify(entry)}`);
  } catch {
    /* logging must never break a call */
  }
}

function chatPayload(
  model: string,
  params: {
    messages: Message[];
    maxTokens: number;
    temperature: number;
    json?: boolean;
    reasoning?: string;
  },
) {
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

async function postChat(body: Record<string, unknown>, signal: AbortSignal) {
  return fetch(XAI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${xaiKey()}`,
    },
    body: JSON.stringify(body),
    signal,
  });
}

async function readChat(res: Response, started: number, model: string): Promise<ChatResult> {
  if (!res.ok) return aiFail("upstream", res.status);
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
    text = msg.content.map((p) => (typeof p === "string" ? p : (p.text ?? ""))).join("");
  }
  if (!text && typeof msg?.reasoning_content === "string") text = msg.reasoning_content;
  return { ok: true, text, ms: Date.now() - started, model };
}

export type ChatParams = {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  json?: boolean;
  /** Label for the log line, e.g. "coach.primary". */
  tag?: string;
};

/**
 * Fastest chat model, trying each alias in `FLASH_MODELS`. A 400/404 on the
 * JSON-mode request is retried once without `response_format` before moving to
 * the next alias, because older aliases reject JSON mode.
 */
export async function chatFlash(params: ChatParams): Promise<ChatResult> {
  if (!xaiKey()) return aiFail("unavailable");
  const started = Date.now();
  const tag = params.tag ?? "flash";
  const messages: Message[] = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];
  const temperature = params.temperature ?? 0.15;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), params.timeoutMs ?? 20000);
  try {
    let res: Response | null = null;
    let model: string = FLASH_MODELS[0];
    for (const candidate of FLASH_MODELS) {
      model = candidate;
      res = await postChat(
        chatPayload(candidate, { messages, maxTokens: params.maxTokens, temperature, json: params.json }),
        ac.signal,
      );
      if (res.status === 400 || res.status === 404) {
        logAi({ tag, model: candidate, ms: Date.now() - started, ok: false, status: res.status, reason: "json-mode" });
        const retry = await postChat(
          chatPayload(candidate, { messages, maxTokens: params.maxTokens, temperature }),
          ac.signal,
        );
        if (retry.status !== 400 && retry.status !== 404) {
          res = retry;
          break;
        }
        continue;
      }
      break;
    }
    if (!res) return aiFail("unavailable");
    const out = await readChat(res, started, model);
    logAi({ tag, model, ms: Date.now() - started, ok: out.ok, status: res.status, reason: out.ok ? undefined : out.code });
    return out;
  } catch {
    logAi({ tag, model: "flash", ms: Date.now() - started, ok: false, reason: "timeout" });
    return aiFail("timeout");
  } finally {
    clearTimeout(timer);
  }
}

export type ReasoningParams = ChatParams & {
  /** Retry on the flash chain when the reasoning model fails or times out. `false` = report the failure. */
  fallback?: false | { timeoutMs?: number };
};

/** `grok-4.6` with low reasoning effort, optionally falling back to the flash chain. */
export async function chatReasoning(params: ReasoningParams): Promise<ChatResult> {
  if (!xaiKey()) return aiFail("unavailable");
  const started = Date.now();
  const tag = params.tag ?? "reasoning";
  const temperature = params.temperature ?? 0.2;
  const messages: Message[] = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), params.timeoutMs ?? 8000);
  let failure: AiFail = aiFail("timeout");
  try {
    const res = await postChat(
      chatPayload(REASONING_MODEL, {
        messages,
        maxTokens: params.maxTokens,
        temperature,
        json: params.json,
        reasoning: "low",
      }),
      ac.signal,
    );
    const out = await readChat(res, started, REASONING_MODEL);
    logAi({ tag, model: REASONING_MODEL, ms: Date.now() - started, ok: out.ok, status: res.status, reason: out.ok ? undefined : out.code });
    if (out.ok) return out;
    failure = out;
  } catch {
    logAi({ tag, model: REASONING_MODEL, ms: Date.now() - started, ok: false, reason: "timeout" });
  } finally {
    clearTimeout(timer);
  }
  if (params.fallback === false) return failure;
  return chatFlash({
    system: params.system,
    user: params.user,
    maxTokens: params.maxTokens,
    temperature,
    timeoutMs: params.fallback?.timeoutMs ?? Math.min(params.timeoutMs ?? 20000, 20000),
    json: params.json,
    tag: `${tag}.fallback`,
  });
}

function extractResponsesText(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const row = body as { output_text?: unknown; output?: unknown };
  if (typeof row.output_text === "string" && row.output_text.trim()) return row.output_text.trim();
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
          const part = p as { text?: unknown };
          if (typeof part.text === "string") bits.push(part.text);
        }
      }
    }
  }
  return bits.join("\n").trim();
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
    const rec = node as { type?: string; url?: unknown; annotations?: unknown; content?: unknown; title?: unknown };
    if (typeof rec.url === "string" && /^https?:\/\//.test(rec.url)) urls.push(rec.url);
    if (Array.isArray(rec.annotations)) walk(rec.annotations);
    if (rec.content) walk(rec.content);
    if ((rec.type === "url_citation" || rec.type === "citation") && typeof rec.title === "string" && rec.title.trim()) {
      urls.push(rec.title.trim());
    }
  };
  walk((body as { output?: unknown }).output);
  walk((body as { citations?: unknown }).citations);
  return [...new Set(urls)].slice(0, 4).map((en) => ({ en, zh: "" }));
}

/**
 * Web search through the responses API with the flash chain (the reasoning
 * model does not browse). Resolves to JSON text with `sources` filled from
 * citations when the model left them out; never invents when nothing came back.
 */
export async function chatSearch(params: {
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs?: number;
  tag?: string;
}): Promise<ChatResult> {
  if (!xaiKey()) return aiFail("unavailable");
  const started = Date.now();
  const tag = params.tag ?? "search";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), params.timeoutMs ?? 15000);
  try {
    for (const model of FLASH_MODELS) {
      const res = await fetch(XAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${xaiKey()}`,
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
      if (!res.ok) {
        logAi({ tag, model, ms: Date.now() - started, ok: false, status: res.status });
        continue;
      }
      const body = await res.json();
      const text = extractResponsesText(body);
      if (!text) {
        logAi({ tag, model, ms: Date.now() - started, ok: false, status: res.status, reason: "no-text" });
        continue;
      }
      const parsed = extractJsonObject(text) ?? { raw: text };
      const cites = extractCitations(body);
      if (cites.length && (!Array.isArray(parsed.sources) || !(parsed.sources as unknown[]).length)) {
        parsed.sources = cites;
      }
      logAi({ tag, model, ms: Date.now() - started, ok: true, status: res.status });
      return { ok: true, text: JSON.stringify(parsed), ms: Date.now() - started, model };
    }
  } catch {
    logAi({ tag, model: "flash", ms: Date.now() - started, ok: false, reason: "timeout" });
  } finally {
    clearTimeout(timer);
  }
  return aiFail("no_facts");
}
