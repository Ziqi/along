import { create } from "zustand";
import type {
  AskThread,
  AskTurn,
  Bay,
  Caption,
  ClassRecap,
  ClassSession,
  CoachCard,
  Jot,
  MicState,
  RecapCoach,
  RecapOutline,
  RecapStudy,
  TopicEssay,
  TxPad,
  TxTurn,
  View,
} from "@/lib/types";
import { isRemoved, isRemovedJot, markRemoved, markRemovedJot, readLocalSessions, removedIds, writeLocalSessions } from "@/lib/persist";
import { SAMPLE_ID, sampleSession } from "@/lib/recap-demo";
import { SPACEX_ID, fillKnownHandout, looksLikeSpacexSession, spacexSession } from "@/lib/recap-spacex";
import { newerSession, sortSessions, toggleStar } from "@/lib/session-order";
import { canAutoTitle, stampTitle, topicKey } from "@/lib/utils";
import type { RecapStage } from "@/lib/recap-stage";

export { sortSessions } from "@/lib/session-order";

let nid = 0;
const idOf = (p: string) => {
  nid += 1;
  return `${p}-${Date.now().toString(36)}-${nid.toString(36)}`;
};

const FILLER =
  /^(yeah|yes|yep|yup|right|exactly|okay|ok|so|and|well|um|uh|like|oh)\.?$/i;
const TAIL =
  /\b(a|an|the|and|but|or|to|of|for|with|in|on|at|if|that|this|so|like|just)\.?$/i;
const CONT = /^(and|but|so|because|which|that|like|then|or|also)\b/i;

function isSpeech(en: string) {
  const t = en.replace(/\s+/g, " ").trim();
  if (t.length < 2) return false;
  const letters = t.match(/[a-zA-Z\u4e00-\u9fff]/g)?.length ?? 0;
  if (letters < 3) return false;
  if (/^[?？!！.。,，\-…\s]+$/.test(t)) return false;
  if (/^(uh+|um+|ah+|hmm+|mm+|oh+|huh+)$/i.test(t)) return false;
  if (/^\[(inaudible|blank.?audio|music|silence|noise)\]$/i.test(t)) return false;
  return true;
}

function shouldMerge(prev: string, next: string) {
  if (!prev || !next) return false;
  if (prev.includes(next) || next.startsWith(prev)) return false;
  const combined = prev.length + next.length;
  if (combined > 220) return false;
  const prevDone = /[.!?]$/.test(prev) && prev.length > 48;
  const nextNew = /[.!?]$/.test(next) && next.length > 48;
  if (prevDone && nextNew) return false;
  if (FILLER.test(prev.trim())) return true;
  if (TAIL.test(prev.trim())) return true;
  if (CONT.test(next.trim())) return true;
  if (!/[.!?]$/.test(prev) && prev.length < 140) return true;
  return false;
}

const emptyAsk = (): AskThread => ({
  id: idOf("ask"),
  title: "1",
  turns: [],
});

const emptyTx = (): TxPad => ({
  id: idOf("tx"),
  title: "1",
  turns: [],
});

let persistReady = typeof window === "undefined";
let persistQueue: ClassSession[] | null = null;

function persistSessions(sessions: ClassSession[]) {
  if (typeof window === "undefined") return;
  if (!persistReady) {
    persistQueue = mergeSessions(persistQueue ?? [], sessions);
    return;
  }
  const disk = loadSessions();
  const merged = mergeSessions(disk, sessions).filter((s) => !isRemoved(s.id));
  writeLocalSessions(merged);
  window.setTimeout(() => {
    void import("@/lib/recap-cloud").then((m) =>
      m.pushSessionsSafe(merged, removedIds()),
    );
  }, 400);
}

