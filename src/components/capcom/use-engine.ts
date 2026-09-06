import { useEffect } from "react";
import { SpeechController, speechSupported } from "@/lib/speech-controller";
import { micErrorCode, micSupported, requestMic, SttController } from "@/lib/stt-controller";
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
import { heuristicRecap } from "@/lib/recap-kit";

let coachGen = 0;
let essayGen = 0;
let askGen = 0;
let controller: SpeechController | SttController | null = null;
let transTimer: number | null = null;
let coachTimer: number | null = null;
let liveRecapTimer: number | null = null;
let liveRecapGen = 0;
const transBatch: { id: string; en: string }[] = [];

export function ingest(en: string, src: "mic" | "hand" = "mic") {
  const store = useCapcom.getState();
  if (src === "mic" && !store.listening) return;
  const id = store.pushFinal(en);
  if (!id) return;
  store.armClock();
  const text =
    useCapcom.getState().captions.find((c) => c.id === id)?.en ?? en;
  const existing = transBatch.find((b) => b.id === id);
  if (existing) existing.en = text;
  else transBatch.push({ id, en: text });
  if (transTimer != null) window.clearTimeout(transTimer);
  transTimer = window.setTimeout(() => {
    transTimer = null;
    void flushTranslate();
  }, 600);
  if (store.autoCoach) {
    if (coachTimer != null) window.clearTimeout(coachTimer);
    coachTimer = window.setTimeout(() => {
      coachTimer = null;
      void flushCoach("auto");
    }, 2200);
  }
  scheduleLiveRecap();
}

let transBusy = 0;
const transTries = new Map<string, number>();

function hasZh(s: string) {
  return /[\u4e00-\u9fff]/.test(s);
}

async function flushTranslate() {
  if (transBusy >= 2) return;
  const line = transBatch.shift();
  if (!line) return;
  transBusy += 1;
  const result = await liveTranslate({ data: { lines: [line] } });
  transBusy -= 1;
  const s = useCapcom.getState();
  const zh = result.ok ? (result.items[0]?.zh ?? "") : "";
  if (hasZh(zh)) {
    transTries.delete(line.id);
    s.setZh(line.id, { zh, ms: result.ok ? result.ms : 0, en: line.en });
  } else {
    const n = (transTries.get(line.id) ?? 0) + 1;
    transTries.set(line.id, n);
    if (n < 4) transBatch.push(line);
    else s.markError(line.id, "未译");
  }
  if (transBatch.length) void flushTranslate();
}

export function retryPendingZh() {
  const s = useCapcom.getState();
  for (const c of s.captions) {
    if (!c.en) continue;
    if (hasZh(c.zh) && !c.pending) continue;
    if ((transTries.get(c.id) ?? 0) >= 4) continue;
    if (!transBatch.some((b) => b.id === c.id)) transBatch.push({ id: c.id, en: c.en });
  }
  if (!transBatch.length || transBusy >= 2) {
    if (transBatch.length && transBusy < 2) void flushTranslate();
    return;
  }
  void flushTranslate();
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
      recent: store.captions.slice(-24).map((c) => c.en),
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
    briefZh: result.briefZh,
    briefEn: result.briefEn,
    move: result.move,
    options: result.options,
    extras: result.extras ?? [],
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
        topic: store.coach?.topic ?? "",
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
    ledeZh?: string;
    outline?: { heading: string; bullets: string[] }[];
    sections?: { heading: string; headingZh?: string; body: string; bodyZh?: string }[];
    topics: { en: string; zh: string }[];
    patterns: RecapStudyLike[];
    lines: RecapStudyLike[];
    words: RecapStudyLike[];
    collos?: RecapStudyLike[];
    grammar?: RecapStudyLike[];
    skills?: { en: string; zh: string }[];
    takeaways?: { en: string; zh: string }[];
    ms: number;
  },
  prevOutline: { heading: string; bullets: string[] }[] = [],
) {
  const study = (rows: RecapStudyLike[] | undefined) =>
    (rows ?? []).map((r) => ({
      en: r.en,
      zh: r.zh ?? "",
      use: r.use ?? "",
      useZh: r.useZh ?? "",
      example: r.example ?? "",
      exampleZh: r.exampleZh ?? "",
    }));
  return {
    title: result.title,
    lede: result.lede ?? "",
    ledeZh: result.ledeZh ?? "",
    outline: result.outline?.length ? result.outline : prevOutline,
    sections: (result.sections ?? []).map((s) => ({
      heading: s.heading,
      headingZh: s.headingZh ?? "",
      body: s.body,
      bodyZh: s.bodyZh ?? "",
    })),
    topics: result.topics,
    patterns: study(result.patterns),
    lines: study(result.lines),
    words: study(result.words),
    collos: study(result.collos),
    grammar: study(result.grammar),
    skills: result.skills ?? [],
    takeaways: result.takeaways ?? [],
    draft: false,
    latencyMs: result.ms,
    at: Date.now(),
  };
}

