/**
 * Error codes shared by every AI server function and the client.
 *
 * The server returns `{ ok: false, code, error }`: `code` is the stable
 * contract to branch on, `error` is the Chinese line to show, produced here so
 * the wording lives in exactly one place. Client modules import this file too
 * (no server-only imports).
 */
export type AiErrorCode =
  | "unavailable"
  | "rate_limited"
  | "timeout"
  | "upstream"
  | "empty"
  | "no_zh"
  | "no_facts"
  | "too_short"
  | "essay_failed"
  | "study_failed"
  | "coach_incomplete"
  | "no_stt_secret";

export type AiFail = { ok: false; code: AiErrorCode; error: string; status?: number };

export function aiErrorText(code: AiErrorCode, status?: number): string {
  switch (code) {
    case "unavailable":
      return "AI 暂不可用";
    case "rate_limited":
      return "太频繁了，稍等一下。";
    case "timeout":
      return "timeout";
    case "upstream":
      return `xAI 错误 ${status ?? ""}`.trim();
    case "empty":
      return "empty";
    case "no_zh":
      return "no-zh";
    case "no_facts":
      return "没检索到，再点一次。";
    case "too_short":
      return "实录太短";
    case "essay_failed":
      return "纪要没写出来，再点一次整理。";
    case "study_failed":
      return "语言点没写出来，再点一次整理。";
    case "coach_incomplete":
      return "教练没给出三条，再听一句。";
    case "no_stt_secret":
      return "无听写密钥";
  }
}

export function aiFail(code: AiErrorCode, status?: number): AiFail {
  const fail: AiFail = { ok: false, code, error: aiErrorText(code, status) };
  if (status !== undefined) fail.status = status;
  return fail;
}

/** Codes where retrying the same request is pointless. */
export function isTerminalAiError(code: AiErrorCode | undefined) {
  return (
    code === "unavailable" ||
    code === "rate_limited" ||
    code === "empty" ||
    code === "too_short" ||
    code === "no_stt_secret"
  );
}

/** xAI refused the key itself: no credits, no licence, revoked. Asking again changes nothing. */
export function isKeyRefused(fail: { code: AiErrorCode; status?: number }) {
  return fail.code === "upstream" && (fail.status === 401 || fail.status === 402 || fail.status === 403);
}

/** A failure that the same request will get again: a terminal code, or a refused key. */
export function isTerminalAiFail(fail: { code: AiErrorCode; status?: number }) {
  return isTerminalAiError(fail.code) || isKeyRefused(fail);
}
