import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { sql } from 'kysely';
import { authMiddleware } from '@/lib/auth/middleware';
import { MODULES, LEARNER } from '@/lib/japanese/curriculum';
import { QUESTIONS } from '@/lib/japanese/questions';
import { evidenceMastery, nextQuizReview, type Attempt } from '@/lib/japanese/evidence';

type QuizRow = {
  id: string;
  concept_id: string;
  question_ids: string[];
  completed_at: Date | string | null;
  correct: number;
  total: number;
};
async function services(owner: string) {
  const { graphForOwner } = await import('@/lib/graph/server');
  const { getDb } = await import('@/lib/db');
  const graph = await graphForOwner(owner);
  if (!(await graph.getLearnerProfile(LEARNER)))
    await graph.setLearnerProfile(LEARNER, {
      name: 'Ardhyui — Bahasa Jepang',
      tags: ['japanese', 'N1-goal'],
    });
  for (const m of MODULES) {
    if (!(await graph.getConcept(m.id)))
      await graph.addConcept({
        conceptId: m.id,
        name: m.name,
        domain: 'japanese',
        subdomain: m.level,
        description: m.description,
        tags: [m.level, m.mode],
        difficulty: {
          absolute: { N5: 2, N4: 4, N3: 6, N2: 8, N1: 10 }[m.level] ?? 2,
          cognitiveLoad: 0.5,
          abstractness: 0.3,
        },
      });
  }
  for (const m of MODULES) {
    const existing = await graph.getPrerequisites(m.id);
    for (const from of m.prereqs)
      if (!existing.some((e) => e.from === from))
        await graph.addEdge({
          from,
          to: m.id,
          strength: 'recommended',
          reason: 'Urutan belajar yang disarankan; boleh disesuaikan melalui tes penempatan.',
        });
  }
  return { graph, db: getDb() };
}
async function michiSnapshot(owner: string) {
  const path = process.env.JAPANESE_MICHI_SNAPSHOT;
  if (!path || owner !== 'local-japanese-owner') return null;
  const { readFile } = await import('node:fs/promises');
  try {
    return JSON.parse(await readFile(path, 'utf8')) as {
      at: string;
      progress: {
        cards: Record<
          string,
          { reps: number; interval: number; lapses: number; last?: number; due: number }
        >;
        exams: Record<string, boolean>;
        history: Record<string, { reviews: number; answered: number; correct: number }>;
      };
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}
const CHAPTERS: Record<string, string> = {
  dasar: '一二三人口日月木',
  alam: '山川火水土金天雨',
  ukuran: '大小上下中左右外',
  waktu: '年時分今先前後毎',
  orang: '女男子父母友名何',
  sekolah: '学校生本語読書話',
  gerak: '見聞行来食飲入出',
  kota: '国店駅車電円高安',
  angka: '四五六七八九十百',
};
export const japaneseDashboard = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { graph, db } = await services(context.userId);
    const snapshot = await michiSnapshot(context.userId);
    const michiState = snapshot?.progress;
    if (michiState) {
      for (const m of MODULES.filter((m) => m.mode === 'michi')) {
        const chapter = m.id.replace('jp-kanji-', '');
        const chars = [...(CHAPTERS[chapter] ?? '')];
        const cards = chars.map((c) => michiState.cards[c]);
        const known = cards.filter(Boolean).length;
        const mature = cards.filter((c) => c && c.reps >= 2 && c.interval >= 3).length;
        const mastery =
          michiState.exams[chapter] && mature === chars.length
            ? 85
            : known
              ? Math.min(75, Math.round((known / cards.length) * 40 + (mature / cards.length) * 35))
              : 0;
        const prior = await graph.getKnowledgeState(LEARNER, m.id);
        const lastMs = Math.max(0, ...cards.map((c) => c?.last ?? 0));
        const stamp = lastMs ? new Date(lastMs).toISOString() : snapshot.at;
        if (!prior || prior.mastery !== mastery || (lastMs && prior.lastReviewed !== stamp))
          await graph.setKnowledgeState(LEARNER, m.id, {
            mastery,
            lastAssessed: stamp,
            lastReviewed: stamp,
            reviewCount: cards.length ? Math.min(...cards.map((c) => c?.reps ?? 0)) : 0,
          });
      }
    }
    const rows = (
      await sql<QuizRow>`select * from japanese_quizzes where owner_id=${context.userId} and completed_at is not null order by completed_at`.execute(
        db,
      )
    ).rows;
    const states = await graph.getLearnerKnowledgeStates(LEARNER);
    const modules = MODULES.map((m) => {
      const state = states.find((s) => s.conceptId === m.id);
      const attempts = rows.filter((r) => r.concept_id === m.id);
      const last = attempts.at(-1);
      return {
        ...m,
        mastery: state?.mastery ?? 0,
        attempts: attempts.length,
        lastScore: last ? `${last.correct}/${last.total}` : null,
        dueAt: nextQuizReview(
          attempts.map((r) => ({
            at: new Date(r.completed_at!).toISOString(),
            correct: r.correct,
            total: r.total,
            ids: r.question_ids,
          })),
        ),
        lastPracticeAt: state?.interactions.at(-1)?.timestamp ?? null,
        ready: m.prereqs.every(
          (id) => (states.find((s) => s.conceptId === id)?.mastery ?? 0) >= 70,
        ),
      };
    });
    const quizzes = modules.filter(
      (m) => m.mode === 'quiz' && m.ready && (!m.dueAt || Date.parse(m.dueAt) <= Date.now()),
    );
    if (process.env.JAPANESE_LOCAL_EXPORT_DIR && context.userId === 'local-japanese-owner') {
      const { writeFile, rename, mkdir } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const { randomUUID } = await import('node:crypto');
      const dir = process.env.JAPANESE_LOCAL_EXPORT_DIR;
      await mkdir(dir, { recursive: true });
      const dest = join(dir, 'learngraph-summary.json');
      const temp = dest + '.' + randomUUID() + '.tmp';
      await writeFile(
        temp,
        JSON.stringify({
          at: new Date().toISOString(),
          modules,
          quizzes: rows.map((r) => ({
            concept: r.concept_id,
            at: r.completed_at,
            correct: r.correct,
            total: r.total,
          })),
          practice: states.flatMap((s) =>
            s.interactions
              .filter((i) => i.type === 'practice')
              .map((i) => ({ ...i, concept: s.conceptId })),
          ),
        }),
        { mode: 0o600 },
      );
      await rename(temp, dest);
    }
    return {
      modules,
      next:
        quizzes[0]?.id ??
        modules
          .filter((m) => m.mode !== 'quiz' && m.ready && m.mastery < 80)
          .sort((a, b) => (a.lastPracticeAt ?? '').localeCompare(b.lastPracticeAt ?? ''))[0]?.id ??
        null,
      michi: snapshot
        ? {
            at: snapshot.at,
            learned: Object.keys(michiState!.cards).length,
            due: Object.values(michiState!.cards).filter((c) => c.due <= Date.now()).length,
            history: michiState!.history,
          }
        : null,
    };
  });
