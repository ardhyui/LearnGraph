import { createFileRoute } from '@tanstack/react-router';
import { pageHead } from '@/lib/page-titles';
import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import {
  japaneseDashboard,
  startJapaneseQuiz,
  submitJapaneseQuiz,
  recordJapanesePractice,
} from '@/server/japanese.functions';

export const Route = createFileRoute('/japanese')({
  head: () => pageHead('/japanese'),
  component: JapanesePage,
});
type Dashboard = Awaited<ReturnType<typeof japaneseDashboard>>;
type Quiz = Awaited<ReturnType<typeof startJapaneseQuiz>>;
type Result = Awaited<ReturnType<typeof submitJapaneseQuiz>>;
const button = 'rounded-xl bg-primary px-4 py-2.5 text-primary-foreground disabled:opacity-50';
const outline = 'rounded-xl border border-border px-4 py-2.5 hover:bg-muted disabled:opacity-50';
function JapanesePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [level, setLevel] = useState('N5');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [practice, setPractice] = useState('');
  const [minutes, setMinutes] = useState(20);
  const [note, setNote] = useState('');
  async function refresh() {
    setData(await japaneseDashboard());
  }
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      if (!quiz && !busy) void refresh().catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [quiz, busy]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function begin(id: string) {
    void run(async () => {
      setTopic(id);
      setResult(null);
      setAnswers({});
      setQuiz(await startJapaneseQuiz({ data: { concept: id } }));
    });
  }
  const next = data?.modules.find((m) => m.id === data.next);
  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <Sidebar />
      <main className="mx-auto w-full max-w-5xl space-y-6 p-5 sm:p-9">
        <header>
          <p className="text-sm font-medium text-primary">道 · Jalur belajar pribadi</p>
          <h1 className="mt-2 text-3xl font-bold">Bahasa Jepang sampai N1</h1>
          <p className="mt-2 text-muted-foreground">
            Latihan terarah, pengulangan tertunda, dan bukti kemampuan.
          </p>
        </header>
        {error ? (
          <div role="alert" className="rounded-xl border border-red-500 p-4">
            {error}
            <button className={outline + ' ml-3'} onClick={() => void run(refresh)}>
              Coba lagi
            </button>
          </div>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-xl border border-border p-3">
            {notice}
          </p>
        ) : null}
        {!data ? (
          <p role="status">Menyiapkan peta belajar…</p>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-3" aria-label="Ringkasan">
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground">Topik dengan bukti latihan ≥80%</p>
                <p className="mt-2 text-3xl font-semibold">
                  {data.modules.filter((m) => m.mastery >= 80).length} / {data.modules.length}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Sinyal latihan, bukan skor JLPT.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground">Kanji Michi mulai dipelajari</p>
                <p className="mt-2 text-3xl font-semibold">{data.michi?.learned ?? 0} / 72</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {data.michi
                    ? `Snapshot ${new Date(data.michi.at).toLocaleString('id-ID')}`
                    : 'Buka Michi untuk memulai sinkron lokal.'}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground">Kanji jatuh tempo</p>
                <p className="mt-2 text-3xl font-semibold">{data.michi?.due ?? 0}</p>
                <a className="mt-3 inline-block underline" href="http://127.0.0.1:17831/ulang">
                  Review di Michi →
                </a>
              </div>
            </section>
            <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <h2 className="text-xl font-semibold">Sesi hari ini · 90 menit</h2>
              <p className="mt-2">
                20 menit review · 25 menit pelajaran · 20 menit membaca · 15 menit listening · 10
                menit bicara/menulis.
              </p>
              <p className="mt-3">
                Saran awal:{' '}
                <strong>{next?.name ?? 'Tinjau hasil dan latihan yang jatuh tempo'}</strong>
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {next?.mode === 'quiz' ? (
                  <button disabled={busy} className={button} onClick={() => begin(next.id)}>
                    Mulai kuis yang disarankan
                  </button>
                ) : null}
                <a className={outline} href="http://127.0.0.1:17831/">
                  Buka Michi
                </a>
                <a
                  className={outline}
                  href="https://www.irodori-online.jpf.go.jp/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Materi Irodori
                </a>
                <button className={outline} disabled={busy} onClick={() => void run(refresh)}>
                  Perbarui progres
                </button>
              </div>
            </section>
            {quiz ? (
              <section
                className="rounded-2xl border border-border bg-card p-5"
                aria-labelledby="quiz-title"
              >
                <h2 id="quiz-title" className="text-xl font-semibold">
                  Kuis: {data.modules.find((m) => m.id === topic)?.name}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Tiga soal dari enam soal topik ini. Untuk bukti tertunda, ulang setelah ≥24 jam.
                  Ini kuis formatif awal, bukan ujian lengkap.
                </p>
                {result ? (
                  <div>
                    <p role="status" className="my-4 text-xl font-semibold">
                      Hasil: {result.correct}/{result.total} · sinyal penguasaan {result.mastery}%
                    </p>
                    <p className="mb-4">
                      {result.mastery >= 80
                        ? 'Bukti pengulangan tertunda terpenuhi. Tetap gunakan konsep dalam bacaan dan percakapan.'
                        : 'Bahas koreksi lalu ulang besok dengan variasi soal; latihan berulang hari ini tidak langsung membuktikan retensi.'}
                    </p>
                    {result.feedback.map((f, i) => (
                      <article key={i} className="my-3 rounded-xl border border-border p-3">
                        <p lang="ja">{f.prompt}</p>
                        <p>
                          Jawabanmu: {f.picked} · Kunci: {f.answer}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{f.explanation}</p>
                      </article>
                    ))}
                    <button
                      className={button}
                      onClick={() => {
                        setQuiz(null);
                        setResult(null);
                      }}
                    >
                      Selesai membahas
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        setResult(await submitJapaneseQuiz({ data: { id: quiz.id, answers } }));
                        await refresh();
                      });
                    }}
                  >
                    {quiz.questions.map((q, i) => (
                      <fieldset key={q.id} className="my-5">
                        <legend className="mb-2 font-medium">
                          {i + 1}. <span lang="ja">{q.prompt}</span>
                        </legend>
                        <div className="flex flex-wrap gap-3">
                          {q.options.map((o) => (
                            <label
                              key={o}
                              className="cursor-pointer rounded-xl border border-border p-3"
                            >
                              <input
                                type="radio"
                                name={q.id}
                                value={o}
                                checked={answers[q.id] === o}
                                onChange={() => setAnswers((a) => ({ ...a, [q.id]: o }))}
                                required
                                className="mr-2"
                              />
                              {o}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                    <div className="flex gap-3">
                      <button
                        className={button}
                        disabled={busy || Object.keys(answers).length !== quiz.questions.length}
                      >
                        Nilai jawaban
                      </button>
                      <button type="button" className={outline} onClick={() => setQuiz(null)}>
                        Tutup tanpa menilai
                      </button>
                    </div>
                  </form>
                )}
              </section>
            ) : null}
            <section aria-labelledby="path-title">
              <h2 id="path-title" className="text-xl font-semibold">
                Peta kemampuan
              </h2>
              <div className="my-4 flex flex-wrap gap-2" role="group" aria-label="Pilih level">
                {['N5', 'N4', 'N3', 'N2', 'N1'].map((l) => (
                  <button
                    key={l}
                    className={level === l ? button : outline}
                    aria-pressed={level === l}
                    onClick={() => setLevel(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                N5 memiliki kuis awal kana/tata bahasa dan integrasi 72 kanji Michi. N4–N1 berupa
                peta target serta tugas praktik, belum bank soal lengkap. Prasyarat adalah saran,
                bukan penguncian level.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.modules
                  .filter((m) => m.level === level)
                  .map((m) => (
                    <article key={m.id} className="rounded-2xl border border-border bg-card p-4">
                      <h3 className="font-semibold">{m.name}</h3>
                      <p className="my-2 text-sm text-muted-foreground">{m.description}</p>
                      <p className="text-sm">
                        {m.mode === 'external' ? 'Aktivitas tercatat' : 'Sinyal latihan'}:{' '}
                        {m.mastery}%{m.lastScore ? ` · kuis terakhir ${m.lastScore}` : ''}
                      </p>
                      <p className="my-2 text-xs text-muted-foreground">
                        {m.dueAt
                          ? `Ulang disarankan: ${new Date(m.dueAt).toLocaleString('id-ID')}. `
                          : ''}
                        {m.prereqs.length
                          ? 'Saran sebelumnya: ' +
                            m.prereqs
                              .map((id) => data.modules.find((x) => x.id === id)?.name)
                              .join(', ')
                          : 'Bisa mulai dari sini'}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {m.mode === 'quiz' ? (
                          <button className={outline} disabled={busy} onClick={() => begin(m.id)}>
                            Latihan kuis
                          </button>
                        ) : (
                          <a className={outline} href={m.resource} target="_blank" rel="noreferrer">
                            {m.mode === 'michi' ? 'Latihan di Michi' : 'Buka sumber'}
                          </a>
                        )}
                        {m.mode === 'external' ? (
                          <button
                            className={outline}
                            onClick={() => {
                              setPractice(m.id);
                              setNote('');
                            }}
                          >
                            Catat praktik
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
              </div>
            </section>
            {practice ? (
              <section className="rounded-2xl border border-border p-5">
                <h2 className="text-xl font-semibold">
                  Catat praktik: {data.modules.find((m) => m.id === practice)?.name}
                </h2>
                <p className="my-2 text-sm text-muted-foreground">
                  Catatan ini merekam aktivitas, tidak membuktikan kelulusan atau mastery. Tulis
                  sumber, hasil benar/total jika ada, kesalahan dan lokasi rekaman/tulisan.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await recordJapanesePractice({ data: { concept: practice, minutes, note } });
                      setNotice('Praktik tersimpan.');
                      setPractice('');
                      await refresh();
                    });
                  }}
                >
                  <label className="block">
                    Menit belajar nyata
                    <input
                      className="mx-3 rounded border border-border bg-background p-2"
                      type="number"
                      min="1"
                      max="1440"
                      required
                      value={minutes}
                      onChange={(e) => setMinutes(Number(e.target.value))}
                    />
                  </label>
                  <label className="mt-3 block">
                    Bukti dan catatan
                    <textarea
                      className="mt-2 block w-full rounded-xl border border-border bg-background p-3"
                      required
                      minLength={10}
                      maxLength={2000}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  <button className={button + ' mt-3'} disabled={busy}>
                    Simpan praktik
                  </button>
                </form>
              </section>
            ) : null}
            <footer className="border-t border-border py-4 text-sm text-muted-foreground">
              Naik level berdasarkan evaluasi lengkap membaca, listening dan output. Nilai di sini
              tidak setara skor berskala JLPT. Gunakan silabus lokal untuk evaluasi bulanan dan
              gerbang fase.
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
