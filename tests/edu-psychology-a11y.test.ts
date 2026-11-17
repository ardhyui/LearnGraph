/**
 * /edu-psychology: the two open/close patterns are usable without sight.
 *
 * Both patterns only showed their state through colour and icon rotation: the
 * expandable section buttons had no `aria-expanded`/`aria-controls` and their
 * content had no `id`, and the psychometric category buttons did the same for a
 * detail panel that had no `id`. Decorative icons (section icon, chevron,
 * category emoji, colour dots) were announced too. The page is locked
 * statically so the exact state expressions, the single id pair per pattern and
 * the hidden decoration stay put — without changing clicks, classes, section
 * content or order, and without adding a server function, RPC or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'edu-psychology.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');

const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const onceIn = (text: string, literal: string, where: string) => {
  assert.equal(count(text, new RegExp(escape(literal), 'g')), 1, `${literal} once in ${where}`);
};

// The two components only, so counts elsewhere on the page cannot hide changes.
const sectionStart = page.indexOf('// Expandable Section');
const sectionEnd = page.indexOf('function EduPsychologyPage');
const section = page.slice(sectionStart, sectionEnd);

const wheelStart = page.indexOf('// Psychometric Domains - Full 39 Domain Display');
const wheelEnd = page.indexOf('// Code Location Component');
const wheel = page.slice(wheelStart, wheelEnd);

describe('edu-psychology: expandable sections announce their state', () => {
  it('marks the six section buttons with their exact expanded expression', () => {
    assert.ok(sectionStart > 0 && sectionEnd > sectionStart, 'the section component is found');
    assert.ok(wheelStart > 0 && wheelEnd > wheelStart, 'the category component is found');

    onceIn(section, 'aria-expanded={isOpen}', 'the section component');
    onceIn(wheel, 'aria-expanded={expandedCategory === categoryName}', 'the category component');
    // The page had no expanded state before; this change adds exactly these two.
    assert.equal(count(page, /aria-expanded=/g), 2);
  });

  it('pairs each button with exactly one controlled content id', () => {
    onceIn(section, 'const contentId = useId();', 'the section component');
    onceIn(section, 'aria-controls={contentId}', 'the section component');
    onceIn(section, 'id={contentId}', 'the section component');
    onceIn(page, "aria-controls=\"psychometric-category-detail\"", 'the page');
    onceIn(page, 'id="psychometric-category-detail"', 'the page');
    assert.equal(count(page, /aria-controls=/g), 2);
    onceIn(page, "import { useId, useState } from 'react';", 'the page');
  });

  it('keeps the section clicks, classes and animation contract unchanged', () => {
    onceIn(section, 'onClick={() => setIsOpen(!isOpen)}', 'the section component');
    onceIn(
      section,
      'className="w-full flex items-center justify-between p-6 hover:bg-muted/50 transition-colors"',
      'the section component',
    );
    onceIn(section, 'const [isOpen, setIsOpen] = useState(true);', 'the section component');
    onceIn(section, '<AnimatePresence>', 'the section component');
    onceIn(section, 'initial={{ height: 0, opacity: 0 }}', 'the section component');
    onceIn(section, "animate={{ height: 'auto', opacity: 1 }}", 'the section component');
    onceIn(section, 'exit={{ height: 0, opacity: 0 }}', 'the section component');
    onceIn(section, 'className="px-6 pb-6"', 'the section component');
    onceIn(section, '<h2 className="text-xl font-bold text-foreground">{title}</h2>', 'the section component');
  });

  it('keeps every section title and its order', () => {
    const titles = [
      'Zone of Proximal Development (ZPD)',
      "Bloom's Taxonomy",
      'Scaffolding Strategies',
      'Forgetting Curve & Spaced Repetition',
      'Psychometric Profiling (39 Domains)',
      'Knowledge Graph & Prerequisites',
    ];
    const positions = titles.map((title) => page.indexOf(`title="${title}"`));
    for (let i = 0; i < positions.length; i += 1) {
      assert.ok(positions[i] > 0, `${titles[i]} remains a section`);
      if (i > 0) assert.ok(positions[i] > positions[i - 1], `${titles[i]} keeps its order`);
    }
  });
});

describe('edu-psychology: category buttons announce their panel', () => {
  it('keeps the category clicks, classes and order unchanged', () => {
    onceIn(
      wheel,
      'onClick={() => setExpandedCategory(expandedCategory === categoryName ? null : categoryName)}',
      'the category component',
    );
    onceIn(
      wheel,
      "'border-pink-500 bg-pink-500/10 dark:bg-pink-500/20 shadow-lg scale-[1.02]'",
      'the category component',
    );
    onceIn(
      wheel,
      "'border-border hover:border-muted-foreground/50 hover:bg-muted/50'",
      'the category component',
    );

    const categories = [
      'Big Five Personality',
      'Dark Triad',
      'Emotional Intelligence',
      'Communication & Social',
      'Decision Making & Risk',
      'Motivation & Achievement',
      'Values & Interests',
      'Coping & Wellbeing',
      'Cognitive',
      'Social Cognition',
      'Worldview',
      'Work & Lifestyle',
    ];
    const positions = categories.map((name) => page.indexOf(`'${name}': {`));
    for (let i = 0; i < positions.length; i += 1) {
      assert.ok(positions[i] > 0, `${categories[i]} remains a category`);
      if (i > 0) assert.ok(positions[i] > positions[i - 1], `${categories[i]} keeps its order`);
    }
  });

  it('keeps the detail panel content complete', () => {
    onceIn(wheel, '{expandedCategory && (', 'the category component');
    assert.ok(wheel.includes('{category.domains.length} domain{category.domains.length > 1 ? \'s\' : \'\'}'));
    onceIn(
      wheel,
      "{ALL_PSYCHOMETRIC_DOMAINS[expandedCategory as keyof typeof ALL_PSYCHOMETRIC_DOMAINS].domains.map((domain) => (",
      'the category component',
    );
    onceIn(wheel, '<h4 className="font-semibold text-foreground">{domain.name}</h4>', 'the category component');
    onceIn(wheel, '<p className="text-sm text-muted-foreground mt-1">{domain.desc}</p>', 'the category component');
    onceIn(wheel, '{domain.markers.map((marker) => (', 'the category component');
    onceIn(wheel, '{domain.eduRelevance}', 'the category component');
    onceIn(wheel, '<code className="text-xs bg-gray-900 text-green-400 px-2 py-0.5 rounded">{domain.id}</code>', 'the category component');
  });
});

describe('edu-psychology: decorative icons are hidden', () => {
  it('hides both section icons without changing size or classes', () => {
    onceIn(section, '<Icon size={24} className="text-white" aria-hidden="true" />', 'the section component');
    onceIn(
      section,
      '<ChevronDown size={24} aria-hidden="true" className={`text-muted-foreground transition-transform ${isOpen ? \'rotate-180\' : \'\'}`} />',
      'the section component',
    );
    assert.equal(count(section, /aria-hidden="true"/g), 2);
  });

  it('hides the category emoji and colour dots', () => {
    onceIn(wheel, '<span className="text-2xl" aria-hidden="true">{category.icon}</span>', 'the category component');
    assert.equal(count(wheel, /className="text-3xl" aria-hidden="true"/g), 1);
    assert.equal(count(wheel, /aria-hidden="true"/g), 4);
    // Both colour dots (grid + quick reference) stay decorative.
    assert.equal(count(wheel, /className="w-3 h-3 rounded-full"[\s\S]*?aria-hidden="true"/g), 1);
    assert.equal(count(wheel, /className="w-2 h-2 rounded-full flex-shrink-0"[\s\S]*?aria-hidden="true"/g), 1);
    // Six decorative icons on the page: two in the section, four in the wheel.
    assert.equal(count(page, /aria-hidden="true"/g), 6);
  });

  it('adds no live region, role or focus change', () => {
    assert.equal(count(page, /aria-live/g), 0);
    assert.equal(count(page, /role=/g), 0);
    assert.equal(count(page, /\.focus\(/g), 0);
    assert.equal(count(page, /tabIndex/g), 0);
  });
});

describe('edu-psychology: no new data path', () => {
  it('adds no server function, RPC call or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(
        other.includes('psychometric-category-detail'),
        false,
        `${file} gained the detail panel id`,
      );
      assert.equal(other.includes('edu-psychology'), false, `${file} gained page markup`);
    }
  });
});
