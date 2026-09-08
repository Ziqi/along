import { SESSION_KEEP } from "@/lib/session-limits";
import { mergeOne, normalizeSession } from "@/lib/session-merge";
import type { ClassSession } from "@/lib/types";
import type { SavedLedger } from "@/lib/session-sync";

/**
 * Where the catalog lives on this device.
 *
 * IndexedDB is the store: one record per class, so a note added to one class
 * rewrites one class, not the whole catalog, and forty full hours fit (they do
 * not in localStorage). localStorage keeps only what has to be there before
 * IndexedDB answers: a small index of the catalog for the first paint, the
 * tombstones, and the cloud sync bookkeeping.
 *
 * Catalogs written before this layout — one JSON blob under `along.sessions`
 * in either store — are read once on the next hydrate and cleared after the
 * per-class store has been written.
 */
const DB = "along";
const DB_VERSION = 2;
const KV = "kv";
const SESSIONS = "sessions";
const LEGACY_KEY = "along.sessions";
const INDEX_KEY = "along.index";
const SYNC_KEY = "along.sync";
const PING = "along.ping";
const REMOVED_KEY = "along.removed";
const REMOVED_JOTS_KEY = "along.removed-jots";

/** What the catalog shows before the classes themselves have loaded. */
export type SessionIndexRow = Pick<
  ClassSession,
  | "id"
  | "title"
  | "classMode"
  | "startedAt"
  | "endedAt"
  | "updatedAt"
  | "starred"
  | "starredAt"
  | "sourceId"
  | "sourceTitle"
  | "schemaVersion"
>;

/** Cloud sync bookkeeping: whose cursor this is, where the last pull ended, what the server has acknowledged. */
export type SyncState = { userId: string; cursor: string | null; ledger: SavedLedger };

const removed = new Set<string>();
const removedJots = new Set<string>();
/** id -> JSON as last written to (or read from) the per-class store. */
const written = new Map<string, string>();
/** True once a write has landed in the per-class store and the old blob is gone. */
let legacyCleared = false;
/**
 * True once the old single-blob catalog has been read (or found absent). Only
 * then may a write delete it: a blob that failed to parse stays where it is,
 * so nothing is thrown away that was never carried over.
 */
let legacyRead = false;

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeKey(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function loadSet(key: string, into: Set<string>) {
  const list = readJson(key);
  if (Array.isArray(list)) for (const id of list) if (id) into.add(String(id));
}

/** Union with what is on disk first: another tab may have added ids since this one loaded. */
function saveSet(key: string, set: Set<string>) {
  loadSet(key, set);
  writeJson(key, [...set].slice(-120));
}

if (typeof window !== "undefined") {
  loadSet(REMOVED_KEY, removed);
  loadSet(REMOVED_JOTS_KEY, removedJots);
}

// ── Tombstones ──────────────────────────────────────────────────────────────

export function markRemoved(id: string) {
  removed.add(id);
  saveSet(REMOVED_KEY, removed);
}

export function isRemoved(id: string) {
  return removed.has(id);
}

export function removedIds() {
  return [...removed];
}

/** Forget every tombstone: another account signed in, and these were the last one's. */
export function clearRemoved() {
  removed.clear();
  removeKey(REMOVED_KEY);
}

export function markRemovedJot(id: string) {
  removedJots.add(id);
  saveSet(REMOVED_JOTS_KEY, removedJots);
}

export function isRemovedJot(id: string) {
  return removedJots.has(id);
}

// ── IndexedDB ───────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
        if (!db.objectStoreNames.contains(SESSIONS)) db.createObjectStore(SESSIONS);
      };
      req.onsuccess = () => {
        const db = req.result;
        // Another tab upgrading the schema closes this connection; reopen lazily.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      // A failed open is not final: the next call tries again instead of
      // living with the localStorage fallback for the rest of the page.
      req.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
      // Blocked = an older tab still holds the schema; the request completes
      // once it closes, so keep waiting rather than giving up.
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });
  return dbPromise;
}

