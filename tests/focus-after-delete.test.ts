/**
 * Direct unit tests for the keyboard-focus helper used after deleting an admin
 * list row (src/lib/focus-after-delete.ts). Six admin pages call it, but until
 * now only the smoke flow exercised it indirectly: a regression here silently
 * drops focus to <body> after a delete.
 *
 * The module is not changed by this file. It only reads `closest`,
 * `parentElement`, `children`, `querySelectorAll`, `isConnected`, `focus`,
 * `document.activeElement`, `document.body`, `document.querySelector('main h1')`,
 * `performance.now()` and `requestAnimationFrame`, so a tiny fake DOM is
 * enough — no jsdom and no new dependency. Frames are queued by hand (rather
 * than run synchronously) so the tests can count reschedules. `window`,
 * `document` and `requestAnimationFrame` are restored in the `after` hook.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  rememberRowFocus,
  restoreRowFocus,
  type RowFocusMemo,
} from '../src/lib/focus-after-delete.ts';

type FrameRequestCallback = (time: number) => void;

const originalWindow = (globalThis as any).window;
const originalDocument = (globalThis as any).document;
const originalRaf = (globalThis as any).requestAnimationFrame;

/** Minimal element: only what the module touches, plus focus bookkeeping. */
class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  parentElement: FakeElement | null = null;
  isConnected = true;
  disabled = false;
  focusCalls = 0;
  readonly tagName: string;

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  closest(selector: string): FakeElement | null {
    if (this.matchesRowSelector(selector)) return this;
    let node = this.parentElement;
    while (node) {
      if (node.matchesRowSelector(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  private matchesRowSelector(selector: string): boolean {
    return selector
      .split(',')
      .map((part) => part.trim())
      .some((part) =>
        part === '[data-row]'
          ? this.attributes.has('data-row')
          : this.tagName === part.toUpperCase(),
      );
  }

  querySelectorAll(selector: string): FakeElement[] {
    assert.ok(
      selector === 'button' || selector === 'button:not([disabled])',
      `unexpected selector ${selector}`,
    );
    const buttons = this.descendantButtons();
    return selector === 'button:not([disabled])' ? buttons.filter((b) => !b.disabled) : buttons;
  }

  focus(): void {
    this.focusCalls += 1;
    (globalThis as any).document.activeElement = this;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  private descendantButtons(): FakeElement[] {
    const found: FakeElement[] = [];
    for (const child of this.children) {
      if (child.tagName === 'BUTTON') found.push(child);
      found.push(...child.descendantButtons());
    }
    return found;
  }
}

type FakeDocument = {
  body: FakeElement;
  activeElement: FakeElement | null;
  heading: FakeElement | null;
  querySelector(selector: string): FakeElement | null;
};

let frames: FrameRequestCallback[] = [];
let doc: FakeDocument;

function installWindow(): void {
  (globalThis as any).window = {};
}

function installRaf(): void {
  (globalThis as any).requestAnimationFrame = (callback: FrameRequestCallback): number => {
    frames.push(callback);
    return frames.length;
  };
}

/** One list whose rows are `tr`/`li`/`[data-row]` elements, as in the pages. */
function makeList(rows: string[][], rowTag = 'LI'): { list: FakeElement; rows: FakeElement[] } {
  const list = new FakeElement('UL');
  const rowElements = rows.map((buttonStates) => {
    const row = new FakeElement(rowTag);
    if (rowTag === 'DIV') row.attributes.set('data-row', '');
    list.append(row);
    for (const state of buttonStates) {
      const button = new FakeElement('BUTTON');
      button.disabled = state === 'disabled';
      row.append(button);
    }
    return row;
  });
  return { list, rows: rowElements };
}

function makeDocument(options: { heading?: FakeElement | null } = {}): void {
  const body = new FakeElement('BODY');
  const heading = options.heading === undefined ? new FakeElement('H1') : options.heading;
  doc = {
    body,
    activeElement: body,
    heading,
    querySelector(selector: string): FakeElement | null {
      assert.equal(selector, 'main h1');
      return heading;
    },
  };
  (globalThis as any).document = doc;
}

function asButton(element: FakeElement): HTMLElement {
  return element as unknown as HTMLElement;
}

function memoFor(button: FakeElement): RowFocusMemo {
  const memo = rememberRowFocus(asButton(button));
  assert.ok(memo, 'expected rememberRowFocus to return a memo');
  return memo;
}

/** Run exactly one queued frame and report whether one was queued. */
function flushFrame(): boolean {
  const callback = frames.shift();
  if (!callback) return false;
  callback(0);
  return true;
}

before(() => {
  installWindow();
  installRaf();
  makeDocument();
});

after(() => {
  if (originalWindow === undefined) delete (globalThis as any).window;
  else (globalThis as any).window = originalWindow;
  if (originalDocument === undefined) delete (globalThis as any).document;
  else (globalThis as any).document = originalDocument;
  if (originalRaf === undefined) delete (globalThis as any).requestAnimationFrame;
  else (globalThis as any).requestAnimationFrame = originalRaf;
});

beforeEach(() => {
  frames = [];
  installWindow();
  installRaf();
  makeDocument();
});

describe('rememberRowFocus', () => {
  it('returns null for a missing button', () => {
    assert.equal(rememberRowFocus(null), null);
    assert.equal(rememberRowFocus(undefined), null);
  });

  it('returns null when the button has no row ancestor', () => {
    const wrapper = new FakeElement('DIV');
    const button = new FakeElement('BUTTON');
    wrapper.append(button);
    assert.equal(rememberRowFocus(asButton(button)), null);
  });

  it('returns null when the row has no parent (no list)', () => {
    const row = new FakeElement('LI');
    const button = new FakeElement('BUTTON');
    row.append(button);
    assert.equal(rememberRowFocus(asButton(button)), null);
  });

  it('memoizes row, list, row index and button index (disabled buttons included)', () => {
    const { list, rows } = makeList([
      ['enabled', 'enabled'],
      ['disabled', 'enabled'],
    ]);
    const button = rows[1].children[1];

    const memo = memoFor(button);

    assert.deepEqual(Object.keys(memo).sort(), ['buttonIndex', 'list', 'row', 'rowIndex']);
    assert.equal(memo.row, rows[1] as unknown as Element);
    assert.equal(memo.list, list as unknown as Element);
    assert.equal(memo.rowIndex, 1);
    assert.equal(memo.buttonIndex, 1);
  });

  it('counts disabled buttons before the clicked one', () => {
    const { rows } = makeList([['disabled', 'enabled']]);
    assert.equal(memoFor(rows[0].children[1]).buttonIndex, 1);
  });

  it('recognizes rows marked [data-row] as well as tr/li', () => {
    const { list, rows } = makeList([['enabled'], ['enabled']], 'DIV');
    const memo = memoFor(rows[1].children[0]);
    assert.equal(memo.row, rows[1] as unknown as Element);
    assert.equal(memo.list, list as unknown as Element);
    assert.equal(memo.rowIndex, 1);
  });
});

describe('restoreRowFocus scheduling', () => {
  it('does nothing without a memo', () => {
    restoreRowFocus(null);
    assert.equal(frames.length, 0);
  });

  it('does nothing when window is undefined', () => {
    const { rows } = makeList([['enabled']]);
    const memo = memoFor(rows[0].children[0]);
    delete (globalThis as any).window;

    restoreRowFocus(memo);

    assert.equal(frames.length, 0);
    assert.equal(rows[0].children[0].focusCalls, 0);
  });

  it('keeps waiting while the deleted row is still connected', () => {
    const { rows } = makeList([['enabled'], ['enabled']]);
    const memo = memoFor(rows[0].children[0]);

    restoreRowFocus(memo);
    assert.equal(frames.length, 1);

    for (let frame = 0; frame < 3; frame += 1) {
      assert.equal(flushFrame(), true);
      assert.equal(frames.length, 1, 'the waiting step must schedule itself again');
      assert.equal(rows[0].children[0].focusCalls, 0);
      assert.equal(rows[1].children[0].focusCalls, 0);
      assert.equal(doc.heading?.focusCalls, 0);
      assert.equal(doc.activeElement, doc.body);
    }
  });
});

describe('restoreRowFocus after the row left', () => {
  it('focuses the same button in the row that took the deleted row’s place', () => {
    const { rows } = makeList([
      ['enabled', 'enabled'],
      ['enabled', 'enabled'],
      ['enabled', 'enabled'],
    ]);
    const memo = memoFor(rows[1].children[0]);
    rows[1].isConnected = false;

    restoreRowFocus(memo);
    flushFrame();

    assert.equal(rows[2].children[0].focusCalls, 1);
    assert.equal(rows[0].children[0].focusCalls, 0);
    assert.equal(rows[2].children[1].focusCalls, 0);
    assert.equal(doc.heading?.focusCalls, 0);
    assert.equal(doc.activeElement, rows[2].children[0]);
  });

  it('clamps a deleted last row to the new last row', () => {
    const { rows } = makeList([
      ['enabled', 'enabled'],
      ['enabled', 'enabled'],
      ['enabled', 'enabled'],
    ]);
    const memo = memoFor(rows[2].children[0]);
    rows[2].isConnected = false;

    restoreRowFocus(memo);
    flushFrame();

    assert.equal(rows[1].children[0].focusCalls, 1);
    assert.equal(rows[0].children[0].focusCalls, 0);
  });

  it('clamps the button index across disabled buttons in the replacement row', () => {
    const { rows } = makeList([
      ['enabled', 'disabled', 'enabled'],
      ['enabled', 'disabled', 'enabled'],
    ]);
    const memo = memoFor(rows[0].children[2]);
    assert.equal(memo.buttonIndex, 2);
    rows[0].isConnected = false;

    restoreRowFocus(memo);
    flushFrame();

    assert.equal(rows[1].children[2].focusCalls, 1);
    assert.equal(rows[1].children[1].focusCalls, 0, 'a disabled button must never be focused');
    assert.equal(rows[1].children[0].focusCalls, 0);
  });

  it('focuses the heading with tabindex="-1" when the list is empty', () => {
    const { rows } = makeList([['enabled']]);
    const memo = memoFor(rows[0].children[0]);
    rows[0].isConnected = false;

    restoreRowFocus(memo);
    flushFrame();

    assert.equal(doc.heading?.focusCalls, 1);
    assert.equal(doc.heading?.attributes.get('tabindex'), '-1');
    assert.equal(rows[0].children[0].focusCalls, 0);
  });

  it('preserves an existing tabindex on the heading', () => {
    const heading = new FakeElement('H1');
    heading.attributes.set('tabindex', '0');
    makeDocument({ heading });
    const { rows } = makeList([['enabled']]);
    const memo = memoFor(rows[0].children[0]);
    rows[0].isConnected = false;

    restoreRowFocus(memo);
    flushFrame();

    assert.equal(doc.heading?.focusCalls, 1);
    assert.equal(doc.heading?.attributes.get('tabindex'), '0');
  });

  it('treats a disconnected list as empty', () => {
    const { list, rows } = makeList([['enabled'], ['enabled']]);
    const memo = memoFor(rows[0].children[0]);
    rows[0].isConnected = false;
    list.isConnected = false;

    restoreRowFocus(memo);
    flushFrame();

    assert.equal(doc.heading?.focusCalls, 1);
    assert.equal(rows[1].children[0].focusCalls, 0);
  });

  it('focuses the heading when the replacement row has no enabled button', () => {
    const { rows } = makeList([['enabled'], ['disabled']]);
    const memo = memoFor(rows[0].children[0]);
    rows[0].isConnected = false;

    restoreRowFocus(memo);
    flushFrame();

    assert.equal(doc.heading?.focusCalls, 1);
    assert.equal(rows[1].children[0].focusCalls, 0);
  });

  it('does not crash when there is no heading', () => {
    makeDocument({ heading: null });
    const { rows } = makeList([['enabled']]);
    const memo = memoFor(rows[0].children[0]);
    rows[0].isConnected = false;

    restoreRowFocus(memo);
    flushFrame();

    assert.equal(doc.activeElement, doc.body);
  });

  it('does not steal focus the user already moved elsewhere', () => {
    const { rows } = makeList([['enabled'], ['enabled']]);
    const elsewhere = new FakeElement('BUTTON');
    const memo = memoFor(rows[0].children[0]);
    rows[0].isConnected = false;
    doc.activeElement = elsewhere;

    restoreRowFocus(memo);
    flushFrame();

    assert.equal(elsewhere.focusCalls, 0);
    assert.equal(doc.activeElement, elsewhere);
    assert.equal(rows[1].children[0].focusCalls, 0);
    assert.equal(doc.heading?.focusCalls, 0);
  });

  it('still restores focus when the focused element itself was disconnected', () => {
    const { rows } = makeList([['enabled'], ['enabled']]);
    const deletedButton = rows[0].children[0];
    const memo = memoFor(deletedButton);
    rows[0].isConnected = false;
    deletedButton.isConnected = false;
    doc.activeElement = deletedButton;

    restoreRowFocus(memo);
    flushFrame();

    assert.equal(rows[1].children[0].focusCalls, 1);
    assert.equal(doc.activeElement, rows[1].children[0]);
  });
});
