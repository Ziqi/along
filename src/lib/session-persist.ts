import type {
  ClassRecap,
  ClassSession,
  CoachCard,
  Jot,
  RecapCoach,
  RecapOutline,
  RecapStudy,
  TopicEssay,
} from "@/lib/types";
import {
  isRemoved,
  isRemovedJot,
  readIdbSessions,
  readLocalSessions,
  removedIds,
  writeLocalSessions,
} from "@/lib/persist";
import { markDropped, markSynced, scheduleCloudPush } from "@/lib/session-sync";
import { SESSION_KEEP, SESSION_SCHEMA_VERSION } from "@/lib/session-limits";
import { newerSession, sortSessions } from "@/lib/session-order";
import { parseClassMode } from "@/lib/class-mode";
import { topicKey } from "@/lib/utils";

/**
 * Everything about a `ClassSession` at rest: reading rows of any age into the
 * current shape, merging two copies of the same class, and writing the catalog
 * to disk plus the cloud. No React, no HUD state — the store calls in here.
 */

// ── Normalize ───────────────────────────────────────────────────────────────

export function normJot(raw: Partial<Jot> & { text?: string; id?: string }): Jot {
  const id = raw.id || `jot-${Math.random().toString(36).slice(2, 8)}`;
  const src = raw.src === "coach" || raw.src === "deep" || raw.src === "say" ? raw.src : "hand";
  const at = typeof raw.at === "number" ? raw.at : Date.now();
  if (raw.en || raw.zh) {
    return {
      id,
      en: String(raw.en ?? ""),
      zh: String(raw.zh ?? ""),
      src,
      at,
      pending: raw.pending,
    };
  }
  const text = String(raw.text ?? "").trim();
  const isZh = /[\u4e00-\u9fff]/.test(text);
  return { id, en: isZh ? "" : text, zh: isZh ? text : "", src, at };
}

function normPair(raw: unknown): { en: string; zh: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { en?: unknown; zh?: unknown };
  const en = typeof row.en === "string" ? row.en.trim() : "";
  const zh = typeof row.zh === "string" ? row.zh.trim() : "";
  if (!en && !zh) return null;
  return { en, zh };
}

function normStudy(raw: unknown): RecapStudy | null {
  const pair = normPair(raw);
  if (!pair) return null;
  const row = (raw && typeof raw === "object" ? raw : {}) as {
    use?: unknown;
    useZh?: unknown;
    example?: unknown;
    exampleZh?: unknown;
    note?: unknown;
  };
  return {
    ...pair,
    use: String(row.use ?? row.note ?? "").trim(),
    useZh: String(row.useZh ?? "").trim(),
    example: String(row.example ?? "").trim(),
    exampleZh: String(row.exampleZh ?? "").trim(),
  };
}

function normTable(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as {
    leftHead?: unknown;
    leftHeadZh?: unknown;
    rightHead?: unknown;
    rightHeadZh?: unknown;
    rows?: unknown;
  };
  const rows = Array.isArray(t.rows)
    ? t.rows
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const r = row as { left?: unknown; leftZh?: unknown; right?: unknown; rightZh?: unknown };
          const left = String(r.left ?? "").trim();
          const right = String(r.right ?? "").trim();
          if (!left || !right) return null;
          return {
            left,
            leftZh: String(r.leftZh ?? "").trim(),
            right,
            rightZh: String(r.rightZh ?? "").trim(),
          };
        })
        .filter((row): row is { left: string; leftZh: string; right: string; rightZh: string } =>
          Boolean(row),
        )
    : [];
  if (rows.length < 2) return null;
  return {
    leftHead: String(t.leftHead ?? "").trim() || "This side",
    leftHeadZh: String(t.leftHeadZh ?? "").trim(),
    rightHead: String(t.rightHead ?? "").trim() || "That side",
    rightHeadZh: String(t.rightHeadZh ?? "").trim(),
    rows: rows.slice(0, 6),
  };
}

const pairs = (v: unknown) =>
  (Array.isArray(v) ? v : []).map(normPair).filter(Boolean) as { en: string; zh: string }[];
const studies = (v: unknown) =>
  (Array.isArray(v) ? v : []).map(normStudy).filter(Boolean) as RecapStudy[];

