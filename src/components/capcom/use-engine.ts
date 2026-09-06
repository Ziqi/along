import { useEffect } from "react";
import { SpeechController, speechSupported } from "@/lib/speech-controller";
import { micSupported, SttController } from "@/lib/stt-controller";
import { useCapcom } from "@/lib/store";
import {
  askTopic,
  expandTopic,
  liveCoach,
  liveTranslate,
  mintSttSecret,
  recapClass,
  liveOutline,
  quickTranslate,
} from "@/lib/capcom-ai";
import { SIM_LINES } from "@/components/capcom/sim-feed";

let coachGen = 0;
let essayGen = 0;
let askGen = 0;
let controller: SpeechController | SttController | null = null;
let simTimer: number | null = null;
let simPartialTimer: number | null = null;
let simIndex = 0;
let transTimer: number | null = null;
let coachTimer: number | null = null;
let liveRecapTimer: number | null = null;
let liveRecapGen = 0;
const transBatch: { id: string; en: string }[] = [];

export function ingest(en: string) {
  const store = useCapcom.getState();
  const id = store.pushFinal(en);
  if (!id) return;
  store.armClock();
  const existing = transBatch.find((b) => b.id === id);
  if (existing) existing.en = en;
  else transBatch.push({ id, en });
  if (transTimer != null) window.clearTimeout(transTimer);
  transTimer = window.setTimeout(() => {
    transTimer = null;
    void flushTranslate();
  }, 50);
  if (store.autoCoach) {
    if (coachTimer != null) window.clearTimeout(coachTimer);
    coachTimer = window.setTimeout(() => {
      coachTimer = null;
      void flushCoach("auto");
    }, 2200);
  }
  scheduleLiveRecap();
}

async function flushTranslate() {
  const lines = transBatch.splice(0, transBatch.length);
  if (!lines.length) return;
  const result = await liveTranslate({ data: { lines } });
  const s = useCapcom.getState();
  if (!result.ok) {
    for (const line of lines) s.markError(line.id, result.error);
    return;
  }
  for (const line of lines) {
    const hit = result.items.find((it) => it.id === line.id);
    s.setZh(line.id, { zh: hit?.zh || line.en, ms: result.ms });
  }
}

async function flushCoach(source: "auto" | "intent", spoken?: string) {
  const store = useCapcom.getState();
  const intent = source === "intent" ? (spoken ?? store.intent).trim() : "";
  const last = store.captions.at(-1)?.en ?? "";
  if (!last && !intent) return;
  if (!store.autoCoach && source === "auto") return;
  if (source === "auto") {
    const words = last.split(/\s+/).filter(Boolean);
    const isQ =
      /[?？]$/.test(last) ||
      /^(wh(at|y|o|ere|en|ich)|how|do |does |did |is |are |can |could |would |will |should )/i.test(
        last,
      );
    if (words.length < 6 && !isQ) return;
    const prev = store.coach;
    if (prev) {
      if (prev.prompt === last && Date.now() - prev.at < 12000) return;
      if (!isQ && Date.now() - prev.at < 14000) return;
    }
  }
  const gen = ++coachGen;
  store.setCoachPending(true);
  const result = await liveCoach({
    data: {
      last,
      recent: store.captions.slice(-16).map((c) => c.en),
      intent,
    },
  });
  if (gen !== coachGen) return;
  if (!result.ok) {
    useCapcom.getState().setCoachError(result.error);
    return;
  }
  if (!result.options.length) {
    useCapcom.getState().setCoachError("教练没给出三条，再听一句。");
    return;
  }
  if (source === "intent") useCapcom.getState().setIntent("");
  useCapcom.getState().setCoach({
    id: `c-${Date.now().toString(36)}`,
    topic: result.topic,
    topicZh: result.topicZh,
    move: result.move,
    options: result.options,
    source,
    prompt: intent || last,
    latencyMs: result.ms,
    at: Date.now(),
  });
}

export function requestCoach(spoken?: string) {
  void flushCoach("intent", spoken);
}

