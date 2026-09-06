import type { ClassSession } from "@/lib/types";

const KEY = "along.sessions";
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