export function normRecap(raw: unknown): ClassRecap | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<ClassRecap> & {
    arc?: string;
    collos?: unknown;
    grammar?: unknown;
    skills?: unknown;
    takeaways?: unknown;
    marks?: unknown;
    coachPack?: unknown;
  };
  const sections = Array.isArray(r.sections)
    ? r.sections
        .map((s) => ({
          heading: String(s?.heading ?? "").trim(),
          headingZh: String((s as { headingZh?: string })?.headingZh ?? "").trim(),
          body: String(s?.body ?? "").trim(),
          bodyZh: String((s as { bodyZh?: string })?.bodyZh ?? "").trim(),
          table: normTable((s as { table?: unknown }).table),
        }))
        .filter((s) => s.heading && s.body)
    : [];
  return {
    title: String(r.title ?? "").trim(),
    lede: String(r.lede ?? r.arc ?? "").trim(),
    ledeZh: String((r as { ledeZh?: string }).ledeZh ?? "").trim(),
    sections,
    topics: pairs(r.topics),
    patterns: studies(r.patterns),
    lines: studies(r.lines),
    words: studies(r.words),
    collos: studies(r.collos),
    grammar: studies(r.grammar),
    skills: pairs(r.skills),
    outline: Array.isArray(r.outline)
      ? (r.outline as RecapOutline[])
          .map((o) => ({
            heading: String(o?.heading ?? "").trim(),
            bullets: Array.isArray(o?.bullets)
              ? o.bullets.map((b) => String(b).trim()).filter(Boolean)
              : [],
          }))
          .filter((o) => o.heading)
      : [],
    takeaways: pairs(r.takeaways),
    marks: Array.isArray(r.marks)
      ? (r.marks as unknown[]).map((m) => String(m).trim()).filter(Boolean)
      : [],
    coachPack: Array.isArray(r.coachPack) ? (r.coachPack as RecapCoach[]) : [],
    draft: r.draft === true,
    latencyMs: typeof r.latencyMs === "number" ? r.latencyMs : 0,
    at: typeof r.at === "number" ? r.at : 0,
  };
}

function pinEssaysToCoachIds(essays: Record<string, TopicEssay>, coaches: CoachCard[]) {
  const next = { ...essays };
  for (const c of coaches) {
    if (!c?.id || next[c.id]) continue;
    const k = topicKey(c.topic ?? "");
    if (k && next[k]) next[c.id] = next[k];
  }
  return next;
}

/** Rows of any age → current `ClassSession` shape, stamped with the schema version. */
export function normalizeSessions(raw: unknown): ClassSession[] {
  if (!Array.isArray(raw)) return [];
  const out: ClassSession[] = [];
  for (const row of raw.slice(0, SESSION_KEEP)) {
    if (!row || typeof row !== "object") continue;
    const s = row as ClassSession;
    if (!s.id) continue;
    try {
      out.push({
        ...s,
        schemaVersion: SESSION_SCHEMA_VERSION,
        notes: Array.isArray(s.notes) ? s.notes.map((n) => normJot(n)) : [],
        recap: normRecap(s.recap),
        coaches: Array.isArray(s.coaches) ? s.coaches : [],
        essays: pinEssaysToCoachIds(
          s.essays && typeof s.essays === "object" ? s.essays : {},
          Array.isArray(s.coaches) ? s.coaches : [],
        ),
        transcript: Array.isArray(s.transcript)
          ? (s.transcript.map(normPair).filter(Boolean) as { en: string; zh: string }[])
          : [],
        classMode: parseClassMode((s as { classMode?: unknown }).classMode),
        sourceId: s.sourceId ?? null,
        sourceTitle: s.sourceTitle ?? null,
        starred: Boolean(s.starred),
        starredAt: typeof s.starredAt === "number" ? s.starredAt : null,
        updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : (s.startedAt ?? Date.now()),
        startedAt: typeof s.startedAt === "number" ? s.startedAt : Date.now(),
        endedAt: typeof s.endedAt === "number" ? s.endedAt : (s.endedAt ?? null),
        title: String(s.title ?? "课堂"),
      });
    } catch {
      /* skip bad row */
    }
  }
  return out;
}

// ── Merge ───────────────────────────────────────────────────────────────────

function recapScore(r: ClassRecap | null) {
  if (!r) return 0;
  return (
    (!r.draft && r.lede ? 2000 : 0) +
    (r.sections?.length ?? 0) * 40 +
    (r.words?.length ?? 0) * 8 +
    (r.patterns?.length ?? 0) * 6 +
    (r.outline?.length ?? 0) * 8 +
    (r.lede?.length ?? 0)
  );
}

function mergeRecap(a: ClassRecap | null, b: ClassRecap | null) {
  if (!a) return b;
  if (!b) return a;
  if ((b.at ?? 0) !== (a.at ?? 0)) return (b.at ?? 0) > (a.at ?? 0) ? b : a;
  return recapScore(b) >= recapScore(a) ? b : a;
}

