/**
 * "Ask Claude" busy status is announced (`TutorContext`).
 *
 * The chat block asks `askTutorChat` with the learner's own Anthropic key and
 * flips `asking` true while it waits. During that time the button only faded
 * (`disabled` + `disabled:opacity-60`) and showed an `aria-hidden` spinner: its
 * accessible name stayed "Ask Claude", there was no `aria-busy`, and no live
 * region spoke, so a screen reader could not tell the answer was being
 * requested and the button looked frozen. The question form's "Prepare the
 * context" button (`busy`) was handled in PR #161 and is out of scope here.
 *
 * This file locks `aria-busy={asking}` next to `disabled={asking}` on the Ask
 * Claude button with its type, classes, label and spinner untouched, a new
 * `sr-only` polite `role="status"` line between the key/button row and the
 * checkbox row that says `Asking Claude…` while asking and clears when idle,
 * the existing `role="alert"` errors and other status lines, the untouched
 * `ask` flow, and that no server function, RPC call or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const TUTOR_FILE = join(ROOT, 'src', 'components', 'TutorContext.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const tutor = source(TUTOR_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The whole chat block, from its wrapper to the end of the section. */
const CHAT_OPEN = '<div className="mt-5 border-t border-border/60 pt-4" data-testid="tutor-chat">';
const chatStart = tutor.indexOf(CHAT_OPEN);
assert.ok(chatStart > 0, 'the chat block is rendered');
const chat = tutor.slice(chatStart);
assert.ok(chat.includes('Ask Claude'), 'the chat block holds the Ask Claude button');

/** The key + button row and the checkbox row, in source order. */
const ROW_OPEN = '<div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">';
const CHECKBOX_OPEN = '<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">';
const rowStart = chat.indexOf(ROW_OPEN);
const checkboxStart = chat.indexOf(CHECKBOX_OPEN);
assert.ok(rowStart > 0, 'the key + button row is rendered');
assert.ok(checkboxStart > rowStart, 'the checkbox row follows the key + button row');

/** The opening tag of the button whose visible label is `label`. */
const buttonOf = (label: string) => {
  const labelIdx = tutor.indexOf(label);
  assert.ok(labelIdx > 0, `the "${label}" button is rendered`);
  const open = tutor.lastIndexOf('<button', labelIdx);
  assert.ok(open > 0, `the "${label}" button has an opening tag`);
  assert.equal(tutor.slice(open, labelIdx).includes('</button>'), false, `the "${label}" label is inside its button`);
  return tutor.slice(open, labelIdx);
};

const ASK = buttonOf('Ask Claude');
const PREPARE = buttonOf('Prepare the context');

describe('TutorContext: the Ask Claude button announces it is busy', () => {
  it('adds aria-busy={asking} right after disabled={asking} on the Ask Claude button', () => {
    assert.ok(ASK.includes('type="button"'), 'the button stays a plain button');
    assert.ok(ASK.includes('onClick={() => void ask()}'), 'the button still calls ask');
    assert.ok(ASK.includes('disabled={asking}'), 'disabled stays driven by asking');
    assert.ok(ASK.includes('aria-busy={asking}'), 'aria-busy is driven by asking');
    assert.ok(
      ASK.indexOf('disabled={asking}') < ASK.indexOf('aria-busy={asking}'),
      'aria-busy sits right after disabled',
    );
    assert.equal(count(tutor, /aria-busy=\{asking\}/g), 1, 'one aria-busy={asking}, on the Ask Claude button only');
  });

  it('keeps the Ask Claude classes, label and spinner untouched', () => {
    assert.ok(
      ASK.includes(
        'className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"',
      ),
      'Ask Claude classes untouched',
    );
    assert.equal(count(tutor, /Ask Claude/g), 1, 'the Ask Claude label stays once');
    assert.ok(
      chat.includes('{asking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}'),
      'the existing spinner stays hidden and unchanged',
    );
  });

  it('leaves the Prepare the context button driven by its own busy state', () => {
    assert.ok(PREPARE.includes('type="submit"'), 'Prepare the context stays a submit');
    assert.ok(PREPARE.includes('disabled={busy}'), 'Prepare the context stays driven by busy');
    assert.ok(PREPARE.includes('aria-busy={busy}'), 'Prepare the context keeps its own aria-busy');
    assert.equal(PREPARE.includes('aria-busy={asking}'), false, 'Prepare the context never listens to asking');
  });
});

