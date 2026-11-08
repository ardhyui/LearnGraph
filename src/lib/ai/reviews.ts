/**
 * The person's decision on each AI draft (Roadmap M5), kept as data, and the
 * approval rates the roadmap measures (target: 80% of AI questions and
 * prerequisite edges approved).
 */
import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';

export type DraftKind = 'question' | 'curriculum';
export type DraftDecision = 'approved' | 'edited' | 'discarded';

export async function recordDraftReview(
  db: Kysely<any>,
  owner: string,
  review: { kind: DraftKind; conceptId?: string | null; decision: DraftDecision; proposed?: number; accepted?: number; draft: unknown; final?: unknown },
): Promise<void> {
  await sql`insert into ai_draft_reviews (id, owner_id, kind, concept_id, decision, proposed, accepted, draft, final)
    values (${randomUUID()}, ${owner}, ${review.kind}, ${review.conceptId ?? null}, ${review.decision},
            ${review.proposed ?? 1}, ${review.accepted ?? (review.decision === 'discarded' ? 0 : 1)},
            ${JSON.stringify(review.draft)}::jsonb, ${review.final === undefined ? null : JSON.stringify(review.final)}::jsonb)`.execute(db);
}

export interface ApprovalStat {
  /** Drafted items reviewed (questions, or proposed prerequisite edges). */
  proposed: number;
  /** Of those, kept (approved as is or after an edit). */
  accepted: number;
  /** Kept without any change. */
  unchanged: number;
  rate: number | null;
}

export async function draftApproval(db: Kysely<any>, owner: string, kind: DraftKind): Promise<ApprovalStat> {
  const row = (
    await sql<{ proposed: number | null; accepted: number | null; unchanged: number | null }>`
      select sum(proposed)::int as proposed, sum(accepted)::int as accepted,
             sum(case when decision = 'approved' then accepted else 0 end)::int as unchanged
      from ai_draft_reviews where owner_id = ${owner} and kind = ${kind}`.execute(db)
  ).rows[0];
  const proposed = Number(row?.proposed ?? 0);
  const accepted = Number(row?.accepted ?? 0);
  return { proposed, accepted, unchanged: Number(row?.unchanged ?? 0), rate: proposed ? accepted / proposed : null };
}
