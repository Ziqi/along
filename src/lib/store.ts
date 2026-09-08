import { create } from "zustand";
import type { AppState } from "@/lib/state/app-state";
import { createLiveSlice } from "@/lib/state/live-slice";
import { createSessionsSlice } from "@/lib/state/sessions-slice";

export type { AppState } from "@/lib/state/app-state";
export type { LiveSlice } from "@/lib/state/live-slice";
export type { SessionsSlice } from "@/lib/state/sessions-slice";
export { sortSessions } from "@/lib/session-order";

/**
 * One store, two slices: `live-slice` holds what is on screen during the class
 * (captions, mic, coach card, essay); `sessions-slice` holds the catalog and
 * the class-level actions. Reading and writing the catalog at rest lives in
 * `session-persist`, cloud batching in `session-sync`.
 */
export const useCapcom = create<AppState>()((...a) => ({
  ...createLiveSlice(...a),
  ...createSessionsSlice(...a),
}));
