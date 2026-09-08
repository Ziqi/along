/**
 * The one place model names live. "Flash" is this repo's nickname for the
 * fastest chat model chain — not an xAI product name. The reasoning model is
 * used with `reasoning_effort: low` for coach cards, DeepSearch prose and the
 * handout essay.
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

export function xaiKey() {
  return process.env.XAI_API_KEY ?? "";
}
