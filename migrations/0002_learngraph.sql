-- LearnGraph data (replaces the old LevelDB / IndexedDB key-value store).
--
-- Every row belongs to the signed-in account that owns it (`owner_id`), so
-- each user gets their own isolated workspace of learners, concepts, edges and
-- knowledge states. Deleting the account cascades to all of its data.
--
-- `key` keeps the original LevelDB key (e.g. `concept:algebra`) and is the
-- stable sort order the algorithms were written against; `collate "C"` makes
-- ordering byte-wise, exactly like LevelDB. `data` is the JSON document.
-- The extracted id columns exist for querying and indexing.

create table if not exists learners (
  owner_id text not null references "user" ("id") on delete cascade,
  key text collate "C" not null,
  user_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, key)
);

create table if not exists concepts (
  owner_id text not null references "user" ("id") on delete cascade,
  key text collate "C" not null,
  concept_id text not null,
  domain text,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, key)
);

create table if not exists prerequisite_edges (
  owner_id text not null references "user" ("id") on delete cascade,
  key text collate "C" not null,
  from_concept text,
  to_concept text,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, key)
);

create table if not exists related_edges (
  owner_id text not null references "user" ("id") on delete cascade,
  key text collate "C" not null,
  edge_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, key)
);

create table if not exists knowledge_states (
  owner_id text not null references "user" ("id") on delete cascade,
  key text collate "C" not null,
  learner_id text,
  concept_id text,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, key)
);

-- Secondary indexes the engine maintains itself (domain -> concept,
-- learner -> states). Kept as rows so behaviour matches the original store.
create table if not exists graph_indexes (
  owner_id text not null references "user" ("id") on delete cascade,
  key text collate "C" not null,
  data jsonb not null,
  primary key (owner_id, key)
);

create index if not exists concepts_domain_idx on concepts (owner_id, domain);
create index if not exists prerequisite_edges_to_idx on prerequisite_edges (owner_id, to_concept);
create index if not exists knowledge_states_learner_idx on knowledge_states (owner_id, learner_id);
