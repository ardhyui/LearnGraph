/**
 * Progress bars in My Profile announce the mastered counts, not a bare percent.
 *
 * `LearningOverview` renders two `role="progressbar"` bars: one for all chosen
 * subjects and one per subject. Screen readers only heard the raw percentage
 * (and the per-subject denominator was never spoken), even though the visible
 * lines right above each bar already say "3 of 10 concepts mastered". Each bar
 * now carries `aria-valuetext` built from the same `masteredLine` helper as the
 * visible line, so the announced text cannot drift from what is on screen.
 *
 * The page is locked statically: exactly two progress bars, both with the
 * exact `aria-valuetext` expression, all old attributes/classes/widths intact,
 * `masteredLine` still driving the visible lines (no copied sentence), and no
 * new read, server function, RPC or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const COMPONENT_FILE = join(ROOT, 'src', 'components', 'LearningOverview.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');
const SMOKE_FILE = join(ROOT, 'scripts', 'smoke.mjs');

const source = (file: string) => readFileSync(file, 'utf8');

const component = source(COMPONENT_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The opening `<div …>` tag of a progress bar, found by its aria-label. */
const barOpenTag = (label: string) => {
  const at = component.indexOf(label);
  assert.ok(at > 0, `${label} exists`);
  const open = component.lastIndexOf('<div', at);
  return component.slice(open, component.indexOf('>', at) + 1);
};

const overallBar = barOpenTag('aria-label="Concepts mastered"');
const subjectBar = barOpenTag('aria-label={`${row.label} mastery`}');

describe('profile progress bars: one valued bar each', () => {
  it('keeps exactly two progress bars', () => {
    assert.equal(count(component, /role="progressbar"/g), 2);
    assert.equal(count(component, /aria-valuetext=/g), 2);
  });

  it('announces the overall mastered count from the same helper as the visible line', () => {
    assert.match(overallBar, /role="progressbar"/);
    assert.ok(overallBar.includes('aria-valuetext={masteredLine(current.progress)}'));
  });

  it('announces each subject’s mastered count, denominator included', () => {
    assert.match(subjectBar, /role="progressbar"/);
    assert.ok(subjectBar.includes('aria-valuetext={masteredLine(row)}'));
  });
});

describe('profile progress bars: existing contract unchanged', () => {
  it('keeps the overall bar’s label, range, value, class and width', () => {
    for (const attribute of [
      'aria-label="Concepts mastered"',
      'aria-valuemin={0}',
      'aria-valuemax={100}',
      'aria-valuenow={current.progress.percentMastered}',
      'className="mt-2 h-2 overflow-hidden rounded-full bg-primary/10"',
    ]) {
      assert.ok(overallBar.includes(attribute), attribute);
    }
    assert.ok(
      component.includes('style={{ width: `${current.progress.percentMastered}%` }}'),
      'overall width still follows the percent',
    );
  });

  it('keeps the subject bar’s label, range, value, class and width', () => {
    for (const attribute of [
      'aria-label={`${row.label} mastery`}',
      'aria-valuemin={0}',
      'aria-valuemax={100}',
      'aria-valuenow={row.percent}',
      'className="mt-1 h-1.5 overflow-hidden rounded-full bg-primary/10"',
    ]) {
      assert.ok(subjectBar.includes(attribute), attribute);
    }
    assert.ok(
      component.includes('style={{ width: `${row.percent}%` }}'),
      'subject width still follows the percent',
    );
  });

  it('keeps the three number cards and the subject list in order', () => {
    const labels = [
      'Learning',
      'Not started',
      'To review',
      'Mastery by subject',
      'aria-label="Mastery by subject"',
    ];
    const positions = labels.map((label) => component.indexOf(label));
    for (let i = 0; i < positions.length; i += 1) {
      assert.ok(positions[i] > 0, `${labels[i]} remains visible`);
      if (i > 0) assert.ok(positions[i] > positions[i - 1], `${labels[i]} keeps its order`);
    }
    assert.equal(count(component, /<dl\b/g), 1);
    assert.equal(count(component, /<li key=\{row\.domain\}>/g), 1);
  });
});

describe('profile progress bars: no copied sentence', () => {
  it('still builds both visible mastery lines with masteredLine', () => {
    assert.ok(
      component.includes('{masteredLine(current.progress)}'),
      'the profile-mastered line uses the helper',
    );
    assert.ok(component.includes('{masteredLine(row)}'), 'the per-subject line uses the helper');
    assert.equal(count(component, /concepts mastered/gi), 1, 'only the aria-label mentions it');
  });

  it('does not write a mastered sentence of its own', () => {
    assert.doesNotMatch(component, /\bconcepts? mastered\b(?!")/);
    assert.doesNotMatch(component, /\$\{[^}]*\}\s+of\s+\$\{[^}]*\}/);
  });
});

describe('profile progress bars: no new data path', () => {
  it('adds no server function, RPC call or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(component), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('aria-valuetext'), false, `${file} gained bar markup`);
    }
  });

  it('keeps the smoke check that compares announced and visible counts', () => {
    const smoke = source(SMOKE_FILE);
    assert.ok(smoke.includes("card\n      .getByRole('progressbar')"));
    assert.ok(smoke.includes('valuetexts[0] === mastered'));
    assert.ok(
      smoke.includes("'profile: progress bars announce the mastered counts to screen readers'"),
    );
  });
});