export const startJapaneseQuiz = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ concept: z.string().max(100) }))
  .handler(async ({ data, context }) => {
    if (!MODULES.some((m) => m.id === data.concept && m.mode === 'quiz'))
      throw new Error('Topik kuis tidak tersedia.');
    const { db } = await services(context.userId);
    const old = (
      await sql<QuizRow>`select * from japanese_quizzes where owner_id=${context.userId} and concept_id=${data.concept} and completed_at is not null order by completed_at desc limit 1`.execute(
        db,
      )
    ).rows[0];
    const { randomUUID, randomInt } = await import('node:crypto');
    const pool = QUESTIONS.filter((q) => q.topic === data.concept);
    // Shuffle first, then prefer questions absent from the previous attempt.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    pool.sort(
      (a, b) =>
        Number(old?.question_ids.includes(a.id) ?? false) -
        Number(old?.question_ids.includes(b.id) ?? false),
    );
    const selected = pool.slice(0, 3);
    const id = randomUUID();
    await sql`insert into japanese_quizzes(id,owner_id,concept_id,question_ids,total) values(${id},${context.userId},${data.concept},${JSON.stringify(selected.map((q) => q.id))}::jsonb,${selected.length})`.execute(
      db,
    );
    return {
      id,
      questions: selected.map((q) => {
        const options = [...q.options];
        for (let i = options.length - 1; i > 0; i--) {
          const j = randomInt(i + 1);
          [options[i], options[j]] = [options[j], options[i]];
        }
        return { id: q.id, prompt: q.prompt, options };
      }),
    };
  });
