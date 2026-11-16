/**
 * Direct unit tests for "Continue your last lesson" (`src/lib/evidence/last-lesson.ts`)
 * and its wiring: the Today panel links back to the concept the learner touched
 * most recently, using the event log the weekly recap already reads.
 *
 * The helper is pure (node:test, no PGlite or DOM); the static guards keep the
 * server function scoped to the signed-in account, reading the log once, and the
 * panel on ordinary lesson links — no new RPC method, table or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lastLesson } from '../src/lib/evidence/last-lesson.ts';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'src');
const LAST_LESSON_FILE = join(SRC_DIR, 'lib', 'evidence', 'last-lesson.ts');
const FUNCTIONS_FILE = join(SRC_DIR, 'server', 'evidence.functions.ts');
const COMPONENT_FILE = join(SRC_DIR, 'components', 'StudyToday.tsx');

const DAY = 86_400_000;
const NOW = new Date('2026-11-16T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const ago = (days: number) => iso(NOW.getTime() - days * DAY);

type LessonEvent = Parameters<typeof lastLesson>[0][number];

/** One event as the helper sees it. */
const ev = (over: Partial<LessonEvent> = {}): LessonEvent => ({
  kind: 'study',
  conceptId: 'concept:fractions',
  source: 'app',
  createdAt: ago(1),
  ...over,
});

describe('lastLesson: which events count', () => {
  it('counts study, quiz, practice and lesson events', () => {
    for (const kind of ['study', 'quiz', 'practice', 'lesson'] as const) {
      assert.deepEqual(lastLesson([ev({ kind })]), {
        conceptId: 'concept:fractions',
        at: ago(1),
      });
    }
  });

  it('ignores reviews, snoozes and tutor comparisons, which do not open a lesson', () => {
    for (const kind of ['review', 'snooze', 'unsnooze', 'tutor'] as const) {
      assert.equal(lastLesson([ev({ kind })]), null);
    }
  });

  it('skips events written by the Japanese practice page', () => {
    assert.equal(lastLesson([ev({ source: 'japanese' })]), null);
    assert.deepEqual(
      lastLesson([
        ev({ source: 'japanese', conceptId: 'concept:japanese', createdAt: ago(0) }),
        ev({ source: 'app', conceptId: 'concept:fractions', createdAt: ago(2) }),
      ]),
      { conceptId: 'concept:fractions', at: ago(2) },
    );
  });

  it('skips events without a concept id and returns null for an empty log', () => {
    assert.equal(lastLesson([ev({ conceptId: '' })]), null);
    assert.equal(lastLesson([]), null);
  });
});

describe('lastLesson: the most recent one', () => {
  it('takes the latest valid event, whatever order the rows arrive in', () => {
    const events = [
      ev({ conceptId: 'concept:old', createdAt: ago(5) }),
      ev({ conceptId: 'concept:new', createdAt: ago(1) }),
      ev({ conceptId: 'concept:middle', createdAt: ago(3) }),
    ];
    const expected = { conceptId: 'concept:new', at: ago(1) };
    assert.deepEqual(lastLesson(events), expected);
    assert.deepEqual(lastLesson([...events].reverse()), expected);
  });

  it('keeps the event’s own ISO timestamp unchanged', () => {
    const at = '2026-11-15T08:30:00.123Z';
    assert.deepEqual(lastLesson([ev({ createdAt: at })]), {
      conceptId: 'concept:fractions',
      at,
    });
  });

  it('breaks a tie with the last occurrence in the array', () => {
    const at = ago(1);
    const a = ev({ conceptId: 'concept:a', createdAt: at });
    const b = ev({ conceptId: 'concept:b', createdAt: at });
    assert.equal(lastLesson([a, b])?.conceptId, 'concept:b');
    assert.equal(lastLesson([b, a])?.conceptId, 'concept:a');
  });

  it('ignores broken timestamps instead of throwing', () => {
    assert.equal(lastLesson([ev({ createdAt: 'not a date' })]), null);
    assert.equal(lastLesson([ev({ createdAt: '' })]), null);
    assert.deepEqual(
      lastLesson([
        ev({ conceptId: 'concept:broken', createdAt: 'nope' }),
        ev({ conceptId: 'concept:sound', createdAt: ago(4) }),
      ]),
      { conceptId: 'concept:sound', at: ago(4) },
    );
  });
});

describe('wiring guards (static)', () => {
  const source = (file: string) => readFileSync(file, 'utf8');

  it('keeps last-lesson.ts pure, type-only and with the one public helper', () => {
    const helper = source(LAST_LESSON_FILE);
    const imports = helper.match(/^import\b.*$/gm) ?? [];
    assert.deepEqual(imports, ["import type { LearningEvent } from './events.ts';"]);
    assert.equal(/require\(/.test(helper), false);
    assert.equal(/from 'react'|from '@\//.test(helper), false);
    assert.match(helper, /export interface LastLesson/);
    assert.match(helper, /export function lastLesson\(/);
  });

  it('reads the log once in getWeekRecap and returns the helper’s result', () => {
    const functions = source(FUNCTIONS_FILE);
    const start = functions.indexOf('export const getWeekRecap');
    assert.ok(start >= 0, 'getWeekRecap is exported');
    const block = functions.slice(start, functions.indexOf('/** The roadmap', start));
    assert.match(block, /createServerFn\(\{ method: 'GET' \}\)/);
    assert.match(block, /middleware\(\[authMiddleware\]\)/);
    assert.match(block, /validator\(z\.object\(\{ learnerId: lookupId \}\)\)/);
    assert.match(block, /import\('@\/lib\/evidence\/last-lesson'\)/);
    assert.equal(block.match(/service\.listEvents\(/g)?.length, 1);
    assert.match(
      block,
      /service\.listEvents\(db, context\.userId, \{ learnerId: data\.learnerId \}\)/,
    );
    assert.ok(block.includes('lastLesson: lastLesson(events)'));
  });

  it('links to the lesson from the Today panel without a server function of its own', () => {
    const today = source(COMPONENT_FILE);
    assert.ok(today.includes("import type { LastLesson } from '@/lib/evidence/last-lesson';"));
    assert.ok(today.includes('lastLesson: LastLesson | null'));
    assert.match(today, /\{current && current\.week\.lastLesson && \(/);
    assert.ok(
      today.includes(
        '<ContinueLastLesson concepts={current.concepts} lastLesson={current.week.lastLesson} />',
      ),
    );
    assert.ok(today.includes('Continue your last lesson'));
    assert.ok(today.includes('conceptNameMap(concepts).get(lastLesson.conceptId)'));
    assert.ok(today.includes('if (!name) return null;'));
    assert.match(today, /to="\/learn\/\$conceptId"/);
    assert.match(today, /className="mt-1 inline-flex min-h-10/);
    assert.match(today, /focus-visible:ring-2 focus-visible:ring-primary/);
    assert.equal(/createServerFn/.test(today), false);
    assert.equal(/graphCall/.test(today), false);
    const card = today.slice(today.indexOf('function ContinueLastLesson'));
    assert.equal(/localStorage|createServerFn|graphCall/.test(card), false);
  });
});
