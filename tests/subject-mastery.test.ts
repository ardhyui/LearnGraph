/**
 * Direct unit tests for "Mastery by subject" on My Profile
 * (`src/lib/subject-mastery.ts`) and its wiring. The row helper is pure
 * (node:test, no PGlite or DOM): the profile card passes the concepts and
 * knowledge states it already loads, so the rows add up to the overall
 * progress line and no extra read is made.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { subjectMastery } from '../src/lib/subject-mastery.ts';
import { masteredLine } from '../src/lib/profile.ts';
import { summarizeProgress } from '../src/lib/study.ts';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'src');
const HELPER_FILE = join(SRC_DIR, 'lib', 'subject-mastery.ts');
const COMPONENT_FILE = join(SRC_DIR, 'components', 'LearningOverview.tsx');

const concept = (conceptId: string, domain: string) => ({ conceptId, domain });
const state = (conceptId: string, mastery: number, userId = 'me-ada') => ({
  conceptId,
  mastery,
  userId,
});

describe('subjectMastery: totals and the mastery rule', () => {
  it('counts mastered and total per subject like summarizeProgress', () => {
    const concepts = [
      concept('a', 'mathematics'),
      concept('b', 'mathematics'),
      concept('c', 'computer-science'),
    ];
    const states = [state('a', 80), state('b', 79), state('c', 100)];
    const rows = subjectMastery(concepts, states);
    assert.deepEqual(
      rows.map((r) => [r.domain, r.total, r.mastered, r.percent]),
      [
        ['computer-science', 1, 1, 100],
        ['mathematics', 2, 1, 50],
      ],
    );

    const overall = summarizeProgress(concepts, states);
    assert.equal(
      rows.reduce((n, r) => n + r.total, 0),
      overall.total,
    );
    assert.equal(
      rows.reduce((n, r) => n + r.mastered, 0),
      overall.mastered,
    );
    assert.equal(
      rows.reduce((n, r) => n + (r.total - r.mastered), 0),
      overall.learning + overall.notStarted,
    );
  });

  it('uses the 80 mastery threshold, clamps out-of-range values and ignores NaN', () => {
    const concepts = [
      concept('below', 'mathematics'),
      concept('at', 'mathematics'),
      concept('above', 'mathematics'),
      concept('negative', 'mathematics'),
      concept('nan', 'mathematics'),
      concept('missing', 'mathematics'),
    ];
    const states = [
      state('below', 79),
      state('at', 80),
      state('above', 200),
      state('negative', -10),
      state('nan', Number.NaN),
    ];
    const [row] = subjectMastery(concepts, states);
    assert.equal(row.total, 6);
    assert.equal(row.mastered, 2);
    assert.equal(row.percent, 33);
  });

  it('counts a concept without a knowledge state as not started', () => {
    const rows = subjectMastery([concept('a', 'art_history')], []);
    assert.deepEqual(rows, [
      { domain: 'art_history', label: 'Art history', total: 1, mastered: 0, percent: 0 },
    ]);
  });

  it('keeps the last state for a duplicated concept id, exactly like summarizeProgress', () => {
    const concepts = [concept('a', 'mathematics')];
    const rows = subjectMastery(concepts, [state('a', 100), state('a', 10)]);
    assert.equal(rows[0].mastered, 0);
    assert.equal(rows[0].percent, 0);
    assert.equal(summarizeProgress(concepts, [state('a', 100), state('a', 10)]).mastered, 0);
  });
});

describe('subjectMastery: which subjects are shown', () => {
  const concepts = [
    concept('a', 'mathematics'),
    concept('b', 'computer-science'),
    concept('c', 'art_history'),
  ];

  it('shows only the chosen subjects, in the learner’s order', () => {
    const rows = subjectMastery(concepts, [], ['computer-science', 'mathematics']);
    assert.deepEqual(
      rows.map((r) => [r.domain, r.label]),
      [
        ['computer-science', 'Computer science'],
        ['mathematics', 'Mathematics'],
      ],
    );
  });

  it('does not show subjects outside the chosen ones', () => {
    const rows = subjectMastery(concepts, [], ['mathematics']);
    assert.deepEqual(
      rows.map((r) => r.label),
      ['Mathematics'],
    );
  });

  it('shows every subject with concepts when there is no focus, sorted by label', () => {
    const rows = subjectMastery(concepts, []);
    assert.deepEqual(
      rows.map((r) => r.label),
      ['Art history', 'Computer science', 'Mathematics'],
    );
  });

  it('drops chosen subjects without concepts instead of showing an empty row', () => {
    const rows = subjectMastery(concepts, [], ['physics', 'mathematics']);
    assert.deepEqual(
      rows.map((r) => r.domain),
      ['mathematics'],
    );
    assert.deepEqual(subjectMastery(concepts, [], ['physics']), []);
  });

  it('does not repeat a subject chosen twice and skips concepts without a domain', () => {
    const rows = subjectMastery(
      [concept('a', 'mathematics'), concept('b', 'mathematics'), concept('c', '')],
      [],
      ['mathematics', 'mathematics'],
    );
    assert.deepEqual(
      rows.map((r) => [r.domain, r.total]),
      [['mathematics', 2]],
    );
  });
});

describe('subjectMastery: knowledge states', () => {
  it('ignores states for concepts that are not there or not in the subject', () => {
    const rows = subjectMastery(
      [concept('a', 'mathematics')],
      [state('gone', 100), state('b', 100)],
    );
    assert.equal(rows[0].total, 1);
    assert.equal(rows[0].mastered, 0);
  });

  it('never counts another learner’s states into these rows', () => {
    const concepts = [concept('a', 'mathematics'), concept('b', 'mathematics')];
    const states = [state('a', 100, 'me-ada'), state('b', 100, 'me-budi')];
    const mine = subjectMastery(concepts, states, [], 'me-ada');
    assert.equal(mine[0].mastered, 1);
    assert.equal(mine[0].percent, 50);
    assert.equal(subjectMastery(concepts, states, [], 'me-budi')[0].mastered, 1);
    assert.equal(subjectMastery(concepts, states, [], 'nobody')[0].mastered, 0);
  });
});

describe('subjectMastery: percentages', () => {
  it('rounds to 0, 50, 67 and 100 and never returns NaN', () => {
    const cases: [number, number][] = [
      [0, 2],
      [1, 2],
      [2, 3],
      [1, 1],
    ];
    for (const [mastered, total] of cases) {
      const concepts = Array.from({ length: total }, (_, i) => concept(`c${i}`, 'mathematics'));
      const states = concepts.slice(0, mastered).map((c) => state(c.conceptId, 90));
      const [row] = subjectMastery(concepts, states);
      assert.equal(row.percent, Math.round((mastered / total) * 100));
      assert.equal(Number.isFinite(row.percent), true);
    }
    assert.deepEqual(subjectMastery([], []), []);
  });

  it('has correct singular and plural mastery lines', () => {
    assert.equal(masteredLine({ mastered: 1, total: 1 }), '1 of 1 concept mastered');
    assert.equal(masteredLine({ mastered: 0, total: 2 }), '0 of 2 concepts mastered');
    assert.equal(masteredLine({ mastered: 2, total: 3 }), '2 of 3 concepts mastered');

    const rows = subjectMastery(
      [
        concept('a', 'mathematics'),
        concept('b', 'computer-science'),
        concept('c', 'computer-science'),
      ],
      [state('b', 100)],
    );
    assert.deepEqual(
      rows.map((row) => masteredLine(row)),
      ['1 of 2 concepts mastered', '0 of 1 concept mastered'],
    );
  });
});

describe('wiring guards (static)', () => {
  const source = (file: string) => readFileSync(file, 'utf8');

  it('keeps subject-mastery.ts pure and reuses the study/onboarding helpers', () => {
    const helper = source(HELPER_FILE);
    const imports = helper.match(/^import\b.*$/gm) ?? [];
    assert.deepEqual(imports, [
      "import type { ConceptNode, KnowledgeState } from './graph/types.ts';",
      "import { domainLabel } from './onboarding.ts';",
      "import { summarizeProgress } from './study.ts';",
    ]);
    assert.equal(/require\(/.test(helper), false);
    assert.equal(/from 'react'|from '@\//.test(helper), false);
    assert.equal(/MASTERED_AT\s*=/.test(helper), false);
    assert.match(helper, /const progress = summarizeProgress\(group, ownStates\);/);
    assert.match(helper, /percent: progress\.percentMastered,/);
    assert.match(helper, /export function subjectMastery\(/);
  });

  it('renders the card on the already-loaded data with a labelled progress bar', () => {
    const page = source(COMPONENT_FILE);
    assert.ok(
      page.includes(
        "import { subjectMastery, type SubjectMasteryRow } from '@/lib/subject-mastery';",
      ),
    );
    assert.ok(page.includes('mastery: subjectMastery(concepts, states, subjects, learnerId),'));
    assert.ok(page.includes('{current.mastery.length > 0 && ('));
    assert.ok(page.includes('<ul aria-label="Mastery by subject"'));
    assert.ok(page.includes('role="progressbar"'));
    assert.ok(page.includes('aria-valuenow={row.percent}'));
    assert.ok(page.includes('{masteredLine(row)}'));
    assert.equal(/createServerFn/.test(page), false);
    assert.equal(/graphCall/.test(page), false);
    assert.equal(/db\.(listConcepts|getLearnerKnowledgeStates|getReviewQueue)\(/.test(page), true);
  });

  it('the list adds no link, button, animation or second read', () => {
    const page = source(COMPONENT_FILE);
    const start = page.indexOf('<ul aria-label="Mastery by subject"');
    const end = page.indexOf('</ul>', start);
    assert.ok(start > 0 && end > start);
    const list = page.slice(start, end);
    assert.equal(/<Link|<button|motion\./.test(list), false);
    assert.equal(/subjectMastery\(/.test(list), false);
  });

  it('does not add a migration or a new RPC method for the subject card', () => {
    const migrations = source(join(SRC_DIR, 'lib', 'migrations.ts'));
    const schemas = source(join(SRC_DIR, 'lib', 'graph', 'rpc-schemas.ts'));
    assert.equal(/subject.?mastery|Mastery by subject/i.test(migrations), false);
    assert.equal(/subject.?mastery|Mastery by subject/i.test(schemas), false);
  });
});
