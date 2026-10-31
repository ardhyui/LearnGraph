/**
 * Postgres-backed storage for EducationGraphDB (replaces LevelDB/IndexedDB).
 *
 * The graph engine was written against an ordered key-value API (get / put /
 * del / prefix scan / atomic batch). This store keeps that exact contract, but
 * every key lives in a real table chosen by its prefix and every row is scoped
 * to one owner (the signed-in account):
 *
 *   learner:{userId}                       -> learners
 *   concept:{conceptId}                    -> concepts
 *   edge:prereq:{from}:{to}                -> prerequisite_edges
 *   edge:related:{edgeId}                  -> related_edges
 *   state:{userId}:{conceptId}             -> knowledge_states
 *   index:…                                -> graph_indexes
 *
 * Keys use `collate "C"`, so prefix scans return rows in the same byte order
 * LevelDB did — the algorithms see identical iteration order.
 */
import { sql, type Kysely, type Transaction } from 'kysely';
import type { BatchOperation, QueryOptions } from './types.ts';

export interface GraphRowTable {
  owner_id: string;
  key: string;
  data: unknown;
}

export interface LearnerTable extends GraphRowTable {
  user_id: string;
}
export interface ConceptTable extends GraphRowTable {
  concept_id: string;
  domain: string | null;
}
export interface PrerequisiteEdgeTable extends GraphRowTable {
  from_concept: string | null;
  to_concept: string | null;
}
export interface RelatedEdgeTable extends GraphRowTable {
  edge_id: string;
}
export interface KnowledgeStateTable extends GraphRowTable {
  learner_id: string | null;
  concept_id: string | null;
}

/** Kysely schema for the LearnGraph tables (see migrations/0002_learngraph.sql). */
export interface GraphDatabase {
  learners: LearnerTable;
  concepts: ConceptTable;
  prerequisite_edges: PrerequisiteEdgeTable;
  related_edges: RelatedEdgeTable;
  knowledge_states: KnowledgeStateTable;
  graph_indexes: GraphRowTable;
}

type TableName = keyof GraphDatabase;
type Db = Kysely<GraphDatabase> | Transaction<GraphDatabase>;

export const GRAPH_TABLES: TableName[] = [
  'learners',
  'concepts',
  'prerequisite_edges',
  'related_edges',
  'knowledge_states',
  'graph_indexes',
];

/** Which table a key (or key prefix) belongs to. */
export function tableForKey(key: string): TableName {
  if (key.startsWith('learner:')) return 'learners';
  if (key.startsWith('concept:')) return 'concepts';
  if (key.startsWith('edge:prereq:')) return 'prerequisite_edges';
  if (key.startsWith('edge:related:')) return 'related_edges';
  if (key.startsWith('state:')) return 'knowledge_states';
  if (key.startsWith('index:')) return 'graph_indexes';
  throw new Error(`Unknown LearnGraph key prefix: ${key}`);
}

/** Extracted id columns for a key (used for indexing/queries only). */
function columnsForKey(table: TableName, key: string, value: unknown): Record<string, unknown> {
  const rest = (prefix: string) => key.slice(prefix.length);
  switch (table) {
    case 'learners':
      return { user_id: rest('learner:') };
    case 'concepts': {
      const domain = (value as { domain?: unknown } | null)?.domain;
      return { concept_id: rest('concept:'), domain: typeof domain === 'string' ? domain : null };
    }
    case 'prerequisite_edges': {
      const v = value as { from?: string; to?: string } | null;
      return { from_concept: v?.from ?? null, to_concept: v?.to ?? null };
    }
    case 'related_edges':
      return { edge_id: rest('edge:related:') };
    case 'knowledge_states': {
      const v = value as { userId?: string; conceptId?: string } | null;
      return { learner_id: v?.userId ?? null, concept_id: v?.conceptId ?? null };
    }
    default:
      return {};
  }
}

/** JSON round-trip so stored values match LevelDB semantics (drops undefined, Dates -> ISO). */
function toJson(value: unknown): string {
  return JSON.stringify(value);
}

