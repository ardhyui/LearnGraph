#!/usr/bin/env node
/**
 * Backup restore check (Roadmap M3, decision D7): compare a database restored
 * from a backup with the one it was taken from. Both connections are opened
 * read-only and only read table names, applied migrations and row counts.
 *
 *   SOURCE_DATABASE_URL=postgres://…  RESTORED_DATABASE_URL=postgres://… \
 *     node scripts/compare-databases.mjs
 *
 * Exits 1 when the restore is incomplete: a table or migration is missing, or
 * a table that has rows in the source is empty in the restored copy. Other
 * row-count differences are listed, because the source keeps changing after
 * the backup was taken. See docs/BACKUP-RESTORE.md.
 */

/**
 * @typedef {{ tables: Record<string, number>, migrations: string[] }} Snapshot
 * @typedef {(text: string) => Promise<{ rows: Record<string, unknown>[] }>} Query
 */

/** @param {string} name */
const quoteIdent = (name) => `"${name.replaceAll('"', '""')}"`;

/**
 * Table row counts and applied migrations of one database (public schema).
 * @param {Query} query
 * @returns {Promise<Snapshot>}
 */
export async function snapshot(query) {
  const { rows } = await query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
  );
  /** @type {Record<string, number>} */
  const tables = {};
  for (const r of rows) {
    const name = String(r.table_name);
    const counted = await query(`select count(*)::bigint as n from public.${quoteIdent(name)}`);
    tables[name] = Number(counted.rows[0]?.n ?? 0);
  }
  const migrations =
    '_migrations' in tables ? (await query('select name from _migrations order by name')).rows.map((r) => String(r.name)) : [];
  return { tables, migrations };
}

/**
 * What a restored copy lacks compared with its source.
 * @param {Snapshot} source
 * @param {Snapshot} restored
 * @returns {{ problems: string[], notes: string[] }}
 */
export function compareSnapshots(source, restored) {
  const problems = [];
  const notes = [];
  for (const [table, n] of Object.entries(source.tables)) {
    const r = restored.tables[table];
    if (r === undefined) problems.push(`table ${table} is missing`);
    else if (n > 0 && r === 0) problems.push(`table ${table} is empty (source has ${n} rows)`);
    else if (r !== n) notes.push(`table ${table}: ${r} rows (source now ${n})`);
  }
  for (const table of Object.keys(restored.tables)) {
    if (!(table in source.tables)) notes.push(`table ${table} exists only in the restored copy`);
  }
  const restoredMigrations = new Set(restored.migrations);
  for (const m of source.migrations) {
    if (!restoredMigrations.has(m)) problems.push(`migration ${m} is missing`);
  }
  return { problems, notes };
}

/**
 * @param {string} url
 * @returns {Promise<Snapshot>}
 */
async function snapshotOf(url) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // Read-only for the whole session: nothing here can change either database.
    await client.query('set session characteristics as transaction read only');
    return await snapshot((text) => client.query(text));
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const source = process.env.SOURCE_DATABASE_URL;
  const restored = process.env.RESTORED_DATABASE_URL;
  if (!source || !restored || source === restored) {
    console.error('Set SOURCE_DATABASE_URL and RESTORED_DATABASE_URL to two different databases.');
    process.exit(2);
  }
  const [a, b] = await Promise.all([snapshotOf(source), snapshotOf(restored)]);
  console.log('table'.padEnd(28), 'source'.padStart(10), 'restored'.padStart(10));
  for (const table of [...new Set([...Object.keys(a.tables), ...Object.keys(b.tables)])].sort()) {
    console.log(table.padEnd(28), String(a.tables[table] ?? '-').padStart(10), String(b.tables[table] ?? '-').padStart(10));
  }
  console.log(`migrations: source ${a.migrations.length}, restored ${b.migrations.length}`);
  const { problems, notes } = compareSnapshots(a, b);
  for (const n of notes) console.log(`  note: ${n}`);
  for (const p of problems) console.error(`  PROBLEM: ${p}`);
  console.log(problems.length ? `Restore check failed (${problems.length})` : 'Restore check passed');
  process.exit(problems.length ? 1 : 0);
}
