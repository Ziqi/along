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
  RecapOutline,
  TopicEssay,
  TxPad,
  TxTurn,
  View,
} from "@/lib/types";

let nid = 0;
const idOf = (p: string) => {
  nid += 1;
  return `${p}-${nid}`;
};

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

const SESSION_KEY = "along.sessions";

function persistSessions(sessions: ClassSession[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(sessions.slice(0, 40)));
  } catch {
    /* ignore */
  }
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

function normRecap(raw: unknown): ClassRecap | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<ClassRecap> & { arc?: string };
  const sections = Array.isArray(r.sections)
    ? r.sections
        .map((s) => ({
          heading: String(s?.heading ?? "").trim(),
          body: String(s?.body ?? "").trim(),
        }))
        .filter((s) => s.heading && s.body)
    : [];
  return {
    title: String(r.title ?? "").trim(),
    lede: String(r.lede ?? r.arc ?? "").trim(),
    sections,
    topics: (Array.isArray(r.topics) ? r.topics : []).map(normPair).filter(Boolean) as {
      en: string;
      zh: string;
    }[],
    patterns: (Array.isArray(r.patterns) ? r.patterns : []).map(normPair).filter(Boolean) as {
      en: string;
      zh: string;
    }[],
    lines: (Array.isArray(r.lines) ? r.lines : []).map(normPair).filter(Boolean) as {
      en: string;
      zh: string;
    }[],
    words: (Array.isArray(r.words) ? r.words : []).map(normPair).filter(Boolean) as {
      en: string;
      zh: string;
    }[],
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
    draft: r.draft !== false && !String(r.lede ?? "").trim(),
    latencyMs: typeof r.latencyMs === "number" ? r.latencyMs : 0,
    at: typeof r.at === "number" ? r.at : 0,
  };
}

function loadSessions(): ClassSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ClassSession[];
    return Array.isArray(parsed)
      ? parsed.slice(0, 40).map((s) => ({
          ...s,
          notes: Array.isArray(s.notes) ? s.notes.map((n) => normJot(n)) : [],
          recap: normRecap(s.recap),
          transcript: Array.isArray(s.transcript)
            ? (s.transcript.map(normPair).filter(Boolean) as { en: string; zh: string }[])
            : [],
          sourceId: s.sourceId ?? null,
          sourceTitle: s.sourceTitle ?? null,
        }))
      : [];
  } catch {
    return [];
  }
}

type AppState = {
  captions: Caption[];
  interim: string;
  mic: MicState;
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
  jots: Jot[];
  sessions: ClassSession[];
  sessionId: string | null;
  liveId: string | null;
  bay: Bay;
  view: View;
  recapPending: boolean;
  recapError: string | null;
  flash: string | null;
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
  setZh: (id: string, patch: { zh: string; ms: number }) => void;
  markError: (id: string, error: string) => void;
  setInterim: (text: string) => void;
  setMic: (mic: MicState) => void;
  setAutoCoach: (on: boolean) => void;
  setIntent: (text: string) => void;
  setCoach: (card: CoachCard | null) => void;
  setCoachPending: (on: boolean) => void;
  setCoachError: (msg: string | null) => void;
  setEssay: (essay: TopicEssay | null, coachId?: string) => void;
  setEssayPending: (on: boolean, coachId?: string | null) => void;
  addJot: (draft: {
    en?: string;
    zh?: string;
    src: Jot["src"];
  }) => string | null;
  patchJot: (id: string, patch: Partial<Pick<Jot, "en" | "zh" | "pending">>) => void;
  removeJot: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  removeSession: (id: string) => void;
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
  setRecapError: (msg: string | null) => void;
  stashLive: () => void;
  ping: (msg: string) => void;
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
  clear: (opts?: { keepBay?: boolean }) => void;
};

