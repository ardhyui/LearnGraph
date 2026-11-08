-- Built-in tutor chat (Roadmap M4): log that a question was asked and, for
-- the comparison "with and without context", which answer the learner found
-- more helpful. Only the outcome is stored, never the question or answer.
alter table learning_events drop constraint if exists learning_events_kind_check;
alter table learning_events add constraint learning_events_kind_check
  check (kind in ('quiz', 'study', 'review', 'snooze', 'unsnooze', 'practice', 'lesson', 'tutor'));
