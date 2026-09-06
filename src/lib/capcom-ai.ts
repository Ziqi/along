import { createServerFn } from "@tanstack/react-start";
import { assembleEssay, heuristicEssay } from "@/lib/essay-kit";
import { applyZh, assembleRecap, compactTape, emptyRecap, GOLD_CONTENT, GOLD_STUDY, missingZh } from "@/lib/recap-kit";
import { extractJsonObject } from "@/lib/utils";

const FLASH = "grok-4.20-non-reasoning";
const FLASH_FALLBACK = "grok-4.3";

type ChatErr = { ok: false; error: string };

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

async function chatFlash(params: {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
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
  const timer = params.timeoutMs
    ? setTimeout(() => ac.abort(), params.timeoutMs)
    : null;
  try {
    const first = await postChat({
      model: FLASH,
      temperature,
      max_tokens: params.maxTokens,
      messages,
    }, ac.signal);
    if (!first.ok) return first;
    let res = first.res!;
    if (res.status === 400 || res.status === 404) {
      const fb = await postChat({
        model: FLASH_FALLBACK,
        temperature,
        max_tokens: params.maxTokens,
        messages,
      }, ac.signal);
      if (!fb.ok) return fb;
      res = fb.res!;
    }
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
}): Promise<{ ok: true; text: string; ms: number } | ChatErr> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "AI 暂不可用" };
  const started = Date.now();
  const messages = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), params.timeoutMs ?? 24000);
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: ac.signal,
      body: JSON.stringify({
        model: "grok-4.6",
        temperature: 0.25,
        max_tokens: params.maxTokens,
        reasoning_effort: "low",
        messages,
      }),
    });
    clearTimeout(timer);
    if (res.ok) return readChat(res, started);
  } catch {
    clearTimeout(timer);
  }
  return chatFlash({
    system: params.system,
    user: params.user,
    maxTokens: Math.min(params.maxTokens, 2200),
    temperature: 0.2,
    timeoutMs: 12000,
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

/** Real DeepSearch: web_search when available, then grok-4.6. */
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
  const timer = setTimeout(() => ac.abort(), params.timeoutMs ?? 10000);
  try {
    const res = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: ac.signal,
      body: JSON.stringify({
        model: "grok-4.6",
        tools: [{ type: "web_search" }],
        instructions: params.system,
        input: params.user,
        max_output_tokens: Math.min(params.maxTokens, 1400),
      }),
    });
    if (res.ok) {
      const body = await res.json();
      const text = await extractResponsesText(body);
      if (text) {
        clearTimeout(timer);
        return { ok: true, text, ms: Date.now() - started };
      }
    }
  } catch {
    /* timed out or failed — caller already has flash */
  }
  clearTimeout(timer);
  return { ok: false, error: "search-timeout" };
}

async function chat46low(params: {
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs?: number;
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
      body: JSON.stringify({
        model: "grok-4.6",
        temperature: 0.3,
        max_tokens: params.maxTokens,
        reasoning_effort: "low",
        messages,
      }),
    });
    clearTimeout(timer);
    if (res.ok) return readChat(res, started);
  } catch {
    clearTimeout(timer);
  }
  return chatFlash({ ...params, temperature: 0.3 });
}

export const mintSttSecret = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true; token: string } | ChatErr> => {
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
  },
);

const pick = (parsed: Record<string, unknown> | null, key: string) => {
  const v = parsed?.[key];
  return typeof v === "string" ? v.trim() : "";
};

const TRANS_SYS =
  'Translate classroom English into 简体中文. Return ONLY JSON: {"zh":"..."}. zh MUST include Chinese characters. Spoken, complete. NEVER copy the English. No pinyin.';

