/**
 * Direct unit tests for the learner-facing evidence words
 * `src/lib/evidence/labels.ts`.
 *
 * The four helpers were only covered indirectly by one broad assertion in
 * `tests/learning-evidence.test.ts`. This file imports the module directly
 * (node:test, no PGlite or DOM) and locks the exact wording, the branch order
 * of `quizResultNotice`, the singular/plural retention noun, the rounding and
 * the rough edges. The module is not changed here: the tests pin its current
 * behaviour.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  evidenceMode,
  masterySourceLabel,
  quizResultNotice,
  retentionLine,
  type EvidenceMode,
} from '../src/lib/evidence/labels.ts';
import type { MasterySource } from '../src/lib/graph/types.ts';

const SRC_DIR = join(import.meta.dirname, '..', 'src');
const LABELS_FILE = join(SRC_DIR, 'lib', 'evidence', 'labels.ts');
const EVIDENCE_TEST_FILE = join(import.meta.dirname, 'learning-evidence.test.ts');

/** Every source the graph can store, in the order the switch handles them. */
const KNOWN_SOURCES: ReadonlyArray<[MasterySource, string]> = [
  ['quiz', 'From quizzes'],
  ['self_report', 'Self-reported'],
  ['manual', 'Set by hand'],
  ['practice', 'From practice notes'],
  ['sync', 'Synced from Michi'],
];

/** One graded quiz result; the helper reads `correct`, `total`, `passed`, `wasDue`, `masteryBefore`. */
const result = (
  overrides: Partial<{
    conceptName: string;
    correct: number;
    total: number;
    passed: boolean;
    wasDue: boolean;
    masteryBefore: number;
    mastery: number;
  }> = {},
) => ({
  conceptName: 'Fractions',
  correct: 3,
  total: 3,
  passed: true,
  wasDue: false,
  masteryBefore: 0,
  mastery: 85,
  ...overrides,
});

