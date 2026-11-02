/**
 * Dashboard for returning learners: greeting + learner shortcuts first,
 * admin pages tucked away.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { LEARNER_SHORTCUTS, MANAGE_LINKS, dashboardHeading, greetingName } from '../src/lib/dashboard.ts';

const routeFile = (href: string) => `src/routes${href}.tsx`;

describe('dashboard greeting', () => {
  it('uses the first name of the account', () => {
    assert.equal(greetingName({ name: 'Sari Smoke', email: 'sari@example.test' }), 'Sari');
    assert.equal(dashboardHeading({ name: '  Muhammad   Lazuardi ' }), 'Hi, Muhammad');
  });

  it('falls back to the email, then to a neutral heading', () => {
    assert.equal(greetingName({ name: '', email: 'ardhy.ui@example.test' }), 'ardhy.ui');
    assert.equal(greetingName({ name: '   ', email: null }), null);
    assert.equal(greetingName(null), null);
    assert.equal(dashboardHeading(undefined), 'Your learning today');
  });

  it('strips control/format characters and caps very long names', () => {
    assert.equal(greetingName({ name: '\u202eevil\u0000' }), 'evil');
    const long = greetingName({ name: 'x'.repeat(200) })!;
    assert.equal(long.length, 41);
    assert.ok(long.endsWith('…'));
  });
});

describe('dashboard links', () => {
  it('learner shortcuts are learner pages only, each backed by a route', () => {
    for (const l of LEARNER_SHORTCUTS) {
      assert.ok(!l.href.startsWith('/admin') && l.href !== '/data-entry', l.href);
      assert.ok(fs.existsSync(routeFile(l.href)), `${l.href} has no route file`);
    }
  });

  it('manage links point at existing editor pages', () => {
    for (const l of MANAGE_LINKS) assert.ok(fs.existsSync(routeFile(l.href)), `${l.href} has no route file`);
    const all = [...LEARNER_SHORTCUTS, ...MANAGE_LINKS].map((l) => l.href);
    assert.equal(new Set(all).size, all.length);
  });
});
