/**
 * Direct unit tests for the daily learning streak (`src/lib/evidence/streak.ts`)
 * and its wiring: the "Your week" card in the Today panel now also shows how
 * many UTC calendar days in a row the learner studied, read from the same
 * append-only event log.
 *
 * The helper is pure (node:test, no PGlite or DOM); the static guards keep the
 * server function on one account-scoped event read and the panel on that one
 * server function, without a new RPC method, table or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { learningStreak, streakLine } from '../src/lib/evidence/streak.ts';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'src');
const STREAK_FILE = join(SRC_DIR, 'lib', 'evidence', 'streak.ts');
const FUNCTIONS_FILE = join(SRC_DIR, 'server', 'evidence.functions.ts');
const COMPONENT_FILE = join(SRC_DIR, 'components', 'StudyToday.tsx');

const NOW = new Date('2026-11-16T12:00:00.000Z');
const TODAY_START = '2026-11-16T00:00:00.000Z';
const YESTERDAY_END = '2026-11-15T23:59:59.999Z';
const YESTERDAY = '2026-11-15T12:00:00.000Z';
const TWO_DAYS = '2026-11-14T12:00:00.000Z';
const THREE_DAYS = '2026-11-13T12:00:00.000Z';
const FIVE_DAYS = '2026-11-11T12:00:00.000Z';

type StreakEvent = Parameters<typeof learningStreak>[0][number];

/** One event as the streak sees it: a review today unless overridden. */
const ev = (over: Partial<StreakEvent> = {}): StreakEvent => ({
  kind: 'review',
  createdAt: NOW.toISOString(),
  ...over,
});

const streak = (events: StreakEvent[], now: string | Date = NOW) => learningStreak(events, now);

describe('learningStreak: UTC day boundaries', () => {
  it('treats 23:59:59.999 and 00:00:00.000 as different days', () => {
    assert.deepEqual(streak([ev({ createdAt: YESTERDAY_END })]), {
      days: 1,
      activeToday: false,
    });
    assert.deepEqual(streak([ev({ createdAt: TODAY_START })]), { days: 1, activeToday: true });
  });

  it('ignores a future timestamp later the same day', () => {
    assert.deepEqual(streak([ev({ createdAt: '2026-11-16T23:00:00.000Z' })]), {
      days: 0,
      activeToday: false,
    });
    assert.deepEqual(
      streak([
        ev({ createdAt: '2026-11-16T23:00:00.000Z' }),
        ev({ createdAt: '2026-11-16T09:00:00.000Z' }),
      ]),
      { days: 1, activeToday: true },
    );
  });
});

describe('learningStreak: counting consecutive days', () => {
  it('counts today and the days before it', () => {
    assert.deepEqual(streak([ev(), ev({ createdAt: YESTERDAY })]), {
      days: 2,
      activeToday: true,
    });
    assert.deepEqual(
      streak([
        ev({ createdAt: TODAY_START }),
        ev({ createdAt: YESTERDAY }),
        ev({ createdAt: TWO_DAYS }),
        ev({ createdAt: THREE_DAYS }),
      ]),
      { days: 4, activeToday: true },
    );
  });

  it('stops at a one-day gap', () => {
    assert.deepEqual(streak([ev(), ev({ createdAt: TWO_DAYS })]), {
      days: 1,
      activeToday: true,
    });
    assert.deepEqual(streak([ev(), ev({ createdAt: YESTERDAY }), ev({ createdAt: THREE_DAYS })]), {
      days: 2,
      activeToday: true,
    });
  });

  it('keeps a streak alive from yesterday and says it is not active today', () => {
    assert.deepEqual(streak([ev({ createdAt: YESTERDAY })]), { days: 1, activeToday: false });
    assert.deepEqual(streak([ev({ createdAt: YESTERDAY }), ev({ createdAt: TWO_DAYS })]), {
      days: 2,
      activeToday: false,
    });
  });

  it('gives no streak when the last study day was two days ago', () => {
    assert.deepEqual(streak([ev({ createdAt: TWO_DAYS })]), { days: 0, activeToday: false });
    assert.deepEqual(streak([ev({ createdAt: FIVE_DAYS })]), { days: 0, activeToday: false });
  });
});

describe('learningStreak: which events count', () => {
  it('counts the five study kinds', () => {
    for (const kind of ['quiz', 'study', 'review', 'practice', 'lesson'] as const) {
      assert.deepEqual(streak([ev({ kind })]), { days: 1, activeToday: true });
    }
  });

  it('does not let snoozes or tutor ratings keep a streak alive', () => {
    for (const kind of ['snooze', 'unsnooze', 'tutor'] as const) {
      assert.deepEqual(streak([ev({ kind })]), { days: 0, activeToday: false });
      assert.deepEqual(streak([ev({ kind, createdAt: YESTERDAY })]), {
        days: 0,
        activeToday: false,
      });
    }
    assert.deepEqual(
      streak([ev(), ev({ kind: 'snooze', createdAt: YESTERDAY }), ev({ kind: 'tutor' })]),
      { days: 1, activeToday: true },
    );
  });

  it('ignores broken and future timestamps instead of throwing', () => {
    assert.deepEqual(streak([ev({ createdAt: 'not a date' })]), {
      days: 0,
      activeToday: false,
    });
    assert.deepEqual(streak([ev({ createdAt: '' })]), { days: 0, activeToday: false });
    assert.deepEqual(streak([ev({ createdAt: '2026-11-17T12:00:00.000Z' })]), {
      days: 0,
      activeToday: false,
    });
    assert.deepEqual(streak([ev({ createdAt: 'nope' }), ev({ createdAt: YESTERDAY })]), {
      days: 1,
      activeToday: false,
    });
  });
});

