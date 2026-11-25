/**
 * Direct unit tests for "Your week" (`src/lib/evidence/week.ts`) and its wiring:
 * the recap card in the Today panel counts reviews, passed quizzes and concepts
 * started in the last seven days from the append-only event log, and links the
 * concepts worked on most in that same window.
 *
 * The helpers are pure (node:test, no PGlite or DOM); the static guards keep the
 * server function scoped to the signed-in account and the panel on that one
 * server function, without a new RPC method, table or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { weekRecap, weekRecapLines, weekFocus, type WeekRecap } from '../src/lib/evidence/week.ts';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'src');
const WEEK_FILE = join(SRC_DIR, 'lib', 'evidence', 'week.ts');
const FUNCTIONS_FILE = join(SRC_DIR, 'server', 'evidence.functions.ts');
const COMPONENT_FILE = join(SRC_DIR, 'components', 'StudyToday.tsx');
const MIGRATIONS_FILE = join(SRC_DIR, 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(SRC_DIR, 'lib', 'graph', 'rpc-schemas.ts');

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

describe('weekFocus: the concepts worked on most', () => {
  it('uses the same rolling seven days as weekRecap, both ends included', () => {
    const events = [
      ev({ conceptId: 'concept:edge', createdAt: ago(7) }), // exactly seven days ago
      ev({ conceptId: 'concept:edge', createdAt: iso(NOW.getTime()) }), // exactly now
      ev({ conceptId: 'concept:too-old', createdAt: iso(NOW.getTime() - 7 * DAY - 1) }),
      ev({ conceptId: 'concept:too-new', createdAt: iso(NOW.getTime() + 1) }),
    ];
    assert.deepEqual(weekFocus(events, NOW), [{ conceptId: 'concept:edge', count: 2 }]);
  });

  it('counts every study kind, whatever the outcome, and no other kind', () => {
    const events = [
      ev({ kind: 'snooze', outcome: 'snoozed', conceptId: 'concept:a' }),
      ev({ kind: 'unsnooze', outcome: 'unsnooze', conceptId: 'concept:a' }),
      ev({ kind: 'tutor', outcome: 'prefer-context', conceptId: 'concept:a' }),
      ev({ kind: 'quiz', outcome: 'failed', conceptId: 'concept:b' }),
      ev({ kind: 'study', outcome: 'started', conceptId: 'concept:b' }),
      ev({ kind: 'review', outcome: 'forgot', conceptId: 'concept:c' }),
      ev({ kind: 'practice', outcome: 'logged', conceptId: 'concept:c' }),
      ev({ kind: 'lesson', outcome: 'opened', conceptId: 'concept:d' }),
    ];
    assert.deepEqual(weekFocus(events, NOW), [
      { conceptId: 'concept:b', count: 2 },
      { conceptId: 'concept:c', count: 2 },
      { conceptId: 'concept:d', count: 1 },
    ]);
  });

  it('orders by count and breaks ties by conceptId', () => {
    const events = [
      ev({ conceptId: 'concept:zeta' }),
      ev({ conceptId: 'concept:alpha' }),
      ev({ conceptId: 'concept:beta' }),
      ev({ conceptId: 'concept:beta' }),
      ev({ conceptId: 'concept:zeta' }),
    ];
    assert.deepEqual(weekFocus(events, NOW), [
      { conceptId: 'concept:beta', count: 2 },
      { conceptId: 'concept:zeta', count: 2 },
      { conceptId: 'concept:alpha', count: 1 },
    ]);
  });

  it('defaults to three concepts and accepts a custom or non-positive limit', () => {
    const events = ['a', 'b', 'c', 'd'].map((letter) => ev({ conceptId: `concept:${letter}` }));
    assert.equal(weekFocus(events, NOW).length, 3);
    assert.deepEqual(
      weekFocus(events, NOW, 2).map((row) => row.conceptId),
      ['concept:a', 'concept:b'],
    );
    assert.deepEqual(weekFocus(events, NOW, 0), []);
    assert.deepEqual(weekFocus(events, NOW, -1), []);
  });

  it('ignores future and unparseable timestamps instead of throwing', () => {
    assert.deepEqual(
      weekFocus(
        [
          ev({ conceptId: 'concept:future', createdAt: iso(NOW.getTime() + 1) }),
          ev({ conceptId: 'concept:future', createdAt: iso(NOW.getTime() + 30 * DAY) }),
          ev({ conceptId: 'concept:broken', createdAt: 'not a date' }),
          ev({ conceptId: 'concept:broken', createdAt: '' }),
        ],
        NOW,
      ),
      [],
    );
  });

  it('accepts `now` as an ISO string and returns the same rows', () => {
    const events = [ev(), ev({ conceptId: 'concept:decimals', createdAt: ago(2) })];
    assert.deepEqual(weekFocus(events, NOW.toISOString()), weekFocus(events, NOW));
  });

  it('is empty with no events, and with an invalid now', () => {
    assert.deepEqual(weekFocus([], NOW), []);
    assert.deepEqual(weekFocus([ev()], 'not a date'), []);
    assert.deepEqual(weekFocus([ev()], ''), []);
  });
});

describe('wiring guards (static)', () => {
  const source = (file: string) => readFileSync(file, 'utf8');

  it('keeps week.ts pure with the three public helpers', () => {
    const week = source(WEEK_FILE);
    const imports = week.match(/^import\b.*$/gm) ?? [];
    assert.deepEqual(imports, [
      "import type { LearningEvent } from './events.ts';",
      "import { weeklyFocus, type WeeklyFocusConcept } from './progress.ts';",
    ]);
    assert.equal(/require\(/.test(week), false);
    assert.equal(/from 'react'|from '@\//.test(week), false);
    assert.match(week, /export function weekRecap\(/);
    assert.match(week, /export function weekRecapLines\(/);
    assert.match(week, /export interface WeekRecap/);
    assert.match(week, /export function weekFocus\(/);
  });

  it('derives the focus from weeklyFocus over the recap window, not a new engine', () => {
    const week = source(WEEK_FILE);
    const block = week.slice(week.indexOf('export function weekFocus'));
    // The rolling window is `weekRecap`'s, and `now` is forwarded so the future
    // still does not count; `endsAt` is half-open, one millisecond past `now`.
    assert.match(
      block,
      /return weeklyFocus\(\s*events,\s*\{ startsAt: new Date\(t - 7 \* DAY\)\.toISOString\(\), endsAt: new Date\(t \+ 1\)\.toISOString\(\) \},\s*limit,\s*now,\s*\);/,
    );
    assert.match(block, /if \(!Number\.isFinite\(t\)\) return \[\];/);
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
    assert.match(block, /import\('@\/lib\/evidence\/last-lesson'\)/);
    assert.match(
      block,
      /service\.listEvents\(db, context\.userId, \{ learnerId: data\.learnerId \}\)/,
    );
    assert.equal(block.match(/service\.listEvents\(/g)?.length, 1);
    assert.match(block, /const now = new Date\(\)\.toISOString\(\);/);
    assert.match(block, /weekRecap\(events, now\)/);
    // The focus comes from the same single event-log read, not a new query.
    assert.match(block, /\{ weekRecap, weekFocus \}/);
    assert.match(block, /focus: weekFocus\(events, now\)/);
    assert.ok(block.includes('lastLesson: lastLesson(events)'));
  });

  it('shows the recap in the Today panel without a server function of its own', () => {
    const today = source(COMPONENT_FILE);
    assert.ok(
      today.includes("import { weekRecapLines, type WeekRecap } from '@/lib/evidence/week';"),
    );
    assert.ok(today.includes('getWeekRecap'));
    assert.ok(today.includes('getWeekRecap({ data: { learnerId } })'));
    assert.match(today, /\{current && <WeekRecapCard week=\{current\.week\} concepts=\{current\.concepts\} \/>\}/);
    assert.match(today, />\s*Your week\s*</);
    assert.ok(today.includes('Nothing yet this week — your first review will show up here.'));
    assert.equal(/createServerFn/.test(today), false);
    assert.equal(/graphCall/.test(today), false);
    assert.equal(/db\.listEvents/.test(today), false);
  });

  it('adds the Most reviewed row after the recap rows and before the streak', () => {
    const today = source(COMPONENT_FILE);
    const cardStart = today.indexOf('function WeekRecapCard(');
    assert.ok(cardStart >= 0, 'WeekRecapCard is still defined');
    const cardEnd = today.indexOf('\nfunction ', cardStart + 1);
    const card = today.slice(cardStart, cardEnd === -1 ? undefined : cardEnd);
    assert.equal((today.match(/Most reviewed this week/g) ?? []).length, 1);
    const label = card.indexOf('Most reviewed this week');
    assert.ok(card.indexOf('<ul') < label, 'the row follows the recap rows');
    assert.ok(card.indexOf('Nothing yet this week') < label, 'the row follows the empty state');
    assert.ok(
      card.indexOf('data-testid="learning-streak"') > label,
      'the row precedes the streak line',
    );
    assert.ok(card.includes('{focus.length > 0 && ('));
  });

  it('names chips from the concepts already loaded and skips unknown ones', () => {
    const today = source(COMPONENT_FILE);
    const cardStart = today.indexOf('function WeekRecapCard(');
    const cardEnd = today.indexOf('\nfunction ', cardStart + 1);
    const card = today.slice(cardStart, cardEnd === -1 ? undefined : cardEnd);
    assert.ok(card.includes('const names = conceptNameMap(concepts);'));
    assert.match(card, /const focus = week\.focus\.flatMap\(\(concept\) => \{/);
    assert.ok(card.includes('return name ? [{ ...concept, name }] : [];'));
    // Same imports as the other learner pages, each still once.
    const gapsImport = today.match(/import \{[^}]*\} from '@\/lib\/gaps';/)?.[0] ?? '';
    assert.ok(gapsImport.includes('countLabel'));
    assert.ok(gapsImport.includes('conceptNameMap'));
    assert.ok(today.includes("import type { WeeklyFocusConcept } from '@/lib/evidence/progress';"));
    assert.equal((today.match(/from '@tanstack\/react-router'/g) ?? []).length, 1);
    assert.equal((today.match(/from 'lucide-react'/g) ?? []).length, 1);
  });

  it('links each busiest concept to its lesson with the agreed chip styling', () => {
    const today = source(COMPONENT_FILE);
    const cardStart = today.indexOf('function WeekRecapCard(');
    const cardEnd = today.indexOf('\nfunction ', cardStart + 1);
    const card = today.slice(cardStart, cardEnd === -1 ? undefined : cardEnd);
    const linkStart = card.indexOf('<Link');
    const linkEnd = card.indexOf('</Link>', linkStart);
    const linkBlock = linkStart >= 0 && linkEnd > linkStart ? card.slice(linkStart, linkEnd + '</Link>'.length) : '';
    const openTag = linkStart >= 0 ? card.slice(linkStart, card.indexOf('>', linkStart) + 1) : '';
    assert.ok(openTag.includes('to="/learn/$conceptId"'));
    assert.ok(openTag.includes('params={{ conceptId: concept.conceptId }}'));
    assert.ok(openTag.includes('key={concept.conceptId}'));
    assert.ok(
      openTag.includes(
        'className="inline-flex min-h-10 items-center gap-1 bg-primary/10 px-2 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"',
      ),
      'a 40px touch target with the /gaps chip styling',
    );
    assert.ok(linkBlock.includes('<BookOpen className="h-3 w-3" aria-hidden="true" />'));
    assert.ok(linkBlock.includes('{concept.name}'));
    assert.ok(linkBlock.includes('<span aria-hidden="true"> · {concept.count}</span>'));
    assert.match(
      linkBlock,
      /<span className="sr-only">\s*: \{concept\.name\}, reviewed \{countLabel\(concept\.count, 'time'\)\}\s*<\/span>/,
    );
    assert.equal((linkBlock.match(/<span className="sr-only">/g) ?? []).length, 1);
  });

  it('adds no live region, button, extra role or data path for the row', () => {
    const today = source(COMPONENT_FILE);
    const cardStart = today.indexOf('function WeekRecapCard(');
    const cardEnd = today.indexOf('\nfunction ', cardStart + 1);
    const card = today.slice(cardStart, cardEnd === -1 ? undefined : cardEnd);
    assert.equal(/aria-live/.test(card), false);
    assert.equal(/\.focus\(\)/.test(card), false);
    assert.equal(/tabIndex/.test(card), false);
    assert.equal(/role=/.test(card), false);
    assert.equal(/<button\b/.test(card), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Most reviewed this week'), false, `${file} gained copy`);
    }
  });
});
