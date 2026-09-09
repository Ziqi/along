/**
 * Server-function entry points, re-exported from `src/lib/ai/` so existing
 * imports keep working. New code should import the capability file directly:
 * `stt` / `translate` / `coach` / `deep` / `recap`.
 */
export { mintSttSecret } from "./ai/stt";
export { liveTranslate, quickTranslate, sayIt } from "./ai/translate";
export { liveCoach } from "./ai/coach";
export { expandTopic } from "./ai/deep";
export { recapClass } from "./ai/recap";
export { catchUp, writeSegment } from "./ai/structure";
export type { AiErrorCode, AiFail } from "./ai/errors";
