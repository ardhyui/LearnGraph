/**
 * Direct unit tests for the roadmap's measures of success
 * `src/lib/evidence/measures.ts`.
 *
 * The module was only covered by `tests/learning-measures.test.ts` (111 lines,
 * kept intact): a handful of assertions over one mixed event list. This file
 * imports the module directly (node:test, no PGlite or DOM) and locks the week
 * boundaries of `returningLearners`, the finisher predicate, the rounding and
 * clamping of `activationTime`, the pass-through assembly of `learningMeasures`
 * and every branch of the `measureRows` wording, singulars included. The module
 * is not changed here: the tests pin its current behaviour.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  activationTime,
  finishesConcept,
  learningMeasures,
  measureRows,
  returningLearners,
  type LearningMeasures,
  type MeasureRow,
} from '../src/lib/evidence/measures.ts';
import { dueReviewRetention, tutorPreference } from '../src/lib/evidence/events.ts';

const SRC_DIR = join(import.meta.dirname, '..', 'src');
const MEASURES_FILE = join(SRC_DIR, 'lib', 'evidence', 'measures.ts');
const FUNCTIONS_FILE = join(SRC_DIR, 'server', 'evidence.functions.ts');
const COMPONENT_FILE = join(SRC_DIR, 'components', 'LearningMeasures.tsx');
const OLD_MEASURES_TEST = join(import.meta.dirname, 'learning-measures.test.ts');
const OLD_EVENTS_TEST = join(import.meta.dirname, 'evidence-events.test.ts');

const DAY = 86_400_000;
const NOW = new Date('2026-11-16T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const ago = (days: number) => iso(NOW.getTime() - days * DAY);

/** One event as the measures see it (the kinds are kept loose on purpose). */
type MeasureEvent = Parameters<typeof returningLearners>[0][number];
type E = {
  kind: string;
  outcome: string;
  learnerId: string;
  createdAt: string;
  wasDue?: boolean | null;
};
const ev = (
  learnerId: string,
  daysAgo: number,
  kind = 'quiz',
  outcome = 'passed',
  wasDue: boolean | null = null,
  at?: string,
): MeasureEvent =>
  ({ learnerId, kind, outcome, createdAt: at ?? ago(daysAgo), wasDue }) as E as MeasureEvent;

/** A `LearningMeasures` with every branch empty, to override per assertion. */
const EMPTY: LearningMeasures = {
  events: 0,
  retention: {
    quiz: { answered: 0, correct: 0, rate: null },
    selfReport: { answered: 0, correct: 0, rate: null },
  },
  calibrationGap: null,
  returning: { activeBefore: 0, returned: 0, rate: null },
  activation: { firstFinishedAt: null, minutes: null },
  tutor: { compared: 0, preferContext: 0, preferPlain: 0, same: 0 },
};

/** The `value` of one row, with the rest of the measures overridden. */
const value = (over: Partial<LearningMeasures>, id: MeasureRow['id']): string =>
  measureRows({ ...EMPTY, ...over }).find((r) => r.id === id)?.value ?? 'row missing';

