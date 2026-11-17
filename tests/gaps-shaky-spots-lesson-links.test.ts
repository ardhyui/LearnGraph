/**
 * Every card in "Shaky spots" on `/gaps` opens its lesson.
 *
 * The card says which concepts are shaky, but each spot was only readable: a
 * learner still had to copy the concept id or find the lesson by hand. Each
 * group now ends with one small "Open the lesson" link that carries the concept
 * name in its accessible name, following the recommendations pages
 * (PR #137/#138/#139) and the "Reviews due" list (PR #140). The page is locked
 * statically so the link stays the last child of the text block, the name and
 * explanation stay plain text, the severity colours/keys/hover stay, and no
 * read, RPC or migration is added.
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

const cardStart = page.indexOf('Shaky spots');
const cardEnd = page.indexOf('{/* Review Queue */}', cardStart);
const card = cardStart >= 0 && cardEnd > cardStart ? page.slice(cardStart, cardEnd) : '';

const LINK_CLASS =
  'className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"';

interface GroupSpec {
  kind: 'missing' | 'partial' | 'forgotten' | 'misconceptions';
  key: string;
  iconKind: string;
  descriptions: string[];
}

const GROUPS: GroupSpec[] = [
  {
    kind: 'missing',
    key: 'missing-',
    iconKind: 'missing',
    descriptions: ['Ready to learn — not started yet', 'Unlocks:'],
  },
  {
    kind: 'partial',
    key: 'partial-',
    iconKind: 'partial',
    descriptions: ['{gap.mastery}% mastered', 'data-testid="mastery-source"'],
  },
  {
    kind: 'forgotten',
    key: 'forgotten-',
    iconKind: 'forgotten',
    descriptions: ['Due for a review', 'data-testid="mastery-source"'],
  },
  {
    kind: 'misconceptions',
    key: 'misconception-',
    iconKind: 'misconception',
    descriptions: ["Something here was understood the wrong way"],
  },
];

function groupBlock(spec: GroupSpec): string {
  const start = card.indexOf(`{gaps.${spec.kind}.map((gap, i) => (`);
  if (start < 0) return '';
  // The closing of the mapped group sits at the same indentation as the map
  // opening; `))}` alone would match the className expression on the row.
  const tail = card.slice(start).match(/\n {22}\)\)\}/);
  if (!tail || tail.index === undefined) return '';
  return card.slice(start, start + tail.index + tail[0].length);
}

