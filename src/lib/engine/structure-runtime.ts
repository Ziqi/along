import { withDeadline } from "../live-queue.ts";
import { openSegmentOf, segmentClass, unwrittenSegments } from "../segmenter.ts";
import type { ClassSegment } from "../types.ts";
import { canAutoTitle, stampTitle } from "../utils.ts";
import type { EngineContext } from "./context.ts";

/** A closed stretch is written up within this; past it the slot is freed and the next beat tries again. */
export const SEGMENT_TIMEOUT_MS = 20_000;
/** After a failed write-up, wait this long before asking again for the same stretch. */
export const SEGMENT_RETRY_MS = 30_000;
/** 「刚才讲了什么」 reads back this far. */
export const CATCH_UP_WINDOW_MS = 8 * 60_000;
export const CATCH_UP_MIN_LINES = 6;
export const CATCH_UP_TIMEOUT_MS = 15_000;

export type CatchUpResult = { ok: true } | { ok: false; error: string };

/**
 * The 课程脉络 during the hour. Every heartbeat the pure segmenter re-cuts
 * the class from the coach's topics and the tape; a stretch that just closed
 * is written up once (heading, claims, todo) by the fastest model, and the
 * first heading names the class. Nothing here polls a model on a timer: the
 * hour costs one call per stretch, plus a catch-up when the student asks.
 */
