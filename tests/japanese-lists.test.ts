/**
 * Japanese dashboard lists (`/japanese`).
 *
 * Two groups of cards on the page used plain `<div>` containers: the three
 * summary cards right after "Menyiapkan peta belajar…" and the module grid in
 * "Peta kemampuan". A screen reader did not know either group was one list and
 * could not jump item by item. This file locks the summary as a `<ul
 * aria-label="Ringkasan">` whose three cards are direct `<li>` elements, the
 * module grid as a `<ul>` labelled `Modul ${level}` whose map opens directly on
 * a keyed `<li>`, and the surrounding section/footer order. No copy, visible
 * class, icon, button, server function, RPC or migration changes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'japanese.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;
const blockAfter = (text: string, marker: string) => {
  const start = text.indexOf(marker);
  assert.ok(start >= 0, `missing marker: ${marker}`);
  const end = text.indexOf('</ul>', start);
  assert.ok(end > start, `missing closing </ul> for ${marker}`);
  return text.slice(start, end + '</ul>'.length);
};
const ordered = (text: string, markers: string[]) => {
  let previous = -1;
  for (const marker of markers) {
    const index = text.indexOf(marker);
    assert.ok(index > previous, `missing or out of order: ${marker}`);
    previous = index;
  }
};

const SUMMARY_OPEN = '<ul aria-label="Ringkasan" className="grid gap-4 sm:grid-cols-3">';
const MODULES_OPEN = '<ul aria-label={`Modul ${level}`} className="grid gap-3 sm:grid-cols-2">';
const MODULE_CARD = '<li key={m.id} className="rounded-2xl border border-border bg-card p-4">';

describe('japanese lists: summary cards are one named list', () => {
  it('renders exactly one named grid list with three direct <li> cards', () => {
    assert.equal(
      count(page, new RegExp(SUMMARY_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')),
      1,
    );
    const block = blockAfter(page, SUMMARY_OPEN);
    assert.equal(count(block, /<li className="rounded-2xl border border-border bg-card p-5">/g), 3);
    assert.equal(count(block, /<div/g), 0, 'no wrapper div replaces a card');
    assert.equal(count(block, /<section/g), 0, 'the section wrapper is gone');
    assert.equal(count(block, /key=/g), 0, 'static cards need no key');
    assert.equal(block.trimStart().startsWith(SUMMARY_OPEN), true);
  });

  it('keeps the three card texts and the Michi link in order', () => {
    const block = blockAfter(page, SUMMARY_OPEN);
    ordered(block, [
      'Topik dengan bukti latihan ≥80%',
      '{data.modules.filter((m) => m.mastery >= 80).length} / {data.modules.length}',
      'Sinyal latihan, bukan skor JLPT.',
      'Kanji Michi mulai dipelajari',
      '{data.michi?.learned ?? 0} / 72',
      "`Snapshot ${new Date(data.michi.at).toLocaleString('id-ID')}`",
      "'Buka Michi untuk memulai sinkron lokal.'",
      'Kanji jatuh tempo',
      '{data.michi?.due ?? 0}',
      'href="http://127.0.0.1:17831/ulang"',
      'Review di Michi →',
    ]);
    assert.equal(count(block, /<p className="mt-2 text-3xl font-semibold">/g), 3);
  });
});

describe('japanese lists: module cards are one named list', () => {
  it('maps the level filter straight to a keyed <li> with the same classes', () => {
    assert.equal(
      count(page, new RegExp(MODULES_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')),
      1,
    );
    const block = blockAfter(page, MODULES_OPEN);
    const mapHead = block.indexOf('.map((m) => (');
    assert.ok(mapHead > 0, 'module map present');
    const afterHead = block.slice(mapHead + '.map((m) => ('.length);
    assert.match(
      afterHead,
      /^\s*<li key=\{m\.id\} className="rounded-2xl border border-border bg-card p-4">/,
    );
    assert.equal(count(block, /<li /g), 1, 'one <li> per mapped module');
    assert.equal(count(block, /<article/g), 0, 'module rows are not articles');
    assert.equal(count(block, /<div key=/g), 0, 'no wrapper div per row');
    assert.ok(block.includes(MODULE_CARD));
  });

  it('keeps the module content, actions and order unchanged', () => {
    const block = blockAfter(page, MODULES_OPEN);
    ordered(block, [
      '<h3 className="font-semibold">{m.name}</h3>',
      '{m.description}',
      "{m.mode === 'external' ? 'Aktivitas tercatat' : 'Sinyal latihan'}",
      '{m.mastery}%',
      'm.lastScore ? ` · kuis terakhir ${m.lastScore}`',
      'Ulang disarankan:',
      'Saran sebelumnya: ',
      "'Bisa mulai dari sini'",
      "{m.mode === 'quiz' ? (",
      'Latihan kuis',
      'href={m.resource}',
      "{m.mode === 'michi' ? 'Latihan di Michi' : 'Buka sumber'}",
      "{m.mode === 'external' ? (",
      'Catat praktik',
    ]);
  });
});

describe('japanese lists: page order and surrounding sections stay put', () => {
  it('keeps the summary, session, skill map, practice form and footer order', () => {
    ordered(page, [
      'Menyiapkan peta belajar…',
      SUMMARY_OPEN,
      '<MichiSkillEvidence />',
      'Sesi hari ini · 90 menit',
      '<h2 id="path-title" className="text-xl font-semibold">',
      MODULES_OPEN,
      'Catat praktik: {data.modules.find((m) => m.id === practice)?.name}',
      'Naik level berdasarkan evaluasi lengkap membaca, listening dan output.',
    ]);
    assert.equal(count(page, /Menyiapkan peta belajar…/g), 1);
    assert.equal(count(page, /Sesi hari ini · 90 menit/g), 1);
    assert.equal(count(page, /Peta kemampuan/g), 1);
    assert.equal(count(page, /Catat praktik: \{data\.modules/g), 1);
    assert.equal(
      count(
        page,
        /<footer className="border-t border-border py-4 text-sm text-muted-foreground">/g,
      ),
      1,
    );
  });

  it('adds no marker class, extra live region or forced focus', () => {
    assert.equal(/list-(disc|decimal|none)|role="list"/.test(page), false);
    assert.equal(
      count(page, /aria-live=/g),
      3,
      'the practice saving, quiz grading and quiz start statuses',
    );
    assert.equal(/tabIndex|\.focus\(\)/.test(page), false);
    assert.equal(count(page, /role="/g), 8, 'alert, six status and the level group only');
    assert.equal(count(page, /aria-label=/g), 3, 'the two list labels and the level group only');
  });
});

describe('japanese lists: no new data path', () => {
  it('keeps exactly the four Japanese server functions imported', () => {
    const imports = page.slice(
      page.indexOf('import {\n  japaneseDashboard,'),
      page.indexOf("} from '@/server/japanese.functions';") +
        "} from '@/server/japanese.functions';".length,
    );
    assert.equal(
      imports,
      [
        'import {',
        '  japaneseDashboard,',
        '  startJapaneseQuiz,',
        '  submitJapaneseQuiz,',
        '  recordJapanesePractice,',
        "} from '@/server/japanese.functions';",
      ].join('\n'),
    );
    assert.equal(count(page, /japaneseDashboard/g), 3);
    assert.equal(count(page, /startJapaneseQuiz/g), 3);
    assert.equal(count(page, /submitJapaneseQuiz/g), 3);
    assert.equal(count(page, /recordJapanesePractice/g), 2);
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      assert.equal(source(file).includes('japanese-lists'), false, `${file} gained list wiring`);
    }
  });
});
