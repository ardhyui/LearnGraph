/**
 * "Refresh example data" (Roadmap P0 #2): older workspaces can move the example
 * learners' progress back to "as of now". The plan is pure and date-only, only
 * ever names demo learners, and is idempotent; the server writes it through
 * trusted code (demo concepts are quiz-checked, so the normal RPC correctly
 * refuses date writes — D5).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EducationGraphDB } from '../src/lib/graph/education-graph-db.ts';
import type { KnowledgeState } from '../src/lib/graph/types.ts';
import { demoRefreshPlan, DEMO_REFRESH_CUTOFF } from '../src/lib/demo-refresh.ts';
import { refreshDemoStateDates, seedDemoDataIfEmpty } from '../src/lib/graph/seed.ts';
import { demoKnowledgeStates, shiftDemoDate } from '../src/lib/demo-data.ts';
import { openTestGraphDB } from './support/graph-db.ts';

const DAY = 86_400_000;
const NOW = new Date('2026-11-13T09:30:00.000Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

const state = (
  userId: string,
  conceptId: string,
  patch: Partial<KnowledgeState> = {},
): KnowledgeState => ({
  userId,
  conceptId,
  mastery: 60,
  bloomLevel: 1,
  retentionStrength: 0.6,
  reviewCount: 3,
  misconceptions: [],
  interactions: [],
  updatedAt: ago(0),
  ...patch,
});

const rawAliceFractions = demoKnowledgeStates.find(
  (s) => s.learnerId === 'demo-alice' && s.conceptId === 'concept:fractions',
)!;
const expectedLast = shiftDemoDate(rawAliceFractions.lastReviewed, NOW);
const expectedFirst = shiftDemoDate(rawAliceFractions.createdAt, NOW);

describe('demo refresh plan', () => {
  it('only plans demo learners, and only while their review date is stale', () => {
    const plan = demoRefreshPlan(
      [
        state('demo-alice', 'fractions', {
          firstSeen: rawAliceFractions.createdAt,
          lastReviewed: rawAliceFractions.lastReviewed,
          mastery: 88,
          reviewCount: 8,
        }),
        state('demo-bob', 'fractions', { lastReviewed: ago(2), firstSeen: ago(30) }),
        state('me-sari', 'fractions', { lastReviewed: '2024-11-15T00:00:00.000Z' }),
        null,
      ],
      NOW,
    );
    assert.equal(plan.length, 1);
    assert.deepEqual(Object.keys(plan[0]!).sort(), ['conceptId', 'firstSeen', 'lastReviewed', 'userId']);
    assert.equal(plan[0]!.userId, 'demo-alice');
    assert.equal(plan[0]!.conceptId, 'fractions');
    assert.equal(plan[0]!.lastReviewed, expectedLast);
    assert.equal(plan[0]!.firstSeen, expectedFirst);
    // The gap between the example's first study and its review is kept.
    assert.equal(
      Date.parse(plan[0]!.lastReviewed!) - Date.parse(plan[0]!.firstSeen!),
      Date.parse(rawAliceFractions.lastReviewed) - Date.parse(rawAliceFractions.createdAt),
    );
    assert.ok(Date.parse(plan[0]!.lastReviewed!) < NOW.getTime());
    assert.ok(Date.parse(plan[0]!.firstSeen!) <= Date.parse(plan[0]!.lastReviewed!));
  });

  it('never carries mastery, review counts or history — dates only', () => {
    const plan = demoRefreshPlan(
      [
        state('demo-alice', 'fractions', {
          firstSeen: rawAliceFractions.createdAt,
          lastReviewed: rawAliceFractions.lastReviewed,
          mastery: 99,
          reviewCount: 99,
          masterySource: 'self_report',
          misconceptions: [{ id: 'm1', description: 'x', severity: 'minor', identified: ago(1) }],
          interactions: [{ timestamp: ago(1), type: 'review', duration: 5 }],
        }),
      ],
      NOW,
    );
    assert.equal(plan.length, 1);
    const text = JSON.stringify(plan[0]);
    assert.doesNotMatch(text, /mastery|reviewCount|misconception|interaction/i);
  });

  it('is idempotent: once refreshed, a second run plans nothing', () => {
    const before = state('demo-alice', 'fractions', {
      firstSeen: rawAliceFractions.createdAt,
      lastReviewed: rawAliceFractions.lastReviewed,
    });
    const patch = demoRefreshPlan([before], NOW)[0]!;
    assert.ok(patch);
    const after = { ...before, ...patch };
    assert.deepEqual(demoRefreshPlan([after], NOW), []);
    // Still nothing a day later: the refreshed review is inside the stale window.
    assert.deepEqual(demoRefreshPlan([after], new Date(NOW.getTime() + DAY)), []);
  });

  it('skips a merely old first study when the last review is recent', () => {
    const plan = demoRefreshPlan(
      [state('demo-alice', 'fractions', { firstSeen: '2024-03-01T00:00:00.000Z', lastReviewed: ago(3) })],
      NOW,
    );
    assert.deepEqual(plan, []);
  });

  it('handles broken dates and never returns a future date', () => {
    const plan = demoRefreshPlan(
      [
        state('demo-alice', 'fractions', {
          firstSeen: '2024-03-01T00:00:00.000Z',
          lastReviewed: 'not a date',
          nextReview: '2030-01-01T00:00:00.000Z',
        }),
      ],
      NOW,
    );
    assert.equal(plan.length, 1);
    assert.ok(Date.parse(plan[0]!.lastReviewed!) <= NOW.getTime());
    assert.ok(Date.parse(plan[0]!.firstSeen!) <= Date.parse(plan[0]!.lastReviewed!));
    assert.ok(Date.parse(plan[0]!.nextReview!) <= NOW.getTime());
  });

  it('keeps a snooze offset relative to the shifted review', () => {
    const rawLast = rawAliceFractions.lastReviewed;
    const rawNext = new Date(Date.parse(rawLast) + DAY).toISOString();
    const plan = demoRefreshPlan(
      [state('demo-alice', 'fractions', { firstSeen: rawAliceFractions.createdAt, lastReviewed: rawLast, nextReview: rawNext })],
      NOW,
    );
    assert.equal(plan.length, 1);
    assert.equal(
      Date.parse(plan[0]!.nextReview!) - Date.parse(plan[0]!.lastReviewed!),
      DAY,
    );
  });

  it('uses the legacy cutoff: pre-#17 dates are stale, intentional old gaps are not', () => {
    const legacy = state('demo-alice', 'fractions', { lastReviewed: DEMO_REFRESH_CUTOFF });
    const current = state('demo-bob', 'fractions', {
      lastReviewed: new Date(Date.parse(DEMO_REFRESH_CUTOFF) + DAY).toISOString(),
    });
    // The oldest example review is meant to stay ~6 months old after a refresh:
    // it must not look "stale" again just because it is far from today.
    const intentionallyOld = state('demo-carol', 'arithmetic', { lastReviewed: ago(193) });
    assert.deepEqual(
      demoRefreshPlan([legacy, current, intentionallyOld], NOW).map((p) => p.userId),
      ['demo-alice'],
    );
  });
});

const DIR = path.join(os.tmpdir(), `learngraph-demo-refresh-${process.pid}`);
const clean = () => fs.rmSync(DIR, { recursive: true, force: true });

describe('refreshDemoStateDates (engine)', () => {
  let db: EducationGraphDB;
  beforeEach(async () => {
    clean();
    db = await openTestGraphDB(DIR);
  });
  afterEach(async () => {
    await db.close();
    clean();
  });

  it('moves only the stale example dates, keeps progress, and runs once', async () => {
    await seedDemoDataIfEmpty(db, NOW);
    // Put this one example state back to its 2024 dates (a pre-#17 workspace).
    await db.setKnowledgeState('demo-alice', 'fractions', {
      firstSeen: rawAliceFractions.createdAt,
      lastReviewed: rawAliceFractions.lastReviewed,
    });
    // A learner of the user's own must never be touched, even if it is stale.
    await db.setLearnerProfile('me-sari', { name: 'Sari' });
    await db.setKnowledgeState('me-sari', 'fractions', {
      mastery: 70,
      lastReviewed: '2024-11-15T00:00:00.000Z',
      firstSeen: '2024-03-01T00:00:00.000Z',
    });
    const before = (await db.getKnowledgeState('demo-alice', 'fractions'))!;
    const beforeOther = (await db.getKnowledgeState('demo-carol', 'fractions'))!;

    assert.deepEqual(await refreshDemoStateDates(db, NOW), { moved: 1 });
    const after = (await db.getKnowledgeState('demo-alice', 'fractions'))!;
    assert.equal(after.lastReviewed, expectedLast);
    assert.equal(after.firstSeen, expectedFirst);
    assert.equal(after.mastery, before.mastery);
    assert.equal(after.reviewCount, before.reviewCount);
    assert.equal(after.masterySource, before.masterySource);
    assert.deepEqual(after.misconceptions, before.misconceptions);
    assert.deepEqual(after.interactions, before.interactions);
    // Other, still-fresh example rows are left exactly as they were.
    assert.deepEqual(await db.getKnowledgeState('demo-carol', 'fractions'), beforeOther);
    // The user's own learner is untouched.
    assert.equal((await db.getKnowledgeState('me-sari', 'fractions'))!.lastReviewed, '2024-11-15T00:00:00.000Z');

    // Idempotent: running it again writes nothing.
    assert.deepEqual(await refreshDemoStateDates(db, NOW), { moved: 0 });
  });
});

// Static guards: the page keeps the button, the server code stays account-scoped
// and never accepts a learner or a date from the client.
const component = fs.readFileSync(new URL('../src/components/RefreshExampleData.tsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/routes/admin/learners.tsx', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../src/server/graph.functions.ts', import.meta.url), 'utf8');
const seed = fs.readFileSync(new URL('../src/lib/graph/seed.ts', import.meta.url), 'utf8');

describe('refresh example data wiring (static)', () => {
  it('the learners page shows the refresh next to the other data buttons', () => {
    assert.ok(page.includes("import { RefreshExampleData } from '@/components/RefreshExampleData'"));
    assert.ok(page.includes('<RefreshExampleData />'));
  });

  it('the button only appears for a stale plan, and reports status/errors accessibly', () => {
    assert.ok(component.includes('demoRefreshPlan'));
    assert.ok(component.includes('demoLearners'));
    assert.ok(component.includes('refreshExampleData'));
    assert.ok(component.includes('role="status"'));
    assert.ok(component.includes('role="alert"'));
    assert.ok(component.includes('aria-busy'));
    assert.ok(component.includes('min-h-10'));
    assert.ok(component.includes('plan.length > 0'));
    assert.equal(/window\.confirm|confirm\(/.test(component), false);
    assert.equal(/createServerFn/.test(component), false);
  });

  it('writes through one trusted server function with no client-supplied ids or dates', () => {
    assert.match(server, /export const refreshExampleData = createServerFn/);
    assert.ok(server.includes('refreshDemoStateDates(await graphForOwner(context.userId))'));
    assert.ok(server.includes('authMiddleware'));
    const fn = server.slice(
      server.indexOf('export const refreshExampleData'),
      server.indexOf('export const removeExampleData'),
    );
    assert.equal(/\.validator\(/.test(fn), false);
  });

  it('the server writes date fields only, to demo learners only', () => {
    const fn = seed.slice(seed.indexOf('export async function refreshDemoStateDates'));
    assert.ok(fn.includes('demoRefreshPlan'));
    assert.ok(fn.includes('demoLearners'));
    assert.ok(fn.includes('{ firstSeen, lastReviewed, nextReview }'));
    assert.equal(/mastery|reviewCount|misconceptions|interactions/.test(fn), false);
  });
});