const COACH_SYS =
  'English-class coach. Intermediate student in mainland China. ALL zh/topicZh/briefZh MUST be 简体中文, never 繁體. Return ONLY JSON: {"same":true|false,"topic":"...","topicZh":"...","briefZh":"...","briefEn":"...","move":"answer"|"join","options":[3],"extras":[2]}. Each option/extra: {"label":"...","en":"...","zh":"...","keys":["..."]}. prev_topic is the last card. same=true ONLY if last_heard is still the same beat and is NOT a question. If last_heard is a question or a new angle, same=false and name a specific topic for THIS beat (≤6 English words; may be a sub-topic of prev). Never overwrite; each beat is a new card. student_notes are words the student marked — if present, use them in at least one option. briefZh=2 short 简体中文 sentences. briefEn=spoken English gloss. move=answer if last_heard is a question; else join. options: ALWAYS 3 turns to say NOW. answer: 答/答/答 — agree, contrast, example. join: 接话, 追问, 例子. extras: 延展, 追深. en=12-22 words. zh≤24 chars 简体. keys=2-4 words. NEVER repeat last_heard. No markdown.';

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
  .handler(async ({ data }): Promise<
    | { ok: true; items: { id: string; zh: string }[]; ms: number }
    | ChatErr
  > => {
    const line = data.lines[0];
    if (!line) return { ok: false, error: "empty" };
    const result = await chatFlash({
      system: TRANS_SYS,
      user: line.en,
      maxTokens: 80,
      temperature: 0,
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
    }),
  )
  .handler(async ({ data }): Promise<
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
    if (!data.last && !data.intent) return { ok: false, error: "empty" };
    const result = await chat46low({
      system: COACH_SYS,
      user: JSON.stringify({
        last_heard: data.last || null,
        recent_class: data.recent,
        student_intent: data.intent || null,
        prev_topic: data.prevTopic || null,
        prev_topic_zh: data.prevTopicZh || null,
        student_notes: data.notes.length ? data.notes : null,
      }),
      maxTokens: 700,
      timeoutMs: 8000,
    });
    if (!result.ok) return result;
    const parsed = extractJsonObject(result.text);
    const move = pick(parsed, "move") === "join" ? "join" : "answer";
    const same =
      move !== "answer" &&
      (parsed?.same === true ||
        parsed?.same === "true" ||
        (Boolean(data.prevTopic) &&
          pick(parsed, "topic").toLowerCase() === data.prevTopic.toLowerCase()));
    return {
      ok: true,
      same,
      topic: same && data.prevTopic ? data.prevTopic : pick(parsed, "topic"),
      topicZh: same && data.prevTopicZh ? data.prevTopicZh : pick(parsed, "topicZh"),
      briefZh: pick(parsed, "briefZh"),
      briefEn: pick(parsed, "briefEn"),
      move,
      options: parseCoachOptions(parsed?.options, move, 3),
      extras: parseCoachOptions(parsed?.extras, "join", 2).map((o, i) => ({
        ...o,
        label: o.label === "接话" || o.label === "答" ? (i === 0 ? "延展" : "追深") : o.label,
      })),
      ms: result.ms,
    };
  });