export function createStructureRuntime(ctx: EngineContext) {
  const { store, api, now } = ctx;
  let gen = 0;
  let writing: string | null = null;
  const failedAt = new Map<string, number>();
  let catchUpBusy = false;

  function liveSession() {
    const s = store.getState();
    const sid = s.liveId;
    if (!sid) return null;
    const session = s.sessions.find((x) => x.id === sid && !x.endedAt);
    return session ? { s, session } : null;
  }

  /** Lines of the tape inside a stretch, from the screen first, else the stored tape. */
  function linesOf(g: ClassSegment) {
    const s = store.getState();
    const onScreen = s.captions.filter((c) => c.seq >= g.seqFrom && c.seq <= g.seqTo && c.en);
    if (onScreen.length) return onScreen.map((c) => ({ en: c.en, zh: c.error ? "" : c.zh }));
    const session = s.sessions.find((x) => x.id === s.liveId);
    // Stored lines carry no seq; the tape is 1-based and append-only, so a range is a slice.
    return (session?.transcript ?? []).slice(Math.max(0, g.seqFrom - 1), g.seqTo);
  }

  async function writeUp(g: ClassSegment) {
    const live = liveSession();
    if (!live || writing) return;
    const failed = failedAt.get(g.id);
    if (failed && now() - failed < SEGMENT_RETRY_MS) return;
    const lines = linesOf(g);
    if (lines.length < 3) {
      // Nothing was really said here: name it after its cards and move on.
      const card = live.s.coaches.find((c) => c.id === g.cardIds[0]);
      const heading = card?.topic?.trim() || "这一段";
      store.getState().setSegments(
        live.session.id,
        live.session.segments.map((x) => (x.id === g.id ? { ...x, heading, headingZh: card?.topicZh ?? "" } : x)),
      );
      return;
    }
    const cards = g.cardIds
      .map((id) => live.s.coaches.find((c) => c.id === id) ?? live.session.coaches.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => ({ topic: c.topic, brief: c.briefEn || c.briefZh }));
    const notes = live.s.jots
      .filter((j) => j.at >= g.startAt && (g.endAt === null || j.at <= g.endAt))
      .map((j) => j.en || j.zh)
      .filter(Boolean);
    const mine = gen;
    writing = g.id;
    try {
      const result = await withDeadline(api.segment({ data: { lines, coach: cards, notes } }), SEGMENT_TIMEOUT_MS);
      if (mine !== gen) return;
      const after = liveSession();
      if (!after || after.session.id !== live.session.id) return;
      if (!result.ok) {
        failedAt.set(g.id, now());
        return;
      }
      const filled: ClassSegment = {
        ...g,
        heading: result.heading,
        headingZh: result.headingZh,
        claims: result.claims,
        todo: result.todo,
      };
      const next = after.session.segments.map((x) => (x.id === g.id ? { ...x, ...filled, seqTo: x.seqTo, endAt: x.endAt } : x));
      store.getState().setSegments(after.session.id, next);
      // The first stretch names the class, once; the handout may rename it later.
      const isFirst = next.findIndex((x) => x.heading) === next.findIndex((x) => x.id === g.id);
      if (isFirst && canAutoTitle(after.session.title, after.session.startedAt)) {
        store.getState().renameSession(after.session.id, stampTitle(after.session.startedAt, result.heading));
      }
    } catch {
      if (mine === gen) failedAt.set(g.id, now());
    } finally {
      if (writing === g.id) writing = null;
    }
  }

  return {
    /** One heartbeat: re-cut the class; write up whatever just closed. */
    beat() {
      const live = liveSession();
      if (!live) return;
      const { s, session } = live;
      const cards = [...session.coaches, ...s.coaches].filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i);
      const out = segmentClass({
        coaches: cards.map((c) => ({ id: c.id, topic: c.topic, at: c.at })),
        captions: s.captions.map((c) => ({ seq: c.seq, at: c.at })),
        segments: session.segments,
        now: now(),
        startedAt: session.startedAt,
      });
      const changed =
        out.segments.length !== session.segments.length ||
        out.segments.some((g, i) => {
          const prev = session.segments[i];
          return !prev || prev.id !== g.id || prev.seqTo !== g.seqTo || prev.endAt !== g.endAt || prev.cardIds.length !== g.cardIds.length;
        });
      if (changed) store.getState().setSegments(session.id, out.segments);
      const due = unwrittenSegments(out.segments)[0];
      if (due) void writeUp(due);
    },
    /** 「刚才讲了什么」: the student asks; three lines come back into the live slice. */
    async catchUp(): Promise<CatchUpResult> {
      if (catchUpBusy) return { ok: false, error: "上一次还在写。" };
      const live = liveSession();
      if (!live) return { ok: false, error: "先开一堂课。" };
      const since = now() - CATCH_UP_WINDOW_MS;
      const lines = live.s.captions.filter((c) => c.en && c.at >= since).map((c) => ({ en: c.en, zh: c.error ? "" : c.zh }));
      if (lines.length < CATCH_UP_MIN_LINES) return { ok: false, error: "刚才还没听进几句，再等等。" };
      const open = openSegmentOf(live.session.segments);
      const before = [...live.session.segments].reverse().find((g) => g.endAt !== null && g.claims.length);
      const topic =
        open?.heading ||
        live.s.coaches.find((c) => c.id === open?.cardIds.at(-1))?.topic ||
        live.s.coach?.topic ||
        "";
      catchUpBusy = true;
      store.getState().setCatchUp({ pending: true });
      const mine = gen;
      try {
        const result = await withDeadline(
          api.catchUp({ data: { lines, topic, before: (before?.claims ?? []).map((c) => c.zh || c.en) } }),
          CATCH_UP_TIMEOUT_MS,
        );
        if (mine !== gen) return { ok: false, error: "这堂已经换了。" };
        if (!result.ok) {
          store.getState().setCatchUp(null);
          return { ok: false, error: result.code === "too_short" ? "刚才还没听进几句，再等等。" : result.error };
        }
        store.getState().setCatchUp({
          pending: false,
          at: now(),
          topic: result.topic,
          topicZh: result.topicZh,
          lines: result.lines,
        });
        return { ok: true };
      } catch {
        if (mine === gen) store.getState().setCatchUp(null);
        return { ok: false, error: "网络没通，再试一次。" };
      } finally {
        catchUpBusy = false;
      }
    },
    /** End / 首页 with nothing open: results in flight are dropped, the retry memory cleared. */
    abort() {
      gen += 1;
      writing = null;
      catchUpBusy = false;
      failedAt.clear();
      store.getState().setCatchUp(null);
    },
    get writing() {
      return writing;
    },
  };
}

export type StructureRuntime = ReturnType<typeof createStructureRuntime>;
