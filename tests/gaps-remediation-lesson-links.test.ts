/**
 * Every step of "Your catch-up plan" on `/gaps` opens its lesson.
 *
 * The Remediation Plan card tells a learner what to fix first, but each step
 * was only readable: the lesson still had to be found by hand. Each step now
 * ends with one small "Open the lesson" link that carries the concept name in
 * its accessible name, following the lesson links in the recommendations pages
 * and the other `/gaps` lists (PR #137–#141). The page is locked statically so
 * the link stays the last child of the step's text block, the name/action/
 * metadata stay plain text, the number badge, priority colours and animation
 * stay, and no read, RPC or migration is added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'gaps.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');

const page = source(PAGE_FILE);

const planStart = page.indexOf('{/* Remediation Plan */}');
const planEnd = page.indexOf('{!learnersLoading && learners.length === 0 && (', planStart);
const plan = planStart >= 0 && planEnd > planStart ? page.slice(planStart, planEnd) : '';

const linkStart = plan.indexOf('<Link');
const linkEnd = plan.indexOf('</Link>', linkStart);
const linkBlock =
  linkStart >= 0 && linkEnd > linkStart ? plan.slice(linkStart, linkEnd + '</Link>'.length) : '';
const openTag = linkStart >= 0 ? plan.slice(linkStart, plan.indexOf('>', linkStart) + 1) : '';

const METADATA_BLOCK =
  'className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground"';

describe('gaps catch-up plan: each step opens its lesson', () => {
  it('keeps the catch-up plan card and adds exactly one lesson link to its steps', () => {
    assert.ok(planStart > 0, 'the remediation plan block still exists');
    assert.ok(planEnd > planStart, 'the remediation plan block is closed');
    assert.equal((plan.match(/\{remediation\.plan\.steps\.map\(\(step, i\) => \(/g) ?? []).length, 1);
    assert.equal((plan.match(/<Link\b/g) ?? []).length, 1);
    assert.equal((plan.match(/<\/Link>/g) ?? []).length, 1);
    assert.equal((plan.match(/Open the lesson/g) ?? []).length, 1);
    assert.ok(linkStart > plan.indexOf('<motion.div'), 'the link lives inside the mapped step');
  });

  it('links to the existing lesson route with the step concept', () => {
    assert.ok(openTag.startsWith('<Link'));
    assert.ok(openTag.includes('to="/learn/$conceptId"'));
    assert.ok(openTag.includes('params={{ conceptId: step.conceptId }}'));
  });

  it('keeps the agreed link styling, icon and accessible name', () => {
    assert.ok(
      openTag.includes(
        'className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"',
      ),
    );
    assert.ok(linkBlock.includes('<BookOpen className="h-3 w-3" aria-hidden="true" />'));
    assert.match(
      linkBlock,
      /aria-hidden="true" \/>\s*\n\s*Open the lesson\s*\n\s*<span className="sr-only">: \{conceptLabel\(step\.conceptId, step\.conceptName\)\}<\/span>/,
    );
    assert.equal((linkBlock.match(/<span className="sr-only">/g) ?? []).length, 1);
  });

  it('places the link after the priority metadata and as the last child of the text block', () => {
    const textBlockStart = plan.indexOf('<div className="flex-1">');
    assert.ok(textBlockStart > 0, 'the step still has its text block');
    const metadataAt = plan.indexOf(METADATA_BLOCK);
    assert.ok(metadataAt > textBlockStart, 'the step still has its metadata line');
    assert.ok(linkStart > metadataAt, 'the link follows the metadata line');
    assert.match(
      plan.slice(linkEnd),
      /^<\/Link>\s*<\/div>\s*<\/motion\.div>/,
      'the link is the last child of the text block',
    );
  });

  it('keeps the concept name, action, and metadata as plain text', () => {
    assert.ok(
      plan.includes(
        '<p className="font-medium text-foreground">{conceptLabel(step.conceptId, step.conceptName)}</p>',
      ),
    );
    assert.ok(plan.includes('<p className="text-sm text-muted-foreground">{step.action}</p>'));
    assert.ok(plan.includes('<span>{stepTypeLabel(step.gapType)}</span>'));
    assert.ok(plan.includes('<span>About {step.estimatedTime} min</span>'));
    const nameAt = plan.indexOf('<p className="font-medium text-foreground">');
    assert.ok(nameAt >= 0 && nameAt < linkStart, 'the name stays outside the link');
    assert.equal(/<p\b/.test(linkBlock), false, 'the link wraps no explanation');
    assert.equal(linkBlock.includes('{step.action}'), false);
    assert.equal(linkBlock.includes('{stepTypeLabel('), false);
  });

  it('keeps the number badge, priority labels and step animation', () => {
    const rowTag = plan.slice(
      plan.indexOf('<motion.div', plan.indexOf('remediation.plan.steps.map')),
      plan.indexOf('>', plan.indexOf('<motion.div', plan.indexOf('remediation.plan.steps.map'))) + 1,
    );
    assert.ok(rowTag.includes('key={i}'));
    assert.ok(rowTag.includes('initial={{ opacity: 0, x: -20 }}'));
    assert.ok(rowTag.includes('animate={{ opacity: 1, x: 0 }}'));
    assert.ok(rowTag.includes('transition={{ delay: i * 0.1 }}'));
    assert.ok(
      rowTag.includes(
        'className="flex items-start gap-4 p-4 bg-secondary/50 rounded-xl border border-border/50"',
      ),
    );
    assert.ok(
      plan.includes(
        '<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-primary/25">',
      ),
    );
    assert.ok(plan.includes('{step.order}'));
    assert.ok(plan.includes("step.priority === 'critical' ? 'Do first' : step.priority === 'high' ? 'Important' : 'When you can'"));
    for (const colour of ['bg-red-500/10', 'bg-orange-500/10', 'bg-amber-500/10']) {
      assert.ok(plan.includes(colour), `the ${colour} priority colour stays`);
    }
  });

  it('keeps the heading, estimate, focus box and empty state', () => {
    assert.ok(plan.includes('Your catch-up plan'));
    assert.ok(plan.includes('(about {remediation.plan.estimatedTotalTime} min)'));
    assert.ok(plan.includes('<strong>Focus:</strong> {remediation.plan.priorityFocus}'));
    assert.ok(plan.includes('<Target className="text-primary" aria-hidden="true" />'));
    assert.ok(plan.includes('{remediation && remediation.plan.steps.length > 0 && ('));
  });

  it('adds no focus, live region, button or extra role to the step link', () => {
    assert.equal(/aria-live/.test(linkBlock), false);
    assert.equal(/\.focus\(\)/.test(linkBlock), false);
    assert.equal(/tabIndex/.test(linkBlock), false);
    assert.equal(/role=/.test(linkBlock), false);
    assert.equal(/<button\b/.test(linkBlock), false);
  });

  it('imports Link and BookOpen exactly once', () => {
    assert.equal((page.match(/from '@tanstack\/react-router'/g) ?? []).length, 1);
    assert.match(page, /import \{ Link, createFileRoute \} from '@tanstack\/react-router';/);

    const lucideEnd = page.indexOf("from 'lucide-react'");
    const lucideImport = page.slice(page.lastIndexOf('import', lucideEnd), lucideEnd);
    assert.equal((lucideImport.match(/\bBookOpen\b/g) ?? []).length, 1);
    assert.equal((lucideImport.match(/\bLink\b/g) ?? []).length, 0);
  });

  it('adds no server function, RPC schema or migration for the links', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Open the lesson'), false, `${file} gained link markup`);
    }
  });
});
