/**
 * Direct unit tests for the multi-week progress helpers
 * (`src/lib/evidence/progress.ts`) and their wiring: the `/progress` page reads
 * one learner's append-only event log and shows eight Monday-to-Sunday weeks,
 * due-review retention per week, the current streak and the best streak.
 *
 * The helpers are pure (node:test, no PGlite or DOM); the static guards keep the
 * server function scoped to the signed-in account and the page on that one
 * server function, without a new RPC method, table or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LearningEvent } from '../src/lib/evidence/events.ts';
import {
  bestStreak,
  retentionByWeek,
  retentionPercent,
  weekDetailLine,
  weekRangeLabel,
  weeklyBuckets,
  type WeeklyBucket,
} from '../src/lib/evidence/progress.ts';
import { NAV_SECTIONS } from '../src/lib/navigation.ts';
import { titleForPath } from '../src/lib/page-titles.ts';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'src');
const PROGRESS_FILE = join(SRC_DIR, 'lib', 'evidence', 'progress.ts');
const FUNCTIONS_FILE = join(SRC_DIR, 'server', 'evidence.functions.ts');
const ROUTE_FILE = join(SRC_DIR, 'routes', 'progress.tsx');

const NOW = new Date('2026-11-18T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();
// Monday 2026-11-16 00:00 UTC starts the current week in these tests.
const WEEK_START = '2026-11-16T00:00:00.000Z';
const WEEK_END = '2026-11-23T00:00:00.000Z';

/** One event as the helpers see it. */
const ev = (over: Partial<LearningEvent> = {}): LearningEvent => ({
  id: 1,
  learnerId: 'learner-1',
  conceptId: 'concept:fractions',
  kind: 'review',
  outcome: 'remembered',
  source: 'app',
  wasDue: true,
  correct: null,
  total: null,
  masteryBefore: null,
  masteryAfter: null,
  detail: {},
  createdAt: NOW_ISO,
  ...over,
});

const buckets = (events: LearningEvent[], now: string | Date = NOW, weeks = 8) =>
  weeklyBuckets(events, now, weeks);

const emptyBucket = (over: Partial<WeeklyBucket> = {}): WeeklyBucket => ({
  startsAt: WEEK_START,
  endsAt: WEEK_END,
  activeDays: 0,
  events: 0,
  reviewsDue: 0,
  reviewsCorrect: 0,
  quizzesPassed: 0,
  conceptsFinished: 0,
  lessonsOpened: 0,
  ...over,
});

describe('weeklyBuckets: eight Monday-to-Sunday weeks', () => {
  it('always returns eight weeks, oldest first, ending with the current week', () => {
    const rows = buckets([]);
    assert.equal(rows.length, 8);
    assert.equal(rows[0].startsAt, '2026-09-28T00:00:00.000Z');
    assert.equal(rows[0].endsAt, '2026-10-05T00:00:00.000Z');
    assert.equal(rows[7].startsAt, WEEK_START);
    assert.equal(rows[7].endsAt, WEEK_END);
    for (const row of rows) {
      assert.equal(Date.parse(row.endsAt) - Date.parse(row.startsAt), 7 * 86_400_000);
    }
  });

  it('keeps a requested number of weeks and still ends with the current one', () => {
    const rows = buckets([], NOW, 4);
    assert.equal(rows.length, 4);
    assert.equal(rows[0].startsAt, '2026-10-26T00:00:00.000Z');
    assert.equal(rows[3].startsAt, WEEK_START);
  });

  it('includes empty weeks between active ones', () => {
    const rows = buckets([
      ev({ createdAt: '2026-10-13T10:00:00.000Z' }),
      ev({ createdAt: '2026-11-17T10:00:00.000Z' }),
    ]);
    assert.deepEqual(
      rows.map((row) => row.events),
      [0, 0, 1, 0, 0, 0, 0, 1],
    );
  });

  it('puts an event exactly at Monday 00:00 UTC in the week that starts then', () => {
    const rows = buckets([
      ev({ createdAt: WEEK_START }),
      ev({ createdAt: '2026-11-15T23:59:59.999Z' }),
    ]);
    assert.equal(rows[7].events, 1);
    assert.equal(rows[6].events, 1);
  });

  it('includes an event exactly at now and ignores a later one', () => {
    const rows = buckets([
      ev({ createdAt: NOW_ISO }),
      ev({ createdAt: new Date(NOW.getTime() + 1).toISOString() }),
    ]);
    assert.equal(rows[7].events, 1);
  });

  it('ignores events just before the oldest week and broken timestamps', () => {
    const rows = buckets([
      ev({ createdAt: '2026-09-27T23:59:59.999Z' }),
      ev({ createdAt: 'not a date' }),
      ev({ createdAt: '' }),
    ]);
    assert.ok(rows.every((row) => row.events === 0));
  });

  it('accepts `now` as an ISO string and returns no bucket for an invalid one', () => {
    assert.deepEqual(buckets([ev()], NOW_ISO), buckets([ev()], NOW));
    assert.deepEqual(buckets([ev()], 'nope'), []);
  });

  it('returns no bucket for zero or negative weeks', () => {
    assert.deepEqual(buckets([ev()], NOW, 0), []);
    assert.deepEqual(buckets([ev()], NOW, -1), []);
  });
});

