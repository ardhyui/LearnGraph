/**
 * Main navigation grouping: learner pages first, admin/debug pages in
 * collapsible groups that stay out of the way until needed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {
  NAV_SECTIONS,
  isNavItemActive,
  isSectionOpen,
  parseNavOpenState,
  sectionHasActive,
} from '../src/lib/navigation.ts';

const section = (id: string) => NAV_SECTIONS.find((s) => s.id === id)!;

describe('navigation sections', () => {
  it('lists every page once, each backed by a route file', () => {
    const hrefs = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    assert.equal(new Set(hrefs).size, hrefs.length);
    for (const href of hrefs) {
      const file = href === '/' ? 'src/routes/index.tsx' : `src/routes${href}.tsx`;
      assert.ok(fs.existsSync(file), `${href} has no route file (${file})`);
    }
  });

  it('keeps admin and debug pages out of the learner groups', () => {
    const learner = [...section('learn').items, ...section('explore').items].map((i) => i.href);
    assert.ok(learner.every((h) => !h.startsWith('/admin') && h !== '/tests' && h !== '/status' && h !== '/data-entry'));
    assert.ok(section('manage').items.every((i) => i.href.startsWith('/admin') || i.href === '/data-entry'));
    assert.deepEqual(section('developer').items.map((i) => i.href).sort(), ['/status', '/tests']);
    assert.equal(NAV_SECTIONS[0].id, 'learn');
    assert.equal(NAV_SECTIONS[0].items[0].href, '/');
  });

  it('marks the active page like the router does', () => {
    assert.ok(isNavItemActive('/', '/'));
    assert.ok(!isNavItemActive('/', '/gaps'));
    assert.ok(isNavItemActive('/graph', '/graph'));
    assert.ok(isNavItemActive('/admin/learners', '/admin/learners/x'));
    assert.ok(!isNavItemActive('/graph', '/graphs'), 'prefix of another word is not active');
    assert.ok(sectionHasActive(section('manage'), '/admin/concepts'));
    assert.ok(!sectionHasActive(section('manage'), '/'));
  });

  it('collapsible groups start closed, open on their own pages, and follow the saved choice', () => {
    assert.equal(isSectionOpen(section('learn'), '/tests', { }), true);
    assert.equal(isSectionOpen(section('manage'), '/', {}), false);
    assert.equal(isSectionOpen(section('developer'), '/', {}), false);
    assert.equal(isSectionOpen(section('developer'), '/tests', {}), true);
    assert.equal(isSectionOpen(section('manage'), '/', { manage: true }), true);
    // The group holding the current page cannot be hidden.
    assert.equal(isSectionOpen(section('manage'), '/admin/states', { manage: false }), true);
  });

  it('ignores malformed saved state', () => {
    assert.deepEqual(parseNavOpenState(null), {});
    assert.deepEqual(parseNavOpenState('not json'), {});
    assert.deepEqual(parseNavOpenState('[true]'), {});
    assert.deepEqual(parseNavOpenState('{"manage":"yes","learn":false,"developer":true,"x":true}'), { developer: true });
  });
});