export const useCapcom = create<AppState>((set, get) => {
  const firstAsk = emptyAsk();
  const firstTx = emptyTx();
  return {
    captions: [],
    interim: "",
    mic: "idle",
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
    jots: [],
    sessions: [],
    sessionId: null,
    liveId: null,
    bay: null,
    view: "live",
    recapPending: false,
    recapError: null,
    flash: null,
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
      if (!text) return "";
      const last = get().captions.at(-1);
      if (last && last.en === text && Date.now() - last.at < 1800) return last.id;
      if (
        last &&
        last.pending &&
        (text.startsWith(last.en) || last.en.startsWith(text)) &&
        Date.now() - last.at < 2500
      ) {
        set({
          captions: get().captions.map((c) =>
            c.id === last.id
              ? { ...c, en: text.length > last.en.length ? text : last.en }
              : c,
          ),
          interim: "",
        });
        return last.id;
      }
      if (
        last &&
        Date.now() - last.at < 1600 &&
        last.en.length < 140 &&
        text.length < 90 &&
        !/[.!?]$/.test(last.en) &&
        !text.startsWith(last.en) &&
        !last.en.includes(text)
      ) {
        const merged = `${last.en} ${text}`.replace(/\s+/g, " ").trim();
        set({
          captions: get().captions.map((c) =>
            c.id === last.id ? { ...c, en: merged, pending: true } : c,
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
        captions: get().captions.map((c) =>
          c.id === id
            ? { ...c, zh: patch.zh, pending: false, error: undefined }
            : c,
        ),
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
    setAutoCoach: (on) => set({ autoCoach: on }),
    setIntent: (text) => set({ intent: text }),
    setCoach: (card) => {
      if (!card) {
        set({ coach: null, coaches: [], coachError: null, coachPending: false });
        return;
      }
      const list = get().coaches;
      const last = list.at(-1);
      const sameTopic =
        last &&
        last.topic.trim().toLowerCase() === card.topic.trim().toLowerCase() &&
        last.move === card.move;
      const nextCard = { ...card, id: sameTopic && last ? last.id : card.id };
      const coaches = sameTopic
        ? [...list.slice(0, -1), nextCard]
        : [...list, nextCard].slice(-20);
      set({
        coaches,
        coach: nextCard,
        coachError: null,
        coachPending: false,
      });
    },
    setCoachPending: (on) =>
      set({ coachPending: on, coachError: on ? null : get().coachError }),
    setCoachError: (msg) => set({ coachError: msg, coachPending: false }),
    setEssay: (essay, coachId) => {
      const id = coachId ?? get().coach?.id;
      const essays = { ...get().essays };
      if (essay && id) essays[id] = essay;
      set({ essay, essays, essayPending: false, essayTarget: null });
    },
    setEssayPending: (on, coachId) =>
      set({ essayPending: on, essayTarget: on ? (coachId ?? get().coach?.id ?? null) : null }),
    addJot: (draft) => {
      const en = (draft.en ?? "").replace(/\s+/g, " ").trim();
      const zh = (draft.zh ?? "").replace(/\s+/g, " ").trim();
      if (!en && !zh) return null;
      const viewing = get().view === "recap" ? get().sessionId : null;
      const sid = viewing ?? get().ensureSession();
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
      const sessions = get().sessions.map((s) =>
        s.notes.some((j) => j.id === id)
          ? { ...s, notes: s.notes.filter((j) => j.id !== id) }
          : s,
      );
      persistSessions(sessions);
      set({
        sessions,
        jots: get().jots.filter((j) => j.id !== id),
      });
    },
    renameSession: (id, title) => {
      const name = title.replace(/\s+/g, " ").trim().slice(0, 24);
      if (!name) return;
      const sessions = get().sessions.map((s) => {
        if (s.id !== id) return s;
        return {
          ...s,
          title: name,
          recap: s.recap ? { ...s.recap, title: name } : s.recap,
        };
      });
      persistSessions(sessions);
      set({ sessions });
    },
    forkSession: (fromId) => {
      const src = get().sessions.find((s) => s.id === fromId);
      if (!src) return null;
      const next: ClassSession = {
        id: idOf("ses"),
        title: `${src.title} · 再出`,
        startedAt: Date.now(),
        endedAt: Date.now(),
        notes: src.notes.map((j) => ({ ...j, id: idOf("jot") })),
        recap: null,
        transcript: src.transcript.map((t) => ({ ...t })),
        sourceId: src.id,
        sourceTitle: src.title,
      };
      const sessions = [next, ...get().sessions].slice(0, 40);
      persistSessions(sessions);
      set({ sessions, sessionId: next.id });
      return next.id;
    },
    goHome: () =>
      set({
        view: "live",
        bay: null,
        askOpen: false,
      }),
    removeSession: (id) => {
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
        const recap = { ...s.recap, ...patch };
        return { ...s, recap, title: recap.title || s.title };
      });
      persistSessions(sessions);
      set({ sessions });
    },
    ensureSession: () => {
      const live =
        get().sessions.find((s) => s.id === get().liveId && !s.endedAt) ??
        get().sessions.find((s) => !s.endedAt);
      if (live) {
        if (get().liveId !== live.id) set({ liveId: live.id });
        return live.id;
      }
      const now = new Date();
      const title = `${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const next: ClassSession = {
        id: idOf("ses"),
        title,
        startedAt: Date.now(),
        endedAt: null,
        notes: [],
        recap: null,
        transcript: [],
        sourceId: null,
        sourceTitle: null,
      };
      const sessions = [next, ...get().sessions].slice(0, 40);
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
          ? { ...s, recap, title: recap.title || s.title }
          : s,
      );
      persistSessions(sessions);
      set({ sessions, recapPending: false, recapError: null, sessionId: sid ?? get().sessionId });
    },
    setLiveDraft: (sid, draft) => {
      const sessions = get().sessions.map((s) => {
        if (s.id !== sid) return s;
        if (s.recap && !s.recap.draft && s.recap.lede) return s;
        const named = /[\u4e00-\u9fff]/.test(draft.title) ? draft.title.slice(0, 12) : "";
        const recap: ClassRecap = {
          title: named || s.recap?.title || s.title,
          lede: s.recap?.lede ?? "",
          sections: s.recap?.sections ?? [],
          topics: draft.topics.length ? draft.topics : (s.recap?.topics ?? []),
          patterns: s.recap?.patterns ?? [],
          lines: s.recap?.lines ?? [],
          words: s.recap?.words ?? [],
          outline: draft.outline.length ? draft.outline : (s.recap?.outline ?? []),
          draft: true,
          latencyMs: draft.ms,
          at: Date.now(),
        };
        return { ...s, recap, title: recap.title || s.title };
      });
      persistSessions(sessions);
      set({ sessions });
    },
    setRecapPending: (on) =>
      set({ recapPending: on, recapError: on ? null : get().recapError }),
    setRecapError: (msg) => set({ recapError: msg, recapPending: false }),
    stashLive: () => {
      const sid = get().ensureSession();
      const transcript = get()
        .captions.filter((c) => c.en && !c.error)
        .map((c) => ({ en: c.en, zh: c.zh }));
      const sessions = get().sessions.map((s) =>
        s.id === sid
          ? {
              ...s,
              notes: get().jots,
              transcript: transcript.length ? transcript : s.transcript ?? [],
            }
          : s,
      );
      persistSessions(sessions);
      set({ sessions, liveId: sid });
    },
    ping: (msg) => {
      set({ flash: msg });
      window.setTimeout(() => {
        if (get().flash === msg) set({ flash: null });
      }, 1400);
    },
    hydrateSessions: () => {
      const sessions = loadSessions();
      if (!sessions.length) return;
      const open = sessions.find((s) => !s.endedAt) ?? null;
      const tape = open?.transcript ?? [];
      set({
        sessions,
        liveId: open?.id ?? null,
        sessionId: get().sessionId ?? open?.id ?? sessions[0]?.id ?? null,
        jots: open?.notes ?? get().jots,
        captions: tape.map((t, i) => ({
          id: `hyd-${i}`,
          seq: i + 1,
          at: (open?.startedAt ?? 0) + i,
          en: t.en,
          zh: t.zh,
          pending: false,
        })),
        seq: tape.length,
      });
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
      get().ensureSession();
    },
    clear: (opts) => {
      const ask = emptyAsk();
      const tx = emptyTx();
      const liveId = get().liveId ?? get().sessionId;
      const sessions = get().sessions.map((s) =>
        s.id === liveId && !s.endedAt ? { ...s, endedAt: Date.now() } : s,
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
        sessionId: opts?.keepBay ? liveId : get().sessionId,
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
      });
    },
  };
});
