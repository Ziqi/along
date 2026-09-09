import { createServerFn } from "@tanstack/react-start";
import { extractJsonObject } from "@/lib/json-object";
import { takeAiToken } from "./bucket";
import { aiFail, type AiFail } from "./errors";
import { aiGuard } from "./guard";
import { chatFlash } from "./llm/transport";
import { hasHan, pick } from "./parse";
import { QUICK_EN_TO_ZH_SYS, QUICK_ZH_TO_EN_SYS, SAY_IT_SYS, TRANSLATE_BATCH_SYS, TRANSLATE_SYS } from "./prompts";

/** Lines the client may send in one call (`TRANS_BATCH` on the client is smaller). */
export const TRANSLATE_LINES_MAX = 6;

/**
 * Settled caption lines → 简体中文, one call for up to `TRANSLATE_LINES_MAX`
 * lines. One line uses the single-line prompt; several use the batch prompt
 * and come back under their ids. The client queues newest first, three calls
 * in flight.
 */
export const liveTranslate = createServerFn({ method: "POST" })
  .validator((input: { lines: { id: string; en: string }[] }) => ({
    lines: Array.isArray(input?.lines)
      ? input.lines
          .slice(0, TRANSLATE_LINES_MAX)
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
    { ok: true; items: { id: string; zh: string }[]; ms: number } | AiFail
  > => {
    const gate = takeAiToken(context.caller, "translate");
    if (!gate.ok) return aiFail("rate_limited");
    if (!data.lines.length) return aiFail("empty");
    if (data.lines.length === 1) {
      const line = data.lines[0]!;
      const result = await chatFlash({
        system: TRANSLATE_SYS,
        user: line.en,
        maxTokens: 80,
        temperature: 0,
        timeoutMs: 8000,
        json: true,
        tag: "translate",
      });
      if (!result.ok) return result;
      const parsed = extractJsonObject(result.text);
      let zh = pick(parsed, "zh");
      if (!zh && Array.isArray(parsed?.items)) {
        const row = parsed.items[0] as { zh?: unknown } | undefined;
        zh = typeof row?.zh === "string" ? row.zh.trim() : "";
      }
      if (!hasHan(zh)) {
        const m = result.text.match(/[\u4e00-\u9fff][^"\n]{0,120}/);
        zh = m?.[0]?.trim() ?? "";
      }
      if (!hasHan(zh)) return aiFail("no_zh");
      return { ok: true, items: [{ id: line.id, zh }], ms: result.ms };
    }
    const result = await chatFlash({
      system: TRANSLATE_BATCH_SYS,
      user: JSON.stringify({ lines: data.lines }),
      maxTokens: 60 + 90 * data.lines.length,
      temperature: 0,
      timeoutMs: 9000,
      json: true,
      tag: "translate.batch",
    });
    if (!result.ok) return result;
    const parsed = extractJsonObject(result.text);
    const rows = Array.isArray(parsed?.items) ? (parsed.items as { id?: unknown; zh?: unknown }[]) : [];
    const byId = new Map<string, string>();
    rows.forEach((row, i) => {
      const zh = typeof row?.zh === "string" ? row.zh.trim() : "";
      if (!hasHan(zh)) return;
      const id = typeof row?.id === "string" && data.lines.some((l) => l.id === row.id) ? row.id : data.lines[i]?.id;
      if (id && !byId.has(id)) byId.set(id, zh);
    });
    const items = data.lines.filter((l) => byId.has(l.id)).map((l) => ({ id: l.id, zh: byId.get(l.id)! }));
    if (!items.length) return aiFail("no_zh");
    return { ok: true, items, ms: result.ms };
  });

/** Either direction, plain text out. Used by the jot pad. */
export const quickTranslate = createServerFn({ method: "POST" })
  .validator((input: { text: string }) => ({
    text: String(input?.text ?? "")
      .trim()
      .slice(0, 280),
  }))
  .middleware([aiGuard])
  .handler(async ({ data, context }): Promise<
    { ok: true; out: string; dir: "zh-en" | "en-zh"; ms: number } | AiFail
  > => {
    const gate = takeAiToken(context.caller, "quick");
    if (!gate.ok) return aiFail("rate_limited");
    if (!data.text) return aiFail("empty");
    const toEn = hasHan(data.text);
    const dir = toEn ? "zh-en" : "en-zh";
    const result = await chatFlash({
      system: toEn ? QUICK_ZH_TO_EN_SYS : QUICK_EN_TO_ZH_SYS,
      user: data.text,
      maxTokens: 80,
      tag: "quick",
    });
    if (!result.ok) return result;
    return { ok: true, out: result.text.trim(), dir, ms: result.ms };
  });

/** 「我想说」: a Chinese thought → one line the student can say in this class. */
export const sayIt = createServerFn({ method: "POST" })
  .validator((input: { text: string; recent?: string[] }) => ({
    text: String(input?.text ?? "")
      .trim()
      .slice(0, 200),
    recent: Array.isArray(input?.recent)
      ? input.recent.map((s) => String(s).slice(0, 200)).slice(-6)
      : [],
  }))
  .middleware([aiGuard])
  .handler(async ({ data, context }): Promise<
    { ok: true; en: string; zh: string; ms: number } | AiFail
  > => {
    const gate = takeAiToken(context.caller, "quick");
    if (!gate.ok) return aiFail("rate_limited");
    if (!data.text) return aiFail("empty");
    const result = await chatFlash({
      system: SAY_IT_SYS,
      user: JSON.stringify({ want_to_say: data.text, recent_class: data.recent }),
      maxTokens: 160,
      temperature: 0.3,
      timeoutMs: 9000,
      json: true,
      tag: "say",
    });
    if (!result.ok) return result;
    const parsed = extractJsonObject(result.text);
    const en = pick(parsed, "en") || (hasHan(result.text) ? "" : result.text.trim());
    if (!en || hasHan(en)) return aiFail("empty");
    const zh = pick(parsed, "zh") || data.text;
    return { ok: true, en, zh, ms: result.ms };
  });