describe('gaps shaky spots: each card opens its lesson', () => {
  it('renders one lesson link per shaky-spot group', () => {
    assert.ok(cardStart > 0, 'the Shaky spots card still exists');
    assert.ok(cardEnd > cardStart, 'the card is closed before the Review Queue');
    assert.equal((card.match(/<Link\b/g) ?? []).length, 4);
    assert.equal((card.match(/<\/Link>/g) ?? []).length, 4);
    assert.equal((card.match(/Open the lesson/g) ?? []).length, 4);
    for (const spec of GROUPS) {
      const block = groupBlock(spec);
      assert.ok(block, `the ${spec.kind} group still rounds its map with )) }`);
      assert.equal((block.match(/<Link\b/g) ?? []).length, 1, `${spec.kind} gained an extra link`);
      assert.equal((block.match(/<\/Link>/g) ?? []).length, 1);
    }
  });

  it('links to the existing lesson route with the listed concept', () => {
    for (const spec of GROUPS) {
      const block = groupBlock(spec);
      const linkStart = block.indexOf('<Link');
      const openTag = block.slice(linkStart, block.indexOf('>', linkStart) + 1);
      assert.ok(openTag.startsWith('<Link'), `${spec.kind} link opens with <Link`);
      assert.ok(openTag.includes('to="/learn/$conceptId"'), `${spec.kind} links to the lesson route`);
      assert.ok(openTag.includes('params={{ conceptId: gap.conceptId }}'), `${spec.kind} passes its concept`);
    }
  });

  it('keeps the agreed link styling, icon and accessible name', () => {
    for (const spec of GROUPS) {
      const block = groupBlock(spec);
      const linkStart = block.indexOf('<Link');
      const openTag = block.slice(linkStart, block.indexOf('>', linkStart) + 1);
      const linkEnd = block.indexOf('</Link>', linkStart);
      const linkBlock = block.slice(linkStart, linkEnd + '</Link>'.length);
      assert.ok(openTag.includes(LINK_CLASS), `${spec.kind} keeps the agreed link classes`);
      assert.ok(linkBlock.includes('<BookOpen className="h-3 w-3" aria-hidden="true" />'), `${spec.kind} keeps the decorative icon`);
      assert.match(
        linkBlock,
        /Open the lesson\s*\n\s*<span className="sr-only">: \{conceptLabel\(gap\.conceptId, gap\.conceptName\)\}<\/span>/,
        `${spec.kind} keeps the visible label and unique accessible name`,
      );
      assert.equal((linkBlock.match(/<span className="sr-only">/g) ?? []).length, 1);
    }
  });

  it('places each link after the last explanation and as the last child of the text block', () => {
    for (const spec of GROUPS) {
      const block = groupBlock(spec);
      const textBlockStart = block.indexOf('<div className="flex-1">');
      const linkStart = block.indexOf('<Link');
      assert.ok(textBlockStart > 0, `${spec.kind} still has its text block`);
      assert.ok(linkStart > textBlockStart, `${spec.kind} link is inside the text block`);
      for (const marker of spec.descriptions) {
        const at = block.indexOf(marker);
        assert.ok(at > 0, `${spec.kind} keeps "${marker}"`);
        assert.ok(linkStart > at, `${spec.kind} link follows "${marker}"`);
      }
      assert.match(
        block.slice(block.indexOf('</Link>', linkStart)),
        /^<\/Link>\s*<\/div>\s*<\/div>\s*<\/motion\.div>/,
        `${spec.kind} link is the last child of the text block`,
      );
    }
  });

  it('keeps the concept name and explanations as plain text', () => {
    for (const spec of GROUPS) {
      const block = groupBlock(spec);
      const linkStart = block.indexOf('<Link');
      const linkEnd = block.indexOf('</Link>', linkStart);
      const linkBlock = block.slice(linkStart, linkEnd);
      assert.ok(
        block.includes(
          '<p className="font-medium text-foreground">{conceptLabel(gap.conceptId, gap.conceptName)}</p>',
        ),
        `${spec.kind} keeps the concept name`,
      );
      const nameAt = block.indexOf('<p className="font-medium text-foreground">');
      assert.ok(nameAt >= 0 && nameAt < linkStart, `${spec.kind} name stays outside the link`);
      assert.equal(linkBlock.includes('{conceptLabel(gap.conceptId, gap.conceptName)}</p>'), false);
      assert.equal(/<p\b/.test(linkBlock), false, `${spec.kind} link wraps no explanation`);
    }
  });

  it('keeps each row key, hover animation, icon and severity colour', () => {
    for (const spec of GROUPS) {
      const block = groupBlock(spec);
      const rowStart = block.indexOf('<motion.div');
      const rowTag = block.slice(rowStart, block.indexOf('>', rowStart) + 1);
      assert.ok(rowTag.includes(`key={\`${spec.key}\${i}\`}`), `${spec.kind} keeps its unique key`);
      assert.ok(rowTag.includes('whileHover={{ scale: 1.01 }}'), `${spec.kind} keeps the hover animation`);
      assert.ok(
        rowTag.includes("className={cn('p-4 rounded-xl border', getSeverityColor(gap.severity))}"),
        `${spec.kind} keeps the severity colour`,
      );
      assert.ok(block.includes(`{getGapIcon('${spec.iconKind}')}`), `${spec.kind} keeps its gap icon`);
    }
  });

  it('keeps the two mastery-source lines as plain text', () => {
    assert.equal((card.match(/data-testid="mastery-source"/g) ?? []).length, 2);
    assert.equal(
      (card.match(/<p className="text-xs mt-1 opacity-60" data-testid="mastery-source">\{masterySourceLabel\(gap\.masterySource\)\}<\/p>/g) ?? [])
        .length,
      2,
    );
  });

  it('keeps the summary, empty state, list container and group order', () => {
    assert.ok(card.includes('<p className="text-sm text-muted-foreground mb-3">{shakySummary}</p>'));
    assert.ok(card.includes('No shaky spots right now — nice work!'));
    assert.ok(card.includes('className="space-y-3 max-h-96 overflow-y-auto scrollbar-hide"'));
    const order = GROUPS.map((spec) => card.indexOf(`{gaps.${spec.kind}.map(`));
    assert.ok(order.every((at) => at > 0), 'all four groups still render');
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'groups keep missing → partial → forgotten → misconceptions');
  });

  it('adds no focus, live region, button or extra role to the links', () => {
    for (const spec of GROUPS) {
      const block = groupBlock(spec);
      const linkStart = block.indexOf('<Link');
      const linkEnd = block.indexOf('</Link>', linkStart);
      const linkBlock = block.slice(linkStart, linkEnd);
      assert.equal(/aria-live/.test(linkBlock), false, `${spec.kind} link gained a live region`);
      assert.equal(/\.focus\(\)/.test(linkBlock), false, `${spec.kind} link forces focus`);
      assert.equal(/tabIndex/.test(linkBlock), false, `${spec.kind} link gained a tab stop`);
      assert.equal(/role=/.test(linkBlock), false, `${spec.kind} link gained a role`);
      assert.equal(/<button\b/.test(linkBlock), false, `${spec.kind} link became a button`);
    }
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
