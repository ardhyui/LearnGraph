# State otomasi LearnGraph — dibaca & diperbarui setiap sesi

Terakhir diperbarui: 2026-11-13 (siklus 5: P0 #1 daftar per-item penundaan di Today selesai; berikutnya: gaya belajar turunan hanya bila topik kunci sudah diisi)

## Tugas berikutnya

Backlog `docs/ROADMAP.md` P0 #4, baris 48, bagian pertama: "gaya belajar
turunan memakai nilai 50 untuk topik yang belum diisi … pertimbangkan hanya
menurunkan bila topik kunci (Learning Styles, Big Five) sudah diisi".

Masalah: `deriveLearningStyle` (`src/lib/graph/psychometrics.ts` ±baris 636)
memakai `getScore = (domain) => scores[domain]?.score ?? 50`, lalu
`computeAndStoreLearningStyle` dan `computeAndStoreDerivedProfiles`
(`src/lib/graph/education-graph-db.ts` ±baris 328 & 362) selalu menulis
`profile.learningStyle`. Akibatnya pelajar yang baru mengisi satu topik
langsung mendapat gaya belajar "turunan" dari nilai default 50 (mis.
multimodal/reading, pace self-paced) dan Recommendations menampilkan "Ways
to learn it" seolah-olah dari profilnya — padahal topik kuncinya kosong.

Perilaku yang diinginkan: turunkan & simpan `learningStyle` **hanya** bila
topik kunci yang benar-benar dibaca `deriveLearningStyle` sudah diisi:
`learning_styles`, `big_five_openness`, `big_five_extraversion`,
`big_five_conscientiousness`, `big_five_neuroticism` (id dari
`PSYCHOMETRIC_DOMAINS`). Bila salah satu belum ada / bukan skor sah,
jangan menulis `learningStyle` sama sekali — `learningStyle` yang sudah ada
(mis. diisi manual di editor admin) tetap utuh, dan profil baru tetap tanpa
`learningStyle`. `information_processing` boleh tetap memakai default 50
saat topik kunci sudah lengkap; jangan memperluas tugas ini ke
`estimateCognitiveProfile`/`cognitiveProfile` (perilakunya tidak berubah).

Rencana implementasi:

1. Helper murni baru di `psychometrics.ts`, mis.
   `hasLearningStyleInputs(scores): boolean` — hanya `true` bila kelima id
   di atas punya `{ score }` finite (0–100); kosong, string, NaN, atau
   skor di luar rentang = belum diisi. Ekspor untuk dites langsung.
2. Pakai guard itu di `computeAndStoreLearningStyle` **dan**
   `computeAndStoreDerivedProfiles` di `education-graph-db.ts`: bila
   `false`, lewati penulisan `learningStyle` (jangan mengosongkannya);
   `cognitiveProfile` dan field lain tetap seperti sekarang, dan profile
   tetap tersimpan (`put`) walau gaya belajar tidak berubah.
3. `tests/profile-traits.test.ts` ±baris 100 memakai fixture tanpa
   `big_five_conscientiousness`/`big_five_neuroticism`; lengkapi fixture
   itu agar tetap mengharapkan `primary: 'visual'`, atau sesuaikan hanya
   bila perilaku yang dikunci memang berubah. Tambah test: skor kosong /
   sebagian / skor rusak tidak menurunkan gaya belajar (profil lama
   dipertahankan, profil baru tanpa `learningStyle`), sedangkan kelima
   topik lengkap menurunkan gaya seperti sekarang. Cek juga
   `tests/graph-rpc-schemas.test.ts` (memanggil `deriveLearningStyle`
   dengan semua domain) tetap hijau — tanda tangan `deriveLearningStyle`
   tidak perlu berubah.

Perilaku yang dikunci:

- `deriveLearningStyle` tetap fungsi murni dengan tanda tangan & hasil
  yang sama untuk skor lengkap; tidak ada perubahan skema/server function/
  RPC (`computeAndStoreDerivedProfiles` sudah ada di skema).
- Menyimpan profil tanpa topik kunci tidak boleh menghapus
  `learningStyle`/`cognitiveProfile` lama dan tidak menulis nilai default.
- UI pelajar berbahasa Inggris (D2); copy halaman Profile tidak perlu
  diubah kecuali memang menyesatkan.

Dokumentasi: baris 48 memuat beberapa sub-item. Pisahkan bagian yang
selesai menjadi butir `~~...~~ ✅ 2026-11-13 — ...` (gaya belajar turunan
hanya bila topik kunci terisi), dan biarkan sisa baris (menyimpan profil
menimpa `learningStyle`/`cognitiveProfile` manual di editor admin, serta
menampilkan asal "Ways to learn it") sebagai "Lanjutan:" terbuka. Tambah
entri log bertanggal di akhir `docs/ROADMAP.md` mengikuti pola entri lama.

Gerbang: `npm run ci` utuh (±25 menit) harus hijau sebelum PR. Bila `/tmp`
penuh (`ErrnoError` 28 di test PGlite), jalankan dengan
`TMPDIR=/home/<user>/.cache/lg-ci-tmp` — jangan menghapus data pengguna.
Commit berbahasa Indonesia, pola `fix:`/`feat:`. Setelah merge, tulis
"Tugas berikutnya" untuk sesi setelahnya — kandidat: sisa baris 48
(menyimpan profil menimpa `learningStyle`/`cognitiveProfile` yang diisi
manual di editor admin; baca `computeAndStoreDerivedProfiles` dan editor
admin dulu) atau backlog P0 #3 baris 37 "kunjungan pertama … layar muat
penuh tanpa sidebar; pertimbangkan kerangka halaman" (WAJIB baca catatan
percobaan 12 Nov: cek harus menunggu keadaan, bukan waktu).

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
- 2026-11-13: PR #42 — fix: kuis tunggal & batch bertanya dulu sebelum
  menimpa nilai topik yang labelnya "Set by you" (backlog P0.2). Helper murni
  `manualTopicsAtRisk` + `topicListLine` di `src/lib/quiz.ts`; langkah
  konfirmasi di dalam dialog kuis / panel batch (bukan `window.confirm`),
  fokus dikelola; hasil kuis menimpa hasil kuis tetap tanpa konfirmasi
  (regresi putaran #24 dijaga); `persistScores`/server function tak berubah.
  Test quiz 13 → 19. Sekalian higien backlog: baris fokus-Tab dialog kuis
  dicoret (sudah selesai 2026-11-08, commit d6477b6, terlewat).
- 2026-11-13: PR #43 — feat: penundaan review bisa diakhiri **per item**
  dari ringkasan Today (backlog P0 #1). Daftar kecil di bawah ringkasan
  (nama konsep + **Review it now** per item) memakai `recordStudyOutcome`
  outcome `'unsnooze'` yang sama; **Review them now** tetap ada bila >1;
  helper murni `namedSnoozedReviews` (`src/lib/gaps.ts`) + `conceptNameMap`
  sekali saat `load` (bentuk `SnoozedReview` tak berubah); fokus pindah ke
  review yang kembali / judul **Review now** bila kosong, kegagalan simpan
  membiarkan item tetap di daftar; pesan/fokus tak bocor saat ganti learner.
  Test unit baru 2 (`tests/snoozed-display.test.ts`), smoke lama hijau tanpa
  perubahan. `npm run ci` 328/328 unit, 172/172 smoke. Tanpa migrasi.

## Blokiran

(tidak ada)
