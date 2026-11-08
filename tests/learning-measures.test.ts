/**
 * The roadmap's measures of success ("Ukuran keberhasilan"), computed from a
 * workspace's own event log (src/lib/evidence/measures.ts).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  activationTime,
  finishesConcept,
  learningMeasures,
  measureRows,
  returningLearners,
} from '../src/lib/evidence/measures.ts';

const DAY = 86_400_000;
const NOW = new Date('2026-11-08T12:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

type E = { kind: string; outcome: string; learnerId: string; createdAt: string; wasDue?: boolean | null };
const ev = (learnerId: string, daysAgo: number, kind = 'quiz', outcome = 'passed', wasDue: boolean | null = null) =>
  ({ learnerId, kind, outcome, createdAt: ago(daysAgo), wasDue }) as E as Parameters<typeof returningLearners>[0][number];

describe('returning learners ("Kembali belajar")', () => {
  it('counts learners active 8–14 days ago who learned again in the last 7 days', () => {
    const events = [
      ev('ana', 10),
      ev('ana', 2, 'study', 'got-it'),
      ev('ben', 9, 'review', 'remembered'),
      // Postponing a review or asking the tutor is not learning.
      ev('ben', 1, 'snooze', 'snoozed'),
      ev('ben', 1, 'tutor', 'asked'),
      ev('cy', 3, 'lesson', 'opened'), // new this week: not part of the earlier week
      ev('dee', 20), // too long ago
    ];
    assert.deepEqual(returningLearners(events, NOW), { activeBefore: 2, returned: 1, rate: 0.5 });
  });

  it('puts exactly 7 days ago in the earlier week, and ignores future or broken dates', () => {
    const events = [ev('ana', 7), ev('ana', -1), { ...ev('ana', 1), createdAt: 'not a date' }];
    assert.deepEqual(returningLearners(events, NOW), { activeBefore: 1, returned: 0, rate: 0 });
    assert.deepEqual(returningLearners([], NOW), { activeBefore: 0, returned: 0, rate: null });
  });
});

describe('activation ("Aktivasi")', () => {
  it('is the time from creating the account to the first concept finished', () => {
    const created = ago(1);
    const at = (minutes: number) => new Date(Date.parse(created) + minutes * 60_000).toISOString();
    const events = [
      { ...ev('ana', 0, 'study', 'started'), createdAt: at(1) },
      { ...ev('ana', 0, 'quiz', 'failed'), createdAt: at(2) },
      { ...ev('ana', 0, 'quiz', 'passed'), createdAt: at(10) },
      { ...ev('ana', 0, 'study', 'got-it'), createdAt: at(3) },
    ];
    assert.deepEqual(activationTime(created, events), { firstFinishedAt: at(3), minutes: 3 });
    assert.deepEqual(activationTime(created, events.slice(0, 2)), { firstFinishedAt: null, minutes: null });
    assert.equal(activationTime(null, events).minutes, null);
    assert.equal(finishesConcept({ kind: 'review', outcome: 'remembered' }), false);
  });
});

describe('learning measures', () => {
  it('compares self-reports with quizzes in percentage points', () => {
    const events = [
      ev('ana', 1, 'quiz', 'passed', true),
      ev('ana', 1, 'quiz', 'failed', true),
      ev('ben', 1, 'review', 'remembered', true),
      ev('ben', 1, 'review', 'remembered', true),
      ev('ben', 1, 'review', 'remembered', true),
      ev('ben', 1, 'review', 'forgot', true),
      ev('ben', 1, 'quiz', 'passed', false), // not a due review
    ];
    const m = learningMeasures(events, ago(30), NOW);
    assert.equal(m.events, 7);
    assert.equal(m.retention.quiz.rate, 0.5);
    assert.equal(m.retention.selfReport.rate, 0.75);
    assert.equal(m.calibrationGap, 25);
    assert.equal(learningMeasures(events.slice(0, 2), null, NOW).calibrationGap, null);
  });

  it('reads as plain sentences, and says what cannot be measured yet', () => {
    const created = ago(2);
    const events = [
      { ...ev('ana', 0, 'quiz', 'passed', true), createdAt: new Date(Date.parse(created) + 4 * 60_000).toISOString() },
      ev('ana', 10, 'review', 'forgot', true),
      ev('ana', 1, 'tutor', 'prefer-context'),
      ev('ana', 1, 'tutor', 'prefer-plain'),
      ev('ana', 1, 'tutor', 'prefer-context'),
    ];
    const rows = measureRows(learningMeasures(events, created, NOW));
    assert.deepEqual(
      rows.map((r) => r.id),
      ['retention', 'calibration', 'returning', 'activation', 'session', 'personalisation'],
    );
    const value = (id: string) => rows.find((r) => r.id === id)?.value;
    assert.equal(value('retention'), 'Due reviews answered correctly: quizzes 100% of 1, self-reports 0% of 1');
    assert.equal(value('calibration'), 'Self-reports are 100 points lower than quiz results');
    assert.equal(value('returning'), '1 of 1 learner active 8–14 days ago learned again in the last 7 days (100%)');
    assert.equal(value('activation'), '4 minutes after the account was created');
    assert.match(value('session') ?? '', /^Not recorded yet/);
    assert.equal(
      value('personalisation'),
      'The answer that knew the learner was preferred in 2 of 3 comparisons (the other: 1, no difference: 0)',
    );
    assert.equal(rows.find((r) => r.id === 'activation')?.target, 'Under 5 minutes');

    const empty = measureRows(learningMeasures([], null, NOW));
    assert.equal(empty.find((r) => r.id === 'activation')?.value, 'No concept finished yet');
    assert.equal(empty.find((r) => r.id === 'retention')?.value, 'No due reviews answered yet');
  });
});
