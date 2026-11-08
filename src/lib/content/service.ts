/**
 * Server-side lesson content (Roadmap M2): the per-concept content store, the
 * example mathematics lessons, and the "lesson opened" event. Takes the
 * database and the owner's graph explicitly so the tests run the same code.
 */
import { sql, type ColumnType, type Generated, type Kysely } from 'kysely';
import type { EducationGraphDB } from '../graph/education-graph-db.ts';
import { appendEvent, EvidenceError } from '../evidence/service.ts';
import { demoConcepts } from '../demo-data.ts';
import { DEMO_CONTENT } from './demo-content.ts';
import {
  CONTENT_KINDS,
  MAX_CONTENT_PER_CONCEPT,
  type ContentInput,
  type ContentItem,
  type ContentKind,
  type PresentationStrategy,
} from './content.ts';

interface ContentItemTable {
  owner_id: string;
  id: string;
  concept_id: string;
  concept_key: ColumnType<string, never, never>;
  kind: ContentKind;
  title: string;
  body: string;
  solution: string;
  url: string | null;
  minutes: number | null;
  language: string;
  source: string;
  position: number;
  created_at: Generated<Date | string>;
  updated_at: ColumnType<Date | string, Date | string | undefined, unknown>;
}

/** Kysely schema for migrations/0006_content_items.sql. */
export interface ContentDatabase {
  content_items: ContentItemTable;
}

type AnyDb = Kysely<any>;
const typed = (db: AnyDb) => db as Kysely<ContentDatabase>;

const COLUMNS = [
  'id',
  'concept_id',
  'kind',
  'title',
  'body',
  'solution',
  'url',
  'minutes',
  'language',
  'source',
  'position',
] as const;

function toItem(row: Pick<ContentItemTable, (typeof COLUMNS)[number]>): ContentItem {
  return {
    id: row.id,
    conceptId: row.concept_id,
    kind: (CONTENT_KINDS as readonly string[]).includes(row.kind) ? row.kind : 'text',
    title: row.title,
    body: row.body,
    solution: row.solution,
    url: row.url,
    minutes: row.minutes,
    language: row.language,
    source: row.source,
    position: row.position,
  };
}

/** Content of one concept (editor order), or of the whole workspace. */
export async function listContent(db: AnyDb, owner: string, conceptId?: string): Promise<ContentItem[]> {
  let q = typed(db).selectFrom('content_items').select([...COLUMNS]).where('owner_id', '=', owner);
  if (conceptId !== undefined) q = q.where('concept_id', '=', conceptId);
  const rows = await q.orderBy('concept_id').orderBy('position').orderBy('id').execute();
  return rows.map(toItem);
}

/** Number of content items per concept id (concepts without content are absent). */
export async function contentCounts(db: AnyDb, owner: string): Promise<Record<string, number>> {
  const rows = await typed(db)
    .selectFrom('content_items')
    .select(['concept_id', (eb) => eb.fn.countAll<number | string>().as('n')])
    .where('owner_id', '=', owner)
    .groupBy('concept_id')
    .execute();
  return Object.fromEntries(rows.map((r) => [r.concept_id, Number(r.n)]));
}

/** Minutes of lesson material per concept (items without minutes count 2, links 0). */
export async function contentMinutes(db: AnyDb, owner: string): Promise<Record<string, number>> {
  const rows = await typed(db)
    .selectFrom('content_items')
    .select(['concept_id', 'kind', 'minutes'])
    .where('owner_id', '=', owner)
    .execute();
  const out: Record<string, number> = {};
  for (const r of rows) out[r.concept_id] = (out[r.concept_id] ?? 0) + (r.minutes ?? (r.kind === 'link' ? 0 : 2));
  return out;
}

