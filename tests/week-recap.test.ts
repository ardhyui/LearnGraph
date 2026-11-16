/**
 * Direct unit tests for "Your week" (`src/lib/evidence/week.ts`) and its wiring:
 * the recap card in the Today panel counts reviews, passed quizzes and concepts
 * started in the last seven days from the append-only event log.
 *
 * The helper is pure (node:test, no PGlite or DOM); the static guards keep the
 * server function scoped to the signed-in account and the panel on that one
 * server function, without a new RPC method, table or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { weekRecap, weekRecapLines, type WeekRecap } from '../src/lib/evidence/week.ts';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'src');
const WEEK_FILE = join(SRC_DIR, 'lib', 'evidence', 'week.ts');
const FUNCTIONS_FILE = join(SRC_DIR, 'server', 'evidence.functions.ts');
const COMPONENT_FILE = join(SRC_DIR, 'components', 'StudyToday.tsx');

const DAY = 86_400_000;
const NOW = new Date('2026-11-16T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const ago = (days: number) => iso(NOW.getTime() - days * DAY);

type WeekEvent = Parameters<typeof weekRecap>[0][number];

/** One event as the recap sees it. */
const ev = (over: Partial<WeekEvent> = {}): WeekEvent => ({
  conceptId: 'concept:fractions',
  kind: 'review',
  outcome: 'remembered',
  createdAt: ago(1),
  ...over,
});

const recap = (events: WeekEvent[]) => weekRecap(events, NOW);

describe('weekRecap: the seven-day window', () => {
  it('counts events from exactly seven days ago up to now, both ends included', () => {
    assert.deepEqual(recap([ev({ createdAt: ago(7) })]), {
      reviews: 1,
      quizzesPassed: 0,
      newConcepts: 1,
      active: true,
    });
    assert.equal(recap([ev({ createdAt: iso(NOW.getTime()) })]).reviews, 1);
    assert.equal(recap([ev({ createdAt: iso(NOW.getTime() - 7 * DAY + 1) })]).reviews, 1);
  });

  it('ignores events older than seven days, one millisecond past the edge too', () => {
    const old = ev({ createdAt: iso(NOW.getTime() - 7 * DAY - 1) });
    assert.deepEqual(recap([old]), {
      reviews: 0,
      quizzesPassed: 0,
      newConcepts: 0,
      active: false,
    });
  });

  it('ignores future and unparseable timestamps instead of throwing', () => {
    assert.equal(recap([ev({ createdAt: iso(NOW.getTime() + 1) })]).reviews, 0);
    assert.equal(recap([ev({ createdAt: iso(NOW.getTime() + 30 * DAY) })]).reviews, 0);
    assert.equal(recap([ev({ createdAt: 'not a date' })]).active, false);
    assert.equal(recap([ev({ createdAt: '' })]).active, false);
  });

  it('accepts `now` as an ISO string and gives the same counts', () => {
    const events = [ev(), ev({ kind: 'quiz', outcome: 'passed', conceptId: 'concept:decimals' })];
    assert.deepEqual(weekRecap(events, NOW.toISOString()), weekRecap(events, NOW));
  });

  it('is empty and inactive with no events', () => {
    assert.deepEqual(recap([]), { reviews: 0, quizzesPassed: 0, newConcepts: 0, active: false });
  });
});

describe('weekRecap: reviews and passed quizzes', () => {
  it('counts every review that was answered, remembered or not', () => {
    assert.equal(
      recap([
        ev({ outcome: 'remembered' }),
        ev({ outcome: 'forgot', conceptId: 'concept:decimals' }),
      ]).reviews,
      2,
    );
  });

  it('counts only passed quizzes, not failed ones', () => {
    assert.deepEqual(
      recap([
        ev({ kind: 'quiz', outcome: 'passed' }),
        ev({ kind: 'quiz', outcome: 'failed', conceptId: 'concept:decimals' }),
      ]),
      { reviews: 0, quizzesPassed: 1, newConcepts: 2, active: true },
    );
  });

  it('ignores other kinds for the two counts but still sees their concepts as new', () => {
    const kinds = ['study', 'practice', 'lesson', 'snooze', 'unsnooze', 'tutor'] as const;
    const events = kinds.map((kind, i) => ev({ kind, conceptId: `concept:k${i}` }));
    assert.deepEqual(recap(events), {
      reviews: 0,
      quizzesPassed: 0,
      newConcepts: 6,
      active: true,
    });
  });
});

