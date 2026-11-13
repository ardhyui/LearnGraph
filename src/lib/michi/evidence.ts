import { z } from 'zod';
export const SKILLS = {
  kana: 'Kana',
  vocabulary: 'Kosakata',
  grammar: 'Tata bahasa',
  reading: 'Membaca',
  listening: 'Mendengarkan',
  speaking: 'Berbicara',
  writing: 'Menulis',
} as const;
const skill = z.enum([
  'kana',
  'vocabulary',
  'grammar',
  'reading',
  'listening',
  'speaking',
  'writing',
  'unmapped',
]);
const aid = z.enum(['kana', 'translation', 'model', 'transcript']);
const counter = z.number().int().min(0).max(100000);
const row = z.strictObject({
  id: z.string().min(1).max(300),
  sessionId: z.uuid(),
  stepId: z.string().min(1).max(120),
  unitId: z.string().min(1).max(120),
  revision: z.number().int().positive(),
  contentToken: z.string().regex(/^[a-f0-9]{64}$/),
  preview: z.boolean(),
  unitTitle: z.string().max(500),
  at: z.iso.datetime({ offset: true }),
  skill,
  source: z.enum(['practice', 'delayed', 'revision']),
  signal: z.enum([
    'viewed',
    'correct',
    'assisted',
    'incorrect',
    'self-reviewed',
    'skipped',
    'text-alternative',
    'unverified-audio',
  ]),
  kind: z.enum(['explain', 'read', 'listen', 'choice', 'recall', 'speak', 'write']),
  correct: z.boolean().optional(),
  aids: z.array(aid).max(4),
  inputAids: z.array(aid).max(4),
  audio: z.enum(['none', 'tts', 'recording', 'text-only']),
  compatible: z.boolean(),
  warnings: z
    .array(z.enum(['old-content', 'source-missing', 'practice-during-check', 'previous-exposure']))
    .max(4),
  contentStepId: z.string().min(1).max(2000),
  delayHours: z.number().finite().nonnegative().optional(),
});
const schema = z.strictObject({
  format: z.literal('michi-skill-evidence'),
  version: z.literal(1),
  generatedAt: z.iso.datetime({ offset: true }),
  scope: z.literal('retained-unit-history'),
  sessionCount: counter,
  pendingChecks: counter,
  ignoredSessions: counter,
  ignoredEvents: counter,
  unmapped: counter,
  rows: z.array(row).max(3600),
});
export type MichiReport = z.infer<typeof schema>;
/** Replaces the previous projection on refresh; never appends to a scheduler/event log. */
export function parseMichiReport(text: string, now: number): MichiReport {
  if (new TextEncoder().encode(text).length > 4 * 1024 * 1024)
    throw new Error('Evidence too large');
  const report = schema.parse(JSON.parse(text));
  if (
    !Number.isFinite(now) ||
    Date.parse(report.generatedAt) > now + 60000 ||
    now - Date.parse(report.generatedAt) > 60000
  )
    throw new Error('Evidence is not current');
  const unique = new Map<string, MichiReport['rows'][number]>();
  for (const r of report.rows) {
    if (Date.parse(r.at) > Date.parse(report.generatedAt)) throw new Error('Future evidence');
    const prior = unique.get(r.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(r))
      throw new Error('Conflicting evidence ID');
    unique.set(r.id, r);
  }
  return { ...report, rows: [...unique.values()] };
}
export function michiCards(report: MichiReport) {
  return (Object.keys(SKILLS) as (keyof typeof SKILLS)[]).map((skill) => {
    const rows = report.rows.filter((r) => r.skill === skill && r.compatible);
    const practice = rows.filter((r) => r.source === 'practice');
    const objective = practice.filter((r) =>
      ['correct', 'assisted', 'incorrect'].includes(r.signal),
    );
    const delayed = rows.filter((r) => r.source === 'delayed');
    return {
      skill,
      records: rows.length,
      responses: objective.length,
      uniqueSteps: new Set(objective.map((r) => r.contentStepId)).size,
      correct: objective.filter((r) => r.signal === 'correct').length,
      assisted: objective.filter((r) => r.signal === 'assisted').length,
      incorrect: objective.filter((r) => r.signal === 'incorrect').length,
      selfReviewed: practice.filter((r) => r.signal === 'self-reviewed').length,
      revisions: rows.filter((r) => r.source === 'revision').length,
      viewed: practice.filter((r) => r.signal === 'viewed').length,
      textAlternatives: rows.filter((r) => r.signal === 'text-alternative').length,
      unverifiedAudio: rows.filter((r) => r.signal === 'unverified-audio').length,
      tts: rows.filter((r) => r.audio === 'tts').length,
      recordings: rows.filter((r) => r.audio === 'recording').length,
      delayedAssisted: delayed.filter((r) => r.signal === 'assisted').length,
      delayedIncorrect: delayed.filter((r) => r.signal === 'incorrect').length,
      delayed: delayed.length,
      delayedCorrect: delayed.filter((r) => r.signal === 'correct').length,
      flaggedDelayed: delayed.filter((r) => r.warnings.length > 0).length,
      draft: rows.filter((r) => r.preview).length,
      lastAt: rows.map((r) => r.at).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null,
    };
  });
}
/** Only operator-configured, direct loopback HTTP origins; never a user-supplied fetch target. */
export function michiOrigin(value = 'http://127.0.0.1:17831'): string {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Direct loopback origin required');
  return url.origin;
}
