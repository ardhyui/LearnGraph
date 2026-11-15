/**
 * Direct unit tests for the learning event log measures `src/lib/evidence/events.ts`.
 *
 * The module is pure and was only covered indirectly: one `dueReviewRetention`
 * assertion in `tests/learning-evidence.test.ts`, two retention rates plus one
 * `tutorPreference` assertion in `tests/learning-measures.test.ts`, and one
 * `tutorPreference` assertion in `tests/tutor-chat.test.ts`. This file imports it
 * directly (node:test, no PGlite or DOM) and locks which events the two measures
 * count, how the rates are computed and the rough edges of the tutor comparison.
 * The module is not changed here: the tests pin its current behaviour.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dueReviewRetention, tutorPreference } from '../src/lib/evidence/events.ts';

const EVENTS_FILE = join(import.meta.dirname, '..', 'src', 'lib', 'evidence', 'events.ts');
const MEASURES_FILE = join(import.meta.dirname, '..', 'src', 'lib', 'evidence', 'measures.ts');
const FUNCTIONS_FILE = join(import.meta.dirname, '..', 'src', 'server', 'evidence.functions.ts');
const EVIDENCE_TEST_FILE = join(import.meta.dirname, 'learning-evidence.test.ts');
const MEASURES_TEST_FILE = join(import.meta.dirname, 'learning-measures.test.ts');

type RetentionInput = Parameters<typeof dueReviewRetention>[0][number];
type TutorInput = Parameters<typeof tutorPreference>[0][number];

/** One event as `dueReviewRetention` sees it (the kinds are kept loose on purpose). */
const retentionEvent = (kind: string, outcome: string, wasDue?: boolean | null) =>
  ({ kind, outcome, wasDue }) as unknown as RetentionInput;

/** One event as `tutorPreference` sees it. */
const tutorEvent = (kind: string, outcome: string) => ({ kind, outcome }) as unknown as TutorInput;

describe('dueReviewRetention', () => {
  it('counts only events answered while a review was due', () => {
    const retention = dueReviewRetention([
      retentionEvent('quiz', 'passed', true),
      retentionEvent('quiz', 'passed', false),
      retentionEvent('quiz', 'passed', null),
      retentionEvent('quiz', 'passed', undefined),
      // The field is optional in the input type; absent is not due either.
      { kind: 'quiz', outcome: 'passed' } as unknown as RetentionInput,
      retentionEvent('review', 'remembered', true),
    ]);
    assert.deepEqual(retention.quiz, { answered: 1, correct: 1, rate: 1 });
    assert.deepEqual(retention.selfReport, { answered: 1, correct: 1, rate: 1 });
  });

  it('counts a due quiz as answered and only a passed quiz as correct', () => {
    const retention = dueReviewRetention([
      retentionEvent('quiz', 'passed', true),
      retentionEvent('quiz', 'failed', true),
      retentionEvent('quiz', 'remembered', true),
      retentionEvent('quiz', 'passed-ish', true),
    ]);
    assert.deepEqual(retention.quiz, { answered: 4, correct: 1, rate: 0.25 });
  });

  it('counts a due review as answered and only "remembered" as correct', () => {
    const retention = dueReviewRetention([
      retentionEvent('review', 'remembered', true),
      retentionEvent('review', 'forgot', true),
      retentionEvent('review', 'passed', true),
    ]);
    assert.deepEqual(retention.selfReport, { answered: 3, correct: 1, rate: 1 / 3 });
    assert.deepEqual(retention.quiz, { answered: 0, correct: 0, rate: null });
  });

  it('ignores other kinds even when they were due', () => {
    const retention = dueReviewRetention(
      ['study', 'snooze', 'unsnooze', 'practice', 'lesson', 'tutor'].map((kind) =>
        retentionEvent(kind, 'passed', true),
      ),
    );
    assert.deepEqual(retention, {
      quiz: { answered: 0, correct: 0, rate: null },
      selfReport: { answered: 0, correct: 0, rate: null },
    });
  });

  it('computes rate as correct / answered without rounding', () => {
    const rate = (passed: number, total: number) => {
      const events = Array.from({ length: total }, (_, i) =>
        retentionEvent('quiz', i < passed ? 'passed' : 'failed', true),
      );
      return dueReviewRetention(events).quiz.rate;
    };
    assert.equal(rate(4, 4), 1);
    assert.equal(rate(0, 4), 0);
    assert.equal(rate(2, 4), 0.5);
    assert.equal(rate(3, 4), 0.75);
    assert.equal(rate(1, 3), 1 / 3);
    assert.equal(rate(2, 3), 2 / 3);
  });

  it('keeps the two buckets independent', () => {
    const selfOnly = dueReviewRetention([retentionEvent('review', 'forgot', true)]);
    assert.deepEqual(selfOnly.quiz, { answered: 0, correct: 0, rate: null });
    assert.deepEqual(selfOnly.selfReport, { answered: 1, correct: 0, rate: 0 });

    const quizOnly = dueReviewRetention([retentionEvent('quiz', 'failed', true)]);
    assert.deepEqual(quizOnly.quiz, { answered: 1, correct: 0, rate: 0 });
    assert.deepEqual(quizOnly.selfReport, { answered: 0, correct: 0, rate: null });
  });

  it('returns null rates for an empty log', () => {
    assert.deepEqual(dueReviewRetention([]), {
      quiz: { answered: 0, correct: 0, rate: null },
      selfReport: { answered: 0, correct: 0, rate: null },
    });
  });

  it('does not mutate the events and does not depend on their order', () => {
    const events = [
      retentionEvent('quiz', 'passed', true),
      retentionEvent('quiz', 'failed', true),
      retentionEvent('review', 'remembered', true),
      retentionEvent('review', 'forgot', true),
      retentionEvent('quiz', 'passed', false),
    ];
    const snapshot = structuredClone(events);
    events.forEach((event) => Object.freeze(event));
    Object.freeze(events);

    const forward = dueReviewRetention(events);
    const backward = dueReviewRetention([...events].reverse());

    assert.deepEqual(forward, backward);
    assert.deepEqual(events, snapshot);
  });
});

