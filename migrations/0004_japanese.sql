CREATE TABLE IF NOT EXISTS japanese_quizzes (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  concept_id text NOT NULL,
  question_ids jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  answers jsonb,
  correct integer,
  total integer NOT NULL
);
CREATE INDEX IF NOT EXISTS japanese_quizzes_owner ON japanese_quizzes(owner_id,concept_id);
