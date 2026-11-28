/**
 * Keyboard focus is visible on all five buttons of admin → Psychometrics
 * (`src/routes/admin/psychometrics.tsx`).
 *
 * The page renders five buttons: the error banner close, the success banner
 * close, **Compute Profiles**, **Save Scores** and the header of every domain
 * category. None of them had a `:focus-visible` style, while `src/styles.css`
 * has no global rule, so a keyboard user tabbing through the page saw no focus
 * indicator. None of them had a `type` either, which would make them submit
 * buttons if they ever moved inside a form. This file locks **type** first on
 * all five, the exact class string with the two focus classes appended at the
 * end, each handler, icon and label, the existing `disabled`/`aria-busy`
 * wiring and the file-wide counts. The category header stays without
 * `aria-expanded`/`aria-controls` (outside this session's scope), no new
 * `aria-busy` or live region is added, and no server function, RPC schema or
 * migration is added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'admin', 'psychometrics.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

const FOCUS_PAIR = 'focus-visible:outline-2 focus-visible:outline-primary';

/** The whole `<button>...</button>` element around a unique anchor. */
const buttonAt = (anchor: string) => {
  assert.equal(page.split(anchor).length - 1, 1, `the "${anchor}" anchor appears once`);
  const idx = page.indexOf(anchor);
  const open = page.lastIndexOf('<button', idx);
  assert.ok(open >= 0, `the "${anchor}" button has an opening tag`);
  const close = page.indexOf('</button>', open);
  assert.ok(close > open, `the "${anchor}" button is closed`);
  return page.slice(open, close + '</button>'.length);
};

const ERROR_CLOSE = buttonAt("onClick={() => setError('')}");
const SUCCESS_CLOSE = buttonAt("onClick={() => setSuccess('')}");
const COMPUTE = buttonAt('onClick={handleComputeProfiles}');
const SAVE = buttonAt('onClick={handleSaveScores}');
const CATEGORY = buttonAt('onClick={() => toggleCategory(category)}');

/** The five buttons with their exact class string and first-attribute type. */
const BUTTONS: Array<{ name: string; element: string; className: string }> = [
  {
    name: 'error banner close',
    element: ERROR_CLOSE,
    className: `ml-auto text-destructive/70 hover:text-destructive ${FOCUS_PAIR}`,
  },
  {
    name: 'success banner close',
    element: SUCCESS_CLOSE,
    className: `ml-auto text-emerald-500/70 hover:text-emerald-500 ${FOCUS_PAIR}`,
  },
  {
    name: 'Compute Profiles',
    element: COMPUTE,
    className: `btn btn-secondary flex items-center gap-2 disabled:opacity-50 ${FOCUS_PAIR}`,
  },
  {
    name: 'Save Scores',
    element: SAVE,
    className: `btn btn-success flex items-center gap-2 disabled:opacity-50 ${FOCUS_PAIR}`,
  },
  {
    name: 'category header',
    element: CATEGORY,
    className: `w-full px-6 py-4 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors ${FOCUS_PAIR}`,
  },
];

describe('/admin/psychometrics: every button shows keyboard focus', () => {
  it('each button carries its exact class string with the focus pair at the end', () => {
    for (const { name, element, className } of BUTTONS) {
      assert.ok(element.includes(`className="${className}"`), `${name} keeps its exact classes`);
      assert.ok(className.endsWith(FOCUS_PAIR), `${name} ends with the focus pair`);
    }
  });

  it('each button carries the focus pair exactly once', () => {
    for (const { name, element } of BUTTONS) {
      assert.equal(count(element, /focus-visible/g), 2, `${name} has both focus classes`);
    }
  });

  it('each button declares type="button" as the first attribute', () => {
    for (const { name, element } of BUTTONS) {
      assert.match(element, /^<button\s+type="button"/, `${name} starts with its type`);
    }
  });

  it('keeps type before the handler, the class string, disabled and aria-busy', () => {
    for (const { name, element } of BUTTONS) {
      const typeAt = element.indexOf('type="button"');
      assert.match(element, /^<button\s+type="button"/, `${name} types first`);
      if (element.includes('onClick=')) {
        assert.ok(typeAt < element.indexOf('onClick='), `${name} puts type before its handler`);
      }
      if (element.includes('className=')) {
        assert.ok(typeAt < element.indexOf('className='), `${name} puts type before its class`);
      }
      if (element.includes('disabled=')) {
        assert.ok(typeAt < element.indexOf('disabled='), `${name} puts type before disabled`);
      }
      if (element.includes('aria-busy=')) {
        assert.ok(typeAt < element.indexOf('aria-busy='), `${name} puts type before aria-busy`);
      }
    }
  });
});