export function setCoachLive(on: boolean) {
  useCapcom.getState().setAutoCoach(on);
  if (!on) {
    if (coachTimer != null) {
      window.clearTimeout(coachTimer);
      coachTimer = null;
    }
    useCapcom.getState().setCoachPending(false);
    return;
  }
  void flushCoach("auto");
}

export async function requestEssay(coachId?: string) {
  const store = useCapcom.getState();
  const card =
    (coachId ? store.coaches.find((c) => c.id === coachId) : null) ?? store.coach;
  const gen = ++essayGen;
  store.setEssayPending(true, card?.id ?? null);
  const caps = store.captions;
  try {
    const result = await expandTopic({
      data: {
        lastHeard: caps.at(-1)?.en ?? "",
        recent: caps.slice(-12).map((c) => c.en),
        topic: card?.topic ?? "",
        move: card?.move ?? "",
        options: (card?.options ?? []).map((o) => o.en),
      },
    });
    if (gen !== essayGen) return;
    if (!result.ok) {
      useCapcom.getState().setEssayPending(false);
      return;
    }
    useCapcom.getState().setEssay(
      {
        title: result.title,
        viewZh: result.viewZh,
        viewEn: result.viewEn,
        qZh: result.qZh,
        qEn: result.qEn,
        aZh: result.aZh,
        aEn: result.aEn,
        say: result.say,
        terms: result.terms,
        latencyMs: result.ms,
        at: Date.now(),
      },
      card?.id,
    );
  } catch {
    if (gen === essayGen) useCapcom.getState().setEssayPending(false);
  }
}

export async function requestAsk(q: string) {
  const topic = q.trim();
  if (!topic) return;
  const store = useCapcom.getState();
  const thread = store.askThreads.find((t) => t.id === store.askActiveId);
  const gen = ++askGen;
  store.setAskPending(true);
  try {
    const result = await askTopic({
      data: {
        q: topic,
        history: (thread?.turns ?? []).map((t) => ({
          q: t.q,
          zh: t.zh,
          en: t.en,
        })),
        recent: store.captions.slice(-8).map((c) => c.en),
      },
    });
    if (gen !== askGen) return;
    if (!result.ok) {
      useCapcom.getState().setAskError(result.error);
      return;
    }
    useCapcom.getState().pushAskTurn({
      q: topic,
      zh: result.zh,
      en: result.en,
      latencyMs: result.ms,
    });
  } catch {
    if (gen === askGen) useCapcom.getState().setAskError("对话暂时中断，再试一次。");
  }
}

export async function captureNote(
  raw: string,
  src: "hand" | "coach" | "deep",
  pair?: { en?: string; zh?: string },
) {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text && !pair?.en && !pair?.zh) return;
  const isZh = /[\u4e00-\u9fff]/.test(pair?.zh || text);
  const draft = {
    src,
    en: pair?.en || (isZh ? "" : text),
    zh: pair?.zh || (isZh ? text : ""),
  };
  const id = useCapcom.getState().addJot(draft);
  if (!id) return;
  useCapcom.getState().ping("已记入纪要");
  if (draft.en && draft.zh) {
    useCapcom.getState().patchJot(id, { en: draft.en, zh: draft.zh, pending: false });
    scheduleLiveRecap();
    return;
  }
  const result = await quickTranslate({ data: { text: draft.en || draft.zh } });
  if (!result.ok) {
    useCapcom.getState().patchJot(id, { pending: false });
    return;
  }
  if (result.dir === "zh-en") {
    useCapcom.getState().patchJot(id, { zh: draft.zh || text, en: result.out, pending: false });
  } else {
    useCapcom.getState().patchJot(id, { en: draft.en || text, zh: result.out, pending: false });
  }
  scheduleLiveRecap();
}

