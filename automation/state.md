# State otomasi LearnGraph — dibaca & diperbarui setiap sesi

Terakhir diperbarui: 2026-11-13 (siklus 8: guard gaya belajar di admin psikometrik; berikutnya: kerangka halaman saat workspace disiapkan)

## Tugas berikutnya

Backlog `docs/ROADMAP.md` baris 37 (P0 #3): kunjungan pertama (dan halaman yang
memuat datanya sendiri) masih menampilkan layar muat penuh tanpa sidebar.
Pertimbangkan kerangka halaman (sidebar + placeholder) agar tata letak tidak
melompat.

Masalah: 16 halaman mengembalikan `WorkspaceLoading`
(`src/components/WorkspaceLoading.tsx`) selagi `dbLoading`; komponen itu berupa
`min-h-screen` flex-center tanpa `Sidebar`, jadi pengunjung pertama melihat
layar kosong berisi spinner, lalu seluruh tata letak bergeser saat sidebar
muncul. Catatan percobaan 12 Nov: begitu sidebar ada di HTML SSR, klik uji bisa
jatuh sebelum handler terpasang dan posisi klik melesat saat layout bergeser —
**cek smoke harus menunggu keadaan (`locator.waitFor`/`untilHydrated`), bukan
waktu (`waitForTimeout`)**.

Perilaku yang diinginkan: kerangka aplikasi sudah terlihat sejak paint pertama
(sidebar desktop, bar atas + laci di ponsel), dengan pesan status yang sama
(`Getting your learning space ready…`, `role="status"`) di area konten; setelah
siap, halaman asli menggantikan kerangka tanpa lompatan besar. Kunjungan
berikutnya tetap tidak menunggu penyiapan (perilaku 2026-11-09 jangan
dikembalikan).

Rencana implementasi:

1. Ubah `src/components/WorkspaceLoading.tsx` menjadi kerangka:
   `Sidebar` + `<main className="flex-1 min-w-0 …">` berisi kartu/placeholder
   dengan spinner dan teks status yang sudah ada. Tidak perlu mengubah 16
   pemanggil bila tanda tangannya tetap tanpa argumen; jangan render sidebar
   kedua (halaman yang `dbLoading` berhenti sebelum merender sidebar-nya).
2. Jaga aksesibilitas: `role="status"` + `aria-live="polite"` tetap, spinner
   `aria-hidden`, tidak menambah `<h1>` palsu (hindari dua `<h1>` saat selesai),
   tidak ada fokus yang dipindah paksa.
3. Test: unit statis kecil bila perlu (mis. komponen memuat `Sidebar` dan teks
   status); smoke baru untuk kunjungan pertama — tahan panggilan server
   `seedDemoData` (pola `page.route` yang sudah ada di smoke), buka halaman
   pelajar, lalu **tunggu** sidebar/nav dan teks status muncul (`waitFor`),
   lepaskan panggilan, dan tunggu konten halaman menggantikannya; pastikan
   tanpa error halaman. Bila memakai akun baru, siapkan lewat alur sign-up yang
   ada; jangan memakai `waitForTimeout` untuk menebak kapan handler siap.
4. Tanpa perubahan skema/server function/RPC/migrasi. UI tetap bahasa Inggris
   (D2).

Perilaku yang dikunci:

- Pengunjung pertama dan halaman yang memuat datanya sendiri tidak pernah
  melihat layar penuh tanpa kerangka aplikasi.
- Pesan status yang sama tetap diumumkan (`role="status"`), dan setelah siap
  halaman normal tampil (satu sidebar, tanpa error).
- Kunjungan berikutnya tetap melewati penantian penyiapan; cek lama
  "returning visit" di smoke tetap hijau.
- Tanpa perubahan data/skema.

Bila kerangka penuh ternyata terlalu besar, kerjakan lebih dulu sidebar +
placeholder di `WorkspaceLoading` (satu perubahan komponen), lalu simpan
"halaman yang memuat datanya sendiri" sebagai tugas berikutnya.

Gerbang: `npm run ci` utuh (±25 menit) harus hijau sebelum PR. Commit
berbahasa Indonesia, pola `feat:`/`fix:`. Setelah merge, tulis "Tugas berikutnya"
untuk sesi setelahnya.

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
- 2026-11-13: PR #__PR__ — fix: simpan admin psikometrik memakai helper
  `derivedProfilesFromScores` yang sama dengan My Profile, jadi gaya belajar
  tidak lagi dikarang/ditulis dari topik parsial (nilai manual utuh) sementara
  `cognitiveProfile` tetap selalu diperbarui; `computeAndStoreLearningStyle`
  dan `computeAndStoreDerivedProfiles` ikut memakai helper itu. Test baru
  `tests/admin-derived-profiles.test.ts` (9). Sekalian higien backlog: baris
  mode "Automatic"/"Set, then adjust" dicoret setelah verifikasi opsi memang
  sudah disembunyikan. `npm run ci` hijau.

## Blokiran

(tidak ada)