function mergeNotes(a: Jot[], b: Jot[]) {
  const map = new Map<string, Jot>();
  for (const j of [...a, ...b]) {
    if (isRemovedJot(j.id)) continue;
    map.set(j.id, j);
  }
  return [...map.values()].sort((x, y) => x.at - y.at).slice(-40);
}

/**
 * Two copies of one class → one. The more recently updated copy leads; the
 * transcript / coach / essay fields keep whichever copy has more, so a stale
 * device cannot shorten a class it never finished hearing.
 */
export function mergeOne(a: ClassSession, b: ClassSession): ClassSession {
  const newer = newerSession(a, b);
  const older = newer === b ? a : b;
  return {
    ...newer,
    title: newer.title,
    endedAt: a.endedAt && b.endedAt ? Math.max(a.endedAt, b.endedAt) : (a.endedAt ?? b.endedAt),
    recap: mergeRecap(a.recap, b.recap),
    transcript:
      (a.transcript?.length ?? 0) >= (b.transcript?.length ?? 0) ? a.transcript : b.transcript,
    notes: mergeNotes(a.notes ?? [], b.notes ?? []),
    coaches:
      (a.coaches?.length ?? 0) >= (b.coaches?.length ?? 0) ? (a.coaches ?? []) : (b.coaches ?? []),
    essays:
      Object.keys(b.essays ?? {}).length >= Object.keys(a.essays ?? {}).length
        ? (b.essays ?? {})
        : (a.essays ?? {}),
    updatedAt: Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0),
    startedAt: Math.min(a.startedAt, b.startedAt),
    sourceId: newer.sourceId ?? older.sourceId,
    sourceTitle: newer.sourceTitle ?? older.sourceTitle,
    starred: newer.starred,
    starredAt: newer.starred ? (newer.starredAt ?? older.starredAt) : null,
    classMode: parseClassMode(newer.classMode ?? older.classMode),
  };
}

export function mergeSessions(a: ClassSession[], b: ClassSession[]): ClassSession[] {
  const map = new Map<string, ClassSession>();
  for (const s of [...a, ...b]) {
    const prev = map.get(s.id);
    map.set(s.id, prev ? mergeOne(prev, s) : s);
  }
  return sortSessions([...map.values()]).slice(0, SESSION_KEEP);
}

// ── Disk + cloud ────────────────────────────────────────────────────────────

export function loadSessions(): ClassSession[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizeSessions(readLocalSessions());
  } catch {
    return [];
  }
}

let persistReady = typeof window === "undefined";
let persistQueue: ClassSession[] | null = null;

/**
 * Write the catalog: merge with what is on disk (another tab may have written),
 * drop tombstoned ids, write localStorage + IndexedDB, and schedule one
 * debounced cloud push of whatever changed. Before hydrate finishes, writes are
 * queued so a slow IndexedDB read cannot be overwritten by an empty catalog.
 */
export function persistSessions(sessions: ClassSession[], latest: () => ClassSession[]) {
  if (typeof window === "undefined") return;
  if (!persistReady) {
    persistQueue = mergeSessions(persistQueue ?? [], sessions);
    return;
  }
  const merged = mergeSessions(loadSessions(), sessions).filter((s) => !isRemoved(s.id));
  writeLocalSessions(merged);
  scheduleCloudPush(
    () => ({ sessions: latest().filter((s) => !isRemoved(s.id)), removed: removedIds() }),
    async (dirty, drop) => {
      const m = await import("@/lib/recap-cloud");
      return m.pushSessionsSafe(dirty, drop);
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

/**
 * The slow half of hydrate: IndexedDB, then the cloud when signed in. Returns
 * the merged catalog, having recorded cloud rows as already synced and cloud
 * tombstones as removed. Caller applies it to the store and writes it back.
 */
export async function readStoredSessions(current: ClassSession[]): Promise<ClassSession[]> {
  const idb = normalizeSessions(await readIdbSessions());
  let next = mergeSessions(current, idb);
  try {
    const cloud = await import("@/lib/recap-cloud");
    const pulled = await cloud.pullSessions();
    const { markRemoved } = await import("@/lib/persist");
    for (const id of pulled.removed) markRemoved(id);
    markDropped(pulled.removed);
    const remote = normalizeSessions(pulled.sessions);
    markSynced(remote);
    next = mergeSessions(next, remote).filter((s) => !isRemoved(s.id));
  } catch {
    /* signed out or offline */
  }
  return next;
}
