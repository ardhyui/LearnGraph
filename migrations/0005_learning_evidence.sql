-- Learning evidence (Roadmap M1): quiz question banks per concept, graded quiz
-- sessions, and an append-only log of every learning activity. Additive only:
-- existing tables and the Japanese quiz data (`japanese_quizzes`) are untouched.

-- Question bank. One row per multiple-choice question, owned by the account
-- like the concept it belongs to. Deleting the concept (or the account)
-- deletes its questions, so a concept id reused later starts without a bank.
create table if not exists quiz_questions (
  owner_id text not null,
  id text not null,
  concept_id text not null,
  concept_key text collate "C" generated always as ('concept:' || concept_id) stored,
  prompt text not null,
  options jsonb not null,
  answer text not null,
  explanation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  foreign key (owner_id, concept_key) references concepts (owner_id, key) on delete cascade
);
create index if not exists quiz_questions_concept_idx on quiz_questions (owner_id, concept_id);

-- One quiz attempt. `questions` is a snapshot (prompt, shuffled options,
-- answer, explanation) taken when the quiz starts, so editing the bank never
-- changes how an attempt in progress is graded. The answer key never leaves
-- the server before grading.
create table if not exists quiz_sessions (
  id text primary key,
  owner_id text not null references "user" ("id") on delete cascade,
  learner_id text not null,
  concept_id text not null,
  questions jsonb not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  answers jsonb,
  correct integer,
  total integer not null
);
create index if not exists quiz_sessions_attempts_idx
  on quiz_sessions (owner_id, learner_id, concept_id, completed_at);

-- Append-only activity log: quiz results, self-reports, reviews, snoozes and
-- practice notes. Rows are never updated (enforced below); they go away only
-- with the account. `was_due` marks answers given while a review was due,
-- which is what the retention measure counts.
create table if not exists learning_events (
  id bigint generated always as identity primary key,
  owner_id text not null references "user" ("id") on delete cascade,
  learner_id text not null,
  concept_id text not null,
  kind text not null check (kind in ('quiz', 'study', 'review', 'snooze', 'unsnooze', 'practice')),
  outcome text not null,
  source text not null default 'app',
  was_due boolean,
  correct integer,
  total integer,
  mastery_before real,
  mastery_after real,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists learning_events_learner_idx
  on learning_events (owner_id, learner_id, created_at);

create or replace function learning_events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'learning_events is append-only';
end
$$;
drop trigger if exists learning_events_no_update on learning_events;
create trigger learning_events_no_update before update on learning_events
  for each row execute function learning_events_append_only();

-- Japanese topics already required evidence (the old `jp-` prefix check in
-- graphCall). The flag on the concept replaces that check.
update concepts
set data = jsonb_set(data, '{evidenceRequired}', 'true'::jsonb, true)
where domain = 'japanese' and concept_id like 'jp-%' and not (data ? 'evidenceRequired');