describe('learningStreak: duplicates, order and empty input', () => {
  it('counts a day once however many events it has', () => {
    assert.deepEqual(
      streak([
        ev({ createdAt: TODAY_START, kind: 'quiz' }),
        ev({ createdAt: '2026-11-16T06:00:00.000Z', kind: 'lesson' }),
        ev({ createdAt: '2026-11-16T18:00:00.000Z', kind: 'practice' }),
      ]),
      { days: 1, activeToday: true },
    );
  });

  it('gives the same answer whatever the array order', () => {
    const events = [
      ev({ createdAt: FIVE_DAYS }),
      ev({ createdAt: TWO_DAYS }),
      ev({ createdAt: TODAY_START }),
      ev({ createdAt: THREE_DAYS }),
      ev({ createdAt: YESTERDAY }),
    ];
    assert.deepEqual(streak(events), { days: 4, activeToday: true });
    assert.deepEqual(streak([...events].reverse()), streak(events));
  });

  it('accepts `now` as an ISO string and is empty without events', () => {
    const events = [ev(), ev({ createdAt: YESTERDAY })];
    assert.deepEqual(streak(events, NOW.toISOString()), streak(events));
    assert.deepEqual(streak([]), { days: 0, activeToday: false });
  });
});

describe('streakLine', () => {
  it('uses the singular and the plural', () => {
    assert.equal(streakLine({ days: 1, activeToday: true }), '1-day streak');
    assert.equal(streakLine({ days: 5, activeToday: true }), '5-day streak');
  });

  it('nudges when today has no study yet', () => {
    assert.equal(
      streakLine({ days: 1, activeToday: false }),
      '1-day streak — study today to keep it going',
    );
    assert.equal(
      streakLine({ days: 5, activeToday: false }),
      '5-day streak — study today to keep it going',
    );
  });

  it('has no line without a streak', () => {
    assert.equal(streakLine({ days: 0, activeToday: false }), null);
    assert.equal(streakLine({ days: 0, activeToday: true }), null);
    assert.equal(streakLine({ days: -1, activeToday: true }), null);
  });
});

describe('wiring guards (static)', () => {
  const source = (file: string) => readFileSync(file, 'utf8');

  it('keeps streak.ts pure, type-only and with the two public helpers', () => {
    const streakSrc = source(STREAK_FILE);
    const imports = streakSrc.match(/^import\b.*$/gm) ?? [];
    assert.deepEqual(imports, ["import type { LearningEvent } from './events.ts';"]);
    assert.equal(/require\(/.test(streakSrc), false);
    assert.equal(/from 'react'|from '@\//.test(streakSrc), false);
    assert.match(streakSrc, /export interface LearningStreak/);
    assert.match(streakSrc, /export function learningStreak\(/);
    assert.match(streakSrc, /export function streakLine\(/);
  });

  it('reads the event log once and passes the same `now` to both helpers', () => {
    const functions = source(FUNCTIONS_FILE);
    const start = functions.indexOf('export const getWeekRecap');
    assert.ok(start >= 0, 'getWeekRecap is exported');
    const block = functions.slice(start, functions.indexOf('/** The roadmap', start));
    assert.match(block, /createServerFn\(\{ method: 'GET' \}\)/);
    assert.match(block, /middleware\(\[authMiddleware\]\)/);
    assert.match(block, /validator\(z\.object\(\{ learnerId: lookupId \}\)\)/);
    assert.match(block, /import\('@\/lib\/evidence\/week'\)/);
    assert.match(block, /import\('@\/lib\/evidence\/streak'\)/);
    assert.equal(block.match(/service\.listEvents\(/g)?.length, 1);
    assert.match(block, /const now = new Date\(\)\.toISOString\(\);/);
    assert.match(block, /weekRecap\(events, now\)/);
    assert.match(block, /learningStreak\(events, now\)/);
    assert.match(block, /import\('@\/lib\/evidence\/last-lesson'\)/);
    assert.match(block, /\.\.\.weekRecap\(events, now\),/);
    assert.match(block, /streak: learningStreak\(events, now\),/);
    assert.ok(block.includes('lastLesson: lastLesson(events)'));
  });

  it('shows the streak in the same card without a server function of its own', () => {
    const today = source(COMPONENT_FILE);
    assert.ok(
      today.includes("import { streakLine, type LearningStreak } from '@/lib/evidence/streak';"),
    );
    assert.ok(
      today.includes(
        'week: WeekRecap & { streak: LearningStreak; lastLesson: LastLesson | null };',
      ),
    );
    assert.ok(today.includes('getWeekRecap({ data: { learnerId } })'));
    assert.match(today, /\{current && <WeekRecapCard week=\{current\.week\} \/>\}/);
    assert.match(today, />\s*Your week\s*</);
    assert.ok(today.includes('const lines = weekRecapLines(week);'));
    assert.ok(today.includes('const streak = streakLine(week.streak);'));
    assert.match(today, /data-testid="learning-streak"/);
    assert.ok(today.includes('Nothing yet this week — your first review will show up here.'));
    assert.equal(/createServerFn/.test(today), false);
    assert.equal(/graphCall/.test(today), false);
  });
});