describe('tutorPreference', () => {
  it('counts each blind comparison into its own bucket', () => {
    const preference = tutorPreference([
      tutorEvent('tutor', 'prefer-context'),
      tutorEvent('tutor', 'prefer-context'),
      tutorEvent('tutor', 'prefer-plain'),
      tutorEvent('tutor', 'prefer-same'),
    ]);
    assert.deepEqual(preference, {
      compared: 4,
      preferContext: 2,
      preferPlain: 1,
      same: 1,
    });
  });

  it('counts an unknown "prefer-" outcome as compared but in no bucket', () => {
    // Rough edge kept as-is: the three buckets can add up to less than `compared`.
    const preference = tutorPreference([
      tutorEvent('tutor', 'prefer-context'),
      tutorEvent('tutor', 'prefer-other'),
    ]);
    assert.deepEqual(preference, {
      compared: 2,
      preferContext: 1,
      preferPlain: 0,
      same: 0,
    });
  });

  it('ignores non-tutor comparisons and tutor events that are not comparisons', () => {
    const preference = tutorPreference([
      tutorEvent('quiz', 'prefer-context'),
      tutorEvent('review', 'prefer-plain'),
      tutorEvent('study', 'prefer-same'),
      tutorEvent('tutor', 'asked'),
      tutorEvent('tutor', 'prefer-context'),
    ]);
    assert.deepEqual(preference, {
      compared: 1,
      preferContext: 1,
      preferPlain: 0,
      same: 0,
    });
  });

  it('returns zeros for an empty log', () => {
    assert.deepEqual(tutorPreference([]), {
      compared: 0,
      preferContext: 0,
      preferPlain: 0,
      same: 0,
    });
  });

  it('does not mutate the events and does not depend on their order', () => {
    const events = [
      tutorEvent('tutor', 'prefer-context'),
      tutorEvent('tutor', 'prefer-plain'),
      tutorEvent('tutor', 'prefer-other'),
      tutorEvent('quiz', 'prefer-context'),
    ];
    const snapshot = structuredClone(events);
    events.forEach((event) => Object.freeze(event));
    Object.freeze(events);

    const forward = tutorPreference(events);
    const backward = tutorPreference([...events].reverse());

    assert.deepEqual(forward, backward);
    assert.deepEqual(events, snapshot);
  });
});

describe('source guards', () => {
  it('keeps the events module free of imports and exports its measures and types', () => {
    const source = readFileSync(EVENTS_FILE, 'utf8');
    assert.equal(source.match(/^\s*import\b/gm), null);
    assert.doesNotMatch(source, /\brequire\s*\(/);
    const exports = [...source.matchAll(/^export (?:type|interface|const|function) (\w+)/gm)].map(
      (match) => match[1],
    );
    assert.deepEqual(exports, [
      'LearningEventKind',
      'LearningEventSource',
      'LearningEventInput',
      'LearningEvent',
      'RetentionStat',
      'dueReviewRetention',
      'tutorPreference',
    ]);
  });

  it('keeps the measures on the shared functions instead of a copy', () => {
    const source = readFileSync(MEASURES_FILE, 'utf8');
    assert.match(
      source,
      /import \{ dueReviewRetention, tutorPreference, type LearningEvent, type RetentionStat \} from '\.\/events\.ts';/,
    );
    assert.doesNotMatch(source, /wasDue !== true/);
    assert.doesNotMatch(source, /answered \? correct \/ answered/);
    assert.doesNotMatch(source, /startsWith\('prefer-'\)/);
  });

  it('keeps the server function on the shared retention function', () => {
    const source = readFileSync(FUNCTIONS_FILE, 'utf8');
    assert.match(
      source,
      /const \{ dueReviewRetention \} = await import\('@\/lib\/evidence\/events'\);/,
    );
  });

  it('keeps the older assertions in place', () => {
    const evidence = readFileSync(EVIDENCE_TEST_FILE, 'utf8');
    assert.match(
      evidence,
      /'retention at review time counts due quiz reviews and due self-reports separately'/,
    );
    const measures = readFileSync(MEASURES_TEST_FILE, 'utf8');
    assert.match(measures, /retention\.quiz\.rate, 0\.5/);
    assert.match(measures, /retention\.selfReport\.rate, 0\.75/);
    assert.match(
      measures,
      /'The answer that knew the learner was preferred in 2 of 3 comparisons \(the other: 1, no difference: 0\)'/,
    );
  });
});