describe('/admin/psychometrics: the buttons keep their behaviour', () => {
  it('both banner close buttons still clear their message', () => {
    assert.ok(ERROR_CLOSE.includes("onClick={() => setError('')}"), 'the error dismiss handler stays');
    assert.ok(ERROR_CLOSE.includes('<X className="w-4 h-4" />'), 'the small error X icon stays');
    assert.ok(SUCCESS_CLOSE.includes("onClick={() => setSuccess('')}"), 'the success dismiss handler stays');
    assert.ok(SUCCESS_CLOSE.includes('<X className="w-4 h-4" />'), 'the small success X icon stays');
    for (const [name, element] of [
      ['error', ERROR_CLOSE],
      ['success', SUCCESS_CLOSE],
    ] as const) {
      assert.equal(element.includes('aria-busy'), false, `no aria-busy on the ${name} close button`);
    }
  });

  it('Compute Profiles keeps its guard, busy marker, icon and label in order', () => {
    assert.ok(COMPUTE.includes('onClick={handleComputeProfiles}'), 'the handler stays');
    assert.ok(COMPUTE.includes('disabled={saving || !hasScores}'), 'disabled stays driven by saving and scores');
    assert.ok(COMPUTE.includes('aria-busy={computing}'), 'aria-busy is driven by computing');
    assert.ok(
      COMPUTE.includes("<RefreshCw className={cn('w-4 h-4', saving && 'animate-spin')} />"),
      'the spinner stays driven by saving',
    );
    assert.ok(COMPUTE.includes('Compute Profiles'), 'the label stays');
    const disabledAt = COMPUTE.indexOf('disabled={saving || !hasScores}');
    const busyAt = COMPUTE.indexOf('aria-busy={computing}');
    const classAt = COMPUTE.indexOf('className=');
    assert.ok(disabledAt < busyAt && busyAt < classAt, 'disabled, aria-busy and class stay in order');
  });

  it('Save Scores keeps its guard, busy marker, icon and label in order', () => {
    assert.ok(SAVE.includes('onClick={handleSaveScores}'), 'the handler stays');
    assert.ok(
      SAVE.includes('disabled={saving || Object.keys(editedScores).length === 0}'),
      'disabled stays driven by saving and edited scores',
    );
    assert.ok(SAVE.includes('aria-busy={savingScores}'), 'aria-busy is driven by savingScores');
    assert.ok(SAVE.includes('<Save className="w-4 h-4" />'), 'the Save icon stays');
    assert.ok(SAVE.includes('Save Scores'), 'the label stays');
    const disabledAt = SAVE.indexOf('disabled={saving || Object.keys(editedScores).length === 0}');
    const busyAt = SAVE.indexOf('aria-busy={savingScores}');
    const classAt = SAVE.indexOf('className=');
    assert.ok(disabledAt < busyAt && busyAt < classAt, 'disabled, aria-busy and class stay in order');
  });

  it('the category header keeps its toggle, chevrons and label', () => {
    assert.ok(CATEGORY.includes('onClick={() => toggleCategory(category)}'), 'the toggle handler stays');
    assert.ok(
      CATEGORY.includes('<ChevronDown className="w-5 h-5 text-muted-foreground" />'),
      'the open chevron stays',
    );
    assert.ok(
      CATEGORY.includes('<ChevronRight className="w-5 h-5 text-muted-foreground" />'),
      'the closed chevron stays',
    );
    assert.ok(CATEGORY.includes('{category}'), 'the category name stays');
    assert.ok(CATEGORY.includes('({domains.length} domains)'), 'the domain count stays');
  });
});

describe('/admin/psychometrics: the page structure stays', () => {
  it('keeps the banners, the progress line and the score inputs', () => {
    assert.ok(page.includes("setError('')"), 'the error banner stays');
    assert.ok(page.includes("setSuccess('')"), 'the success banner stays');
    assert.ok(
      page.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the polite status paragraph stays',
    );
    assert.ok(
      page.includes("{computing ? 'Computing profiles…' : savingScores ? 'Saving scores…' : ''}"),
      'the status text follows both markers',
    );
    assert.ok(
      page.includes('Scores: {psychometricData.scoreCount} / {psychometricData.totalDomains} domains'),
      'the Score Progress copy stays',
    );
    assert.ok(page.includes('type="range"'), 'the score sliders stay');
    assert.ok(page.includes('function toggleCategory(category: string) {'), 'toggleCategory stays');
    assert.ok(page.includes('async function handleComputeProfiles() {'), 'handleComputeProfiles stays');
    assert.ok(page.includes('async function handleSaveScores() {'), 'handleSaveScores stays');
    assert.equal(count(page, /aria-expanded/g), 0, 'no aria-expanded added in this session');
    assert.equal(count(page, /aria-controls/g), 0, 'no aria-controls added in this session');
  });
});

describe('/admin/psychometrics: the file counts stay locked', () => {
  it('matches the file-wide counts', () => {
    assert.equal(count(page, /focus-visible/g), 10, 'a focus pair on each of the five buttons');
    assert.equal(count(page, /<button/g), 5, 'the five buttons stay');
    assert.equal(count(page, /type="button"/g), 5, 'all five are plain buttons');
    assert.equal(count(page, /type="submit"/g), 0, 'no submit button');
    assert.equal(count(page, /aria-busy/g), 2, 'the compute and save markers stay');
    assert.equal(count(page, /aria-live/g), 1, 'the single status line stays');
    assert.equal(count(page, /role=/g), 1, 'the single status role stays');
    assert.equal(count(page, /className="sr-only"/g), 1, 'the single sr-only node stays');
    assert.equal(count(page, /disabled=/g), 2, 'both score buttons keep their guards');
    assert.equal(count(page, /aria-label=/g), 0, 'no aria-label is added');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(
      /createServerFn|graphCall|rpc-schemas|migration/i.test(page),
      false,
      'the page adds no data path',
    );
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      assert.equal(source(file).includes(FOCUS_PAIR), false, `${file} gained page focus styles`);
    }
  });
});