/** The ordered key-value contract EducationGraphDB is written against. */
export interface GraphStore {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  listKeys(prefix: string, options?: QueryOptions): Promise<string[]>;
  listEntries<T>(prefix: string, options?: QueryOptions): Promise<{ key: string; value: T }[]>;
  batch(operations: BatchOperation[]): Promise<void>;
  clear(): Promise<void>;
  close(): Promise<void>;
}

export interface PostgresGraphStoreOptions {
  /** Called on close() — e.g. destroy a connection the store owns. */
  onClose?: () => Promise<void>;
}

export class PostgresGraphStore implements GraphStore {
  private readonly db: Kysely<GraphDatabase>;
  private readonly ownerId: string;
  private readonly options: PostgresGraphStoreOptions;

  constructor(db: Kysely<GraphDatabase>, ownerId: string, options: PostgresGraphStoreOptions = {}) {
    if (!ownerId) throw new Error('PostgresGraphStore requires an ownerId');
    this.db = db;
    this.ownerId = ownerId;
    this.options = options;
  }

  async get<T>(key: string): Promise<T | null> {
    const table = tableForKey(key);
    const row = await this.db
      .selectFrom(table)
      .select('data')
      .where('owner_id', '=', this.ownerId)
      .where('key', '=', key)
      .executeTakeFirst();
    return row ? (row.data as T) : null;
  }

  async put<T>(key: string, value: T): Promise<void> {
    await this.putWith(this.db, key, value);
  }

  private async putWith(db: Db, key: string, value: unknown): Promise<void> {
    const table = tableForKey(key);
    const json = toJson(value);
    const parsed = JSON.parse(json) as unknown;
    const extra = columnsForKey(table, key, parsed);
    const data = sql`${json}::jsonb`;
    const hasUpdatedAt = table !== 'graph_indexes';
    await db
      .insertInto(table)
      .values({ owner_id: this.ownerId, key, data, ...extra } as never)
      .onConflict((oc) =>
        oc.columns(['owner_id', 'key']).doUpdateSet({
          data,
          ...extra,
          ...(hasUpdatedAt ? { updated_at: sql`now()` } : {}),
        } as never),
      )
      .execute();
  }

  async del(key: string): Promise<void> {
    await this.delWith(this.db, key);
  }

  private async delWith(db: Db, key: string): Promise<void> {
    await db
      .deleteFrom(tableForKey(key))
      .where('owner_id', '=', this.ownerId)
      .where('key', '=', key)
      .execute();
  }

  async exists(key: string): Promise<boolean> {
    const row = await this.db
      .selectFrom(tableForKey(key))
      .select('key')
      .where('owner_id', '=', this.ownerId)
      .where('key', '=', key)
      .executeTakeFirst();
    return Boolean(row);
  }

  private scan(prefix: string, options: QueryOptions) {
    // Same range LevelDB used: gte prefix, lt prefix + '\xFF'.
    let q = this.db
      .selectFrom(tableForKey(prefix))
      .where('owner_id', '=', this.ownerId)
      .where('key', '>=', prefix)
      .where('key', '<', prefix + '\xFF')
      .orderBy('key', options.reverse ? 'desc' : 'asc');
    if (options.limit !== undefined) q = q.limit(options.limit);
    return q;
  }

  async listKeys(prefix: string, options: QueryOptions = {}): Promise<string[]> {
    const rows = await this.scan(prefix, options).select('key').execute();
    return rows.map((r) => r.key);
  }

  async listEntries<T>(
    prefix: string,
    options: QueryOptions = {},
  ): Promise<{ key: string; value: T }[]> {
    const rows = await this.scan(prefix, options).select(['key', 'data']).execute();
    return rows.map((r) => ({ key: r.key, value: r.data as T }));
  }

  async batch(operations: BatchOperation[]): Promise<void> {
    if (operations.length === 0) return;
    await this.db.transaction().execute(async (trx) => {
      for (const op of operations) {
        if (op.type === 'put' && op.value !== undefined) {
          await this.putWith(trx, op.key, op.value);
        } else if (op.type === 'del') {
          await this.delWith(trx, op.key);
        }
      }
    });
  }

  async clear(): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      for (const table of GRAPH_TABLES) {
        await trx.deleteFrom(table).where('owner_id', '=', this.ownerId).execute();
      }
    });
  }

  async close(): Promise<void> {
    await this.options.onClose?.();
  }
}
