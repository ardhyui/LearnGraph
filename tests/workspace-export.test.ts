/**
 * "Download workspace (JSON)" on Admin → Learners: one file with every learner
 * of the account (profile + knowledge states, deleted concepts kept) and the
 * workspace's own concepts and prerequisite edges. The builder is pure; a
 * static guard keeps the page on the existing account-scoped read RPCs (no new
 * server function).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import type { ConceptNode, KnowledgeState, LearnerProfile, PrerequisiteEdge } from '../src/lib/graph/types.ts';
import {
  WORKSPACE_EXPORT_FORMAT,
  buildWorkspaceExport,
  workspaceExportFileName,
} from '../src/lib/workspace-export.ts';

const DAY = 86_400_000;
const NOW = new Date('2026-11-13T09:30:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

const learner = (userId: string, patch: Partial<LearnerProfile> = {}): LearnerProfile => ({
  userId,
  name: userId.replace(/^learner:/, '').replace(/(^|-)([a-z])/g, (_, d, c) => `${d}${c.toUpperCase()}`),
  createdAt: ago(30),
  updatedAt: ago(1),
  psychometricScores: {},
  tags: ['focus:mathematics'],
  ...patch,
});

const state = (userId: string, conceptId: string, patch: Partial<KnowledgeState> = {}): KnowledgeState => ({
  userId,
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

const concept = (conceptId: string, patch: Partial<ConceptNode> = {}): ConceptNode => ({
  conceptId,
  name: conceptId,
  domain: 'mathematics',
  description: '',
  difficulty: { absolute: 3, cognitiveLoad: 0.3, abstractness: 0.2 },
  createdAt: ago(90),
  updatedAt: ago(90),
  ...patch,
});

const edge = (from: string, to: string): PrerequisiteEdge => ({
  edgeId: `edge:${from}->${to}`,
  from,
  to,
  strength: 'required',
  createdAt: ago(90),
});

describe('workspace export', () => {
  it('holds every learner with their own states, plus the concepts and edges given', () => {
    const learners = [
      learner('learner:alice', { name: 'Alice Chen' }),
      learner('learner:bob', { name: 'Bob Martinez' }),
      learner('learner:made-up', { name: 'Made Up' }),
    ];
    const data = buildWorkspaceExport({
      learners,
      states: [
        state('learner:alice', 'concept:fractions', { mastery: 85 }),
        state('learner:alice', 'concept:arithmetic', { mastery: 40 }),
        state('learner:bob', 'concept:fractions', { mastery: 10 }),
        // States of a learner that is not in the list never travel with the file.
        state('learner:someone-else', 'concept:fractions', { mastery: 99 }),
        // Duplicate concept per learner is kept once.
        state('learner:alice', 'concept:fractions', { mastery: 1 }),
      ],
      concepts: [concept('concept:arithmetic'), concept('concept:fractions')],
      edges: [edge('concept:arithmetic', 'concept:fractions')],
      now: NOW,
    });
    assert.equal(data.format, WORKSPACE_EXPORT_FORMAT);
    assert.equal(data.format, 'learngraph.workspace-export');
    assert.equal(data.version, 1);
    assert.equal(data.exportedAt, NOW.toISOString());
    assert.deepEqual(
      data.learners.map((l) => [l.id, l.name, l.subjects, l.knowledgeStates.map((s) => s.conceptId)]),
      [
        ['learner:alice', 'Alice Chen', ['mathematics'], ['concept:fractions', 'concept:arithmetic']],
        ['learner:bob', 'Bob Martinez', ['mathematics'], ['concept:fractions']],
        ['learner:made-up', 'Made Up', ['mathematics'], []],
      ],
    );
    assert.ok(data.learners.every((l) => l.profile.userId === l.id));
    assert.equal(data.concepts.length, 2);
    assert.deepEqual(data.edges.map((e) => [e.from, e.to]), [['concept:arithmetic', 'concept:fractions']]);
    // Round-trips as JSON.
    assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
  });

  it('keeps states of deleted concepts and drops null entries and duplicates', () => {
    const data = buildWorkspaceExport({
      learners: [learner('learner:alice'), null, learner('learner:alice')],
      states: [state('learner:alice', 'concept:deleted-long-ago', { mastery: 20 }), null],
      concepts: [concept('concept:fractions'), null, concept('concept:fractions')],
      edges: [edge('concept:a', 'concept:b'), edge('concept:a', 'concept:b')],
      now: NOW,
    });
    assert.equal(data.learners.length, 1);
    assert.deepEqual(data.learners[0]!.knowledgeStates.map((s) => s.conceptId), ['concept:deleted-long-ago']);
    assert.equal(data.concepts.length, 1);
    assert.equal(data.edges.length, 1);
  });

  it('carries only the agreed fields — nothing beyond the data it was given', () => {
    const data = buildWorkspaceExport({ learners: [], states: [], concepts: [], edges: [], now: NOW });
    assert.deepEqual(Object.keys(data).sort(), ['concepts', 'edges', 'exportedAt', 'format', 'learners', 'version']);
    const text = JSON.stringify(data);
    // No secrets ever enter the file: the builder reads nothing but its input.
    assert.match(text, /learngraph\.workspace-export/);
    assert.doesNotMatch(text, /sk-ant-|apiKey|password|secret|token/i);
  });

  it('stays a valid (empty) file for an account with no learners or concepts', () => {
    const data = buildWorkspaceExport({ learners: [], states: [], concepts: [], edges: [], now: NOW });
    assert.equal(data.format, 'learngraph.workspace-export');
    assert.equal(data.version, 1);
    assert.deepEqual(data.learners, []);
    assert.deepEqual(data.concepts, []);
    assert.deepEqual(data.edges, []);
  });
});

describe('workspace export file name', () => {
  it('is ASCII and dated by local day, with a fallback', () => {
    assert.equal(workspaceExportFileName(new Date(2026, 10, 13, 6, 0)), 'learngraph-workspace-2026-11-13.json');
    assert.equal(workspaceExportFileName(new Date(2027, 0, 2, 23, 59)), 'learngraph-workspace-2027-01-02.json');
    assert.equal(workspaceExportFileName(new Date(Number.NaN)), 'learngraph-workspace-undated.json');
  });
});

// Static guards: the page stays on the existing account-scoped read RPCs, and
// the download itself never needs a new server function or schema.
const component = fs.readFileSync(new URL('../src/components/DownloadWorkspace.tsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/routes/admin/learners.tsx', import.meta.url), 'utf8');

describe('download workspace page wiring (static)', () => {
  it('the learners page shows the download next to the other data buttons', () => {
    assert.ok(page.includes("import { DownloadWorkspace } from '@/components/DownloadWorkspace'"));
    assert.ok(page.includes('<DownloadWorkspace />'));
  });

  it('builds the file from the existing read RPCs only (no new server function)', () => {
    assert.ok(component.includes('buildWorkspaceExport'));
    assert.ok(component.includes('workspaceExportFileName'));
    for (const call of ['db.listLearnerProfiles()', 'db.listConcepts()', 'db.listEdges()', 'db.getLearnerKnowledgeStates(']) {
      assert.ok(component.includes(call), `missing ${call}`);
    }
    assert.equal(/createServerFn|from '@\/server\//.test(component), false);
    assert.equal(/createServerFn/.test(page), false);
  });

  it('announces status and errors to screen readers with a busy state', () => {
    assert.ok(component.includes('role="status"'));
    assert.ok(component.includes('aria-live="polite"'));
    assert.ok(component.includes('role="alert"'));
    assert.ok(component.includes('aria-busy'));
    assert.ok(component.includes('min-h-10'));
    assert.equal(/window\.confirm|confirm\(/.test(component), false);
  });
});