function normJot(raw: Partial<Jot> & { text?: string; id?: string }): Jot {
  const id = raw.id || `jot-${Math.random().toString(36).slice(2, 8)}`;
  const src = raw.src === "coach" || raw.src === "deep" ? raw.src : "hand";
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

function normRecap(raw: unknown): ClassRecap | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<ClassRecap> & { arc?: string };
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
    topics: (Array.isArray(r.topics) ? r.topics : []).map(normPair).filter(Boolean) as {
      en: string;
      zh: string;
    }[],
    patterns: (Array.isArray(r.patterns) ? r.patterns : []).map(normStudy).filter(Boolean) as RecapStudy[],
    lines: (Array.isArray(r.lines) ? r.lines : []).map(normStudy).filter(Boolean) as RecapStudy[],
    words: (Array.isArray(r.words) ? r.words : []).map(normStudy).filter(Boolean) as RecapStudy[],
    collos: (Array.isArray((r as { collos?: unknown }).collos)
      ? ((r as { collos: unknown[] }).collos)
      : []
    )
      .map(normStudy)
      .filter(Boolean) as RecapStudy[],
    grammar: (Array.isArray((r as { grammar?: unknown }).grammar)
      ? ((r as { grammar: unknown[] }).grammar)
      : []
    )
      .map(normStudy)
      .filter(Boolean) as RecapStudy[],
    skills: (Array.isArray((r as { skills?: unknown }).skills)
      ? ((r as { skills: unknown[] }).skills)
      : []
    )
      .map(normPair)
      .filter(Boolean) as { en: string; zh: string }[],
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
    takeaways: (Array.isArray((r as { takeaways?: unknown }).takeaways)
      ? (r as { takeaways: unknown[] }).takeaways
      : []
    )
      .map(normPair)
      .filter(Boolean) as { en: string; zh: string }[],
    marks: Array.isArray((r as { marks?: unknown }).marks)
      ? ((r as { marks: unknown[] }).marks).map((m) => String(m).trim()).filter(Boolean)
      : [],
    coachPack: Array.isArray((r as { coachPack?: unknown }).coachPack)
      ? ((r as { coachPack: RecapCoach[] }).coachPack)
      : [],
    draft: r.draft === true,
    latencyMs: typeof r.latencyMs === "number" ? r.latencyMs : 0,
    at: typeof r.at === "number" ? r.at : 0,
  };
}

function normalizeSessions(raw: unknown): ClassSession[] {
  if (!Array.isArray(raw)) return [];
  const out: ClassSession[] = [];
  for (const row of raw.slice(0, 40)) {
    if (!row || typeof row !== "object") continue;
    const s = row as ClassSession;
    if (!s.id) continue;
    try {
      out.push(
        fillKnownHandout({
          ...s,
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
          sourceId: s.sourceId ?? null,
          sourceTitle: s.sourceTitle ?? null,
          starred: Boolean(s.starred),
          starredAt: typeof s.starredAt === "number" ? s.starredAt : null,
          updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : (s.startedAt ?? Date.now()),
          startedAt: typeof s.startedAt === "number" ? s.startedAt : Date.now(),
          endedAt: typeof s.endedAt === "number" ? s.endedAt : s.endedAt ?? null,
          title: String(s.title ?? "课堂"),
        }),
      );
    } catch {
      /* skip bad row */
    }
  }
  return out;
}

function loadSessions(): ClassSession[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizeSessions(readLocalSessions());
  } catch {
    return [];
  }
}

function pinEssaysToCoachIds(
  essays: Record<string, TopicEssay>,
  coaches: CoachCard[],
) {
  const next = { ...essays };
  for (const c of coaches) {
    if (!c?.id || next[c.id]) continue;
    const k = topicKey(c.topic ?? "");
    if (k && next[k]) next[c.id] = next[k];
  }
  return next;
}

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
        .filter((row): row is { left: string; leftZh: string; right: string; rightZh: string } => Boolean(row))
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

function mergeOne(a: ClassSession, b: ClassSession): ClassSession {
  const newer = newerSession(a, b);
  const older = newer === b ? a : b;
  return {
    ...newer,
    title: newer.title,
    endedAt:
      a.endedAt && b.endedAt
        ? Math.max(a.endedAt, b.endedAt)
        : (a.endedAt ?? b.endedAt),
    recap: mergeRecap(a.recap, b.recap),
    transcript:
      (a.transcript?.length ?? 0) >= (b.transcript?.length ?? 0)
        ? a.transcript
        : b.transcript,
    notes: mergeNotes(a.notes ?? [], b.notes ?? []),
    coaches: (a.coaches?.length ?? 0) >= (b.coaches?.length ?? 0) ? a.coaches ?? [] : b.coaches ?? [],
    essays: Object.keys(b.essays ?? {}).length >= Object.keys(a.essays ?? {}).length ? b.essays ?? {} : a.essays ?? {},
    updatedAt: Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0),
    startedAt: Math.min(a.startedAt, b.startedAt),
    sourceId: newer.sourceId ?? older.sourceId,
    sourceTitle: newer.sourceTitle ?? older.sourceTitle,
    starred: newer.starred,
    starredAt: newer.starred ? (newer.starredAt ?? older.starredAt) : null,
  };
}

