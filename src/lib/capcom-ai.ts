import { createServerFn } from "@tanstack/react-start";
import { extractJsonObject } from "@/lib/utils";

const FLASH = "grok-4.20-non-reasoning";
const FLASH_FALLBACK = "grok-4.3";

type ChatErr = { ok: false; error: string };

async function postChat(body: Record<string, unknown>) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false as const, error: "AI 暂不可用", res: null };
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  return { ok: true as const, res, error: "" };
}

async function readChat(res: Response, started: number) {
  if (!res.ok) return { ok: false as const, error: `xAI 错误 ${res.status}` };
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return {
    ok: true as const,
    text: body.choices?.[0]?.message?.content ?? "",
    ms: Date.now() - started,
  };
}

async function chatFlash(params: {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
}): Promise<{ ok: true; text: string; ms: number } | ChatErr> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "AI 暂不可用" };
  const started = Date.now();
  const messages = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];
  const temperature = params.temperature ?? 0.15;
  const first = await postChat({
    model: FLASH,
    temperature,
    max_tokens: params.maxTokens,
    messages,
  });
  if (!first.ok) return first;
  let res = first.res!;
  if (res.status === 400 || res.status === 404) {
    const fb = await postChat({
      model: FLASH_FALLBACK,
      temperature,
      max_tokens: params.maxTokens,
      messages,
    });
    if (!fb.ok) return fb;
    res = fb.res!;
  }
  return readChat(res, started);
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
  'Translate classroom English to spoken 简体中文. No thinking. Return ONLY JSON: {"items":[{"id":"...","zh":"..."}]}. zh=complete spoken Chinese of that line. No markdown.';

const COACH_SYS =
  'English-class coach. Intermediate Chinese student. No thinking. Return ONLY JSON: {"topic":"...","topicZh":"...","move":"answer"|"join","options":[{"label":"...","en":"...","zh":"...","keys":["..."]},{"label":"...","en":"...","zh":"...","keys":["..."]},{"label":"...","en":"...","zh":"...","keys":["..."]}]}. topic=ongoing theme ≤6 English words from recent_class. topicZh=简体中文 of topic. move=answer if last_heard is a question to reply to; move=join if discussion. ALWAYS exactly 3 options. NEVER repeat last_heard. If answer: 3 different spoken replies (agree / contrast / example), label each 答. If join: 1 接话 (add a point), 2 追问 (a follow-up question), 3 例子 (a short personal example). en=12-22 words spoken classroom English. zh=≤20 Chinese chars. keys=2-4 content words from en to highlight (nouns/verbs worth learning). Always fill 3 options. No markdown.';

export const liveTranslate = createServerFn({ method: "POST" })
  .validator((input: { lines: { id: string; en: string }[] }) => ({
    lines: Array.isArray(input?.lines)
      ? input.lines
          .slice(0, 4)
          .map((l) => ({
            id: String(l?.id ?? "").slice(0, 16),
            en: String(l?.en ?? "")
              .trim()
              .slice(0, 400),
          }))
          .filter((l) => l.id && l.en)
      : [],
  }))
  .handler(async ({ data }): Promise<
    | { ok: true; items: { id: string; zh: string }[]; ms: number }
    | ChatErr
  > => {
    if (!data.lines.length) return { ok: false, error: "empty" };
    const result = await chatFlash({
      system: TRANS_SYS,
      user: JSON.stringify({ lines: data.lines }),
      maxTokens: 90,
      temperature: 0.05,
    });
    if (!result.ok) return result;
    const parsed = extractJsonObject(result.text);
    const items: { id: string; zh: string }[] = [];
    if (Array.isArray(parsed?.items)) {
      for (const it of parsed.items) {
        if (!it || typeof it !== "object") continue;
        const row = it as { id?: unknown; zh?: unknown };
        const id = typeof row.id === "string" ? row.id : "";
        const zh = typeof row.zh === "string" ? row.zh.trim() : "";
        if (id && zh) items.push({ id, zh });
      }
    }
    if (!items.length && data.lines.length === 1) {
      items.push({
        id: data.lines[0]!.id,
        zh: pick(parsed, "zh") || data.lines[0]!.en,
      });
    }
    return { ok: true, items, ms: result.ms };
  });

