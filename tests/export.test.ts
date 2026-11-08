/**
 * "Download my data" (My Profile): readable CSV + complete JSON export of one
 * learner's own progress, built from the same account-scoped reads as the UI.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import type { KnowledgeState, LearnerProfile } from '../src/lib/graph/types.ts';
import {
  CSV_HEADER,
  EXPORT_FORMAT,
  buildLearnerExport,
  csvCell,
  exportFileName,
  progressCsv,
  progressRows,
  progressStatus,
} from '../src/lib/export.ts';
import { openTestGraphDB } from './support/graph-db.ts';

const DAY = 86_400_000;
const NOW = new Date('2026-11-03T08:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

const state = (conceptId: string, patch: Partial<KnowledgeState> = {}): KnowledgeState => ({
  userId: 'me-sari',
  conceptId,
  mastery: 0,
  bloomLevel: 1,
  retentionStrength: 0.5,
  reviewCount: 0,
  misconceptions: [],
  interactions: [],
  updatedAt: ago(0),
  ...patch,
});

const concepts = [
  { conceptId: 'fractions', name: 'Fractions', domain: 'mathematics' },
  { conceptId: 'addition', name: 'Addition', domain: 'mathematics' },
  { conceptId: 'loops', name: 'Loops', domain: 'computer-science' },
  { conceptId: 'untouched', name: 'Untouched', domain: 'mathematics' },
];

const learner: LearnerProfile = {
  userId: 'me-sari',
  name: 'Sari Smoke',
  createdAt: ago(10),
  updatedAt: ago(1),
  psychometricScores: {},
  tags: ['focus:mathematics', 'other'],
};

describe('progress rows', () => {
  it('status follows the mastery thresholds used everywhere else', () => {
    assert.equal(progressStatus(0), 'Not started');
    assert.equal(progressStatus(1), 'Learning');
    assert.equal(progressStatus(79), 'Learning');
    assert.equal(progressStatus(80), 'Mastered');
  });

  it('names concepts, sorts by subject then name, and keeps states of deleted concepts', () => {
    const rows = progressRows(
      [
        state('fractions', { mastery: 55.6, firstSeen: ago(3) }),
        state('loops', { mastery: 90, reviewCount: 2, lastReviewed: ago(2), firstSeen: ago(9) }),
        state('addition', { mastery: 120, reviewCount: -3, lastReviewed: 'not a date' }),
        state('concept:old-topic', { mastery: 10 }),
        state('fractions', { mastery: 1 }), // duplicate ignored
      ],
      concepts,
    );
    assert.deepEqual(
      rows.map((r) => [r.subject, r.concept, r.status, r.mastery, r.reviewCount]),
      [
        ['Computer science', 'Loops', 'Mastered', 90, 2],
        ['Mathematics', 'Addition', 'Mastered', 100, 0],
        ['Mathematics', 'Fractions', 'Learning', 56, 0],
        ['', 'Old topic', 'Learning', 10, 0],
      ],
    );
    const loops = rows.find((r) => r.conceptId === 'loops')!;
    assert.equal(loops.lastReviewed, ago(2));
    assert.ok(loops.nextReviewDue && Date.parse(loops.nextReviewDue) > Date.parse(ago(2)));
    assert.equal(rows.find((r) => r.conceptId === 'addition')!.lastReviewed, null);
    // Not really learned yet → no review date.
    assert.equal(rows.find((r) => r.conceptId === 'concept:old-topic')!.nextReviewDue, null);
  });
});

describe('CSV', () => {
  it('quotes and neutralises spreadsheet formulas', () => {
    assert.equal(csvCell('Fractions'), 'Fractions');
    assert.equal(csvCell('a, b'), '"a, b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
    assert.equal(csvCell('+1'), "'+1");
    assert.equal(csvCell('-x'), "'-x");
    assert.equal(csvCell('@cmd'), "'@cmd");
    assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
    assert.equal(csvCell('bell\u0007'), 'bell');
    assert.equal(csvCell(42), '42');
    assert.equal(csvCell(Number.NaN), '');
    assert.equal(csvCell(null), '');
  });

  it('has a header, one line per row, dates as days, and a BOM', () => {
    const rows = progressRows([state('loops', { mastery: 90, reviewCount: 2, lastReviewed: ago(2), firstSeen: ago(9) })], concepts);
    const csv = progressCsv(rows);
    assert.ok(csv.startsWith('\uFEFF'));
    const lines = csv.slice(1).trimEnd().split('\r\n');
    assert.equal(lines[0], CSV_HEADER.join(','));
    assert.equal(lines.length, 2);
    assert.match(lines[1], /^Loops,Computer science,Mastered,90,2,2026-10-25,2026-11-01,\d{4}-\d{2}-\d{2}$/);
  });
});

describe('file names', () => {
  it('are ASCII, dated by local day, with a fallback', () => {
    const now = new Date(2026, 10, 3, 6, 0);
    assert.equal(exportFileName('Sari Smoke', 'csv', now), 'learngraph-sari-smoke-2026-11-03.csv');
    assert.equal(exportFileName('Zoë Ñúñez', 'json', now), 'learngraph-zoe-nunez-2026-11-03.json');
    assert.equal(exportFileName('../../etc/passwd', 'csv', now), 'learngraph-etc-passwd-2026-11-03.csv');
    assert.equal(exportFileName('学习', 'csv', now), 'learngraph-learner-2026-11-03.csv');
    assert.equal(exportFileName(undefined, 'csv', new Date(Number.NaN)), 'learngraph-learner-undated.csv');
    assert.ok(exportFileName('a'.repeat(200), 'csv', now).length <= 'learngraph--2026-11-03.csv'.length + 40);
  });
});

describe('JSON export', () => {
  it('holds the profile, subjects, summary, readable rows and the raw states of this learner only', () => {
    const states = [state('fractions', { mastery: 85 }), state('loops', { mastery: 30 }), state('loops', { userId: 'someone-else', mastery: 99 })];
    const data = buildLearnerExport({ learner, states, concepts, now: NOW });
    assert.equal(data.format, EXPORT_FORMAT);
    assert.equal(data.version, 1);
    assert.equal(data.exportedAt, NOW.toISOString());
    assert.equal(data.learner.id, 'me-sari');
    assert.equal(data.learner.name, 'Sari Smoke');
    assert.deepEqual(data.learner.subjects, ['mathematics']);
    assert.deepEqual(data.learner.profile.tags, learner.tags);
    assert.equal(data.summary.total, 4);
    assert.equal(data.summary.mastered, 1);
    assert.equal(data.knowledgeStates.length, 2);
    assert.ok(data.knowledgeStates.every((s) => s.userId === 'me-sari'));
    assert.deepEqual(data.progress.map((r) => r.conceptId), ['loops', 'fractions']);
    // Round-trips as JSON.
    assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
  });
});

const DIR = path.join(os.tmpdir(), `learngraph-export-${process.pid}`);
const clean = () => fs.rmSync(DIR, { recursive: true, force: true });

describe('export through the engine', () => {
  let db: EducationGraphDB;
  beforeEach(async () => {
    clean();
    db = await openTestGraphDB(DIR, 'owner-alice');
    await db.setLearnerProfile('kid', { name: 'Kid', tags: ['focus:math'] });
    await db.setLearnerProfile('sibling', { name: 'Sibling' });
    await db.addConcept({ conceptId: 'add', name: 'Addition', domain: 'math', description: '' });
    await db.addConcept({ conceptId: 'sub', name: 'Subtraction', domain: 'math', description: '' });
    await db.setKnowledgeState('kid', 'add', { mastery: 85, reviewCount: 3, lastReviewed: ago(60) });
    await db.setKnowledgeState('sibling', 'sub', { mastery: 50 });
  });
  afterEach(async () => {
    await db.close();
    clean();
  });

  it('exports what the app reads for that learner (and not a sibling learner)', async () => {
    const [profile, states, list] = await Promise.all([db.getLearnerProfile('kid'), db.getLearnerKnowledgeStates('kid'), db.listConcepts()]);
    const data = buildLearnerExport({ learner: profile!, states, concepts: list, now: new Date() });
    assert.deepEqual(data.progress.map((r) => [r.concept, r.subject, r.status, r.mastery, r.reviewCount]), [['Addition', 'Math', 'Mastered', 85, 3]]);
    assert.deepEqual(data.learner.subjects, ['math']);
    assert.equal(data.summary.total, 2);
    assert.ok(data.progress[0].nextReviewDue);
    assert.match(progressCsv(data.progress), /Addition,Math,Mastered,85,3,/);
  });

  it("another account's workspace has nothing of this learner to export", async () => {
    await db.close();
    const other = await openTestGraphDB(DIR, 'owner-bob');
    assert.equal(await other.getLearnerProfile('kid'), null);
    assert.deepEqual(await other.getLearnerKnowledgeStates('kid'), []);
    await other.close();
    db = await openTestGraphDB(DIR, 'owner-alice');
  });
});
