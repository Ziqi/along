import type { LiveSlice } from "./live-slice";
import type { SessionsSlice } from "./sessions-slice";

/** The whole store: the class happening now plus the catalog of classes. */
export type AppState = LiveSlice & SessionsSlice;
