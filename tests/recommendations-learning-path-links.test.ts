/**
 * Every step of the Learning Path tab on `/recommendations` opens its lesson.
 *
 * The plan was readable but not actionable: a learner could see "Fractions"
 * without any way to start studying it, although `/learn/$conceptId` already
 * exists. Each step now ends with one small "Open the lesson" link that carries
 * the step name in its accessible name. The page is locked statically so the
 * link stays the last child of the step text block, the concept name stays
 * plain text, and no read, RPC or migration is added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'recommendations.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');

const page = source(PAGE_FILE);
const listStart = page.indexOf('<ol');
const listEnd = page.indexOf('</ol>');
const listBlock = listStart >= 0 && listEnd > listStart ? page.slice(listStart, listEnd) : '';
const linkStart = listBlock.indexOf('<Link');
const linkEnd = listBlock.indexOf('</Link>');
const linkBlock = linkStart >= 0 && linkEnd > linkStart ? listBlock.slice(linkStart, linkEnd + '</Link>'.length) : '';
const openTag = linkStart >= 0 ? listBlock.slice(linkStart, listBlock.indexOf('>', linkStart) + 1) : '';
const textBlockStart = listBlock.indexOf('<div className="flex-1 p-4 bg-secondary/50 rounded-xl">');
const textBlockEnd = listBlock.indexOf('</div>', linkEnd);

describe('recommendations learning path: each step opens its lesson', () => {
  it('adds exactly one lesson link per step and one in the list', () => {
    assert.ok(listBlock.length > 0, 'the ordered list still exists');
    assert.equal((listBlock.match(/<Link\b/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<\/Link>/g) ?? []).length, 1);
    assert.equal((listBlock.match(/\{zpd\.suggestedPath\.map\(/g) ?? []).length, 1);
    assert.ok(listBlock.includes('<motion.li'), 'each rendered step still owns its link');
  });

  it('links to the existing lesson route with the step concept', () => {
    assert.ok(openTag.startsWith('<Link'));
    assert.ok(openTag.includes('to="/learn/$conceptId"'));
    assert.ok(openTag.includes('params={{ conceptId }}'));
  });

  it('keeps the agreed link styling, icon and visible label', () => {
    assert.ok(
      openTag.includes(
        'className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"',
      ),
    );
    assert.ok(linkBlock.includes('<BookOpen className="h-3 w-3" aria-hidden="true" />'));
    assert.ok(linkBlock.includes('\n                                    Open the lesson\n'));
    assert.ok(linkBlock.includes('<span className="sr-only">: {name}</span>'));
  });

  it('makes each link name unique with the step name', () => {
    const nameSource = listBlock.indexOf('const name =');
    assert.ok(nameSource > 0, 'the step name is resolved once');
    assert.ok(
      listBlock.includes(
        'const name =\n                              zc?.concept.name || conceptNames.get(conceptId) || conceptLabel(conceptId);',
      ),
    );
    assert.equal((linkBlock.match(/\{name\}/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<span className="sr-only">/g) ?? []).length, 1);
  });

  it('places the link after the estimate and as the last child of the text block', () => {
    assert.ok(textBlockStart > 0, 'the text block still exists');
    const estimate = listBlock.indexOf('Est. {formatDuration(rec.estimatedMasteryTime)} •');
    const readiness = listBlock.indexOf('Readiness {Math.round(rec.readinessScore * 100)}%');
    assert.ok(estimate > 0 && readiness > estimate);
    assert.ok(linkStart > readiness, 'the link follows the estimate/readiness line');
    assert.ok(linkStart > textBlockStart, 'the link lives inside the text block');
    assert.ok(textBlockEnd > linkEnd, 'the text block closes after the link');
    assert.equal(listBlock.slice(linkEnd + '</Link>'.length, textBlockEnd).trim(), '');
  });

  it('keeps the concept name as plain text, not a link', () => {
    const nameWrapper = '<div className="font-medium text-foreground">\n                                    {name}\n                                  </div>';
    assert.ok(listBlock.includes(nameWrapper));
    assert.equal(linkBlock.includes('font-medium text-foreground'), false);
    assert.ok(linkStart > listBlock.indexOf(nameWrapper), 'the name renders before the link');
  });

  it('keeps the ordered list, badge, arrow, animation and empty state intact', () => {
    const olTag = page.slice(listStart, page.indexOf('>', listStart) + 1);
    assert.equal(olTag, '<ol aria-label="Suggested learning path" className="space-y-4">');
    assert.ok(listBlock.includes('initial={{ opacity: 0, x: -20 }}'));
    assert.ok(listBlock.includes('animate={{ opacity: 1, x: 0 }}'));
    assert.ok(listBlock.includes('transition={{ delay: idx * 0.1 }}'));
    assert.ok(listBlock.includes('className="flex items-center gap-4"'));
    assert.ok(
      listBlock.includes(
        'className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white flex items-center justify-center font-bold shadow-lg shadow-purple-500/25"',
      ),
    );
    assert.ok(listBlock.includes('{idx + 1}'));
    assert.ok(listBlock.includes('aria-hidden="true">↓</div>'));

    const empty = page.indexOf('No learning path available');
    assert.ok(empty > 0 && empty < listStart, 'the empty message stays outside the list');
  });

  it('keeps the tab wiring and adds no focus, live region or extra role', () => {
    assert.ok(page.includes('id="rec-panel-path"'));
    assert.ok(page.includes('aria-labelledby="rec-tab-path"'));
    assert.ok(page.includes("activeTab === 'path'"));
    assert.equal(/aria-live/.test(listBlock), false);
    assert.equal(/\.focus\(\)/.test(listBlock), false);
    assert.equal(/tabIndex/.test(listBlock), false);
    assert.equal(/role=/.test(listBlock), false);
  });

  it('imports Link and BookOpen exactly once', () => {
    assert.equal((page.match(/from '@tanstack\/react-router'/g) ?? []).length, 1);
    assert.match(page, /import \{ createFileRoute, Link \} from '@tanstack\/react-router';/);
    assert.equal((listBlock.match(/<Link\b/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<BookOpen\b/g) ?? []).length, 1);
    const lucideImport = page.slice(page.indexOf("from 'lucide-react'") - 400, page.indexOf("from 'lucide-react'"));
    assert.equal((lucideImport.match(/\bBookOpen\b/g) ?? []).length, 1);
  });

  it('adds no server function, RPC schema or migration for the links', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Open the lesson'), false, `${file} gained link markup`);
    }
  });
});