/** The read could not be trusted: nothing derived from it may be written back. */
export class DiskReadError extends Error {
  constructor() {
    super("IndexedDB read failed");
    this.name = "DiskReadError";
  }
}

function parseRow(v: unknown): unknown {
  if (typeof v !== "string") return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/** All rows of a store. Rejects on failure: an empty answer must mean an empty store. */
function idbGetAll(db: IDBDatabase, store: string): Promise<{ keys: IDBValidKey[]; values: unknown[] }> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(store, "readonly");
      const os = tx.objectStore(store);
      const keysReq = os.getAllKeys();
      const valsReq = os.getAll();
      tx.oncomplete = () => resolve({ keys: keysReq.result ?? [], values: valsReq.result ?? [] });
      tx.onerror = () => reject(new DiskReadError());
      tx.onabort = () => reject(new DiskReadError());
    } catch {
      reject(new DiskReadError());
    }
  });
}

/** One value, `undefined` when the read itself failed (as opposed to `null` for "no such key"). */
function idbGet(db: IDBDatabase, store: string, key: IDBValidKey): Promise<unknown> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

/** Raw localStorage text, `undefined` when storage itself is unreachable. */
function readRaw(key: string): string | null | undefined {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return undefined;
  }
}

/**
 * Every class on disk, as raw rows for `normalizeSessions`: the per-class store,
 * plus whatever an older layout left behind (read until the new store has been
 * written once). Throws `DiskReadError` when the per-class store could not be
 * read, so the caller never mistakes a failed read for an empty catalog.
 */
export async function readDiskSessions(): Promise<unknown[]> {
  const rows: unknown[] = [];
  let legacyOk = true;
  const db = await openDb();
  if (db) {
    const { keys, values } = await idbGetAll(db, SESSIONS);
    values.forEach((v, i) => {
      const row = parseRow(v);
      if (row && typeof row === "object") {
        rows.push(row);
        if (typeof v === "string") written.set(String(keys[i]), v);
      }
    });
    const legacyRaw = await idbGet(db, KV, LEGACY_KEY);
    if (legacyRaw === undefined) legacyOk = false;
    else if (legacyRaw !== null) {
      const legacy = parseRow(legacyRaw);
      if (Array.isArray(legacy)) rows.push(...legacy);
      else legacyOk = false;
    }
  }
  const localRaw = readRaw(LEGACY_KEY);
  if (localRaw === undefined) legacyOk = false;
  else if (localRaw) {
    const legacyLocal = parseRow(localRaw);
    if (Array.isArray(legacyLocal)) rows.push(...legacyLocal);
    else legacyOk = false;
  }
  legacyRead = legacyOk;
  return rows;
}

/** The catalog index kept for the first paint; empty when there is none yet. */
export function readIndex(): SessionIndexRow[] {
  const raw = readJson(INDEX_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is SessionIndexRow => Boolean(r && typeof r === "object" && (r as { id?: unknown }).id));
}

export function indexRow(s: ClassSession): SessionIndexRow {
  return {
    id: s.id,
    title: s.title,
    classMode: s.classMode,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    updatedAt: s.updatedAt,
    starred: s.starred,
    starredAt: s.starredAt,
    sourceId: s.sourceId,
    sourceTitle: s.sourceTitle,
    schemaVersion: s.schemaVersion,
  };
}

/**
 * Write the catalog: the index to localStorage, changed classes to their own
 * IndexedDB records, tombstoned ids deleted. `prune` also deletes records that
 * are not in `sessions` at all — only right after a full read, when the list in
 * hand is known to be the whole catalog and not another tab's newer one.
 */
export function writeSessions(
  sessions: ClassSession[],
  opts: { prune?: boolean; skip?: (id: string) => boolean } = {},
) {
  if (typeof window === "undefined") return;
  const kept = sessions.filter((s) => !removed.has(s.id)).slice(0, SESSION_KEEP);
  writeJson(INDEX_KEY, kept.map(indexRow));
  // A row this tab only knows from the index (its class not loaded yet) must
  // never reach the class store: an empty shell would cover the real class.
  const full = opts.skip ? kept.filter((s) => !opts.skip!(s.id)) : kept;
  void writeIdb(full, Boolean(opts.prune), new Set(kept.map((s) => s.id)));
}

