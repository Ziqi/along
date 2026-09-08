/**
 * Per-caller ceilings for the AI server functions, in calls per minute.
 * Shared by the server guard and by tests; safe to import anywhere.
 *
 * Sized for one student in one class, with room for retries: captions arrive
 * about once every few seconds and each may be tried three times, the mic
 * mints a new secret on every 开始听 / 继续听 and on every reconnect, a coach
 * card comes every few seconds at most, DeepSearch and the recap are clicks.
 * Anything past these numbers is a loop or a script, not a class.
 */
export const AI_LIMITS = {
  stt: 20,
  translate: 120,
  coach: 30,
  deep: 12,
  outline: 15,
  recap: 8,
  quick: 40,
} as const;

/**
 * How many callers' worth one IP address may spend per minute. A classroom or
 * an office sits behind one router; the IP bucket is a backstop against
 * scripts rotating device ids, never the limit a student meets.
 */
export const IP_SHARE = 40;

export type AiKind = keyof typeof AI_LIMITS;
