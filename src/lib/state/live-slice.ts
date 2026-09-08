import type { StateCreator } from "zustand";
import type { Caption, CoachCard, MicState, TopicEssay } from "@/lib/types";
import { COACH_KEEP } from "@/lib/live-queue";
import type { ClassPhase } from "@/lib/engine/class-machine";
import type { AppState } from "./app-state";

/**
 * Transient state of the class that is happening now: captions on screen, mic,
 * the coach card in view, the DeepSearch essay, flash messages. Nothing here is
 * persisted directly — `stashLive` in the sessions slice copies it into the
 * open `ClassSession`.
 */
export type LiveSlice = {
  /** Where the class machine is; written by the engine only. */
  phase: ClassPhase;
  captions: Caption[];
  interim: string;
  mic: MicState;
  /** Which recognizer is on the mic: xAI's, or the browser's own as a fallback. */
  sttBackend: "xai" | "browser" | null;
  /** Why the browser recognizer is on, for the student to read; null when xAI is. */
  sttNote: string | null;
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
  flash: string | null;
  jotOpen: boolean;
  /** Which face the pad opens on: a note to keep, or a line to say. */
  jotMode: "note" | "say";
  intent: string;
  engineError: string | null;
  seq: number;
  setPhase: (phase: ClassPhase) => void;
  pushFinal: (en: string) => string;
  setZh: (id: string, patch: { zh: string; ms: number; en?: string }) => void;
  markError: (id: string, error: string) => void;
  setInterim: (text: string) => void;
  setMic: (mic: MicState) => void;
  setSttBackend: (backend: "xai" | "browser" | null, note?: string | null) => void;
  setListening: (on: boolean) => void;
  setAutoCoach: (on: boolean) => void;
  setIntent: (text: string) => void;
  setCoach: (card: CoachCard | null) => void;
  setCoachPending: (on: boolean) => void;
  setCoachError: (msg: string | null) => void;
  setEssay: (essay: TopicEssay | null, coachId?: string, keepPending?: boolean) => void;
  setEssayPending: (on: boolean, coachId?: string | null) => void;
  setEssayError: (msg: string | null) => void;
  ping: (msg: string) => void;
  setJotOpen: (on: boolean, mode?: "note" | "say") => void;
  setEngineError: (msg: string | null) => void;
  resetHud: () => void;
};

const FILLER = /^(yeah|yes|yep|yup|right|exactly|okay|ok|so|and|well|um|uh|like|oh)\.?$/i;
const TAIL = /\b(a|an|the|and|but|or|to|of|for|with|in|on|at|if|that|this|so|like|just)\.?$/i;
const CONT = /^(and|but|so|because|which|that|like|then|or|also)\b/i;

export function isSpeech(en: string) {
  const t = en.replace(/\s+/g, " ").trim();
  if (t.length < 2) return false;
  const letters = t.match(/[a-zA-Z\u4e00-\u9fff]/g)?.length ?? 0;
  if (letters < 3) return false;
  if (/^[?？!！.。,，\-…\s]+$/.test(t)) return false;
  if (/^(uh+|um+|ah+|hmm+|mm+|oh+|huh+)$/i.test(t)) return false;
  if (/^\[(inaudible|blank.?audio|music|silence|noise)\]$/i.test(t)) return false;
  return true;
}

export function shouldMerge(prev: string, next: string) {
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

/** The HUD fields `resetHud` and `clear` both wipe. */
export const HUD_BLANK = {
  captions: [] as Caption[],
  interim: "",
  coach: null,
  coaches: [] as CoachCard[],
  coachError: null,
  coachPending: false,
  essay: null,
  essays: {} as Record<string, TopicEssay>,
  essayPending: false,
  essayTarget: null,
  seq: 0,
  startedAt: null,
  lastLatency: null,
  engineError: null,
  listening: false,
  sttBackend: null,
  sttNote: null,
};

export const createLiveSlice: StateCreator<AppState, [], [], LiveSlice> = (set, get) => ({
  phase: "idle",
  captions: [],
  interim: "",
  mic: "idle",
  sttBackend: null,
  sttNote: null,
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
  flash: null,
  jotOpen: false,
  jotMode: "note",
  intent: "",
  engineError: null,
  seq: 0,
  setPhase: (phase) => set({ phase }),
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
            ? { ...c, en: text.length > last.en.length ? text : last.en, pending: true, zh: "" }
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
    const row: Caption = { id, seq, at: Date.now(), en: text, zh: "", pending: true };
    set({ seq, captions: [...get().captions, row].slice(-180), interim: "" });
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
    set({ captions: get().captions.map((c) => (c.id === id ? { ...c, pending: false, error } : c)) });
  },
  setInterim: (text) => set({ interim: text }),
  setMic: (mic) => set({ mic }),
  setSttBackend: (backend, note = null) => set({ sttBackend: backend, sttNote: backend === "browser" ? note : null }),
  setListening: (on) => set({ listening: on }),
  setAutoCoach: (on) => set({ autoCoach: on }),
  setIntent: (text) => set({ intent: text }),
  setCoach: (card) => {
    if (!card) {
      set({ coach: null, coachError: null, coachPending: false });
      return;
    }
    const coaches = [...get().coaches, card].slice(-COACH_KEEP);
    set({ coaches, coach: card, coachError: null, coachPending: false });
  },
  setCoachPending: (on) => set({ coachPending: on }),
  setCoachError: (msg) => set({ coachError: msg, coachPending: false }),
  setEssay: (essay, coachId, keepPending) => {
    const card = (coachId ? get().coaches.find((c) => c.id === coachId) : null) ?? get().coach;
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
      essayTarget: keepPending ? (coachId ?? card?.id ?? get().essayTarget) : get().essayTarget,
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
  ping: (msg) => {
    set({ flash: msg });
    window.setTimeout(() => {
      if (get().flash === msg) set({ flash: null });
    }, 1400);
  },
  setJotOpen: (on, mode) => set(mode ? { jotOpen: on, jotMode: mode } : { jotOpen: on }),
  setEngineError: (msg) => set({ engineError: msg }),
  resetHud: () => set({ ...HUD_BLANK, jots: [], liveId: null }),
});
