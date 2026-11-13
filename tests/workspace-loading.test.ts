/**
 * First visit: the learning space is still being prepared, but the app frame
 * is already there. The skeleton must render the sidebar (so the layout does
 * not jump), keep the one status announcement, and never add a second page
 * heading. Behaviour itself is covered by the first-visit smoke check.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/components/WorkspaceLoading.tsx', import.meta.url), 'utf8');

describe('workspace loading skeleton', () => {
  it('renders the same app frame as a loaded page', () => {
    assert.ok(src.includes("import { Sidebar } from '@/components/Sidebar'"));
    assert.ok(src.includes('<Sidebar />'));
    assert.ok(src.includes('flex flex-col lg:flex-row min-h-screen bg-background'));
    assert.ok(src.includes('<main'));
    assert.ok(src.includes('flex-1 min-w-0'));
  });

  it('keeps the status announcement and hides the decorative parts', () => {
    assert.ok(src.includes('role="status"'));
    assert.ok(src.includes('aria-live="polite"'));
    assert.ok(src.includes('Getting your learning space ready…'));
    assert.ok(/<Loader2[\s\S]*?aria-hidden="true"/.test(src));
    assert.ok(src.includes('aria-hidden="true"'));
  });

  it('does not add a page heading (each page has exactly one <h1>)', () => {
    assert.equal(/<h1[\s>]/.test(src), false);
  });
});