describe('weeklyBuckets: what a week counts', () => {
  const week = () =>
    buckets([
      ev({ createdAt: '2026-11-16T00:00:00.000Z' }),
      ev({
        kind: 'quiz',
        outcome: 'passed',
        wasDue: true,
        createdAt: '2026-11-17T09:00:00.000Z',
      }),
      ev({
        kind: 'quiz',
        outcome: 'failed',
        wasDue: true,
        createdAt: '2026-11-18T10:00:00.000Z',
      }),
      ev({ outcome: 'forgot', wasDue: false, createdAt: '2026-11-18T11:00:00.000Z' }),
      ev({
        kind: 'study',
        outcome: 'got-it',
        wasDue: false,
        conceptId: 'concept:decimals',
        createdAt: '2026-11-18T11:30:00.000Z',
      }),
      ev({
        kind: 'lesson',
        outcome: 'opened',
        wasDue: false,
        createdAt: '2026-11-18T11:45:00.000Z',
      }),
      ev({ kind: 'snooze', outcome: 'snoozed', wasDue: null, createdAt: '2026-11-17T09:00:00.000Z' }),
      ev({ kind: 'tutor', outcome: 'prefer-context', wasDue: null, createdAt: '2026-11-17T09:00:00.000Z' }),
    ])[7];

  it('counts activity, due reviews, quizzes, finished concepts and lessons', () => {
    assert.deepEqual(week(), {
      startsAt: WEEK_START,
      endsAt: WEEK_END,
      activeDays: 3,
      events: 8,
      reviewsDue: 3,
      reviewsCorrect: 2,
      quizzesPassed: 1,
      conceptsFinished: 2,
      lessonsOpened: 1,
    });
  });

  it('counts each UTC day once for active days', () => {
    const row = buckets([
      ev({ kind: 'review', createdAt: '2026-11-16T00:00:00.000Z' }),
      ev({ kind: 'quiz', outcome: 'failed', createdAt: '2026-11-16T23:59:59.999Z' }),
      ev({ kind: 'study', outcome: 'started', createdAt: '2026-11-17T00:00:00.000Z' }),
    ])[7];
    assert.equal(row.activeDays, 2);
  });

  it('does not let snoozes or tutor ratings count as an active day', () => {
    const row = buckets([
      ev({ kind: 'snooze', outcome: 'snoozed', wasDue: null, createdAt: '2026-11-17T09:00:00.000Z' }),
      ev({ kind: 'tutor', outcome: 'prefer-same', wasDue: null, createdAt: '2026-11-18T09:00:00.000Z' }),
    ])[7];
    assert.equal(row.activeDays, 0);
    assert.equal(row.events, 2);
  });

  it('counts only passed quizzes as passed and finished', () => {
    const row = buckets([ev({ kind: 'quiz', outcome: 'failed', wasDue: false })])[7];
    assert.equal(row.quizzesPassed, 0);
    assert.equal(row.conceptsFinished, 0);
  });

  it('counts a finished concept once, however many finish events it has', () => {
    const row = buckets([
      ev({ kind: 'quiz', outcome: 'passed', wasDue: false }),
      ev({ kind: 'study', outcome: 'got-it', wasDue: false }),
      ev({ kind: 'quiz', outcome: 'passed', wasDue: false, conceptId: 'concept:decimals' }),
    ])[7];
    assert.equal(row.conceptsFinished, 2);
    assert.equal(row.quizzesPassed, 2);
  });
});

