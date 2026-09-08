import { useEffect } from "react";
import { SpeechController, speechSupported } from "@/lib/speech-controller";
import { micErrorCode, micSupported, requestMic, SttController } from "@/lib/stt-controller";
import { useCapcom } from "@/lib/store";
import {
  expandTopic,
  liveCoach,
  liveTranslate,
  mintSttSecret,
  recapClass,
  liveOutline,
  quickTranslate,
} from "@/lib/capcom-ai";
import { heuristicEssay } from "@/lib/essay-kit";
import { attachCoachPack, emptyRecap, isEssayFilled, isFilled, packCoach } from "@/lib/recap-kit";
import {
  humanCoachError,
  isRetryableCoachError,
  shouldAskCoach,
  shouldKeepCoachCard,
  shouldRescueCoach,
} from "@/lib/coach-kit";
import { coachMinGapMs, parseClassMode, type ClassMode } from "@/lib/class-mode";
import {
  COACH_TIMEOUT_MS,
  TRANS_CAP,
  TRANS_KEEP,
  TRANS_TIMEOUT_MS,
  TRANS_TRIES,
  hasZh,
  mergeTranslateQueue,
  needsTranslate,
  withDeadline,
} from "@/lib/live-queue";

let coachGen = 0;
let recapGen = 0;
const essayGens = new Map<string, number>();
const essayInflight = new Set<string>();
const essayQueue: string[] = [];
const ESSAY_CAP = 2;
let controller: SpeechController | SttController | null = null;
let transTimer: number | null = null;
let coachTimer: number | null = null;
let liveRecapTimer: number | null = null;
let liveRecapGen = 0;
const transBatch: { id: string; en: string }[] = [];

export function abortLive() {
  coachGen += 1;
  liveRecapGen += 1;
  recapGen += 1;
  for (const id of essayGens.keys()) essayGens.set(id, (essayGens.get(id) ?? 0) + 1);
  essayInflight.clear();
  essayQueue.length = 0;
  if (coachTimer != null) {
    window.clearTimeout(coachTimer);
    coachTimer = null;
  }
  if (transTimer != null) {
    window.clearTimeout(transTimer);
    transTimer = null;
  }
  if (liveRecapTimer != null) {
    window.clearTimeout(liveRecapTimer);
    liveRecapTimer = null;
  }
  transBatch.length = 0;
  transTries.clear();
  transBusy = 0;
  coachInflight = false;
  coachQueued = false;
  lastCoachOkAt = 0;
  recapGen += 1;
  const s = useCapcom.getState();
  s.setCoachPending(false);
  s.setEssayPending(false);
  s.setRecapPending(false);
}

export function goHomeSafe() {
  const s = useCapcom.getState();
  const open = s.sessions.some((x) => x.id === s.liveId && !x.endedAt);
  if (!open) abortLive();
  s.goHome();
}

