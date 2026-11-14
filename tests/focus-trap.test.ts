/**
 * Direct unit tests for the Tab trap used by the quiz and profile dialogs
 * (src/lib/focus-trap.ts, `trapTabKey`). Until now the module was only
 * exercised indirectly by the quiz-dialog smoke flow: a regression would let
 * Tab wander behind a modal or skip the first element on Shift+Tab.
 *
 * The module is not changed by this file. At runtime it only reads
 * `container.querySelectorAll`, `getClientRects().length`, `container.contains`,
 * `document.activeElement` and the `instanceof Node` check, so a tiny fake DOM
 * is enough — no jsdom and no new dependency. `globalThis.Node` and
 * `globalThis.document` are stubbed and restored in the `after` hook.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { trapTabKey } from '../src/lib/focus-trap.ts';

/** The selector the module must pass to `querySelectorAll`, verbatim. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const originalNode = (globalThis as any).Node;
const originalDocument = (globalThis as any).document;

type FakeDocument = { activeElement: unknown };
let fakeDocument: FakeDocument;

/**
 * Minimal node: parent/child links (for `contains`), focus bookkeeping, and
 * the `instanceof Node` identity the module relies on.
 */
class FakeNode {
  readonly children: FakeNode[] = [];
  parent: FakeNode | null = null;
  focusCalls = 0;

  append(...children: FakeNode[]): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  contains(node: FakeNode | null): boolean {
    let current: FakeNode | null = node;
    while (current) {
      if (current === this) return true;
      current = current.parent;
    }
    return false;
  }

  focus(): void {
    this.focusCalls += 1;
    fakeDocument.activeElement = this;
  }
}

type FakeElementOptions = {
  /** Returned by the fake `querySelectorAll`, like a real focusable element. */
  focusable?: boolean;
  /** `getClientRects().length > 0`; false simulates an element not laid out. */
  visible?: boolean;
};

class FakeElement extends FakeNode {
  readonly tagName: string;
  readonly selectorCalls: string[] = [];
  focusable: boolean;
  visible: boolean;

  constructor(tagName: string, options: FakeElementOptions = {}) {
    super();
    this.tagName = tagName;
    this.focusable = options.focusable ?? true;
    this.visible = options.visible ?? true;
  }

  getClientRects(): { length: number } {
    return { length: this.visible ? 1 : 0 };
  }

  querySelectorAll(selector: string): FakeElement[] {
    this.selectorCalls.push(selector);
    return this.descendants().filter((element) => element.focusable);
  }

  private descendants(): FakeElement[] {
    const found: FakeElement[] = [];
    for (const child of this.children) {
      if (child instanceof FakeElement) {
        found.push(child);
        found.push(...child.descendants());
      }
    }
    return found;
  }
}

type KeyEventState = {
  key: string;
  shiftKey: boolean;
  preventDefaultCalls: number;
};

/** A keydown-shaped event that counts `preventDefault()` calls. */
function makeKeyEvent(key = 'Tab', shiftKey = false): { event: object; state: KeyEventState } {
  const state: KeyEventState = { key, shiftKey, preventDefaultCalls: 0 };
  return {
    state,
    event: {
      key,
      shiftKey,
      preventDefault(): void {
        state.preventDefaultCalls += 1;
      },
    },
  };
}

function asContainer(element: FakeElement): HTMLElement {
  return element as unknown as HTMLElement;
}

type Dialog = {
  dialog: FakeElement;
  hiddenBefore: FakeElement;
  first: FakeElement;
  /** Non-focusable wrapper around `middle`, like a row wrapper in the dialog. */
  wrapper: FakeElement;
  middle: FakeElement;
  hiddenAfter: FakeElement;
  last: FakeElement;
};

/**
 * One dialog with two hidden elements and three visible candidates:
 * DOM order is hiddenBefore, first, wrapper > middle, hiddenAfter, last.
 * Visible candidates are first, middle, last.
 */
function makeDialog(): Dialog {
  const dialog = new FakeElement('DIV');
  const hiddenBefore = new FakeElement('BUTTON', { visible: false });
  const first = new FakeElement('BUTTON');
  const wrapper = new FakeElement('DIV', { focusable: false });
  const middle = new FakeElement('INPUT');
  const hiddenAfter = new FakeElement('A', { visible: false });
  const last = new FakeElement('A');
  wrapper.append(middle);
  dialog.append(hiddenBefore, first, wrapper, hiddenAfter, last);
  return { dialog, hiddenBefore, first, wrapper, middle, hiddenAfter, last };
}