describe('retentionByWeek: due reviews answered correctly', () => {
  it('returns one row per week, aligned with the weekly buckets', () => {
    const rows = retentionByWeek([], NOW);
    assert.equal(rows.length, 8);
    assert.deepEqual(
      rows.map((row) => row.startsAt),
      buckets([]).map((row) => row.startsAt),
    );
    assert.ok(rows.every((row) => row.rate === null && row.answered === 0));
  });

  it('combines quizzes and self-reports through dueReviewRetention', () => {
    const rows = retentionByWeek(
      [
        ev({ kind: 'quiz', outcome: 'passed', wasDue: true, createdAt: '2026-11-16T10:00:00.000Z' }),
        ev({ kind: 'review', outcome: 'forgot', wasDue: true, createdAt: '2026-11-17T10:00:00.000Z' }),
      ],
      NOW,
    );
    assert.deepEqual(rows[7], {
      startsAt: WEEK_START,
      endsAt: WEEK_END,
      answered: 2,
      correct: 1,
      rate: 0.5,
    });
  });

  it('stays null without a due review answered', () => {
    const rows = retentionByWeek(
      [
        ev({ kind: 'review', outcome: 'remembered', wasDue: false }),
        ev({ kind: 'study', outcome: 'started', wasDue: false }),
      ],
      NOW,
    );
    assert.equal(rows[7].answered, 0);
    assert.equal(rows[7].rate, null);
  });

  it('reports 0% when every due review was missed', () => {
    const rows = retentionByWeek(
      [ev({ kind: 'review', outcome: 'forgot', wasDue: true })],
      NOW,
    );
    assert.equal(rows[7].answered, 1);
    assert.equal(rows[7].correct, 0);
    assert.equal(rows[7].rate, 0);
  });

  it('keeps early and later weeks apart and ignores future answers', () => {
    const rows = retentionByWeek(
      [
        ev({ kind: 'review', outcome: 'remembered', wasDue: true, createdAt: '2026-10-13T10:00:00.000Z' }),
        ev({ kind: 'review', outcome: 'remembered', wasDue: true, createdAt: WEEK_START }),
        ev({ kind: 'review', outcome: 'forgot', wasDue: true, createdAt: '2026-11-19T10:00:00.000Z' }),
      ],
      NOW,
    );
    assert.equal(rows[2].rate, 1);
    assert.equal(rows[7].rate, 1);
    assert.equal(rows[7].answered, 1);
  });
});

describe('bestStreak: the longest run of study days', () => {
  const day = (isoDate: string) => ev({ createdAt: `${isoDate}T12:00:00.000Z` });

  it('returns the longest run, not only the current one', () => {
    const events = [
      // three days
      day('2026-11-01'),
      day('2026-11-02'),
      day('2026-11-03'),
      // five days: the best
      day('2026-11-10'),
      day('2026-11-11'),
      day('2026-11-12'),
      day('2026-11-13'),
      day('2026-11-14'),
      // current one-day streak
      day('2026-11-18'),
    ];
    assert.equal(bestStreak(events, NOW), 5);
  });

  it('counts a run across a week boundary as one streak', () => {
    const events = ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'].map(day);
    assert.equal(bestStreak(events, NOW), 5);
  });

  it('counts a day once however many events it has and ignores array order', () => {
    const events = [
      day('2026-11-17'),
      day('2026-11-16'),
      day('2026-11-18'),
      ev({ createdAt: '2026-11-17T08:00:00.000Z', kind: 'quiz', outcome: 'passed' }),
    ];
    assert.equal(bestStreak(events, NOW), 3);
    assert.equal(bestStreak([...events].reverse(), NOW), 3);
  });

  it('ignores snoozes and tutor ratings', () => {
    assert.equal(
      bestStreak(
        [
          ev({ kind: 'snooze', outcome: 'snoozed', wasDue: null, createdAt: '2026-11-16T10:00:00.000Z' }),
          ev({ kind: 'tutor', outcome: 'prefer-context', wasDue: null, createdAt: '2026-11-17T10:00:00.000Z' }),
        ],
        NOW,
      ),
      0,
    );
  });

  it('ignores broken and future timestamps and gives 0 without events', () => {
    const events = [
      day('2026-11-17'),
      day('2026-11-18'),
      day('2026-11-19'),
      ev({ createdAt: 'nope' }),
    ];
    assert.equal(bestStreak(events, NOW), 2);
    assert.equal(bestStreak([], NOW), 0);
  });

  it('accepts `now` as an ISO string', () => {
    const events = [day('2026-11-17'), day('2026-11-18')];
    assert.equal(bestStreak(events, NOW_ISO), bestStreak(events, NOW));
  });
});