export const liveCoach = createServerFn({ method: "POST" })
  .validator(
    (input: { last: string; recent: string[]; intent: string }) => ({
      last: String(input?.last ?? "")
        .trim()
        .slice(0, 400),
      recent: Array.isArray(input?.recent)
        ? input.recent.map((s) => String(s).slice(0, 220)).slice(-16)
        : [],
      intent: String(input?.intent ?? "")
        .trim()
        .slice(0, 400),
    }),
  )
  .handler(async ({ data }): Promise<
    | {
        ok: true;
        topic: string;
        topicZh: string;
        move: "answer" | "join";
        options: { label: string; en: string; zh: string; keys: string[] }[];
        ms: number;
      }
    | ChatErr
  > => {
    if (!data.last && !data.intent) return { ok: false, error: "empty" };
    const result = await chatFlash({
      system: COACH_SYS,
      user: JSON.stringify({
        last_heard: data.last || null,
        recent_class: data.recent,
        student_intent: data.intent || null,
      }),
      maxTokens: 360,
      temperature: 0.35,
    });
    if (!result.ok) return result;
    const parsed = extractJsonObject(result.text);
    const move = pick(parsed, "move") === "join" ? "join" : "answer";
    return {
      ok: true,
      topic: pick(parsed, "topic"),
      topicZh: pick(parsed, "topicZh"),
      move,
      options: parseCoachOptions(parsed?.options, move),
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
        viewZh: string;
        viewEn: string;
        qZh: string;
        qEn: string;
        aZh: string;
        aEn: string;
        say: string;
        terms: { en: string; zh: string }[];
        ms: number;
      }
    | ChatErr
  > => {
    if (!data.topic && !data.lastHeard && !data.options.length) {
      return { ok: false, error: "empty" };
    }
    const result = await chat46low({
      system:
        'DeepSearch briefing for English class. Intermediate Chinese student. Return ONLY JSON: {"title":"...","viewZh":"...","viewEn":"...","qZh":"...","qEn":"...","aZh":"...","aEn":"...","say":"...","terms":[{"en":"...","zh":"..."}]}. title=English topic ≤6 words. viewZh=one clear Chinese stance, 2-3 sentences with a reason. viewEn=the same stance in spoken classroom English, 2-3 sentences. qEn=a discussable question they can raise. qZh=Chinese of that question. aZh=a deeper Chinese answer, 3-5 sentences, with an example or tradeoff. aEn=spoken English of that answer. say=one English follow-up. terms=3 glosses. Always fill viewEn, aEn, qEn. Opinions, not a recap. No markdown.',
      user: JSON.stringify({
        topic: data.topic || null,
        move: data.move || null,
        live_options: data.options,
        last_heard: data.lastHeard || null,
        recent_class: data.recent,
      }),
      maxTokens: 780,
    });
    if (!result.ok) return result;
    const parsed = extractJsonObject(result.text);
    return {
      ok: true,
      title: pick(parsed, "title") || data.topic,
      viewZh: pick(parsed, "viewZh"),
      viewEn: pick(parsed, "viewEn"),
      qZh: pick(parsed, "qZh"),
      qEn: pick(parsed, "qEn"),
      aZh: pick(parsed, "aZh"),
      aEn: pick(parsed, "aEn"),
      say: pick(parsed, "say"),
      terms: parseTerms(parsed?.terms),
      ms: result.ms,
    };
  });

export const askTopic = createServerFn({ method: "POST" })
  .validator(
    (input: {
      q: string;
      history: { q: string; zh: string; en: string }[];
      recent: string[];
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
    }),
  )
  .handler(async ({ data }): Promise<
    | { ok: true; zh: string; en: string; ms: number }
    | ChatErr
  > => {
    if (!data.q) return { ok: false, error: "empty" };
    const result = await chatFlash({
      system:
        'English-class Q&A. Intermediate Chinese student. They may type a question OR what they want to say. Return ONLY JSON: {"zh":"...","en":"..."}. zh=classroom Chinese, 4-7 short sentences they can discuss: include a discussable point and one example. en=spoken classroom English, 4-7 sentences they can actually say in class, NOT a translation of zh — a full English turn. If they wrote an intent (我想说…), en is how to say it, plus a short follow-up question. Always fill both. No markdown.',
      user: JSON.stringify({
        question: data.q,
        thread: data.history,
        class_so_far: data.recent,
      }),
      maxTokens: 700,
      temperature: 0.3,
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
): { label: string; en: string; zh: string; keys: string[] }[] {
  const fallback = move === "join" ? ["接话", "追问", "例子"] : ["答", "答", "答"];
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
      if (out.length === 3) break;
    }
  }
  return out;
}

function parseTerms(v: unknown): { en: string; zh: string }[] {
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
  return out.slice(0, 4);
}

function parseSections(v: unknown): { heading: string; body: string }[] {
  if (!Array.isArray(v)) return [];
  const out: { heading: string; body: string }[] = [];
  for (const it of v) {
    if (!it || typeof it !== "object") continue;
    const row = it as { heading?: unknown; body?: unknown };
    const heading = typeof row.heading === "string" ? row.heading.trim() : "";
    const body = typeof row.body === "string" ? row.body.trim() : "";
    if (heading && body) out.push({ heading, body });
    if (out.length === 4) break;
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

export const recapClass = createServerFn({ method: "POST" })
  .validator(
    (input: {
      lines: { en: string; zh: string }[];
      topics: string[];
      notes: string[];
    }) => ({
      lines: Array.isArray(input?.lines)
        ? input.lines
            .slice(0, 80)
            .map((l) => ({
              en: String(l?.en ?? "")
                .trim()
                .slice(0, 220),
              zh: String(l?.zh ?? "")
                .trim()
                .slice(0, 160),
            }))
            .filter((l) => l.en)
        : [],
      topics: Array.isArray(input?.topics)
        ? input.topics.map((s) => String(s).slice(0, 80)).slice(0, 8)
        : [],
      notes: Array.isArray(input?.notes)
        ? input.notes.map((s) => String(s).slice(0, 180)).slice(0, 12)
        : [],
    }),
  )
  .handler(async ({ data }): Promise<
    | {
        ok: true;
        title: string;
        lede: string;
        sections: { heading: string; body: string }[];
        topics: { en: string; zh: string }[];
        patterns: { en: string; zh: string }[];
        lines: { en: string; zh: string }[];
        words: { en: string; zh: string }[];
        ms: number;
      }
    | ChatErr
  > => {
    if (data.lines.length < 2) return { ok: false, error: "实录太短" };
    const result = await chat46low({
      system:
        'Write a complete English-class debrief for an intermediate Chinese student. Return ONLY JSON: {"title":"...","lede":"...","sections":[{"heading":"...","body":"..."}],"topics":[{"en":"...","zh":"..."}],"patterns":[{"en":"...","zh":"..."}],"lines":[{"en":"...","zh":"..."}],"words":[{"en":"...","zh":"..."}]}. title=≤12 Chinese chars, a real class name they can keep. lede=2-3 Chinese sentences: what this class was about and why it matters. sections=2-4 chapters; heading=short Chinese; body=2-4 Chinese paragraphs separated by \\n\\n, each paragraph may include one English sentence in quotes. topics=2-5. patterns=3-5 reusable English frames + Chinese. lines=3-5 spoken English they can reuse + Chinese. words=4-8 with Chinese. Ground in transcript. No markdown.',
      user: JSON.stringify({
        transcript: data.lines,
        coach_topics: data.topics,
        student_notes: data.notes,
      }),
      maxTokens: 1100,
      timeoutMs: 14000,
    });
    if (!result.ok) return result;
    const parsed = extractJsonObject(result.text);
    return {
      ok: true,
      title: pick(parsed, "title"),
      lede: pick(parsed, "lede"),
      sections: parseSections(parsed?.sections),
      topics: parsePairs(parsed?.topics, 5),
      patterns: parsePairs(parsed?.patterns, 5),
      lines: parsePairs(parsed?.lines, 5),
      words: parsePairs(parsed?.words, 8),
      ms: result.ms,
    };
  });