export function ingest(en: string) {
  const store = useCapcom.getState();
  if (!store.listening) return;
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
let coachInflight = false;
let coachQueued = false;
let lastCoachOkAt = 0;
const transTries = new Map<string, number>();

function liveMode(): ClassMode {
  const s = useCapcom.getState();
  const ses = s.sessions.find((x) => s.liveId && x.id === s.liveId);
  return parseClassMode(ses?.classMode ?? s.classMode);
}

function trimTranslateQueue() {
  const s = useCapcom.getState();
  const pending = s.captions
    .filter((c) => needsTranslate(c) && (transTries.get(c.id) ?? 0) < TRANS_TRIES)
    .map((c) => ({ id: c.id, en: c.en }));
  const next = mergeTranslateQueue(
    transBatch,
    pending,
    s.captions.map((c) => c.id),
    TRANS_KEEP,
  );
  transBatch.length = 0;
  transBatch.push(...next);
}

async function flushTranslate() {
  if (transBusy >= TRANS_CAP) return;
  trimTranslateQueue();
  const line = transBatch.pop();
  if (!line) return;
  transBusy += 1;
  try {
    const result = await withDeadline(
      liveTranslate({ data: { lines: [line] } }),
      TRANS_TIMEOUT_MS,
    );
    const s = useCapcom.getState();
    const zh = result.ok ? (result.items[0]?.zh ?? "") : "";
    if (hasZh(zh)) {
      transTries.delete(line.id);
      s.setZh(line.id, { zh, ms: result.ok ? result.ms : 0, en: line.en });
    } else {
      const n = (transTries.get(line.id) ?? 0) + 1;
      transTries.set(line.id, n);
      if (n < TRANS_TRIES) transBatch.push(line);
      else s.markError(line.id, "未译");
    }
  } catch {
    const n = (transTries.get(line.id) ?? 0) + 1;
    transTries.set(line.id, n);
    if (n < TRANS_TRIES) transBatch.push(line);
    else useCapcom.getState().markError(line.id, "未译");
  } finally {
    transBusy = Math.max(0, transBusy - 1);
  }
  if (transBatch.length) void flushTranslate();
}

export function retryPendingZh() {
  trimTranslateQueue();
  const slots = Math.max(0, TRANS_CAP - transBusy);
  for (let i = 0; i < slots; i += 1) void flushTranslate();
}

async function flushCoach(
  source: "auto" | "intent",
  spoken?: string,
  opts?: { rescue?: boolean; retry?: boolean },
) {
  const store = useCapcom.getState();
  const intent = source === "intent" ? (spoken ?? store.intent).trim() : "";
  const last = store.captions.at(-1)?.en ?? "";
  const mode = liveMode();
  if (!last && !intent) return;
  if (!store.autoCoach && source === "auto") return;
  if (coachInflight && source === "auto") {
    coachQueued = true;
    return;
  }
  if (
    source === "auto" &&
    !opts?.rescue &&
    !opts?.retry &&
    !shouldAskCoach({
      last,
      minGapMs: coachMinGapMs(mode),
      prev: store.coach ? { prompt: store.coach.prompt, at: store.coach.at } : null,
    })
  ) {
    return;
  }
  const gen = ++coachGen;
  coachInflight = true;
  store.setCoachPending(true);
  let again: "retry" | "queued" | null = null;
  try {
    const result = await withDeadline(
      liveCoach({
        data: {
          last,
          recent: store.captions.slice(-24).map((c) => c.en),
          intent,
          prevTopic: store.coach?.topic ?? "",
          prevTopicZh: store.coach?.topicZh ?? "",
          notes: store.jots.map((j) => j.en || j.zh).filter(Boolean),
          mode,
        },
      }),
      COACH_TIMEOUT_MS,
    );
    if (gen !== coachGen) return;
    const live = useCapcom.getState();
    if (!live.liveId && (live.listening || live.mic === "arming")) {
      live.ensureSession();
    }
    if (!useCapcom.getState().liveId) {
      useCapcom.getState().setCoachError("这堂还没挂上，点重写再试。");
      return;
    }
    if (!result.ok) {
      const retryable = isRetryableCoachError(result.error);
      useCapcom.getState().setCoachError(
        humanCoachError(result.error, !opts?.retry && retryable ? "retrying" : "failed"),
      );
      if (!opts?.retry && retryable) again = "retry";
      return;
    }
    if (!result.options.length) {
      useCapcom.getState().setCoachError(
        opts?.retry ? "教练没给出三条，点重写再试。" : "教练没给出三条，正在重写",
      );
      if (!opts?.retry) again = "retry";
      return;
    }
    const prev = useCapcom.getState().coach;
    if (
      !shouldKeepCoachCard({
        source,
        lastHeard: last,
        prev: prev
          ? { prompt: prev.prompt, options: prev.options, at: prev.at }
          : null,
        options: result.options,
      })
    ) {
      lastCoachOkAt = Date.now();
      useCapcom.getState().setCoachPending(false);
      useCapcom.getState().setCoachError(null);
      return;
    }
    if (source === "intent") useCapcom.getState().setIntent("");
    lastCoachOkAt = Date.now();
    useCapcom.getState().setCoach({
      id: `c-${Date.now().toString(36)}`,
      topic: result.topic,
      topicZh: result.topicZh,
      briefZh: result.briefZh,
      briefEn: result.briefEn,
      move: result.move,
      mode,
      options: result.options,
      extras: result.extras ?? [],
      source,
      prompt: intent || last,
      latencyMs: result.ms,
      at: Date.now(),
    });
  } catch {
    if (gen === coachGen) {
      useCapcom.getState().setCoachError(
        opts?.retry ? "这轮没写出来，点重写再试。" : "这轮慢了，正在重写",
      );
      if (!opts?.retry) again = "retry";
    }
  } finally {
    if (gen === coachGen) {
      coachInflight = false;
      if (again === "retry") {
        void flushCoach(source, spoken, { ...opts, retry: true, rescue: true });
      } else if (coachQueued) {
        coachQueued = false;
        void flushCoach("auto");
      }
    }
  }
}

function rescueCoach() {
  const s = useCapcom.getState();
  const last = s.captions.at(-1);
  if (s.coachError && !isRetryableCoachError(s.coachError)) return;
  if (
    !shouldRescueCoach({
      autoCoach: s.autoCoach,
      listening: s.listening,
      inflight: coachInflight,
      lastCaptionAt: last?.at ?? null,
      lastCoachOkAt,
    })
  ) {
    return;
  }
  void flushCoach("auto", undefined, { rescue: true });
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
  const id = card?.id ?? "latest";
  if (!card && !store.captions.length) {
    store.setEssayError("先听一句，再 DeepSearch。");
    return;
  }
  if (essayInflight.has(id)) return;
  if (essayInflight.size >= ESSAY_CAP) {
    if (!essayQueue.includes(id)) essayQueue.push(id);
    store.setEssayPending(true, id);
    return;
  }
  essayInflight.add(id);
  const gen = (essayGens.get(id) ?? 0) + 1;
  essayGens.set(id, gen);
  store.setEssayPending(true, id);
  const caps = store.captions;
  const bits = {
    lastHeard: caps.at(-1)?.en ?? card?.prompt ?? "",
    recent: caps.slice(-12).map((c) => c.en),
    topic: card?.topic ?? "",
    move: card?.move ?? "",
    options: (card?.options ?? []).map((o) => o.en),
    extras: (card?.extras ?? []).map((o) => o.en),
  };
  store.setEssay(
    heuristicEssay({
      topic: bits.topic,
      lastHeard: bits.lastHeard,
      recent: bits.recent,
      options: bits.options,
      extras: bits.extras,
    }),
    card?.id,
    true,
  );
  try {
    const result = await expandTopic({
      data: {
        lastHeard: bits.lastHeard,
        recent: bits.recent,
        topic: bits.topic,
        move: bits.move,
        options: bits.options,
        mode: card?.mode ?? liveMode(),
      },
    });
    if (essayGens.get(id) !== gen) return;
    if (!result.ok) {
      const live = useCapcom.getState();
      live.setEssay(null, card?.id);
      live.setEssayError(result.error === "empty" ? "没检索到，再点一次。" : result.error);
      return;
    }
    useCapcom.getState().setEssay(
      {
        title: result.title,
        contextEn: result.contextEn,
        contextZh: result.contextZh,
        viewZh: result.viewZh,
        viewEn: result.viewEn,
        angles: result.angles,
        facts: result.facts,
        qZh: result.qZh,
        qEn: result.qEn,
        aZh: result.aZh,
        aEn: result.aEn,
        say: result.say,
        frames: result.frames,
        terms: result.terms,
        sources: result.sources ?? [],
        latencyMs: result.ms,
        at: Date.now(),
        draft: result.draft,
      },
      card?.id,
    );
  } catch {
    if (essayGens.get(id) === gen) useCapcom.getState().setEssayError("检索超时，再点一次。");
  } finally {
    if (essayGens.get(id) === gen) {
      essayInflight.delete(id);
      useCapcom.getState().setEssayPending(
        essayInflight.size > 0,
        essayInflight.size ? [...essayInflight][0] : null,
      );
    }
    const next = essayQueue.shift();
    if (next) void requestEssay(next);
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
    sections?: {
      heading: string;
      headingZh?: string;
      body: string;
      bodyZh?: string;
      table?: import("@/lib/types").RecapTable | null;
    }[];
    topics: { en: string; zh: string }[];
    patterns: RecapStudyLike[];
    lines: RecapStudyLike[];
    words: RecapStudyLike[];
    collos?: RecapStudyLike[];
    grammar?: RecapStudyLike[];
    skills?: { en: string; zh: string }[];
    takeaways?: { en: string; zh: string }[];
    marks?: string[];
    coachPack?: import("@/lib/types").RecapCoach[];
    ms: number;
  },
  prevOutline: { heading: string; bullets: string[] }[] = [],
  coachPack: import("@/lib/types").RecapCoach[] = [],
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
  const next = {
    title: result.title,
    lede: result.lede ?? "",
    ledeZh: result.ledeZh ?? "",
    outline: result.outline?.length ? result.outline : prevOutline,
    sections: (result.sections ?? []).map((s) => ({
      heading: s.heading,
      headingZh: s.headingZh ?? "",
      body: s.body,
      bodyZh: s.bodyZh ?? "",
      table: s.table ?? null,
    })),
    topics: result.topics,
    patterns: study(result.patterns),
    lines: study(result.lines),
    words: study(result.words),
    collos: study(result.collos),
    grammar: study(result.grammar),
    skills: result.skills ?? [],
    takeaways: result.takeaways ?? [],
    marks: result.marks ?? [],
    coachPack: result.coachPack?.length ? result.coachPack : coachPack,
    draft: true,
    latencyMs: result.ms,
    at: Date.now(),
  };
  next.draft = !isFilled(next);
  return next;
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
  }, 12000);
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
  const outline = result.outline
    .map((o) => ({
      heading: o.heading.trim(),
      bullets: [...new Set(o.bullets.map((b) => b.trim()).filter((b) => b.length > 8 && b.length < 90))].slice(0, 3),
    }))
    .filter((o) => o.heading && o.heading.split(/\s+/).length <= 8);
  if (!outline.length && !result.title) return;
  useCapcom.getState().setLiveDraft(sid, {
    title: result.title,
    outline,
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

export async function requestRecap(targetId?: string, hintTopics?: string[]) {
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
  const topics = hintTopics?.length
    ? hintTopics
    : isLive
      ? live.coaches.map((c) => c.topic).filter(Boolean)
      : [
          ...(session?.coaches ?? []).map((c) => c.topic),
          ...(session?.recap?.topics ?? []).map((t) => t.en),
        ].filter((t, i, a) => t && a.indexOf(t) === i);
  const notes = (session?.notes ?? (isLive ? live.jots : [])).map((j) => j.zh || j.en);
  const coaches = isLive ? live.coaches : (session?.coaches ?? []);
  const essays = isLive ? live.essays : (session?.essays ?? {});
  const pack = packCoach(coaches, essays);
  const gen = ++recapGen;
  live.setRecapPending(true);
  live.setView("recap");
  live.setSession(sid);
  const skeleton = emptyRecap(session?.title || "整理中", topics);
  if (session?.recap?.outline?.length) skeleton.outline = session.recap.outline;
  skeleton.coachPack = pack;
  live.setRecap(skeleton, sid);
  useCapcom.getState().setRecapPending(true);
  const coachPayload = pack.map((c) => ({
    topic: c.topic,
    brief: c.briefEn,
    briefZh: c.briefZh,
    say: c.options.map((o) => o.en),
    extras: c.extras.map((o) => o.en),
    deep: c.deep
      ? {
          title: c.deep.title,
          viewEn: c.deep.viewEn,
          viewZh: c.deep.viewZh,
          facts: c.deep.facts.map((f) => f.en),
          terms: c.deep.terms.map((t) => t.en),
          aEn: c.deep.aEn,
        }
      : null,
  }));
  const packet = {
    lines,
    topics,
    notes,
    coach: coachPayload,
    mode: parseClassMode(session?.classMode ?? live.classMode),
  };
  let lastErr = "纪要没写完，正在重写。";
  try {
    let essay: import("@/lib/types").ClassRecap | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (gen !== recapGen) return;
      useCapcom.getState().setRecapStage(attempt ? "essay-retry" : "essay");
      try {
        const result = await recapClass({ data: { ...packet, phase: "essay" } });
        if (gen !== recapGen) return;
        if (result.ok) {
          const next = attachCoachPack(
            toRecap(result, session?.recap?.outline ?? skeleton.outline, pack),
            pack,
          );
          if (isEssayFilled(next)) {
            useCapcom.getState().setRecap({ ...next, draft: true }, sid);
            essay = next;
            break;
          }
          lastErr = "正文太薄，正在重写。";
        } else {
          lastErr = result.error;
        }
      } catch {
        lastErr = "纪要没写完，正在重写。";
      }
    }
    if (!essay) {
      if (gen === recapGen) useCapcom.getState().setRecapError(lastErr);
      return;
    }
    if (gen !== recapGen) return;
    useCapcom.getState().setRecapStage("study");
    try {
      const result = await recapClass({
        data: {
          ...packet,
          phase: "study",
          prior: {
            title: essay.title,
            lede: essay.lede,
            ledeZh: essay.ledeZh,
            sections: essay.sections,
            outline: essay.outline,
            topics: essay.topics,
            takeaways: essay.takeaways,
          },
        },
      });
      if (gen !== recapGen) return;
      if (result.ok) {
        const next = attachCoachPack(
          toRecap(result, essay.outline, pack),
          pack,
        );
        useCapcom.getState().setRecap(next, sid);
        if (!isFilled(next)) {
          useCapcom.getState().setRecapError("语言点没写出来，再点一次整理。");
        }
        return;
      }
      lastErr = result.error;
    } catch {
      lastErr = "语言点没写完，再点一次整理。";
    }
    if (gen !== recapGen) return;
    useCapcom.getState().setRecapError(lastErr);
  } finally {
    if (gen === recapGen) {
      useCapcom.getState().setRecapPending(false);
      useCapcom.getState().setRecapStage(null);
    }
  }
}

export async function forkAndRecap(fromId: string) {
  const nid = useCapcom.getState().forkSession(fromId);
  if (!nid) return;
  await requestRecap(nid);
}

export async function endClass() {
  const store = useCapcom.getState();
  const topics = store.coaches.map((c) => c.topic).filter(Boolean);
  abortLive();
  safe();
  const sid = store.liveId ?? store.sessionId;
  store.stashLive();
  store.clear({ keepBay: true });
  if (sid) store.setSession(sid);
  store.setView("recap");
  const session = useCapcom.getState().sessions.find((s) => s.id === sid);
  const ready = (session?.transcript.length ?? 0) >= 2;
  const polished = Boolean(session?.recap && !session.recap.draft && session.recap.lede);
  if (sid && ready && !polished) await requestRecap(sid, topics);
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
        ? "这一页拦了麦克风。请在地址栏允许麦克风，或用系统浏览器打开本页。"
        : "麦克风被拒绝。点地址栏的锁允许麦克风，再点「开始听」。",
    );
    return;
  }
  if (code === "unsupported") {
    s.setMic("unsupported");
    s.setEngineError("此浏览器不能听写。请用 Chrome / Safari。");
    return;
  }
  s.setMic("idle");
  s.setEngineError("实时听写没接通。再点一次开始听。");
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

