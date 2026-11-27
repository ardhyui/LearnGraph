/**
 * Keyboard focus is visible on both buttons of `/edu-psychology`
 * (`src/routes/edu-psychology.tsx`).
 *
 * The page renders exactly two interactive buttons: the accordion header of
 * every `ExpandableSection` (ZPD, Bloom, Scaffolding, Forgetting Curve,
 * Psychometrics, Knowledge Graph) and each of the 13 psychometric category
 * cards in `PsychometricWheel`. Neither button had `type="button"` (both
 * could act as submit buttons if the page ever grows a form) and neither had
 * a `:focus-visible` style, while `src/styles.css` has no global rule, so a
 * keyboard user tabbing to any button on this public page saw no focus
 * indicator at all. This file locks `type="button"` on both buttons, the
 * accordion's exact class string with the two focus classes appended at the
 * end, the focus classes at the end of the static part of the category
 * button's class template (before the active/inactive conditional), the
 * toggle handlers, `aria-expanded`/`aria-controls`, the decorative icons and
 * the file-wide counts. Both buttons stay synchronous local toggles, so no
 * `aria-busy`/live region is added. No server function, RPC schema or
 * migration is added.
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

/** The psychometric category button, from its opening tag to its `</button>`. */
const categoryIdx = page.indexOf('aria-controls="psychometric-category-detail"');
assert.ok(categoryIdx > 0, 'the category button is rendered');
const categoryOpen = page.lastIndexOf('<button', categoryIdx);
const categoryClose = page.indexOf('</button>', categoryOpen) + '</button>'.length;
const CATEGORY = page.slice(categoryOpen, categoryClose);

/** The accordion section button, from its opening tag to its `</button>`. */
const accordionIdx = page.indexOf('aria-controls={contentId}');
assert.ok(accordionIdx > 0, 'the accordion button is rendered');
const accordionOpen = page.lastIndexOf('<button', accordionIdx);
const accordionClose = page.indexOf('</button>', accordionOpen) + '</button>'.length;
const ACCORDION = page.slice(accordionOpen, accordionClose);

const FOCUS_PAIR = 'focus-visible:outline-2 focus-visible:outline-primary';
const ACCORDION_CLASS =
  'w-full flex items-center justify-between p-6 hover:bg-muted/50 transition-colors focus-visible:outline-2 focus-visible:outline-primary';
const CATEGORY_STATIC =
  'text-left p-4 rounded-xl border-2 transition-all duration-200 focus-visible:outline-2 focus-visible:outline-primary';

describe('EduPsychology: both buttons show keyboard focus', () => {
  it('the accordion button keeps its exact class string with the focus classes at the end', () => {
    assert.ok(
      ACCORDION.includes(`className="${ACCORDION_CLASS}"`),
      'the accordion classes stay with the focus pair appended',
    );
    assert.ok(ACCORDION_CLASS.endsWith(FOCUS_PAIR), 'the focus classes end the class string');
    assert.equal(
      ACCORDION.indexOf(ACCORDION_CLASS),
      ACCORDION.indexOf(`"${ACCORDION_CLASS}"`) + 1,
      'the class string is a single string attribute',
    );
  });

  it('the category button carries the focus classes in the static part of its template', () => {
    const templateStart = CATEGORY.indexOf('className={`');
    assert.ok(templateStart > 0, 'the category button has a class template');
    const conditionalStart = CATEGORY.indexOf('${', templateStart);
    assert.ok(conditionalStart > 0, 'the class template has a conditional');
    assert.equal(
      CATEGORY.slice(templateStart + 'className={`'.length, conditionalStart).trim(),
      CATEGORY_STATIC,
      'the static part is exactly the old classes plus the focus pair',
    );
  });

  it('the category branches stay untouched after the focus classes', () => {
    assert.ok(
      CATEGORY.includes(
        "? 'border-pink-500 bg-pink-500/10 dark:bg-pink-500/20 shadow-lg scale-[1.02]'",
      ),
      'the active branch stays',
    );
    assert.ok(
      CATEGORY.includes(": 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'"),
      'the inactive branch stays',
    );
    const lastFocus = CATEGORY.lastIndexOf(FOCUS_PAIR);
    assert.ok(
      lastFocus < CATEGORY.indexOf("'border-pink-500") && lastFocus < CATEGORY.indexOf("'border-border"),
      'the focus classes come before both branches',
    );
  });

  it('each button carries the focus pair exactly once', () => {
    assert.equal(count(ACCORDION, /focus-visible/g), 2, 'the accordion button has both focus classes');
    assert.equal(count(CATEGORY, /focus-visible/g), 2, 'the category button has both focus classes');
  });
});

