import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { RECAP_PAYLOAD_MAX_CHARS, SESSION_KEEP, SESSION_PAYLOAD_MAX_CHARS } from "@/lib/session-limits";
import {
  joinSession,
  sessionMeta,
  slimBody,
  type PullInput,
  type PullOutput,
  type PushInput,
  type PushOutput,
  type RecapRow,
  type SessionBody,
} from "@/lib/session-wire";
import type { ClassRecap, ClassSession } from "@/lib/types";

/**
 * The cloud copy of a signed-in student's catalog: `class_sessions` holds the
 * hour, `class_recaps` the handout, `class_session_tombstones` what was deleted.
 *
 * Pulls are incremental — rows changed since the caller's last cursor, with a
 * few seconds of overlap so a write committing during the previous pull is not
 * missed; merging twice is harmless. Writes are last-writer-wins on the
 * client's own timestamps, so a stale device cannot cover a newer copy; ids it
 * tried to are reported back as `stale` and the client pulls.
 */

function parseBody(raw: string): SessionBody | null {
  try {
    const v = JSON.parse(raw) as SessionBody & { recap?: unknown };
    if (!v || typeof v !== "object" || !v.id || !v.title) return null;
    return v;
  } catch {
    return null;
  }
}

function parseRecap(raw: string | null): ClassRecap | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as ClassRecap) : null;
  } catch {
    return null;
  }
}

