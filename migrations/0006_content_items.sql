-- Lesson content per concept (Roadmap M2): explanations, worked examples,
-- practice exercises and links, owned by the account like the concept itself.
-- Additive only. Text is stored as plain text with a tiny markup subset and is
-- rendered as React elements (never as HTML); links must be https.

create table if not exists content_items (
  owner_id text not null,
  id text not null,
  concept_id text not null,
  concept_key text collate "C" generated always as ('concept:' || concept_id) stored,
  kind text not null check (kind in ('text', 'example', 'exercise', 'link', 'video')),
  title text not null,
  body text not null default '',
  -- Worked solution of an exercise, shown only when the learner asks for it.
  solution text not null default '',
  url text check (url is null or url like 'https://%'),
  minutes integer check (minutes is null or (minutes between 1 and 600)),
  language text not null default 'en',
  source text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  foreign key (owner_id, concept_key) references concepts (owner_id, key) on delete cascade
);
create index if not exists content_items_concept_idx on content_items (owner_id, concept_id, position);

-- Opening a lesson is logged too (with the presentation order used), so the
-- effect of format preferences can be measured later.
alter table learning_events drop constraint if exists learning_events_kind_check;
alter table learning_events add constraint learning_events_kind_check
  check (kind in ('quiz', 'study', 'review', 'snooze', 'unsnooze', 'practice', 'lesson'));
