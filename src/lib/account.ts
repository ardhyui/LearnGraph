/**
 * Deleting an account (Roadmap M3). Removing the "user" row cascades to every
 * LearnGraph table that has a foreign key to it (sessions, learners, concepts,
 * their quiz questions and lessons, quiz attempts, the event log, …). Rows
 * that belong to an account without such a key are removed here first.
 * `tests/account-deletion.test.ts` checks every table with an `owner_id`.
 */
import { sql, type Kysely } from 'kysely';

export { LOCAL_OWNER_ID } from './auth/local-access.ts';

/** Account data without a foreign key to "user" (the Japanese quiz attempts). */
export async function deleteUnlinkedOwnerData(db: Kysely<any>, ownerId: string): Promise<void> {
  await sql`delete from japanese_quizzes where owner_id = ${ownerId}`.execute(db);
}