function mergeSessions(a: ClassSession[], b: ClassSession[]): ClassSession[] {
  const map = new Map<string, ClassSession>();
  for (const s of [...a, ...b]) {
    const prev = map.get(s.id);
    map.set(s.id, prev ? mergeOne(prev, s) : s);
  }
  return sortSessions([...map.values()].map(fillKnownHandout)).slice(0, 40);
}

type AppState = {
  captions: Caption[];
  interim: string;
  mic: MicState;
  listening: boolean;
  autoCoach: boolean;
  startedAt: number | null;
  lastLatency: number | null;
  coach: CoachCard | null;
  coaches: CoachCard[];
  coachPending: boolean;
  coachError: string | null;
  essay: TopicEssay | null;
  essays: Record<string, TopicEssay>;
  essayPending: boolean;
  essayTarget: string | null;
  essayError: string | null;
  jots: Jot[];
  sessions: ClassSession[];
  sessionId: string | null;
  liveId: string | null;
  bay: Bay;
  view: View;
  recapPending: boolean;
  recapStage: RecapStage | null;
  recapError: string | null;
  flash: string | null;
  jotOpen: boolean;
  askThreads: AskThread[];
  askActiveId: string;
  askPending: boolean;
  askError: string | null;
  askOpen: boolean;
  txPads: TxPad[];
  txActiveId: string;
  txPending: boolean;
  intent: string;
  engineError: string | null;
  seq: number;
  pushFinal: (en: string) => string;
  setZh: (id: string, patch: { zh: string; ms: number; en?: string }) => void;
  markError: (id: string, error: string) => void;
  setInterim: (text: string) => void;
  setMic: (mic: MicState) => void;
  setListening: (on: boolean) => void;
  setAutoCoach: (on: boolean) => void;
  setIntent: (text: string) => void;
  setCoach: (card: CoachCard | null) => void;
  setCoachPending: (on: boolean) => void;
  setCoachError: (msg: string | null) => void;
  setEssay: (essay: TopicEssay | null, coachId?: string, keepPending?: boolean) => void;
  setEssayPending: (on: boolean, coachId?: string | null) => void;
  setEssayError: (msg: string | null) => void;
  addJot: (draft: {
    en?: string;
    zh?: string;
    src: Jot["src"];
  }) => string | null;
  patchJot: (id: string, patch: Partial<Pick<Jot, "en" | "zh" | "pending">>) => void;
  removeJot: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  removeSession: (id: string) => void;
  starSession: (id: string) => void;
  forkSession: (fromId: string) => string | null;
  goHome: () => void;
  updateRecap: (id: string, patch: Partial<ClassRecap>) => void;
  ensureSession: () => string;
  setSession: (id: string) => void;
  setBay: (bay: Bay) => void;
  setView: (view: View) => void;
  setRecap: (recap: ClassRecap, sessionId?: string) => void;
  setLiveDraft: (
    sid: string,
    draft: {
      title: string;
      outline: RecapOutline[];
      topics: { en: string; zh: string }[];
      ms: number;
    },
  ) => void;
  setRecapPending: (on: boolean) => void;
  setRecapStage: (stage: RecapStage | null) => void;
  setRecapError: (msg: string | null) => void;
  stashLive: () => void;
  ping: (msg: string) => void;
  setJotOpen: (on: boolean) => void;
  hydrateSessions: () => void;
  setAskActive: (id: string) => void;
  newAskThread: () => void;
  pushAskTurn: (turn: Omit<AskTurn, "id">) => void;
  setAskPending: (on: boolean) => void;
  setAskError: (msg: string | null) => void;
  setAskOpen: (on: boolean) => void;
  setTxActive: (id: string) => void;
  newTxPad: () => void;
  pushTxTurn: (turn: Omit<TxTurn, "id">) => void;
  setTxPending: (on: boolean) => void;
  setEngineError: (msg: string | null) => void;
  armClock: () => void;
  resetHud: () => void;
  clear: (opts?: { keepBay?: boolean }) => void;
};

