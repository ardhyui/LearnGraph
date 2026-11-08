-- AI drafts reviewed by a person (Roadmap M5): every question or curriculum
-- draft a model proposes is approved, edited or discarded before anything is
-- saved, and that decision is kept as data ("simpan koreksi guru"). It also
-- measures the roadmap's targets (share of AI drafts approved).
create table if not exists ai_draft_reviews (
  id text primary key,
  owner_id text not null references "user" ("id") on delete cascade,
  kind text not null check (kind in ('question', 'curriculum')),
  concept_id text,
  decision text not null check (decision in ('approved', 'edited', 'discarded')),
  proposed integer not null default 1,
  accepted integer not null default 0,
  draft jsonb not null,
  final jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_draft_reviews_owner_idx on ai_draft_reviews (owner_id, kind, created_at);
