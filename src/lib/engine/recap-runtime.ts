import { parseClassMode } from "../class-mode.ts";
import { attachCoachPack, emptyRecap, isEssayFilled, isFilled, packCoach } from "../recap-kit.ts";
import type { ClassRecap, RecapCoach, RecapTable } from "../types.ts";
import { withDeadline } from "../live-queue.ts";
import { debounceSlot, type EngineContext } from "./context.ts";

export const LIVE_OUTLINE_DEBOUNCE_MS = 12000;
/** Client-side ceilings so a hung request never pins 整理中 or the outline lock until a reload. */
export const OUTLINE_TIMEOUT_MS = 30_000;
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
 * Two writers of `session.recap`: the mid-class outline draft (cheap, every
 * 12 s of new material, one in flight) and the handout itself (two phases,
 * one generation counter). Both drop stale results after pause / end.
 */
export function createRecapRuntime(ctx: EngineContext) {
  const { store, api, nav, now } = ctx;
  let outlineGen = 0;
  let outlineBusy = false;
  let recapGen = 0;
  const outlineTimer = debounceSlot();

  async function flushOutline() {
    if (outlineBusy) return;
    const s = store.getState();
    const sid = s.liveId;
    if (!sid || s.recapPending) return;
    const session = s.sessions.find((x) => x.id === sid);
    if (!session || session.endedAt) return;
    if (session.recap && !session.recap.draft && session.recap.lede) return;
    s.stashLive();
    const next = store.getState();
    const ses = next.sessions.find((x) => x.id === sid);
    const fromLive = next.captions.filter((c) => c.en).map((c) => ({ en: c.en, zh: c.error ? "" : c.zh }));
    const lines = fromLive.length >= 2 ? fromLive : (ses?.transcript ?? []);
    if (lines.length < 2 && !ses?.notes.length) return;
    const mine = ++outlineGen;
    outlineBusy = true;
    try {
      const result = await withDeadline(api.outline({
        data: {
          lines,
          topics: next.coaches.map((c) => c.topic).filter(Boolean),
          notes: (ses?.notes ?? next.jots).map((j) => j.zh || j.en),
        },
      }), OUTLINE_TIMEOUT_MS);
      if (mine !== outlineGen) return;
      if (!result.ok) return;
      const outline = result.outline
        .map((o) => ({
          heading: o.heading.trim(),
          bullets: [...new Set(o.bullets.map((b) => b.trim()).filter((b) => b.length > 8 && b.length < 90))].slice(0, 3),
        }))
        .filter((o) => o.heading && o.heading.split(/\s+/).length <= 8);
      if (!outline.length && !result.title) return;
      store.getState().setLiveDraft(sid, { title: result.title, outline, topics: result.topics, ms: result.ms });
    } catch {
      /* the next beat schedules another try */
    } finally {
      if (mine === outlineGen) outlineBusy = false;
    }
  }

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
    const topics = hintTopics?.length
      ? hintTopics
      : isLive
        ? live.coaches.map((c) => c.topic).filter(Boolean)
        : [...(session?.coaches ?? []).map((c) => c.topic), ...(session?.recap?.topics ?? []).map((t) => t.en)].filter(
            (t, i, a) => t && a.indexOf(t) === i,
          );
    const notes = (session?.notes ?? (isLive ? live.jots : [])).map((j) => j.zh || j.en);
    const coaches = isLive ? live.coaches : (session?.coaches ?? []);
    const essays = isLive ? live.essays : (session?.essays ?? {});
    const pack = packCoach(coaches, essays);
    const mine = ++recapGen;
    live.setRecapPending(true, sid);
    live.setSession(sid);
    nav.classPage(sid);
    const skeleton = emptyRecap(session?.title || "整理中", topics);
    if (session?.recap?.outline?.length) skeleton.outline = session.recap.outline;
    skeleton.coachPack = pack;
    live.setRecap(skeleton, sid);
    const packet = {
      lines,
      topics,
      notes,
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
    /** New material (a caption, a note): redraw the outline once things settle. */
    touch() {
      outlineTimer.schedule(LIVE_OUTLINE_DEBOUNCE_MS, () => void flushOutline());
    },
    /** 整理本堂 / 再出一份. */
    request,
    async forkAndRecap(fromId: string) {
      const nid = store.getState().forkSession(fromId);
      if (!nid) return;
      await request(nid);
    },
    /** Pause / end: the outline draft stops, the handout in flight is dropped. */
    abort() {
      outlineGen += 1;
      outlineBusy = false;
      recapGen += 1;
      outlineTimer.cancel();
      store.getState().setRecapPending(false);
    },
    /** Pause only the outline draft (the class keeps going in the background). */
    abortOutline() {
      outlineGen += 1;
      outlineBusy = false;
      outlineTimer.cancel();
    },
  };
}

export type RecapRuntime = ReturnType<typeof createRecapRuntime>;