function focusableCalls(...elements: FakeElement[]): number[] {
  return elements.map((element) => element.focusCalls);
}

before(() => {
  (globalThis as any).Node = FakeNode;
});

after(() => {
  if (originalNode === undefined) delete (globalThis as any).Node;
  else (globalThis as any).Node = originalNode;
  if (originalDocument === undefined) delete (globalThis as any).document;
  else (globalThis as any).document = originalDocument;
});

beforeEach(() => {
  (globalThis as any).Node = FakeNode;
  fakeDocument = { activeElement: null };
  (globalThis as any).document = fakeDocument;
});

describe('trapTabKey early exits', () => {
  it('ignores keys other than Tab', () => {
    for (const key of ['Escape', 'Enter', 'a', 'tab', 'Tab ']) {
      const outside = new FakeElement('BUTTON');
      const { dialog, first, middle, last, hiddenBefore, hiddenAfter } = makeDialog();
      fakeDocument.activeElement = outside;
      const { event, state } = makeKeyEvent(key);

      trapTabKey(event as never, asContainer(dialog));

      assert.equal(state.preventDefaultCalls, 0, `key ${JSON.stringify(key)}`);
      assert.equal(outside.focusCalls, 0);
      assert.deepEqual(
        focusableCalls(dialog, first, middle, last, hiddenBefore, hiddenAfter),
        [0, 0, 0, 0, 0, 0],
      );
      assert.equal(fakeDocument.activeElement, outside);
    }
  });

  it('ignores Tab and Shift+Tab when the container is null', () => {
    const outside = new FakeElement('BUTTON');
    fakeDocument.activeElement = outside;

    for (const shiftKey of [false, true]) {
      const { event, state } = makeKeyEvent('Tab', shiftKey);
      trapTabKey(event as never, null);
      assert.equal(state.preventDefaultCalls, 0);
    }

    assert.equal(outside.focusCalls, 0);
    assert.equal(fakeDocument.activeElement, outside);
  });
});

describe('trapTabKey candidate collection', () => {
  it('asks the container for exactly the FOCUSABLE selector', () => {
    const outside = new FakeElement('BUTTON');
    const { dialog, wrapper } = makeDialog();
    fakeDocument.activeElement = outside;

    const { event } = makeKeyEvent();
    trapTabKey(event as never, asContainer(dialog));

    assert.deepEqual(dialog.selectorCalls, [FOCUSABLE_SELECTOR]);
    assert.deepEqual(wrapper.selectorCalls, []);
  });

  it('skips candidates with no client rects and keeps DOM order', () => {
    const outside = new FakeElement('BUTTON');
    const { dialog, first, middle, last, hiddenBefore, hiddenAfter } = makeDialog();
    fakeDocument.activeElement = outside;

    const tab = makeKeyEvent();
    trapTabKey(tab.event as never, asContainer(dialog));

    assert.equal(tab.state.preventDefaultCalls, 1);
    assert.equal(first.focusCalls, 1, 'Tab from outside goes to the first visible candidate');
    assert.equal(fakeDocument.activeElement, first);

    fakeDocument.activeElement = outside;
    const shiftTab = makeKeyEvent('Tab', true);
    trapTabKey(shiftTab.event as never, asContainer(dialog));

    assert.equal(shiftTab.state.preventDefaultCalls, 1);
    assert.equal(last.focusCalls, 1, 'Shift+Tab from outside goes to the last visible candidate');
    assert.equal(fakeDocument.activeElement, last);

    assert.equal(middle.focusCalls, 0);
    assert.equal(hiddenBefore.focusCalls, 0, 'a hidden element must never be focused');
    assert.equal(hiddenAfter.focusCalls, 0, 'a hidden element must never be focused');
  });

  it('moves focus to the container when no candidate is visible', () => {
    for (const [shiftKey, label] of [
      [false, 'Tab'],
      [true, 'Shift+Tab'],
    ] as const) {
      const hidden = new FakeElement('BUTTON', { visible: false });
      const dialog = new FakeElement('DIV');
      dialog.append(hidden);
      const outside = new FakeElement('BUTTON');
      fakeDocument.activeElement = outside;
      const { event, state } = makeKeyEvent('Tab', shiftKey);

      trapTabKey(event as never, asContainer(dialog));

      assert.equal(state.preventDefaultCalls, 1, label);
      assert.equal(dialog.focusCalls, 1, label);
      assert.equal(hidden.focusCalls, 0, label);
      assert.equal(fakeDocument.activeElement, dialog);
    }
  });

  it('moves focus to the container when it has no candidates at all', () => {
    const dialog = new FakeElement('DIV');
    const outside = new FakeElement('BUTTON');
    fakeDocument.activeElement = outside;

    for (const shiftKey of [false, true]) {
      dialog.focusCalls = 0;
      const { event, state } = makeKeyEvent('Tab', shiftKey);
      trapTabKey(event as never, asContainer(dialog));
      assert.equal(state.preventDefaultCalls, 1);
      assert.equal(dialog.focusCalls, 1);
      assert.equal(fakeDocument.activeElement, dialog);
    }
  });
});

