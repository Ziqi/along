import type { AppState } from "../state/app-state.ts";
import type {
  expandTopic,
  liveCoach,
  liveOutline,
  liveTranslate,
  mintSttSecret,
  quickTranslate,
  recapClass,
} from "../capcom-ai.ts";
import { parseClassMode, type ClassMode } from "../class-mode.ts";

/** A server function seen as a plain async function, so tests can hand in fakes. */
type Call<F> = F extends (...args: infer A) => infer R ? (...args: A) => R : never;

/** Every server call the engine makes, injected so no runtime imports the network. */
export type AiApi = {
  translate: Call<typeof liveTranslate>;
  quick: Call<typeof quickTranslate>;
  coach: Call<typeof liveCoach>;
  expand: Call<typeof expandTopic>;
  recap: Call<typeof recapClass>;
  outline: Call<typeof liveOutline>;
  mintStt: Call<typeof mintSttSecret>;
};

/** The store as the engine sees it: a snapshot getter. Zustand's `useCapcom` satisfies this. */
export type EngineStore = { getState: () => AppState };

export type EngineContext = {
  store: EngineStore;
  api: AiApi;
  now: () => number;
};

/** The class mode of the class being heard (falls back to the picker's value). */
export function liveMode(store: EngineStore): ClassMode {
  const s = store.getState();
  const ses = s.sessions.find((x) => s.liveId && x.id === s.liveId);
  return parseClassMode(ses?.classMode ?? s.classMode);
}

/** A small timer holder: one pending callback, replaced on every schedule. */
export function debounceSlot() {
  let handle: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule(ms: number, fn: () => void) {
      if (handle != null) clearTimeout(handle);
      handle = setTimeout(() => {
        handle = null;
        fn();
      }, ms);
    },
    cancel() {
      if (handle != null) clearTimeout(handle);
      handle = null;
    },
    get pending() {
      return handle != null;
    },
  };
}
