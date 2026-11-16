/**
 * Recommendation cards on `/recommendations` are one ordered, named list.
 *
 * Screen-reader users should hear that the cards are a list (and how many
 * items it has), not a run of anonymous blocks. The page is locked statically
 * so framer-motion markup keeps `<motion.ol aria-label="Recommended concepts">`
 * as the only child wrapper and `<motion.li>` as the only mapped card, without
 * adding a read, RPC or migration.
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
const listStart = page.indexOf('<motion.ol');
const listEnd = page.indexOf('</motion.ol>');
const listBlock = listStart >= 0 && listEnd > listStart ? page.slice(listStart, listEnd) : '';

describe('recommendations: one named ordered list', () => {
  it('wraps the cards in a single labelled <motion.ol>', () => {
    assert.ok(listStart > 0, 'the recommendations page has an ordered list');
    assert.ok(listEnd > listStart, 'the ordered list is closed');
    assert.equal((page.match(/<motion\.ol\b/g) ?? []).length, 1);
    assert.equal((page.match(/<\/motion\.ol>/g) ?? []).length, 1);

    const openTag = page.slice(listStart, page.indexOf('>', listStart) + 1);
    assert.match(openTag, /^<motion\.ol\b/);
    assert.ok(openTag.includes('aria-label="Recommended concepts"'));
    // The animated container contract moves to the list so the cards keep
    // staggering, and the existing vertical rhythm is preserved.
    assert.ok(openTag.includes('variants={containerVariants}'));
    assert.ok(openTag.includes('className="space-y-4"'));
  });

  it('maps the recommendations to direct <motion.li> children', () => {
    assert.match(listBlock, /\{zpd\.recommendations\.map\(\(rec, idx\) => \(\s*<motion\.li\b/);
    assert.equal((listBlock.match(/\{zpd\.recommendations\.map\(/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<motion\.li\b/g) ?? []).length, 1);
    assert.equal((listBlock.match(/<\/motion\.li>/g) ?? []).length, 1);

    // Nothing (especially no extra <div>) sits between the list and its items.
    const afterOpen = page.indexOf('>', listStart) + 1;
    const mapStart = page.indexOf('{zpd.recommendations.map', afterOpen);
    assert.equal(page.slice(afterOpen, mapStart).trim(), '');
  });

  it('keeps the card wrapper key, animation and visual classes', () => {
    const liStart = listBlock.indexOf('<motion.li');
    const liTag = listBlock.slice(liStart, listBlock.indexOf('>', liStart) + 1);
    assert.ok(liTag.includes('key={rec.concept.conceptId}'));
    assert.ok(liTag.includes('variants={itemVariants}'));
    assert.ok(liTag.includes('whileHover={{ y: -2 }}'));
    assert.ok(liTag.includes('className="glass-card p-5 hover:shadow-xl transition-all duration-300"'));
  });

  it('keeps the priority number and the card content order', () => {
    assert.equal((listBlock.match(/\{idx \+ 1\}/g) ?? []).length, 1);
    const badge = listBlock.indexOf('{idx + 1}');
    const heading = listBlock.indexOf('{rec.concept.name}');
    assert.ok(badge > 0 && heading > badge, 'the priority number still leads the card');
    for (const text of [
      'Readiness:',
      'Est. time:',
      'Profile match:',
      'Why this concept?',
      'Builds on',
      'Ways to learn it',
      'SCAFFOLDING_ICONS',
    ]) {
      assert.ok(listBlock.includes(text), `card content lost ${text}`);
    }
  });

  it('adds no visible list marker or extra visual class for numbering', () => {
    assert.equal(/list-(disc|decimal|none)|listStyleType/.test(page), false);
    assert.equal(/role="list"/.test(page), false);
  });
});

describe('recommendations: empty state stays as it was', () => {
  it('keeps "All caught up!" outside the ordered list', () => {
    const emptyStart = page.indexOf(
      '<motion.div variants={itemVariants} className="glass-card text-center py-16">',
    );
    const emptyMessage = page.indexOf('All caught up!');
    assert.ok(emptyStart > 0, 'the empty state card is still a motion.div');
    assert.ok(emptyMessage > emptyStart, 'the empty state copy is inside its card');
    assert.ok(emptyMessage < listStart, 'the empty state is rendered before the list branch');
    assert.equal(listBlock.includes('All caught up!'), false);
    assert.equal(listBlock.includes('No new concepts ready to learn right now.'), false);
  });
});

describe('recommendations: surrounding page contract', () => {
  it('keeps the recommendations tabpanel and its animation untouched', () => {
    assert.ok(page.includes('role="tabpanel"'));
    assert.ok(page.includes('id="rec-panel-recommendations"'));
    assert.ok(page.includes('aria-labelledby="rec-tab-recommendations"'));
    assert.ok(page.includes("activeTab === 'recommendations'"));
    assert.equal((page.match(/<AnimatePresence mode="wait">/g) ?? []).length, 2);
  });

  it('adds no server function, RPC call or migration for the list', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Recommended concepts'), false, `${file} gained list markup`);
    }
  });
});
