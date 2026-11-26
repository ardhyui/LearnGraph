/**
 * Status page: card status is readable without sight.
 *
 * The algorithm and phase cards only showed their state through coloured
 * icons, and the legend under the phase grid named Complete/Pending/Error
 * without being connected to any card. Every decorative icon and colour dot
 * was announced too. The page is locked statically so the two exact `sr-only`
 * sentences, the hidden icons and the card order stay put — without adding a
 * live region, focus handling, server function, RPC or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'status.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');

const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

const onceIn = (text: string, literal: string, where: string) =>
  assert.equal(
    text.split(literal).length - 1,
    1,
    `${literal} appears once in ${where}`,
  );

// The card components only: counts in the page body cannot hide a change here.
const component = (start: string, end: string) => {
  const from = page.indexOf(start);
  const to = page.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} block is found`);
  return page.slice(from, to);
};

const algorithmCard = component('function AlgorithmCard', 'function PhaseCard');
const phaseCard = component('function PhaseCard', 'function StatusPage');

describe('status page: card status has a text equivalent', () => {
  it('announces "Operational" or "Not operational" for every algorithm card', () => {
    assert.ok(
      algorithmCard.includes(
        '<span className="sr-only">{isOperational ? \'Operational\' : \'Not operational\'}</span>',
      ),
      'the algorithm status sentence is exact',
    );
    assert.ok(
      algorithmCard.includes("const isOperational = status === 'operational';"),
      'the sentence is driven by the same state as the icon',
    );

    // The sentence follows the status icon in source order, so it is read
    // where the icon is drawn.
    const lastIcon = algorithmCard.lastIndexOf('<XCircle');
    assert.ok(lastIcon > 0, 'the not-operational icon is still rendered');
    assert.ok(
      algorithmCard.indexOf('<span className="sr-only">') > lastIcon,
      'the sentence comes right after the status icon',
    );

    // Both status icons stay, now hidden from the accessibility tree.
    assert.ok(
      algorithmCard.includes(
        '<CheckCircle2 className="text-emerald-500" size={20} aria-hidden="true" />',
      ),
    );
    assert.ok(
      algorithmCard.includes('<XCircle className="text-red-500" size={20} aria-hidden="true" />'),
    );
  });

  it('announces Complete / Pending / Error with the same words as the legend', () => {
    assert.ok(
      phaseCard.includes(
        '<span className="sr-only">{isComplete ? \'Complete\' : isPending ? \'Pending\' : \'Error\'}</span>',
      ),
      'the phase status sentence is exact',
    );
    assert.ok(
      phaseCard.includes("const isComplete = status === 'complete';") &&
        phaseCard.includes("const isPending = status === 'pending';"),
      'the sentence is driven by the same state as the icon',
    );

    const lastIcon = phaseCard.lastIndexOf('<XCircle');
    assert.ok(lastIcon > 0, 'the error icon is still rendered');
    assert.ok(
      phaseCard.indexOf('<span className="sr-only">') > lastIcon,
      'the sentence comes right after the status icon',
    );

    // All three phase icons stay, now hidden from the accessibility tree.
    assert.ok(
      phaseCard.includes(
        '<CheckCircle2 className="text-emerald-500" size={16} aria-hidden="true" />',
      ),
    );
    assert.ok(phaseCard.includes('<Clock className="text-slate-400" size={16} aria-hidden="true" />'));
    assert.ok(phaseCard.includes('<XCircle className="text-red-500" size={16} aria-hidden="true" />'));

    // The visible legend keeps the same three words the cards announce.
    for (const word of ['Complete', 'Pending', 'Error']) {
      assert.ok(
        page.includes(`<span className="text-muted-foreground">${word}</span>`),
        `the legend still shows ${word}`,
      );
    }
  });

  it('adds exactly two sr-only sentences and one sr-only refresh line', () => {
    assert.equal(count(page, /className="sr-only"/g), 3);
    assert.equal(count(page, /<span className="sr-only">/g), 2);
  });
});

describe('status page: decorative icons and dots are hidden', () => {
  it('hides every icon without changing size or classes', () => {
    const icons =
      page.match(
        /<(?:Icon|Clock|CheckCircle2|XCircle|AlertTriangle|Activity|Sparkles|RefreshCw|Loader2|AlertCircle|Server|BarChart3|Brain)\b[^>]*>/g,
      ) ?? [];
    assert.equal(icons.length, 24, 'the page still renders twenty-four icons');
    for (const icon of icons) {
      assert.ok(icon.includes('aria-hidden="true"'), `hidden: ${icon}`);
    }

    // Sizes and classes are untouched by the change.
    assert.equal(count(page, /<Icon size=\{24\} aria-hidden="true" \/>/g), 1);
    assert.equal(count(page, /<Icon size=\{20\} aria-hidden="true" \/>/g), 1);
    assert.equal(count(page, /<Icon size=\{20\} className="text-white" aria-hidden="true" \/>/g), 1);
    assert.equal(count(page, /<Clock size=\{14\} aria-hidden="true" \/>/g), 1);
    assert.equal(count(page, /size=\{20\} aria-hidden="true"/g), 7);
    assert.equal(count(page, /size=\{16\} aria-hidden="true"/g), 6);
  });

  it('hides the four status dots and the three legend dots', () => {
    const dotTags =
      page.match(
        /<(?:motion\.div|div)\b[^>]*rounded-full bg-(?:emerald|slate|amber|red)-(?:400|500)[^>]*>/g,
      ) ?? [];
    assert.equal(dotTags.length, 7, 'four status dots plus three legend dots');
    for (const tag of dotTags) {
      assert.ok(tag.includes('aria-hidden="true"'), `hidden: ${tag.trim()}`);
    }
  });

  it('accounts for every hidden decoration on the page', () => {
    assert.equal(count(page, /aria-hidden="true"/g), 31);
  });
});

describe('status page: card contracts and order are unchanged', () => {
  it('keeps the four algorithm cards in order', () => {
    const names = ['ZPD Computation', 'Gap Detection', 'Memory Decay', 'Spaced Repetition'];
    let previous = -1;
    for (const name of names) {
      const at = page.indexOf(`name="${name}"`);
      assert.ok(at > previous, `${name} is present and keeps its order`);
      assert.equal(count(page, new RegExp(`name="${name}"`, 'g')), 1, `${name} once`);
      previous = at;
    }
  });

  it('keeps the six development phases and their statuses in order', () => {
    const phases = [
      "phase1: { name: 'Core Database', status: 'complete' },",
      "phase1_5: { name: 'Admin UI', status: 'complete' },",
      "phase2: { name: 'Learner Model', status: 'pending' },",
      "phase3: { name: 'Knowledge Model', status: 'pending' },",
      "phase4: { name: 'ZPD Engine', status: 'pending' },",
      "phase5: { name: 'Gap Analysis', status: 'pending' },",
    ];
    let previous = -1;
    for (const line of phases) {
      const at = page.indexOf(line);
      assert.ok(at > previous, `${line} is present and keeps its order`);
      previous = at;
    }
    onceIn(page, '{Object.entries(statusData.phases).map(([phase, data]) => (', 'the phase grid');
  });

  it('keeps the refresh path, auto-refresh and section order intact', () => {
    onceIn(page, 'onClick={fetchStatus}', 'the page');
    onceIn(page, 'const interval = setInterval(fetchStatus, 30000);', 'the page');
    onceIn(page, '<LearningMeasures />', 'the page');
    onceIn(page, '<button', 'the page');

    const sections = ['Core Services', 'Data Status', 'Algorithm Health', 'Development Phases'];
    let previous = -1;
    for (const title of sections) {
      const at = page.indexOf(title, previous + 1);
      assert.ok(at > previous, `${title} is present and keeps its order`);
      previous = at;
    }
    assert.match(page, /\n\s+Refresh\n\s+<\/button>/);
  });
});

describe('status page: no new semantics or data path', () => {
  it('adds only the refresh live region and no focus handling or extra control', () => {
    assert.equal(count(page, /aria-live=/g), 1, 'the Refresh line is the only live region');
    assert.equal(count(page, /\brole=/g), 1, 'the Refresh line is the only role');
    assert.ok(
      page.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the live region is the polite refresh line',
    );
    assert.doesNotMatch(page, /tabIndex|tabindex/);
    assert.doesNotMatch(page, /\.focus\(/);
  });

  it('adds no server function, RPC call or migration', () => {
    assert.doesNotMatch(page, /createServerFn|graphCall|rpc-schemas/);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Not operational'), false, `${file} gained status copy`);
      assert.equal(other.includes('Algorithm Health'), false, `${file} gained status markup`);
    }
  });
});
