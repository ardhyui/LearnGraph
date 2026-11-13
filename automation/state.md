# State otomasi LearnGraph — dibaca & diperbarui setiap sesi

Terakhir diperbarui: 2026-11-13 (siklus 6: gaya belajar turunan hanya bila topik kunci terisi; berikutnya: tandai "Ways to learn it" yang berasal dari profil)

## Tugas berikutnya

Backlog `docs/ROADMAP.md` baris 49 (sisa P0 #4): "Ways to learn it" di
Recommendations belum menunjukkan bagian mana yang berasal dari profil pelajar.

Masalah: `selectScaffoldingStrategies` (`src/lib/graph/scaffolding.ts` ±baris
95–181) selalu menyertakan `worked_example` ("Universal foundation…") untuk
semua orang, lalu menambah strategi lain hanya bila profil mendukungnya
(gaya belajar visual/kinesthetic, neuroticism/extraversion/openness dari Big
Five, working memory/attention span dari `cognitiveProfile`). Di kartu
Recommendations (`src/routes/recommendations.tsx` ±baris 520–540) semua chip
tampil sama, jadi pelajar tak bisa membedakan saran umum dari saran yang
dihitung dari jawabannya — padahal sejak siklus 6 gaya belajar hanya ada bila
topik kunci terisi.

Perilaku yang diinginkan: setiap `ScaffoldingStrategy` membawa asal yang
eksplisit, dan UI menampilkannya dengan bahasa sehari-hari (Inggris, D2).
Saran universal (`worked_example`) ditandai umum; saran yang muncul karena
profil (gaya belajar, Big Five, `cognitiveProfile`) ditandai berasal dari
profil. `reason` yang ada tetap utuh (dipakai `title`), urutan/prioritas
strategi tidak berubah, dan profil kosong tetap hanya menghasilkan
`worked_example` bertanda umum.

Rencana implementasi:

1. Tambah field opsional pada `ScaffoldingStrategy` di
   `src/lib/graph/types.ts`, mis. `source?: 'profile' | 'general'` (atau
   helper murni `strategySource` bila lebih kecil); isi di
   `selectScaffoldingStrategies` — `worked_example` = `general`, sisanya =
   `profile`. Jangan mengubah `priority`, `reason`, atau daftar strategi.
2. Di `src/routes/recommendations.tsx`, tampilkan penanda kecil yang terbaca
   (mis. label "From your profile" / "Always suggested" di dalam chip atau
   `aria-label` + teks visual) tanpa mengubah tinggi kartu secara berlebihan;
   jangan mengandalkan `title` saja (tak terbaca keyboard/pembaca layar).
   Chip tanpa `source` (data lama) tetap tampil seperti sekarang.
3. Test: `tests/profile-traits.test.ts` (atau file baru
   `tests/scaffolding-source.test.ts`) — profil kosong: hanya
   `worked_example` dan `source: 'general'`; profil dengan `learning_styles`
   + Big Five lengkap: `visual_aids`/`peer_discussion`/`analogy` bertanda
   `profile`; `cognitiveProfile.workingMemoryCapacity: 'low'` menandai
   `chunking` sebagai `profile`. Tambah penjaga statis bahwa halaman
   Recommendations merender label asal. Cek `tests/graph-rpc-schemas.test.ts`
   dan smoke Recommendations tetap hijau (bila bentuk respons RPC berubah,
   pastikan aditif dan tidak ada assertion kunci yang patah).
4. Bila ada cek smoke yang mudah: di kartu Recommendations, chip
   `worked_example` menampilkan label umum dan minimal satu chip dari profil
   menampilkan label profil setelah kuis/profil terisi. Jangan menambah cek
   berbasis waktu; tunggu keadaan.

Perilaku yang dikunci:

- `selectScaffoldingStrategies` tetap fungsi murni; tanpa perubahan
  skema/server function/RPC/migrasi (field baru hanya di objek respons).
- Profil tanpa topik kunci/cognitive profile tidak boleh mendapat strategi
  profil baru; label asal tidak boleh mengubah jumlah/urutan strategi.
- UI pelajar berbahasa Inggris (D2); `deriveLearningStyle` dan guard
  `hasLearningStyleInputs` dari siklus 6 tidak diubah.

Gerbang: `npm run ci` utuh (±25 menit) harus hijau sebelum PR. Commit
berbahasa Indonesia, pola `feat:`/`fix:`. Setelah merge, tulis "Tugas
berikutnya" untuk sesi setelahnya — kandidat: sisa baris 49 (mode
"Automatic"/"Set, then adjust" belum berinferensi; opsi sudah disembunyikan,
jadi mungkin tinggal higien backlog) atau baris 48 bagian menimpa
`learningStyle`/`cognitiveProfile` manual (baca dulu apakah masih nyata
setelah guard siklus 6), lalu P0 #3 baris 37 kunjungan pertama (WAJIB baca
catatan 12 Nov: cek harus menunggu keadaan, bukan waktu).

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
- 2026-11-13: siklus 6 — fix: gaya belajar turunan hanya disimpan bila
  kelima topik kunci terisi. Helper murni `hasLearningStyleInputs`
  (`src/lib/graph/psychometrics.ts`) menerima hanya `{ score }` angka finite
  0–100 untuk `learning_styles`, `big_five_openness`, `big_five_extraversion`,
  `big_five_conscientiousness`, `big_five_neuroticism`;
  `computeAndStoreLearningStyle` dan `computeAndStoreDerivedProfiles` melewati
  penulisan `learningStyle` bila guard false (nilai lama utuh, profil baru
  tanpa gaya belajar), sementara `cognitiveProfile` tetap dihitung dan profil
  tetap disimpan. `deriveLearningStyle`/RPC/skema tak berubah. Test
  `tests/profile-traits.test.ts` 4 → 8; smoke Profile kini mengunci bahwa
  menyimpan tanpa topik kunci **tidak** mengarang gaya belajar. `npm run ci`
  hijau: typecheck, lint 0/0, 333/333 unit, build, CSP, 171/171 smoke. PR #44.

## Blokiran

(tidak ada)
