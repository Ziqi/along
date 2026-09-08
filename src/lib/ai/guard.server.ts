import { getRequest } from "@tanstack/react-start/server";
import { getSessionUser } from "@/lib/auth/verify.server";
import type { AiCaller } from "./bucket";

/**
 * Caller identity for the AI server functions.
 *
 * Server-only (`.server.ts`): imports `@tanstack/react-start/server`, so it
 * must only be reached through the dynamic import in `guard.ts`.
 *
 * Class can be taken without signing in, so the identity is the verified user
 * id when there is a session, else the browser's device id, else the client
 * IP. The IP is kept beside it either way: a classroom shares one IP, so the
 * per-IP bucket is only a wide backstop against scripts (see `bucket.ts`).
 * Session lookups are cached briefly per credential so a caption every few
 * seconds does not cost a database round-trip each time.
 */
const SESSION_TTL_MS = 60_000;
const sessionCache = new Map<string, { userId: string | null; until: number }>();

function clientIp(request: Request | null | undefined) {
  const h = request?.headers;
  const fwd = h?.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  return first || h?.get("x-real-ip")?.trim() || "local";
}

function cleanDeviceId(raw: string | undefined) {
  return raw && /^[A-Za-z0-9_-]{8,40}$/.test(raw) ? raw : "";
}

export async function resolveAiCaller(bearerToken?: string, deviceId?: string): Promise<AiCaller> {
  const request = getRequest();
  const cookie = request?.headers.get("cookie") ?? "";
  const credential = bearerToken ? `b:${bearerToken}` : cookie ? `c:${cookie}` : "";
  let userId: string | null = null;
  if (credential) {
    const hit = sessionCache.get(credential);
    if (hit && hit.until > Date.now()) {
      userId = hit.userId;
    } else {
      try {
        userId = (await getSessionUser(bearerToken))?.id ?? null;
      } catch {
        userId = null;
      }
      sessionCache.set(credential, { userId, until: Date.now() + SESSION_TTL_MS });
      if (sessionCache.size > 500) {
        const now = Date.now();
        for (const [k, v] of sessionCache) if (v.until < now) sessionCache.delete(k);
      }
    }
  }
  const ipKey = `ip:${clientIp(request)}`;
  const device = cleanDeviceId(deviceId);
  const key = userId ? `u:${userId}` : device ? `d:${device}` : ipKey;
  return { key, ipKey, userId };
}
