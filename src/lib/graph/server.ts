/**
 * Server-only: an EducationGraphDB bound to one owner's workspace.
 */
import { getDb } from '../db';
import { EducationGraphDB } from './education-graph-db.ts';
import { PostgresGraphStore } from './store.ts';

export async function graphForOwner(ownerId: string): Promise<EducationGraphDB> {
  const graph = new EducationGraphDB(new PostgresGraphStore(getDb(), ownerId));
  await graph.open();
  return graph;
}
