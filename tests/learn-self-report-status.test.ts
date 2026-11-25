/**
 * Self-report busy status is announced (`/learn/$conceptId`).
 *
 * On the no-quiz self-report panel, both buttons ("I've got it" and
 * "Still learning") call `selfReport`, which flips `busy` true for the
 * duration of the save. While busy the buttons only faded (`disabled` +
 * `disabled:opacity-60`): their accessible names stayed the same, there was no
 * `aria-busy`, and no live region said anything, so a screen reader could not
 * tell that saving was in progress and the buttons looked frozen.
 *
 * This file locks `aria-busy={busy}` next to `disabled={busy}` on both
 * self-report buttons with their classes and labels untouched, one new
 * `sr-only` polite `role="status"` line after both buttons inside the same
 * container that says `Saving…` while busy and clears when idle, the existing
 * `noticeRef` result notice, the untouched `selfReport` flow, and that no
 * spinner, server function, RPC call or migration was added.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PAGE_FILE = join(ROOT, 'src', 'routes', 'learn.$conceptId.tsx');
const MIGRATIONS_FILE = join(ROOT, 'src', 'lib', 'migrations.ts');
const SCHEMAS_FILE = join(ROOT, 'src', 'lib', 'graph', 'rpc-schemas.ts');

const source = (file: string) => readFileSync(file, 'utf8');
const page = source(PAGE_FILE);

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The no-quiz self-report panel, from its container to its closing `</div>`. */
const CONTAINER_OPEN = '<div className="mt-3 flex flex-wrap gap-2">';
const containerStart = page.indexOf(CONTAINER_OPEN);
assert.ok(containerStart > 0, 'the self-report button container is rendered');
const containerEnd = page.indexOf('</div>', containerStart) + '</div>'.length;
const panel = page.slice(containerStart, containerEnd);
assert.ok(panel.includes('Still learning'), 'the self-report panel holds both buttons');

/** The opening tag of the button whose visible label is `label`. */
const buttonOf = (label: string) => {
  const labelIdx = panel.indexOf(label);
  assert.ok(labelIdx > 0, `the "${label}" button is rendered`);
  const open = panel.lastIndexOf('<button', labelIdx);
  assert.ok(open > 0, `the "${label}" button has an opening tag`);
  assert.equal(panel.slice(open, labelIdx).includes('</button>'), false, `the "${label}" label is inside its button`);
  return panel.slice(open, labelIdx);
};

const GOT_IT = buttonOf('I&apos;ve got it');
const STILL_LEARNING = buttonOf('Still learning');