describe('EduPsychology: both buttons keep their behaviour', () => {
  it('the accordion button keeps type, handler and aria wiring in order', () => {
    assert.ok(ACCORDION.includes('type="button"'), 'type="button" stays');
    assert.ok(ACCORDION.includes('onClick={() => setIsOpen(!isOpen)}'), 'the accordion toggle stays');
    assert.ok(ACCORDION.includes('aria-expanded={isOpen}'), 'the expanded state stays');
    assert.ok(ACCORDION.includes('aria-controls={contentId}'), 'the controlled panel stays');
    assert.ok(
      ACCORDION.indexOf('type="button"') < ACCORDION.indexOf('onClick=') &&
        ACCORDION.indexOf('onClick=') < ACCORDION.indexOf('aria-expanded=') &&
        ACCORDION.indexOf('aria-expanded=') < ACCORDION.indexOf('aria-controls=') &&
        ACCORDION.indexOf('aria-controls=') < ACCORDION.indexOf('className='),
      'type, handler, aria and class order stays',
    );
  });

  it('the category button keeps key, type and handler in order', () => {
    assert.ok(CATEGORY.startsWith('<button'), 'the button is still a plain button');
    assert.ok(CATEGORY.includes('key={categoryName}'), 'the list key stays');
    assert.ok(CATEGORY.includes('type="button"'), 'type="button" stays');
    assert.ok(
      CATEGORY.includes(
        'onClick={() => setExpandedCategory(expandedCategory === categoryName ? null : categoryName)}',
      ),
      'the category toggle stays',
    );
    assert.ok(CATEGORY.includes('aria-expanded={expandedCategory === categoryName}'), 'the expanded state stays');
    assert.ok(CATEGORY.includes('aria-controls="psychometric-category-detail"'), 'the controlled panel stays');
    assert.ok(
      CATEGORY.indexOf('key={categoryName}') < CATEGORY.indexOf('type="button"') &&
        CATEGORY.indexOf('type="button"') < CATEGORY.indexOf('onClick='),
      'key, type and handler order stays',
    );
  });

  it('keeps the decorative icons untouched', () => {
    assert.ok(
      ACCORDION.includes('<Icon size={24} className="text-white" aria-hidden="true" />'),
      'the section icon stays decorative and unchanged',
    );
    assert.ok(
      ACCORDION.includes("${isOpen ? 'rotate-180' : ''}"),
      'the chevron rotation stays conditional',
    );
    assert.ok(
      CATEGORY.includes('<span className="text-2xl" aria-hidden="true">{category.icon}</span>'),
      'the category icon stays decorative and unchanged',
    );
    assert.ok(
      CATEGORY.includes('aria-hidden="true"') &&
        CATEGORY.includes('style={{ backgroundColor: category.color }}'),
      'the category colour dot stays decorative and unchanged',
    );
  });
});

describe('EduPsychology: the page structure stays', () => {
  it('keeps the section component and its animated content', () => {
    assert.ok(page.includes('function ExpandableSection('), 'the section component stays');
    assert.ok(page.includes('const contentId = useId();'), 'the panel id stays generated');
    assert.ok(page.includes('id={contentId}'), 'the animated panel stays wired to the button');
    assert.ok(page.includes('<AnimatePresence>'), 'the exit animation stays');
    assert.ok(page.includes('const [isOpen, setIsOpen] = useState(true);'), 'sections stay open by default');
  });

  it('keeps the psychometric wheel and its data', () => {
    assert.ok(page.includes('function PsychometricWheel('), 'the wheel component stays');
    assert.ok(page.includes('const ALL_PSYCHOMETRIC_DOMAINS'), 'the domain catalogue stays');
    assert.ok(
      page.includes('id="psychometric-category-detail"'),
      'the expanded category detail panel stays',
    );
    assert.ok(
      page.includes('const [expandedCategory, setExpandedCategory] = useState<string | null>(null);'),
      'the category state stays',
    );
  });

  it('keeps the other visuals and the page shell', () => {
    for (const name of [
      'function ZPDDiagram()',
      'function BloomsPyramid()',
      'function ScaffoldingVisual()',
      'function ForgettingCurve()',
      'function CodeLocation(',
    ]) {
      assert.ok(page.includes(name), `${name} stays`);
    }
    assert.ok(page.includes('<Sidebar />'), 'the sidebar stays');
    assert.ok(page.includes('<EtherealShadow'), 'the background effect stays');
    assert.ok(page.includes("head: () => pageHead('/edu-psychology')"), 'the page head stays');
  });
});

describe('EduPsychology: the file counts stay locked', () => {
  it('matches the file-wide counts', () => {
    assert.equal(count(page, /focus-visible/g), 4, 'one focus pair per button');
    assert.equal(count(page, /<button/g), 2, 'the two buttons stay');
    assert.equal(count(page, /type="button"/g), 2, 'both buttons stay plain buttons');
    assert.equal(count(page, /aria-expanded/g), 2, 'both expanded states stay');
    assert.equal(count(page, /aria-controls/g), 2, 'both controlled panels stay');
    assert.equal(count(page, /aria-hidden/g), 6, 'the six decorative elements stay hidden');
    assert.equal(count(page, /aria-busy/g), 0, 'no busy state is added');
    assert.equal(count(page, /aria-live/g), 0, 'no live region is added');
    assert.equal(count(page, /role=/g), 0, 'no role is added');
    assert.equal(count(page, /aria-label=/g), 0, 'no label is added');
    assert.equal(count(page, /className="sr-only"/g), 0, 'no sr-only helper is added');
    assert.equal(count(page, /className=\{cn\(/g), 0, 'no cn block is added');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(
      /createServerFn|graphCall|rpc-schemas|migrat/i.test(page),
      false,
      'the page adds no data path',
    );
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('focus-visible:outline-primary'), false, `${file} gained page focus styles`);
    }
  });
});
