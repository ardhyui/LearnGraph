/**
 * The three zone cards on `/recommendations` are named lists of concepts.
 *
 * Screen-reader users should hear "Mastered (n)", "Ready to Learn (n)" and
 * "Not yet (n)" as three lists and be able to jump from concept to concept,
 * instead of walking a run of anonymous blocks. The page is locked statically
 * so framer-motion keeps a direct `<motion.li>` per concept, with the empty
 * messages outside the lists and no new read, RPC, live region or migration.
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

const sliceBetween = (start: string, end: string) => {
  const from = page.indexOf(start);
  const to = page.indexOf(end, from + start.length);
  assert.ok(from > 0, `missing zone marker: ${start}`);
  assert.ok(to > from, `missing zone marker: ${end}`);
  return page.slice(from, to);
};

const zones = {
  mastered: sliceBetween('{/* Too Easy */}', '{/* ZPD */}'),
  ready: sliceBetween('{/* ZPD */}', '{/* Too Hard */}'),
  notyet: sliceBetween('{/* Too Hard */}', '{/* Learning Path Tab */}'),
};

const listOf = (zone: string) => {
  const start = zone.indexOf('<ul');
  const end = zone.indexOf('</ul>');
  assert.ok(start > 0 && end > start, 'the zone has one closed <ul>');
  return { start, end, block: zone.slice(start, end), openTag: zone.slice(start, zone.indexOf('>', start) + 1) };
};

describe('recommendations zones: three named lists', () => {
  it('gives each heading a stable id and labels the matching list with it', () => {
    const expected = { mastered: 'rec-zone-mastered', ready: 'rec-zone-ready', notyet: 'rec-zone-notyet' };

    for (const [zone, id] of Object.entries(expected)) {
      const block = zones[zone as keyof typeof zones];
      const heading = block.slice(block.indexOf('<h3'), block.indexOf('>', block.indexOf('<h3')) + 1);
      assert.ok(heading.includes(`id="${id}"`), `${zone}: heading keeps the jumping-off id`);
      assert.equal((block.match(new RegExp(`id="${id}"`, 'g')) ?? []).length, 1);
      assert.equal((block.match(new RegExp(`aria-labelledby="${id}"`, 'g')) ?? []).length, 1);
    }

    assert.equal((page.match(/<ul\b[^>]*aria-labelledby="rec-zone-/g) ?? []).length, 3);
    assert.equal((page.match(/aria-labelledby="rec-zone-/g) ?? []).length, 3);
    assert.equal((page.match(/<h3\b/g) ?? []).length, 5, 'no extra heading was added');
  });

  it('maps each zone to direct <motion.li> rows without a wrapper', () => {
    const zpd = { mastered: 'tooEasy', ready: 'zpd', notyet: 'tooHard' };
    const names = { mastered: 'Mastered', ready: 'Ready to Learn', notyet: 'Not yet' };

    for (const [zone, field] of Object.entries(zpd)) {
      const list = listOf(zones[zone as keyof typeof zones]);
      const headingText = `${names[zone as keyof typeof names]} ({zpd.${field}.length})`;
      assert.match(list.openTag, /^<ul\b/);
      assert.ok(list.openTag.includes(`aria-labelledby="rec-zone-${zone === 'notyet' ? 'notyet' : zone}"`));
      assert.ok(
        list.openTag.includes('className="space-y-2 max-h-96 overflow-y-auto scrollbar-hide"'),
        `${zone}: list keeps the scroll container classes`,
      );
      assert.ok(zones[zone as keyof typeof zones].includes(headingText), `${zone}: heading copy changed`);
      assert.equal((list.block.match(new RegExp(`\\{zpd\\.${field}\\.map\\(`, 'g')) ?? []).length, 1);
      assert.match(list.block, new RegExp(`\\{zpd\\.${field}\\.map\\(\\(zc\\) => \\(\\s*<motion\\.li\\b`));

      // Nothing (especially a <div>) sits between the list and its rows.
      const afterOpen = list.block.indexOf('>') + 1;
      const mapStart = list.block.indexOf(`{zpd.${field}.map`);
      assert.equal(list.block.slice(afterOpen, mapStart).trim(), '');
      assert.equal((list.block.match(/<motion\.li\b/g) ?? []).length, 1);
      assert.equal((list.block.match(/<\/motion\.li>/g) ?? []).length, 1);
      assert.equal(/<motion\.div\b/.test(list.block), false);
      assert.equal((list.block.match(/<motion\.li\b[\s\S]*?key=\{zc\.concept\.conceptId\}/) ?? []).length, 1);
      assert.ok(list.block.includes('whileHover={{ scale: 1.02 }}'));
      assert.ok(list.block.includes('className="p-3 bg-background/80 rounded-xl shadow-sm"'));
    }
  });

  it('keeps the concept rows and their order unchanged', () => {
    for (const zone of Object.keys(zones) as (keyof typeof zones)[]) {
      const list = listOf(zones[zone]);
      const nameIndex = list.block.indexOf('{zc.concept.name}');
      assert.ok(nameIndex > 0, `${zone}: concept name is shown`);

      if (zone === 'mastered') {
        assert.ok(list.block.indexOf('{zc.reason}') > nameIndex, 'mastered: reason follows the name');
      }
      if (zone === 'ready') {
        assert.ok(list.block.indexOf('{zc.reason}') > nameIndex, 'ready: reason follows the name');
        assert.ok(
          list.block.indexOf('Readiness: {Math.round(zc.readiness * 100)}%') > nameIndex,
          'ready: readiness follows the reason',
        );
      }
      if (zone === 'notyet') {
        assert.ok(list.block.includes('zc.missingPrerequisites.length > 0'), 'not yet: prerequisite branch kept');
        assert.ok(
          list.block.indexOf('{learnFirstLabel(zc.missingPrerequisites, conceptNames)}') > nameIndex,
          'not yet: the learn-first hint follows the name',
        );
        assert.ok(list.block.indexOf('{zc.reason}') > nameIndex, 'not yet: reason stays in the else branch');
      }
    }
  });

  it('keeps every empty message outside its list', () => {
    const expected = {
      mastered: 'No mastered concepts yet',
      ready: 'Nothing ready right now',
      notyet: 'All concepts are accessible!',
    };

    for (const [zone, message] of Object.entries(expected)) {
      const block = zones[zone as keyof typeof zones];
      const list = listOf(block);
      const messageIndex = block.indexOf(message);
      const paragraphIndex = block.indexOf('<p className=', list.end);
      assert.ok(messageIndex > list.end, `${zone}: empty message renders after the list`);
      assert.ok(
        paragraphIndex > list.end && paragraphIndex < messageIndex,
        `${zone}: empty message stays a paragraph`,
      );
      assert.equal(list.block.includes(message), false, `${zone}: empty message is not a list item`);
    }
  });
});

describe('recommendations zones: surrounding contract', () => {
  it('adds no visible marker, list role or live region', () => {
    assert.equal(/list-(disc|decimal|none)|listStyleType/.test(page), false);
    assert.equal(/role="list"/.test(page), false);
    assert.equal(/aria-live/.test(page), false);
  });

  it('keeps the tab panel wiring untouched', () => {
    assert.ok(page.includes('id="rec-panel-zones"'));
    assert.ok(page.includes('aria-labelledby="rec-tab-zones"'));
    assert.ok(page.includes("activeTab === 'zones'"));
    assert.equal((page.match(/<AnimatePresence mode="wait">/g) ?? []).length, 2);
  });

  it('adds no server function, RPC schema or migration for the lists', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('rec-zone-'), false, `${file} gained zone list markup`);
    }
  });
});
