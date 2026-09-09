import { parseClassMode } from "../class-mode.ts";
import { attachCoachPack, emptyRecap, isEssayFilled, isFilled, packCoach } from "../recap-kit.ts";
import type { ClassRecap, ClassSegment, RecapCoach, RecapTable } from "../types.ts";
import { withDeadline } from "../live-queue.ts";
import type { EngineContext } from "./context.ts";

/** Client-side ceiling so a hung request never pins 整理中 until a reload. */
export const RECAP_TIMEOUT_MS = 100_000;

type StudyLike = { en: string; zh?: string; use?: string; useZh?: string; example?: string; exampleZh?: string };

type RecapResult = {
  title: string;
  lede?: string;
  ledeZh?: string;
  outline?: { heading: string; bullets: string[] }[];
  sections?: { heading: string; headingZh?: string; body: string; bodyZh?: string; table?: RecapTable | null }[];
  topics: { en: string; zh: string }[];
  patterns: StudyLike[];
  lines: StudyLike[];
  words: StudyLike[];
  collos?: StudyLike[];
  grammar?: StudyLike[];
  skills?: { en: string; zh: string }[];
  takeaways?: { en: string; zh: string }[];
  marks?: string[];
  coachPack?: RecapCoach[];
  ms: number;
};

/** Server rows → a `ClassRecap`, `draft` set by the fill gate. */
export function toRecap(
  result: RecapResult,
  prevOutline: { heading: string; bullets: string[] }[] = [],
  coachPack: RecapCoach[] = [],
  at = Date.now(),
): ClassRecap {
  const study = (rows: StudyLike[] | undefined) =>
    (rows ?? []).map((r) => ({
      en: r.en,
      zh: r.zh ?? "",
      use: r.use ?? "",
      useZh: r.useZh ?? "",
      example: r.example ?? "",
      exampleZh: r.exampleZh ?? "",
    }));
  const next: ClassRecap = {
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
    at,
  };
  next.draft = !isFilled(next);
  return next;
}

/**
 * The handout itself: two phases (essay, then language points), one
 * generation counter, so a result after pause / end / a second click is
 * dropped. The class's structure during the hour lives in `structure-runtime`.
 */
export function createRecapRuntime(ctx: EngineContext) {
  const { store, api, nav, now } = ctx;
  let recapGen = 0;

  async function request(targetId?: string, hintTopics?: string[]) {
    const s0 = store.getState();
    if (!targetId) s0.stashLive();
    const live = store.getState();
    const sid = targetId ?? live.liveId ?? live.sessionId;
    if (!sid) {
      live.setRecapError("没有可整理的课。");
      nav.catalog();
      return;
    }
    // A second 整理 on the class already being written is the same request;
    // one for another class would bump the generation and throw the first
    // result away, so it waits.
    if (live.recapPending) {
      if (live.recapTarget !== sid) live.ping("另一堂还在整理，等它写完。");
      return;
    }
    const session = live.sessions.find((x) => x.id === sid);
    const isLive = live.liveId === sid;
    const fromLive = isLive ? live.captions.filter((c) => c.en).map((c) => ({ en: c.en, zh: c.error ? "" : c.zh })) : [];
    const lines = fromLive.length >= 2 ? fromLive : (session?.transcript ?? []);
    if (lines.length < 2) {
      live.setSession(sid);
      live.setRecapError(targetId ? "这份没有足够实录，没法再出。" : "再听两句再出纪要。");
      nav.classPage(sid);
      return;
    }
    const segments: ClassSegment[] = session?.segments ?? [];
    const segmentHeads = segments.map((g) => g.heading).filter(Boolean);
    const topics = hintTopics?.length
      ? hintTopics
      : isLive
        ? [...segmentHeads, ...live.coaches.map((c) => c.topic)].filter((t, i, a) => t && a.indexOf(t) === i)
        : [
            ...segmentHeads,
            ...(session?.coaches ?? []).map((c) => c.topic),
            ...(session?.recap?.topics ?? []).map((t) => t.en),
          ].filter((t, i, a) => t && a.indexOf(t) === i);
    const notes = (session?.notes ?? (isLive ? live.jots : [])).map((j) => j.zh || j.en);
    const coaches = isLive ? live.coaches : (session?.coaches ?? []);
    const essays = isLive ? live.essays : (session?.essays ?? {});
    const pack = packCoach(coaches, essays);
    const mine = ++recapGen;
    live.setRecapPending(true, sid);
    live.setSession(sid);
    nav.classPage(sid);
    const skeleton = emptyRecap(session?.title || segmentHeads[0] || "整理中", topics);
    if (session?.recap?.outline?.length) skeleton.outline = session.recap.outline;
    skeleton.coachPack = pack;
    live.setRecap(skeleton, sid);
    const packet = {
      lines,
      topics,
      notes,
      segments: segments
        .filter((g) => g.heading)
        .map((g) => ({
          heading: g.heading,
          headingZh: g.headingZh,
          from: g.startAt,
          to: g.endAt ?? now(),
          claims: g.claims.map((c) => c.en),
          todo: g.todo.map((t) => t.en),
        })),
      coach: pack.map((c) => ({
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
      })),
      mode: parseClassMode(session?.classMode ?? live.classMode),
    };
    const fresh = () => mine === recapGen;
    let lastErr = "纪要没写出来，再点一次整理。";
    try {
      let essay: ClassRecap | null = null;
      store.getState().setRecapStage("essay");
      try {
        const result = await withDeadline(api.recap({ data: { ...packet, phase: "essay" } }), RECAP_TIMEOUT_MS);
        if (!fresh()) return;
        if (result.ok) {
          const next = attachCoachPack(toRecap(result, session?.recap?.outline ?? skeleton.outline, pack, now()), pack);
          if (isEssayFilled(next)) {
            store.getState().setRecap({ ...next, draft: true }, sid);
            essay = next;
          } else {
            lastErr = "正文太薄，再点一次整理。";
          }
        } else {
          lastErr = result.error;
        }
      } catch {
        lastErr = "纪要没写出来，再点一次整理。";
      }
      if (!essay) {
        if (fresh()) store.getState().setRecapError(lastErr);
        return;
      }
      if (!fresh()) return;
      store.getState().setRecapStage("study");
      try {
        const result = await withDeadline(api.recap({
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
        }), RECAP_TIMEOUT_MS);
        if (!fresh()) return;
        if (result.ok) {
          const next = attachCoachPack(toRecap(result, essay.outline, pack, now()), pack);
          store.getState().setRecap(next, sid);
          if (!isFilled(next)) store.getState().setRecapError("语言点没写出来，再点一次整理。");
          return;
        }
        lastErr = result.error;
      } catch {
        lastErr = "语言点没写完，再点一次整理。";
      }
      if (fresh()) store.getState().setRecapError(lastErr);
    } finally {
      if (fresh()) {
        store.getState().setRecapPending(false);
        store.getState().setRecapStage(null);
      }
    }
  }

  return {
    /** 整理本堂 / 再出一份. */
    request,
    async forkAndRecap(fromId: string) {
      const nid = store.getState().forkSession(fromId);
      if (!nid) return;
      await request(nid);
    },
    /** End / 首页: the handout in flight is dropped. */
    abort() {
      recapGen += 1;
      store.getState().setRecapPending(false);
    },
  };
}

export type RecapRuntime = ReturnType<typeof createRecapRuntime>;