describe('trapTabKey Tab without Shift', () => {
  it('wraps from outside the container to the first candidate', () => {
    const outside = new FakeElement('BUTTON');
    const { dialog, first, middle, last, hiddenBefore, hiddenAfter } = makeDialog();
    fakeDocument.activeElement = outside;
    const { event, state } = makeKeyEvent();

    trapTabKey(event as never, asContainer(dialog));

    assert.equal(state.preventDefaultCalls, 1);
    assert.equal(first.focusCalls, 1);
    assert.deepEqual(
      focusableCalls(middle, last, hiddenBefore, hiddenAfter),
      [0, 0, 0, 0],
    );
    assert.equal(fakeDocument.activeElement, first);
  });

  it('wraps from the last candidate to the first candidate', () => {
    const { dialog, first, middle, last } = makeDialog();
    fakeDocument.activeElement = last;
    const { event, state } = makeKeyEvent();

    trapTabKey(event as never, asContainer(dialog));

    assert.equal(state.preventDefaultCalls, 1);
    assert.equal(first.focusCalls, 1);
    assert.equal(middle.focusCalls, 0);
    assert.equal(fakeDocument.activeElement, first);
  });

  it('does not intercept focus on a middle candidate', () => {
    const { dialog, first, middle, last } = makeDialog();
    fakeDocument.activeElement = middle;
    const { event, state } = makeKeyEvent();

    trapTabKey(event as never, asContainer(dialog));

    assert.equal(state.preventDefaultCalls, 0);
    assert.deepEqual(focusableCalls(first, middle, last), [0, 0, 0]);
    assert.equal(fakeDocument.activeElement, middle);
  });

  it('does not intercept focus on the first candidate', () => {
    const { dialog, first, middle, last } = makeDialog();
    fakeDocument.activeElement = first;
    const { event, state } = makeKeyEvent();

    trapTabKey(event as never, asContainer(dialog));

    assert.equal(state.preventDefaultCalls, 0);
    assert.deepEqual(focusableCalls(first, middle, last), [0, 0, 0]);
    assert.equal(fakeDocument.activeElement, first);
  });

  it('does not intercept focus inside the container but not on a candidate', () => {
    const { dialog, first, wrapper, middle, last } = makeDialog();
    const { event, state } = makeKeyEvent();

    for (const active of [dialog, wrapper]) {
      fakeDocument.activeElement = active;
      state.preventDefaultCalls = 0;
      trapTabKey(event as never, asContainer(dialog));
      assert.equal(state.preventDefaultCalls, 0);
      assert.equal(fakeDocument.activeElement, active);
    }

    assert.deepEqual(focusableCalls(first, middle, last), [0, 0, 0]);
  });
});

