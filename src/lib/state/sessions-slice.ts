import type { StateCreator } from "zustand";
import type { ClassRecap, ClassSegment, ClassSession, Jot } from "@/lib/types";
import { isRemoved, isRemovedJot, markRemoved, markRemovedJot } from "@/lib/persist";
import { mergeNotes, mergeTape, unionById } from "@/lib/session-merge";
import { SESSION_KEEP, SESSION_SCHEMA_VERSION } from "@/lib/session-limits";
import { isSampleId } from "@/lib/samples";
import { sortSessions, toggleStar } from "@/lib/session-order";
import { parseClassMode, type ClassMode } from "@/lib/class-mode";
import { canAutoTitle, stampTitle } from "@/lib/utils";
import type { RecapStage } from "@/lib/recap-stage";
import {
  DiskReadError,
  isPersistReady,
  isSkeleton,
  loadSessions,
  mergeSessions,
  persistSessions,
  pullCloud,
  readDiskCatalog,
  releasePersistQueue,
  setCloudRefresher,
} from "@/lib/session-persist";
import { probeStorage, writeSessions } from "@/lib/persist";
import { phaseFromCatalog } from "@/lib/engine/class-machine";
import type { AppState } from "./app-state";
import { HUD_BLANK } from "./live-slice";

/**
 * The catalog of classes and which one is open where. `liveId` is the class
 * being heard; `sessionId` is the class the handout page is looking at; they
 * differ as soon as the student reads an old handout mid-class.
 */
export type SessionsSlice = {
  sessions: ClassSession[];
  sessionId: string | null;
  liveId: string | null;
  classMode: ClassMode;
  jots: Jot[];
  /** True once the catalog has been read from this device at least once. */
  hydrated: boolean;
  recapPending: boolean;
  recapStage: RecapStage | null;
  recapError: string | null;
  /** Which class the pending write / last error is about; other handouts show neither. */
  recapTarget: string | null;
  setClassMode: (mode: ClassMode) => void;
  /** Add a note to `targetId`, else to the open class (starting one if the mic is on). */
  addJot: (
    draft: { en?: string; zh?: string; src: Jot["src"] },
    targetId?: string,
  ) => string | null;
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
  setRecap: (recap: ClassRecap, sessionId?: string) => void;
  /** The 课程脉络 of one class, as the structure runtime re-cuts it; disk only, the cloud gets it with the next stash. */
  setSegments: (sid: string, segments: ClassSegment[]) => void;
  setRecapPending: (on: boolean, target?: string) => void;
  setRecapStage: (stage: RecapStage | null) => void;
  setRecapError: (msg: string | null) => void;
  /** Write the class being heard into its session. `diskOnly` skips the cloud push (the periodic safety copy). */
  stashLive: (opts?: { diskOnly?: boolean }) => void;
  hydrateSessions: () => void;
  /** Pull what changed in the cloud since the last pull and merge it in; quiet when signed out or offline. */
  syncCloud: () => Promise<void>;
  armClock: () => void;
  clear: (opts?: { keepRecap?: boolean }) => void;
};

let nid = 0;
const idOf = (p: string) => {
  nid += 1;
  return `${p}-${Date.now().toString(36)}-${nid.toString(36)}`;
};

/** An "open" class nobody has touched for this long is not being heard anywhere. */
const OPEN_STALE_MS = 6 * 3600_000;
const isStaleOpen = (s: ClassSession, now = Date.now()) => !s.endedAt && now - (s.updatedAt ?? 0) > OPEN_STALE_MS;

/**
 * The stamp for an edit made now. Never earlier than the copy's current stamp:
 * after a merge that stamp may come from another device's clock, and an edit
 * that moved `updatedAt` backwards would be refused by the server as stale.
 */
const stamp = (s: { updatedAt?: number }) => Math.max(Date.now(), (s.updatedAt ?? 0) + 1);

