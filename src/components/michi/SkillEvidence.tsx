import { useEffect, useRef, useState } from 'react';
import { getMichiEvidence } from '@/server/michi-evidence.functions';
import { SKILLS } from '@/lib/michi/evidence';
import type { MichiFeed } from '@/lib/michi/feed.server';
export function MichiSkillEvidence() {
  const [data, setData] = useState<MichiFeed | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false),
    mounted = useRef(false);
  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const next = await Promise.race([
        getMichiEvidence(),
        new Promise<never>(
          (_, reject) => (timeout = setTimeout(() => reject(new Error('Evidence timeout')), 15000)),
        ),
      ]);
      if (mounted.current) setData(next);
    } catch {
      if (mounted.current) setData({ status: 'unavailable' });
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 30000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  if (data?.status === 'disabled') return null;
  return (
    <section
      aria-labelledby="michi-evidence-title"
      className="rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="michi-evidence-title" className="scroll-mt-20 text-xl font-semibold">
          Bukti pelajaran Michi
        </h2>
        <button
          className="rounded-xl border border-border px-4 py-2.5 hover:bg-muted disabled:opacity-50"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy ? 'Memperbarui bukti…' : 'Perbarui bukti Michi'}
        </button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Proyeksi riwayat yang masih tersimpan di Michi, maksimal 30 sesi. Latihan langsung, bantuan,
        revisi mandiri dan cek setelah jeda tetap terpisah. Tidak mengubah sinyal penguasaan atau
        antrean review di sini.
      </p>
      {!data ? (
        <p role="status" className="mt-4">
          Membaca bukti pelajaran…
        </p>
      ) : data.status === 'unavailable' ? (
        <p role="status" className="mt-4">
          Bukti Michi belum dapat dibaca. Peta belajar dan kuis tetap bisa digunakan. Coba perbarui
          setelah Michi tersedia.
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            Dibaca {new Date(data.generatedAt).toLocaleString('id-ID')} · {data.sessionCount} sesi
            tersimpan · {data.pendingChecks} cek belum selesai, hasilnya belum disertakan.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.cards.map((card) => (
              <article
                key={card.skill}
                aria-label={`Bukti ${SKILLS[card.skill]}`}
                className="rounded-xl border border-border p-4"
              >
                <h3 className="font-semibold">{SKILLS[card.skill]}</h3>
                {!card.records ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Belum ada bukti pelajaran tercatat.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2 text-sm">
                    <p>
                      {card.responses} respons objektif · {card.uniqueSteps} langkah unik.
                    </p>
                    <p>
                      {card.correct} benar tanpa bantuan tercatat · {card.assisted} benar berbantuan
                      · {card.incorrect} belum tepat.
                    </p>
                    <p>
                      {card.viewed} paparan input · {card.selfReviewed} penilaian mandiri ·{' '}
                      {card.revisions} revisi mandiri.
                    </p>
                    <p>
                      {card.delayed} respons cek setelah jeda · {card.delayedCorrect} benar tanpa
                      bantuan · {card.delayedAssisted} berbantuan · {card.delayedIncorrect} belum
                      tepat · {card.flaggedDelayed} dengan peringatan konteks.
                    </p>
                    {card.tts || card.recordings ? (
                      <p>
                        {card.tts} catatan suara sintetis · {card.recordings} rekaman latihan. Belum
                        penilaian audio alami atau pengucapan terverifikasi.
                      </p>
                    ) : null}
                    {card.textAlternatives || card.unverifiedAudio ? (
                      <p>
                        {card.textAlternatives} alternatif teks · {card.unverifiedAudio} audio belum
                        terverifikasi. Bukan bukti listening.
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {card.draft} catatan draf · terakhir{' '}
                      {card.lastAt ? new Date(card.lastAt).toLocaleString('id-ID') : 'belum ada'}.
                    </p>
                  </div>
                )}
              </article>
            ))}
          </div>
          {data.unmapped || data.ignored ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {data.unmapped} catatan belum dipetakan ke materi yang cocok · {data.ignored}{' '}
              sesi/event ditahan dari proyeksi.
            </p>
          ) : null}
          <a
            className="mt-4 inline-flex min-h-11 items-center underline"
            href={data.origin + '/kemajuan'}
          >
            Lihat bukti dan sumber di Michi →
          </a>
          <p className="mt-2 text-xs text-muted-foreground">
            Pengulangan bukan tugas baru. Penilaian mandiri dan materi draf belum menjadi koreksi
            terverifikasi atau skor JLPT. Proyeksi menggantikan pembacaan sebelumnya; catatan yang
            dihapus tidak disimpan ulang di LearnGraph.
          </p>
        </>
      )}
    </section>
  );
}
