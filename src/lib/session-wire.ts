import type { ClassRecap, ClassSession } from "./types.ts";

/**
 * How a class travels and rests: as two rows. The body is the hour itself —
 * catalog fields, transcript, coach cards, DeepSearch, notes. The recap is the
 * handout derived from it, edited on its own and rewritten without touching the
 * hour. Pure shapes and helpers, shared by the client planner, the server
 * functions and the tests.
 */

/** A class without its handout. */
export type SessionBody = Omit<ClassSession, "recap">;

/** A handout, addressed by the class it was written from. */
export type RecapRow = { sessionId: string; recap: ClassRecap };

/** Columns kept beside the body blob so the catalog can be listed without it. */
export type SessionMeta = {
  title: string;
  classMode: string;
  startedAt: number;
  endedAt: number | null;
  starred: boolean;
  schemaVersion: number;
  updatedAt: number;
};

export type PushInput = { sessions: SessionBody[]; recaps: RecapRow[]; drop: string[] };

export type PushOutput = {
  ok: true;
  /** Bodies stored without their tape because the full hour did not fit. */
  skipped: string[];
  /** Ids the server kept its own, newer copy of (or had already deleted) — pull to catch up. */
  stale: string[];
};

export type PullInput = {
  /** Server cursor from the last pull; omit for everything. */
  since?: string | null;
  /** Whose cursor it is — a different account gets a full pull. */
  sinceUser?: string | null;
};

export type PullOutput = {
  sessions: ClassSession[];
  removed: string[];
  /** Pass back as `since` next time. */
  cursor: string;
  userId: string;
  /** True when this was everything, not just changes. */
  full: boolean;
};

export function splitSession(s: ClassSession): { body: SessionBody; recap: ClassRecap | null } {
  const { recap, ...body } = s;
  return { body, recap: recap ?? null };
}

export function joinSession(body: SessionBody, recap: ClassRecap | null): ClassSession {
  return { ...body, recap };
}

export function sessionMeta(body: SessionBody): SessionMeta {
  return {
    title: String(body.title ?? "").slice(0, 200),
    classMode: String(body.classMode ?? "interactive"),
    startedAt: typeof body.startedAt === "number" ? body.startedAt : 0,
    endedAt: typeof body.endedAt === "number" ? body.endedAt : null,
    starred: Boolean(body.starred),
    schemaVersion: typeof body.schemaVersion === "number" ? body.schemaVersion : 0,
    updatedAt: typeof body.updatedAt === "number" ? body.updatedAt : 0,
  };
}

/** The body with its tape left out: what the cloud keeps when the hour is too big. */
export function slimBody(body: SessionBody): SessionBody {
  return { ...body, transcript: [], coaches: [], essays: {} };
}

/**
 * Cheap, stable fingerprint of serialized state (cyrb53). The sync ledger keeps
 * one per row instead of the whole JSON, so it can live in localStorage across
 * page loads without doubling the catalog.
 */
export function fingerprint(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

export function bodyFingerprint(body: SessionBody): string {
  return fingerprint(JSON.stringify(body));
}

export function recapFingerprint(recap: ClassRecap | null): string {
  return recap ? fingerprint(JSON.stringify(recap)) : "";
}
