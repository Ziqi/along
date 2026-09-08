import type {
  ClassRecap,
  ClassSession,
  CoachCard,
  Jot,
  RecapCoach,
  RecapOutline,
  RecapStudy,
  TopicEssay,
} from "./types.ts";
import { SESSION_KEEP, SESSION_SCHEMA_VERSION } from "./session-limits.ts";
import { newerSession, sortSessions } from "./session-order.ts";
import { parseClassMode } from "./class-mode.ts";
import { topicKey } from "./utils.ts";

/**
 * Two things about a `ClassSession` at rest, both pure: reading rows of any age
 * into the current shape, and merging two copies of one class.
 *
 * Merge policy — the updater wins, field by field:
 * - catalog fields (title, pin, mode, source) come from the copy updated last;
 * - the handout comes from the copy whose `recap.at` is later — every edit
 *   bumps it, so an edit made on one device is never covered by an older,
 *   longer draft from another;
 * - transcript and coach cards are append-only streams grown by one device,
 *   so the longer copy is the more complete one;
 * - notes and DeepSearch essays are unioned by id, each entry from the copy
 *   that finished it.
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

/** One row of any age → the current `ClassSession` shape, or null when it is not a class. */
export function normalizeSession(row: unknown): ClassSession | null {
  if (!row || typeof row !== "object") return null;
  const s = row as ClassSession;
  if (!s.id) return null;
  try {
    return {
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
    };
  } catch {
    return null;
  }
}

/**
 * Rows of any age → the current catalog: normalized, one per id (duplicates
 * merged), newest forty. Rows are not trusted to arrive in order.
 */
export function normalizeSessions(raw: unknown, isRemovedJot: (id: string) => boolean = () => false): ClassSession[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, ClassSession>();
  for (const row of raw) {
    const s = normalizeSession(row);
    if (!s) continue;
    const prev = byId.get(s.id);
    byId.set(s.id, prev ? mergeOne(prev, s, isRemovedJot) : s);
  }
  return sortSessions([...byId.values()]).slice(0, SESSION_KEEP);
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

/** A handout the model finished: not a draft, and it has a lede. */
export function recapPolished(r: ClassRecap | null | undefined) {
  return Boolean(r && !r.draft && r.lede);
}

/**
 * A finished handout is never covered by a draft, however recent the draft's
 * stamp: a rename on the laptop must not throw away the handout the phone just
 * wrote offline. Between two of the same standing the one written or edited
 * last wins; only an exact tie falls back to the fuller one.
 */
export function mergeRecap(a: ClassRecap | null, b: ClassRecap | null) {
  if (!a) return b;
  if (!b) return a;
  const doneA = recapPolished(a);
  const doneB = recapPolished(b);
  if (doneA !== doneB) return doneA ? a : b;
  if ((b.at ?? 0) !== (a.at ?? 0)) return (b.at ?? 0) > (a.at ?? 0) ? b : a;
  return recapScore(b) >= recapScore(a) ? b : a;
}

/** Union by id; a note that finished translating beats its pending twin, else the leading copy's. */
export function mergeNotes(lead: Jot[], other: Jot[], isRemovedJot: (id: string) => boolean) {
  const map = new Map<string, Jot>();
  for (const j of other) if (!isRemovedJot(j.id)) map.set(j.id, j);
  for (const j of lead) {
    if (isRemovedJot(j.id)) continue;
    const seen = map.get(j.id);
    map.set(j.id, seen && !seen.pending && j.pending ? seen : j);
  }
  return [...map.values()].sort((x, y) => x.at - y.at).slice(-40);
}

/** Union by card id; per card, the essay written later. */
export function mergeEssays(a: Record<string, TopicEssay>, b: Record<string, TopicEssay>) {
  const out: Record<string, TopicEssay> = { ...a };
  for (const [k, e] of Object.entries(b)) {
    const prev = out[k];
    if (!prev || (e.at ?? 0) >= (prev.at ?? 0)) out[k] = e;
  }
  return out;
}

const tapeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim();

/**
 * The stored tape plus what the screen holds now. The screen keeps only the
 * newest lines of a long class (and after a reload it may hold only lines
 * heard since), so it is never simply written over the tape: when it still
 * begins where the tape begins it is the fuller copy and replaces it;
 * otherwise the lines the tape already has are matched by overlap and only
 * the new tail is appended. A translation that landed on screen for a line
 * the tape has is carried over.
 */
export function mergeTape(
  stored: { en: string; zh: string }[],
  live: { en: string; zh: string }[],
): { en: string; zh: string }[] {
  if (!stored.length) return live;
  if (!live.length) return stored;
  const sameStart = tapeKey(live[0]!.en) === tapeKey(stored[0]!.en);
  if (sameStart && live.length >= stored.length) return live;
  // Longest suffix of `stored` that equals a prefix of `live`.
  const maxK = Math.min(stored.length, live.length);
  let k = 0;
  for (let n = maxK; n >= 1; n -= 1) {
    let ok = true;
    for (let i = 0; i < n; i += 1) {
      if (tapeKey(stored[stored.length - n + i]!.en) !== tapeKey(live[i]!.en)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      k = n;
      break;
    }
  }
  const head = stored.slice(0, stored.length - k);
  const overlap = stored.slice(stored.length - k).map((s, i) => {
    const l = live[i]!;
    return l.zh && !s.zh ? { ...s, zh: l.zh } : s;
  });
  return [...head, ...overlap, ...live.slice(k)];
}

/** Union by id, keeping the stored order and appending what is new. */
export function unionById<T extends { id: string }>(stored: T[], live: T[]): T[] {
  const seen = new Set(stored.map((x) => x.id));
  const out = [...stored];
  for (const x of live) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
}

/** Two copies of one class → one. See the module note for the policy. */
export function mergeOne(
  a: ClassSession,
  b: ClassSession,
  isRemovedJot: (id: string) => boolean = () => false,
): ClassSession {
  const newer = newerSession(a, b);
  const older = newer === b ? a : b;
  return {
    ...newer,
    title: newer.title,
    endedAt: a.endedAt && b.endedAt ? Math.max(a.endedAt, b.endedAt) : (a.endedAt ?? b.endedAt),
    recap: mergeRecap(a.recap, b.recap),
    transcript:
      (a.transcript?.length ?? 0) >= (b.transcript?.length ?? 0) ? a.transcript : b.transcript,
    notes: mergeNotes(newer.notes ?? [], older.notes ?? [], isRemovedJot),
    coaches:
      (a.coaches?.length ?? 0) >= (b.coaches?.length ?? 0) ? (a.coaches ?? []) : (b.coaches ?? []),
    essays: mergeEssays(older.essays ?? {}, newer.essays ?? {}),
    updatedAt: Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0),
    startedAt: Math.min(a.startedAt, b.startedAt),
    sourceId: newer.sourceId ?? older.sourceId,
    sourceTitle: newer.sourceTitle ?? older.sourceTitle,
    starred: newer.starred,
    starredAt: newer.starred ? (newer.starredAt ?? older.starredAt) : null,
    classMode: parseClassMode(newer.classMode ?? older.classMode),
  };
}

export function mergeSessions(
  a: ClassSession[],
  b: ClassSession[],
  isRemovedJot: (id: string) => boolean = () => false,
): ClassSession[] {
  const map = new Map<string, ClassSession>();
  for (const s of [...a, ...b]) {
    const prev = map.get(s.id);
    map.set(s.id, prev ? mergeOne(prev, s, isRemovedJot) : s);
  }
  return sortSessions([...map.values()]).slice(0, SESSION_KEEP);
}