/** Parse a stored row back into a class, or null when it is not one. */
function rowToSession(raw: unknown): ClassSession | null {
  const row = parseRow(raw);
  return row && typeof row === "object" ? normalizeSession(row) : null;
}

async function writeIdb(full: ClassSession[], prune: boolean, keep: Set<string>) {
  const db = await openDb();
  if (!db) {
    // No IndexedDB (rare): the whole catalog falls back to localStorage, as many as fit.
    if (!writeJson(LEGACY_KEY, full)) writeJson(LEGACY_KEY, full.slice(0, 12));
    return;
  }
  const puts: ClassSession[] = [];
  for (const s of full) {
    if (written.get(s.id) !== JSON.stringify(s)) puts.push(s);
  }
  const deletes = new Set<string>([...removed].filter((id) => written.has(id)));
  if (prune) for (const id of written.keys()) if (!keep.has(id)) deletes.add(id);
  const dropLegacy = legacyRead && !legacyCleared;
  if (!puts.length && !deletes.size && !dropLegacy) return;
  const landed = new Map<string, string>();
  const ok = await new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction([SESSIONS, KV], "readwrite");
      const os = tx.objectStore(SESSIONS);
      // Read-merge-write inside the one transaction: another tab may have put a
      // newer copy of this class since we read it, and a merge never shortens
      // a transcript or drops a note, where a plain put would.
      for (const mine of puts) {
        const req = os.get(mine.id);
        req.onsuccess = () => {
          const disk = rowToSession(req.result);
          const next = disk && disk.id === mine.id ? mergeOne(disk, mine, isRemovedJot) : mine;
          const json = JSON.stringify(next);
          landed.set(mine.id, json);
          os.put(json, mine.id);
        };
      }
      for (const id of deletes) os.delete(id);
      if (dropLegacy) tx.objectStore(KV).delete(LEGACY_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
  if (!ok) return;
  for (const [id, json] of landed) written.set(id, json);
  for (const id of deletes) written.delete(id);
  if (dropLegacy) {
    legacyCleared = true;
    removeKey(LEGACY_KEY);
  }
}

// ── Cloud sync bookkeeping ──────────────────────────────────────────────────

export function readSyncState(): SyncState | null {
  const raw = readJson(SYNC_KEY) as Partial<SyncState> | null;
  if (!raw || typeof raw !== "object" || typeof raw.userId !== "string") return null;
  return {
    userId: raw.userId,
    cursor: typeof raw.cursor === "string" ? raw.cursor : null,
    ledger: (raw.ledger ?? { body: {}, recap: {}, dropped: [] }) as SavedLedger,
  };
}

export function writeSyncState(state: SyncState) {
  writeJson(SYNC_KEY, state);
}

export function clearSyncState() {
  removeKey(SYNC_KEY);
}

// ── Health ──────────────────────────────────────────────────────────────────

export async function probeStorage(): Promise<{
  ok: boolean;
  local: boolean;
  idb: boolean;
}> {
  if (typeof window === "undefined") return { ok: false, local: false, idb: false };
  const token = `ok-${Date.now()}`;
  let local = false;
  let idb = false;
  try {
    window.localStorage.setItem(PING, token);
    local = window.localStorage.getItem(PING) === token;
    window.localStorage.removeItem(PING);
  } catch {
    /* quota / private */
  }
  const db = await openDb();
  if (db) {
    idb = await new Promise((resolve) => {
      try {
        const tx = db.transaction(KV, "readwrite");
        const store = tx.objectStore(KV);
        store.put(token, PING);
        const req = store.get(PING);
        req.onsuccess = () => {
          store.delete(PING);
          resolve(req.result === token);
        };
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }
  return { ok: local || idb, local, idb };
}
