create table if not exists class_sessions (
  user_id    text not null,
  id         text not null,
  payload    text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists class_sessions_user_updated_idx on class_sessions (user_id, updated_at desc);
