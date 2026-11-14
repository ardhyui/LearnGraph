# State otomasi LearnGraph — dibaca & diperbarui setiap sesi

Terakhir diperbarui: 2026-11-14 (siklus 14: riwayat interaksi dari laporan diri dengan sanitasi data lama; berikutnya: batas percobaan masuk per akun di samping per IP)

## Tugas berikutnya

Backlog `docs/ROADMAP.md` P1 #7 "Pantau batas rate limit untuk sekolah di
balik satu IP (NAT); pertimbangkan batas per akun selain per IP": endpoint
masuk baru dibatasi per IP, jadi satu sekolah di balik satu NAT berbagi jatah
10 percobaan/menit, sementara penyerang yang mencoba banyak akun dari satu IP
tetap lolos bila tiap akun hanya dicoba beberapa kali.

Lokasi: `src/lib/auth/rate-limit.ts`, modul baru
`src/lib/auth/account-rate-limit.ts`, handler `src/routes/api/auth/$.ts`
(pakai `request.clone()` agar body asli tetap diteruskan ke `auth.handler`),
test `tests/auth-rate-limit.test.ts` atau file baru.

Perilaku yang diinginkan:

- Tambah batas **per akun** khusus percobaan masuk (POST `/sign-in/email`),
  berjalan bersamaan dengan batas per IP yang sudah ada. Batas per akun:
  20 percobaan / 15 menit per email (dinormalisasi trim + huruf kecil, panjang
  wajar; email kosong/rusak tidak dihitung). Bila terlampaui, balas 429 dengan
  `rateLimitMessage` yang sudah ada dan `X-Retry-After` > 0 tanpa memanggil
  Better Auth (jangan sampai membuat sesi).
- Penghitung disimpan di tabel `rateLimit` yang sudah ada (tanpa tabel/kolom/
  migrasi baru), memakai kunci dari hash SHA-256 email (jangan simpan email
  mentah) dan satu operasi atomik agar tetap benar di beberapa instance.
- Jangan mengunci akun yang berhasil masuk: respons sukses menghapus baris
  penghitung akun itu; kegagalan biasa (401) menambah hitungan. Path lain
  (sign-up, reset password, get-session) tidak berubah, dan batas per IP tetap
  berlaku persis seperti sekarang.
- Kegagalan membaca/menulis tabel penghitung tidak boleh menggagalkan login
  (degradasi ke batas IP saja), dan jangan pernah mencatat email mentah ke log.
- Test: helper normalisasi/kunci (trim, kapital, email kosong/terlalu panjang),
  batas akun memblokir percobaan ke-21 dari IP berbeda, keberhasilan mereset
  hitungan, email berbeda tidak saling memblokir, path lain tak tersentuh, dan
  test IP lama tetap hijau.

Gerbang: `npm run ci` utuh (±25 menit) harus hijau sebelum PR. Commit
berbahasa Indonesia, pola `fix:`/`feat:`. Setelah merge, tulis "Tugas
berikutnya" untuk sesi setelahnya.

## Riwayat

- 2026-11-14: PR #53 — feat: laporan diri yang mengubah penguasaan (`got-it`/
  `started` → `lesson`, `remembered`/`forgot` → `review`) kini menambah satu
  entri `interactions` di patch `setKnowledgeState` yang sama (`duration: 0`,
  `timestamp` server); `snooze`/`unsnooze` tidak. Helper murni
  `sanitizeInteractions` (`src/lib/graph/interactions.ts`) hanya menerima
  timestamp ISO, tipe sah, durasi finite ≥ 0, skor 0–100, Bloom 1–6, catatan
  ≤ 500 karakter, membuang entri rusak, mempertahankan urutan, dan menyimpan
  1000 entri terakhir. Guard D5/event log/`masterySource`/respons `{ mastery }`
  dan UI tidak berubah; tanpa RPC/skema/migrasi. Test baru
  `tests/interactions.test.ts` (10). `npm run ci` hijau (392/392 unit, 177 cek
  smoke). Baris backlog P0 #1 "riwayat interaksi" dicoret.