/** Every `.ts`/`.tsx` file under `src/`, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('masterySourceLabel', () => {
  it('names every known mastery source', () => {
    for (const [source, label] of KNOWN_SOURCES) {
      assert.equal(masterySourceLabel(source), label, source);
    }
  });

  it('falls back to "Not quiz-checked" for null, undefined and unknown sources', () => {
    assert.equal(masterySourceLabel(null), 'Not quiz-checked');
    assert.equal(masterySourceLabel(undefined), 'Not quiz-checked');
    // Rough edge kept as-is: an unexpected value from old data is not special-cased.
    assert.equal(masterySourceLabel('from-a-future-version' as MasterySource), 'Not quiz-checked');
  });
});

describe('evidenceMode', () => {
  it('shows a quiz whenever the concept has questions, required or not', () => {
    for (const evidenceRequired of [true, false, undefined]) {
      assert.equal(evidenceMode({ conceptId: 'a', evidenceRequired }, { a: 1 }), 'quiz');
      assert.equal(evidenceMode({ conceptId: 'a', evidenceRequired }, { a: 50 }), 'quiz');
    }
  });

  it('sends a required concept without its own questions to "elsewhere"', () => {
    assert.equal(evidenceMode({ conceptId: 'jp', evidenceRequired: true }, {}), 'elsewhere');
    assert.equal(evidenceMode({ conceptId: 'jp', evidenceRequired: true }, { jp: 0 }), 'elsewhere');
    // Another concept's bank is not this concept's evidence.
    assert.equal(evidenceMode({ conceptId: 'jp', evidenceRequired: true }, { other: 4 }), 'elsewhere');
  });

  it('falls back to "self-report" and ignores counts that are not positive', () => {
    const mode = (count: number | undefined): EvidenceMode =>
      evidenceMode({ conceptId: 'a' }, count === undefined ? {} : { a: count });
    assert.equal(evidenceMode({ conceptId: 'a' }, {}), 'self-report');
    assert.equal(evidenceMode({ conceptId: 'a', evidenceRequired: false }, {}), 'self-report');
    assert.equal(evidenceMode({ conceptId: 'a', evidenceRequired: false }, { a: 3 }), 'quiz');
    // Rough edge kept as-is: a negative count is not > 0, so the required branch wins.
    assert.equal(evidenceMode({ conceptId: 'a', evidenceRequired: true }, { a: -1 }), 'elsewhere');
    assert.equal(mode(-1), 'self-report');
    assert.equal(mode(0), 'self-report');
    assert.equal(mode(undefined), 'self-report');
  });
});

describe('quizResultNotice', () => {
  it('always reports a failed quiz as not passed yet', () => {
    assert.equal(
      quizResultNotice(result({ correct: 1, total: 4, passed: false })),
      '1 of 4 correct — not passed yet. “Fractions” stays in your plan: read the explanations and try again later.',
    );
    // `wasDue` and a high prior mastery do not change a failed result.
    assert.equal(
      quizResultNotice(
        result({ conceptName: 'Hiragana', correct: 2, total: 3, passed: false, wasDue: true, masteryBefore: 95 }),
      ),
      '2 of 3 correct — not passed yet. “Hiragana” stays in your plan: read the explanations and try again later.',
    );
  });

  it('reports a passed due review as coming back after a longer break', () => {
    assert.equal(
      quizResultNotice(result({ wasDue: true })),
      '3 of 3 correct — passed! “Fractions” will come back after a longer break.',
    );
    // The due branch wins over the `masteryBefore >= 80` branch.
    assert.equal(
      quizResultNotice(result({ conceptName: 'Fractions', wasDue: true, masteryBefore: 90 })),
      '3 of 3 correct — passed! “Fractions” will come back after a longer break.',
    );
  });

  it('keeps the review date when a high-mastery concept is not due', () => {
    for (const masteryBefore of [80, 85, 100]) {
      assert.equal(
        quizResultNotice(result({ masteryBefore })),
        '3 of 3 correct — passed. “Fractions” keeps its review date.',
        String(masteryBefore),
      );
    }
  });

  it('calls a below-80, not-due pass mastered with a short review tomorrow', () => {
    for (const masteryBefore of [0, 79, 79.9]) {
      assert.equal(
        quizResultNotice(result({ masteryBefore })),
        '3 of 3 correct — passed! “Fractions” is mastered. A short review quiz comes back tomorrow.',
        String(masteryBefore),
      );
    }
    // The score and the concept name are copied verbatim.
    assert.equal(
      quizResultNotice(result({ conceptName: 'Linear Equations', correct: 5, total: 6, masteryBefore: 40 })),
      '5 of 6 correct — passed! “Linear Equations” is mastered. A short review quiz comes back tomorrow.',
    );
  });
});

describe('retentionLine', () => {
  it('uses the singular noun for one answer and the plural otherwise', () => {
    assert.equal(
      retentionLine({ answered: 1, correct: 1, rate: 1 }),
      '1 of 1 due review answered correctly (100%)',
    );
    assert.equal(
      retentionLine({ answered: 4, correct: 3, rate: 0.75 }),
      '3 of 4 due reviews answered correctly (75%)',
    );
    assert.equal(
      retentionLine({ answered: 2, correct: 0, rate: 0 }),
      '0 of 2 due reviews answered correctly (0%)',
    );
  });

  it('returns null with nothing answered or no rate', () => {
    assert.equal(retentionLine({ answered: 0, correct: 0, rate: null }), null);
    // Rough edge kept as-is: `!stat.answered` wins even when a rate was supplied.
    assert.equal(retentionLine({ answered: 0, correct: 0, rate: 0 }), null);
    assert.equal(retentionLine({ answered: 7, correct: 7, rate: null }), null);
  });

  it('rounds the percentage and does not clamp a rough rate', () => {
    assert.equal(
      retentionLine({ answered: 3, correct: 2, rate: 2 / 3 }),
      '2 of 3 due reviews answered correctly (67%)',
    );
    assert.equal(
      retentionLine({ answered: 3, correct: 1, rate: 1 / 3 }),
      '1 of 3 due reviews answered correctly (33%)',
    );
    assert.equal(
      retentionLine({ answered: 2, correct: 3, rate: 1.5 }),
      '3 of 2 due reviews answered correctly (150%)',
    );
    assert.equal(
      retentionLine({ answered: 10, correct: -1, rate: -0.1 }),
      '-1 of 10 due reviews answered correctly (-10%)',
    );
  });
});

describe('source guards', () => {
  it('keeps labels.ts on type-only imports', () => {
    const source = readFileSync(LABELS_FILE, 'utf8');
    const imports = source.match(/^\s*import\b.*$/gm) ?? [];
    assert.equal(imports.length, 2);
    for (const line of imports) assert.match(line, /^import type /, line);
    assert.match(
      source,
      /^import type \{ ConceptNode, MasterySource \} from '\.\.\/graph\/types\.ts';$/m,
    );
    assert.match(source, /^import type \{ RetentionStat \} from '\.\/events\.ts';$/m);
    assert.doesNotMatch(source, /\brequire\s*\(/);
  });

  it('keeps every consumer on the shared helpers', () => {
    const files: ReadonlyArray<[string, string, ReadonlyArray<string>]> = [
      ['components/StudyToday.tsx', 'import { evidenceMode, quizResultNotice } from \'@/lib/evidence/labels\';', ['evidenceMode(', 'quizResultNotice(']],
      ['routes/learn.$conceptId.tsx', 'import { masterySourceLabel, quizResultNotice } from \'@/lib/evidence/labels\';', ['masterySourceLabel(', 'quizResultNotice(']],
      ['routes/gaps.tsx', 'import { masterySourceLabel, retentionLine } from \'@/lib/evidence/labels\';', ['masterySourceLabel(', 'retentionLine(']],
      ['components/Onboarding.tsx', 'import { evidenceMode } from \'@/lib/evidence/labels\';', ['evidenceMode(']],
      ['routes/graph.tsx', 'import { masterySourceLabel } from \'@/lib/evidence/labels\';', ['masterySourceLabel(']],
    ];
    for (const [name, importLine, calls] of files) {
      const source = readFileSync(join(SRC_DIR, name), 'utf8');
      assert.ok(source.includes(importLine), `${name}: import line changed`);
      for (const call of calls) assert.match(source, new RegExp(call.replace('(', '\\(')), `${name}: ${call}`);
    }
  });

  it('does not copy the label wording into another path', () => {
    const literal =
      /['"](?:From quizzes|Self-reported|Set by hand|From practice notes|Synced from Michi|Not quiz-checked)['"]/;
    for (const file of sourceFiles(SRC_DIR)) {
      if (file === LABELS_FILE) continue;
      assert.doesNotMatch(readFileSync(file, 'utf8'), literal, relative(SRC_DIR, file));
    }
  });

  it('keeps the older assertions in place', () => {
    const evidence = readFileSync(EVIDENCE_TEST_FILE, 'utf8');
    assert.match(evidence, /'labels where mastery came from and what a quiz result means'/);
    const count = (needle: string) => evidence.split(needle).length - 1;
    assert.equal(count('masterySourceLabel('), 3);
    assert.equal(count('evidenceMode('), 3);
    assert.equal(count('quizResultNotice('), 3);
    assert.equal(count('retentionLine('), 2);
  });
});
