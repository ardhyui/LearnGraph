/**
 * Retrying the "My learning" card is announced (`LearningOverview`).
 *
 * The **Try again** button inside the error alert used to call `load` with no
 * `disabled`, no `aria-busy` and no announcement: a screen reader could not
 * tell that the reload was running, and a double click could start two reads.
 * It now follows the same pattern as the other buttons (`/sign-in`,
 * `/forgot-password`, `/reset-password`, the `/learn` self-report and concept
 * quiz, `DeleteAccount`, the **Ask an AI tutor** buttons, the snooze buttons,
 * **Create a read-only key**, **Save subjects**, the `/japanese` buttons,
 * **Start learning**, the admin buttons, **Refresh** on `/gaps`, the profile
 * assessment saves, **Save Profile**, and the draft decision buttons).
 *
 * This file locks a `retrying` state, a guarded `retry` handler that cleans up
 * in `finally`, one `aria-busy={retrying}` right after `disabled={retrying}`,
 * a single `sr-only` polite `role="status"` line that is the last child of the
 * section, and that the old `load`, notices, loading line and error alert are
 * untouched with no new server function, RPC or migration.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const COMPONENT_FILE = join(ROOT, 'src', 'components', 'LearningOverview.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const component = source(COMPONENT_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The **Try again** button inside the error alert, found from its label. */
const RETRY_LABEL = 'Try again';
const retryLabelIdx = component.indexOf(RETRY_LABEL);
assert.ok(retryLabelIdx > 0, 'the Try again button is rendered');
const buttonOpen = component.lastIndexOf('<button', retryLabelIdx);
const buttonClose = component.indexOf('</button>', retryLabelIdx) + '</button>'.length;
const RETRY = component.slice(buttonOpen, buttonClose);

/** The `retry` handler, from its declaration to the reload effect. */
const retryStart = component.indexOf('const retry = async () => {');
const retryEnd = component.indexOf('useEffect(() => {', retryStart);
assert.ok(retryStart > 0 && retryEnd > retryStart, 'the retry handler is present');
const RETRY_HANDLER = component.slice(retryStart, retryEnd);

/** `load`, from its declaration to the retry handler that calls it. */
const loadStart = component.indexOf('const load = useCallback(async () => {');
const loadEnd = retryStart;
assert.ok(loadStart > 0 && loadEnd > loadStart, 'the load flow is present');
const LOAD = component.slice(loadStart, loadEnd);

describe('LearningOverview: the Try again button announces its busy state', () => {
  it('adds disabled={retrying} and aria-busy={retrying} after className', () => {
    assert.ok(RETRY.includes('type="button"'), 'the button stays a plain button');
    assert.ok(RETRY.includes('onClick={() => void retry()}'), 'the handler calls the guarded retry');
    assert.ok(RETRY.includes('className="font-medium underline"'), 'the classes stay');
    assert.ok(RETRY.includes('disabled={retrying}'), 'disabled is driven by retrying');
    assert.ok(RETRY.includes('aria-busy={retrying}'), 'aria-busy is driven by retrying');
    assert.ok(
      RETRY.indexOf('className="font-medium underline"') < RETRY.indexOf('disabled={retrying}'),
      'disabled sits after className',
    );
    assert.ok(
      RETRY.indexOf('disabled={retrying}') < RETRY.indexOf('aria-busy={retrying}'),
      'aria-busy sits right after disabled',
    );
    assert.ok(RETRY.includes(RETRY_LABEL), 'the label stays intact');
    assert.equal(count(component, /aria-busy=\{retrying\}/g), 1, 'one aria-busy on Try again only');
    assert.equal(count(component, /aria-busy=/g), 1, 'no other busy marker was added');
  });

  it('keeps the state next to the existing ones', () => {
    assert.ok(
      component.includes(
        'const [notice, setNotice] = useState<string | null>(null);\n  const [retrying, setRetrying] = useState(false);',
      ),
      'retrying is declared right after notice',
    );
  });

  it('guards the handler and clears the flag in finally', () => {
    assert.ok(RETRY_HANDLER.includes('if (retrying) return;'), 'a double click is ignored');
    assert.ok(RETRY_HANDLER.includes('setRetrying(true);'), 'the flag is set before the read');
    assert.ok(RETRY_HANDLER.includes('await load();'), 'the existing load is reused');
    assert.ok(RETRY_HANDLER.includes('finally'), 'cleanup runs even when the read fails');
    assert.ok(RETRY_HANDLER.includes('setRetrying(false);'), 'the flag is cleared');
  });
});