describe('weekly labels and detail lines', () => {
  it('labels a Monday-to-Sunday week with its inclusive Sunday date', () => {
    assert.equal(weekRangeLabel(WEEK_START, WEEK_END), 'Nov 16 – Nov 22');
    assert.equal(
      weekRangeLabel('2026-11-30T00:00:00.000Z', '2026-12-07T00:00:00.000Z'),
      'Nov 30 – Dec 6',
    );
  });

  it('shows retention as a rounded percentage or an em dash', () => {
    assert.equal(retentionPercent(null), '—');
    assert.equal(retentionPercent(0), '0%');
    assert.equal(retentionPercent(0.5), '50%');
    assert.equal(retentionPercent(2 / 3), '67%');
    assert.equal(retentionPercent(1), '100%');
  });

  it('summarizes a week in plain words and skips zero-only rows', () => {
    assert.equal(weekDetailLine(emptyBucket()), '0 active days');
    assert.equal(
      weekDetailLine(
        emptyBucket({
          activeDays: 1,
          quizzesPassed: 1,
          conceptsFinished: 1,
          lessonsOpened: 1,
          reviewsDue: 1,
        }),
      ),
      '1 active day · 1 quiz passed · 1 concept finished · 1 lesson opened · 1 due review answered',
    );
    assert.equal(
      weekDetailLine(emptyBucket({ activeDays: 2, quizzesPassed: 3, conceptsFinished: 4 })),
      '2 active days · 3 quizzes passed · 4 concepts finished',
    );
  });
});

describe('wiring guards (static)', () => {
  const source = (file: string) => readFileSync(file, 'utf8');

  it('keeps progress.ts pure, with the public helpers the page uses', () => {
    const progress = source(PROGRESS_FILE);
    assert.equal(/require\(/.test(progress), false);
    assert.equal(/from 'react'|from '@\//.test(progress), false);
    assert.equal(/\bfetch\(/.test(progress), false);
    for (const name of [
      'weeklyBuckets',
      'retentionByWeek',
      'bestStreak',
      'weekRangeLabel',
      'retentionPercent',
      'weekDetailLine',
    ]) {
      assert.match(progress, new RegExp(`export function ${name}\\(`));
    }
  });

  it('reads the event log once through one account-scoped server function', () => {
    const functions = source(FUNCTIONS_FILE);
    const start = functions.indexOf('export const getLearnerProgress');
    assert.ok(start >= 0, 'getLearnerProgress is exported');
    const block = functions.slice(start);
    assert.match(block, /createServerFn\(\{ method: 'GET' \}\)/);
    assert.match(block, /middleware\(\[authMiddleware\]\)/);
    assert.match(block, /validator\(z\.object\(\{ learnerId: lookupId \}\)\)/);
    assert.match(block, /import\('@\/lib\/evidence\/progress'\)/);
    assert.match(block, /import\('@\/lib\/evidence\/streak'\)/);
    assert.equal(block.match(/service\.listEvents\(/g)?.length, 1);
    assert.match(
      block,
      /service\.listEvents\(db, context\.userId, \{ learnerId: data\.learnerId \}\)/,
    );
    assert.match(block, /const now = new Date\(\)\.toISOString\(\);/);
    assert.match(block, /weeklyBuckets\(events, now\)/);
    assert.match(block, /retentionByWeek\(events, now\)/);
    assert.match(block, /learningStreak\(events, now\)/);
    assert.match(block, /bestStreak\(events, now\)/);
  });

  it('shows the page for the active learner and handles the empty states', () => {
    const route = source(ROUTE_FILE);
    assert.ok(route.includes("head: () => pageHead('/progress')"));
    assert.ok(route.includes('getLearnerProgress'));
    assert.ok(route.includes('useActiveLearner'));
    assert.equal(route.match(/<h1\b/g)?.length, 1);
    assert.ok(route.includes('<h1 className="text-3xl font-bold text-foreground">Your progress</h1>'));
    assert.ok(route.includes('aria-label="Weekly progress"'));
    assert.ok(
      route.includes(
        'No activity recorded yet — finish a review or a quiz and it will show up here.',
      ),
    );
    assert.ok(route.includes('Current streak'));
    assert.ok(route.includes('Best streak'));
    assert.equal(/createServerFn/.test(route), false);
    assert.equal(/graphCall/.test(route), false);
    assert.equal(/from '@\/lib\/graph/.test(route), false);
  });

  it('lists Progress in the learner menu and gives it a tab title', () => {
    const learn = NAV_SECTIONS.find((section) => section.id === 'learn');
    assert.ok(learn);
    assert.deepEqual(learn.items.find((item) => item.href === '/progress'), {
      href: '/progress',
      label: 'Progress',
      description: 'How your learning is going',
      icon: 'chart',
    });
    assert.equal(titleForPath('/progress'), 'Progress · LearnGraph');
  });
});
