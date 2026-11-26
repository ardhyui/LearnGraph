/**
 * Data Entry action messages are announced (`/data-entry`).
 *
 * The page reports the result of every save through one temporary banner
 * (`Learner added successfully!`, `Invalid JSON format`, …). The banner was a
 * plain animated `motion.div`: a screen reader never heard success nor the
 * error, because no live region was present, and the decorative `Check`/
 * `AlertCircle` icons were read as part of the message.
 *
 * This file locks the banner as a live region derived from `message.type`
 * (`status`/`polite` for success, `alert`/`assertive` for errors), the two
 * hidden icons with their original classes, the untouched animation, timing
 * and copy of `showMessage`, and that no other part of the page became a live
 * region. The page gains no server function, RPC call or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'data-entry.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

const BANNER_START = page.indexOf('{/* Message Banner */}');
const BANNER_END =
  page.indexOf('</AnimatePresence>', BANNER_START) + '</AnimatePresence>'.length;
assert.ok(BANNER_START > 0, 'the message banner block is rendered');
assert.ok(BANNER_END > BANNER_START, 'the message banner block is closed');
const banner = page.slice(BANNER_START, BANNER_END);

describe('data-entry message banner: role and live politeness follow message.type', () => {
  it('derives role from message.type', () => {
    const roleLine = "role={message.type === 'success' ? 'status' : 'alert'}";
    assert.equal(
      count(banner, /role=\{message\.type === 'success' \? 'status' : 'alert'\}/g),
      1,
      'one role expression, success → status, error → alert',
    );
    assert.ok(banner.includes(roleLine));
  });

  it('derives aria-live from message.type', () => {
    assert.equal(
      count(banner, /aria-live=\{message\.type === 'success' \? 'polite' : 'assertive'\}/g),
      1,
      'one aria-live expression, success → polite, error → assertive',
    );
    assert.ok(banner.includes("aria-live={message.type === 'success' ? 'polite' : 'assertive'}"));
  });

  it('keeps role and aria-live on the same animated element', () => {
    const opening = banner.match(/<motion\.div\b[\s\S]*?>/)?.[0] ?? '';
    assert.ok(opening.includes('role={message.type'), 'role sits on the motion.div');
    assert.ok(opening.includes('aria-live={message.type'), 'aria-live sits on the motion.div');
    assert.equal(count(banner, /<motion\.div/g), 1, 'the banner stays one motion.div');
  });
});

describe('data-entry message banner: animation, classes and copy stay', () => {
  it('keeps the banner inside AnimatePresence and conditional on message', () => {
    assert.ok(banner.includes('{message && ('), 'banner stays conditional so role is present when mounted');
    assert.equal(count(banner, /<AnimatePresence>/g), 1);
    assert.equal(count(banner, /<\/AnimatePresence>/g), 1);
  });

  it('keeps the three animation states exactly', () => {
    assert.ok(banner.includes('initial={{ opacity: 0, y: -10 }}'), 'initial untouched');
    assert.ok(banner.includes('animate={{ opacity: 1, y: 0 }}'), 'animate untouched');
    assert.ok(banner.includes('exit={{ opacity: 0, y: -10 }}'), 'exit untouched');
  });

  it('keeps the banner classes for success and error', () => {
    assert.ok(banner.includes("'mb-6 px-4 py-3 rounded-xl flex items-center gap-3',"), 'base classes untouched');
    assert.ok(
      banner.includes(
        "'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'",
      ),
      'success classes untouched',
    );
    assert.ok(
      banner.includes("'bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400'"),
      'error classes untouched',
    );
  });

  it('renders message.text exactly once', () => {
    assert.equal(count(banner, /\{message\.text\}/g), 1);
    assert.ok(banner.includes('<span className="font-medium">{message.text}</span>'));
  });
});

describe('data-entry message banner: icons are decorative', () => {
  it('hides Check and AlertCircle without changing their classes', () => {
    assert.ok(banner.includes('<Check className="w-5 h-5" aria-hidden="true" />'), 'Check hidden');
    assert.ok(
      banner.includes('<AlertCircle className="w-5 h-5" aria-hidden="true" />'),
      'AlertCircle hidden',
    );
    assert.equal(count(banner, /aria-hidden="true"/g), 2);
  });
});

describe('data-entry message banner: no replaced name or new live region', () => {
  it('adds no aria-label or aria-labelledby to the banner', () => {
    assert.equal(count(banner, /aria-label=/g), 0);
    assert.equal(count(banner, /aria-labelledby=/g), 0);
    assert.equal(count(banner, /aria-atomic=/g), 0);
  });

  it('keeps aria-live on the banner and the four save status lines only', () => {
    assert.equal(count(page, /aria-live=/g), 5, 'the banner plus all four save status lines');
    assert.equal(count(banner, /aria-live=/g), 1);
    const learnerFormStart = page.indexOf('<form onSubmit={handleAddLearner}');
    assert.ok(learnerFormStart > 0, 'the learner form exists');
    const learnerStatus = page.slice(learnerFormStart, page.indexOf('</form>', learnerFormStart));
    assert.equal(count(learnerStatus, /aria-live=/g), 1, 'the learner form holds one live region');
    const conceptFormStart = page.indexOf('<form onSubmit={handleAddConcept}');
    assert.ok(conceptFormStart > 0, 'the concept form exists');
    const conceptStatus = page.slice(conceptFormStart, page.indexOf('</form>', conceptFormStart));
    assert.equal(count(conceptStatus, /aria-live=/g), 1, 'the concept form holds one live region');
    const prereqFormStart = page.indexOf('<form onSubmit={handleAddPrerequisite}');
    assert.ok(prereqFormStart > 0, 'the prerequisite form exists');
    const prereqStatus = page.slice(prereqFormStart, page.indexOf('</form>', prereqFormStart));
    assert.equal(count(prereqStatus, /aria-live=/g), 1, 'the prerequisite form holds one live region');
    const stateFormStart = page.indexOf('<form onSubmit={handleAddKnowledgeState}');
    assert.ok(stateFormStart > 0, 'the knowledge-state form exists');
    const stateStatus = page.slice(stateFormStart, page.indexOf('</form>', stateFormStart));
    assert.equal(count(stateStatus, /aria-live=/g), 1, 'the knowledge-state form holds one live region');
    const tabs = page.slice(page.indexOf('role="tablist"'), page.indexOf('{/* Overview Tab'));
    assert.ok(tabs.length > 0, 'the tab list block exists');
    assert.equal(count(tabs, /aria-live=/g), 0, 'tablist/tabpanel markup stays outside live regions');
  });

  it('keeps showMessage and its 5000 ms auto-dismiss untouched', () => {
    assert.ok(
      page.includes("const showMessage = (type: 'success' | 'error', text: string) => {\n    setMessage({ type, text });\n    setTimeout(() => setMessage(null), 5000);\n  };"),
      'showMessage and timing are unchanged',
    );
    assert.equal(count(page, /setTimeout\(\(\) => setMessage\(null\), 5000\)/g), 1);
  });
});

describe('data-entry message banner: no new data path', () => {
  it('adds no server function, RPC call or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('data-entry-message'), false, `${file} gained banner wiring`);
      assert.equal(other.includes('aria-live'), false, `${file} gained a live region`);
    }
  });
});
