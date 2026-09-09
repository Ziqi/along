/**
 * Per-caller ceilings for the AI server functions, in calls per minute.
 * Shared by the server guard and by tests; safe to import anywhere.
 *
 * Sized for one student in one class, with room for retries: captions arrive
 * about once every few seconds and each may be tried three times, the mic
 * mints a new secret on every 开始听 / 继续听 and on every reconnect, a coach
 * card comes every few seconds at most, a stretch of the class closes every
 * few minutes, DeepSearch, catch-up and the recap are clicks.
 * Anything past these numbers is a loop or a script, not a class.
 */
export const AI_LIMITS = {
  stt: 20,
  translate: 120,
  coach: 30,
  deep: 6,
  /** A stretch closes a handful of times an hour; bursts happen after 继续听. */
  segment: 6,
  /** 「刚才讲了什么」, on request. */
  catchup: 4,
  recap: 3,
  quick: 40,
} as const;

export type AiKind = keyof typeof AI_LIMITS;

/**
 * How many callers' worth one IP address may spend per minute, per kind. A
 * classroom or an office sits behind one router, so the IP bucket is a
 * backstop against scripts rotating device ids, never the limit a student
 * meets. The dear calls (a 30-minute STT credential, a handout, a search) get
 * a narrow share: thirty students each start class once and each write one
 * handout, they do not do it forty times a minute.
 */
export const IP_SHARE: Record<AiKind, number> = {
  stt: 5,
  translate: 40,
  coach: 20,
  deep: 5,
  segment: 10,
  catchup: 10,
  recap: 5,
  quick: 10,
};
