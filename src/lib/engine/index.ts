import {
  expandTopic,
  liveCoach,
  liveOutline,
  liveTranslate,
  mintSttSecret,
  quickTranslate,
  recapClass,
} from "@/lib/capcom-ai";
import { useCapcom } from "@/lib/store";
import { createEngine } from "./engine";

export type { ClassEvent, ClassPhase } from "./class-machine";
export { isAwake, isInClass } from "./class-machine";
export type { Engine } from "./engine";

/** The one engine of this tab, bound to the store and the real server functions. */
export const engine = createEngine({
  store: useCapcom,
  api: {
    translate: liveTranslate,
    quick: quickTranslate,
    coach: liveCoach,
    expand: expandTopic,
    recap: recapClass,
    outline: liveOutline,
    mintStt: mintSttSecret,
  },
});

export const {
  arm,
  safe,
  endClass,
  goHomeSafe,
  openRecap,
  abortLive,
  ingest,
  retryPendingZh,
  requestCoach,
  setCoachLive,
  requestEssay,
  captureNote,
  requestRecap,
  forkAndRecap,
} = engine;