export const useCapcom = create<AppState>((set, get) => {
  const firstAsk = emptyAsk();
  const firstTx = emptyTx();
  return {
    captions: [],
    interim: "",
    mic: "idle",
    listening: false,
    autoCoach: true,
    startedAt: null,
    lastLatency: null,
    coach: null,
    coaches: [],
    coachPending: false,
    coachError: null,
    essay: null,
    essays: {},
    essayPending: false,
    essayTarget: null,
    essayError: null,
    jots: [],
    sessions: [],
    sessionId: null,
    liveId: null,
    bay: null,
    view: "live",
    recapPending: false,
    recapStage: null,
    recapError: null,
    flash: null,
    jotOpen: false,
    askThreads: [firstAsk],
    askActiveId: firstAsk.id,
    askPending: false,
    askError: null,
    askOpen: false,
    txPads: [firstTx],
    txActiveId: firstTx.id,
    txPending: false,
    intent: "",
    engineError: null,
    seq: 0,
    pushFinal: (en) => {
      const text = en.replace(/\s+/g, " ").trim();
      if (!text || !isSpeech(text)) return "";
      const last = get().captions.at(-1);
      if (last && last.en === text && Date.now() - last.at < 2200) return last.id;
      if (
        last &&
        last.pending &&
        (text.startsWith(last.en) || last.en.startsWith(text)) &&
        Date.now() - last.at < 3200
      ) {
        set({
          captions: get().captions.map((c) =>
            c.id === last.id
              ? {
                  ...c,
                  en: text.length > last.en.length ? text : last.en,
                  pending: true,
                  zh: "",
                }
              : c,
          ),
          interim: "",
        });
        return last.id;
      }
      if (last && Date.now() - last.at < 2400 && shouldMerge(last.en, text)) {
        const merged = `${last.en} ${text}`.replace(/\s+/g, " ").trim();
        set({
          captions: get().captions.map((c) =>
            c.id === last.id ? { ...c, en: merged, pending: true, zh: "" } : c,
          ),
          interim: "",
        });
        return last.id;
      }
      const seq = get().seq + 1;
      const id = `DL-${String(seq).padStart(3, "0")}`;
      const row: Caption = {
        id,
        seq,
        at: Date.now(),
        en: text,
        zh: "",
        pending: true,
      };
      set({
        seq,
        captions: [...get().captions, row].slice(-180),
        interim: "",
      });
      return id;
    },
    setZh: (id, patch) => {
      set({
        lastLatency: patch.ms,
        captions: get().captions.map((c) => {
          if (c.id !== id) return c;
          if (patch.en && c.en !== patch.en) return c;
          return { ...c, zh: patch.zh, pending: false, error: undefined };
        }),
      });
    },
    markError: (id, error) => {
      set({
        captions: get().captions.map((c) =>
          c.id === id ? { ...c, pending: false, error } : c,
        ),
      });
    },
    setInterim: (text) => set({ interim: text }),
    setMic: (mic) => set({ mic }),
    setListening: (on) => set({ listening: on }),
    setAutoCoach: (on) => set({ autoCoach: on }),
    setIntent: (text) => set({ intent: text }),
    setCoach: (card) => {
      if (!card) {
        set({ coach: null, coaches: [], coachError: null, coachPending: false });
        return;
      }
      const coaches = [...get().coaches, card].slice(-20);
      set({
        coaches,
        coach: card,
        coachError: null,
        coachPending: false,
      });
    },
    setCoachPending: (on) =>
      set({ coachPending: on, coachError: on ? null : get().coachError }),
    setCoachError: (msg) => set({ coachError: msg, coachPending: false }),
    setEssay: (essay, coachId, keepPending) => {
      const card =
        (coachId ? get().coaches.find((c) => c.id === coachId) : null) ?? get().coach;
      const id = card?.id ?? coachId;
      const essays = { ...get().essays };
      if (id) {
        if (essay) essays[id] = essay;
        else delete essays[id];
      }
      set({
        essay,
        essays,
        essayPending: keepPending ? true : get().essayPending,
        essayTarget: keepPending
          ? (coachId ?? card?.id ?? get().essayTarget)
          : get().essayTarget,
        essayError: null,
      });
    },
    setEssayPending: (on, coachId) =>
      set({
        essayPending: on,
        essayTarget: on ? (coachId ?? get().coach?.id ?? null) : get().essayTarget,
        essayError: on ? null : get().essayError,
      }),
    setEssayError: (msg) => set({ essayError: msg }),
    addJot: (draft) => {
      const en = (draft.en ?? "").replace(/\s+/g, " ").trim();
      const zh = (draft.zh ?? "").replace(/\s+/g, " ").trim();
      if (!en && !zh) return null;
      const viewing = get().view === "recap" ? get().sessionId : null;
      const open = get().sessions.find((s) => s.id === get().liveId && !s.endedAt);
      const sid =
        viewing ??
        open?.id ??
        (get().listening || get().mic === "arming" ? get().ensureSession() : get().sessionId);
      if (!sid) return null;
      const host = get().sessions.find((s) => s.id === sid);
      const current = host?.notes ?? get().jots;
      const last = current.at(-1);
      if (last && last.en === en && last.zh === zh && Date.now() - last.at < 2000) {
        return last.id;
      }
      const jot: Jot = {
        id: idOf("jot"),
        en,
        zh,
        src: draft.src,
        at: Date.now(),
        pending: !en || !zh,
      };
      const notes = [...current, jot].slice(-40);
      const sessions = get().sessions.map((s) =>
        s.id === sid ? { ...s, notes } : s,
      );
      persistSessions(sessions);
      const live = get().liveId === sid;
      set({
        sessions,
        jots: live || !viewing ? notes : get().jots,
      });
      return jot.id;
    },
    patchJot: (id, patch) => {
      const next = (j: Jot) =>
        j.id === id ? { ...j, ...patch, pending: patch.pending ?? false } : j;
      const sessions = get().sessions.map((s) => ({
        ...s,
        notes: s.notes.map(next),
      }));
      persistSessions(sessions);
      set({ sessions, jots: get().jots.map(next) });
    },
    removeJot: (id) => {
      markRemovedJot(id);
      const sessions = get().sessions.map((s) =>
        s.notes.some((j) => j.id === id)
          ? { ...s, notes: s.notes.filter((j) => j.id !== id), updatedAt: Date.now() }
          : s,
      );
      persistSessions(sessions);
      set({
        sessions,
        jots: get().jots.filter((j) => j.id !== id),
      });
    },
    renameSession: (id, title) => {
      const name = title.replace(/\s+/g, " ").trim().slice(0, 56);
      if (!name) return;
      const sessions = get().sessions.map((s) => {
        if (s.id !== id) return s;
        return {
          ...s,
          title: name,
          recap: s.recap ? { ...s.recap, title: name, at: Date.now() } : s.recap,
          updatedAt: Date.now(),
        };
      });
      persistSessions(sessions);
      set({ sessions });
    },
    starSession: (id) => {
      const sessions = sortSessions(
        get().sessions.map((s) => (s.id === id ? toggleStar(s) : s)),
      );
      persistSessions(sessions);
      set({ sessions });
    },
    forkSession: (fromId) => {
      const src = get().sessions.find((s) => s.id === fromId);
      if (!src) return null;
      const next: ClassSession = {
        id: idOf("ses"),
        title: (src.recap?.title || src.title).replace(/\s·\s再出/g, "").trim() || src.title,
        startedAt: Date.now(),
        endedAt: Date.now(),
        notes: src.notes.map((j) => ({ ...j, id: idOf("jot") })),
        recap: null,
        transcript: src.transcript.map((t) => ({ ...t })),
        coaches: src.coaches ?? [],
        essays: src.essays ?? {},
        sourceId: src.id,
        sourceTitle: src.title,
        starred: false,
        starredAt: null,
        updatedAt: Date.now(),
      };
      const sessions = sortSessions([next, ...get().sessions]).slice(0, 40);
      persistSessions(sessions);
      set({ sessions, sessionId: next.id });
      return next.id;
    },
    goHome: () => {
      const open = get().sessions.some((s) => s.id === get().liveId && !s.endedAt);
      if (open) {
        set({ view: "live", bay: null, askOpen: false, jotOpen: false });
        return;
      }
      set({
        view: "live",
        bay: null,
        askOpen: false,
        jotOpen: false,
        captions: [],
        interim: "",
        coach: null,
        coaches: [],
        coachError: null,
        coachPending: false,
        essay: null,
        essays: {},
        essayPending: false,
        essayTarget: null,
        jots: [],
        liveId: null,
        seq: 0,
        startedAt: null,
        lastLatency: null,
        recapPending: false,
        recapStage: null,
        recapError: null,
      });
    },
    removeSession: (id) => {
      markRemoved(id);
      const sessions = get().sessions.filter((s) => s.id !== id);
      persistSessions(sessions);
      const sessionId =
        get().sessionId === id ? (sessions[0]?.id ?? null) : get().sessionId;
      const liveId = get().liveId === id ? null : get().liveId;
      set({
        sessions,
        sessionId,
        liveId,
        jots: liveId ? get().jots : [],
      });
    },
    updateRecap: (id, patch) => {
      const sessions = get().sessions.map((s) => {
        if (s.id !== id || !s.recap) return s;
        const recap = { ...s.recap, ...patch, at: Date.now() };
        return { ...s, recap, title: recap.title || s.title, updatedAt: Date.now() };
      });
      persistSessions(sessions);
      set({ sessions });
    },
    ensureSession: () => {
      const cur = get().sessions.find((s) => s.id === get().liveId && !s.endedAt);
      if (cur) return cur.id;
      if (!get().listening && get().mic !== "arming") {
        return get().liveId ?? get().sessionId ?? "";
      }
      const now = Date.now();
      const title = stampTitle(now);
      const next: ClassSession = {
        id: idOf("ses"),
        title,
        startedAt: now,
        endedAt: null,
        notes: [],
        recap: null,
        transcript: [],
        coaches: [],
        essays: {},
        sourceId: null,
        sourceTitle: null,
        starred: false,
        starredAt: null,
        updatedAt: now,
      };
      const closed = get().sessions.map((s) =>
        !s.endedAt ? { ...s, endedAt: now, updatedAt: now } : s,
      );
      const sessions = sortSessions([next, ...closed]).slice(0, 40);
      persistSessions(sessions);
      set({
        sessions,
        liveId: next.id,
        jots: [],
        sessionId: get().view === "recap" ? get().sessionId : next.id,
      });
      return next.id;
    },
    setSession: (id) => {
      const hit = get().sessions.find((s) => s.id === id);
      if (!hit) return;
      set({ sessionId: id, jots: hit.notes, recapError: null });
    },
    setBay: (bay) =>
      set({ bay, askOpen: bay ? false : get().askOpen }),
    setView: (view) => set({ view }),
    setRecap: (recap, sessionId) => {
      const sid = sessionId ?? get().sessionId;
      const sessions = get().sessions.map((s) =>
        s.id === sid
          ? {
              ...s,
              recap,
              title: canAutoTitle(s.title, s.startedAt)
                ? stampTitle(s.startedAt, recap.title)
                : s.title,
              updatedAt: Date.now(),
            }
          : s,
      );
      persistSessions(sessions);
      set({
        sessions,
        recapPending: recap.draft ? get().recapPending : false,
        recapError: recap.draft ? get().recapError : null,
        sessionId: sid ?? get().sessionId,
      });
    },
    setLiveDraft: (sid, draft) => {
      const sessions = get().sessions.map((s) => {
        if (s.id !== sid) return s;
        if (s.recap && !s.recap.draft && s.recap.lede) return s;
        const recap: ClassRecap = {
          title: s.recap?.title || s.title,
          lede: s.recap?.lede ?? "",
          ledeZh: s.recap?.ledeZh ?? "",
          sections: s.recap?.sections ?? [],
          topics: draft.topics.length ? draft.topics : (s.recap?.topics ?? []),
          patterns: s.recap?.patterns ?? [],
          lines: s.recap?.lines ?? [],
          words: s.recap?.words ?? [],
          collos: s.recap?.collos ?? [],
          grammar: s.recap?.grammar ?? [],
          skills: s.recap?.skills ?? [],
          outline: draft.outline.length ? draft.outline : (s.recap?.outline ?? []),
          takeaways: s.recap?.takeaways ?? [],
          marks: s.recap?.marks ?? [],
          coachPack: s.recap?.coachPack ?? [],
          draft: true,
          latencyMs: draft.ms,
          at: Date.now(),
        };
        return {
          ...s,
          recap,
          title: canAutoTitle(s.title, s.startedAt)
            ? stampTitle(s.startedAt, draft.title)
            : s.title,
        };
      });
      persistSessions(sessions);
      set({ sessions });
    },
    setRecapPending: (on) =>
      set({
        recapPending: on,
        recapStage: on ? get().recapStage : null,
        recapError: on ? null : get().recapError,
      }),
    setRecapStage: (stage) => set({ recapStage: stage }),
    setRecapError: (msg) => set({ recapError: msg, recapPending: false, recapStage: null }),
    stashLive: () => {
      const sid = get().liveId;
      if (!sid) return;
      const transcript = get()
        .captions.filter((c) => c.en && !c.error)
        .map((c) => ({ en: c.en, zh: c.zh }));
      const coachTopics = get()
        .coaches.map((c) => ({ en: c.topic.trim(), zh: c.topicZh || "" }))
        .filter((t) => t.en);
      const sessions = get().sessions.map((s) => {
        if (s.id !== sid) return s;
        const recap = s.recap
          ? {
              ...s.recap,
              topics: s.recap.topics.length ? s.recap.topics : coachTopics,
            }
          : coachTopics.length
            ? {
                title: s.title,
                lede: "",
                ledeZh: "",
                sections: [],
                topics: coachTopics,
                patterns: [],
                lines: [],
                words: [],
                collos: [],
                grammar: [],
                skills: [],
                outline: [],
                takeaways: [],
                marks: [],
                coachPack: [],
                draft: true,
                latencyMs: 0,
                at: Date.now(),
              }
            : null;
        return {
          ...s,
          notes: get().jots,
          transcript: transcript.length ? transcript : s.transcript ?? [],
          coaches: get().coaches.length ? get().coaches : s.coaches ?? [],
          essays: Object.keys(get().essays).length ? get().essays : s.essays ?? {},
          recap,
          updatedAt: Date.now(),
        };
      });
      persistSessions(sessions);
      set({ sessions, liveId: sid });
    },
    ping: (msg) => {
      set({ flash: msg });
      window.setTimeout(() => {
        if (get().flash === msg) set({ flash: null });
      }, 1400);
    },
    setJotOpen: (on) => set({ jotOpen: on }),
    hydrateSessions: () => {
      const apply = (sessions: ClassSession[]) => {
        if (!sessions.length && get().sessions.length) return;
        const cur = get();
        const open =
          sessions.find((s) => s.id === cur.liveId && !s.endedAt) ?? null;
        const tape = open?.transcript ?? [];
        const keepTape = cur.captions.length > 0;
        const keepSession =
          (cur.sessionId && sessions.some((s) => s.id === cur.sessionId)
            ? cur.sessionId
            : null) ??
          open?.id ??
          sessions[0]?.id ??
          null;
        set({
          sessions: sessions.filter((s) => !isRemoved(s.id)),
          liveId: open?.id ?? (keepTape ? cur.liveId : null),
          sessionId: keepSession,
          jots: cur.jots.length ? cur.jots : (open?.notes ?? []),
          captions: keepTape
            ? cur.captions
            : tape.map((t, i) => ({
                id: `hyd-${i}`,
                seq: i + 1,
                at: (open?.startedAt ?? 0) + i,
                en: t.en,
                zh: t.zh,
                pending: false,
              })),
          seq: keepTape ? cur.seq : tape.length,
        });
      };
      const withSample = (sessions: ClassSession[]) => {
        const extras: ClassSession[] = [];
        if (
          !isRemoved(SPACEX_ID) &&
          !sessions.some((s) => s.id === SPACEX_ID || looksLikeSpacexSession(s))
        ) {
          extras.push(spacexSession());
        }
        if (!isRemoved(SAMPLE_ID) && !sessions.some((s) => s.id === SAMPLE_ID)) extras.push(sampleSession());
        return extras.length ? mergeSessions(sessions, extras) : sessions.map(fillKnownHandout);
      };
      try {
        apply(withSample(loadSessions()));
      } catch {
        apply(withSample([]));
      }
      window.setTimeout(() => {
        if (persistReady) return;
        persistReady = true;
        if (persistQueue) {
          persistSessions(persistQueue);
          persistQueue = null;
        }
      }, 2500);
      void (async () => {
        try {
          const persist = await import("@/lib/persist");
          const probe = await persist.probeStorage();
          if (!probe.ok) {
            set({
              engineError: "本机存储写不进去。无痕模式或空间已满时，纪要可能保不住。",
            });
          }
          const idb = normalizeSessions(await persist.readIdbSessions());
          let next = mergeSessions(get().sessions, idb);
          try {
            const cloud = await import("@/lib/recap-cloud");
            const remote = normalizeSessions(await cloud.pullSessions());
            next = mergeSessions(next, remote);
          } catch {
            /* signed out or offline */
          }
          persistReady = true;
          if (persistQueue) {
            next = mergeSessions(next, persistQueue);
            persistQueue = null;
          }
          next = withSample(next);
          writeLocalSessions(next);
          apply(next);
        } catch {
          persistReady = true;
          if (persistQueue) {
            persistSessions(persistQueue);
            persistQueue = null;
          }
        }
      })();
    },
    setAskActive: (id) => set({ askActiveId: id, askError: null }),
    newAskThread: () => {
      const cur = get().askThreads.find((t) => t.id === get().askActiveId);
      if (cur && cur.turns.length === 0) return;
      const next = emptyAsk();
      set({
        askThreads: [next, ...get().askThreads].slice(0, 6),
        askActiveId: next.id,
        askError: null,
      });
    },
    pushAskTurn: (turn) => {
      const id = idOf("at");
      set({
        askPending: false,
        askError: null,
        askThreads: get().askThreads.map((t) => {
          if (t.id !== get().askActiveId) return t;
          const title =
            t.turns.length === 0 ? turn.q.replace(/\s+/g, " ").slice(0, 18) : t.title;
          return { ...t, title, turns: [...t.turns, { ...turn, id }].slice(-20) };
        }),
      });
    },
    setAskPending: (on) =>
      set({ askPending: on, askError: on ? null : get().askError }),
    setAskError: (msg) => set({ askError: msg, askPending: false }),
    setAskOpen: (on) => set({ askOpen: on, bay: on ? null : get().bay }),
    setTxActive: (id) => set({ txActiveId: id }),
    newTxPad: () => {
      const cur = get().txPads.find((t) => t.id === get().txActiveId);
      if (cur && cur.turns.length === 0) return;
      const next = emptyTx();
      set({
        txPads: [next, ...get().txPads].slice(0, 6),
        txActiveId: next.id,
      });
    },
    pushTxTurn: (turn) => {
      const id = idOf("tt");
      set({
        txPending: false,
        txPads: get().txPads.map((t) => {
          if (t.id !== get().txActiveId) return t;
          const title =
            t.turns.length === 0 ? turn.src.replace(/\s+/g, " ").slice(0, 16) : t.title;
          return { ...t, title, turns: [...t.turns, { ...turn, id }].slice(-24) };
        }),
      });
    },
    setTxPending: (on) => set({ txPending: on }),
    setEngineError: (msg) => set({ engineError: msg }),
    armClock: () => {
      if (!get().startedAt) set({ startedAt: Date.now() });
      if (get().listening || get().mic === "arming") get().ensureSession();
    },
    resetHud: () =>
      set({
        captions: [],
        interim: "",
        coach: null,
        coaches: [],
        coachError: null,
        coachPending: false,
        essay: null,
        essays: {},
        essayPending: false,
        essayTarget: null,
        jots: [],
        liveId: null,
        seq: 0,
        startedAt: null,
        lastLatency: null,
        engineError: null,
        listening: false,
      }),
    clear: (opts) => {
      const ask = emptyAsk();
      const tx = emptyTx();
      const now = Date.now();
      const liveId = get().liveId;
      const sessions = get().sessions.map((s) =>
        !s.endedAt ? { ...s, endedAt: now, updatedAt: now } : s,
      );
      persistSessions(sessions);
      set({
        captions: [],
        interim: "",
        coach: null,
        coaches: [],
        coachError: null,
        coachPending: false,
        essay: null,
        essays: {},
        essayPending: false,
        essayTarget: null,
        jots: [],
        sessions,
        liveId: null,
        sessionId: opts?.keepBay ? liveId ?? get().sessionId : get().sessionId,
        bay: opts?.keepBay ? get().bay : null,
        recapPending: opts?.keepBay ? get().recapPending : false,
        recapError: opts?.keepBay ? get().recapError : null,
        askThreads: [ask],
        askActiveId: ask.id,
        askPending: false,
        askError: null,
        askOpen: false,
        txPads: [tx],
        txActiveId: tx.id,
        txPending: false,
        seq: 0,
        startedAt: null,
        lastLatency: null,
        engineError: null,
        listening: false,
      });
    },
  };
});
