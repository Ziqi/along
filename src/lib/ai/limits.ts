/**
 * Per-caller ceilings for the AI server functions, in calls per minute.
 * Shared by the server guard and by tests; safe to import anywhere.
 *
 * Sized for one student in one class: captions arrive about once every few
 * seconds, a coach card every few seconds at most, DeepSearch and the recap
 * are clicks. Anything past these numbers is a loop or a script, not a class.
 */
export const AI_LIMITS = {
  stt: 10,
  translate: 90,
  coach: 30,
  deep: 12,
  outline: 15,
  recap: 8,
  quick: 40,
} as const;

export type AiKind = keyof typeof AI_LIMITS;
