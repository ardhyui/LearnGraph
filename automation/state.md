# State otomasi LearnGraph — dibaca & diperbarui setiap sesi

Terakhir diperbarui: 2026-11-13 (siklus 9: kerangka aplikasi saat workspace disiapkan; berikutnya: ekspor seluruh workspace)

## Tugas berikutnya

Backlog `docs/ROADMAP.md` baris 65 (P0 #6): ekspor seluruh workspace untuk
guru/admin — semua learner milik akun beserta profil, subjek, progres, dan
konsep/prasyarat buatan sendiri — sebagai satu file JSON dari halaman Manage
data.

Masalah: My Profile hanya bisa mengunduh data **satu learner aktif**
(`learner-export` v1, `src/lib/export.ts`). Guru/admin yang ingin mencadangkan
atau memindahkan seluruh workspace harus membuka tiap learner satu per satu,
dan konsep/prasyarat yang mereka buat tidak ikut terekspor sama sekali.

Perilaku yang diinginkan: dari halaman Admin → Learners (kelompok Manage data)
ada satu tombol **Download workspace (JSON)** yang membuat satu file di
perangkat (tanpa unggah, tanpa server function baru) berisi:

- `format: "learngraph.workspace-export"`, `version: 1`, tanggal ekspor;
- semua learner akun itu (profil lengkap, tag/subjek, skor psikometrik, dan
  knowledge state masing-masing, termasuk state konsep yang sudah dihapus);
- semua konsep dan edge prasyarat workspace (termasuk buatan sendiri).

Nama file ASCII bertanggal (`learngraph-workspace-YYYY-MM-DD.json`), isi
mengikuti aturan aman ekspor yang ada (tidak pernah memuat rahasia/API key;
state learner lain tidak ikut). Bila akun tanpa learner/konsep, file tetap
sah dan tombol menjelaskan bahwa workspace kosong atau tetap mengunduh file
kosong yang valid.

Rencana implementasi:

1. Tambah builder murni (di `src/lib/export.ts` atau modul baru
   `src/lib/workspace-export.ts`): terima data yang sudah dimuat lewat RPC baca
   yang ada (`listLearnerProfiles`, `listConcepts`, `listEdges`,
   `getLearnerKnowledgeStates` per learner — semuanya terikat akun), kembalikan
   objek + nama file. Muat data sekali per learner; jangan menambah
   RPC/server function/migrasi.
2. UI: tombol di header Admin → Learners dengan status `role="status"` dan
   galat `role="alert"`, keadaan sibuk, target sentuh ≥40 px, teks bahasa
   Inggris (D2); unduhan lewat Blob seperti ekspor CSV/JSON yang ada. Jangan
   memakai `window.confirm` (tidak ada operasi merusak).
3. Test: unit builder (bentuk file, semua learner/state/konsep/edge ikut, hanya
   data yang diberikan, tanpa rahasia, nama file aman, workspace kosong) +
   penjaga statis halaman memakai builder dan tidak memanggil server function
   baru. Smoke: buka Admin → Learners, klik unduhan setelah terhidrasi, baca
   file JSON-nya, dan pastikan learner/konsep/prasyarat smoke ada serta tanpa
   error halaman. Jangan mengklik sebelum hidrasi.
4. Tanpa perubahan skema/RPC/migrasi. Bila terbukti terlalu besar, kerjakan
   dulu builder + test unitnya, lalu simpan UI sebagai "Tugas berikutnya".

Perilaku yang dikunci:

- Satu file JSON berisi seluruh workspace akun yang sedang masuk; tidak ada
  data akun lain dan tidak ada rahasia.
- Semua state learner (termasuk konsep terhapus) dan semua edge ikut; format
  dan versi eksplisit sehingga impor nanti bisa memvalidasinya.
- Unduhan dibuat di perangkat; tidak ada unggahan/perubahan data.
- Status/galat terbaca pembaca layar dan tombol bisa dipakai di ponsel.

Gerbang: `npm run ci` utuh (±25 menit) harus hijau sebelum PR. Commit
berbahasa Indonesia, pola `feat:`. Setelah merge, tulis "Tugas berikutnya"
untuk sesi setelahnya.

## Riwayat

- 2026-11-13: PR #47 — Kerangka aplikasi (sidebar + bar atas/laci + placeholder)
  tampil sejak paint pertama selagi workspace disiapkan, menggantikan layar
  penuh tanpa sidebar di 16 halaman (`WorkspaceLoading`). Pesan status lama
  tetap `role="status"`, tanpa `<h1>` palsu dan tanpa sidebar ganda; kunjungan
  berikutnya tetap tidak menunggu. Test unit statis 3 + smoke baru yang
  menahan `seedDemoData` dan menunggu keadaan (sidebar + status, lalu halaman
  menggantikan; satu sidebar/`<h1>`, tanpa error). Tanpa migrasi. Sekalian
  higien backlog: baris "mulai tanpa data demo" dan "tabel admin jadi kartu di
  ponsel" dicoret (sudah selesai 2026-11-08, tertinggal).
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
- 2026-11-13: PR #46 — fix: simpan admin psikometrik memakai helper
  `derivedProfilesFromScores` yang sama dengan My Profile, jadi gaya belajar
  tidak lagi dikarang/ditulis dari topik parsial (nilai manual utuh) sementara
  `cognitiveProfile` tetap selalu diperbarui; `computeAndStoreLearningStyle`
  dan `computeAndStoreDerivedProfiles` ikut memakai helper itu. Test baru
  `tests/admin-derived-profiles.test.ts` (9). Sekalian higien backlog: baris
  mode "Automatic"/"Set, then adjust" dicoret setelah verifikasi opsi memang
  sudah disembunyikan. `npm run ci` hijau.

## Blokiran

(tidak ada)