describe('TutorContext: one polite status line in the chat block', () => {
  it('adds exactly one sr-only polite status line for asking', () => {
    assert.ok(
      chat.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the asking line is a sr-only paragraph carrying role and politeness',
    );
    assert.equal(count(chat, /className="sr-only"/g), 1, 'the asking line is the only sr-only element in the chat block');
  });

  it('says Asking Claude… while asking and clears when idle', () => {
    assert.ok(chat.includes("{asking ? 'Asking Claude…' : ''}"), 'the status text follows asking');
    assert.equal(count(chat, /Asking Claude…/g), 1, 'the status copy appears once');
  });

  it('sits after the key + button row and before the checkbox row', () => {
    const statusStart = chat.indexOf('<p role="status"');
    const askClose = chat.indexOf('</button>', chat.indexOf('Ask Claude'));
    assert.ok(askClose > 0, 'the Ask Claude button is closed');
    assert.ok(statusStart > askClose, 'the status line follows the Ask Claude button');
    assert.ok(statusStart > rowStart, 'the status line sits after the key + button row opens');
    assert.ok(statusStart < checkboxStart, 'the status line sits before the checkbox row');
  });
});

describe('TutorContext: the existing notices and the untouched surroundings', () => {
  it('keeps the existing form error line and the chat error line', () => {
    assert.equal(count(tutor, /role="alert"/g), 2, 'the form error and the chat error stay');
    assert.ok(
      tutor.includes('<p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">'),
      'the error lines keep their role and classes',
    );
  });

  it('keeps the preparing status, the Copied status and the answer live region', () => {
    assert.ok(tutor.includes("{busy ? 'Preparing the context…' : ''}"), 'the preparing status stays');
    assert.ok(
      tutor.includes('<span role="status" aria-live="polite" className="text-xs text-emerald-700 dark:text-emerald-400">'),
      'the copy confirmation stays a polite status',
    );
    assert.ok(
      tutor.includes("{copied ? 'Copied. Paste it into your AI tutor, with your question.' : ''}"),
      'the copy confirmation text stays',
    );
    assert.ok(
      chat.includes('<div className="mt-3 space-y-3" aria-live="polite">'),
      'the answer block stays a polite live region',
    );
  });

  it('keeps the ask flow intact', () => {
    assert.ok(tutor.includes('const ask = async () => {'), 'ask stays');
    assert.ok(tutor.includes('if (asking) return;'), 'the asking guard stays');
    assert.ok(tutor.includes('setAsking(true);'), 'asking still starts with the request');
    assert.ok(tutor.includes('setChatError(null);'), 'the old chat error is still cleared');
    assert.ok(tutor.includes('setChat(null);'), 'the old answer is still cleared');
    assert.ok(tutor.includes('setRated(null);'), 'the old rating is still cleared');
    assert.ok(tutor.includes('writeKey(rememberKey ? apiKey.trim() : null);'), 'the key is still remembered on request');
    assert.ok(
      tutor.includes(
        'setChat(await askTutorChat({ data: { learnerId, conceptId, question: query, apiKey: apiKey.trim(), compare } }));',
      ),
      'the tutor-chat request stays the same',
    );
    assert.ok(tutor.includes('setAsking(false);'), 'asking still clears on finish');
  });

  it('keeps the section shell, labels and copy', () => {
    assert.ok(
      tutor.includes(
        '<section aria-labelledby={ids.heading} className="glass-card mt-6 p-4 sm:p-5" data-testid="tutor-context">',
      ),
      'the section shell stays',
    );
    assert.ok(tutor.includes('Anthropic API key'), 'the API key label stays');
    assert.ok(tutor.includes('Remember the key in this browser'), 'the remember checkbox stays');
    assert.ok(tutor.includes('Compare with an answer that doesn’t know me'), 'the compare checkbox stays');
  });
});

describe('TutorContext: no replaced name and no new data path', () => {
  it('adds no aria-label, aria-labelledby or aria-atomic to the chat block', () => {
    assert.equal(count(chat, /aria-label=/g), 1, 'the existing answer-group label stays the only one');
    assert.equal(count(chat, /aria-labelledby=/g), 0);
    assert.equal(count(chat, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC call or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas|migrat/i.test(tutor), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('Asking Claude'), false, `${file} gained the status copy`);
      assert.equal(other.includes('tutor-context-asking'), false, `${file} gained asking wiring`);
    }
  });
});
