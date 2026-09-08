/**
 * The one place model names live. "Flash" is this repo's nickname for the
 * fastest chat model chain — not an xAI product name. The reasoning model is
 * used with `reasoning_effort: low` for coach cards, DeepSearch prose and the
 * handout essay.
 *
 * Names checked against GET /v1/models for this app's key (2026-09-08):
 * grok-4.20-0309-non-reasoning, grok-4.3, grok-4.6 exist. grok-4.20-non-reasoning
 * is not listed; xAI still redirects it to the 0309 alias, so it stays as a
 * second try. grok-4.3 is last — it reasons and is slower.
 */
export const FLASH_MODELS = [
  "grok-4.20-0309-non-reasoning",
  "grok-4.20-non-reasoning",
  "grok-4.3",
] as const;

export const REASONING_MODEL = "grok-4.6";

export const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";
export const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses";
export const XAI_REALTIME_SECRETS_URL = "https://api.x.ai/v1/realtime/client_secrets";

/**
 * App owner's xAI key, injected by the platform. Read at call time with a
 * computed name so a bundler cannot replace this with an empty string, and
 * so the client bundle never sees the value (this file is also imported from
 * isomorphic modules).
 */
export function xaiKey() {
  try {
    const env = globalThis.process?.env;
    return (env && env["XAI_API_KEY"]) || "";
  } catch {
    return "";
  }
}
