import {
  expandTopic,
  liveCoach,
  liveOutline,
  liveTranslate,
  mintSttSecret,
  quickTranslate,
  recapClass,
  sayIt,
} from "@/lib/capcom-ai";
import { appNav } from "@/lib/nav";
import { useCapcom } from "@/lib/store";
import { createEngine } from "./engine";

export type { ClassEvent, ClassPhase } from "./class-machine";
export { isAwake, isInClass } from "./class-machine";
export type { Engine } from "./engine";

/** The one engine of this tab, bound to the store, the router (once mounted) and the real server functions. */
export const engine = createEngine({
  store: useCapcom,
  nav: appNav,
  api: {
    translate: liveTranslate,
    quick: quickTranslate,
    say: sayIt,
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
  sayLine,
  requestRecap,
  forkAndRecap,
} = engine;
