import { parseClassMode, type ClassMode } from "../class-mode.ts";
import { createCaptionPipeline } from "./caption-pipeline.ts";
import { nextPhase, type ClassEvent } from "./class-machine.ts";
import { createCoachRuntime } from "./coach-runtime.ts";
import type { AiApi, EngineStore } from "./context.ts";
import { createDeepRuntime } from "./deep-runtime.ts";
import { createListenRuntime } from "./listen-runtime.ts";
import { createNoteRuntime } from "./note-runtime.ts";
import { createRecapRuntime } from "./recap-runtime.ts";

export const TICK_MS = 2800;

export type EngineDeps = {
  store: EngineStore;
  api: AiApi;
  now?: () => number;
};

/**
 * The class engine: a state machine plus four runtimes (captions, coach,
 * DeepSearch, handout) wired together. It owns every timer and generation
 * counter, so nothing about the class depends on which React component is
 * mounted; the store is its projection.
 */
export function createEngine(deps: EngineDeps) {
  const ctx = { store: deps.store, api: deps.api, now: deps.now ?? Date.now };
  const { store } = ctx;

  const openClass = () => {
    const s = store.getState();
    return s.sessions.some((x) => x.id === s.liveId && !x.endedAt);
  };

  function dispatch(event: ClassEvent): boolean {
    const s = store.getState();
    const next = nextPhase(s.phase, event, { openClass: openClass() });
    if (next === null) return false;
    if (next !== s.phase) s.setPhase(next);
    return true;
  }

  const recap = createRecapRuntime(ctx);
  const coach = createCoachRuntime(ctx);
  const deep = createDeepRuntime(ctx);
  const captions = createCaptionPipeline(ctx, {
    onLine: () => {
      coach.bump();
      recap.touch();
    },
  });
  const notes = createNoteRuntime(ctx, { onNote: () => recap.touch() });
  const listen = createListenRuntime(ctx, { onFinal: (t) => captions.ingest(t), dispatch });

  let tick: ReturnType<typeof setInterval> | null = null;

  /** Drop every in-flight write for the class. `keepHandout` leaves a running 整理 alone. */
  function abortLive(opts?: { keepHandout?: boolean }) {
    coach.abort();
    deep.abort();
    captions.abort();
    notes.abort();
    if (opts?.keepHandout) recap.abortOutline();
    else recap.abort();
  }

  function closeMic() {
    const s = store.getState();
    s.stashLive();
    s.setListening(false);
    s.setMic("idle");
    s.setInterim("");
    listen.stop();
  }

  /** 暂停: close the mic, keep the class open. */
  function safe() {
    closeMic();
    dispatch("pause");
  }

  /** 开始听 / 继续听. Ignored while already arming or listening. */
  function arm(mode?: ClassMode) {
    if (!dispatch("arm")) return;
    const s = store.getState();
    const open = s.sessions.find((x) => x.id === s.liveId && !x.endedAt) ?? null;
    s.setView("live");
    if (!open) {
      s.resetHud();
      if (mode) s.setClassMode(mode);
    } else {
      s.setClassMode(parseClassMode(open.classMode ?? s.classMode));
    }
    s.setListening(true);
    s.setMic("arming");
    s.setEngineError("请允许麦克风。接通后会出现「听课中」。");
    s.armClock();
    listen.start();
  }

  /** 结课: close the class, then write the handout. A second click while ending is ignored. */
  async function endClass() {
    if (!dispatch("end")) return;
    const s = store.getState();
    const topics = s.coaches.map((c) => c.topic).filter(Boolean);
    abortLive();
    closeMic();
    const sid = s.liveId ?? s.sessionId;
    s.clear({ keepRecap: true });
    if (sid) s.setSession(sid);
    s.setView("recap");
    dispatch("ended");
    const session = store.getState().sessions.find((x) => x.id === sid);
    const ready = (session?.transcript.length ?? 0) >= 2;
    const polished = Boolean(session?.recap && !session.recap.draft && session.recap.lede);
    if (sid && ready && !polished) await recap.request(sid, topics);
  }

  /** 首页. With no class open, the live HUD is wiped; a running 整理 keeps going. */
  function goHomeSafe() {
    const s = store.getState();
    if (!openClass()) {
      abortLive({ keepHandout: true });
      dispatch("reset");
    }
    s.goHome();
  }

  /** 纪要 from the top bar: stash the live class and show it. */
  function openRecap() {
    const s = store.getState();
    if (s.liveId) {
      s.stashLive();
      s.setSession(s.liveId);
    } else if (!s.sessionId && s.sessions[0]) {
      s.setSession(s.sessions[0].id);
    }
    s.setView("recap");
    captions.retryPending();
  }

  /** One heartbeat: retry missing Chinese, rescue a quiet coach. Runs whether or not any panel is mounted. */
  function beat() {
    captions.retryPending();
    coach.rescue();
  }

  return {
    arm,
    safe,
    endClass,
    goHomeSafe,
    openRecap,
    abortLive,
    beat,
    ingest: (en: string) => captions.ingest(en),
    retryPendingZh: () => captions.retryPending(),
    requestCoach: (spoken?: string) => coach.request(spoken),
    setCoachLive: (on: boolean) => coach.setLive(on),
    requestEssay: (coachId?: string) => deep.request(coachId),
    captureNote: notes.capture,
    requestRecap: (targetId?: string, hintTopics?: string[]) => recap.request(targetId, hintTopics),
    forkAndRecap: (fromId: string) => recap.forkAndRecap(fromId),
    /** Start the heartbeat once; safe to call again. */
    start() {
      if (tick != null) return;
      if (listen.unsupported() && store.getState().mic === "idle") store.getState().setMic("unsupported");
      tick = setInterval(beat, TICK_MS);
    },
    stop() {
      if (tick != null) clearInterval(tick);
      tick = null;
    },
    get running() {
      return tick != null;
    },
  };
}

export type Engine = ReturnType<typeof createEngine>;