function toRecap(
  result: {
    title: string;
    lede?: string;
    outline?: { heading: string; bullets: string[] }[];
    sections?: { heading: string; body: string }[];
    topics: { en: string; zh: string }[];
    patterns: { en: string; zh: string }[];
    lines: { en: string; zh: string }[];
    words: { en: string; zh: string }[];
    ms: number;
  },
  prevOutline: { heading: string; bullets: string[] }[] = [],
) {
  return {
    title: result.title,
    lede: result.lede ?? "",
    outline: result.outline?.length ? result.outline : prevOutline,
    sections: result.sections ?? [],
    topics: result.topics,
    patterns: result.patterns,
    lines: result.lines,
    words: result.words,
    draft: false,
    latencyMs: result.ms,
    at: Date.now(),
  };
}

function scheduleLiveRecap() {
  if (liveRecapTimer != null) window.clearTimeout(liveRecapTimer);
  liveRecapTimer = window.setTimeout(() => {
    liveRecapTimer = null;
    void flushLiveRecap();
  }, 7000);
}

async function flushLiveRecap() {
  const store = useCapcom.getState();
  const sid = store.liveId;
  if (!sid || store.recapPending) return;
  const session = store.sessions.find((s) => s.id === sid);
  if (!session || session.endedAt) return;
  if (session.recap && !session.recap.draft && session.recap.lede) return;
  store.stashLive();
  const next = useCapcom.getState();
  const ses = next.sessions.find((s) => s.id === sid);
  const fromLive = next.captions
    .filter((c) => c.en && !c.error)
    .map((c) => ({ en: c.en, zh: c.zh }));
  const lines = fromLive.length >= 2 ? fromLive : (ses?.transcript ?? []);
  if (lines.length < 2 && !(ses?.notes.length)) return;
  const gen = ++liveRecapGen;
  const result = await liveOutline({
    data: {
      lines,
      topics: next.coaches.map((c) => c.topic).filter(Boolean),
      notes: (ses?.notes ?? next.jots).map((j) => j.zh || j.en),
    },
  });
  if (gen !== liveRecapGen) return;
  if (!result.ok) return;
  useCapcom.getState().setLiveDraft(sid, {
    title: result.title,
    outline: result.outline,
    topics: result.topics,
    ms: result.ms,
  });
}

export function openRecap() {
  const s = useCapcom.getState();
  if (s.liveId) {
    s.stashLive();
    s.setSession(s.liveId);
  } else if (!s.sessionId && s.sessions[0]) {
    s.setSession(s.sessions[0].id);
  }
  s.setView("recap");
}

export async function requestRecap(targetId?: string) {
  const store = useCapcom.getState();
  if (!targetId) store.stashLive();
  const live = useCapcom.getState();
  const sid = targetId ?? live.ensureSession();
  const session = live.sessions.find((s) => s.id === sid);
  const isLive = live.liveId === sid;
  const fromLive = isLive
    ? live.captions.filter((c) => c.en && !c.error).map((c) => ({ en: c.en, zh: c.zh }))
    : [];
  const lines = fromLive.length >= 2 ? fromLive : (session?.transcript ?? []);
  if (lines.length < 2) {
    live.setRecapError(targetId ? "这份没有足够实录，没法再出。" : "再听两句再出纪要。");
    live.setView("recap");
    return;
  }
  live.setRecapPending(true);
  live.setView("recap");
  live.setSession(sid);
  const topics = isLive
    ? live.coaches.map((c) => c.topic).filter(Boolean)
    : (session?.recap?.topics ?? []).map((t) => t.en);
  const result = await recapClass({
    data: {
      lines,
      topics,
      notes: (session?.notes ?? (isLive ? live.jots : [])).map((j) => j.zh || j.en),
    },
  });
  if (!result.ok) {
    useCapcom.getState().setRecapError(result.error);
    return;
  }
  useCapcom.getState().setRecap(toRecap(result, session?.recap?.outline ?? []), sid);
}

export async function forkAndRecap(fromId: string) {
  const nid = useCapcom.getState().forkSession(fromId);
  if (!nid) return;
  await requestRecap(nid);
}

