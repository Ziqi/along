-- A class deleted on one device must stay deleted when another device syncs.
-- Tombstones are written on delete and checked on every upsert, and pulled by
-- clients so their local copies drop too.
create table if not exists class_session_tombstones (
  user_id    text not null,
  id         text not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists class_session_tombstones_user_deleted_idx
  on class_session_tombstones (user_id, deleted_at desc);