/** Add an item, or replace the one with `input.id`. */
export async function saveContent(
  db: AnyDb,
  graph: EducationGraphDB,
  owner: string,
  input: ContentInput,
  newId: () => string,
): Promise<ContentItem> {
  if (!(await graph.getConcept(input.conceptId))) throw new EvidenceError('That concept no longer exists.');
  const id = input.id ?? newId();
  const existing = await typed(db)
    .selectFrom('content_items')
    .select('id')
    .where('owner_id', '=', owner)
    .where('id', '=', id)
    .executeTakeFirst();
  if (!existing && ((await contentCounts(db, owner))[input.conceptId] ?? 0) >= MAX_CONTENT_PER_CONCEPT) {
    throw new EvidenceError(`A concept can have at most ${MAX_CONTENT_PER_CONCEPT} content items.`);
  }
  const values = {
    concept_id: input.conceptId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? '',
    solution: input.kind === 'exercise' ? (input.solution ?? '') : '',
    url: input.kind === 'link' || input.kind === 'video' ? (input.url ?? null) : null,
    minutes: input.minutes ?? null,
    language: input.language ?? 'en',
    source: input.source ?? '',
    position: input.position ?? 0,
  };
  await typed(db)
    .insertInto('content_items')
    .values({ owner_id: owner, id, ...values })
    .onConflict((oc) => oc.columns(['owner_id', 'id']).doUpdateSet({ ...values, updated_at: sql`now()` }))
    .execute();
  return toItem({ id, ...values });
}

export async function deleteContent(db: AnyDb, owner: string, id: string): Promise<void> {
  await typed(db).deleteFrom('content_items').where('owner_id', '=', owner).where('id', '=', id).execute();
}

/** Meta flag: the example lessons were offered to this workspace once. */
export const DEMO_CONTENT_FLAG = 'seed:demo-content';

/**
 * Give the example mathematics concepts their lessons, once per workspace (new
 * and existing ones), only where the concept still looks like the example and
 * has no content of its own. Returns the number of items added.
 */
export async function seedDemoContent(db: AnyDb, graph: EducationGraphDB, owner: string): Promise<number> {
  if (await graph.getMeta(DEMO_CONTENT_FLAG)) return 0;
  const counts = await contentCounts(db, owner);
  let added = 0;
  for (const demo of demoConcepts) {
    const conceptId = demo.id.replace('concept:', '');
    const items = DEMO_CONTENT.filter((c) => c.conceptId === conceptId);
    if (items.length === 0 || counts[conceptId]) continue;
    const concept = await graph.getConcept(conceptId);
    if (!concept || concept.domain !== demo.domain) continue;
    const inserted = await typed(db)
      .insertInto('content_items')
      .values(
        items.map((c) => ({
          owner_id: owner,
          id: c.id,
          concept_id: c.conceptId,
          kind: c.kind,
          title: c.title,
          body: c.body,
          solution: c.solution,
          url: c.url,
          minutes: c.minutes,
          language: c.language,
          source: c.source,
          position: c.position,
        })),
      )
      .onConflict((oc) => oc.columns(['owner_id', 'id']).doNothing())
      .returning('id')
      .execute();
    added += inserted.length;
  }
  await graph.setMeta(DEMO_CONTENT_FLAG, { at: new Date().toISOString(), added });
  return added;
}

/**
 * Log that a learner opened a lesson, with the presentation order used, so
 * the effect of format preferences can be tested later (Roadmap M2).
 */
export async function recordLessonOpened(
  db: AnyDb,
  graph: EducationGraphDB,
  owner: string,
  input: { learnerId: string; conceptId: string; strategy: PresentationStrategy; order: ContentKind[] },
): Promise<void> {
  const [learner, concept] = await Promise.all([
    graph.getLearnerProfile(input.learnerId),
    graph.getConcept(input.conceptId),
  ]);
  if (!learner) throw new EvidenceError('That learner no longer exists.');
  if (!concept) throw new EvidenceError('That concept no longer exists.');
  const state = await graph.getKnowledgeState(input.learnerId, input.conceptId);
  await appendEvent(db, owner, {
    learnerId: input.learnerId,
    conceptId: input.conceptId,
    kind: 'lesson',
    outcome: 'opened',
    masteryBefore: state?.mastery ?? 0,
    masteryAfter: state?.mastery ?? 0,
    detail: {
      format: input.strategy.preference,
      formatSource: input.strategy.source,
      order: input.order.slice(0, MAX_CONTENT_PER_CONCEPT),
    },
  });
}
