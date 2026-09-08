import type { ClassSession } from "@/lib/types";
import {
  clearSyncState,
  isRemoved,
  isRemovedJot,
  markRemoved,
  readDiskSessions,
  readIndex,
  readSyncState,
  removedIds,
  writeSessions,
  writeSyncState,
  type SessionIndexRow,
} from "@/lib/persist";
import {
  markDropped,
  markSynced,
  resetCloudSync,
  restoreLedger,
  scheduleCloudPush,
  snapshotLedger,
  type SavedLedger,
} from "@/lib/session-sync";
import {
  mergeSessions as mergeSessionsPure,
  normalizeSessions as normalizeSessionsPure,
} from "@/lib/session-merge";
import { SESSION_SCHEMA_VERSION } from "@/lib/session-limits";

export { normJot, normRecap, mergeOne } from "@/lib/session-merge";

/**
 * Everything about the catalog at rest: reading it off this device, writing it
 * back, and keeping the cloud copy in step. No React, no HUD state — the store
 * calls in here. Shapes and merge rules live in `session-merge`; the disk layout
 * in `persist`; push planning in `session-sync`.
 */

export function normalizeSessions(raw: unknown): ClassSession[] {
  return normalizeSessionsPure(raw, isRemovedJot);
}

export function mergeSessions(a: ClassSession[], b: ClassSession[]): ClassSession[] {
  return mergeSessionsPure(a, b, isRemovedJot);
}

// ── Sync bookkeeping ────────────────────────────────────────────────────────
// Whose cloud copy this device last spoke to, where that pull ended, and what
// the server has acknowledged — saved together so a page load starts where the
// last one stopped instead of pushing the whole catalog again.

let syncUser: string | null = null;
let syncCursor: string | null = null;

function saveSync(ledger: SavedLedger = snapshotLedger()) {
  if (!syncUser) return;
  writeSyncState({ userId: syncUser, cursor: syncCursor, ledger });
}

if (typeof window !== "undefined") {
  const saved = readSyncState();
  syncUser = saved?.userId ?? null;
  syncCursor = saved?.cursor ?? null;
  restoreLedger(saved?.ledger, saveSync);
}

// ── Disk ────────────────────────────────────────────────────────────────────

/** A catalog row before its class has loaded: the index fields, nothing else. */
function skeleton(row: SessionIndexRow): ClassSession {
  return {
    id: row.id,
    schemaVersion: row.schemaVersion ?? SESSION_SCHEMA_VERSION,
    title: String(row.title ?? "课堂"),
    classMode: row.classMode,
    startedAt: typeof row.startedAt === "number" ? row.startedAt : 0,
    endedAt: typeof row.endedAt === "number" ? row.endedAt : null,
    updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : 0,
    notes: [],
    recap: null,
    transcript: [],
    coaches: [],
    essays: {},
    sourceId: row.sourceId ?? null,
    sourceTitle: row.sourceTitle ?? null,
    starred: Boolean(row.starred),
    starredAt: typeof row.starredAt === "number" ? row.starredAt : null,
  };
}

/**
 * What can be shown synchronously: the index, as skeleton sessions. The store
 * keeps `hydrated` false until `readStoredSessions` has filled them in.
 */
export function loadSessions(): ClassSession[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizeSessions(readIndex().map(skeleton));
  } catch {
    return [];
  }
}

let persistReady = typeof window === "undefined";
let persistQueue: ClassSession[] | null = null;

/**
 * Write the catalog: tombstoned ids dropped, changed classes to IndexedDB, the
 * index to localStorage, and one debounced cloud push of whatever changed.
 * Before hydrate finishes, writes are queued so a slow IndexedDB read cannot be
 * overwritten by a catalog of skeletons.
 */
export function persistSessions(sessions: ClassSession[], latest: () => ClassSession[]) {
  if (typeof window === "undefined") return;
  if (!persistReady) {
    persistQueue = mergeSessions(persistQueue ?? [], sessions);
    return;
  }
  writeSessions(sessions.filter((s) => !isRemoved(s.id)));
  scheduleCloudPush(
    () => ({ sessions: latest().filter((s) => !isRemoved(s.id)), removed: removedIds() }),
    async (plan) => {
      const m = await import("@/lib/recap-cloud");
      const out = await m.pushSessionsSafe({
        sessions: plan.bodies,
        recaps: plan.recaps,
        drop: plan.drop,
      });
      if (out.ok && out.stale?.length) cloudRefresher?.();
      return out;
    },
  );
}

/** Release the pre-hydrate queue: returns what was queued so the caller can merge and persist it. */
export function releasePersistQueue(): ClassSession[] | null {
  persistReady = true;
  const queued = persistQueue;
  persistQueue = null;
  return queued;
}

export function isPersistReady() {
  return persistReady;
}

/** Everything on this device, merged with `current`. */
export async function readDiskCatalog(current: ClassSession[]): Promise<ClassSession[]> {
  const disk = normalizeSessions(await readDiskSessions());
  return mergeSessions(current, disk);
}

// ── Cloud ───────────────────────────────────────────────────────────────────

let cloudRefresher: (() => void) | null = null;

/** Who to call when the server turns out to have newer rows than we pushed. */
export function setCloudRefresher(fn: (() => void) | null) {
  cloudRefresher = fn;
}

/**
 * Pull what changed on the server since the last cursor (everything, the first
 * time or for a different account), record it as synced, and return the merged
 * catalog. Throws when signed out or offline; callers treat that as "nothing
 * new".
 */
export async function pullCloudCatalog(current: ClassSession[]): Promise<ClassSession[]> {
  const cloud = await import("@/lib/recap-cloud");
  const pulled = await cloud.pullSessions({
    data: { since: syncCursor, sinceUser: syncUser },
  });
  if (syncUser && syncUser !== pulled.userId) {
    // Another account on this device: the old acknowledgements mean nothing here.
    resetCloudSync();
    clearSyncState();
    syncCursor = null;
  }
  syncUser = pulled.userId;
  for (const id of pulled.removed) markRemoved(id);
  markDropped(pulled.removed);
  const remote = normalizeSessions(pulled.sessions);
  markSynced(remote);
  syncCursor = pulled.cursor;
  saveSync();
  return mergeSessions(current, remote).filter((s) => !isRemoved(s.id));
}

/**
 * The slow half of hydrate: this device's IndexedDB, then the cloud when signed
 * in. Returns the merged catalog; the caller applies it and writes it back.
 */
export async function readStoredSessions(current: ClassSession[]): Promise<ClassSession[]> {
  let next = await readDiskCatalog(current);
  try {
    next = await pullCloudCatalog(next);
  } catch {
    /* signed out or offline */
  }
  return next;
}
