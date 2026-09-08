import type { ClassSession } from "./types.ts";
import {
  bodyFingerprint,
  recapFingerprint,
  splitSession,
  type RecapRow,
  type SessionBody,
} from "./session-wire.ts";

/**
 * Cloud push planning for class sessions: one shared debounce, only rows whose
 * serialized form changed since the last acknowledged push, only tombstones not
 * yet acknowledged. A class is two rows — the hour and its handout — so an
 * edit to the handout pushes the handout alone.
 *
 * The ledger of acknowledgements is a set of fingerprints, small enough to be
 * saved across page loads; `planCloudPush` is pure so it can be tested with no
 * browser and no clock.
 */
export type PushOutcome = {
  ok: boolean;
  /** Bodies the server stored without their tape; acknowledged so they stop retrying until they change. */
  skipped?: string[];
  /** Ids the server kept a newer copy of; the caller should pull. */
  stale?: string[];
  /** True when the caller is signed out; back off instead of retrying every flush. */
  unauthorized?: boolean;
};

export type PushPlan = {
  bodies: SessionBody[];
  recaps: RecapRow[];
  drop: string[];
  /** Fingerprints to record once the server says ok. */
  marks: { body: [string, string][]; recap: [string, string][] };
};

export type Pusher = (plan: PushPlan) => Promise<PushOutcome>;

export type SyncLedger = {
  /** id -> fingerprint of the body as last acknowledged by the server. */
  body: Map<string, string>;
  /** id -> fingerprint of the handout as last acknowledged by the server. */
  recap: Map<string, string>;
  /** Tombstone ids the server has acknowledged. */
  dropped: Set<string>;
};

/** The ledger as JSON for localStorage. */
export type SavedLedger = {
  body: Record<string, string>;
  recap: Record<string, string>;
  dropped: string[];
};

export function planCloudPush(
  sessions: ClassSession[],
  removed: string[],
  ledger: SyncLedger,
): PushPlan {
  const plan: PushPlan = { bodies: [], recaps: [], drop: [], marks: { body: [], recap: [] } };
  for (const s of sessions) {
    const { body, recap } = splitSession(s);
    const bodyFp = bodyFingerprint(body);
    if (ledger.body.get(s.id) !== bodyFp) {
      plan.bodies.push(body);
      plan.marks.body.push([s.id, bodyFp]);
    }
    const recapFp = recapFingerprint(recap);
    if (recap && ledger.recap.get(s.id) !== recapFp) {
      plan.recaps.push({ sessionId: s.id, recap });
      plan.marks.recap.push([s.id, recapFp]);
    }
  }
  plan.drop = removed.filter((id) => !ledger.dropped.has(id));
  return plan;
}

export function emptyLedger(): SyncLedger {
  return { body: new Map(), recap: new Map(), dropped: new Set() };
}

export function exportLedger(ledger: SyncLedger): SavedLedger {
  return {
    body: Object.fromEntries(ledger.body),
    recap: Object.fromEntries(ledger.recap),
    dropped: [...ledger.dropped].slice(-200),
  };
}

export function importLedger(saved: SavedLedger | null | undefined): SyncLedger {
  const ledger = emptyLedger();
  if (!saved || typeof saved !== "object") return ledger;
  for (const [id, fp] of Object.entries(saved.body ?? {})) ledger.body.set(id, String(fp));
  for (const [id, fp] of Object.entries(saved.recap ?? {})) ledger.recap.set(id, String(fp));
  for (const id of saved.dropped ?? []) ledger.dropped.add(String(id));
  return ledger;
}

/**
 * Split one plan into requests the server will take: a first sync of forty
 * full hours is several megabytes, more than one POST may carry. Each chunk is
 * self-contained (its own marks), so it can be acknowledged on its own.
 */
export const PUSH_CHUNK_CHARS = 1_500_000;

