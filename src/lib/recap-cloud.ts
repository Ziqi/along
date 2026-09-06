import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { ClassSession } from "@/lib/types";

function asPayload(v: unknown): ClassSession | null {
  if (!v || typeof v !== "object") return null;
  const s = v as ClassSession;
  if (!s.id || !s.title) return null;
  return s;
}

export const pullSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ payload: string }>`
      select payload from class_sessions
      where user_id = ${context.userId}
      order by updated_at desc
      limit 40
    `;
    return rows
      .map((r) => {
        try {
          return asPayload(JSON.parse(r.payload));
        } catch {
          return null;
        }
      })
      .filter(Boolean) as ClassSession[];
  });

export const pushSessions = createServerFn({ method: "POST" })
  .validator((input: { sessions: ClassSession[] }) => ({
    sessions: Array.isArray(input?.sessions) ? input.sessions.slice(0, 40) : [],
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    for (const s of data.sessions) {
      if (!s?.id) continue;
      const payload = JSON.stringify(s);
      await sql`
        insert into class_sessions (user_id, id, payload, updated_at)
        values (${context.userId}, ${s.id}, ${payload}, now())
        on conflict (user_id, id) do update set
          payload = excluded.payload,
          updated_at = now()
      `;
    }
    return { ok: true as const };
  });

export async function pushSessionsSafe(sessions: ClassSession[]) {
  try {
    await pushSessions({ data: { sessions } });
  } catch {
    /* signed out */
  }
}