export const expandTopic = createServerFn({ method: "POST" })
  .validator(
    (input: {
      lastHeard: string;
      recent: string[];
      topic: string;
      move: string;
      options: string[];
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
    }),
  )
  .handler(async ({ data }): Promise<
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
    if (!data.topic && !data.lastHeard && !data.options.length) {
      return { ok: false, error: "empty" };
    }
    const draft = heuristicEssay({
      topic: data.topic,
      lastHeard: data.lastHeard,
      recent: data.recent,
      options: data.options,
    });
    const sys =
      'You are DeepSearch for an English class in mainland China, NOT the live coach. The coach already gave 3 short lines to say NOW — listed in live_options. NEVER repeat or paraphrase those lines. ALL Chinese MUST be 简体中文. Return ONLY JSON: {"title":"...","contextEn":"...","contextZh":"...","viewEn":"...","viewZh":"...","facts":[{"en":"...","zh":"..."}],"angles":[{"en":"...","zh":"..."}],"qEn":"...","qZh":"...","aEn":"...","aZh":"...","say":"...","frames":[{"en":"...","zh":"..."}],"terms":[{"en":"...","zh":"..."}],"sources":[{"en":"...","zh":"..."}]}. Search = 3 facts with names/numbers/years. Deep = viewEn 40-70 words AND aEn 70-110 words (40-second talk). Fill En + 简体. No markdown.';
    const user = JSON.stringify({
      topic: data.topic || null,
      move: data.move || null,
      live_options: data.options,
      last_heard: data.lastHeard || null,
      recent_class: data.recent,
    });
    const flashP = chatFlash({
      system: sys,
      user,
      maxTokens: 1400,
      temperature: 0.25,
      timeoutMs: 8000,
    });
    const webP = chatDeepSearch({
      system: sys,
      user,
      maxTokens: 1400,
      timeoutMs: 10000,
    });
    const [flash, web] = await Promise.all([flashP, webP]);
    const fromWeb = web.ok ? extractJsonObject(web.text) : null;
    const fromFlash = flash.ok ? extractJsonObject(flash.text) : null;
    const webHas =
      fromWeb &&
      (Array.isArray(fromWeb.facts) && (fromWeb.facts as unknown[]).length >= 1 ||
        String(fromWeb.aEn ?? "").length > 60);
    const parsed = webHas ? { ...fromFlash, ...fromWeb } : fromFlash;
    const body = assembleEssay(draft, parsed, Math.max(flash.ok ? flash.ms : 0, web.ok ? web.ms : 0));
    return { ok: true as const, ...body, draft: Boolean(body.draft), ms: body.latencyMs };
  });

export const askTopic = createServerFn({ method: "POST" })
  .validator(
    (input: {
      q: string;
      history: { q: string; zh: string; en: string }[];
      recent: string[];
      topic: string;
    }) => ({
      q: String(input?.q ?? "")
        .trim()
        .slice(0, 500),
      history: Array.isArray(input?.history)
        ? input.history.slice(-8).map((h) => ({
            q: String(h?.q ?? "").slice(0, 220),
            zh: String(h?.zh ?? "").slice(0, 360),
            en: String(h?.en ?? "").slice(0, 360),
          }))
        : [],
      recent: Array.isArray(input?.recent)
        ? input.recent.map((s) => String(s).slice(0, 180)).slice(-8)
        : [],
      topic: String(input?.topic ?? "")
        .trim()
        .slice(0, 80),
    }),
  )
  .handler(async ({ data }): Promise<
    | { ok: true; zh: string; en: string; ms: number }
    | ChatErr
  > => {
    if (!data.q) return { ok: false, error: "empty" };
    const result = await chat46low({
      system:
        'Classroom thinking partner. Intermediate student in mainland China, English class. ALL zh MUST be 简体中文, never 繁體. Answer the question they actually asked — a definition, a how-to-say, a comparison, a stance — do NOT force a generic 4-sentence discussion template. Return ONLY JSON: {"zh":"...","en":"..."}. zh=简体中文 that answers the question first (what it is / the point / a reason), then one way to use it in class. 3-8 short sentences. en=spoken classroom English on THE SAME POINT, 3-8 sentences they can say; not a clone of zh. If they wrote 我想说…, en is that line plus a follow-up. class_so_far and topic are context only — never ignore the question. No markdown.',
      user: JSON.stringify({
        question: data.q,
        thread: data.history,
        class_so_far: data.recent,
        current_topic: data.topic || null,
      }),
      maxTokens: 900,
      timeoutMs: 12000,
    });
    if (!result.ok) return result;
    const parsed = extractJsonObject(result.text);
    return {
      ok: true,
      zh: pick(parsed, "zh") || result.text.trim(),
      en: pick(parsed, "en"),
      ms: result.ms,
    };
  });

