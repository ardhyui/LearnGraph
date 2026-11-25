/**
 * The Reviews card on `/gaps` links the concepts the learner worked on this week.
 *
 * The card already says how much of the due backlog was remembered, but it did
 * not say *which* concepts were just reviewed, so a learner could not jump back
 * into the lessons they had been practising. The page now reuses the single
 * event-log read behind `getLearningStats` (no new query, RPC or table) to show
 * up to three chips after the retention block, each linking to its lesson. These
 * guards lock that shape statically.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'gaps.tsx');
const FUNCTIONS_FILE = join(ROOT, 'src', 'server', 'evidence.functions.ts');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');

const page = source(PAGE_FILE);
const functions = source(FUNCTIONS_FILE);

const focusStart = page.indexOf('data-testid="week-focus"');
const focusEnd = focusStart >= 0 ? page.indexOf('</div>', focusStart) : -1;
const focusBlock = focusStart >= 0 && focusEnd > focusStart ? page.slice(focusStart, focusEnd) : '';

const linkStart = focusBlock.indexOf('<Link');
const linkEnd = focusBlock.indexOf('</Link>');
const linkBlock =
  linkStart >= 0 && linkEnd > linkStart
    ? focusBlock.slice(linkStart, linkEnd + '</Link>'.length)
    : '';
const openTag =
  linkStart >= 0 ? focusBlock.slice(linkStart, focusBlock.indexOf('>', linkStart) + 1) : '';

describe('gaps weekly focus: the concepts reviewed this week open their lessons', () => {
  it('adds focus to the existing stats read without a new event query', () => {
    const start = functions.indexOf('export const getLearningStats');
    assert.ok(start >= 0, 'getLearningStats is still exported');
    const end = functions.indexOf('\nexport const', start + 1);
    const block = functions.slice(start, end === -1 ? undefined : end);
    assert.match(block, /createServerFn\(\{ method: 'GET' \}\)/);
    assert.match(block, /middleware\(\[authMiddleware\]\)/);
    assert.match(block, /validator\(z\.object\(\{ learnerId: lookupId \}\)\)/);
    assert.match(block, /import\('@\/lib\/evidence\/progress'\)/);
    assert.equal(block.match(/service\.listEvents\(/g)?.length, 1);
    assert.match(
      block,
      /service\.listEvents\(db, context\.userId, \{ learnerId: data\.learnerId \}\)/,
    );
    assert.match(block, /const week = weeklyBuckets\(events, now, 1\)\[0\];/);
    assert.match(block, /focus: week/);
    assert.match(block, /startsAt: week\.startsAt/);
    assert.match(block, /concepts: weeklyFocus\(events, week, 3, now\)/);
    assert.match(block, /: null,/);
  });

  it('fills the page state from stats and clears it when the learner changes', () => {
    assert.ok(
      page.includes("import type { WeeklyFocus } from '@/lib/evidence/progress';"),
      'the page reuses the shared WeeklyFocus type',
    );
    assert.ok(
      page.includes('const [weekFocus, setWeekFocus] = useState<WeeklyFocus | null>(null);'),
    );
    assert.ok(page.includes('setWeekFocus(stats?.focus ?? null);'));
    const quietStart = page.indexOf('if (!quiet) {');
    const quietEnd = page.indexOf('}', quietStart);
    const quietBlock = page.slice(quietStart, quietEnd);
    assert.ok(quietBlock.includes('setWeekFocus(null);'), 'a learner switch clears the focus');
  });

  it('shows the chips after the retention block and before the snoozed list', () => {
    const retentionStart = page.indexOf('data-testid="review-retention"');
    assert.ok(retentionStart > 0, 'the retention block still exists');
    assert.ok(focusStart > retentionStart, 'the focus block follows the retention block');
    assert.ok(
      page.indexOf('data-testid="snoozed-reviews"') > focusEnd,
      'the focus block sits before the snoozed reviews',
    );
    assert.ok(page.includes('Remembered at review time'));
    assert.ok(page.indexOf('Remembered at review time') < focusStart);
  });

  it('renders nothing when the week has no concepts', () => {
    assert.ok(page.includes('{weekFocus && weekFocus.concepts.length > 0 && ('));
    assert.equal((page.match(/You reviewed these this week/g) ?? []).length, 1);
    assert.ok(
      focusBlock.indexOf('You reviewed these this week') < focusBlock.indexOf('weekFocus.concepts.map'),
    );
  });

  it('links each busiest concept to its existing lesson route', () => {
    assert.ok(focusBlock.includes('{weekFocus.concepts.map((concept) => {'));
    assert.equal((focusBlock.match(/<Link\b/g) ?? []).length, 1);
    assert.equal((focusBlock.match(/<\/Link>/g) ?? []).length, 1);
    assert.ok(openTag.startsWith('<Link'));
    assert.ok(openTag.includes('to="/learn/$conceptId"'));
    assert.ok(openTag.includes('params={{ conceptId: concept.conceptId }}'));
    assert.ok(openTag.includes('key={concept.conceptId}'));
  });

  it('keeps the agreed chip styling and a 40px touch target', () => {
    assert.ok(
      openTag.includes(
        'className="inline-flex min-h-10 items-center gap-1 bg-primary/10 px-2 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"',
      ),
    );
    assert.ok(linkBlock.includes('<BookOpen className="h-3 w-3" aria-hidden="true" />'));
    assert.match(
      linkBlock,
      /\{name\}\s*\n\s*<span aria-hidden="true"> · \{concept\.count\}<\/span>\s*\n\s*<span className="sr-only">\s*\n\s*: \{name\}, reviewed \{countLabel\(concept\.count, 'time'\)\}\s*\n\s*<\/span>/,
      'the chip shows the count and reads it meaningfully to screen readers',
    );
    assert.equal((linkBlock.match(/<span className="sr-only">/g) ?? []).length, 1);
  });

  it('shows the reviewed count without adding an import', () => {
    assert.ok(
      page.includes(
        "import { GAP_KINDS, conceptLabel, countLabel, gapSummaryLine, priorityLabel, reviewSummary, snoozeLabel, stepTypeLabel } from '@/lib/gaps';",
      ),
      'countLabel is imported once from the shared gaps helpers',
    );
  });

  it('names chips from the concepts already loaded, never a raw id only', () => {
    assert.ok(
      page.includes('const conceptNames = new Map(searchConcepts.map((c) => [c.conceptId, c.name]));'),
    );
    assert.ok(
      focusBlock.includes('conceptLabel(\n                            concept.conceptId,\n                            conceptNames.get(concept.conceptId),\n                          )'),
      'the visible name falls back to the readable concept label',
    );
  });

  it('adds no focus, live region, button or extra role to the chips', () => {
    assert.equal(/aria-live/.test(focusBlock), false);
    assert.equal(/\.focus\(\)/.test(focusBlock), false);
    assert.equal(/tabIndex/.test(focusBlock), false);
    assert.equal(/role=/.test(focusBlock), false);
    assert.equal(/<button\b/.test(focusBlock), false);
  });

  it('adds no server function, RPC schema or migration for the chips', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    assert.equal(/db\.listEvents/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('You reviewed these this week'), false, `${file} gained copy`);
    }
  });

  it('imports Link and BookOpen exactly once', () => {
    assert.equal((page.match(/from '@tanstack\/react-router'/g) ?? []).length, 1);
    assert.match(page, /import \{ Link, createFileRoute \} from '@tanstack\/react-router';/);

    const lucideEnd = page.indexOf("from 'lucide-react'");
    const lucideImport = page.slice(page.lastIndexOf('import', lucideEnd), lucideEnd);
    assert.equal((lucideImport.match(/\bBookOpen\b/g) ?? []).length, 1);
  });
});