/** Every `.ts`/`.tsx` file under `src/`, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('returningLearners ("Kembali belajar")', () => {
  it('counts the five learning kinds, and ignores snoozing, un-snoozing and the tutor whenever they happened', () => {
    const events = [
      ev('q', 10, 'quiz', 'passed'),
      ev('s', 10, 'study', 'got-it'),
      ev('r', 10, 'review', 'remembered'),
      ev('p', 10, 'practice', 'logged'),
      ev('l', 10, 'lesson', 'opened'),
      // Postponing a review or asking the tutor is not learning, in either week.
      ev('x1', 10, 'snooze', 'snoozed'),
      ev('x2', 10, 'unsnooze', 'unsnooze'),
      ev('x3', 10, 'tutor', 'asked'),
      ev('x4', 1, 'snooze', 'snoozed'),
      ev('x5', 1, 'unsnooze', 'unsnooze'),
      ev('x6', 1, 'tutor', 'prefer-context'),
    ];
    assert.deepEqual(returningLearners(events, NOW), { activeBefore: 5, returned: 0, rate: 0 });
  });

  it('puts exactly 7 days ago in the earlier week, ignores exactly 14 days, the future and broken dates', () => {
    // Exactly 7 days ago is the earlier week, not the recent one.
    assert.deepEqual(returningLearners([ev('a', 7)], NOW), {
      activeBefore: 1,
      returned: 0,
      rate: 0,
    });
    // Exactly 14 days ago is outside both windows entirely.
    assert.deepEqual(returningLearners([ev('a', 14)], NOW), {
      activeBefore: 0,
      returned: 0,
      rate: null,
    });
    // One millisecond this side of 7 days, and `now` itself, count as recent.
    assert.deepEqual(
      returningLearners(
        [ev('a', 0, 'quiz', 'passed', null, iso(NOW.getTime() - 7 * DAY + 1))],
        NOW,
      ),
      {
        activeBefore: 0,
        returned: 0,
        rate: null,
      },
    );
    assert.deepEqual(
      returningLearners([ev('a', 0, 'quiz', 'passed', null, NOW.toISOString())], NOW),
      {
        activeBefore: 0,
        returned: 0,
        rate: null,
      },
    );
    // A future timestamp and a broken one are ignored.
    assert.deepEqual(
      returningLearners([ev('a', 0, 'quiz', 'passed', null, iso(NOW.getTime() + 1))], NOW),
      {
        activeBefore: 0,
        returned: 0,
        rate: null,
      },
    );
    assert.deepEqual(returningLearners([ev('a', 0, 'quiz', 'passed', null, 'not a date')], NOW), {
      activeBefore: 0,
      returned: 0,
      rate: null,
    });
    // The boundary pairing: active exactly 7 days ago and again right now.
    assert.deepEqual(
      returningLearners([ev('a', 7), ev('a', 0, 'quiz', 'passed', null, NOW.toISOString())], NOW),
      { activeBefore: 1, returned: 1, rate: 1 },
    );
  });

  it('counts a learner once, ignores recent-only learners and keeps the rate unrounded', () => {
    const events = [
      ev('ana', 10),
      ev('ana', 9),
      ev('ana', 8),
      ev('ana', 1), // one learner, four events: still counted once
      ev('ben', 9), // active before, never came back
      ev('cy', 8), // active before, never came back
      ev('dee', 3), // only active in the last 7 days: not `activeBefore`
    ];
    assert.deepEqual(returningLearners(events, NOW), { activeBefore: 3, returned: 1, rate: 1 / 3 });
    assert.equal(returningLearners(events, NOW).rate, 1 / 3);
    // Nobody active before → `null`; active before without returning → 0.
    assert.deepEqual(returningLearners([], NOW), { activeBefore: 0, returned: 0, rate: null });
    assert.deepEqual(returningLearners([ev('ben', 9)], NOW), {
      activeBefore: 1,
      returned: 0,
      rate: 0,
    });
  });
});

describe('finishesConcept', () => {
  it('is true only for a passed quiz or "got it" on a concept without a quiz', () => {
    assert.equal(finishesConcept({ kind: 'quiz', outcome: 'passed' }), true);
    assert.equal(finishesConcept({ kind: 'study', outcome: 'got-it' }), true);
    const notFinishing: ReadonlyArray<
      ['quiz' | 'study' | 'review' | 'practice' | 'lesson', string]
    > = [
      ['quiz', 'failed'],
      ['study', 'started'],
      ['review', 'remembered'],
      ['practice', 'logged'],
      ['lesson', 'opened'],
    ];
    for (const [kind, outcome] of notFinishing) {
      assert.equal(finishesConcept({ kind, outcome }), false, `${kind}+${outcome}`);
    }
  });
});

describe('activationTime ("Aktivasi")', () => {
  const created = ago(1);
  const at = (minutes: number) => iso(Date.parse(created) + minutes * 60_000);

  it('picks the earliest finisher by time, not by array order, as an ISO timestamp with milliseconds', () => {
    const later = ev('ana', 0, 'quiz', 'passed', null, at(20));
    const earlier = ev('ana', 0, 'study', 'got-it', null, at(3));
    assert.deepEqual(activationTime(created, [later, earlier]), {
      firstFinishedAt: at(3),
      minutes: 3,
    });
    assert.deepEqual(activationTime(created, [earlier, later]), {
      firstFinishedAt: at(3),
      minutes: 3,
    });
    assert.match(activationTime(created, [earlier]).firstFinishedAt ?? '', /\.\d{3}Z$/);
  });

  it('rounds to whole minutes (half up) and clamps a finish before the account to zero', () => {
    const minutes = (m: number) =>
      activationTime(created, [ev('ana', 0, 'quiz', 'passed', null, at(m))]).minutes;
    assert.equal(minutes(10 / 60), 0); // 10 seconds
    assert.equal(minutes(0.5), 1); // 30 seconds: half rounds up
    assert.equal(minutes(1.5), 2); // 90 seconds
    assert.equal(minutes(-5), 0); // finished before the account was created
  });

  it('returns null minutes without an account date, and ignores broken or non-finishing events', () => {
    assert.deepEqual(
      activationTime(created, [ev('ana', 0, 'study', 'started'), ev('ana', 0, 'quiz', 'failed')]),
      {
        firstFinishedAt: null,
        minutes: null,
      },
    );
    const finisher = ev('ana', 0, 'quiz', 'passed', null, at(3));
    assert.deepEqual(activationTime(null, [finisher]), { firstFinishedAt: at(3), minutes: null });
    assert.deepEqual(activationTime('not a date', [finisher]), {
      firstFinishedAt: at(3),
      minutes: null,
    });
    // A finisher with a broken timestamp is ignored; a valid one still wins.
    assert.deepEqual(
      activationTime(created, [ev('ana', 0, 'quiz', 'passed', null, 'not a date')]),
      {
        firstFinishedAt: null,
        minutes: null,
      },
    );
    assert.deepEqual(
      activationTime(created, [
        ev('ana', 0, 'study', 'got-it', null, 'not a date'),
        ev('ana', 0, 'quiz', 'passed', null, at(5)),
      ]),
      { firstFinishedAt: at(5), minutes: 5 },
    );
  });
});

describe('learningMeasures', () => {
  it('counts the rows and passes every measure through from its helper', () => {
    const events = [
      ev('ana', 1, 'quiz', 'passed', true),
      ev('ana', 1, 'quiz', 'failed', true),
      ev('ben', 1, 'review', 'remembered', true),
      ev('ben', 1, 'review', 'forgot', true),
      ev('ben', 10, 'study', 'got-it'),
      ev('ben', 2, 'tutor', 'prefer-context'),
    ];
    const created = ago(30);
    const m = learningMeasures(events, created, NOW);
    assert.equal(m.events, events.length);
    assert.deepEqual(m.retention, dueReviewRetention(events));
    assert.deepEqual(m.returning, returningLearners(events, NOW));
    assert.deepEqual(m.activation, activationTime(created, events));
    assert.deepEqual(m.tutor, tutorPreference(events));
  });

  it('rounds the calibration gap to whole points, only once both sides have answered', () => {
    const gap = (quizCorrect: number, quizTotal: number, selfCorrect: number, selfTotal: number) =>
      learningMeasures(
        [
          ...Array.from({ length: quizTotal }, (_, i) =>
            ev('a', 1, 'quiz', i < quizCorrect ? 'passed' : 'failed', true),
          ),
          ...Array.from({ length: selfTotal }, (_, i) =>
            ev('a', 1, 'review', i < selfCorrect ? 'remembered' : 'forgot', true),
          ),
        ],
        null,
        NOW,
      ).calibrationGap;
    assert.equal(gap(2, 3, 3, 4), 8); // 0.75 - 0.666…, rounded up
    assert.equal(gap(2, 3, 1, 3), -33); // negative, rounded towards zero
    assert.equal(gap(1, 2, 1, 2), 0); // both equal
    assert.equal(gap(1, 2, 0, 0), null); // no self-report answered
    assert.equal(gap(0, 0, 1, 2), null); // no quiz answered
    assert.deepEqual(learningMeasures([], null, NOW), EMPTY);
  });
});

describe('measureRows', () => {
  it('renders the six rows in roadmap order with their labels, values and targets', () => {
    const filled: LearningMeasures = {
      events: 9,
      retention: {
        quiz: { answered: 2, correct: 1, rate: 0.5 },
        selfReport: { answered: 2, correct: 1, rate: 0.5 },
      },
      calibrationGap: 0,
      returning: { activeBefore: 2, returned: 1, rate: 0.5 },
      activation: { firstFinishedAt: ago(0.5), minutes: 4 },
      tutor: { compared: 3, preferContext: 2, preferPlain: 1, same: 0 },
    };
    assert.deepEqual(measureRows(filled), [
      {
        id: 'retention',
        label: 'Remembered at review time',
        value: 'Due reviews answered correctly: quizzes 50% of 2, self-reports 50% of 2',
        target: 'Close to what the review schedule predicts',
      },
      {
        id: 'calibration',
        label: 'Self-reports compared with quizzes',
        value: 'Self-reports match quiz results',
        target: 'Watched; the basis for reviewing decision D5',
      },
      {
        id: 'returning',
        label: 'Came back the next week',
        value: '1 of 2 learners active 8–14 days ago learned again in the last 7 days (50%)',
        target: 'Set after 4 weeks of data',
      },
      {
        id: 'activation',
        label: 'First concept finished',
        value: '4 minutes after the account was created',
        target: 'Under 5 minutes',
      },
      {
        id: 'session',
        label: 'Study sessions finished',
        value: 'Not recorded yet: starting and finishing a session is not logged',
        target: '80%',
      },
      {
        id: 'personalisation',
        label: 'Personalisation (tutor comparison)',
        value:
          'The answer that knew the learner was preferred in 2 of 3 comparisons (the other: 1, no difference: 0)',
        target: 'Better with personalisation; if not, simplify it',
      },
    ]);
  });

  it('words retention from either or both buckets, and calibration in points with singulars', () => {
    const quiz = { answered: 1, correct: 1, rate: 1 };
    const selfReport = { answered: 1, correct: 1, rate: 1 };
    assert.equal(value({}, 'retention'), 'No due reviews answered yet');
    assert.equal(
      value({ retention: { quiz, selfReport: EMPTY.retention.selfReport } }, 'retention'),
      'Due reviews answered correctly: quizzes 100% of 1',
    );
    assert.equal(
      value({ retention: { quiz: EMPTY.retention.quiz, selfReport } }, 'retention'),
      'Due reviews answered correctly: self-reports 100% of 1',
    );
    assert.equal(
      value(
        {
          retention: {
            quiz: { answered: 2, correct: 1, rate: 0.5 },
            selfReport: { answered: 2, correct: 1, rate: 0.5 },
          },
        },
        'retention',
      ),
      'Due reviews answered correctly: quizzes 50% of 2, self-reports 50% of 2',
    );
    assert.equal(
      value({ calibrationGap: null }, 'calibration'),
      'Needs due reviews answered both ways',
    );
    assert.equal(value({ calibrationGap: 0 }, 'calibration'), 'Self-reports match quiz results');
    assert.equal(
      value({ calibrationGap: 25 }, 'calibration'),
      'Self-reports are 25 points higher than quiz results',
    );
    assert.equal(
      value({ calibrationGap: -25 }, 'calibration'),
      'Self-reports are 25 points lower than quiz results',
    );
    assert.equal(
      value({ calibrationGap: 1 }, 'calibration'),
      'Self-reports are 1 point higher than quiz results',
    );
    assert.equal(
      value({ calibrationGap: -1 }, 'calibration'),
      'Self-reports are 1 point lower than quiz results',
    );
  });

  it('words returning and the tutor comparison, with singulars', () => {
    assert.equal(value({}, 'returning'), 'No learner was active 8–14 days ago');
    assert.equal(
      value({ returning: { activeBefore: 2, returned: 0, rate: 0 } }, 'returning'),
      '0 of 2 learners active 8–14 days ago learned again in the last 7 days (0%)',
    );
    assert.equal(
      value({ returning: { activeBefore: 1, returned: 1, rate: 1 } }, 'returning'),
      '1 of 1 learner active 8–14 days ago learned again in the last 7 days (100%)',
    );
    assert.equal(value({}, 'personalisation'), 'No blind comparisons yet');
    assert.equal(
      value(
        { tutor: { compared: 3, preferContext: 2, preferPlain: 1, same: 0 } },
        'personalisation',
      ),
      'The answer that knew the learner was preferred in 2 of 3 comparisons (the other: 1, no difference: 0)',
    );
    assert.equal(
      value(
        { tutor: { compared: 1, preferContext: 1, preferPlain: 0, same: 0 } },
        'personalisation',
      ),
      'The answer that knew the learner was preferred in 1 of 1 comparison (the other: 0, no difference: 0)',
    );
  });

  it('words the activation duration in minutes, hours and days, or an unknown start date', () => {
    const activation = (minutes: number) => ({ firstFinishedAt: ago(0.5), minutes });
    assert.equal(
      value({ activation: activation(1) }, 'activation'),
      '1 minute after the account was created',
    );
    assert.equal(
      value({ activation: activation(45) }, 'activation'),
      '45 minutes after the account was created',
    );
    assert.equal(
      value({ activation: activation(60) }, 'activation'),
      '1 hour after the account was created',
    );
    assert.equal(
      value({ activation: activation(90) }, 'activation'),
      '2 hours after the account was created',
    ); // 1.5 h rounds up
    assert.equal(
      value({ activation: activation(48 * 60) }, 'activation'),
      '2 days after the account was created',
    );
    assert.equal(
      value({ activation: activation(72 * 60) }, 'activation'),
      '3 days after the account was created',
    );
    assert.equal(value({}, 'activation'), 'No concept finished yet');
    assert.equal(
      value({ activation: { firstFinishedAt: ago(0.5), minutes: null } }, 'activation'),
      'Finished, but the account’s start date is unknown',
    );
  });
});

describe('source guards', () => {
  it('keeps measures.ts on its single events import, exporting five functions and four types', () => {
    const source = readFileSync(MEASURES_FILE, 'utf8');
    const imports = source.match(/^\s*import\b.*$/gm) ?? [];
    assert.equal(imports.length, 1);
    assert.equal(
      imports[0],
      "import { dueReviewRetention, tutorPreference, type LearningEvent, type RetentionStat } from './events.ts';",
    );
    assert.doesNotMatch(source, /\brequire\s*\(/);
    const exports = [...source.matchAll(/^export (?:interface|function) (\w+)/gm)].map(
      (match) => match[1],
    );
    assert.deepEqual(exports, [
      'ReturnStat',
      'returningLearners',
      'finishesConcept',
      'ActivationStat',
      'activationTime',
      'LearningMeasures',
      'MeasureRow',
      'measureRows',
      'learningMeasures',
    ]);
  });

  it('keeps the server function and the Status component wired to the module', () => {
    const functions = readFileSync(FUNCTIONS_FILE, 'utf8');
    assert.match(functions, /import\('@\/lib\/evidence\/measures'\)/);
    assert.match(
      functions,
      /learningMeasures\(events, created \? new Date\(created\)\.toISOString\(\) : null, new Date\(\)\)/,
    );
    const component = readFileSync(COMPONENT_FILE, 'utf8');
    assert.ok(
      component.includes("import { measureRows, type MeasureRow } from '@/lib/evidence/measures';"),
      'import line changed',
    );
    assert.match(component, /measureRows\(m\)/);
    assert.match(component, /\{r\.label\}/);
    assert.match(component, /\{r\.value\}/);
    assert.match(component, /Target: \{r\.target\}/);
  });

  it('does not copy the row wording into another path, and keeps the older assertions in place', () => {
    const literals = [
      'No due reviews answered yet',
      'Needs due reviews answered both ways',
      'Self-reports match quiz results',
      'No learner was active 8–14 days ago',
      'learned again in the last 7 days',
      'No concept finished yet',
      'the account’s start date is unknown',
      'after the account was created',
      'Not recorded yet: starting and finishing a session is not logged',
      'No blind comparisons yet',
      'The answer that knew the learner was preferred',
    ];
    for (const file of sourceFiles(SRC_DIR)) {
      if (file === MEASURES_FILE) continue;
      const source = readFileSync(file, 'utf8');
      for (const literal of literals) {
        assert.ok(!source.includes(literal), `${relative(SRC_DIR, file)}: ${literal}`);
      }
    }
    const oldMeasures = readFileSync(OLD_MEASURES_TEST, 'utf8');
    assert.match(
      oldMeasures,
      /'counts learners active 8–14 days ago who learned again in the last 7 days'/,
    );
    assert.match(
      oldMeasures,
      /assert\.deepEqual\(returningLearners\(events, NOW\), \{ activeBefore: 2, returned: 1, rate: 0\.5 \}\);/,
    );
    assert.match(
      oldMeasures,
      /'The answer that knew the learner was preferred in 2 of 3 comparisons \(the other: 1, no difference: 0\)'/,
    );
    assert.equal(oldMeasures.trimEnd().split('\n').length, 111);
    const oldEvents = readFileSync(OLD_EVENTS_TEST, 'utf8');
    assert.match(oldEvents, /'counts only events answered while a review was due'/);
    assert.match(oldEvents, /'keeps the measures on the shared functions instead of a copy'/);
  });
});