export const submitJapaneseQuiz = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().uuid(),
      answers: z
        .record(z.string().max(100), z.string().max(200))
        .refine((a) => Object.keys(a).length <= 3),
    }),
  )
  .handler(async ({ data, context }) => {
    const { graph, db } = await services(context.userId);
    const row = (
      await sql<QuizRow>`select * from japanese_quizzes where id=${data.id} and owner_id=${context.userId}`.execute(
        db,
      )
    ).rows[0];
    if (!row) throw new Error('Sesi tidak ditemukan.');
    if (row.completed_at) throw new Error('Sesi ini sudah dinilai. Mulai sesi baru.');
    const questions = row.question_ids.map((id) => QUESTIONS.find((q) => q.id === id)!);
    if (questions.some((q) => !q || !q.options.includes(data.answers[q.id])))
      throw new Error('Jawab semua soal terlebih dahulu.');
    const correct = questions.filter((q) => data.answers[q.id] === q.answer).length;
    const updated =
      await sql`update japanese_quizzes set answers=${JSON.stringify(data.answers)}::jsonb,correct=${correct},completed_at=now() where id=${row.id} and owner_id=${context.userId} and completed_at is null returning id`.execute(
        db,
      );
    if (!updated.rows.length) throw new Error('Sesi sudah dinilai.');
    const rows = (
      await sql<QuizRow>`select * from japanese_quizzes where owner_id=${context.userId} and concept_id=${row.concept_id} and completed_at is not null order by completed_at`.execute(
        db,
      )
    ).rows;
    const attempts: Attempt[] = rows.map((r) => ({
      at: new Date(r.completed_at!).toISOString(),
      correct: r.correct,
      total: r.total,
      ids: r.question_ids,
    }));
    const mastery = evidenceMastery(attempts);
    const stamp = attempts.at(-1)!.at;
    await graph.setKnowledgeState(LEARNER, row.concept_id, {
      mastery,
      lastReviewed: stamp,
      lastAssessed: stamp,
      reviewCount: attempts.length,
      retentionStrength: mastery / 100,
    });
    return {
      correct,
      total: row.total,
      mastery,
      feedback: questions.map((q) => ({
        prompt: q.prompt,
        answer: q.answer,
        picked: data.answers[q.id],
        explanation: q.explanation,
      })),
    };
  });
export const recordJapanesePractice = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      concept: z.string().max(100),
      minutes: z.number().int().min(1).max(1440),
      note: z.string().min(10).max(2000),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!MODULES.some((m) => m.id === data.concept && m.mode === 'external'))
      throw new Error('Topik tidak valid.');
    const { graph } = await services(context.userId);
    const prior = await graph.getKnowledgeState(LEARNER, data.concept);
    const timestamp = new Date().toISOString();
    await graph.setKnowledgeState(LEARNER, data.concept, {
      mastery: Math.max(prior?.mastery ?? 0, 50),
      interactions: [
        ...(prior?.interactions ?? []),
        { timestamp, type: 'practice' as const, duration: data.minutes, notes: data.note },
      ].slice(-400),
    });
    return { saved: true };
  });
