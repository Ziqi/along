import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { SESSION_KEEP, SESSION_PAYLOAD_MAX_CHARS } from "@/lib/session-limits";
import type { ClassSession } from "@/lib/types";

function asPayload(v: unknown): ClassSession | null {
  if (!v || typeof v !== "object") return null;
  const s = v as ClassSession;
  if (!s.id || !s.title) return null;
  return s;
}

export type PulledSessions = { sessions: ClassSession[]; removed: string[] };

export const pullSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PulledSessions> => {
    const sql = await getSql();
    const rows = await sql<{ payload: string }>`
      select payload from class_sessions
      where user_id = ${context.userId}
      order by updated_at desc
      limit ${SESSION_KEEP}
    `;
    const gone = await sql<{ id: string }>`
      select id from class_session_tombstones
      where user_id = ${context.userId}
      order by deleted_at desc
      limit 200
    `;
    const sessions = rows
      .map((r) => {
        try {
          return asPayload(JSON.parse(r.payload));
        } catch {
          return null;
        }
      })
      .filter(Boolean) as ClassSession[];
    return { sessions, removed: gone.map((g) => g.id) };
  });

export const pushSessions = createServerFn({ method: "POST" })
  .validator((input: { sessions: ClassSession[]; drop?: string[] }) => ({
    sessions: Array.isArray(input?.sessions) ? input.sessions.slice(0, SESSION_KEEP) : [],
    drop: Array.isArray(input?.drop)
      ? input.drop.map((id) => String(id)).filter(Boolean).slice(0, 120)
      : [],
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const uid = context.userId;
    for (const id of data.drop) {
      await sql`
        insert into class_session_tombstones (user_id, id)
        values (${uid}, ${id})
        on conflict (user_id, id) do nothing
      `;
      await sql`delete from class_sessions where user_id = ${uid} and id = ${id}`;
    }
    const dropped = new Set(data.drop);
    const skipped: string[] = [];
    for (const s of data.sessions) {
      if (!s?.id || dropped.has(s.id)) continue;
      const payload = JSON.stringify(s);
      if (payload.length > SESSION_PAYLOAD_MAX_CHARS) {
        skipped.push(s.id);
        continue;
      }
      // A tombstoned id never comes back, whichever device pushes it.
      await sql`
        insert into class_sessions (user_id, id, payload, updated_at)
        select ${uid}, ${s.id}, ${payload}, now()
        where not exists (
          select 1 from class_session_tombstones t
          where t.user_id = ${uid} and t.id = ${s.id}
        )
        on conflict (user_id, id) do update set
          payload = excluded.payload,
          updated_at = now()
      `;
    }
    if (data.sessions.length) {
      await sql`
        delete from class_sessions
        where user_id = ${uid}
          and id not in (
            select id from class_sessions
            where user_id = ${uid}
            order by updated_at desc
            limit ${SESSION_KEEP}
          )
      `;
    }
    return { ok: true as const, skipped };
  });

/** Push without throwing; reports whether the caller is signed out so the client can back off. */
export async function pushSessionsSafe(
  sessions: ClassSession[],
  drop: string[] = [],
): Promise<{ ok: boolean; skipped?: string[]; unauthorized?: boolean }> {
  try {
    const out = await pushSessions({ data: { sessions, drop } });
    return { ok: true, skipped: out.skipped };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, unauthorized: /Unauthorized|Forbidden/.test(message) };
  }
}
