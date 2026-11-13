/**
 * Learner-facing wording on Gap Analysis / Recommendations: names instead of
 * internal concept ids, plain "due" phrases, everyday labels.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {
  conceptLabel,
  conceptNameMap,
  conceptNames,
  countLabel,
  daysUntil,
  dueLabel,
  humanizeConceptId,
  learnFirstLabel,
  missingPrereqReason,
  priorityLabel,
  stepTypeLabel,
} from '../src/lib/gaps.ts';

describe('concept labels', () => {
  it('prefers the concept name and never shows the raw id', () => {
    assert.equal(conceptLabel('concept:linear-equations', 'Linear Equations'), 'Linear Equations');
    assert.equal(conceptLabel('concept:linear-equations', '  '), 'Linear equations');
    assert.equal(conceptLabel('concept:linear-equations', null), 'Linear equations');
    assert.equal(humanizeConceptId('concept:pre_algebra'), 'Pre algebra');
    assert.equal(humanizeConceptId('my-topic'), 'My topic');
    assert.equal(humanizeConceptId(''), 'Untitled concept');
  });

  it('strips control/format characters from names', () => {
    assert.equal(conceptLabel('x', '\u202eFractions\u0000'), 'Fractions');
  });

  it('maps ids to names with a readable fallback for unknown ids', () => {
    const names = conceptNameMap([
      { conceptId: 'concept:fractions', name: 'Fractions' },
      { conceptId: 'concept:decimals', name: '' },
      { conceptId: 'concept:fractions', name: 'Duplicate' },
    ]);
    assert.equal(names.get('concept:fractions'), 'Fractions');
    assert.equal(names.get('concept:decimals'), 'Decimals');
    assert.deepEqual(conceptNames(['concept:fractions', 'concept:unknown-one'], names), ['Fractions', 'Unknown one']);
  });

  it('summarizes what to learn first', () => {
    const names = conceptNameMap([
      { conceptId: 'a', name: 'Alpha' },
      { conceptId: 'b', name: 'Beta' },
      { conceptId: 'c', name: 'Gamma' },
      { conceptId: 'd', name: 'Delta' },
      { conceptId: 'e', name: 'Epsilon' },
    ]);
    assert.equal(learnFirstLabel([], names), '');
    assert.equal(learnFirstLabel(['a'], names), 'Learn first: Alpha');
    assert.equal(learnFirstLabel(['a', 'b', 'c', 'd', 'e'], names), 'Learn first: Alpha, Beta, Gamma and 2 more');
  });
});

describe('too-hard reason wording', () => {
  it('lists names, at most three, and keeps the true total as a number', () => {
    assert.equal(missingPrereqReason(1, ['Fractions']), 'Missing 1 prerequisite(s): Fractions');
    assert.equal(
      missingPrereqReason(2, ['Fractions', 'Decimals']),
      'Missing 2 prerequisite(s): Fractions, Decimals',
    );
    assert.equal(
      missingPrereqReason(3, ['Fractions', 'Decimals', 'Percents']),
      'Missing 3 prerequisite(s): Fractions, Decimals, Percents',
    );
    assert.equal(
      missingPrereqReason(4, ['Fractions', 'Decimals', 'Percents', 'Ratios']),
      'Missing 4 prerequisite(s): Fractions, Decimals, Percents...',
    );
  });

  it('never leaves a dangling colon when nothing is missing', () => {
    assert.equal(missingPrereqReason(0, []), 'Missing 0 prerequisite(s)');
  });

  it('works with the id→name lookup, including fallbacks and long names', () => {
    const names = conceptNameMap([
      { conceptId: 'concept:fractions', name: 'Fractions' },
      { conceptId: 'concept:no-name', name: '   ' },
      {
        conceptId: 'concept:long-one',
        name: 'Advanced Modelling Of Systems With Many Interdependent Parts',
      },
    ]);
    assert.equal(
      missingPrereqReason(4, conceptNames(['concept:fractions', 'concept:no-name', 'concept:long-one', 'concept:x-fourth'], names)),
      'Missing 4 prerequisite(s): Fractions, No name, Advanced Modelling Of Systems With Many Interdependent Parts...',
    );
  });
});

describe('review due phrases', () => {
  const now = new Date(2026, 10, 2, 17, 0); // 2 Nov 2026, 17:00 local
  it('counts calendar days, not 24h blocks', () => {
    assert.equal(daysUntil(new Date(2026, 10, 2, 1, 0), now), 0);
    assert.equal(daysUntil(new Date(2026, 10, 3, 0, 30), now), 1);
    assert.equal(daysUntil(new Date(2026, 9, 31, 23, 0), now), -2);
    assert.equal(daysUntil('not a date', now), null);
  });

  it('reads like a person would say it', () => {
    assert.equal(dueLabel(new Date(2026, 10, 2, 9), now), 'Due today');
    assert.equal(dueLabel(new Date(2026, 10, 3, 9), now), 'Due tomorrow');
    assert.equal(dueLabel(new Date(2026, 10, 7, 9), now), 'Due in 5 days');
    assert.equal(dueLabel(new Date(2026, 10, 1, 9), now), 'Overdue by 1 day');
    assert.equal(dueLabel(new Date(2024, 10, 2, 9), now), 'Overdue by 730 days');
    assert.equal(dueLabel('', now), 'Review date unknown');
  });
});

describe('everyday labels for engine values', () => {
  it('translates priorities and step types, with safe fallbacks', () => {
    assert.equal(priorityLabel('urgent'), 'Review first');
    assert.equal(priorityLabel('low'), 'Can wait');
    assert.equal(priorityLabel('weird'), 'Review');
    assert.equal(stepTypeLabel('correct_misconception'), 'Fix a mix-up');
    assert.equal(stepTypeLabel('relearn'), 'Practice more');
    assert.equal(stepTypeLabel('other'), 'Study');
    assert.equal(countLabel(1, 'review'), '1 review');
    assert.equal(countLabel(3, 'review'), '3 reviews');
  });
});

describe('pages use names, not raw concept ids', () => {
  it('gaps and recommendations never render conceptId as text', () => {
    for (const file of ['src/routes/gaps.tsx', 'src/routes/recommendations.tsx']) {
      const src = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(src, />\s*\{\s*(gap|item|step)\.conceptId\s*\}/, `${file} renders a raw conceptId`);
      assert.doesNotMatch(src, /missingPrerequisites\.slice\(0, 3\)\.join/, `${file} joins raw prerequisite ids`);
      assert.doesNotMatch(src, /Computed in/, `${file} shows debug timing`);
    }
  });
});