describe('LearningOverview: one polite status line announces the retry', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.ok(
      component.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the status line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(component, /aria-live="polite"/g), 2, 'two polite live regions in the file');
    assert.equal(count(component, /role="status"/g), 3, 'three status lines in the file');
    assert.equal(count(component, /role="alert"/g), 1, 'only the error alert stays');
    assert.equal(count(component, /className="sr-only"/g), 1, 'one exact sr-only class');
  });

  it('says it is retrying and clears when idle', () => {
    assert.ok(component.includes("{retrying ? 'Retrying…' : ''}"), 'the status text follows retrying');
    assert.equal(count(component, /Retrying…/g), 1, 'the retry copy appears once');
  });

  it('sits after the data block as the last child of the section', () => {
    const statusStart = component.indexOf('<p role="status" aria-live="polite" className="sr-only">');
    const statusEnd = component.indexOf('</p>', statusStart) + '</p>'.length;
    assert.ok(statusStart > component.indexOf('<DownloadMyData learnerId={learnerId} />'), 'the line follows the downloads');
    assert.equal(
      component.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</section>);}',
      'the line is the last child of the section',
    );
  });
});

describe('LearningOverview: existing content and flows stay intact', () => {
  it('keeps the notice, the loading line and the error alert', () => {
    assert.ok(
      component.includes(
        "<p\n        aria-live=\"polite\"\n        role=\"status\"\n        className={notice ? 'mt-3 text-sm text-emerald-700 dark:text-emerald-400' : 'sr-only'}\n      >",
      ),
      'the notice keeps its role, politeness and dynamic class',
    );
    assert.ok(component.includes('Loading your progress…'), 'the loading line stays');
    assert.ok(component.includes('<p role="alert"'), 'the error alert stays');
  });

  it('keeps the subject editor and FocusEditor', () => {
    assert.ok(component.includes('Change subjects'), 'the editor toggle stays');
    assert.ok(component.includes('Choose subjects'), 'the empty-state toggle stays');
    assert.ok(component.includes('<FocusEditor'), 'the subject editor stays');
  });

  it('keeps the load flow unchanged', () => {
    assert.ok(LOAD.includes('if (!db || !isReady) return;'), 'the guard stays');
    assert.ok(LOAD.includes('const seq = ++requestSeq.current;'), 'the request sequence stays');
    assert.ok(LOAD.includes('await Promise.all(['), 'the parallel load stays');
    assert.ok(LOAD.includes('setData({'), 'the card data is still stored');
    assert.ok(LOAD.includes("setError('Could not load your progress.');"), 'the error copy stays');
  });

  it('adds no extra aria-label, aria-labelledby or aria-atomic', () => {
    assert.equal(count(component, /aria-label=/g), 3, 'the three existing labels stay');
    assert.equal(count(component, /aria-labelledby=/g), 1, 'the one existing reference stays');
    assert.equal(count(component, /aria-atomic=/g), 0, 'no aria-atomic added');
    assert.equal(count(component, /role="/g), 6, 'six roles in total');
  });

  it('adds no server function, RPC schema or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migration/i.test(component), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Retrying…'), false, `${file} gained the status copy`);
      assert.equal(other.includes('retrying'), false, `${file} gained busy wiring`);
    }
  });
});