describe('/learn self-report: both buttons announce they are busy', () => {
  it('keeps exactly two self-report buttons wired to selfReport', () => {
    assert.equal(
      count(panel, /onClick=\{\(\) => void selfReport\(/g),
      2,
      'exactly two self-report buttons',
    );
    assert.equal(count(panel, /selfReport\('got-it'\)/g), 1, 'the got-it handler stays');
    assert.equal(count(panel, /selfReport\('started'\)/g), 1, 'the started handler stays');
  });

  it('adds aria-busy={busy} next to disabled={busy} on both buttons', () => {
    for (const [label, tag] of [
      ["I've got it", GOT_IT],
      ['Still learning', STILL_LEARNING],
    ] as const) {
      assert.ok(tag.includes('disabled={busy}'), `${label}: disabled stays driven by busy`);
      assert.ok(tag.includes('aria-busy={busy}'), `${label}: aria-busy is driven by busy`);
      assert.ok(
        tag.indexOf('disabled={busy}') < tag.indexOf('aria-busy={busy}'),
        `${label}: aria-busy sits right after disabled`,
      );
    }
    assert.equal(count(panel, /aria-busy=\{busy\}/g), 2, 'one aria-busy per button');
  });

  it('keeps the button type, classes and visible labels untouched', () => {
    assert.ok(GOT_IT.includes('type="button"'), 'got-it stays a plain button');
    assert.ok(STILL_LEARNING.includes('type="button"'), 'still-learning stays a plain button');
    assert.ok(
      GOT_IT.includes(
        'className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"',
      ),
      'got-it classes untouched',
    );
    assert.ok(
      STILL_LEARNING.includes(
        'className="inline-flex min-h-9 items-center rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-primary/10 disabled:opacity-60"',
      ),
      'still-learning classes untouched',
    );
    assert.equal(count(panel, /I&apos;ve got it/g), 1, 'the got-it label stays once');
    assert.equal(count(panel, /Still learning/g), 1, 'the still-learning label stays once');
  });
});

describe('/learn self-report: one polite status line after the buttons', () => {
  it('adds exactly one sr-only polite status line', () => {
    assert.equal(count(panel, /role="status"/g), 1, 'one status line in the panel');
    assert.equal(count(panel, /aria-live="polite"/g), 1, 'one polite live region in the panel');
    assert.ok(
      panel.includes('<p role="status" aria-live="polite" className="sr-only">'),
      'the status line is a sr-only paragraph carrying role and politeness',
    );
  });

  it('says Saving… while busy and clears when idle', () => {
    assert.ok(panel.includes("{busy ? 'Saving…' : ''}"), 'the status text follows busy');
    assert.equal(count(panel, /Saving…/g), 1, 'the status copy appears once');
  });

  it('sits after both buttons inside the same container', () => {
    const statusStart = panel.indexOf('<p role="status"');
    const gotItClose = panel.indexOf('</button>', panel.indexOf('I&apos;ve got it'));
    const stillClose = panel.indexOf('</button>', panel.indexOf('Still learning'));
    assert.ok(gotItClose > 0, 'the got-it button is closed');
    assert.ok(stillClose > gotItClose, 'the still-learning button follows');
    assert.ok(statusStart > stillClose, 'the status line follows both buttons');
    const statusEnd = panel.indexOf('</p>', statusStart) + '</p>'.length;
    assert.equal(
      panel.slice(statusEnd).replace(/\s*\n\s*/g, ''),
      '</div>',
      'the status line is the last child of the container',
    );
  });
});

describe('/learn self-report: the result notice and the untouched surroundings', () => {
  it('keeps the existing noticeRef result notice as the other status line', () => {
    assert.equal(
      count(page, /role="status"/g),
      3,
      'the lesson-loading line, the result notice and the busy line',
    );
    assert.equal(count(page, /aria-live="polite"/g), 2, 'the result notice and the busy line are polite');
    assert.ok(page.includes('ref={noticeRef}'), 'the result notice keeps its ref');
    assert.ok(page.includes('tabIndex={-1}'), 'the result notice stays focusable');
  });

  it('adds no spinner inside the panel', () => {
    assert.equal(count(panel, /Loader2/g), 0, 'no Loader2 spinner in the self-report panel');
  });

  it('keeps the selfReport flow intact', () => {
    assert.ok(page.includes('const selfReport = async (outcome:'), 'selfReport stays');
    assert.ok(page.includes('setBusy(true);'), 'busy still starts with the request');
    assert.ok(page.includes('await recordStudyOutcome({ data: { learnerId, conceptId, outcome } })'), 'the save call stays');
    assert.ok(page.includes('await load();'), 'the reload stays');
    assert.ok(
      page.includes('} finally {\n      setBusy(false);'),
      'busy still clears in finally',
    );
  });

  it('keeps the panel copy and neighbouring blocks untouched', () => {
    assert.ok(
      page.includes('This concept has no quiz yet, so you decide when you know it (shown as self-reported).'),
      'the no-quiz copy stays',
    );
    assert.ok(page.includes('<TutorContext learnerId={learnerId} conceptId={conceptId} />'), 'TutorContext stays');
    assert.ok(page.includes('<nav aria-label="Next step"'), 'the next-step nav stays');
  });
});

describe('/learn self-report: no replaced name and no new data path', () => {
  it('adds no aria-label or aria-labelledby to the panel', () => {
    assert.equal(count(panel, /aria-label=/g), 0);
    assert.equal(count(panel, /aria-labelledby=/g), 0);
    assert.equal(count(panel, /aria-atomic=/g), 0);
  });

  it('adds no server function, RPC call or migration', () => {
    assert.equal(/createServerFn|graphCall|rpc-schemas/.test(page), false);
    for (const file of [MIGRATIONS_FILE, SCHEMAS_FILE]) {
      const other = source(file);
      assert.equal(other.includes('self-report-status'), false, `${file} gained busy wiring`);
      assert.equal(other.includes('Saving…'), false, `${file} gained the status copy`);
    }
  });
});
