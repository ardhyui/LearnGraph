# State otomasi LearnGraph — dibaca & diperbarui setiap sesi

Terakhir diperbarui: 2026-11-13 (siklus 10: ekspor seluruh workspace selesai; berikutnya: segarkan tanggal data contoh)

## Tugas berikutnya

Backlog `docs/ROADMAP.md` baris 16 (P0 #2, data demo): tombol **segarkan
tanggal data contoh** — workspace yang di-seed sebelum putaran #17 masih
memakai tanggal 2024, jadi semua konsep contoh langsung jatuh tempo review;
 roadmap menyarankan tombol yang menghitung ulang tanggal contoh **atas
permintaan pengguna**.

Masalah: `seedDemoDataIfEmpty` (`src/lib/graph/seed.ts`) sejak putaran #17
memakai `shiftDemoDate` (`src/lib/demo-data.ts`) — tanggal contoh digeser
relatif terhadap `DEMO_DATA_AS_OF` → waktu seed — tapi hanya saat workspace
masih kosong. Workspace yang sudah di-seed sebelumnya sengaja tidak disentuh
agar data yang ada tidak ditulis ulang diam-diam; pemiliknya tidak punya
jalur lain selain menghapus dan menambah ulang pelajar contoh.

Perilaku yang diinginkan: dari halaman admin yang mengelola data (kelompok
tombol Admin → Learners, dekat tombol unduhan/impor workspace) ada satu
tombol **Refresh example data** yang menggeser tanggal `firstSeen`,
`lastReviewed`, dan `nextReview` milik state pelajar contoh akun sendiri
menjadi relatif terhadap sekarang (aturan yang sama dengan seed: `shiftDemoDate`,
tak pernah menghasilkan tanggal masa depan), **tanpa** mengubah mastery,
reviewCount, masterySource, misconceptions, atau interactions. Hanya state
pelajar contoh yang disentuh — pelajar yang dibuat sendiri tidak pernah.
Id pelajar contoh di DB adalah `demo-alice`, `demo-bob`, `demo-carol`
(lihat `demoLearners`/`demoKnowledgeStates` di `src/lib/demo-data.ts` dan
komentar di `seed.ts`; jangan hardcode ulang daftarnya bila bisa mengambil
dari konstanta yang ada).

Rencana implementasi:

1. Helper murni (mis. `demoRefreshPlan` di `src/lib/demo-data.ts` atau modul
   baru): terima `states` + `now`, kembalikan daftar patch
   `{ userId, conceptId, firstSeen?, lastReviewed, nextReview? }` hanya untuk
   `userId` pelajar contoh; tanggal mentah 2024 digeser dengan `shiftDemoDate`,
   tanggal yang sudah segar (≤ beberapa hari dari `now`) boleh dilewati agar
   tombol idempoten dan tidak menulis tanpa perlu. Tanpa I/O; unit test
   langsung.
2. Penerapan patch lewat RPC tulis yang ada (`setKnowledgeState`) sekali per
   state — tanpa server function/skema/migrasi baru. Pelajari dulu
   `repairDemoKnowledgeStates` di `seed.ts` sebagai pola iterasi state contoh.
3. UI: tombol berbahasa Inggris (D2) dengan status `role="status"` dan galat
   `role="alert"`, keadaan sibuk, target sentuh ≥40 px, konfirmasi ringkas di
   dalam halaman (bukan `window.confirm`) karena ini menulis ulang tanggal;
   setelah selesai jelaskan berapa state yang digeser. Tombol hanya tampil
   bila ada state contoh bertanggal tua (mis. >90 hari) — hindari tombol mati.
4. Test: unit helper (patch hanya untuk pelajar contoh, tanggal digeser benar,
   tidak menyentuh field lain, idempoten, tanggal rusak ditangani) + penjaga
   statis halaman (memakai helper + `setKnowledgeState`, tanpa server function
   baru, tanpa `window.confirm`). Smoke: seed manual state contoh bertanggal
   2024 lewat RPC yang ada (atau akun yang di-seed lalu tanggalnya
   dimanipulasi lewat `setKnowledgeState`), klik tombol setelah terhidrasi,
   pastikan tanggal state berubah dan tanpa error halaman.
5. Tanpa perubahan skema/RPC/migrasi. Bila terbukti terlalu besar, kerjakan
   dulu helper + test unitnya, lalu simpan UI sebagai "Tugas berikutnya".

Perilaku yang dikunci:

- Hanya state pelajar contoh (`demo-alice`/`demo-bob`/`demo-carol`) milik akun
  yang masuk yang boleh diubah; pelajar lain tidak tersentuh sama sekali.
- Hanya tanggal (firstSeen/lastReviewed/nextReview) yang berubah; mastery dan
  riwayat lain tetap.
- Aturan penggeseran sama persis dengan seed baru (`shiftDemoDate`, tidak ada
  tanggal masa depan); tombol idempoten (dipakai dua kali → hasil sama).
- Tidak ada penulisan diam-diam: tombol eksplisit + konfirmasi ringkas +
  laporan hasil.

Gerbang: `npm run ci` utuh (±25 menit) harus hijau sebelum PR. Commit
berbahasa Indonesia, pola `feat:`. Setelah merge, tulis "Tugas berikutnya"
untuk sesi setelahnya.

## Riwayat

- 2026-11-13: PR #49 — feat: ekspor seluruh workspace (backlog P0 #6). Tombol
  **Download workspace (JSON)** di Admin → Learners membuat satu file
  `learngraph.workspace-export` v1 di perangkat: semua learner akun itu
  (profil, subjek, seluruh knowledge state termasuk konsep terhapus) plus
  semua konsep dan edge prasyarat workspace. Builder murni
  `buildWorkspaceExport`/`workspaceExportFileName`
  (`src/lib/workspace-export.ts`) defensif (state yatim tidak ikut, tiap
  learner hanya menerima state miliknya) dan hanya memuat data yang
  diberikannya RPC baca terikat akun — tanpa server function/skema/migrasi
  baru. Status `role="status"`, galat `role="alert"`, `aria-busy`, target
  sentuh 40 px, bahasa Inggris; workspace kosong tetap mengunduh file sah
  dengan pesan "this workspace is empty". Test unit 8
  (`tests/workspace-export.test.ts`, termasuk penjaga statis halaman) + cek
  smoke akun utama dan akun kosong. `npm run ci` hijau (install, typecheck,
  lint 0/0, unit, build, CSP, smoke).
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
