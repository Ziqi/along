import { AI_LIMITS, IP_SHARE, type AiKind } from "./limits.ts";

/**
 * Token buckets for the AI server functions. Plain module with no server-only
 * imports so `capcom-ai.ts` can reference it statically; only the server ever
 * calls it. Buckets live in process memory: on serverless that is per instance
 * and best-effort, still enough to stop one hot loop or script from draining
 * the xAI key through a single instance.
 *
 * Two buckets per call. The caller's own (user id, or device id when signed
 * out) holds the per-minute allowance a student needs. The IP's holds
 * `IP_SHARE[kind]` times that: a classroom of thirty behind one router must
 * all get through, while a script rotating device ids from one address still
 * hits a ceiling. A call takes a token from both or from neither.
 */
type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

/** Who is calling, as `guard.server` resolved it. */
export type AiCaller = { key: string; ipKey: string; userId: string | null };

export type AiDenied = { ok: false; error: string; code: "rate_limited" };
export const RATE_LIMITED_TEXT = "太频繁了，稍等一下。";

function bucketFor(id: string, perMinute: number, now: number) {
  const bucket = buckets.get(id) ?? { tokens: perMinute, updated: now };
  const refill = ((now - bucket.updated) / 60_000) * perMinute;
  bucket.tokens = Math.min(perMinute, bucket.tokens + refill);
  bucket.updated = now;
  buckets.set(id, bucket);
  return bucket;
}

export function takeAiToken(
  caller: AiCaller | string,
  kind: AiKind,
  now = Date.now(),
): { ok: true } | AiDenied {
  const perMinute = AI_LIMITS[kind];
  const own = typeof caller === "string" ? caller : caller.key;
  const ip = typeof caller === "string" ? "" : caller.ipKey;
  const mine = bucketFor(`${own}:${kind}`, perMinute, now);
  const shared = ip && ip !== own ? bucketFor(`${ip}:${kind}`, perMinute * IP_SHARE[kind], now) : null;
  if (mine.tokens < 1 || (shared && shared.tokens < 1)) {
    return { ok: false, error: RATE_LIMITED_TEXT, code: "rate_limited" };
  }
  mine.tokens -= 1;
  if (shared) shared.tokens -= 1;
  if (buckets.size > MAX_BUCKETS) sweep(now);
  return { ok: true };
}

function sweep(now: number) {
  for (const [k, v] of buckets) {
    if (now - v.updated > 120_000) buckets.delete(k);
  }
  if (buckets.size > MAX_BUCKETS) {
    for (const k of [...buckets.keys()].slice(0, buckets.size - MAX_BUCKETS)) buckets.delete(k);
  }
}

/** Test hook: forget every bucket. */
export function resetAiBuckets() {
  buckets.clear();
}
