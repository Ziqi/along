import type { ClassSession } from "./types.ts";

/** Pins first, newest pin on top. Unpinned (and pin ties) go by class time, newest first. */
export function sortSessions(list: ClassSession[]) {
  return [...list].sort((x, y) => {
    const xs = Boolean(x.starred);
    const ys = Boolean(y.starred);
    if (xs !== ys) return Number(ys) - Number(xs);
    if (xs && ys) {
      const pin = (y.starredAt ?? 0) - (x.starredAt ?? 0);
      if (pin) return pin;
    }
    const started = (y.startedAt ?? 0) - (x.startedAt ?? 0);
    if (started) return started;
    return (y.updatedAt ?? 0) - (x.updatedAt ?? 0);
  });
}

export function toggleStar(session: ClassSession, now = Date.now()): ClassSession {
  const starred = !session.starred;
  return {
    ...session,
    starred,
    starredAt: starred ? now : null,
    updatedAt: now,
  };
}

/** Incoming wins only when it is strictly newer. Ties keep the copy already in hand. */
export function newerSession(kept: ClassSession, incoming: ClassSession): ClassSession {
  return (incoming.updatedAt ?? 0) > (kept.updatedAt ?? 0) ? incoming : kept;
}
