-- The hour and the handout are two rows now.
--
-- class_sessions keeps the class itself (transcript, coach cards, DeepSearch,
-- notes) plus the catalog columns beside the blob, so listing a user's classes
-- and pulling "what changed since" never read the whole hour.
-- class_recaps keeps the derived handout: it is rewritten on every edit, and
-- edits must not rewrite forty minutes of transcript.
--
-- Writes are last-writer-wins on the client's own clock (client_updated_at /
-- recap_at), so a device that pushes a stale copy cannot cover a newer one.

alter table class_sessions add column if not exists title text not null default '';
alter table class_sessions add column if not exists class_mode text not null default 'interactive';
alter table class_sessions add column if not exists started_at timestamptz;
alter table class_sessions add column if not exists ended_at timestamptz;
alter table class_sessions add column if not exists starred boolean not null default false;
alter table class_sessions add column if not exists schema_version integer not null default 0;
alter table class_sessions add column if not exists client_updated_at bigint not null default 0;

create table if not exists class_recaps (
  user_id    text not null,
  session_id text not null,
  payload    text not null,
  recap_at   bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, session_id)
);
create index if not exists class_recaps_user_updated_idx on class_recaps (user_id, updated_at desc);

-- Rows written before this migration carry the handout inside the blob.
insert into class_recaps (user_id, session_id, payload, recap_at, updated_at)
select
  user_id,
  id,
  (payload::jsonb -> 'recap')::text,
  case
    when jsonb_typeof(payload::jsonb -> 'recap' -> 'at') = 'number'
      then ((payload::jsonb -> 'recap' ->> 'at')::numeric)::bigint
    else 0
  end,
  updated_at
from class_sessions
where payload like '{%'
  and jsonb_typeof(payload::jsonb -> 'recap') = 'object'
on conflict (user_id, session_id) do nothing;

update class_sessions set
  title = coalesce(payload::jsonb ->> 'title', ''),
  class_mode = coalesce(payload::jsonb ->> 'classMode', 'interactive'),
  started_at = case
    when jsonb_typeof(payload::jsonb -> 'startedAt') = 'number'
      then to_timestamp(((payload::jsonb ->> 'startedAt')::numeric) / 1000)
    else null
  end,
  ended_at = case
    when jsonb_typeof(payload::jsonb -> 'endedAt') = 'number'
      then to_timestamp(((payload::jsonb ->> 'endedAt')::numeric) / 1000)
    else null
  end,
  starred = case
    when jsonb_typeof(payload::jsonb -> 'starred') = 'boolean'
      then (payload::jsonb ->> 'starred')::boolean
    else false
  end,
  schema_version = case
    when jsonb_typeof(payload::jsonb -> 'schemaVersion') = 'number'
      then ((payload::jsonb ->> 'schemaVersion')::numeric)::integer
    else 0
  end,
  client_updated_at = case
    when jsonb_typeof(payload::jsonb -> 'updatedAt') = 'number'
      then ((payload::jsonb ->> 'updatedAt')::numeric)::bigint
    else 0
  end,
  payload = (payload::jsonb - 'recap')::text
where payload like '{%';
