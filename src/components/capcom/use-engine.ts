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
  }
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
  useCapcom.getState().ping("已记入笔记");
  if (draft.en && draft.zh) {
    useCapcom.getState().patchJot(id, { en: draft.en, zh: draft.zh, pending: false });
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
}

export async function requestRecap(targetId?: string) {
  const store = useCapcom.getState();
  if (targetId) {
    const session = store.sessions.find((s) => s.id === targetId);
    const lines = session?.transcript ?? [];
    if (lines.length < 2) {
      store.setRecapError("这份没有足够实录，没法再出。");
      store.setView("recap");
      return;
    }
    store.setRecapPending(true);
    store.setView("recap");
    const result = await recapClass({
      data: {
        lines,
        topics: [],
        notes: (session?.notes ?? []).map((j) => j.zh || j.en),
      },
    });
    if (!result.ok) {
      useCapcom.getState().setRecapError(result.error);
      return;
    }
    useCapcom.getState().setRecap(
      {
        title: result.title,
        lede: result.lede ?? "",
        sections: result.sections ?? [],
        topics: result.topics,
        patterns: result.patterns,
        lines: result.lines,
        words: result.words,
        latencyMs: result.ms,
        at: Date.now(),
      },
      targetId,
    );
    return;
  }

  const sid = store.ensureSession();
  store.stashLive();
  const live = useCapcom.getState();
  const session = live.sessions.find((s) => s.id === sid);
  const fromLive = live.captions
    .filter((c) => c.en && !c.error)
    .map((c) => ({ en: c.en, zh: c.zh }));
  const lines = fromLive.length >= 2 ? fromLive : (session?.transcript ?? []);
  if (lines.length < 2) {
    live.setRecapError("再听两句再出纪要。");
    live.setView("recap");
    return;
  }
  live.setRecapPending(true);
  live.setView("recap");
  live.setSession(sid);
  const result = await recapClass({
    data: {
      lines,
      topics: live.coaches.map((c) => c.topic).filter(Boolean),
      notes: (session?.notes ?? live.jots).map((j) => j.zh || j.en),
    },
  });
  if (!result.ok) {
    useCapcom.getState().setRecapError(result.error);
    return;
  }
  useCapcom.getState().setRecap(
    {
      title: result.title,
      lede: result.lede ?? "",
      sections: result.sections ?? [],
      topics: result.topics,
      patterns: result.patterns,
      lines: result.lines,
      words: result.words,
      latencyMs: result.ms,
      at: Date.now(),
    },
    sid,
  );
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
  const ready =
    next.captions.filter((c) => c.en && !c.error).length >= 2 ||
    (next.sessions.find((s) => s.id === sid)?.transcript.length ?? 0) >= 2;
  if (ready) await requestRecap();
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
  const store = useCapcom.getState();
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