export async function endClass() {
  safe();
  const store = useCapcom.getState();
  const sid = store.ensureSession();
  store.stashLive();
  const next = useCapcom.getState();
  const session = next.sessions.find((s) => s.id === sid);
  const ready = (session?.transcript.length ?? 0) >= 2;
  const polished = Boolean(session?.recap && !session.recap.draft && session.recap.lede);
  if (ready && !polished) await requestRecap(sid);
  useCapcom.getState().clear({ keepBay: ready });
  useCapcom.getState().setSession(sid);
  if (ready) useCapcom.getState().setView("recap");
}

function wireChrome() {
  controller = new SpeechController({
    onPartial: (t) => useCapcom.getState().setInterim(t),
    onFinal: (t) => ingest(t),
    onError: onListenError,
    onState: onListenState,
  });
  controller.start();
}

function onListenError(code: string) {
  if (code === "denied") {
    useCapcom.getState().setMic("denied");
    useCapcom
      .getState()
      .setEngineError("麦克风被拒绝。可点听课，或在左侧手写。");
    return;
  }
  if (code === "unsupported") {
    useCapcom.getState().setMic("unsupported");
    return;
  }
  if (code === "stt") {
    useCapcom.getState().setEngineError("实时听写断开，正在重连。");
  }
}

function onListenState(live: boolean) {
  const s = useCapcom.getState();
  if (live) s.setMic("live");
  else if (s.mic === "live" || s.mic === "arming") s.setMic("idle");
}

export function arm() {
  stopSim();
  const store = useCapcom.getState();
  store.setView("live");
  store.setMic("arming");
  store.setEngineError(null);
  store.armClock();
  controller?.stop();
  controller = null;
  if (micSupported()) {
    controller = new SttController(
      {
        onPartial: (t) => useCapcom.getState().setInterim(t),
        onFinal: (t) => ingest(t),
        onError: (code) => {
          if (code === "denied") {
            onListenError("denied");
            return;
          }
          if (code === "stt" && speechSupported()) {
            controller?.stop();
            controller = null;
            useCapcom.getState().setEngineError("改用浏览器听写。");
            wireChrome();
            return;
          }
          onListenError(code);
        },
        onState: onListenState,
      },
      async () => {
        const minted = await mintSttSecret();
        if (!minted.ok) throw new Error(minted.error);
        return minted.token;
      },
    );
    void controller.start();
    return;
  }
  if (speechSupported()) {
    wireChrome();
    return;
  }
  store.setMic("unsupported");
  store.setEngineError("此浏览器不能听写。请用 Chrome，或改走听课 / 手写。");
}

export function useCapcomEngine() {
  useEffect(() => {
    if (!micSupported() && !speechSupported()) {
      const mic = useCapcom.getState().mic;
      if (mic === "idle") useCapcom.getState().setMic("unsupported");
    }
  }, []);
}

export function stopSim() {
  if (simTimer != null) {
    window.clearInterval(simTimer);
    simTimer = null;
  }
  if (simPartialTimer != null) {
    window.clearInterval(simPartialTimer);
    simPartialTimer = null;
  }
}

export function safe() {
  controller?.stop();
  controller = null;
  stopSim();
  useCapcom.getState().setMic("idle");
  useCapcom.getState().setInterim("");
}

export function runSim() {
  stopSim();
  controller?.stop();
  controller = null;
  const store = useCapcom.getState();
  store.setMic("idle");
  store.setInterim("");
  store.armClock();
  store.setEngineError(null);
  simIndex = 0;
  const tick = () => {
    const line = SIM_LINES[simIndex % SIM_LINES.length] ?? "";
    simIndex += 1;
    let i = 1;
    if (simPartialTimer != null) window.clearInterval(simPartialTimer);
    simPartialTimer = window.setInterval(() => {
      useCapcom.getState().setInterim(line.slice(0, i));
      i += 4;
      if (i > line.length) {
        if (simPartialTimer != null) window.clearInterval(simPartialTimer);
        simPartialTimer = null;
        ingest(line);
      }
    }, 14);
  };
  tick();
  simTimer = window.setInterval(tick, 2400);
}