type RecapStudyLike = {
  en: string;
  zh?: string;
  use?: string;
  useZh?: string;
  example?: string;
  exampleZh?: string;
};

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
  retryPendingZh();
}

export async function requestRecap(targetId?: string) {
  const store = useCapcom.getState();
  if (!targetId) store.stashLive();
  const live = useCapcom.getState();
  const sid = targetId ?? live.liveId ?? live.sessionId;
  if (!sid) {
    live.setRecapError("没有可整理的课。");
    live.setView("recap");
    return;
  }
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
  const notes = (session?.notes ?? (isLive ? live.jots : [])).map((j) => j.zh || j.en);
  live.setRecap(
    {
      ...heuristicRecap({
        transcript: lines,
        topics,
        notes,
        title: session?.title,
      }),
      draft: true,
    },
    sid,
  );
  useCapcom.getState().setRecapPending(true);
  const result = await recapClass({
    data: {
      lines,
      topics,
      notes,
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
  const sid = store.liveId ?? store.sessionId;
  store.stashLive();
  store.clear({ keepBay: true });
  if (sid) store.setSession(sid);
  store.setView("recap");
  const session = useCapcom.getState().sessions.find((s) => s.id === sid);
  const ready = (session?.transcript.length ?? 0) >= 2;
  const polished = Boolean(session?.recap && !session.recap.draft && session.recap.lede);
  if (sid && ready && !polished) await requestRecap(sid);
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
  const s = useCapcom.getState();
  s.setListening(false);
  const framed = (() => {
    try {
      return typeof window !== "undefined" && window.top !== window;
    } catch {
      return true;
    }
  })();
  if (code === "denied") {
    s.setMic("denied");
    s.setEngineError(
      framed
        ? "这一页拦了麦克风。请在地址栏允许麦克风，或用系统浏览器打开本页。左侧仍可手写。"
        : "麦克风被拒绝。点地址栏的锁允许麦克风，再点「开始听」。左侧仍可手写。",
    );
    return;
  }
  if (code === "unsupported") {
    s.setMic("unsupported");
    s.setEngineError("此浏览器不能听写。请用 Chrome / Safari，或在左侧手写。");
    return;
  }
  s.setMic("idle");
  s.setEngineError("实时听写没接通。再点一次开始听，或在左侧手写。");
}

function onListenState(live: boolean) {
  const s = useCapcom.getState();
  if (!s.listening) {
    if (s.mic === "live" || s.mic === "arming") s.setMic("idle");
    return;
  }
  if (live) {
    s.setMic("live");
    s.setEngineError(null);
    return;
  }
}

export function arm() {
  const store = useCapcom.getState();
  const open =
    store.sessions.find((s) => s.id === store.liveId && !s.endedAt) ?? null;
  store.setView("live");
  if (!open) store.resetHud();
  store.setListening(true);
  store.setMic("arming");
  store.setEngineError("请允许麦克风。接通后会出现「听课中」。");
  store.armClock();
  const prev = controller;
  controller = null;
  prev?.stop();

  const startStt = (stream?: MediaStream) => {
    controller = new SttController(
      {
        onPartial: (t) => useCapcom.getState().setInterim(t),
        onFinal: (t) => ingest(t),
        onError: (code) => {
          if (code === "denied") {
            onListenError("denied");
            return;
          }
          if (speechSupported()) {
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
    void controller.start(stream);
  };

  if (micSupported()) {
    void requestMic()
      .then((stream) => startStt(stream))
      .catch((err) => {
        const code = micErrorCode(err);
        if (code !== "denied" && speechSupported()) {
          useCapcom.getState().setEngineError("改用浏览器听写。");
          wireChrome();
          return;
        }
        onListenError(code);
      });
    return;
  }
  if (speechSupported()) {
    wireChrome();
    return;
  }
  store.setListening(false);
  store.setMic("unsupported");
  store.setEngineError("此浏览器不能听写。请用 Chrome，或在左侧手写。");
}

export function useCapcomEngine() {
  useEffect(() => {
    if (!micSupported() && !speechSupported()) {
      const mic = useCapcom.getState().mic;
      if (mic === "idle") useCapcom.getState().setMic("unsupported");
    }
    const tick = window.setInterval(() => retryPendingZh(), 2800);
    return () => window.clearInterval(tick);
  }, []);
}

export function safe() {
  const s = useCapcom.getState();
  s.setListening(false);
  s.setMic("idle");
  s.setInterim("");
  controller?.stop();
  controller = null;
}