function isoOrNull(ms: number | null): string | null {
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

function validSince(input: PullInput | undefined, userId: string): string | null {
  const since = input?.since;
  if (!since || typeof since !== "string" || input?.sinceUser !== userId) return null;
  const t = Date.parse(since);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

type PulledRow = { id: string; payload: string; recap: string | null };

export const pullSessions = createServerFn({ method: "GET" })
  .validator((input: PullInput | undefined) => ({
    since: typeof input?.since === "string" ? input.since : null,
    sinceUser: typeof input?.sinceUser === "string" ? input.sinceUser : null,
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<PullOutput> => {
    const sql = await getSql();
    const uid = context.userId;
    const since = validSince(data, uid);
    const [clock] = await sql<{ now: string | Date }>`select now() as now`;
    const cursor = new Date(clock?.now ?? Date.now()).toISOString();

    const rows = since
      ? await sql<PulledRow>`
          select s.id, s.payload, r.payload as recap
          from class_sessions s
          left join class_recaps r on r.user_id = s.user_id and r.session_id = s.id
          where s.user_id = ${uid}
            and greatest(s.updated_at, coalesce(r.updated_at, s.updated_at))
                > ${since}::timestamptz - interval '5 seconds'
          order by s.updated_at desc
          limit ${SESSION_KEEP}
        `
      : await sql<PulledRow>`
          select s.id, s.payload, r.payload as recap
          from class_sessions s
          left join class_recaps r on r.user_id = s.user_id and r.session_id = s.id
          where s.user_id = ${uid}
          order by s.updated_at desc
          limit ${SESSION_KEEP}
        `;
    const gone = since
      ? await sql<{ id: string }>`
          select id from class_session_tombstones
          where user_id = ${uid}
            and deleted_at > ${since}::timestamptz - interval '5 seconds'
          order by deleted_at desc
          limit 200
        `
      : await sql<{ id: string }>`
          select id from class_session_tombstones
          where user_id = ${uid}
          order by deleted_at desc
          limit 200
        `;

    const sessions: ClassSession[] = [];
    for (const r of rows) {
      const body = parseBody(r.payload);
      if (!body) continue;
      // Rows the split migration has not seen still carry the handout inside.
      const legacy = (body as { recap?: unknown }).recap;
      const recap =
        parseRecap(r.recap) ?? (legacy && typeof legacy === "object" ? (legacy as ClassRecap) : null);
      delete (body as { recap?: unknown }).recap;
      sessions.push(joinSession(body, recap));
    }
    return { sessions, removed: gone.map((g) => g.id), cursor, userId: uid, full: !since };
  });

function cleanRecapRows(input: unknown): RecapRow[] {
  if (!Array.isArray(input)) return [];
  const out: RecapRow[] = [];
  for (const r of input.slice(0, SESSION_KEEP)) {
    const row = r as Partial<RecapRow>;
    if (!row || typeof row.sessionId !== "string" || !row.recap || typeof row.recap !== "object") continue;
    out.push({ sessionId: row.sessionId, recap: row.recap });
  }
  return out;
}

export const pushSessions = createServerFn({ method: "POST" })
  .validator((input: PushInput) => ({
    sessions: Array.isArray(input?.sessions)
      ? (input.sessions.filter((s) => s && typeof s === "object" && s.id).slice(0, SESSION_KEEP) as SessionBody[])
      : [],
    recaps: cleanRecapRows(input?.recaps),
    drop: Array.isArray(input?.drop)
      ? input.drop.map((id) => String(id)).filter(Boolean).slice(0, 120)
      : [],
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<PushOutput> => {
    const sql = await getSql();
    const uid = context.userId;
    const skipped: string[] = [];
    const stale: string[] = [];

    for (const id of data.drop) {
      await sql`
        insert into class_session_tombstones (user_id, id)
        values (${uid}, ${id})
        on conflict (user_id, id) do nothing
      `;
      await sql`delete from class_sessions where user_id = ${uid} and id = ${id}`;
      await sql`delete from class_recaps where user_id = ${uid} and session_id = ${id}`;
    }
    const dropped = new Set(data.drop);

    for (const raw of data.sessions) {
      if (dropped.has(raw.id)) continue;
      const body: SessionBody & { recap?: unknown } = { ...raw };
      delete body.recap;
      let payload = JSON.stringify(body);
      if (payload.length > SESSION_PAYLOAD_MAX_CHARS) {
        // The hour does not fit; keep the class in the catalog without its tape.
        payload = JSON.stringify(slimBody(body));
        skipped.push(body.id);
        if (payload.length > SESSION_PAYLOAD_MAX_CHARS) continue;
      }
      const meta = sessionMeta(body);
      // A tombstoned id never comes back, and an older copy never covers a newer one.
      const wrote = await sql<{ id: string }>`
        insert into class_sessions
          (user_id, id, payload, title, class_mode, started_at, ended_at, starred,
           schema_version, client_updated_at, updated_at)
        select
          ${uid}, ${body.id}, ${payload}, ${meta.title}::text, ${meta.classMode}::text,
          ${isoOrNull(meta.startedAt)}::timestamptz, ${isoOrNull(meta.endedAt)}::timestamptz,
          ${meta.starred}::boolean, ${meta.schemaVersion}::integer, ${meta.updatedAt}::bigint, now()
        where not exists (
          select 1 from class_session_tombstones t
          where t.user_id = ${uid} and t.id = ${body.id}
        )
        on conflict (user_id, id) do update set
          payload = excluded.payload,
          title = excluded.title,
          class_mode = excluded.class_mode,
          started_at = excluded.started_at,
          ended_at = excluded.ended_at,
          starred = excluded.starred,
          schema_version = excluded.schema_version,
          client_updated_at = excluded.client_updated_at,
          updated_at = now()
        where excluded.client_updated_at >= class_sessions.client_updated_at
        returning id
      `;
      if (!wrote.length) stale.push(body.id);
    }

    for (const row of data.recaps) {
      if (dropped.has(row.sessionId)) continue;
      const payload = JSON.stringify(row.recap);
      if (payload.length > RECAP_PAYLOAD_MAX_CHARS) {
        skipped.push(row.sessionId);
        continue;
      }
      const at = typeof row.recap.at === "number" && Number.isFinite(row.recap.at) ? row.recap.at : 0;
      const wrote = await sql<{ session_id: string }>`
        insert into class_recaps (user_id, session_id, payload, recap_at, updated_at)
        select ${uid}, ${row.sessionId}, ${payload}, ${at}::bigint, now()
        where not exists (
          select 1 from class_session_tombstones t
          where t.user_id = ${uid} and t.id = ${row.sessionId}
        )
        on conflict (user_id, session_id) do update set
          payload = excluded.payload,
          recap_at = excluded.recap_at,
          updated_at = now()
        where excluded.recap_at >= class_recaps.recap_at
        returning session_id
      `;
      if (!wrote.length) stale.push(row.sessionId);
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
      await sql`
        delete from class_recaps r
        where r.user_id = ${uid}
          and not exists (
            select 1 from class_sessions s
            where s.user_id = r.user_id and s.id = r.session_id
          )
      `;
    }
    return { ok: true as const, skipped, stale: [...new Set(stale)] };
  });

/** Push without throwing; reports whether the caller is signed out so the client can back off. */
export async function pushSessionsSafe(
  input: PushInput,
): Promise<{ ok: boolean; skipped?: string[]; stale?: string[]; unauthorized?: boolean }> {
  try {
    const out = await pushSessions({ data: input });
    return { ok: true, skipped: out.skipped, stale: out.stale };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, unauthorized: /Unauthorized|Forbidden/.test(message) };
  }
}