- 2026-11-14: PR #52 — chore: `DBProvider`/`ThemeProvider` dipisah ke modul
  komponen sendiri (`src/lib/DBProvider.tsx`,
  `src/lib/ThemeProvider.tsx`), context murni ke `src/lib/db-context.ts`/
  `src/lib/theme-context.ts`. `DBContext.tsx` tetap jalur impor hook (25
  pemanggil tak berubah) + `createRemoteGraphDB`; `theme.tsx` tetap
  `useTheme` + `NO_FLASH_SCRIPT` (konstanta lokal menyalin teks dari
  `theme-script.ts` agar hash CSP tetap satu sumber). `__root.tsx` memakai
  modul provider baru dengan urutan mount dan key per akun yang sama.
  Pengecualian `files: [...]` di `eslint.config.mjs` dihapus; lint tetap
  0 warning. Test baru `tests/provider-split.test.ts` (5 penjaga statis).
  Tanpa perubahan perilaku/skema/RPC/migrasi. `npm run ci` hijau (382/382
  unit, 180 cek smoke). Baris backlog P1 #6 dicoret.
- 2026-11-14: PR #51 — feat: pilihan **Explore the example learners first** kini
  disimpan per akun di meta graph (`ui:onboarding-skipped`) lewat
  `getOnboardingSkipped`/`setOnboardingSkipped`
  (`src/server/onboarding.functions.ts`, `authMiddleware` +
  `graphForOwner`), jadi onboarding tidak muncul lagi di perangkat lain.
  `localStorage` tetap jalur cepat; salinan lokal yang belum ada di server
  dimigrasikan sekali; server `true` menang saat lokal kosong; pembaca murni
  `readOnboardingSkipped` hanya menerima `{ skipped: true }`; tanpa sesi tak
  ada panggilan/tulisan; `learners.length === 0` tetap tidak bisa dilewati.
  Tanpa tabel/kolom/RPC/migrasi. Test onboarding 13 → 18 (helper, isolasi akun
  di satu database PGlite, penjaga statis) + smoke tanpa salinan lokal dan
  akun lain di browser yang sama. `npm run ci` hijau (377/377 unit, 180 cek
  smoke). Baris backlog P0 #2 "lewati" dicoret.
- 2026-11-14: PR #50 — feat: tombol **Refresh example data** di Admin →
  Learners untuk workspace yang di-seed sebelum putaran #17 (backlog P0 #2).
  Tombol hanya muncul bila ada state contoh bertanggal pra-#17
  (`lastReviewed` ≤ `DEMO_DATA_AS_OF`), meminta konfirmasi di halaman, lalu
  menggeser `firstSeen`/`lastReviewed`/`nextReview` pelajar `demo-*` relatif
  ke sekarang dengan `shiftDemoDate`; mastery, `reviewCount`,
  `masterySource`, miskonsepsi, dan interaksi tidak berubah, dan pelajar
  buatan pengguna tidak pernah disentuh. Idempoten: setelah sekali jalan
  tanggal melewati cutoff sehingga tombol hilang dan jalan kedua menulis 0.
  Rencana awal `setKnowledgeState` ternyata benar ditolak guard D5 karena
  semua konsep contoh bersoal; jalan amannya satu server function tanpa
  argumen (`refreshExampleData`) + helper murni `demoRefreshPlan`
  (`src/lib/demo-refresh.ts`) dan `refreshDemoStateDates`
  (`src/lib/graph/seed.ts`), tanpa method RPC/skema/migrasi baru. UI Inggris
  (D2), `role="status"`/`role="alert"`, `aria-busy`, target 40 px, fokus ke
  pesan hasil. Test baru `tests/demo-refresh.test.ts` 12 (helper + engine
  PGlite + penjaga statis) dan cek smoke akun terpisah (state 2024 → tombol →
  konfirmasi → tanggal berubah, mastery/reviewCount tetap, tombol hilang,
  tanpa error). `npm run ci` hijau (install, typecheck, lint 0/0, 371/371
  unit, build, CSP build produksi, 178 cek smoke).
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
