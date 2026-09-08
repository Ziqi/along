/** Live caption / coach queue: chase the latest line, never jam on a hung call. */

export const TRANS_CAP = 2;
export const TRANS_KEEP = 8;
export const TRANS_TIMEOUT_MS = 9000;
export const TRANS_TRIES = 3;
/** grok-4.6 first, then the fast model. Outer deadline must cover both. */
export const COACH_PRIMARY_MS = 10000;
export const COACH_FALLBACK_MS = 10000;
export const COACH_TIMEOUT_MS = COACH_PRIMARY_MS + COACH_FALLBACK_MS + 2000;
export const COACH_KEEP = 40;
export const PACK_KEEP = 20;

export function hasZh(s: string) {
  return /[\u4e00-\u9fff]/.test(s);
}

export function needsTranslate(c: { en: string; zh?: string; error?: string }) {
  if (!c.en) return false;
  if (!/[a-zA-Z\u4e00-\u9fff]{3,}/.test(c.en)) return false;
  if (hasZh(c.zh ?? "")) return false;
  return true;
}

export function keepLatestByCaptionOrder<T extends { id: string }>(
  items: T[],
  captionIds: string[],
  keep: number,
): T[] {
  const order = new Map(captionIds.map((id, i) => [id, i]));
  const uniq = new Map<string, T>();
  for (const item of items) uniq.set(item.id, item);
  return [...uniq.values()]
    .sort((a, b) => (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1))
    .slice(-keep);
}

export function mergeTranslateQueue(
  batch: { id: string; en: string }[],
  pending: { id: string; en: string }[],
  captionIds: string[],
  keep = TRANS_KEEP,
) {
  return keepLatestByCaptionOrder([...batch, ...pending], captionIds, keep);
}

export function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("deadline")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
