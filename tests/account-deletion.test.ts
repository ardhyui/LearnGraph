/**
 * Roadmap M3: "Hapus akun dan seluruh data dari UI". Deleting the "user" row
 * (what Better Auth's deleteUser does, after `beforeDelete`) must leave no row
 * of that account in ANY table with an `owner_id` column — including tables
 * added later — and must not touch another account.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { sql } from 'kysely';
import { openTestWorkspaces } from './support/graph-db.ts';
import { deleteUnlinkedOwnerData } from '../src/lib/account.ts';
import { DEMO_DECLINED_FLAG, removeDemoData, seedDemoDataIfEmpty } from '../src/lib/graph/seed.ts';
import { questionCounts } from '../src/lib/evidence/service.ts';
import { contentCounts } from '../src/lib/content/service.ts';
import { seedDemoQuestions, recordSelfReport, startQuiz, submitQuiz } from '../src/lib/evidence/service.ts';
import { seedDemoContent } from '../src/lib/content/service.ts';

const DIR = path.join(os.tmpdir(), `learngraph-account-delete-${process.pid}`);
const random = { int: (n: number) => Math.floor(Math.random() * n), uuid: randomUUID };

describe('account deletion', () => {
  after(() => fs.rmSync(DIR, { recursive: true, force: true }));

  it("removes every row of the account, in every owner-scoped table, and nothing else", async () => {
    const owners = ['owner-leaving', 'owner-staying'];
    const ws = await openTestWorkspaces(DIR, owners);
    try {
      for (const owner of owners) {
        const graph = await ws.graphFor(owner);
        await seedDemoDataIfEmpty(graph);
        await seedDemoQuestions(ws.db, graph, owner);
        await seedDemoContent(ws.db, graph, owner);
        const quiz = await startQuiz(ws.db, graph, owner, { learnerId: 'demo-alice', conceptId: 'fractions' }, random);
        await submitQuiz(ws.db, graph, owner, {
          sessionId: quiz.sessionId,
          answers: Object.fromEntries(quiz.questions.map((q) => [q.id, q.options[0]])),
        });
        await recordSelfReport(ws.db, graph, owner, { learnerId: 'demo-alice', conceptId: 'programming-basics', outcome: 'snooze' });
        await sql`insert into japanese_quizzes (id, owner_id, concept_id, question_ids, total) values (${randomUUID()}, ${owner}, 'jp-hiragana', '[]'::jsonb, 3)`.execute(ws.db);
      }

      const tables = (
        await sql<{ table_name: string }>`
          select table_name from information_schema.columns
          where column_name = 'owner_id' and table_schema = 'public'
          order by table_name`.execute(ws.db)
      ).rows.map((r) => r.table_name);
      for (const t of ['learners', 'concepts', 'knowledge_states', 'quiz_questions', 'quiz_sessions', 'learning_events', 'content_items', 'japanese_quizzes']) {
        assert.ok(tables.includes(t), `${t} is not owner-scoped`);
      }
      const count = async (table: string, owner: string) =>
        Number(
          (await sql<{ n: number }>`select count(*)::int as n from ${sql.table(table)} where owner_id = ${owner}`.execute(ws.db)).rows[0].n,
        );
      // There is something to delete in each kind of data.
      for (const t of ['learners', 'concepts', 'knowledge_states', 'quiz_questions', 'quiz_sessions', 'learning_events', 'content_items', 'japanese_quizzes']) {
        assert.ok((await count(t, 'owner-leaving')) > 0, `no ${t} to delete`);
      }

      await deleteUnlinkedOwnerData(ws.db, 'owner-leaving');
      await sql`delete from "user" where id = 'owner-leaving'`.execute(ws.db);

      const leftovers: string[] = [];
      let kept = 0;
      for (const t of tables) {
        const n = await count(t, 'owner-leaving');
        if (n > 0) leftovers.push(`${t}: ${n}`);
        kept += await count(t, 'owner-staying');
      }
      assert.deepEqual(leftovers, [], `rows left behind: ${leftovers.join(', ')}`);
      for (const t of ['learners', 'concepts', 'quiz_questions', 'content_items', 'learning_events', 'japanese_quizzes']) {
        assert.ok((await count(t, 'owner-staying')) > 0, `the other account lost its ${t}`);
      }
      assert.ok(kept > 0);
    } finally {
      await ws.close();
    }
  });

  it('"Start with an empty workspace" removes only the examples, for good', async () => {
    const ws = await openTestWorkspaces(`${DIR}-empty`, ['owner-empty']);
    try {
      const graph = await ws.graphFor('owner-empty');
      await seedDemoDataIfEmpty(graph);
      await seedDemoQuestions(ws.db, graph, 'owner-empty');
      await seedDemoContent(ws.db, graph, 'owner-empty');
      await graph.setLearnerProfile('me-sam', { name: 'Sam' });
      await graph.addConcept({ conceptId: 'my-topic', name: 'My topic', domain: 'my-course' });
      await graph.setKnowledgeState('me-sam', 'my-topic', { mastery: 50 });
      await graph.setKnowledgeState('me-sam', 'fractions', { mastery: 90 });

      assert.deepEqual(await removeDemoData(graph), { learners: 3, concepts: 11 });
      assert.deepEqual((await graph.listLearnerProfiles()).map((l) => l.userId), ['me-sam']);
      assert.deepEqual((await graph.listConcepts()).map((c) => c.conceptId), ['my-topic']);
      assert.deepEqual((await graph.getLearnerKnowledgeStates('me-sam')).map((s) => s.conceptId), ['my-topic']);
      assert.equal((await graph.listEdges()).length, 0);
      assert.deepEqual(await questionCounts(ws.db, 'owner-empty'), {});
      assert.deepEqual(await contentCounts(ws.db, 'owner-empty'), {});
      assert.ok(await graph.getMeta(DEMO_DECLINED_FLAG));

      // Even once the workspace is empty again, the examples do not come back.
      await graph.deleteLearnerProfile('me-sam');
      await graph.deleteConcept('my-topic');
      assert.equal(await seedDemoDataIfEmpty(graph), false);
      assert.equal((await graph.getStats()).conceptCount, 0);
    } finally {
      await ws.close();
      fs.rmSync(`${DIR}-empty`, { recursive: true, force: true });
    }
  });
});
