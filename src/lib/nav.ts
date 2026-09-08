/**
 * The three faces of the app as places the engine can send the student to,
 * without the engine knowing the router. The app shell registers the real
 * navigator once the router exists; before that (server render, first paint)
 * every call is a no-op.
 */
export type AppNav = {
  /** `/` — the classroom. */
  home: () => void;
  /** `/class/:id` — one handout. */
  classPage: (id: string) => void;
  /** `/class` — the catalog with nothing picked. */
  catalog: () => void;
  /** `/review` — the drill deck, for one class or all. */
  review: (classId?: string) => void;
};

let current: AppNav | null = null;

export function setAppNav(nav: AppNav | null) {
  current = nav;
}

export const appNav: AppNav = {
  home: () => current?.home(),
  classPage: (id) => current?.classPage(id),
  catalog: () => current?.catalog(),
  review: (classId) => current?.review(classId),
};

/** `?catalog=true`, `?edit=1`: an on/off switch in the URL. Anything else is off. */
export function searchFlag(v: unknown): v is true {
  return v === true || v === 1 || v === "1" || v === "true";
}

/** A class id in the URL, or nothing. */
export function searchId(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** What the handout page shows: which class, reading or drilling, catalog drawer, editing. */
export type HandoutSearch = { catalog?: true; edit?: true };
export type ReviewSearch = { class?: string; catalog?: true };

export function parseHandoutSearch(search: Record<string, unknown>): HandoutSearch {
  const out: HandoutSearch = {};
  if (searchFlag(search.catalog)) out.catalog = true;
  if (searchFlag(search.edit)) out.edit = true;
  return out;
}

export function parseReviewSearch(search: Record<string, unknown>): ReviewSearch {
  const out: ReviewSearch = {};
  const id = searchId(search.class);
  if (id) out.class = id;
  if (searchFlag(search.catalog)) out.catalog = true;
  return out;
}