export function arm(mode?: ClassMode) {
  const store = useCapcom.getState();
  const open =
    store.sessions.find((s) => s.id === store.liveId && !s.endedAt) ?? null;
  store.setView("live");
  if (!open) {
    store.resetHud();
    if (mode) store.setClassMode(mode);
  } else {
    store.setClassMode(parseClassMode(open.classMode ?? store.classMode));
  }
  store.setListening(true);
  store.setMic("arming");
  store.setEngineError("请允许麦克风。接通后会出现「听课中」。");
  store.armClock();
  const prev = controller;
  controller = null;
  prev?.stop();

  const startStt = (stream?: MediaStream) => {
    if (!useCapcom.getState().listening) {
      stream?.getTracks().forEach((t) => t.stop());
      return;
    }
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
  store.setEngineError("此浏览器不能听写。请用 Chrome。");
}

export function useCapcomEngine() {
  useEffect(() => {
    if (!micSupported() && !speechSupported()) {
      const mic = useCapcom.getState().mic;
      if (mic === "idle") useCapcom.getState().setMic("unsupported");
    }
    const tick = window.setInterval(() => {
      retryPendingZh();
      rescueCoach();
    }, 2800);
    return () => window.clearInterval(tick);
  }, []);
}

export function safe() {
  const s = useCapcom.getState();
  s.stashLive();
  s.setListening(false);
  s.setMic("idle");
  s.setInterim("");
  controller?.stop();
  controller = null;
}