export const createSessionsSlice: StateCreator<AppState, [], [], SessionsSlice> = (set, get) => {
  const persist = (sessions: ClassSession[], opts?: { cloud?: boolean }) =>
    persistSessions(sessions, () => get().sessions, opts);

  /**
   * Put a catalog read from disk or the cloud into the store without disturbing
   * the class being heard: captions, notes and the phase of a live class in this
   * tab win over what the catalog says about it.
   */
  const applyCatalog = (sessions: ClassSession[], hydrated: boolean, adoptOpen = false) => {
    if (!sessions.length && get().sessions.length) return;
    const cur = get();
    // This tab's class first. On a fresh load (`adoptOpen`, the disk stages
    // only) a class left open on this device comes back as paused, so 继续听
    // continues the same hour; a class open on another device (cloud pull)
    // is never adopted here.
    const open =
      sessions.find((s) => s.id === cur.liveId && !s.endedAt) ??
      (adoptOpen && !cur.liveId
        ? (sortSessions(sessions.filter((s) => !s.endedAt && !isStaleOpen(s)))[0] ?? null)
        : null);
    const tape = open?.transcript ?? [];
    const keepTape = cur.captions.length > 0;
    const keepSession =
      (cur.sessionId && sessions.some((s) => s.id === cur.sessionId) ? cur.sessionId : null) ??
      open?.id ??
      sessions[0]?.id ??
      null;
    set({
      hydrated: hydrated || cur.hydrated,
      sessions: sessions.filter((s) => !isRemoved(s.id)),
      liveId: open?.id ?? (keepTape ? cur.liveId : null),
      sessionId: keepSession,
      jots: open ? mergeNotes(cur.jots, open.notes ?? [], isRemovedJot) : cur.jots,
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
      // The cards and DeepSearch of an open class come back with its tape,
      // so the next stash does not replace them with only what came after.
      coaches: keepTape || !open ? cur.coaches : unionById(open.coaches ?? [], cur.coaches),
      coach: keepTape || !open ? cur.coach : (cur.coach ?? open.coaches?.at(-1) ?? null),
      essays: open ? { ...(open.essays ?? {}), ...cur.essays } : cur.essays,
      classMode: open ? parseClassMode(open.classMode) : cur.classMode,
      phase: phaseFromCatalog(cur.phase, Boolean(open)),
    });
  };

  // Sample handouts used to be written into every catalog; they are pages of
  // their own now. Tombstone any copy still around so the cloud drops it too.
  const withoutSamples = (sessions: ClassSession[]) => {
    const strays = sessions.filter((s) => isSampleId(s.id));
    if (!strays.length) return sessions;
    for (const s of strays) markRemoved(s.id);
    return sessions.filter((s) => !isSampleId(s.id));
  };
  const blankRecap = (title: string, topics: { en: string; zh: string }[]): ClassRecap => ({
    title,
    lede: "",
    ledeZh: "",
    sections: [],
    topics,
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
  });

  return {
    sessions: [],
    sessionId: null,
    liveId: null,
    classMode: "interactive",
    jots: [],
    hydrated: false,
    recapPending: false,
    recapStage: null,
    recapError: null,
    recapTarget: null,
    setClassMode: (mode) => {
      const classMode = parseClassMode(mode);
      const liveId = get().liveId;
      const sessions = get().sessions.map((s) =>
        s.id === liveId && !s.endedAt ? { ...s, classMode, updatedAt: stamp(s) } : s,
      );
      persist(sessions);
      set({ classMode, sessions });
    },
    addJot: (draft, targetId) => {
      const en = (draft.en ?? "").replace(/\s+/g, " ").trim();
      const zh = (draft.zh ?? "").replace(/\s+/g, " ").trim();
      if (!en && !zh) return null;
      const open = get().sessions.find((s) => s.id === get().liveId && !s.endedAt);
      const sid =
        targetId ??
        open?.id ??
        (get().listening || get().mic === "arming" ? get().ensureSession() : get().sessionId);
      if (!sid) return null;
      const host = get().sessions.find((s) => s.id === sid);
      const current = host?.notes ?? get().jots;
      const last = current.at(-1);
      if (last && last.en === en && last.zh === zh && Date.now() - last.at < 2000) return last.id;
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
        s.id === sid ? { ...s, notes, updatedAt: stamp(s) } : s,
      );
      persist(sessions);
      set({ sessions, jots: get().liveId === sid ? notes : get().jots });
      return jot.id;
    },
    patchJot: (id, patch) => {
      const next = (j: Jot) =>
        j.id === id ? { ...j, ...patch, pending: patch.pending ?? false } : j;
      const sessions = get().sessions.map((s) =>
        s.notes.some((j) => j.id === id)
          ? { ...s, notes: s.notes.map(next), updatedAt: stamp(s) }
          : s,
      );
      persist(sessions);
      set({ sessions, jots: get().jots.map(next) });
    },
    removeJot: (id) => {
      markRemovedJot(id);
      const sessions = get().sessions.map((s) =>
        s.notes.some((j) => j.id === id)
          ? { ...s, notes: s.notes.filter((j) => j.id !== id), updatedAt: stamp(s) }
          : s,
      );
      persist(sessions);
      set({ sessions, jots: get().jots.filter((j) => j.id !== id) });
    },
    renameSession: (id, title) => {
      const name = title.replace(/\s+/g, " ").trim().slice(0, 56);
      if (!name) return;
      const sessions = get().sessions.map((s) => {
        if (s.id !== id) return s;
        return {
          ...s,
          title: name,
          recap: s.recap ? { ...s.recap, title: name, at: Math.max(Date.now(), (s.recap.at ?? 0) + 1) } : s.recap,
          updatedAt: stamp(s),
        };
      });
      persist(sessions);
      set({ sessions });
    },
    starSession: (id) => {
      const sessions = sortSessions(get().sessions.map((s) => (s.id === id ? toggleStar(s) : s)));
      persist(sessions);
      set({ sessions });
    },
    forkSession: (fromId) => {
      const src = get().sessions.find((s) => s.id === fromId);
      if (!src) return null;
      const next: ClassSession = {
        id: idOf("ses"),
        schemaVersion: SESSION_SCHEMA_VERSION,
        title: (src.recap?.title || src.title).replace(/\s·\s再出/g, "").trim() || src.title,
        startedAt: Date.now(),
        endedAt: Date.now(),
        notes: src.notes.map((j) => ({ ...j, id: idOf("jot") })),
        recap: null,
        transcript: src.transcript.map((t) => ({ ...t })),
        coaches: src.coaches ?? [],
        essays: src.essays ?? {},
        segments: [],
        classMode: parseClassMode(src.classMode),
        sourceId: src.id,
        sourceTitle: src.title,
        starred: false,
        starredAt: null,
        updatedAt: Date.now(),
      };
      const sessions = sortSessions([next, ...get().sessions]).slice(0, SESSION_KEEP);
      persist(sessions);
      set({ sessions, sessionId: next.id });
      return next.id;
    },
    goHome: () => {
      const open = get().sessions.some((s) => s.id === get().liveId && !s.endedAt);
      if (open) {
        set({ jotOpen: false });
        return;
      }
      // The handout being written (recapPending / recapStage / recapError)
      // belongs to the paper, not the HUD: leaving for the home screen must
      // not hide the write or invite a duplicate 整理.
      set({
        ...HUD_BLANK,
        listening: get().listening,
        engineError: get().engineError,
        jotOpen: false,
        jots: [],
        liveId: null,
      });
    },
    removeSession: (id) => {
      markRemoved(id);
      const sessions = get().sessions.filter((s) => s.id !== id);
      persist(sessions);
      const sessionId = get().sessionId === id ? (sessions[0]?.id ?? null) : get().sessionId;
      const liveId = get().liveId === id ? null : get().liveId;
      set({
        sessions,
        sessionId,
        liveId,
        jots: liveId ? get().jots : [],
        phase: liveId ? get().phase : phaseFromCatalog(get().phase, false),
      });
    },
    updateRecap: (id, patch) => {
      const sessions = get().sessions.map((s) => {
        if (s.id !== id || !s.recap) return s;
        const recap = { ...s.recap, ...patch, at: Math.max(Date.now(), (s.recap.at ?? 0) + 1) };
        return { ...s, recap, title: recap.title || s.title, updatedAt: stamp(s) };
      });
      persist(sessions);
      set({ sessions });
    },
    ensureSession: () => {
      const cur = get().sessions.find((s) => s.id === get().liveId && !s.endedAt);
      if (cur) return cur.id;
      if (!get().listening && get().mic !== "arming") return get().liveId ?? get().sessionId ?? "";
      const now = Date.now();
      const next: ClassSession = {
        id: idOf("ses"),
        schemaVersion: SESSION_SCHEMA_VERSION,
        title: stampTitle(now),
        classMode: get().classMode,
        startedAt: now,
        endedAt: null,
        notes: [],
        recap: null,
        transcript: [],
        coaches: [],
        essays: {},
        segments: [],
        sourceId: null,
        sourceTitle: null,
        starred: false,
        starredAt: null,
        updatedAt: now,
      };
      // Only a class this tab was hearing gets closed; an open class pulled
      // from another device is that device's business.
      const mine = get().liveId;
      const closed = get().sessions.map((s) =>
        !s.endedAt && (s.id === mine || isStaleOpen(s, now)) ? { ...s, endedAt: now, updatedAt: stamp(s) } : s,
      );
      const sessions = sortSessions([next, ...closed]).slice(0, SESSION_KEEP);
      persist(sessions);
      set({
        sessions,
        liveId: next.id,
        jots: [],
        sessionId: get().sessionId ?? next.id,
      });
      return next.id;
    },
    // `jots` stays the live class's notes: loading another class's notes here
    // would let the next `stashLive` write them into the class being heard.
    setSession: (id) => {
      const hit = get().sessions.find((s) => s.id === id);
      if (!hit) return;
      if (get().sessionId === id) return;
      set({ sessionId: id, recapError: null });
    },
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
              updatedAt: stamp(s),
            }
          : s,
      );
      persist(sessions);
      set({
        sessions,
        recapPending: recap.draft ? get().recapPending : false,
        recapError: recap.draft ? get().recapError : null,
        sessionId: sid ?? get().sessionId,
      });
    },
    setSegments: (sid, segments) => {
      const sessions = get().sessions.map((s) => (s.id === sid ? { ...s, segments, updatedAt: stamp(s) } : s));
      persist(sessions, { cloud: false });
      set({ sessions });
    },
    setRecapPending: (on, target) =>
      set({
        recapPending: on,
        recapTarget: on ? (target ?? get().recapTarget) : get().recapTarget,
        recapStage: on ? get().recapStage : null,
        recapError: on ? null : get().recapError,
      }),
    setRecapStage: (stage) => set({ recapStage: stage }),
    setRecapError: (msg) => set({ recapError: msg, recapPending: false, recapStage: null }),
    stashLive: (opts) => {
      const sid = get().liveId;
      if (!sid) return;
      // A line whose Chinese failed was still heard: keep the English.
      const transcript = get()
        .captions.filter((c) => c.en)
        .map((c) => ({ en: c.en, zh: c.error ? "" : c.zh }));
      const coachTopics = get()
        .coaches.map((c) => ({ en: c.topic.trim(), zh: c.topicZh || "" }))
        .filter((t) => t.en);
      const sessions = get().sessions.map((s) => {
        if (s.id !== sid) return s;
        const recap = s.recap
          ? { ...s.recap, topics: s.recap.topics.length ? s.recap.topics : coachTopics }
          : coachTopics.length
            ? blankRecap(s.title, coachTopics)
            : null;
        // The session accumulates; the screen holds only the newest lines and
        // whatever was heard since a reload, so it never overwrites the tape.
        return {
          ...s,
          notes: mergeNotes(get().jots, s.notes ?? [], isRemovedJot),
          transcript: mergeTape(s.transcript ?? [], transcript),
          coaches: unionById(s.coaches ?? [], get().coaches),
          essays: { ...(s.essays ?? {}), ...get().essays },
          recap,
          updatedAt: stamp(s),
        };
      });
      persist(sessions, opts?.diskOnly ? { cloud: false } : undefined);
      set({ sessions, liveId: sid });
    },
    // Three stages, each applied as it lands: the index (synchronous, skeleton
    // rows so the catalog paints at once), this device's IndexedDB (the classes
    // themselves — `hydrated` flips here), then the cloud when signed in.
    hydrateSessions: () => {
      const flushQueue = () => {
        const queued = releasePersistQueue();
        if (queued) persist(queued);
      };
      // The shell mounts again after a sign-in round trip; the classes are
      // already in memory then, so the index stage would only replace them
      // with shells for a moment. Re-read the disk and merge instead.
      if (!get().hydrated) {
        try {
          applyCatalog(withoutSamples(loadSessions()), false, true);
        } catch {
          /* no index yet */
        }
      }
      window.setTimeout(() => {
        if (!isPersistReady()) flushQueue();
      }, 2500);
      setCloudRefresher(() => void get().syncCloud());
      void (async () => {
        try {
          const probe = await probeStorage();
          if (!probe.ok) {
            set({ engineError: "本机存储写不进去。无痕模式或空间已满时，纪要可能保不住。" });
          }
          let next = await readDiskCatalog(get().sessions);
          const queued = releasePersistQueue();
          if (queued) next = mergeSessions(next, queued);
          next = withoutSamples(next);
          // Just read everything: safe to drop records that are not in this list.
          writeSessions(next, { prune: true, skip: isSkeleton });
          applyCatalog(next, true, true);
        } catch (err) {
          // The read failed: keep showing the index, write nothing derived
          // from it back (a shell would cover the real class), and say so.
          flushQueue();
          set({
            hydrated: true,
            engineError:
              err instanceof DiskReadError
                ? "这台设备上存的课堂没读出来。这次不改动本机存档，刷新一次再试。"
                : get().engineError,
          });
        }
        await get().syncCloud();
      })();
    },
    // Pull first, then push: what the server already has newer never goes up.
    // Signed out, the pull throws and nothing is pushed either.
    syncCloud: async () => {
      if (!get().hydrated) return;
      try {
        const pulled = await pullCloud(get().sessions);
        // Edits made during the round trip live in `get().sessions` now.
        const next = withoutSamples(mergeSessions(get().sessions, pulled.sessions));
        applyCatalog(next, true);
        if (pulled.switched) {
          // A different account: the previous account's rows leave this device.
          writeSessions(next, { prune: true, skip: isSkeleton });
        }
        persist(get().sessions);
      } catch {
        /* signed out or offline */
      }
    },
    armClock: () => {
      if (!get().startedAt) set({ startedAt: Date.now() });
      if (get().listening || get().mic === "arming") get().ensureSession();
    },
    clear: (opts) => {
      const now = Date.now();
      const liveId = get().liveId;
      const sessions = get().sessions.map((s) =>
        !s.endedAt && (s.id === liveId || isStaleOpen(s, now)) ? { ...s, endedAt: now, updatedAt: stamp(s) } : s,
      );
      persist(sessions);
      set({
        ...HUD_BLANK,
        jots: [],
        sessions,
        liveId: null,
        sessionId: opts?.keepRecap ? (liveId ?? get().sessionId) : get().sessionId,
        recapPending: opts?.keepRecap ? get().recapPending : false,
        recapError: opts?.keepRecap ? get().recapError : null,
      });
    },
  };
};
