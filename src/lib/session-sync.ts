import type { ClassSession } from "@/lib/types";

/**
 * Cloud push planning for class sessions: one shared debounce, only sessions
 * whose serialized form changed since the last acknowledged push, only
 * tombstones not yet acknowledged. The store calls `scheduleCloudPush` on
 * every local persist; this module decides what actually goes over the wire.
 *
 * `planCloudPush` is pure so it can be tested with a clock and no browser.
 */
export type PushOutcome = {
  ok: boolean;
  /** Ids the server refused to store (payload too large); acknowledged so they stop retrying until they change. */
  skipped?: string[];
  /** True when the caller is signed out; back off instead of retrying every flush. */
  unauthorized?: boolean;
};

export type Pusher = (sessions: ClassSession[], drop: string[]) => Promise<PushOutcome>;

export type SyncLedger = {
  /** id -> JSON as last acknowledged by the server. */
  pushed: Map<string, string>;
  /** Tombstone ids the server has acknowledged. */
  dropped: Set<string>;
};

export function planCloudPush(
  sessions: ClassSession[],
  removed: string[],
  ledger: SyncLedger,
): { dirty: { session: ClassSession; json: string }[]; drop: string[] } {
  const dirty: { session: ClassSession; json: string }[] = [];
  for (const s of sessions) {
    const json = JSON.stringify(s);
    if (ledger.pushed.get(s.id) !== json) dirty.push({ session: s, json });
  }
  const drop = removed.filter((id) => !ledger.dropped.has(id));
  return { dirty, drop };
}

export const CLOUD_DEBOUNCE_MS = 1500;
export const CLOUD_BACKOFF_MS = 60_000;

type Scheduler = {
  ledger: SyncLedger;
  timer: ReturnType<typeof setTimeout> | null;
  latest: (() => { sessions: ClassSession[]; removed: string[] }) | null;
  pushing: boolean;
  again: boolean;
  blockedUntil: number;
};

const state: Scheduler = {
  ledger: { pushed: new Map(), dropped: new Set() },
  timer: null,
  latest: null,
  pushing: false,
  again: false,
  blockedUntil: 0,
};

/** Remember sessions as already on the server (after a pull), so hydrate does not re-push them. */
export function markSynced(sessions: ClassSession[]) {
  for (const s of sessions) state.ledger.pushed.set(s.id, JSON.stringify(s));
}

export function markDropped(ids: string[]) {
  for (const id of ids) state.ledger.dropped.add(id);
}

/** Forget every acknowledgement (sign-in changed, or a test wants a clean slate). */
export function resetCloudSync() {
  state.ledger.pushed.clear();
  state.ledger.dropped.clear();
  state.blockedUntil = 0;
  state.again = false;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
}

/**
 * Debounced: many persists within `CLOUD_DEBOUNCE_MS` collapse into one push
 * that reads the freshest snapshot at fire time.
 */
export function scheduleCloudPush(
  latest: () => { sessions: ClassSession[]; removed: string[] },
  push: Pusher,
  now = Date.now(),
) {
  state.latest = latest;
  if (state.timer) return;
  const wait = Math.max(CLOUD_DEBOUNCE_MS, state.blockedUntil - now);
  state.timer = setTimeout(() => {
    state.timer = null;
    void flush(push);
  }, wait);
}

async function flush(push: Pusher) {
  if (state.pushing) {
    state.again = true;
    return;
  }
  const snapshot = state.latest?.();
  if (!snapshot) return;
  const plan = planCloudPush(snapshot.sessions, snapshot.removed, state.ledger);
  if (!plan.dirty.length && !plan.drop.length) return;
  state.pushing = true;
  try {
    const out = await push(
      plan.dirty.map((d) => d.session),
      plan.drop,
    );
    if (out.ok) {
      const skipped = new Set(out.skipped ?? []);
      for (const d of plan.dirty) state.ledger.pushed.set(d.session.id, d.json);
      for (const id of skipped) state.ledger.pushed.set(id, state.ledger.pushed.get(id) ?? "");
      for (const id of plan.drop) state.ledger.dropped.add(id);
    } else if (out.unauthorized) {
      state.blockedUntil = Date.now() + CLOUD_BACKOFF_MS;
    }
  } finally {
    state.pushing = false;
    if (state.again) {
      state.again = false;
      scheduleCloudPush(state.latest ?? (() => snapshot), push);
    }
  }
}
