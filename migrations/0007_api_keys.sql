-- Read-only API keys (Roadmap M4): an external AI assistant can fetch the
-- learner context with `Authorization: Bearer lg_…`. Only a SHA-256 hash of
-- the key is stored; the key itself is shown once. Keys go away with the
-- account. Additive only.
create table if not exists api_keys (
  id text primary key,
  owner_id text not null references "user" ("id") on delete cascade,
  name text not null,
  key_hash text not null unique,
  prefix text not null,
  scope text not null default 'read' check (scope in ('read')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_keys_owner_idx on api_keys (owner_id);
