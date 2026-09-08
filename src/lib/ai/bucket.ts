import { AI_LIMITS, type AiKind } from "./limits.ts";

/**
 * Per-caller token buckets for the AI server functions. Plain module with no
 * server-only imports so `capcom-ai.ts` can reference it statically; only the
 * server ever calls it. Buckets live in process memory: on serverless that is
 * per instance and best-effort, still enough to stop one hot loop or script
 * from draining the xAI key through a single instance.
 */
type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

export type AiDenied = { ok: false; error: string; code: "rate_limited" };
export const RATE_LIMITED_TEXT = "太频繁了，稍等一下。";

export function takeAiToken(
  callerKey: string,
  kind: AiKind,
  now = Date.now(),
): { ok: true } | AiDenied {
  const perMinute = AI_LIMITS[kind];
  const id = `${callerKey}:${kind}`;
  const bucket = buckets.get(id) ?? { tokens: perMinute, updated: now };
  const refill = ((now - bucket.updated) / 60_000) * perMinute;
  bucket.tokens = Math.min(perMinute, bucket.tokens + refill);
  bucket.updated = now;
  if (bucket.tokens < 1) {
    buckets.set(id, bucket);
    return { ok: false, error: RATE_LIMITED_TEXT, code: "rate_limited" };
  }
  bucket.tokens -= 1;
  buckets.set(id, bucket);
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
