import type { ClassSession } from "@/lib/types";

const KEY = "along.sessions";
const PING = "along.ping";
const DB = "along";
const STORE = "kv";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function readLocalSessions(): unknown {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return [];
}

export async function readIdbSessions(): Promise<unknown> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        const v = req.result;
        if (typeof v === "string") {
          try {
            resolve(JSON.parse(v));
            return;
          } catch {
            resolve([]);
            return;
          }
        }
        resolve(v ?? []);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export function writeLocalSessions(sessions: ClassSession[]) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(sessions.slice(0, 40));
  try {
    window.localStorage.setItem(KEY, payload);
  } catch {
    /* quota */
  }
  void writeIdb(payload);
}

async function writeIdb(payload: string) {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(payload, KEY);
  } catch {
    /* ignore */
  }
}

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
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
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