describe('weekRecap: new concepts', () => {
  it('counts a concept once, however many events it has in the window', () => {
    const events = [
      ev({ kind: 'study', outcome: 'started' }),
      ev({ kind: 'quiz', outcome: 'failed' }),
      ev({ kind: 'quiz', outcome: 'passed' }),
    ];
    assert.deepEqual(recap(events), {
      reviews: 0,
      quizzesPassed: 1,
      newConcepts: 1,
      active: true,
    });
  });

  it('does not count a concept already touched before the window', () => {
    const old = ev({
      conceptId: 'concept:old',
      kind: 'study',
      outcome: 'started',
      createdAt: ago(10),
    });
    const fresh = [old, ev({ conceptId: 'concept:old', kind: 'review' })];
    assert.equal(recap(fresh).newConcepts, 0);
    assert.equal(recap(fresh).reviews, 1);
  });

  it('takes the earliest valid event per concept, so array order does not matter', () => {
    const events = [
      ev({ conceptId: 'concept:a', createdAt: ago(2) }),
      ev({ conceptId: 'concept:b', createdAt: ago(10) }),
      ev({ conceptId: 'concept:b', createdAt: ago(1) }),
      ev({ conceptId: 'concept:c', createdAt: ago(9) }),
      ev({ conceptId: 'concept:c', createdAt: ago(3) }),
      ev({ conceptId: 'concept:c', createdAt: ago(4) }),
    ];
    const forward = recap(events);
    const backward = recap([...events].reverse());
    assert.deepEqual(forward, backward);
    assert.deepEqual(forward, { reviews: 4, quizzesPassed: 0, newConcepts: 1, active: true });
  });

  it('does not count a concept whose only events are broken or in the future', () => {
    const events = [
      ev({ conceptId: 'concept:broken', createdAt: 'nope' }),
      ev({ conceptId: 'concept:future', createdAt: iso(NOW.getTime() + DAY) }),
    ];
    assert.deepEqual(recap(events), {
      reviews: 0,
      quizzesPassed: 0,
      newConcepts: 0,
      active: false,
    });
  });
});

describe('weekRecapLines', () => {
  const lines = (partial: Partial<WeekRecap>) =>
    weekRecapLines({ reviews: 0, quizzesPassed: 0, newConcepts: 0, active: true, ...partial });

  it('says one of each in the singular', () => {
    assert.deepEqual(lines({ reviews: 1 }), ['1 review completed']);
    assert.deepEqual(lines({ quizzesPassed: 1 }), ['1 quiz passed']);
    assert.deepEqual(lines({ newConcepts: 1 }), ['1 new concept']);
  });

  it('says more than one in the plural', () => {
    assert.deepEqual(lines({ reviews: 3 }), ['3 reviews completed']);
    assert.deepEqual(lines({ quizzesPassed: 2 }), ['2 quizzes passed']);
    assert.deepEqual(lines({ newConcepts: 4 }), ['4 new concepts']);
  });

  it('keeps the order reviews, quizzes, new concepts and skips zero rows', () => {
    assert.deepEqual(lines({ reviews: 2, quizzesPassed: 1, newConcepts: 6 }), [
      '2 reviews completed',
      '1 quiz passed',
      '6 new concepts',
    ]);
    assert.deepEqual(lines({ quizzesPassed: 1 }), ['1 quiz passed']);
    assert.deepEqual(lines({}), []);
  });
});

describe('wiring guards (static)', () => {
  const source = (file: string) => readFileSync(file, 'utf8');

  it('keeps week.ts pure, type-only and with the two public helpers', () => {
    const week = source(WEEK_FILE);
    const imports = week.match(/^import\b.*$/gm) ?? [];
    assert.deepEqual(imports, ["import type { LearningEvent } from './events.ts';"]);
    assert.equal(/require\(/.test(week), false);
    assert.equal(/from 'react'|from '@\//.test(week), false);
    assert.match(week, /export function weekRecap\(/);
    assert.match(week, /export function weekRecapLines\(/);
    assert.match(week, /export interface WeekRecap/);
  });

  it('reads the event log through one account-scoped server function', () => {
    const functions = source(FUNCTIONS_FILE);
    const start = functions.indexOf('export const getWeekRecap');
    assert.ok(start >= 0, 'getWeekRecap is exported');
    const block = functions.slice(start, functions.indexOf('/** The roadmap', start));
    assert.match(block, /createServerFn\(\{ method: 'GET' \}\)/);
    assert.match(block, /middleware\(\[authMiddleware\]\)/);
    assert.match(block, /validator\(z\.object\(\{ learnerId: lookupId \}\)\)/);
    assert.match(block, /import\('@\/lib\/evidence\/week'\)/);
    assert.match(
      block,
      /service\.listEvents\(db, context\.userId, \{ learnerId: data\.learnerId \}\)/,
    );
    assert.match(block, /weekRecap\(events, new Date\(\)\.toISOString\(\)\)/);
  });

  it('shows the recap in the Today panel without a server function of its own', () => {
    const today = source(COMPONENT_FILE);
    assert.ok(
      today.includes("import { weekRecapLines, type WeekRecap } from '@/lib/evidence/week';"),
    );
    assert.ok(today.includes('getWeekRecap'));
    assert.ok(today.includes('getWeekRecap({ data: { learnerId } })'));
    assert.match(today, /\{current && <WeekRecapCard recap=\{current\.week\} \/>\}/);
    assert.match(today, />\s*Your week\s*</);
    assert.ok(today.includes('Nothing yet this week — your first review will show up here.'));
    assert.equal(/createServerFn/.test(today), false);
    assert.equal(/graphCall/.test(today), false);
  });
});
