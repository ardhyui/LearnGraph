/**
 * "Download my data" on My Profile: a learner's own profile and progress as a
 * readable CSV (for a spreadsheet) or a complete JSON file (a personal backup
 * and, later, the import format). Pure functions (no I/O) so they are
 * unit-tested directly; the component reads the data through the same
 * account-scoped graph server functions as the rest of the page.
 */
import type { ConceptNode, KnowledgeState, LearnerProfile } from './graph/types.ts';
import { REVIEWABLE_MASTERY, reviewDueAt } from './graph/spacing.ts';
import { conceptLabel } from './gaps.ts';
import { domainLabel, focusDomains } from './onboarding.ts';
import { MASTERED_AT, summarizeProgress, type ProgressSummary } from './study.ts';

export const EXPORT_FORMAT = 'learngraph.learner-export';
export const EXPORT_VERSION = 1;

export type ProgressStatus = 'Mastered' | 'Learning' | 'Not started';

/** One readable row per concept the learner has started. */
export interface ProgressRow {
  conceptId: string;
  concept: string;
  subject: string;
  status: ProgressStatus;
  /** 0–100, rounded. */
  mastery: number;
  reviewCount: number;
  firstStudied: string | null;
  lastReviewed: string | null;
  /** When the next review falls due (ISO), only for learned concepts. */
  nextReviewDue: string | null;
}

export interface LearnerExport {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  learner: {
    id: string;
    name: string;
    subjects: string[];
    profile: LearnerProfile;
  };
  /** Progress over every concept in the workspace (not-started counts). */
  summary: ProgressSummary;
  progress: ProgressRow[];
  /** Full knowledge states as stored (history, misconceptions, dates). */
  knowledgeStates: KnowledgeState[];
}

type ConceptInfo = Pick<ConceptNode, 'conceptId' | 'name' | 'domain'> & {
  difficulty?: Partial<ConceptNode['difficulty']> | null;
};

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const t = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function masteryOf(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.round(Math.min(100, Math.max(0, n)));
}

export function progressStatus(mastery: number): ProgressStatus {
  if (mastery >= MASTERED_AT) return 'Mastered';
  return mastery > 0 ? 'Learning' : 'Not started';
}

/**
 * Readable progress rows: concepts the learner has a state for, sorted by
 * subject (unknown last) then concept name. States for deleted concepts are kept (named from
 * their id) so nothing the learner did is silently dropped.
 */
export function progressRows(states: readonly KnowledgeState[], concepts: readonly ConceptInfo[]): ProgressRow[] {
  const byId = new Map<string, ConceptInfo>();
  for (const c of concepts) if (c && typeof c.conceptId === 'string' && !byId.has(c.conceptId)) byId.set(c.conceptId, c);
  const rows: ProgressRow[] = [];
  const seen = new Set<string>();
  for (const s of states) {
    if (!s || typeof s.conceptId !== 'string' || seen.has(s.conceptId)) continue;
    seen.add(s.conceptId);
    const c = byId.get(s.conceptId);
    const mastery = masteryOf(s.mastery);
    const difficulty = typeof c?.difficulty?.absolute === 'number' ? c.difficulty.absolute : null;
    const due = mastery >= REVIEWABLE_MASTERY ? reviewDueAt(s, difficulty) : null;
    rows.push({
      conceptId: s.conceptId,
      concept: conceptLabel(s.conceptId, c?.name),
      subject: c?.domain ? domainLabel(c.domain) : '',
      status: progressStatus(mastery),
      mastery,
      reviewCount: Number.isInteger(s.reviewCount) && s.reviewCount > 0 ? s.reviewCount : 0,
      firstStudied: isoOrNull(s.firstSeen),
      lastReviewed: isoOrNull(s.lastReviewed),
      nextReviewDue: due === null ? null : isoOrNull(due),
    });
  }
  // Concepts without a known subject (e.g. deleted) go last.
  return rows.sort((a, b) => Number(!a.subject) - Number(!b.subject) || a.subject.localeCompare(b.subject) || a.concept.localeCompare(b.concept) || (a.conceptId < b.conceptId ? -1 : 1));
}

/** The complete JSON export for one learner. */
export function buildLearnerExport(input: {
  learner: LearnerProfile;
  states: readonly KnowledgeState[];
  concepts: readonly ConceptInfo[];
  now: Date;
}): LearnerExport {
  const { learner, concepts, now } = input;
  // Only this learner's states, even if a caller passes more.
  const states = input.states.filter((s) => s && s.userId === learner.userId);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    learner: {
      id: learner.userId,
      name: learner.name || learner.userId,
      subjects: focusDomains(learner),
      profile: learner,
    },
    summary: summarizeProgress([...concepts], states),
    progress: progressRows(states, concepts),
    knowledgeStates: [...states],
  };
}

/**
 * One CSV cell: quoted when needed, and text that a spreadsheet would run as a
 * formula (`=`, `+`, `-`, `@`, tab, CR at the start) is prefixed with `'`.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  // eslint-disable-next-line no-control-regex -- stripping control characters on purpose
  let text = String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_HEADER = ['Concept', 'Subject', 'Status', 'Mastery (%)', 'Reviews', 'First studied', 'Last reviewed', 'Next review due'];

/** Progress as CSV (UTF-8 with BOM so spreadsheet apps read names correctly). */
export function progressCsv(rows: readonly ProgressRow[]): string {
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
  const lines = [CSV_HEADER.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push(
      [r.concept, r.subject, r.status, r.mastery, r.reviewCount, day(r.firstStudied), day(r.lastReviewed), day(r.nextReviewDue)]
        .map(csvCell)
        .join(','),
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** `learngraph-sari-smoke-2026-11-03.csv` (local date; ASCII-only name). */
export function exportFileName(name: string | null | undefined, ext: 'csv' | 'json', now: Date): string {
  const slug =
    String(name ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'learner';
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = Number.isFinite(now.getTime())
    ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    : 'undated';
  return `learngraph-${slug}-${date}.${ext}`;
}