export const quickTranslate = createServerFn({ method: "POST" })
  .validator((input: { text: string }) => ({
    text: String(input?.text ?? "")
      .trim()
      .slice(0, 280),
  }))
  .handler(async ({ data }): Promise<
    | { ok: true; out: string; dir: "zh-en" | "en-zh"; ms: number }
    | ChatErr
  > => {
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

function parseKeys(v: unknown, en: string): string[] {
  const out: string[] = [];
  if (Array.isArray(v)) {
    for (const it of v) {
      const w = String(it ?? "").trim();
      if (w.length > 1 && en.toLowerCase().includes(w.toLowerCase())) out.push(w);
      if (out.length === 4) break;
    }
  }
  if (out.length) return out;
  const stop = new Set([
    "that",
    "this",
    "with",
    "from",
    "have",
    "would",
    "could",
    "should",
    "about",
    "there",
    "their",
    "what",
    "when",
    "your",
    "will",
    "just",
    "them",
    "they",
    "then",
    "than",
    "also",
    "into",
    "more",
    "some",
    "been",
    "being",
    "because",
  ]);
  return en
    .replace(/[^A-Za-z' ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !stop.has(w.toLowerCase()))
    .slice(0, 3);
}

function parseCoachOptions(
  v: unknown,
  move: "answer" | "join",
  limit = 3,
): { label: string; en: string; zh: string; keys: string[] }[] {
  const fallback =
    limit === 2
      ? ["延展", "追深"]
      : move === "join"
        ? ["接话", "追问", "例子"]
        : ["答", "答", "答"];
  const out: { label: string; en: string; zh: string; keys: string[] }[] = [];
  if (Array.isArray(v)) {
    for (const it of v) {
      if (!it || typeof it !== "object") continue;
      const row = it as { label?: unknown; en?: unknown; zh?: unknown; keys?: unknown };
      const en = typeof row.en === "string" ? row.en.trim() : "";
      if (!en) continue;
      const zh = typeof row.zh === "string" ? row.zh.trim() : "";
      const label =
        typeof row.label === "string" && row.label.trim()
          ? row.label.trim().slice(0, 6)
          : fallback[out.length] ?? "答";
      out.push({ label, en, zh, keys: parseKeys(row.keys, en) });
      if (out.length === limit) break;
    }
  }
  return out;
}

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

type RecapOk = {
  ok: true;
  title: string;
  lede: string;
  ledeZh: string;
  sections: { heading: string; headingZh: string; body: string; bodyZh: string }[];
  outline: { heading: string; bullets: string[] }[];
  topics: { en: string; zh: string }[];
  patterns: ReturnType<typeof parseStudy>;
  lines: ReturnType<typeof parseStudy>;
  words: ReturnType<typeof parseStudy>;
  collos: ReturnType<typeof parseStudy>;
  grammar: ReturnType<typeof parseStudy>;
  skills: { en: string; zh: string }[];
  takeaways: { en: string; zh: string }[];
  ms: number;
};

export const recapClass = createServerFn({ method: "POST" })
  .validator(
    (input: {
      lines: { en: string; zh: string }[];
      topics: string[];
      notes: string[];
      coach?: { topic: string; brief: string; say: string[] }[];
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
            say: Array.isArray(c?.say) ? c.say.map((s) => String(s).slice(0, 140)).slice(0, 3) : [],
          }))
        : [],
    }),
  )
  .handler(async ({ data }): Promise<RecapOk | ChatErr> => {
    if (data.lines.length < 2) return { ok: false, error: "实录太短" };
    const tape = compactTape(data.lines).slice(0, 36);
    const payload = {
      transcript: tape,
      coach_topics: data.topics,
      coach_cards: data.coach,
      student_notes: data.notes,
    };
    const base = emptyRecap(data.topics[0] || "Class notes", data.topics);
    const contentSys =
      "CONTENT slot. English-class recap for a mainland student. English primary, 简体中文 in *Zh. " +
      GOLD_CONTENT +
      ' Return ONLY JSON: {"title":"...","lede":"...","ledeZh":"...","outline":[{"heading":"...","bullets":["..."]}],"sections":[{"heading":"...","headingZh":"...","body":"...","bodyZh":"..."}],"takeaways":[{"en":"...","zh":"..."}],"topics":[{"en":"...","zh":"..."}]}. No markdown.';
    const flashContent = chatFlash({
      system: contentSys,
      user: JSON.stringify(payload),
      maxTokens: 1800,
      temperature: 0.2,
      timeoutMs: 12000,
    });
    const flashStudy = chatFlash({
      system:
        "STUDY slot. 简体中文 glosses. Return ONLY JSON: {\"words\":[...],\"collos\":[...],\"patterns\":[...],\"grammar\":[...],\"lines\":[...],\"skills\":[{\"en\":\"...\",\"zh\":\"...\"}]}. Each study row {\"en\",\"zh\",\"use\",\"useZh\",\"example\",\"exampleZh\"}. " +
        GOLD_STUDY +
        " No markdown.",
      user: JSON.stringify({
        topics: data.topics,
        notes: data.notes,
        sample: tape.slice(0, 16),
      }),
      maxTokens: 1200,
      temperature: 0.2,
      timeoutMs: 10000,
    });
    const grokContent = (async () => {
      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) return { ok: false as const, error: "no-key" };
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 12000);
      const started = Date.now();
      try {
        const res = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          signal: ac.signal,
          body: JSON.stringify({
            model: "grok-4.6",
            temperature: 0.2,
            max_tokens: 1800,
            reasoning_effort: "low",
            messages: [
              { role: "system", content: contentSys },
              { role: "user", content: JSON.stringify(payload) },
            ],
          }),
        });
        clearTimeout(timer);
        if (!res.ok) return { ok: false as const, error: "bad" };
        return readChat(res, started);
      } catch {
        clearTimeout(timer);
        return { ok: false as const, error: "timeout" };
      }
    })();
    const [content, study, grok] = await Promise.all([flashContent, flashStudy, grokContent]);
    const fromFlash = content.ok ? extractJsonObject(content.text) ?? {} : {};
    const fromGrok = grok.ok ? extractJsonObject(grok.text) ?? {} : {};
    const grokBetter =
      Array.isArray(fromGrok.sections) &&
      (fromGrok.sections as unknown[]).length >=
        (Array.isArray(fromFlash.sections) ? (fromFlash.sections as unknown[]).length : 0) &&
      String(fromGrok.lede ?? "").length > 40;
    let parsed: Record<string, unknown> = {
      ...(grokBetter ? fromGrok : { ...fromFlash, ...fromGrok }),
      ...(study.ok ? extractJsonObject(study.text) ?? {} : {}),
    };
    let recap = assembleRecap(base, parsed);
    recap.latencyMs = Math.max(
      content.ok ? content.ms : 0,
      study.ok ? study.ms : 0,
      grok.ok ? grok.ms : 0,
    );
    if (!recap.lede && !recap.sections.length) {
      const slim = await chatFlash({
        system:
          "Write the recap UNDER these headings. Never return headings alone. ONLY JSON with title, lede, ledeZh, sections[{heading,headingZh,body,bodyZh}], takeaways[{en,zh}]. body has a paragraph plus 1. 2. 3. Zh is 简体中文 of the same body. Rewrite STT.",
        user: JSON.stringify(payload),
        maxTokens: 1600,
        temperature: 0.2,
        timeoutMs: 10000,
      });
      if (slim.ok) {
        parsed = { ...parsed, ...(extractJsonObject(slim.text) ?? {}) };
        recap = assembleRecap(base, parsed);
        recap.latencyMs += slim.ms;
      }
    }
    if (!recap.sections.length) {
      return { ok: false, error: "纪要没写出来，再点一次整理。" };
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
      ms: recap.latencyMs,
    };
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
  .handler(async ({ data }): Promise<
    | {
        ok: true;
        title: string;
        outline: { heading: string; bullets: string[] }[];
        topics: { en: string; zh: string }[];
        ms: number;
      }
    | ChatErr
  > => {
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
