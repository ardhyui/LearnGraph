/**
 * Direct unit tests for the "Today's session" planner `src/lib/session.ts`.
 *
 * The module is pure: reviews come first, then lessons, fitted into the
 * learner's time, with breaks paced by the profile. Its behaviour was only
 * covered indirectly by three tests in `tests/learn-in-app.test.ts`, so this
 * file imports it directly (node:test, no PGlite or DOM) and locks the
 * constants, `sessionPacing`, `lessonSitting` and every fit/skip/break rule of
 * `buildSessionPlan`. The module is not changed by this file: the rough edge
 * `minutes: NaN` is locked as the actual behaviour (every item fits, because
 * comparisons with NaN are always false), not fixed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_LESSON_MINUTES,
  MIN_LESSON_MINUTES,
  REVIEW_MINUTES,
  SESSION_LENGTHS,
  buildSessionPlan,
  lessonSitting,
  sessionPacing,
} from '../src/lib/session.ts';

const SESSION_FILE = join(import.meta.dirname, '..', 'src', 'lib', 'session.ts');
const STUDY_TODAY_FILE = join(import.meta.dirname, '..', 'src', 'components', 'StudyToday.tsx');
const LEARN_IN_APP_FILE = join(import.meta.dirname, '..', 'tests', 'learn-in-app.test.ts');

const review = (id: string) => ({ conceptId: id, name: id });
const lesson = (id: string, minutes?: number | null) => ({ conceptId: id, name: id, minutes });
const ids = (steps: { kind: string; conceptId?: string }[]) =>
  steps.map((step) => (step.kind === 'break' ? 'break' : step.conceptId));

describe('session constants', () => {
  it('keeps the review and lesson bounds and the offered session lengths', () => {
    assert.equal(REVIEW_MINUTES, 3);
    assert.equal(MIN_LESSON_MINUTES, 5);
    assert.equal(MAX_LESSON_MINUTES, 20);
    // An explicit copy: reordering or dropping a choice must show up in the diff.
    assert.deepEqual([...SESSION_LENGTHS], [15, 30, 45, 60]);
  });
});

describe('sessionPacing', () => {
  it('derives the focus block from the attention span, defaulting to medium', () => {
    assert.deepEqual(sessionPacing('short', 'structured'), { focusMinutes: 15, breakMinutes: 5 });
    assert.deepEqual(sessionPacing('medium', 'self-paced'), { focusMinutes: 25, breakMinutes: 5 });
    assert.deepEqual(sessionPacing('long', 'structured'), { focusMinutes: 40, breakMinutes: 5 });
    assert.deepEqual(sessionPacing(undefined, 'structured'), { focusMinutes: 25, breakMinutes: 5 });
    assert.deepEqual(sessionPacing(null, 'structured'), { focusMinutes: 25, breakMinutes: 5 });
    // A value outside the profile enum falls back to the medium block too.
    assert.deepEqual(sessionPacing('hour-long' as never), { focusMinutes: 25, breakMinutes: 5 });
    // Only "intensive" changes the break length; every other pace keeps 5.
    for (const pace of ['structured', 'self-paced'] as const) {
      assert.equal(sessionPacing('short', pace).breakMinutes, 5, pace);
    }
    assert.equal(sessionPacing('short', 'unknown' as never).breakMinutes, 5);
  });

  it('stretches the focus block and shortens breaks for an intensive pace', () => {
    assert.deepEqual(sessionPacing('short', 'intensive'), { focusMinutes: 23, breakMinutes: 3 });
    assert.deepEqual(sessionPacing('medium', 'intensive'), { focusMinutes: 38, breakMinutes: 3 });
    assert.deepEqual(sessionPacing('long', 'intensive'), { focusMinutes: 60, breakMinutes: 3 });
    assert.deepEqual(sessionPacing(undefined, 'intensive'), { focusMinutes: 38, breakMinutes: 3 });
  });
});

describe('lessonSitting', () => {
  it('caps a long estimate at one sitting and keeps in-range values', () => {
    assert.equal(lessonSitting(30), 20);
    assert.equal(lessonSitting(20), 20);
    assert.equal(lessonSitting(15), 15);
    assert.equal(lessonSitting(5), 5);
    assert.equal(lessonSitting(20.5), 20);
  });

  it('rounds to whole minutes and clamps to 5..20', () => {
    assert.equal(lessonSitting(7.5), 8);
    assert.equal(lessonSitting(4.6), 5);
    assert.equal(lessonSitting(0), 5);
    assert.equal(lessonSitting(-5), 5);
  });

  it('falls back to ten minutes for a missing or unusable estimate', () => {
    assert.equal(lessonSitting(null), 10);
    assert.equal(lessonSitting(undefined), 10);
    for (const value of [NaN, Infinity, -Infinity, '15' as never]) {
      assert.equal(lessonSitting(value), 10, String(value));
    }
  });
});

describe('buildSessionPlan', () => {
  it('plans due reviews (three minutes each) before new lessons', () => {
    const plan = buildSessionPlan({
      minutes: 45,
      reviews: [review('r1'), review('r2')],
      next: [lesson('n1', 10)],
      attentionSpan: 'long',
    });
    assert.deepEqual(ids(plan.steps), ['r1', 'r2', 'n1']);
    assert.deepEqual(
      plan.steps.map((step) => (step.kind === 'break' ? 0 : step.minutes)),
      [3, 3, 10],
    );
    assert.equal(plan.plannedMinutes, 16);
    assert.deepEqual(plan.left, { reviews: 0, next: 0 });
  });

  it('floors the available minutes before fitting steps', () => {
    // Ten reviews need 30 minutes; 29.9 is floored to 29, so the tenth stays out.
    const reviews = Array.from({ length: 10 }, (_, i) => review(`r${i}`));
    const floored = buildSessionPlan({ minutes: 29.9, reviews, next: [], attentionSpan: 'long' });
    assert.equal(floored.steps.length, 9);
    assert.equal(floored.plannedMinutes, 27);
    assert.deepEqual(floored.left, { reviews: 1, next: 0 });
    const exact = buildSessionPlan({ minutes: 30, reviews, next: [], attentionSpan: 'long' });
    assert.equal(exact.steps.length, 10);
    assert.equal(exact.plannedMinutes, 30);
    assert.deepEqual(exact.left, { reviews: 0, next: 0 });
  });

  it('treats a negative session length as zero but still plans the first item', () => {
    const plan = buildSessionPlan({ minutes: -5, reviews: [review('r1')], next: [lesson('n1', 20)] });
    assert.deepEqual(ids(plan.steps), ['r1']);
    assert.equal(plan.plannedMinutes, 3);
    assert.deepEqual(plan.left, { reviews: 0, next: 1 });
  });

  it('always plans the first item even when it exceeds the whole budget', () => {
    const plan = buildSessionPlan({ minutes: 0, reviews: [], next: [lesson('n1', 20), lesson('n2', 5)] });
    assert.deepEqual(ids(plan.steps), ['n1']);
    assert.equal(plan.steps[0].kind, 'learn');
    assert.equal(plan.plannedMinutes, 20);
    assert.deepEqual(plan.left, { reviews: 0, next: 1 });
  });

  it('skips items that do not fit without reordering, so a later shorter item still fits', () => {
    const plan = buildSessionPlan({
      minutes: 20,
      reviews: [review('r1'), review('r2')],
      next: [lesson('big', 20), lesson('small', 8)],
    });
    // "big" would need a break and overrun 20 minutes; "small" fits without one.
    assert.deepEqual(ids(plan.steps), ['r1', 'r2', 'small']);
    assert.equal(plan.plannedMinutes, 14);
    assert.deepEqual(plan.left, { reviews: 0, next: 1 });
  });

  it('counts the break when deciding whether the next step fits', () => {
    const almost = buildSessionPlan({
      minutes: 30,
      reviews: [review('r1'), review('r2')],
      next: [lesson('big', 20)],
    });
    // 6 min of reviews + a 5-minute break + 20 min = 31: one minute too many.
    assert.deepEqual(ids(almost.steps), ['r1', 'r2']);
    assert.deepEqual(almost.left, { reviews: 0, next: 1 });
    const fits = buildSessionPlan({
      minutes: 31,
      reviews: [review('r1'), review('r2')],
      next: [lesson('big', 20)],
    });
    assert.deepEqual(ids(fits.steps), ['r1', 'r2', 'break', 'big']);
    assert.equal(fits.plannedMinutes, 31);
    assert.deepEqual(fits.left, { reviews: 0, next: 0 });
  });

  it('inserts breaks only between steps, sized and spaced by the profile', () => {
    const plan = buildSessionPlan({
      minutes: 45,
      reviews: [review('r1'), review('r2'), review('r3')],
      next: [lesson('n1', 20), lesson('n2', 8)],
      attentionSpan: 'short',
    });
    // 9 minutes of reviews, then a break before the 20-minute lesson; n2 needs
    // another break that no longer fits in 45 minutes.
    assert.deepEqual(ids(plan.steps), ['r1', 'r2', 'r3', 'break', 'n1']);
    assert.notEqual(plan.steps[0].kind, 'break');
    assert.notEqual(plan.steps.at(-1)!.kind, 'break');
    const breakStep = plan.steps[3];
    assert.equal(breakStep.kind, 'break');
    assert.equal(breakStep.minutes, 5);
    assert.equal(plan.plannedMinutes, 34);
    assert.deepEqual(plan.left, { reviews: 0, next: 1 });
  });

  it('reports the planned total and the pacing that shaped the plan', () => {
    const plan = buildSessionPlan({
      minutes: 50,
      reviews: Array.from({ length: 7 }, (_, i) => review(`r${i}`)),
      next: [lesson('n1', 20)],
      attentionSpan: 'medium',
      pace: 'intensive',
    });
    assert.equal(plan.focusMinutes, 38);
    assert.equal(plan.breakMinutes, 3);
    assert.deepEqual(ids(plan.steps).slice(-2), ['break', 'n1']);
    assert.equal(plan.steps.at(-2)!.kind, 'break');
    assert.equal(plan.plannedMinutes, plan.steps.reduce((sum, step) => sum + step.minutes, 0));
    assert.equal(plan.plannedMinutes, 44);
    assert.deepEqual(plan.left, { reviews: 0, next: 0 });
  });

  it('counts what did not fit separately for reviews and lessons', () => {
    const plan = buildSessionPlan({
      minutes: 4,
      reviews: [review('r1'), review('r2'), review('r3')],
      next: [lesson('n1', 10)],
    });
    assert.deepEqual(ids(plan.steps), ['r1']);
    assert.deepEqual(plan.left, { reviews: 2, next: 1 });
    assert.equal(plan.plannedMinutes, 3);
  });

  it('returns an empty plan when there is nothing due and nothing new', () => {
    const plan = buildSessionPlan({ minutes: 30, reviews: [], next: [] });
    assert.deepEqual(plan.steps, []);
    assert.equal(plan.plannedMinutes, 0);
    assert.deepEqual(plan.left, { reviews: 0, next: 0 });
    assert.equal(plan.focusMinutes, 25);
    assert.equal(plan.breakMinutes, 5);
  });

  it('does not mutate the input lists', () => {
    const reviews = [review('r1'), review('r2')];
    const next = [lesson('n1', 30), lesson('n2', null)];
    const reviewCopy = structuredClone(reviews);
    const nextCopy = structuredClone(next);
    buildSessionPlan({ minutes: 45, reviews, next, attentionSpan: 'short' });
    assert.deepEqual(reviews, reviewCopy);
    assert.deepEqual(next, nextCopy);
  });

  it('rough edge: a NaN session length lets everything fit', () => {
    // Locked as the module's current behaviour: `used + cost > NaN` is always
    // false, so no item is skipped (breaks are still inserted normally).
    const plan = buildSessionPlan({
      minutes: NaN,
      reviews: [review('r1'), review('r2'), review('r3')],
      next: [lesson('n1', 20)],
    });
    assert.deepEqual(ids(plan.steps), ['r1', 'r2', 'r3', 'break', 'n1']);
    assert.equal(plan.plannedMinutes, 34);
    assert.deepEqual(plan.left, { reviews: 0, next: 0 });
  });
});

describe('source guards', () => {
  it('keeps session.ts type-only so it stays safe in the client bundle', () => {
    const source = readFileSync(SESSION_FILE, 'utf8');
    const imports = source.match(/^import\b.*$/gm) ?? [];
    assert.ok(imports.length > 0, 'expected at least the profile type import');
    for (const line of imports) assert.ok(line.startsWith('import type'), line);
  });

  it('keeps StudyToday wired to the planner and its shared constants', () => {
    const source = readFileSync(STUDY_TODAY_FILE, 'utf8');
    assert.match(
      source,
      /import \{ buildSessionPlan, SESSION_LENGTHS, REVIEW_MINUTES \} from '@\/lib\/session';/,
    );
    assert.match(source, /const plan = buildSessionPlan\(\{/);
    assert.match(source, /\{SESSION_LENGTHS\.map\(/);
    assert.match(source, /plan\.plannedMinutes/);
    assert.match(source, /REVIEW_MINUTES : 0/);
  });

  it('leaves the earlier integration tests in place', () => {
    const source = readFileSync(LEARN_IN_APP_FILE, 'utf8');
    assert.match(source, /import \{ buildSessionPlan, lessonSitting, sessionPacing \} from '\.\.\/src\/lib\/session\.ts';/);
    for (const title of [
      'puts due reviews before new lessons and fits the time available',
      'suggests breaks from attention span and pace',
      'always plans the first step, even when the session is shorter',
    ]) {
      assert.ok(source.includes(title), title);
    }
  });
});
