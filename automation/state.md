# State otomasi LearnGraph — dibaca & diperbarui setiap sesi

Terakhir diperbarui: 2026-11-13 (siklus 3: P0.1 selesai; berikutnya: P0.2 konfirmasi sebelum kuis menimpa nilai manual)

## Tugas berikutnya

Backlog `docs/ROADMAP.md` P0.2 (baris "Lanjutan: hasil kuis kini menimpa
nilai yang diisi manual untuk topik yang sama tanpa konfirmasi …;
pertimbangkan tanya dulu bila nilai lama berasal dari 'Set by you'"):
`submitAssessment` (kuis tunggal) dan `submitBatchAssessments` (mode batch)
di `src/routes/profile.tsx` (±baris 599–696) langsung menimpa
`editedScores[domainId]` apa pun sumber nilai lamanya, lalu
`persistScores` menyimpan seketika. Nilai yang dulu diisi manual
(sumber `manual_entry`/`adaptive_initial`, labelnya "Set by you" di
`src/lib/quiz.ts` → `scoreSourceLabel`) hilang tanpa peringatan.

Perilaku yang diinginkan: sebelum menimpa, bila nilai tersimpan untuk topik
itu berasal dari "Set by you", tampilkan konfirmasi dulu di dalam dialog
kuis yang sudah ada (bukan `window.confirm` — dialog sudah punya fokus
masuk/kembali, Escape, dan `trapTabKey` dari `src/lib/focus-trap.ts`;
pertahankan pola itu). Konfirmasi = simpan seperti sekarang; batal =
tidak ada yang tersimpan dan jawaban tetap di layar (pola "Keep the
answers on screen if saving failed"). Hasil kuis menimpa hasil kuis lain
TETAP tanpa konfirmasi (tidak ada regresi putaran #24: hasil kuis tetap
disimpan langsung, tidak menunggu tombol Save).

Rencana implementasi:

1. Helper murni di `src/lib/quiz.ts` (dites langsung di
   `tests/quiz.test.ts`, ikuti helper lama di file itu):
   mis. `manualTopicsAtRisk(scores, domainIds)` → daftar topik yang (a) ada
   di `domainIds` (akan ditimpa kuis) dan (b) nilai lamanya bukan hasil kuis
   dan bukan kosong — pakai `isQuizResult`/`SOURCE_LABELS` yang sudah ada.
   Kembalikan id topik (atau pasangan id + label "Set by you") agar UI bisa
   menyebutkannya.
2. `submitAssessment`: bila helper mengembalisi topik berisiko untuk
   `activeAssessment.domainId`, jangan langsung simpan — tampilkan langkah
   konfirmasi di dialog (state lokal, mis. `confirmOverwrite: Set<string>`),
   lalu simpan saat dikonfirmasi. `submitBatchAssessments`: sama untuk
   daftar topik batch yang menjawab lengkap.
3. UI pelajar berbahasa Inggris (keputusan D2): mis. "This will replace the
   value you set yourself for <topic>. Continue?" dengan tombol
   "Save quiz result" / "Go back".

Perilaku yang dikunci:

- Tanpa nilai manual lama → alur persis seperti sekarang (simpan langsung,
  pesan sukses sama).
- `persistScores`, bentuk `PsychometricScore` (score/confidence/source/
  interpretation/answers), dan server function tidak berubah.
- Escape tetap menutup dialog tanpa menyimpan; fokus kembali ke pembuka.

Test: unit helper di `tests/quiz.test.ts` (topik manual terdeteksi, hasil
kuuis/absen tidak, daftar kosong); bila murah, test render alur konfirmasi
mengikuti pola test profile yang ada. Smoke: cek lama cukup hijau; cek baru
hanya bila tidak flaky (lihat catatan hidrasi log 2026-11-08/09).

Dokumentasi: coret baris backlog P0.2 itu di `docs/ROADMAP.md` dengan
`✅ <tanggal>` + satu baris penjelasan, plus entri log bertanggal di akhir
file mengikuti pola entri lama. Sekalian (higien backlog, satu baris,
verifikasi cepat dulu): baris "dialog kuis belum menjebak fokus Tab di
dalamnya" tampak SUDAH selesai 2026-11-08 (commit d6477b6,
`trapTabKey` terpasang di `onKeyDown` dialog kuis profile.tsx) tapi belum
dicoret — bila masih benar, coret juga dengan `✅ <tanggal>`.

Gerbang: `npm run ci` utuh (±25 menit) harus hijau sebelum PR. Commit
berbahasa Indonesia, pola `fix:`. Setelah merge, tulis "Tugas berikutnya"
untuk sesi setelahnya — kandidat (pilih satu, spekkan dengan membaca kode
dulu): (a) backlog P0 "kunjungan pertama … layar muat penuh tanpa sidebar;
pertimbangkan kerangka halaman (sidebar + placeholder)" di `DBContext.tsx`
(catatan percobaan 12 Nov di baris backlog itu: cek harus menunggu keadaan,
bukan waktu), atau (b) backlog P0 "tombol di ringkasan Today mengakhiri
semua penundaan sekaligus; pertimbangkan daftar kecil per item di Today"
di `src/components/StudyToday.tsx` + `src/routes/gaps.tsx`.

## Riwayat

- 2026-11-13: PR #39 — Loop self-improve dibuat (automation/): self-improve.sh
  (loop opencode run satu tugas per sesi, deteksi kuota + fallback model,
  worktree terpisah, flock satu instance), TASK_PROMPT.md (konstitusi sesi:
  gerbang `npm run ci` utuh, PR ke main, dilarang item keputusan pemilik/🔒/
  migrasi skema), state.md (file ini), README.md, unit systemd, dan
  `automation/log/` di-gitignore. Tugas pertama: alasan ZPD berisi nama
  konsep (backlog P0.4).
- 2026-11-13: PR #40 — fix: alasan zona "too_hard" dari engine memuat nama
  konsep, bukan id mentah (helper murni `missingPrereqReason` di
  `src/lib/gaps.ts`; peta nama dibangun sekali per `computeZPD`, tanpa N+1);
  test unit helper + test engine; backlog P0.4 dicoret.
- 2026-11-13: PR #41 — fix: pilihan learner aktif disimpan per akun
  (`learngraph.activeLearner:<userId>`), bukan satu kunci global per browser
  (backlog P0.1). Sesi diambil di dalam `useActiveLearner` via `useSession()`
  — keenam pemanggil tak berubah. Migrasi sekali: kunci lama dibaca sebagai
  kandidat bila kunci per-akun kosong (tetap divalidasi `resolveActiveLearner`),
  tidak pernah dihapus/ditulis lagi. Helper murni `activeLearnerKey` +
  `nextActiveLearner` (placeholder learner pertama tidak menimpa pilihan
  per-akun begitu sesi termuat; pilihan klik pengguna tetap menang).
  `resolveActiveLearner` tak berubah (test lamanya utuh). Test unit 7 → 18.

## Blokiran

(tidak ada)