export function chunkPlan(plan: PushPlan, maxChars = PUSH_CHUNK_CHARS): PushPlan[] {
  const chunks: PushPlan[] = [];
  let cur: PushPlan = { bodies: [], recaps: [], drop: [...plan.drop], marks: { body: [], recap: [] } };
  let size = 0;
  const flushCur = () => {
    if (cur.bodies.length || cur.recaps.length || cur.drop.length) chunks.push(cur);
    cur = { bodies: [], recaps: [], drop: [], marks: { body: [], recap: [] } };
    size = 0;
  };
  const marks = { body: new Map(plan.marks.body), recap: new Map(plan.marks.recap) };
  for (const body of plan.bodies) {
    const n = JSON.stringify(body).length;
    if (size && size + n > maxChars) flushCur();
    cur.bodies.push(body);
    const fp = marks.body.get(body.id);
    if (fp) cur.marks.body.push([body.id, fp]);
    size += n;
  }
  for (const row of plan.recaps) {
    const n = JSON.stringify(row.recap).length;
    if (size && size + n > maxChars) flushCur();
    cur.recaps.push(row);
    const fp = marks.recap.get(row.sessionId);
    if (fp) cur.marks.recap.push([row.sessionId, fp]);
    size += n;
  }
  flushCur();
  return chunks;
}

export const CLOUD_DEBOUNCE_MS = 1500;
export const CLOUD_BACKOFF_MS = 60_000;
/** After a failed push: 4 s, 8 s, 16 s … up to `CLOUD_BACKOFF_MS`. */
export const CLOUD_RETRY_BASE_MS = 4000;

type Scheduler = {
  ledger: SyncLedger;
  timer: ReturnType<typeof setTimeout> | null;
  latest: (() => { sessions: ClassSession[]; removed: string[] }) | null;
  pushing: boolean;
  again: boolean;
  blockedUntil: number;
  failures: number;
  onLedger: ((saved: SavedLedger) => void) | null;
};

const state: Scheduler = {
  ledger: emptyLedger(),
  timer: null,
  latest: null,
  pushing: false,
  again: false,
  blockedUntil: 0,
  failures: 0,
  onLedger: null,
};

/** Wait before the next attempt after `failures` consecutive failed pushes. */
export function retryWaitMs(failures: number) {
  return Math.min(CLOUD_BACKOFF_MS, CLOUD_RETRY_BASE_MS * 2 ** Math.max(0, failures - 1));
}

function ledgerChanged() {
  state.onLedger?.(exportLedger(state.ledger));
}

/** Restore acknowledgements saved by an earlier page load, and where to save them from now on. */
export function restoreLedger(
  saved: SavedLedger | null | undefined,
  onChange: (saved: SavedLedger) => void,
) {
  state.ledger = importLedger(saved);
  state.onLedger = onChange;
}

/** The live ledger as it would be saved. */
export function snapshotLedger(): SavedLedger {
  return exportLedger(state.ledger);
}

/** Remember sessions as already on the server (after a pull), so hydrate does not re-push them. */
export function markSynced(sessions: ClassSession[]) {
  for (const s of sessions) {
    const { body, recap } = splitSession(s);
    state.ledger.body.set(s.id, bodyFingerprint(body));
    if (recap) state.ledger.recap.set(s.id, recapFingerprint(recap));
  }
  ledgerChanged();
}

export function markDropped(ids: string[]) {
  for (const id of ids) state.ledger.dropped.add(id);
  ledgerChanged();
}

/** Forget every acknowledgement (sign-in changed, or a test wants a clean slate). */
export function resetCloudSync() {
  state.ledger = emptyLedger();
  state.blockedUntil = 0;
  state.again = false;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  ledgerChanged();
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
  if (!plan.bodies.length && !plan.recaps.length && !plan.drop.length) return;
  state.pushing = true;
  try {
    for (const chunk of chunkPlan(plan)) {
      const out = await push(chunk);
      if (!out.ok) {
        // Nothing in this chunk is acknowledged; the next flush re-plans it.
        // Signed out: wait for the next edit. Anything else: retry with backoff.
        state.failures += 1;
        if (out.unauthorized) {
          state.blockedUntil = Date.now() + CLOUD_BACKOFF_MS;
        } else {
          state.blockedUntil = Date.now() + retryWaitMs(state.failures);
          state.again = true;
        }
        break;
      }
      state.failures = 0;
      // A row the server kept a newer copy of is not acknowledged: after the
      // pull merges that copy in, the next edit must still go up.
      const stale = new Set(out.stale ?? []);
      for (const [id, fp] of chunk.marks.body) if (!stale.has(id)) state.ledger.body.set(id, fp);
      for (const [id, fp] of chunk.marks.recap) if (!stale.has(id)) state.ledger.recap.set(id, fp);
      for (const id of chunk.drop) state.ledger.dropped.add(id);
      ledgerChanged();
    }
  } finally {
    state.pushing = false;
    if (state.again) {
      state.again = false;
      scheduleCloudPush(state.latest ?? (() => snapshot), push);
    }
  }
}