describe('trapTabKey Shift+Tab', () => {
  it('wraps from outside the container to the last candidate', () => {
    const outside = new FakeElement('BUTTON');
    const { dialog, first, middle, last, hiddenBefore, hiddenAfter } = makeDialog();
    fakeDocument.activeElement = outside;
    const { event, state } = makeKeyEvent('Tab', true);

    trapTabKey(event as never, asContainer(dialog));

    assert.equal(state.preventDefaultCalls, 1);
    assert.equal(last.focusCalls, 1);
    assert.deepEqual(
      focusableCalls(first, middle, hiddenBefore, hiddenAfter),
      [0, 0, 0, 0],
    );
    assert.equal(fakeDocument.activeElement, last);
  });

  it('wraps from the first candidate to the last candidate', () => {
    const { dialog, first, middle, last } = makeDialog();
    fakeDocument.activeElement = first;
    const { event, state } = makeKeyEvent('Tab', true);

    trapTabKey(event as never, asContainer(dialog));

    assert.equal(state.preventDefaultCalls, 1);
    assert.equal(last.focusCalls, 1);
    assert.equal(middle.focusCalls, 0);
    assert.equal(fakeDocument.activeElement, last);
  });

  it('wraps from the container itself to the last candidate', () => {
    const { dialog, first, middle, last } = makeDialog();
    fakeDocument.activeElement = dialog;
    const { event, state } = makeKeyEvent('Tab', true);

    trapTabKey(event as never, asContainer(dialog));

    assert.equal(state.preventDefaultCalls, 1);
    assert.equal(last.focusCalls, 1);
    assert.equal(first.focusCalls, 0);
    assert.equal(middle.focusCalls, 0);
    assert.equal(fakeDocument.activeElement, last);
  });

  it('does not intercept focus on a middle candidate', () => {
    const { dialog, first, middle, last } = makeDialog();
    fakeDocument.activeElement = middle;
    const { event, state } = makeKeyEvent('Tab', true);

    trapTabKey(event as never, asContainer(dialog));

    assert.equal(state.preventDefaultCalls, 0);
    assert.deepEqual(focusableCalls(first, middle, last), [0, 0, 0]);
    assert.equal(fakeDocument.activeElement, middle);
  });

  it('does not intercept focus on the last candidate', () => {
    const { dialog, first, middle, last } = makeDialog();
    fakeDocument.activeElement = last;
    const { event, state } = makeKeyEvent('Tab', true);

    trapTabKey(event as never, asContainer(dialog));

    assert.equal(state.preventDefaultCalls, 0);
    assert.deepEqual(focusableCalls(first, middle, last), [0, 0, 0]);
    assert.equal(fakeDocument.activeElement, last);
  });

  it('does not intercept a non-candidate wrapper inside the container', () => {
    const { dialog, first, wrapper, middle, last } = makeDialog();
    fakeDocument.activeElement = wrapper;
    const { event, state } = makeKeyEvent('Tab', true);

    trapTabKey(event as never, asContainer(dialog));

    assert.equal(state.preventDefaultCalls, 0);
    assert.deepEqual(focusableCalls(first, middle, last), [0, 0, 0]);
    assert.equal(fakeDocument.activeElement, wrapper);
  });
});

describe('trapTabKey active element that is not a Node', () => {
  it('treats it as outside for Tab', () => {
    const { dialog, first, middle, last } = makeDialog();
    fakeDocument.activeElement = { notANode: true };
    const { event, state } = makeKeyEvent();

    trapTabKey(event as never, asContainer(dialog));

    assert.equal(state.preventDefaultCalls, 1);
    assert.equal(first.focusCalls, 1);
    assert.equal(middle.focusCalls, 0);
    assert.equal(last.focusCalls, 0);
    assert.equal(fakeDocument.activeElement, first);
  });

  it('treats it as outside for Shift+Tab', () => {
    const { dialog, first, middle, last } = makeDialog();
    fakeDocument.activeElement = { notANode: true };
    const { event, state } = makeKeyEvent('Tab', true);

    trapTabKey(event as never, asContainer(dialog));

    assert.equal(state.preventDefaultCalls, 1);
    assert.equal(last.focusCalls, 1);
    assert.equal(first.focusCalls, 0);
    assert.equal(middle.focusCalls, 0);
    assert.equal(fakeDocument.activeElement, last);
  });
});

describe('trapTabKey with a single candidate', () => {
  it('wraps onto the only candidate in both directions', () => {
    const dialog = new FakeElement('DIV');
    const only = new FakeElement('BUTTON');
    dialog.append(only);
    const outside = new FakeElement('BUTTON');

    for (const shiftKey of [false, true]) {
      fakeDocument.activeElement = outside;
      only.focusCalls = 0;
      const { event, state } = makeKeyEvent('Tab', shiftKey);
      trapTabKey(event as never, asContainer(dialog));
      assert.equal(state.preventDefaultCalls, 1);
      assert.equal(only.focusCalls, 1);
      assert.equal(fakeDocument.activeElement, only);
    }

    fakeDocument.activeElement = only;
    only.focusCalls = 0;
    const onCandidate = makeKeyEvent();
    trapTabKey(onCandidate.event as never, asContainer(dialog));
    assert.equal(onCandidate.state.preventDefaultCalls, 1);
    assert.equal(only.focusCalls, 1, 'the first and last candidate are the same element');
  });
});
