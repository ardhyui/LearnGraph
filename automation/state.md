# State otomasi LearnGraph — dibaca & diperbarui setiap sesi

Terakhir diperbarui: 2026-11-13 (siklus 7: asal saran "Ways to learn it"; berikutnya: guard gaya belajar di admin psikometrik)

## Tugas berikutnya

Backlog `docs/ROADMAP.md` baris 49 (sisa P0 #4): halaman admin psikometrik
masih mengarang `learningStyle` dari skor yang belum diisi — guard siklus 6
belum dipakai di jalur itu.

Masalah: `src/routes/admin/psychometrics.tsx` memanggil `deriveLearningStyle`
langsung di `handleSaveScores` (±baris 183–192) dan `handleComputeProfiles`
(±baris 216–224), lalu menulis `learningStyle` + `cognitiveProfile` lewat
`updateLearner`. `deriveLearningStyle` membaca topik kosong sebagai 50, jadi
admin yang baru mengisi beberapa topik tetap mendapat gaya belajar turunan —
padahal My Profile sejak siklus 6 hanya menurunkan gaya belajar bila kelima
topik kunci terisi. Jalur ini juga bisa menimpa gaya belajar manual yang
tersimpan.

Perilaku yang diinginkan: satu helper murni yang dipakai semua jalur, sehingga
aturan "gaya belajar hanya dari topik kunci lengkap" berlaku juga di admin.
`cognitiveProfile` tetap selalu dihitung seperti sekarang.

Rencana implementasi:

1. Di `src/lib/graph/psychometrics.ts`, tambah helper murni
   `derivedProfilesFromScores(scores)` yang mengembalikan
   `{ learningStyle?: LearningStyle; cognitiveProfile: CognitiveProfile }`:
   `learningStyle` hanya ada bila `hasLearningStyleInputs(scores)` true
   (pakai `deriveLearningStyle`), `cognitiveProfile` selalu dari
   `estimateCognitiveProfile`. Jangan ubah tanda tangan atau perilaku
   `deriveLearningStyle`, `estimateCognitiveProfile`, atau
   `hasLearningStyleInputs`.
2. Pakai helper itu di `computeAndStoreLearningStyle` dan
   `computeAndStoreDerivedProfiles` (`src/lib/graph/education-graph-db.ts`)
   tanpa mengubah perilaku yang sudah dikunci test siklus 6.
3. Di `src/routes/admin/psychometrics.tsx`, ganti kedua pemanggilan langsung
   dengan helper. Bila `learningStyle` tidak ada, **jangan kirim** field itu ke
   `updateLearner` (gaya belajar lama tetap utuh); `cognitiveProfile` tetap
   dikirim dan pesan sukses tetap jelas. Jangan menambah skema/server
   function/RPC/migrasi.
4. Test: `tests/profile-traits.test.ts` atau file baru
   `tests/admin-derived-profiles.test.ts` — skor kosong/parsial/rusak: tidak
   ada `learningStyle`, `cognitiveProfile` tetap ada; kelima topik kunci lengkap:
   gaya belajar muncul; penjaga statis bahwa halaman admin memakai helper dan
   tidak memanggil `deriveLearningStyle` langsung. Cek smoke admin psikometrik
   yang ada tetap hijau (tidak perlu cek baru bila alurnya panjang).

Perilaku yang dikunci:

- Tanpa topik kunci lengkap tidak ada gaya belajar baru dari jalur mana pun;
  nilai `learningStyle` lama tidak dihapus oleh simpan admin.
- `cognitiveProfile` tetap dihitung dan disimpan seperti sebelumnya.
- Tanpa perubahan skema/server function/RPC/migrasi; UI admin tetap bahasa
  Inggris (D2).

Gerbang: `npm run ci` utuh (±25 menit) harus hijau sebelum PR. Commit
berbahasa Indonesia, pola `fix:`. Setelah merge, tulis "Tugas berikutnya" untuk
sesi setelahnya — kandidat: higien baris 51 mode "Automatic"/"Set, then adjust"
(opsinya sudah disembunyikan 2026-11-08, jadi mungkin tinggal dicoret setelah
verifikasi) lalu P0 #3 baris 37 kunjungan pertama (WAJIB baca catatan 12 Nov:
cek harus menunggu keadaan, bukan waktu).

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
- 2026-11-13: PR #45 — feat: "Ways to learn it" di Recommendations menunjukkan
  asal tiap saran (sisa backlog P0 #4). `ScaffoldingStrategy` mendapat
  `source?: 'profile' | 'general'` (aditif, tanpa skema/RPC/migrasi);
  `selectScaffoldingStrategies` menandai `worked_example` = `general` dan semua
  strategi kondisi (gaya belajar, Big Five, `cognitiveProfile`) = `profile`
  tanpa mengubah `priority`, `reason`, jumlah, atau urutan. Chip kini memuat
  teks kecil **Always suggested** / **From your profile** (bukan hanya
  `title`); chip tanpa `source` tampil seperti dulu. Test baru
  `tests/scaffolding-source.test.ts` (6) + 2 cek smoke (Sari tanpa saran
  profil hanya "Always suggested"; Alice dengan gaya visual tersimpan melihat
  "From your profile"). `npm run ci` hijau: typecheck, lint 0/0, 339/339 unit,
  build, CSP, 164 cek smoke.

## Blokiran

(tidak ada)
