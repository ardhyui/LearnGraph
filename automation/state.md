# State otomasi LearnGraph — dibaca & diperbarui setiap sesi

Terakhir diperbarui: 2026-11-25 (angka hitungan "Most reviewed:" `/progress` selesai lewat PR #154; berikutnya: baris "Most reviewed this week" di kartu Your week panel Today)

## Tugas berikutnya

Fitur kecil: **Baris "Most reviewed this week" di kartu "Your week" panel Today** —
maksimal tiga tautan pelajaran paling sering dikerjakan dalam 7 hari terakhir,
di dalam kartu recap yang sudah ada, tanpa query/RPC/migrasi/dependensi baru.

Tujuan: `getWeekRecap` (`src/server/evidence.functions.ts`, sekitar baris
123–136) sudah membaca seluruh event learner lewat tepat satu
`service.listEvents` untuk menghitung `weekRecap`, dan `StudyToday` sudah
memuat `current.concepts` (hasil `db.listConcepts()`), tetapi kartu **Your
week** (`WeekRecapCard` di `src/components/StudyToday.tsx`, sekitar baris
989–1021, `data-testid="week-recap"`, subjudul "Last 7 days") hanya
menampilkan hitungan — pelajar tidak bisa langsung membuka konsep yang minggu
ini paling sering dikerjakan, padahal tautan yang sama sudah ada di `/progress`
(PR #152/#154) dan `/gaps` (PR #153).

Rancangan:

1. **Server** — `getWeekRecap` diperluas (bukan server function baru) dengan
   `focus: { conceptId: string; count: number }[]`, dihitung helper murni baru
   `weekFocus(events, now, limit = 3)` di `src/lib/evidence/week.ts`: jendela
   7 hari bergulir **sama dengan `weekRecap`** (`[now - 7 hari, now]`, bukan
   minggu kalender) lalu mendelegasikan ke `weeklyFocus` yang sudah ada
   (`@/lib/evidence/progress`, `{ startsAt, endsAt }` dari jendela itu, `now`
   diteruskan). Handler tetap `authMiddleware` + validator Zod `learnerId`,
   tetap tepat satu `service.listEvents`.
2. **UI** — tipe `week` di `StudyToday` (sekitar baris 92,
   `WeekRecap & { streak; lastLesson }`) ditambah `focus`;
   `WeekRecapCard` menerima prop baru `concepts` (pemanggilan sekitar baris
   650 menjadi `<WeekRecapCard week={current.week} concepts={current.concepts}
   />`) dan hanya bila `week.focus.length > 0` merender satu baris berlabel
   **Most reviewed this week** sesudah blok baris rekap (`<ul>`/empty state)
   dan sebelum baris streak (`learning-streak`): tiap chip `<Link
   to="/learn/$conceptId" params={{ conceptId }}>` berkelas pola chip `/gaps`
   (`inline-flex min-h-10 … rounded`), ikon `BookOpen` `h-3 w-3`
   `aria-hidden`, nama dari `conceptNameMap(concepts)` (`@/lib/gaps`, sudah
   diimpor di file; konsep tak dikenal dilewati seperti `ContinueLastLesson`),
   `<span aria-hidden="true"> · {count}</span>` dan `<span
   className="sr-only">: {name}, reviewed {countLabel(count,
   'time')}</span>` (pola PR #154, `countLabel` diimpor bila belum ada).
   Baris rekap, heading, subjudul "Last 7 days", empty state, baris streak,
   `ContinueLastLesson`, dan kartu lain di panel tidak berubah.
3. **Test** — `tests/week-recap.test.ts` diperluas untuk `weekFocus` (jendela
   bergulir, hanya `STUDY_KINDS`, urutan count menurun lalu `conceptId`,
   `limit` default 3/non-positif, timestamp rusak/masa depan) + penjaga statis
   wiring (`focus` di balikan `getWeekRecap` dengan tetap satu `listEvents`;
   chip di `WeekRecapCard` dengan posisi/`sr-only`/`min-h-10`; tanpa
   `createServerFn`/`graphCall`/migrasi).
4. **Smoke** — tidak ada cek baru (isi bergantung event seed); penjaga baris
   smoke 2748 (`tests/skip-link.test.ts`) tetap.
5. **Dokumentasi** — satu entri log bertanggal di `docs/ROADMAP.md`; tidak
   menandai milestone.

Gerbang: `npm run ci` utuh hijau sebelum PR; commit bahasa Indonesia `feat:`.

## Kandidat fitur (untuk siklus-siklus berikutnya, pilih satu per sesi)

Semua tanpa migrasi skema, terlihat pelajar, dan bisa diverifikasi otomatis;
baca kodenya dulu lalu tulis spek konkret seperti tugas di atas.

1. **Chip "You reviewed these this week" di `/gaps` juga menampilkan angka** —
   samakan dengan `/progress` (PR #154): `<span aria-hidden="true"> ·
   {concept.count}</span>` setelah nama + `sr-only` berfrasa memakai
   `countLabel` (impor dari `@/lib/gaps` bila belum ada); perbarui penjaga
   `tests/gaps-week-focus.test.ts` tanpa melonggarkan penjaga lain.
2. Audit 2026-11-25: pemilih learner di `/progress`, `/gaps`,
   `/recommendations` ternyata sudah memakai pola yang sama (`useId` + `<label
   htmlFor>` + `<select>`); kandidat "pemilih learner yang lebih ringkas"
   digugurkan — jangan diulang. Bila kandidat 1 sudah selesai, audit
   `docs/ROADMAP.md` (P0 #5 aksesibilitas, baris "Sebagian:") atau poles
   pelajar-terlihat lain, lalu tulis spek konkret.

Jangan mengulang pekerjaan yang sudah dicoret di `docs/ROADMAP.md`, dan
jangan membuat PR test-only (lihat `TASK_PROMPT.md`).

## Riwayat

- 2026-11-25: PR #154 — **Angka hitungan di baris "Most reviewed:" `/progress`** —
  tiap chip fokus mingguan di **Week by week** kini menampilkan `<span
  aria-hidden="true"> · {concept.count}</span>` (spasi, titik tengah, spasi,
  angka) tepat sesudah `{name}`, dan `sr-only` berubah menjadi `: {name},
  reviewed {countLabel(concept.count, 'time')}` sehingga pembaca layar
  mendengar frasa bermakna; `countLabel` bergabung dengan `conceptLabel`
  dalam satu baris impor `@/lib/gaps`. Tautan/kelas/ikon/urutan chip dan blok
  lain tidak berubah. Test `tests/learner-progress.test.ts`: penjaga fokus
  diperbarui (angka tepat sesudah `{name}`, `countLabel` di `sr-only`, impor
  sekali) tanpa melonggarkan penjaga urutan helper maupun penjaga Recent
  activity. Tanpa cek smoke baru (angka bergantung event seed), penjaga baris
  smoke 2748 tetap. `npm run ci` utuh hijau.
- 2026-11-25: PR #153 — **Chip "You reviewed these this week" di `/gaps`** —
  `getLearningStats` diperluas dengan `focus` (`startsAt` + maks. tiga
  `{ conceptId, count }` dari `weeklyBuckets`/`weeklyFocus`) memakai satu
  pembacaan `listEvents` yang sama (tanpa RPC/migrasi baru); `/gaps` menyimpan
  `weekFocus` dari `stats.focus`, mengosongkannya saat learner berganti, lalu
  menampilkan blok `data-testid="week-focus"` berlabel **You reviewed these
  this week** sesudah blok retensi dan sebelum **Snoozed** — tiap chip
  `Link` `min-h-10` ke `/learn/$conceptId` dengan `BookOpen` `aria-hidden`,
  nama dari `searchConcepts` + `conceptLabel`, dan `sr-only` nama; tanpa chip
  saat kosong. Test baru `tests/gaps-week-focus.test.ts` (10 penjaga statis);
  tanpa cek smoke baru (data seed tak menjamin event minggu berjalan), penjaga
  baris smoke 2748 tetap. `npm run ci` utuh hijau.
- 2026-11-25: PR #152 — **Fokus mingguan di `/progress`** — tiap `<li>` minggu
  di **Week by week** kini menampilkan **Most reviewed:** (maks. tiga tautan
  konsep ke `/learn/$conceptId`, `BookOpen` `aria-hidden`, `sr-only` nama),
  dihitung helper murni baru `weeklyFocus(events, week, limit = 3, now?)`
  (event `STUDY_KINDS` dalam `[startsAt, endsAt)`, tanpa timestamp rusak/masa
  depan, urut count menurun lalu `conceptId`, `limit <= 0` → `[]`).
  `getLearnerProgress` diperluas dengan `focus` dari `listEvents` yang sama
  (tetap satu query), tanpa RPC/migrasi baru; test `learner-progress` +8 dan
  cek smoke daftar **Weekly progress** memuat tautan `/learn/` (penjaga baris
  smoke 2734 → 2748). `npm run ci` utuh hijau.

  melengkapi M4 dengan tepat tiga perintah siap pakai: `next_topic` (argumen
  opsional `learner`), `review_due` (`learner` + `count` 1–10 default 5), dan
  `explain_concept` (`concept` wajib 1–200 + `learner` opsional). `initialize`
  kini mengiklankan `capabilities.prompts` dan menyebut `prompts/list`
  (server `0.3.0`); `prompts/get` divalidasi helper murni baru
  `parsePromptGetParams` (params objek, tiga nama, argumen asing/hilang/tipe
  salah → `-32602` tanpa handler; `count` default 5; `concept` non-kosong),
  lalu handler `get_prompt` memakai ulang brief `contextPayload` yang sama
  dengan `get_tutor_context` (tetap terikat akun API key) dan menyusun satu
  pesan user berisi instruksi + brief lewat `buildPromptMessages`
  (`src/lib/mcp/prompts.ts` baru). Kegagalan handler yang bisa diperbaiki
  (learner/konsep tak ada) juga `-32602` dengan pesan jelas. `tools/*`,
  `resources/*`, notifikasi, batch, dan auth tidak berubah; tanpa
  migrasi/dependensi/RPC/SSE baru. Test baru `tests/mcp-prompts.test.ts` (13);
  `mcp-protocol`/`mcp-resources`/`mcp-api` hanya menyesuaikan method tak dikenal
  (`logging/setLevel`) + capability `prompts`; smoke memeriksa `prompts/list`
  dengan key read-only (3 nama), penjaga baris smoke 2727 → 2734. README
  bagian MCP menyebut prompts; `Roadmap.md` dan milestone tidak diubah.
  `npm run ci` utuh hijau (install, typecheck, lint 0/0, test, build, bundle
  budget, CSP, smoke Playwright + PGlite).

- 2026-11-25: PR #150 — **Pencarian "Find a concept" di Recommendations** —
  komponen bersama `ConceptSearch` dipasang di `/recommendations` di bawah
  kartu pemilih learner dan sebelum tablist **Recommendation views**, hanya
  saat learner aktif, dibungkus `div className="mb-6"` dengan `key` per learner.
  Halaman menyimpan `db.listConcepts().catch(() => [])` di state
  `searchConcepts` (tipe `GraphConceptNode`), dijalankan bersamaan dengan
  `computeZPD`; daftar dikosongkan saat learner berganti dan hanya diisi bila
  `seq === requestSeq.current`, sementara kegagalan `listConcepts` tidak
  menggagalkan rekomendasi. Test statis baru
  `tests/recommendations-concept-search.test.ts`; cek smoke
  `/recommendations` mengisi **Search your concepts** dengan `fraction` dan
  memastikan **Concept search results** berisi ≥1 item bertaut `/learn/`
  (penjaga baris smoke 2706 → 2727). `npm run ci` utuh hijau sebelum PR
  (percobaan pertama gagal hanya karena dev server drop saat smoke, diulang
  dengan `CI_PORT=8391 CI_PREVIEW_PORT=8393` dan lulus penuh).
- 2026-11-25: PR #149 — **Pencarian "Find a concept" di Gap Analysis** —
  komponen `ConceptSearch` diekstrak dari `src/components/StudyToday.tsx` ke
  `src/components/ConceptSearch.tsx` tanpa mengubah perilaku/markup/kelas
  (section bernama, heading **Find a concept** + `Search` `aria-hidden`, input
  `type="search"` berlabel, ringkasan `role="status" aria-live="polite"`,
  daftar **Concept search results** berisi `Link` `min-h-10` ke
  `/learn/$conceptId`, empty state **No concepts match “…”**). `/gaps` menyimpan
  `concepts` hasil `db.listConcepts().catch(() => [])` yang sudah dimuat
  `fetchGapData` ke state `searchConcepts` (tanpa query/RPC tambahan),
  meresetnya saat learner berganti (reload `quiet` mempertahankan query), dan
  merender `<ConceptSearch key={`search-${selectedLearnerId}`}
  concepts={searchConcepts} />` di bawah pemilih learner sebelum analisis;
  bila `listConcepts` gagal kartu tetap tampil dengan hasil kosong. Test
  `tests/concept-search.test.ts` menunjuk penjaga markup ke komponen bersama
  sementara penjaga Today tetap; test baru
  `tests/gaps-concept-search.test.ts` (7 penjaga statis). Smoke `/gaps`:
  isi **Search your concepts** dengan `fraction` → daftar bernama berisi ≥1
  item dan tautan `/learn/` (penjaga baris smoke 2689 → 2706). `npm run ci`
  utuh hijau sebelum PR.
- 2026-11-25: PR #148 — **Riwayat 20 aktivitas terakhir di `/progress`** —
  kartu **Recent activity** di bawah **Week by week** (`<section
  aria-labelledby="progress-recent-title">`, `<ul aria-label="Recent
  activity">`): 20 event belajar terakhir (quiz/study/review/practice/lesson;
  snooze/unsnooze/tutor dilewati) terbaru dulu — seri pecah oleh baris lebih
  baru (`id` serial), timestamp rusak/masa depan diabaikan — tiap baris nama
  konsep (`conceptLabel` + `db.listConcepts()` sekali, cadangan id terbaca),
  label hasil sehari-hari, `<time dateTime>` ramah UTC ("Nov 24, 10:15"), dan
  satu tautan **Open the lesson** ke `/learn/$conceptId` (`BookOpen`
  `aria-hidden`, `sr-only` nama, `min-h-10`). Helper murni
  `recentActivity(events, now, limit = 20)` + `activityLabel(kind, outcome)` +
  `activityTimeLabel(createdAt)` di `src/lib/evidence/progress.ts`;
  `getLearnerProgress` diperluas dengan `recent: recentActivity(events, now)`
  dari pembacaan `listEvents` yang sama (tetap tepat satu query, tanpa
  RPC/migrasi baru). Test `tests/learner-progress.test.ts` diperluas (+10);
  smoke blok progress memastikan daftar berisi ≥1 item + tautan `/learn/`
  setelah alur kuis dashboard.

- 2026-11-25: PR #147 — **Halaman `/progress` pelajar** — riwayat delapan
  minggu kalender UTC (mulai Senin) dari `learning_events`: kartu **This week**
  (active days, reviews answered correctly, quizzes passed, concepts finished),
  daftar **Weekly progress** bernama dengan label tanggal ramah dan retensi
  per minggu (`—` tanpa review), serta **Current streak**/**Best streak**.
  Helper murni `src/lib/evidence/progress.ts` (`weeklyBuckets`,
  `retentionByWeek`, `bestStreak`, label/format) memakai ulang
  `dueReviewRetention`, `finishesConcept`, dan `studyDayKeys`/`STUDY_KINDS`
  bersama; server function `getLearnerProgress` (auth + Zod `learnerId`, satu
  `service.listEvents`) dan route `/progress` dengan pemilih learner bersama;
  menu Learn + judul tab otomatis. Test baru `tests/learner-progress.test.ts`,
  smoke membuka **Progress** dari dashboard, mengecek delapan minggu dan
  memuat ulang saat learner diganti. Tanpa migrasi/dependensi/RPC baru.

- 2026-11-24: **Lanjutan setelah mesin restart (PR #146)** — sesi 21 Nov terputus dengan PR #144 (chip prasyarat/unlocks `/graph`) dan #145 (tautan rencana perbaikan `/gaps`) masih terbuka; keduanya digabung, diselesaikan konflik dokumennya, diverifikasi bersama, dan masuk lewat PR #146. PR #113 (fokus hasil kuis `/learn`) ditutup karena sudah dicakup PR #114. Ditambahkan **watchdog** di `self-improve.sh`: sesi yang macet (25 menit tanpa output) dihentikan beserta process group-nya (rc=124) dan tidak salah diklasifikasi sebagai kuota habis. Tugas berikutnya: halaman `/progress`.
- 2026-11-21: PR #144 — **Chip Prerequisites dan Unlocks di panel detail
  `/graph` membuka pelajarannya** — panel detail konsep sudah punya tautan
  **Open the lesson** untuk konsep terpilih (PR #143), tetapi chip prasyarat
  dan lanjutan di bawahnya hanya teks, sehingga pelajar harus mencari manual
  konsep yang justru berhubungan langsung. Kini `ConceptDetails.prerequisites`
  dan `.dependents` menjadi `Array<{ conceptId: string; name: string }>` yang
  dibangun di `onNodeClick` dari ujung edge (`{ conceptId: e.source, name:
  sourceNode?.data?.label as string || e.source }` untuk prasyarat,
  `{ conceptId: e.target, name: targetNode?.data?.label as string || e.target }`
  untuk dependent) tanpa mengubah filter edge, urutan, atau cadangan nama. Tiap
  chip di `<ul aria-label="Prerequisites">` dan `<ul aria-label="Unlocks">`
  menjadi satu `<Link to="/learn/$conceptId" params={{ conceptId:
  prereq.conceptId }}>` / `params={{ conceptId: dep.conceptId }}` dengan kelas
  chip lama (`bg-blue-500/10 …` / `bg-emerald-500/10 …`) ditambah `inline-flex
  items-center gap-1 hover:underline focus-visible:outline-none
  focus-visible:ring-2 focus-visible:ring-violet-500`, berisi `BookOpen`
  `h-3 w-3` yang `aria-hidden="true"`, nama terlihat, dan `<span
  className="sr-only"> — open the lesson</span>`. Heading + hitungan
  (**Prerequisites ({…length})**/**Unlocks ({…length})**), kelas `<ul>`, warna
  dan urutan chip, `<li key={i}>`, tautan **Open the lesson** utama, baris
  Domain, deskripsi, Difficulty, Learner Progress, blok **Concept ID**, serta
  isi panel lain tidak berubah; tanpa tombol, live region, fokus paksa, atau
  `role` tambahan; UI bahasa Inggris (D2). Test
  `tests/graph-detail-lesson-link.test.ts` diperluas tanpa melonggarkan
  penjaga: hitungan "tepat satu `<Link>`/teks **Open the lesson**" dibatasi ke
  aksi utama (panel sampai awal blok Prerequisites), ditambah penjaga tiap chip
  adalah `<Link>` ke `/learn/$conceptId` dengan `params` id yang tepat, kelas
  chip lama tetap, ikon `h-3 w-3` `aria-hidden`, nama terlihat + `sr-only`,
  serta `ConceptDetails`/`onNodeClick` mengambil `conceptId` dari
  sumber/tujuan edge; `tests/graph-detail-lists.test.ts` menyesuaikan tipe data
  chip tanpa menghapus penjaganya. Tidak ada cek smoke baru (isi chip
  bergantung data seed); penjaga baris smoke 2568 tetap. `README.md`/
  `Roadmap.md` tidak diubah; `docs/ROADMAP.md` mendapat entri log. `npm run ci`
  utuh **hijau penuh** sebelum merge.

- 2026-11-21: PR #143 — **Panel detail konsep `/graph` membuka pelajarannya** —
  panel yang muncul setelah klik node di React Flow sebelumnya menampilkan
  domain, deskripsi, **Difficulty**, **Learner Progress**, **Prerequisites**,
  **Unlocks**, dan **Concept ID** tanpa jalan masuk ke `/learn/$conceptId`,
  sehingga konsep yang sudah dipilih di graph tetap harus dicari manual
  padahal tautan yang sama sudah ada di tab **Learning Path** (PR #137), kartu
  **Recommended concepts** (PR #138), zona **Ready to Learn** (PR #139), daftar
  **Reviews due** (PR #140), dan kartu **Shaky spots** (PR #141). Kini tepat
  setelah baris **Domain:** dan sebelum blok deskripsi ada satu `<Link
  to="/learn/$conceptId" params={{ conceptId: selectedConcept.conceptId }}>`
  (kelas `inline-flex items-center gap-1 text-xs font-medium text-primary
  hover:underline focus-visible:outline-none focus-visible:ring-2
  focus-visible:ring-violet-500 rounded`) berisi `BookOpen` `h-3 w-3` yang
  `aria-hidden="true"`, teks terlihat **Open the lesson**, dan `<span
  className="sr-only">: {selectedConcept.name}</span>`. Baris Domain,
  deskripsi, tiga kartu **Difficulty**, bar progres **Learner Progress**
  beserta `mastery-source`, badge **In Zone of Proximal Development**/**Due
  for a review**, `<ul aria-label="Prerequisites">`, `<ul
  aria-label="Unlocks">`, blok **Concept ID**, judul panel dari
  `title={selectedConcept?.name}`, `open`/`onClose`, animasi, dan copy lain
  tidak berubah; tanpa tombol, live region, fokus paksa, atau `role` tambahan;
  UI bahasa Inggris (D2). `Link` diimpor sekali bersama `createFileRoute`, dan
  `BookOpen` tetap sekali di impor `lucide-react`. Test baru
  `tests/graph-detail-lesson-link.test.ts` (8 penjaga statis);
  `tests/graph-detail-lists.test.ts` tidak diubah dan tetap hijau. Satu cek
  smoke di blok *mobile: graph details open as a bottom sheet*: panel memuat
  satu tautan bernama `/^Open the lesson\s*: /` yang terlihat sebelum tombol
  **Close details** diklik; penjaga baris smoke 2565 → 2568
  (`tests/skip-link.test.ts`). `README.md`/`Roadmap.md` tidak diubah;
  `docs/ROADMAP.md` mendapat entri log. `npm run ci` utuh akhirnya **hijau
  penuh** (1529/1529 unit = 1521 + 8; typecheck, lint 0/0, build, anggaran
  bundel, CSP produksi, smoke Playwright + PGlite termasuk cek baru) dengan
  `CI_PORT=8391 CI_PREVIEW_PORT=8393` dan `TMPDIR` di `/home`. Tiga percobaan
  sebelumnya gagal karena lingkungan, bukan kode: (1) terpotong batas waktu
  harness saat smoke hampir selesai, (2) hanya cek skip-link flaky di bawah
  load ±14 (`in main false`), (3) port 8291 masih dipakai proses dev lama
  sampai dev server baru menolak start (`ERR_CONNECTION_REFUSED`); percobaan
  tanpa perubahan kode dengan port bebas lulus.

- 2026-11-17: PR #141 — **Tiap kartu "Shaky spots" `/gaps` membuka
  pelajarannya** — kartu **Shaky spots** di Gap Analysis sebelumnya hanya
  menampilkan nama konsep dan satu-dua baris keterangan untuk tiap kelompok
  (**Missing**, **Partial**, **Forgotten**, **Misconceptions**) tanpa jalan
  masuk ke `/learn/$conceptId`, sehingga konsep yang goyah tetap harus dicari
  manual padahal tab **Learning Path** (PR #137), kartu **Recommended
  concepts** (PR #138), zona **Ready to Learn** (PR #139), dan daftar
  **Reviews due** (PR #140) sudah punya tautan yang sama. Kini tiap hasil
  `map` dari keempat kelompok berakhir dengan satu `<Link
  to="/learn/$conceptId" params={{ conceptId: gap.conceptId }}>` (kelas
  `mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary
  hover:underline focus-visible:outline-none focus-visible:ring-2
  focus-visible:ring-violet-500 rounded`) berisi `BookOpen` `h-3 w-3` yang
  `aria-hidden="true"`, teks terlihat **Open the lesson**, dan `<span
  className="sr-only">: {conceptLabel(gap.conceptId, gap.conceptName)}</span>`
  agar tiap tautan punya nama aksesibel unik; tautan menjadi anak terakhir tiap
  `<div className="flex-1">` tepat setelah `<p>` keterangan terakhir blok itu
  (baris **Unlocks** untuk Missing, `mastery-source` untuk
  Partial/Forgotten, kalimat miskonsepsi untuk Misconceptions). Nama,
  keterangan, `data-testid="mastery-source"`, ikon `getGapIcon`, `key`
  (`missing-`/`partial-`/`forgotten-`/`misconception-`), `whileHover`, warna
  severity, wadah gulir, urutan empat kelompok, empty state **No shaky spots
  right now — nice work!**, `shakySummary`, judul **Shaky spots**, kartu
  angka, tab, pemilih learner, dan copy lain tidak berubah; tanpa tombol, live
  region, fokus paksa, atau `role` tambahan; UI bahasa Inggris (D2).
  `Link`/`BookOpen` tetap diimpor tepat sekali. Test baru
  `tests/gaps-shaky-spots-lesson-links.test.ts` (11 penjaga statis);
  `tests/gaps.test.ts`, `tests/gaps-review-list.test.ts`, dan
  `tests/gaps-review-lesson-links.test.ts` tetap hijau tanpa dilonggarkan.
  Satu cek smoke: kembali ke `/gaps`, pilih lagi **Carol Kim** bila perlu, klik
  tautan pertama **Open the lesson: …** di kartu **Shaky spots**, lalu pastikan
  URL `/learn/` dan heading `h1` terlihat; penjaga baris smoke 2537 → 2565
  (`tests/skip-link.test.ts`). `README.md`/`Roadmap.md` tidak diubah;
  `docs/ROADMAP.md` mendapat entri log. `npm run ci` dijalankan utuh dengan
  `CI_PORT=8291 CI_PREVIEW_PORT=8293` dan `TMPDIR` di `/home`, **hijau penuh**
  (percobaan pertama berhenti di smoke karena port 8191 dipakai sesi lain;
  pengulangan dengan port eksplisit lulus termasuk cek baru).

- 2026-11-17: PR #140 — **Tiap baris daftar "Reviews due" `/gaps` membuka
  pelajarannya** — kartu **Reviews** di Gap Analysis sebelumnya hanya
  menampilkan nama konsep, baris kapan review jatuh tempo, dan badge prioritas
  tanpa jalan masuk ke `/learn/$conceptId`, sehingga review yang jatuh tempo
  tetap harus dicari manual padahal tab **Learning Path** (PR #137), kartu
  **Recommended concepts** (PR #138), dan zona **Ready to Learn** (PR #139)
  sudah punya tautan yang sama. Kini tiap `<motion.li>` daftar **Reviews due**
  berakhir dengan satu `<Link to="/learn/$conceptId" params={{ conceptId:
  item.conceptId }}>` (kelas `mt-1 inline-flex items-center gap-1 text-xs
  font-medium text-primary hover:underline focus-visible:outline-none
  focus-visible:ring-2 focus-visible:ring-violet-500 rounded`) berisi
  `BookOpen` `h-3 w-3` yang `aria-hidden="true"`, teks terlihat **Open the
  lesson**, dan `<span className="sr-only">: {conceptLabel(item.conceptId,
  item.conceptName)}</span>` agar tiap tautan punya nama aksesibel unik;
  tautan menjadi anak terakhir `<div className="flex-1 min-w-0">` tepat
  setelah baris `reviewSummary`, sementara nama, ringkasan, titik prioritas,
  dan badge prioritas tetap teks biasa. `key={i}`, `whileHover`, kelas baris,
  `<ul aria-label="Reviews due">` beserta kelas gulirnya, kedua empty state,
  daftar **Snoozed reviews** (tetap hanya **Review it now**), banner overdue,
  kartu angka/ringkasan, tab, pemilih learner, urutan, dan copy lain tidak
  berubah; tanpa tombol, live region, fokus paksa, atau `role` tambahan; UI
  bahasa Inggris (D2). `Link`/`BookOpen` tetap diimpor tepat sekali. Test baru
  `tests/gaps-review-lesson-links.test.ts` (11 penjaga statis);
  `tests/gaps-review-list.test.ts` tidak diubah dan tetap hijau. Satu cek
  smoke: setelah cek **Reviews due** bernama dengan `listitem` > 0, klik
  tautan pertama **Open the lesson: …** di daftar itu, lalu pastikan URL
  `/learn/` dan heading `h1` terlihat; penjaga baris smoke 2517 → 2537
  (`tests/skip-link.test.ts`). `README.md`/`Roadmap.md` tidak diubah;
  `docs/ROADMAP.md` mendapat entri log. `npm run ci` dijalankan utuh dengan
  `CI_PORT=8191 CI_PREVIEW_PORT=8193` dan `TMPDIR` di `/home`.

- 2026-11-17: PR #139 — **Tiap konsep di zona "Ready to Learn"
  `/recommendations` membuka pelajarannya** — kartu tengah tab **Ready / not
  yet** sebelumnya hanya menampilkan nama konsep, `zc.reason`, dan baris
  **Readiness: …%** tanpa jalan masuk ke `/learn/$conceptId`, sehingga konsep
  yang sudah siap dipelajari tetap harus dicari manual padahal tab **Learning
  Path** (PR #137) dan kartu **Recommended concepts** (PR #138) sudah punya
  tautan yang sama. Kini tiap `<motion.li>` zona **Ready to Learn
  ({zpd.zpd.length})** berakhir dengan satu `<Link to="/learn/$conceptId"
  params={{ conceptId: zc.concept.conceptId }}>` (kelas `mt-1 inline-flex
  items-center gap-1 text-xs font-medium text-primary hover:underline
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
  rounded`) berisi `BookOpen` `h-3 w-3` yang `aria-hidden="true"`, teks terlihat
  **Open the lesson**, dan `<span className="sr-only">: {zc.concept.name}</span>`
  agar tiap tautan punya nama aksesibel unik; tautan menjadi anak terakhir baris
  tepat setelah baris **Readiness**, nama dan `zc.reason` tetap teks biasa.
  Zona **Mastered** dan **Not yet**, ketiga empty state, `<h3
  id="rec-zone-ready">`, `<ul aria-labelledby>`, `key`/`whileHover`/kelas baris,
  tablist/tab/tabpanel, animasi, urutan, pemilih learner, dan copy lain tidak
  berubah; tanpa tombol, live region, fokus paksa, atau `role` tambahan; UI
  bahasa Inggris (D2). `Link`/`BookOpen` tetap diimpor tepat sekali. Test baru
  `tests/recommendations-ready-zone-lesson-links.test.ts` (11 penjaga statis);
  penjaga PR #138 `tests/recommendations-concept-lesson-links.test.ts` dibatasi
  ke blok **Recommended concepts** (dan tetap mengunci blok Learning Path)
  karena hitungan `<Link>`/`<BookOpen>` halaman kini 3, tanpa menghapus penjaga
  mana pun. Satu cek smoke: setelah cek tiga zona bernama, klik tab **Ready /
  not yet**, klik tautan pertama **Open the lesson: …** di daftar **Ready to
  Learn (…)**, pastikan URL `/learn/` dan heading `h1` terlihat, lalu kembali ke
  `/recommendations` sebelum cek Learning Path; penjaga baris smoke 2493 → 2517
  (`tests/skip-link.test.ts`). `README.md`/`Roadmap.md` tidak diubah;
  `docs/ROADMAP.md` mendapat entri log. `npm run ci` dijalankan utuh dengan
  `CI_PORT=8191 CI_PREVIEW_PORT=8193` dan `TMPDIR` di `/home`, **hijau penuh
  pada percobaan pertama** (termasuk cek smoke baru `/learn/quadratic-equations`).

- 2026-11-17: PR #138 — **Tiap kartu "Recommended concepts"
  `/recommendations` membuka pelajarannya** — kartu rekomendasi sebelumnya hanya
  menampilkan badge angka, nama konsep, metrik **Readiness**/**Est. time**/
  **Profile match**, alasan, prasyarat, dan chip **Ways to learn it** tanpa jalan
  masuk ke `/learn/$conceptId`, sehingga saran belajar bisa dibaca tetapi tidak
  bisa langsung dikerjakan. Kini tiap `<motion.li>` berakhir dengan satu
  `<Link to="/learn/$conceptId" params={{ conceptId:
  rec.concept.conceptId }}>` (kelas `mt-4 inline-flex items-center gap-1 text-sm
  font-medium text-primary hover:underline focus-visible:outline-none
  focus-visible:ring-2 focus-visible:ring-violet-500 rounded`) berisi
  `BookOpen` `h-4 w-4` yang `aria-hidden="true"`, teks terlihat **Open the
  lesson**, dan `<span className="sr-only">: {rec.concept.name}</span>` agar tiap
  tautan punya nama aksesibel unik; tautan menjadi anak terakhir
  `<div className="flex-1">` tepat setelah blok **Ways to learn it**. Judul
  `<h3>` tetap teks biasa dan kartu tidak dibungkus tautan. Badge, metrik,
  **Why this concept?**, **Builds on**, chip scaffolding, empty state **All
  caught up!**, urutan, animasi `motion.ol`/`motion.li`, tab, pemilih learner,
  dan copy lain tidak berubah; tanpa tombol, live region, fokus paksa, atau
  `role` tambahan; UI bahasa Inggris (D2). `Link`/`BookOpen` tetap diimpor tepat
  sekali. Test baru `tests/recommendations-concept-lesson-links.test.ts` (10
  penjaga statis); penjaga PR #137
  `tests/recommendations-learning-path-links.test.ts` dibatasi ke blok daftar
  Learning Path karena hitungan `<Link>`/`<BookOpen>` halaman kini 2. Satu cek
  smoke: klik tab **Recommendations**, klik tautan pertama **Open the lesson:
  …**, pastikan URL `/learn/` dan heading `h1` terlihat, lalu kembali ke
  `/recommendations` sebelum cek Learning Path; penjaga baris smoke 2471 → 2493
  (`tests/skip-link.test.ts`). `README.md`/`Roadmap.md` tidak diubah;
  `docs/ROADMAP.md` mendapat entri log. `npm run ci` dijalankan utuh dengan
  `CI_PORT=8191 CI_PREVIEW_PORT=8193` dan `TMPDIR` di `/home`.

- 2026-11-17: PR #137 — **Tiap langkah tab "Learning Path" `/recommendations`
  membuka pelajarannya** — kartu **Suggested Learning Path** sebelumnya hanya
  menampilkan badge angka, nama konsep, dan baris **Est./Readiness** tanpa jalan
  masuk ke `/learn/$conceptId`, sehingga rencana belajar bisa dibaca tetapi
  tidak bisa dikerjakan. Kini tiap `<motion.li>` berakhir dengan satu `<Link
  to="/learn/$conceptId" params={{ conceptId }}>` (kelas `mt-1 inline-flex
  items-center gap-1 text-xs font-medium text-primary hover:underline
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500
  rounded`) berisi `BookOpen` `h-3 w-3` yang `aria-hidden="true"`, teks terlihat
  **Open the lesson**, dan `<span className="sr-only">: {name}</span>` agar tiap
  tautan punya nama aksesibel unik; nama konsep dihitung sekali (`const name`)
  dan tetap teks biasa, tautan menjadi anak terakhir blok teks langkah setelah
  **Est./Readiness**. Badge, panah `↓`, animasi, kelas langkah,
  `<ol aria-label="Suggested learning path">`, empty state **No learning path
  available**, tab, pemilih learner, dan copy lain tidak berubah; tanpa tombol,
  live region, fokus paksa, atau `role` tambahan; UI bahasa Inggris (D2).
  `Link`/`BookOpen` diimpor tepat sekali. Test baru
  `tests/recommendations-learning-path-links.test.ts` (10 penjaga statis);
  penjaga lama `tests/recommendations-learning-path.test.ts` disesuaikan untuk
  nama yang dihitung sekali dan dua ikon dekoratif. Satu cek smoke: klik tab
  **Learning Path**, klik tautan pertama **Open the lesson: …**, pastikan URL
  `/learn/` dan heading `h1` terlihat; penjaga baris smoke 2452 → 2471
  (`tests/skip-link.test.ts`). `README.md`/`Roadmap.md` tidak diubah;
  `docs/ROADMAP.md` mendapat entri log. `npm run ci` hijau penuh pada percobaan
  pertama (1478/1478 unit = 1468 + 10; typecheck, lint 0/0, build, anggaran
  bundel, CSP produksi, smoke Playwright + PGlite; cek baru lulus
  `/learn/decimals`), dijalankan dengan `CI_PORT=8191 CI_PREVIEW_PORT=8193` dan
  `TMPDIR` di `/home`.

- 2026-11-17: PR #136 — **Daftar langkah tab "Learning Path" `/recommendations`
  menjadi daftar berurut bernama** — kartu **Suggested Learning Path**
  sebelumnya merender `zpd.suggestedPath.map` sebagai deretan `<motion.div>` di
  dalam `<div className="space-y-4">`, sehingga pembaca layar tidak tahu
  langkah-langkah itu satu urutan dan tidak bisa melompat per langkah. Kini
  wadahnya `<ol aria-label="Suggested learning path" className="space-y-4">`
  dengan tiap hasil `map` langsung `<motion.li key={conceptId}>` membawa
  `initial`/`animate`/`transition` dan kelas `flex items-center gap-4` yang
  sama; badge angka, nama konsep, baris **Est./Readiness**, urutan, dan copy
  tidak berubah, dan panah `↓` diberi `aria-hidden="true"` tanpa mengubah
  kelas/posisi. Empty state **No learning path available** tetap `<p>` di luar
  `<ol>`; tanpa kelas marker/`role` tambahan/live region/fokus paksa, tanpa
  `createServerFn`/`graphCall`/`rpc-schemas`/migrasi. Test baru
  `tests/recommendations-learning-path.test.ts` (9 penjaga statis) + satu cek
  smoke (klik tab **Learning Path**, daftar bernama terlihat dengan `listitem`
  > 0); penjaga baris smoke 2441 → 2452. `README.md`/`Roadmap.md` tidak
  diubah; `docs/ROADMAP.md` mendapat entri log. `npm run ci` hijau penuh pada
  percobaan kedua tanpa perubahan kode: percobaan pertama berhenti di smoke
  dengan `ERR_CONNECTION_REFUSED` di `/profile` setelah dev server mati saat
  sesi lain memakai port 8081; pengulangan memakai `CI_PORT=8191
  CI_PREVIEW_PORT=8193` dan lulus (termasuk cek baru).

- 2026-11-17: PR #135 — **Ringkasan dan daftar modul di `/japanese` menjadi
  daftar bernama** — blok ringkasan (tiga kartu **Topik dengan bukti latihan
  ≥80%**, **Kanji Michi mulai dipelajari**, **Kanji jatuh tempo**) dan grid
  modul **Peta kemampuan** sebelumnya `<section>`/`<div>` polos berisi
  `<div>`/`<article>`, sehingga pembaca layar tidak tahu kedua kelompok itu satu
  daftar dan tidak bisa melompat per item. Kini ringkasan `<ul
  aria-label="Ringkasan" className="grid gap-4 sm:grid-cols-3">` dengan tiga
  `<li className="rounded-2xl border border-border bg-card p-5">` langsung, dan
  grid modul `<ul aria-label={`Modul ${level}`} className="grid gap-3
  sm:grid-cols-2">` dengan `map` langsung ke `<li key={m.id} className="rounded-2xl
  border border-border bg-card p-4">` (menggantikan `<article>`); tanpa
  `<section>`/`<div>` perantara, kelas marker, `role` tambahan, live region,
  fokus paksa, ikon, atau tombol baru. Seluruh copy, urutan, kelas visual,
  tautan **Review di Michi →**, baris **Snapshot …**/**Buka Michi untuk memulai
  sinkron lokal.**, aksi modul, `MichiSkillEvidence`, serta kontrak bukti Michi
  tidak berubah; bahasa Indonesia (D2). Test baru `tests/japanese-lists.test.ts`
  (8 penjaga statis) + entri log `docs/ROADMAP.md`; tanpa cek smoke baru,
  penjaga baris smoke 2441 tetap. `README.md`/`Roadmap.md` tidak diubah.
  `npm run ci` hijau penuh (1459/1459 unit = 1451 + 8; smoke lulus).

- 2026-11-17: PR #134 — **Halaman `/privacy` punya daftar isi bernavigasi** —
  enam bagian panjang kebijakan ini sebelumnya `<section className="mt-8">` +
  `<h2>` tanpa `id`, tanpa daftar isi, dan tanpa landmark navigasi, sehingga
  pembaca layar tidak tahu enam bagian itu ada dan tidak bisa melompat ke
  **Deleting your data**. Kini `Section` menerima `id`, merender `<section
  id={id} className="mt-8 scroll-mt-4">` dan `<h2 id={`${id}-title`}
  className="text-lg font-semibold text-foreground">`, dan keenam pemanggilan
  memakai id stabil `privacy-what-is-stored`, `privacy-who-can-see-it`,
  `privacy-cookies-and-tracking`, `privacy-ai-services`,
  `privacy-personal-topics`, `privacy-deleting-your-data` dengan urutan tetap.
  Tepat setelah paragraf pembuka ada satu `<nav
  aria-labelledby="privacy-toc-title">` berkelas kartu, `<h2
  id="privacy-toc-title">On this page</h2>`, dan `<ul>` bergrid berisi enam
  `<li>` yang membungkus `<a href="#privacy-…">` berlabel sama persis dengan
  judul bagian. Tanpa ikon, tombol, `role` tambahan, `aria-current`, live
  region, fokus paksa, atau perubahan `ScrollRestoration`/router; isi
  kebijakan, urutan, gaya kartu/teks, `<h1>`, tautan **← LearnGraph**, dan
  `pageHead('/privacy')` tidak berubah; UI bahasa Inggris (D2). Test baru
  `tests/privacy-toc.test.ts` (7 penjaga statis) + satu cek smoke: `navigation`
  bernama **On this page** dengan tepat enam `link`, klik **Deleting your
  data** membuat heading tingkat 2 itu berada di viewport; penjaga baris smoke
  2417 → 2441. `README.md`/`Roadmap.md` tidak diubah; `docs/ROADMAP.md`
  mendapat entri log. `npm run ci` hijau penuh pada percobaan pertama
  (1451/1451 unit = 1444 + 7; smoke lulus termasuk cek baru).

- 2026-11-17: PR #133 — **Status proses tombol submit halaman lupa/reset kata
  sandi diumumkan pembaca layar** — saat `pending`, kedua tombol submit hanya
  menampilkan `Loader2` berputar sementara nama aksesibelnya tetap **Send the
  reset link**/**Save the new password**, tanpa `aria-busy` dan tanpa teks
  status, sehingga pembaca layar tidak tahu permintaan sedang berjalan dan
  ikon spinner ikut dibacakan. Kini kedua tombol membawa `aria-busy={pending}`
  (`disabled={pending}`, kelas `btn btn-primary flex w-full items-center
  justify-center gap-2`, dan label persis tetap), `Loader2` tetap
  `aria-hidden="true"` dengan kelas `h-4 w-4 animate-spin`, dan tepat setelah
  tombol — masih di dalam `<form>` dan menjadi anak terakhirnya — ada satu
  `<p role="status" aria-live="polite" className="sr-only">` yang membacakan
  `Sending the reset link…` (`/forgot-password`) atau `Saving the new
  password…` (`/reset-password`), kosong saat idle. Galat tetap satu-satunya
  `<p role="alert" className="form-error">` di `/forgot-password` dan tetap
  dua alert di `/reset-password` (tautan tidak valid + galat form); pesan
  sukses `sent`/`done`, cabang `!features.passwordReset`, satu pasangan
  label/kontrol email, dua pasangan sandi baru, `onSubmit`, `safeParse`/panjang
  sandi, `authClient`, `rateLimitMessage`, dan `noValidate` tidak berubah;
  tanpa `aria-label` pengganti, tombol/fokus/live region lain; UI bahasa
  Inggris (D2). Test baru `tests/password-reset-pending-status.test.ts` (18
  penjaga statis: satu `aria-busy={pending}` per halaman pada tombol submit
  dengan `disabled`/kelas/label utuh, `Loader2` ber-`aria-hidden` dengan kelas
  tetap dan satu-satunya elemen tersembunyi di form, satu `aria-live="polite"`
  per halaman sementara `role="status"` tetap dua (cabang sukses + baris
  pending), teks status persis dan kosong saat idle, posisi sesudah tombol
  sebagai anak terakhir form, galat/alert dan pasangan label/kontrol serta alur
  submit utuh, tanpa `aria-label`/`aria-labelledby`/`aria-atomic`, serta tanpa
  `createServerFn`/`graphCall`/`rpc-schemas`/migrasi). Tidak ada cek smoke baru
  (status pending hanya sesaat; alur lupa/reset butuh email/token), penjaga
  jumlah baris smoke 2417 tetap. `README.md`/`Roadmap.md` tidak diubah;
  `docs/ROADMAP.md` mendapat entri log. `npm run ci` hijau penuh pada
  percobaan pertama (typecheck, lint 0/0, unit, build, anggaran bundel, CSP
  produksi, smoke Playwright + PGlite).
- 2026-11-17: PR #132 — **Empat daftar data `/data-entry` menjadi daftar
  bernama dan pesan kosongnya lengkap** — **Recent Learners** dan **Recent
  Concepts** di blok Live Data Preview, serta **Existing Learners (n)** dan
  **Existing Concepts (n)** di tab Learners/Concepts, sebelumnya merender
  barisnya sebagai deretan `<div>` di dalam `<div>`, sehingga pembaca layar
  tidak tahu baris-baris itu satu daftar dan tidak bisa melompat per item;
  blok **Existing Concepts** bahkan tidak punya pesan kosong sehingga akun
  tanpa konsep menampilkan kotak abu-abu kosong. Kini keempat wadah baris
  adalah `<ul>` dengan kelas wadah persis sama (`space-y-2`,
  `max-h-32 overflow-y-auto rounded-xl bg-accent/50 p-2`,
  `max-h-40 overflow-y-auto rounded-xl bg-accent/50 p-2`) dan `aria-label`
  Inggris **Recent learners**, **Recent concepts**, **Existing learners**,
  **Existing concepts**; tiap hasil `map` langsung `<li>` dengan `key`
  (`l.userId`/`c.conceptId`), seluruh kelas visual, dan isi yang sama (inisial,
  nama, `userId`/domain, badge `conceptId`), tanpa `<div>` perantara dan tanpa
  kelas marker/`role="list"` (Tailwind preflight sudah menghapus penanda).
  Cabang kosong **Existing Learners** dan **Existing Concepts** kini di luar
  `<ul>` sebagai `<p className="text-muted-foreground text-sm text-center
  py-2">No learners yet</p>` / `No concepts yet` (copy sama dengan empty state
  Recent Concepts), tanpa tombol baru; ikon `Plus` di kedua tombol **Add your
  first learner**/**Add your first concept** diberi `aria-hidden="true"`
  tanpa mengubah kelas `w-3 h-3`. Judul + hitungan, urutan, `onClick` tombol,
  tab/tablist, 26 pasangan label form, banner pesan, `handleAdd*`, skema Zod,
  DBContext, isolasi akun, dan copy lain tidak berubah; UI bahasa Inggris
  (D2). Test baru `tests/data-entry-data-lists.test.ts` (8 penjaga statis:
  empat `<ul>` bernama dengan kelas wadahnya, hasil `map` langsung `<li>`
  ber-`key`/kelas/isi berurutan tanpa pembungkus, tanpa kelas
  marker/`role="list"`/live region/fokus paksa, kedua pesan kosong Existing di
  luar `<ul>` dan **No concepts yet** baru muncul tepat sekali, kedua ikon
  `Plus` `aria-hidden` dengan kelas tetap, judul/hitungan utuh, serta tanpa
  `createServerFn`/`graphCall`/`rpc-schemas`/migrasi). Tidak ada cek smoke
  baru (perubahan semantik; isi daftar bergantung data seed), penjaga jumlah
  baris smoke 2417 tetap. `README.md`/`Roadmap.md` tidak diubah;
  `docs/ROADMAP.md` mendapat entri log. `npm run ci` hijau.

- 2026-11-17: PR #131 — **Status proses tombol submit
  `/sign-in` diumumkan pembaca layar** — tombol `<button type="submit"
  disabled={pending}>` form masuk/daftar sebelumnya saat `pending` hanya
  menampilkan `Loader2` berputar sementara nama aksesibelnya tetap **Sign
  in**/**Create account**, tanpa `aria-busy` atau teks status; pembaca layar
  tidak tahu proses masuk berjalan dan ikon spinner ikut dibacakan. Kini
  tombol membawa `aria-busy={pending}` (`disabled`, kelas, label persis
  tetap), `Loader2` diberi `aria-hidden="true"` tanpa mengubah kelas
  `h-4 w-4 animate-spin`, dan tepat setelah tombol — masih di dalam `<form>`
  dan menjadi anak terakhirnya — ada satu `<p role="status"
  aria-live="polite" className="sr-only">` yang membacakan `Signing in…` /
  `Creating account…` mengikuti `mode` dan kosong saat idle. Galat tetap
  satu-satunya `<p role="alert" className="form-error">`; tiga pasangan
  label/kontrol, tombol tukar mode, tautan lupa kata sandi/privasi,
  `safeRedirect`, `rateLimitMessage`, `authClient`, validasi Zod, dan alur
  `onSubmit` tidak berubah; tanpa `aria-label` pengganti, tombol/fokus baru,
  atau live region lain. Test baru `tests/sign-in-pending-status.test.ts`
  (12 penjaga statis); tidak ada cek smoke baru (status pending hanya sesaat,
  alur masuk smoke memakai sesi tersimpan), penjaga baris smoke 2417 tetap.
  `README.md`/`Roadmap.md` tidak diubah; `docs/ROADMAP.md` mendapat entri log.
  `npm run ci` hijau.

- 2026-11-17: PR #130 — **Banner pesan hasil aksi `/data-entry` diumumkan
  pembaca layar** — satu banner `message` di bawah header halaman (dipakai
  semua `showMessage(...)`, mis. `Learner added successfully!`, `Invalid JSON
  format`, `Failed to add learner`) sebelumnya `motion.div` polos tanpa
  `role`/`aria-live`, sehingga pembaca layar tidak mendengar hasil simpan
  maupun galat, dan ikon `Check`/`AlertCircle` ikut dibacakan. Kini banner
  membawa `role={message.type === 'success' ? 'status' : 'alert'}` +
  `aria-live={message.type === 'success' ? 'polite' : 'assertive'}`; kedua
  ikon `aria-hidden="true"` tanpa mengubah kelas `w-5 h-5`. Banner tetap
  kondisional `message &&` di dalam `AnimatePresence` (role ada saat elemen
  dipasang); `initial`/`animate`/`exit`, kelas sukses/galat, `message.text`,
  `showMessage` + auto-dismiss 5000 ms, tab/tablist, 26 pasangan label form,
  `handleAdd*`, skema Zod, DBContext, isolasi akun, dan copy Inggris (D2)
  tidak berubah; tanpa tombol tutup, fokus paksa, atau `aria-label` pengganti.
  Test baru `tests/data-entry-message-banner.test.ts` (12 penjaga statis)
  + satu cek smoke: tab **Learners** → tombol **JSON** → isi
  `#data-entry-learner-json` dengan `{invalid` → **Submit JSON** →
  `getByRole('alert')` terlihat dan memuat `Invalid JSON format`; penjaga
  baris smoke 2399 → 2417. Penjaga lama `tests/data-entry-tabs.test.ts`
  disesuaikan: halaman kini punya tepat satu `aria-live` (banner) dan tujuh
  `role="` statis untuk tab, plus satu `role={` dinamis banner.
  `README.md`/`Roadmap.md` tidak diubah; `docs/ROADMAP.md` mendapat entri log.
  `npm run ci` hijau penuh pada percobaan ketiga tanpa perubahan kode: dua
  percobaan pertama gagal karena race port 8081 dengan sesi lain (`vite
  preview` sesi lain mengambil 8081 setelah probe CI) sehingga smoke tidak
  bisa start; percobaan ulang memilih port bebas sendiri dan lulus.

- 2026-11-17: PR #129 — **Setiap label form `/data-entry` menamai kontrolnya** —
  empat form di tab **Learners**, **Concepts**, **Prerequisites**, dan
  **Knowledge States** sebelumnya menampilkan label visual tanpa `htmlFor` dan
  kontrol tanpa `id`, jadi pembaca layar mengumumkan bidang tanpa nama dan klik
  label tidak memfokuskan kontrol. Kini tepat 26 pasangan `htmlFor`/`id`
  berprefiks `data-entry-` tanpa mengubah urutan, label, placeholder, nilai,
  `onChange`, validasi, atau copy: 11 di Learners
  (`data-entry-learner-json`, `-name`, `-email`, `-id`, `-modality`, `-social`,
  `-pace`, `-memory`, `-attention`, `-speed`, `-abstract`), 8 di Concepts
  (`data-entry-concept-id`, `-name`, `-domain`, `-subdomain`, `-description`,
  `-difficulty`, `-cognitive-load`, `-abstractness`), 3 di Prerequisites
  (`data-entry-prereq-from`, `-to`, `-reason`), dan 4 di Knowledge States
  (`data-entry-state-learner`, `-concept`, `-mastery`, `-bloom`). Label wajib
  beserta `*` dan label slider yang menampilkan nilai tetap utuh; keempat
  slider tetap `type="range"`. Kode aktual tidak punya checkbox psikometrik
  (39 skor memakai input angka dengan label terpisah), jadi label itu dan grup
  **Strength**/radio implisit sengaja tidak dipasangkan. Tanpa
  `aria-label` pengganti, `role`, live region, fokus paksa, server function,
  RPC, atau migrasi. Test baru `tests/data-entry-form-labels.test.ts` (10
  penjaga statis: 26 pasangan unik, distribusi 11/8/3/4 per form, teks label
  termasuk penanda wajib dan nilai slider, tanpa nama pengganti, grup implisit
  utuh, tanpa data path baru) + dua cek smoke (label **Name** → `INPUT`
  terlihat; setelah tab **Concepts**, label **Concept ID** → `INPUT`); penjaga
  baris smoke 2378 → 2399. `README.md`/`Roadmap.md` tidak diubah;
  `docs/ROADMAP.md` mendapat entri log. `npm run ci` hijau penuh pada
  percobaan pertama (typecheck, lint 0/0, tests 415,2 s, build, anggaran
  bundel, CSP produksi, smoke Playwright + PGlite; dijalankan dengan `TMPDIR`
  di `/home`).

- 2026-11-17: PR #128 — **Lima tab `/data-entry` bisa dipakai pembaca layar
  dan keyboard** — tab **Overview**, **Learners**, **Concepts**,
  **Prerequisites**, dan **Knowledge States** sebelumnya `motion.button` biasa
  di dalam `<div>` tanpa peran WAI-ARIA: hanya warna aktif yang menandai tab
  terpilih, panel tak punya nama, dan panah tidak berpindah tab. Wadah kini
  `role="tablist"` + `aria-label="Data entry sections"` dengan kelas yang sama;
  tiap tombol `role="tab"`, `id={`data-entry-tab-${tab.id}`}`,
  `aria-selected={isActive}`, `tabIndex={isActive ? 0 : -1}`, `aria-controls`
  hanya pada tab aktif; tiap panel `role="tabpanel"`,
  `id="data-entry-panel-<id>"`, `aria-labelledby="data-entry-tab-<id>"`,
  `tabIndex={0}`. Keyboard memakai helper murni `nextTabIndex` yang sudah ada
  (`onKeyDown` → abaikan `null` → `setActiveTab(TAB_CONFIG[next].id)` + fokus
  lewat array ref); `onClick` tetap; ikon tab `aria-hidden` tanpa ubah kelas.
  Tanpa live region/tombol/`role` lain; urutan, label, kelas, isi panel, copy,
  dan bahasa Inggris (D2) tetap. Test baru `tests/data-entry-tabs.test.ts` (13
  penjaga statis) + satu cek smoke (lima tab berurutan, roving tab stop, panel
  bernama, klik **Learners**); penjaga baris smoke 2336 → 2378.
  `README.md`/`Roadmap.md` tidak diubah; `docs/ROADMAP.md` mendapat entri log.
  `npm run ci` hijau penuh pada percobaan pertama (1384/1384 unit = 1371 + 13;
  smoke lulus termasuk cek tab baru; dijalankan dengan `TMPDIR` di `/home`).

- 2026-11-17: PR #127 — **Grup uji dan status tes di `/tests` bisa dipakai
  pembaca layar** — halaman Functional Tests menyampaikan dua hal hanya lewat
  warna/rotasi ikon. (1) Tombol header tiap grup hasil `testGroups.map`
  sebelumnya `<button onClick={() => toggleGroup(groupIndex)}>` tanpa
  `aria-expanded`/`aria-controls` dan tanpa `id` pada isi grup; kini tombol
  membawa `aria-expanded={isExpanded}` + `aria-controls={\`tests-group-${groupIndex}\`}`
  dan `<motion.div>` isi di dalam `AnimatePresence` membawa
  `id={\`tests-group-${groupIndex}\`}`. (2) Tiap baris tes hanya menampilkan
  `{getStatusIcon(test.status)}`; helper murni baru `statusLabel(status)`
  mengembalikan `'Passed'`/`'Failed'`/`'Running'`/`'Not run'` untuk empat cabang
  yang sama dengan ikon, dan tepat setelah ikon ada
  `<span className="sr-only">{statusLabel(test.status)}</span>` — keduanya
  membaca `test.status` yang sama. Sembilan ikon dekoratif (`FlaskConical`,
  `Play`, `ChevronRight`, empat ikon status, `Layers`, `AlertCircle`) diberi
  `aria-hidden="true"` tanpa mengubah ukuran/kelas/animasi/posisi. Tanpa live
  region, fokus paksa, tombol, atau `role` tambahan; `runAllTests`,
  `toggleGroup`, urutan tujuh grup dan tesnya, ringkasan Total/Passed/Failed,
  copy, dan disabled state tombol Run tidak berubah; UI bahasa Inggris (D2).
  Test baru `tests/tests-page-a11y.test.ts` (8 penjaga statis: pasangan
  atribut persis di cabang `isExpanded`, kontrak `onClick`/urutan tujuh
  grup/15 tes grup pertama, empat label dan posisinya sesudah ikon, empat ikon
  status dengan ukuran/kelas tetap, sembilan ikon `aria-hidden`, tombol
  Run/ringkasan/urutan bagian tetap, tanpa
  `aria-live`/`role`/`.focus()`/`tabIndex`, serta tanpa
  `createServerFn`/`graphCall`/`rpc-schemas`/migrasi). Satu cek smoke di loop
  `PAGES`: grup **Phase 1: Database Foundation** mula-mula
  `aria-expanded="true"` dengan isi terlihat dan tepat 15 `span.sr-only`
  berteks `Not run`, setelah diklik `"false"` + isi tersembunyi, lalu dibuka
  lagi — kode aktual menginisialisasi ketujuh grup terbuka
  (`new Set([0, 1, 2, 3, 4, 5, 6])`), bukan tertutup seperti perkiraan spek.
  Penjaga jumlah baris smoke 2294 → 2336. `README.md`/`Roadmap.md` tidak
  diubah; `docs/ROADMAP.md` mendapat entri log. `npm run ci` hijau.

- 2026-11-17: PR #126 — **Kartu algoritma dan fase `/status` mengumumkan
  statusnya sebagai teks** — halaman System Status menyampaikan status hanya
  lewat ikon berwarna: `AlgorithmCard` menutup baris dengan
  `CheckCircle2`/`XCircle` tanpa kata "Operational", dan `PhaseCard` memakai
  `CheckCircle2`/`Clock`/`XCircle` sementara legenda **Complete**/**Pending**/
  **Error** di bawah grid tidak terhubung ke kartu mana pun. Kini tepat setelah
  ikon status, `AlgorithmCard` membawa
  `<span className="sr-only">{isOperational ? 'Operational' : 'Not operational'}</span>`
  dan `PhaseCard` membawa
  `<span className="sr-only">{isComplete ? 'Complete' : isPending ? 'Pending' : 'Error'}</span>`
  — kata yang sama dengan legenda dan state yang sama dengan ikon. Seluruh 31
  ikon/titik dekoratif halaman diberi `aria-hidden="true"` tanpa mengubah
  size/kelas/animasi/posisi: `Icon` dalam kotak berwarna (`ServiceCard`,
  `DataCard`, `AlgorithmCard`), `Clock` latensi, empat ikon judul `<h2>`,
  `Activity` header, `RefreshCw`, `Loader2`, `AlertCircle`/`AlertTriangle`,
  tiga ikon banner kesehatan, tiga titik legenda, tiga ikon **Quick Actions**,
  empat titik `StatusIndicator`, dan lima ikon status kartu. Tanpa live
  region, fokus paksa, tombol, atau `role` tambahan; teks, urutan, empat
  algoritma, enam fase, `onClick={fetchStatus}`, auto-refresh 30 detik, dan
  `LearningMeasures` tidak berubah; UI bahasa Inggris (D2). Test baru
  `tests/status-a11y.test.ts` (9 penjaga statis: dua ekspresi `sr-only` persis,
  posisi sesudah ikon status, kontrak state, 24 ikon + 7 titik `aria-hidden`
  dengan ukuran/kelas tetap, tepat 31 `aria-hidden`, urutan kartu dan fase,
  jalur refresh/urutan bagian, tanpa `aria-live`/`role`/`.focus()`/`tabIndex`,
  serta tanpa `createServerFn`/`graphCall`/`rpc-schemas`/migrasi) + satu cek
  smoke di loop `PAGES`: heading **Algorithm Health** terlihat dan `span.sr-only`
  memuat 4 `Operational`, 0 `Not operational`, 2 `Complete`, 4 `Pending`,
  0 `Error`. Penjaga jumlah baris smoke 2266 → 2294. `README.md`/`Roadmap.md`
  tidak diubah; `docs/ROADMAP.md` mendapat entri log. `npm run ci` hijau penuh
  (1349/1349 unit = 1340 + 9; smoke lulus termasuk cek baru). Catatan mesin:
  percobaan pertama gagal di unit test karena `/tmp` (tmpfs 4.9 GB) penuh
  (`Unknown system error -122`/`errno 28`), lalu gerbang dijalankan dengan
  `TMPDIR=/home/ardhyui/.cache/ci-tmp`; percobaan smoke pertama flaky di mesin
  berload dan diulang utuh tanpa perubahan kode hingga hijau.

- 2026-11-17: PR #125 — **Bagian buka/tutup `/edu-psychology` bisa dipakai
  pembaca layar** — dua pola buka/tutup di halaman dokumentasi psikologi
  pendidikan ini hanya menunjukkan status lewat warna/rotasi ikon. Enam bagian
  `ExpandableSection` (**Zone of Proximal Development (ZPD)**, **Bloom's
  Taxonomy**, **Scaffolding Strategies**, **Forgetting Curve & Spaced
  Repetition**, **Psychometric Profiling (39 Domains)**, **Knowledge Graph &
  Prerequisites**) sebelumnya `<button>` tanpa `aria-expanded`/`aria-controls`
  dan wadah isi `<motion.div>` tanpa `id`; kini komponen memakai
  `const contentId = useId();` sekali, tombol header membawa
  `aria-expanded={isOpen}` + `aria-controls={contentId}`, dan isi di dalam
  `AnimatePresence` membawa `id={contentId}`. Dua belas tombol kategori
  `PsychometricWheel` membawa `aria-expanded={expandedCategory === categoryName}`
  + `aria-controls="psychometric-category-detail"` (atribut selalu ada walau
  panel bersyarat), dan panel detailnya membawa
  `id="psychometric-category-detail"`. Ikon dekoratif di kedua komponen —
  `Icon` dalam kotak berwarna, `ChevronDown`, emoji kategori di tombol dan
  header panel, dua titik warna kategori (grid dan quick reference) — diberi
  `aria-hidden="true"` tanpa mengubah ukuran/kelas; total enam di halaman.
  Teks judul, `onClick`, kelas tombol, ikon beserta kelas rotasinya,
  `initial`/`animate`/`exit`, urutan enam bagian dan dua belas kategori (kode
  aktual berisi 12 kategori, bukan 10 seperti perkiraan spek), isi panel (nama
  domain, deskripsi, penanda, `eduRelevance`, `domain.id`), serta bagian
  halaman lain tidak berubah; tanpa live region, fokus paksa, tombol, atau
  `role` tambahan; UI bahasa Inggris (D2). Test baru
  `tests/edu-psychology-a11y.test.ts` (10 penjaga statis: dua ekspresi
  `aria-expanded` persis dan total dua di halaman, satu `useId` + satu pasang
  `aria-controls`/`id` per pola, kontrak `onClick`/kelas/`AnimatePresence`/
  animasi/urutan enam judul, kontrak kategori dan urutan dua belas kategori,
  kelengkapan isi panel, enam ikon dekoratif `aria-hidden`, tanpa
  `aria-live`/`role`/`.focus()`/`tabIndex`, serta tanpa
  `createServerFn`/`graphCall`/`rpc-schemas`/migrasi) + satu cek smoke di loop
  `PAGES`: bagian pertama ber-`aria-expanded="true"` dengan `aria-controls`
  yang menunjuk isi terlihat, setelah diklik menjadi `"false"` dan isi itu
  tersembunyi, lalu dibuka lagi. Penjaga jumlah baris smoke 2237 → 2266.
  `README.md`/`Roadmap.md` tidak diubah; `docs/ROADMAP.md` mendapat entri log.
  `npm run ci` hijau penuh pada percobaan pertama (1352/1352 unit = 1342 + 10;
  smoke lulus termasuk cek baru).

- 2026-11-17: PR #124 — **Toolbar halaman `/combined-graph` bisa dipakai
  pembaca layar** — tiga toggle di baris **Show:** (**Domains (Graph A)**,
  **Concepts (Graph B)**, **Knowledge States (Bridge)**) sebelumnya
  `motion.button` biasa yang hanya menunjukkan status lewat warna
  (`bg-purple-500/20 …`/`bg-blue-500/20 …`/`bg-pink-500/20 …` saat aktif)
  tanpa `aria-pressed`, `<label>` **Select Learner:** tidak terhubung ke
  `<select>` learner (tanpa `htmlFor`/`id`), dan seluruh ikon toolbar
  (`RefreshCw`, `User`, `Eye`/`EyeOff`, `Brain`/`Network`/`ArrowRight`)
  ikut dibacakan. Kini ketiga toggle membawa
  `aria-pressed={showDomains}`/`aria-pressed={showConcepts}`/
  `aria-pressed={showBridges}` (pola PR #118/#123) tanpa mengubah teks,
  `onClick`, kelas, atau `whileHover`/`whileTap`; label berpasangan dengan
  select lewat `htmlFor`/`id="combined-graph-learner"` (value/onChange/opsi
  `Choose a learner...` + `learners.map`/kelas tetap); kesebelas ikon
  dekoratif `aria-hidden="true"` tanpa mengubah size/kelas; tombol Refresh
  tetap tanpa `aria-pressed` karena aksi, bukan toggle. Tanpa live region,
  fokus paksa, `role` tambahan, atau tombol baru; urutan, isi, dan bagian
  halaman lain tidak berubah; UI bahasa Inggris (D2). Test baru
  `tests/combined-graph-toolbar.test.ts` (5 penjaga statis: tiga
  `aria-pressed` ekspresi persis dan total tiga di halaman, kontrak
  `onClick`/`whileHover`/`whileTap`/kelas aktif-tidak aktif/label berurutan,
  pasangan `htmlFor`/`id` dengan kontrak select dan opsi utuh, sebelas ikon
  `aria-hidden` + Refresh tanpa `aria-pressed`, serta tanpa
  `createServerFn`/`graphCall`/`rpc-schemas`/migrasi) + satu cek smoke di
  blok graph pages (`getByLabel('Select Learner:')` menunjuk select pertama
  halaman: `combined graph toolbar labels the learner select — label select
  labeled`); penjaga jumlah baris smoke 2220 → 2237. `README.md`/`Roadmap.md`
  tidak diubah; `docs/ROADMAP.md` mendapat entri log. `npm run ci` hijau
  penuh pada percobaan kedua tanpa perubahan kode (1336 + 6 = 1342/1342
  unit; percobaan pertama gagal hanya di smoke `Failed to fetch` saat mesin
  berload dari sesi lain).

- 2026-11-17: PR #123 — **Toolbar dan kartu angka `/domains` dapat dibaca
  pembaca layar** — tombol **Correlations** dan **Subscales** sebelumnya
  `motion.button` biasa yang hanya menunjukkan status lewat warna
  (`bg-emerald-500/20 …` aktif vs `bg-secondary …` tidak) tanpa
  `aria-pressed`, `<label>` **Overlay scores:** tidak terhubung ke
  `<select>` overlay (tanpa `htmlFor`/`id`), ikon dekoratif
  `RefreshCw`/`Eye`/`EyeOff`/`Users` tanpa `aria-hidden`, dan empat kartu
  angka hasil `statCards.map` dirender `motion.div` di dalam grid
  `motion.div` tanpa daftar. Kini kedua toggle membawa
  `aria-pressed={showCorrelations}`/`aria-pressed={showSubscales}` (pola PR
  #118) tanpa mengubah teks/`onClick`/kelas/`whileHover`/`whileTap`; label
  berpasangan dengan select lewat
  `htmlFor`/`id="domains-overlay-learner"` (value/onChange/opsi No overlay +
  `learners.map`/kelas tetap); keenam ikon dekoratif `aria-hidden="true"`
  tanpa mengubah `size={18}`/kelas; grid kartu angka menjadi `<motion.ul>`
  pembawa `variants` stagger dan kelas `grid grid-cols-2 md:grid-cols-4
  gap-4 mb-6` yang sama dengan tiap hasil map langsung `<motion.li
  key={card.label}>` (`variants`/`whileHover`/kelas `glass-card p-4
  text-center` persis sama, tanpa `<div>` perantara, tanpa kelas marker
  baru — Tailwind preflight sudah menghapus penanda). Tanpa live region,
  fokus paksa, `role` tambahan, atau tombol baru; urutan, isi, dan bagian
  halaman lain tidak berubah; UI bahasa Inggris (D2). Test baru
  `tests/domains-toolbar.test.ts` (9 penjaga statis: dua `aria-pressed`
  ekspresi persis, pasangan `htmlFor`/`id` tepat satu dengan kontrak select
  utuh, enam ikon `aria-hidden`, hasil `map` langsung `<motion.li>` tanpa
  pembungkus, empat label kartu berurutan, tanpa kelas
  marker/`role="list"`/live region, tanpa `createServerFn`/`graphCall`/
  `rpc-schemas`/migrasi) + satu cek smoke di blok graph pages
  (`getByLabel('Overlay scores:')` menunjuk select pertama halaman, tombol
  Correlations/Subscales ber-`aria-pressed`); penjaga jumlah baris smoke
  2192 → 2220. `README.md`/`Roadmap.md` tidak diubah; `docs/ROADMAP.md`
  mendapat entri log. `npm run ci` hijau penuh pada percobaan pertama
  (1336/1336 unit = 1327 + 9).

- 2026-11-17: PR #122 — **Daftar isi halaman `/about` menjadi landmark
  navigasi bernama** — blok **Table of Contents** sebelumnya `<div>` polos
  berisi 15 tautan `#…` hasil `sections.map` dalam grid `<div>`, jadi pembaca
  layar tidak tahu 15 tautan itu satu daftar tujuan di halaman ini dan tidak
  bisa melompat per item. Kini bloknya `<nav aria-labelledby="about-toc-title">`
  dengan kelas kartu yang sama, `<h3>`-nya ber-`id="about-toc-title"` (teks
  **Table of Contents**, ikon `BookMarked`, kelas tidak berubah), wadah grid
  menjadi `<ul>` berkelas `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
  gap-2`, dan tiap hasil `map` langsung `<li key={section.id}>` yang membungkus
  `<a>` lama (`href`, kelas, label tetap) dengan ikon `ChevronRight` kini
  `aria-hidden="true"`. Tanpa `<div>` perantara, kelas marker baru, live
  region, fokus paksa, `role` tambahan, atau tombol baru; urutan 15 tujuan,
  label, `href`, dan tampilan tidak berubah; UI bahasa Inggris (D2). Test
  baru `tests/about-toc.test.ts` (7 penjaga statis; penjaga
  `createServerFn`/`graphCall`/`rpc-schemas` dibatasi ke blok TOC karena isi
  dokumentasi halaman memang menyebut `graphCall` di tabel API) + satu cek
  smoke di blok halaman publik mobile (`navigation` bernama **Table of
  Contents** terlihat, tepat 15 `listitem` dan 15 `link`); penjaga jumlah
  baris smoke 2178 → 2192. `README.md`/`Roadmap.md` tidak diubah;
  `docs/ROADMAP.md` mendapat entri log. `npm run ci` hijau penuh pada
  percobaan pertama (1327/1327 unit = 1320 + 7).

- 2026-11-17: PR #121 — **Tiga zona di tab "Ready / not yet" menjadi daftar
  bernama** — kartu **Mastered (n)**, **Ready to Learn (n)**, dan **Not yet (n)**
  di `/recommendations` sebelumnya deretan `<motion.div>` di dalam `<div>`
  berkelas gulir, jadi pembaca layar tidak tahu itu tiga daftar konsep per zona
  dan tidak bisa melompat per item. Kini tiap `<h3>` ber-`id`
  (`rec-zone-mastered`/`rec-zone-ready`/`rec-zone-notyet`), wadah pemetaannya
  `<ul aria-labelledby>` dengan kelas gulir yang sama, dan tiap baris langsung
  `<motion.li>` (`key`, `whileHover`, kelas visual persis sama). Tidak ada
  `<div>` perantara atau kelas marker baru. Ketiga pesan kosong tetap di cabang
  `length === 0` sebagai `<p>` **setelah** daftar (di luar `<ul>`), sehingga
  urutan visual tetap; isi baris, urutan, aturan ZPD, tablist/tabpanel, copy,
  dan fokus tidak berubah; UI bahasa Inggris (D2). Test baru
  `tests/recommendations-zones.test.ts` (7 penjaga statis) + satu cek smoke
  (tiga `role="list"` bernama, total `listitem` > 0); penjaga jumlah baris
  smoke 2169 → 2178. `README.md`/`Roadmap.md` tidak diubah; `docs/ROADMAP.md`
  mendapat entri log. `npm run ci` hijau penuh pada percobaan pertama.

- 2026-11-17: PR #120 — **Bar progres di My Profile mengumumkan jumlah
  penguasaan, bukan persen mentah** — dua `role="progressbar"` di kartu **My
  learning** `/profile` hanya membawa `aria-valuenow` berisi persen, padahal
  tepat di atasnya ada teks "3 of 10 concepts mastered", dan bar per subjek
  tidak pernah menyebut penyebutnya. Kini bar keseluruhan
  `aria-valuetext={masteredLine(current.progress)}` dan bar per subjek
  `aria-valuetext={masteredLine(row)}`, memakai helper yang sama dengan baris
  teks `data-testid="profile-mastered"` dan baris tiap subjek sehingga teks
  yang diumumkan tidak bisa berbeda dari yang terlihat. `aria-label`,
  `aria-valuemin`/`max`/`now`, kelas, lebar `style`, `<dl>` tiga kartu angka,
  daftar **Mastery by subject**, urutan, dan elemen lain tidak berubah; kasus
  `total === 0` tetap aman lewat `No concepts in your subjects yet` tanpa
  cabang baru. Tanpa live region/fokus paksa/tombol/panggilan baca-tulis; UI
  bahasa Inggris (D2). Test baru `tests/profile-progress-valuetext.test.ts`
  (10 penjaga statis) + satu cek smoke di alur `/profile` (bar pertama sama
  persis dengan teks `profile-mastered`, semuanya berakhiran `mastered`);
  penjaga jumlah baris smoke 2159 → 2169. `README.md` dan `Roadmap.md` tidak
  diubah; `docs/ROADMAP.md` mendapat entri log. `npm run ci` hijau penuh pada
  percobaan pertama (1313/1313 unit = 1303 + 10; smoke lulus).

- 2026-11-17: PR #119 — **Fokus judul pelajaran setelah pindah konsep** —
  tautan **Builds on** dan **Next: <konsep>** di `/learn/$conceptId` mengganti
  seluruh pelajaran sehingga tautan yang sedang fokus ter-unmount dan fokus
  jatuh ke `<body>`; pengguna keyboard/pembaca layar harus men-Tab dari awal.
  Kini `<h1 id="lesson-title">` memakai `ref={lessonTitleRef}`,
  `tabIndex={-1}`, dan `focus:outline-none` (teks/ukuran/warna/posisi tetap),
  dan effect baru memindahkan fokus lewat
  `requestAnimationFrame(() => lessonTitleRef.current?.focus())` hanya ketika
  `lesson` untuk `conceptId` yang diminta sudah dimuat
  (`lesson.concept.conceptId === conceptId`, jadi lesson lama yang belum
  ter-reset tidak pernah difokuskan) dan `conceptId` berbeda dari ref
  `titleConceptId` yang diinisialisasi dengan `conceptId` saat mount; mount
  pertama, ganti learner, `load()` ulang setelah kuis/laporan diri, dan
  `quizOpen` tidak memindahkan fokus, dan `finishQuiz`/`cancelQuiz` tetap.
  `Link`/`nav`, urutan tab, `article`, judul, `ConceptQuiz`, copy, dan isolasi
  akun tidak berubah; UI bahasa Inggris (D2). Test baru
  `tests/lesson-navigation-focus.test.ts` (6 penjaga statis) + penyesuaian
  penjaga `.focus()` di `tests/lesson-focus.test.ts` (2 → 3); satu cek smoke
  baru mengikuti **Next:** lalu memastikan `document.activeElement` adalah
  `h1#lesson-title` berisi nama konsep baru, penjaga baris smoke 2142 → 2159.
  `README.md` dan `Roadmap.md` tidak diubah; `docs/ROADMAP.md` mendapat entri
  log. `npm run ci` hijau penuh (1303/1303 unit = 1297 + 6; smoke lulus pada
  percobaan pertama).

- 2026-11-17: PR #118 — **Tombol panjang dan tata letak kuis di `/profile`
  menjadi grup pilihan bernama** — dua pasang toggle di kartu **Short
  questionnaires** sebelumnya `<button>` biasa di dalam `<div>` tanpa nama,
  jadi pembaca layar tidak tahu opsi mana yang terpilih (hanya warna) dan
  tidak tahu tiap pasangan satu grup pilihan. Kini wadah pertama
  `<div role="group" aria-label="Quiz length">` dan kedua
  `<div role="group" aria-label="Quiz layout">` dengan kelas
  `flex items-center gap-2 bg-secondary/50 p-1 rounded-xl` yang sama; keempat
  tombol memakai `aria-pressed` yang sudah ada (`assessmentType === 'quick'`/
  `'full'`, `assessmentViewMode === 'cards'`/`'all'`), dan ikon dekoratif
  `Zap`/`FileText`/`LayoutGrid`/`List` diberi `aria-hidden="true"` tanpa
  mengubah kelas `w-4 h-4`. Label, `onClick`, kelas tombol, urutan, blok
  penjelasan, dan ringkasan progres tidak berubah; tanpa `aria-label`
  pengganti nama tombol, `role` tambahan, live region, atau pemindahan fokus;
  UI bahasa Inggris (D2). Test baru `tests/profile-quiz-toggles.test.ts` (8
  penjaga statis) dan entri log `docs/ROADMAP.md`. Tidak ada cek smoke baru
  (perubahan semantik; toggle hanya tampil setelah mode assessment dibuka),
  penjaga jumlah baris smoke tidak berubah. `README.md` dan `Roadmap.md` tidak
  diubah. `npm run ci` hijau penuh (1297/1297 unit = 1289 + 8; smoke lulus
  pada percobaan pertama).

- 2026-11-17: PR #117 — **Prasyarat dan unlocks di panel detail Knowledge
  Graph menjadi daftar bernama** — panel detail konsep di `/graph` sebelumnya
  merender **Prerequisites** dan **Unlocks** sebagai deretan `<span>` di dalam
  `<div className="flex flex-wrap gap-1.5">`, sehingga pembaca layar tidak tahu
  chip-chip itu satu daftar konsep dan tidak bisa melompat per item. Kini
  wadahnya `<ul aria-label="Prerequisites">` / `<ul aria-label="Unlocks">`
  dengan kelas flex-wrap yang sama, dan tiap hasil `map` langsung
  `<li key={i}>` yang membungkus chip `span` dengan kelas visual persis sama
  (biru `bg-blue-500/10 …` untuk prasyarat, hijau `bg-emerald-500/10 …` untuk
  unlocks). Tidak ada `<div>` perantara antara `<ul>` dan `<li>`; tanpa kelas
  marker baru (Tailwind preflight sudah menghapus penanda). Isi (`{prereq}`,
  `{dep}`), urutan, `key={i}`, ikon `GitBranch`/`Clock`, judul `h4` beserta
  hitungan, syarat cabang non-kosong, dan seluruh bagian panel lain tidak
  berubah; tanpa live region/fokus baru dan tanpa perubahan pemilihan
  node/ReactFlow; UI bahasa Inggris (D2). Test baru
  `tests/graph-detail-lists.test.ts` (11 penjaga statis) dan entri log
  `docs/ROADMAP.md`. Tidak ada cek smoke baru karena panel detail baru muncul
  setelah node ReactFlow diklik dan interaksi kanvas flaky di mesin bersama;
  penjaga jumlah baris smoke tidak berubah. `README.md` dan `Roadmap.md` tidak
  diubah. `npm run ci` hijau penuh (1289/1289 unit = 1278 + 11; smoke lulus
  pada percobaan pertama).

- 2026-11-17: PR #116 — **Antrean review di `/gaps` menjadi satu daftar
  bernama** — kartu **Reviews** sebelumnya merender `reviewQueue.queue.map`
  sebagai deretan `<motion.div>` di dalam `<div className="space-y-3 max-h-96
  overflow-y-auto scrollbar-hide">`, sehingga pembaca layar tidak tahu item
  itu satu daftar review dan tidak bisa melompat per item. Kini wadahnya
  `<ul aria-label="Reviews due">` dengan kelas gulir/jarak vertikal yang sama,
  dan tiap item `<motion.li>` dengan `key={i}`,
  `whileHover={{ scale: 1.01 }}`, serta seluruh kelas visual, isi (nama konsep
  via `conceptLabel`, `reviewSummary`, badge `priorityLabel`), urutan, dan
  titik prioritas ber-`aria-hidden` tetap. Tidak ada `<div>` perantara antara
  `<ul>` dan `<li>`; tanpa kelas marker baru (Tailwind preflight sudah
  menghapus penanda). Empty state **Nothing due right now** / **Nothing to
  review yet** tetap di cabangnya sendiri dan bukan item daftar, daftar
  **Snoozed reviews** tetap `<ul aria-label="Snoozed reviews">`, dan banner
  overdue, kartu angka/ringkasan shaky spots, copy, fokus, serta live region
  tidak berubah; UI bahasa Inggris (D2). Test baru
  `tests/gaps-review-list.test.ts` (8 penjaga statis) dan satu cek smoke
  memastikan daftar **Reviews due** terlihat dengan `listitem` > 0; penjaga
  jumlah baris smoke 2134 → 2142. `README.md` dan `Roadmap.md` tidak diubah;
  `docs/ROADMAP.md` mendapat entri log. `npm run ci` hijau (1278/1278 unit =
  1270 + 8; smoke lulus pada percobaan pertama).

- 2026-11-17: PR #115 — **Kartu rekomendasi di `/recommendations` menjadi
  satu daftar berurut bernama** — kartu hasil `zpd.recommendations.map`
  sebelumnya deretan `<motion.div>` langsung di dalam `role="tabpanel"`,
  sehingga pembaca layar tidak tahu kartu-kartu itu satu daftar prioritas dan
  tidak bisa melompat per item. Kini wadahnya
  `<motion.ol aria-label="Recommended concepts">` dengan
  `variants={containerVariants}` dan `className="space-y-4"` (kontrak animasi
  dan jarak vertikal dipindahkan ke daftar), dan tiap kartu `<motion.li>`
  dengan `key={rec.concept.conceptId}`, `variants={itemVariants}`,
  `whileHover={{ y: -2 }}`, serta seluruh kelas visual, isi, urutan, dan badge
  angka `{idx + 1}` tetap. Tidak ada `<div>` perantara antara `<ol>` dan
  `<li>`; tanpa kelas marker baru (Tailwind preflight sudah menghapus penanda),
  empty state **All caught up!** tetap `motion.div` di cabangnya sendiri dan
  bukan item daftar; tablist/tab/tabpanel, `AnimatePresence mode="wait"`,
  copy, dan fokus tidak berubah; UI bahasa Inggris (D2). Test baru
  `tests/recommendations-list.test.ts` (8 penjaga statis) dan satu cek smoke
  memastikan daftar **Recommended concepts** terlihat dengan `listitem` > 0;
  penjaga jumlah baris smoke 2125 → 2134. `README.md` dan `Roadmap.md` tidak
  diubah; `docs/ROADMAP.md` mendapat entri log. `npm run ci` hijau
  (1270/1270 unit = 1262 + 8; smoke lulus pada percobaan pertama).

- 2026-11-17: PR #114 — **Fokus keyboard pindah ke hasil kuis di halaman
  pelajaran** — tombol **Done** di kuis `/learn/$conceptId` menutup
  `ConceptQuiz` dan mengisi `notice`, tetapi elemen yang sedang fokus ikut
  ter-unmount sehingga fokus jatuh ke `<body>`; pengguna keyboard/pembaca layar
  harus men-Tab dari awal halaman. Kini paragraf `role="status"
  aria-live="polite"` yang sudah ada memakai `ref={noticeRef}`,
  `tabIndex={-1}`, dan `focus:outline-none` (teks, peran live region, posisi,
  kelas warna/spasi tetap), dan `finishQuiz` memindahkan fokus dengan
  `requestAnimationFrame(() => noticeRef.current?.focus())` setelah
  `setNotice(...)` + `await load()` selesai — berlaku untuk kuis lulus maupun
  gagal. `cancelQuiz` tetap kembali ke tombol **Take the quick quiz** lewat
  `quizButtonRef`; tidak ada fokus paksa saat mount, ganti learner/konsep,
  reload `load()`, atau laporan diri. `ConceptQuiz`, alur jawab/`Done`,
  `quizResultNotice`, dan copy tidak berubah; UI bahasa Inggris (D2). Test baru
  `tests/lesson-focus.test.ts` (6 penjaga statis: ref, kontrak paragraf status,
  urutan `setNotice` → `await load()` → `requestAnimationFrame` → `focus`,
  `cancelQuiz`/`selfReport`/`load`, tanpa `createServerFn`/RPC/migrasi, dan cek
  smoke setelah `closeQuiz(lesson)`). Satu cek smoke baru memastikan
  `document.activeElement` adalah `<p role="status">` berisi `passed`, bukan
  `<body>`; penjaga baris smoke 2114 → 2125. `README.md` dan `Roadmap.md` tidak
  diubah; `docs/ROADMAP.md` mendapat entri log. `npm run ci` hijau
  (1262/1262 unit = 1256 + 6; smoke baru lulus pada percobaan pertama).

- 2026-11-17: PR #112 — **Tab halaman Recommendations bisa dipakai pembaca
  layar dan keyboard** — tiga tombol tab (**Recommendations**,
  **Ready / not yet**, **Learning Path**) di `/recommendations` sebelumnya
  `<motion.button>` biasa tanpa peran tab WAI-ARIA, sehingga pembaca layar
  tidak tahu tab aktif, panel tak punya nama, dan tombol panah tidak berfungsi.
  Kini wadah `role="tablist"` + `aria-label="Recommendation views"`; tiap
  tombol `role="tab"` dengan `id="rec-tab-<id>"`, `aria-selected`, `tabIndex`
  roving, dan `aria-controls` hanya pada tab aktif; tiap panel `role="tabpanel"`,
  `id="rec-panel-<id>"`, `aria-labelledby`, `tabIndex={0}`. Helper murni
  `nextTabIndex` di `src/lib/tabs.ts` memetakan panah kiri/kanan dengan
  pembungkusan, Home/End, dan `null` untuk kunci lain; `count`/`current` rusak
  dinormalkan tanpa melempar. `onKeyDown` memindahkan seleksi dan fokus lewat
  array ref. Test baru `tests/recommendations-tabs.test.ts` (16). Smoke tidak
  menambah baris (penjaga 2114 tetap) tetapi dua pemilih tab disesuaikan dari
  role `button` ke `tab`, dan `process.exit` diganti `process.exitCode` agar
  daftar hasil smoke tidak terpotong saat gagal. `README.md` dan `Roadmap.md`
  tidak diubah; `docs/ROADMAP.md` mendapat entri log. `npm run ci` hijau
  (1240/1240 unit; dua percobaan awal gagal di smoke karena pemilih tab lama,
  lalu hijau penuh setelah pemilih diperbaiki).

- 2026-11-17: PR #111 — **Ringkasan hasil analisis di kartu "Shaky spots"
  halaman Gap Analysis** — kartu **Shaky spots** (`/gaps`) sebelumnya langsung
  menampilkan daftar panjang (atau empty state) tanpa satu kalimat yang
  merangkum keempat kartu angka di atasnya, jadi pembaca layar tidak pernah
  mendengar gambaran besarnya. Kini tepat di bawah judul **Shaky spots** dan di
  atas daftar/empty state ada satu baris tenang
  `text-sm text-muted-foreground mb-3`: `1 shaky spot: 1 fading`,
  `4 shaky spots: 1 not started, 2 still learning and 1 fading`, atau
  `3 shaky spots: 3 mix-ups`. Helper murni baru `gapSummaryLine` di
  `src/lib/gaps.ts` hanya menjumlahkan nilai yang diberikan (aturan hitung
  kartu tidak disalin), menyebut hanya jenis > 0 dengan urutan tetap
  missing → partial → forgotten → misconceptions, memakai `countLabel` untuk
  bentuk tunggal/jamak (`mix-up`/`mix-ups`; `not started`/`still learning`/
  `fading` tetap), memakai ` and ` sebelum bagian terakhir, mengembalikan
  `null` saat total 0 (empty state `No shaky spots right now — nice work!`
  tetap satu-satunya pesan), dan memperlakukan nilai negatif/NaN/non-finite/
  absen maupun masukan bukan objek sebagai 0 tanpa melempar. Halaman memanggil
  helper sekali dari panjang keempat daftar yang sama dengan kartu angka,
  tanpa tombol/animasi/live region/fokus paksa/panggilan baca-tulis tambahan,
  bahasa Inggris (D2). Test `tests/gaps.test.ts` 11 → 17: total 0/absen/bukan
  objek, tunggal/jamak, tiap jenis sendirian, kombinasi dua/tiga/empat jenis
  dengan urutan dan ` and `, `mix-up`/`mix-ups`, nilai negatif/NaN/Infinity,
  serta penjaga statis helper dipanggil tepat sekali dan dirender di bawah
  heading serta di atas empty state tanpa `createServerFn`/`graphCall`/RPC/
  migrasi. Smoke tidak berubah (penjaga 2114 tetap). `README.md` dan
  `Roadmap.md` tidak diubah (tidak ada klaim berubah, milestone tidak ditandai
  selesai); `docs/ROADMAP.md` mendapat entri log. `npm run ci` hijau
  (1240/1240 unit = 1234 + 6; dua percobaan sebelumnya gagal hanya di cek smoke
  berbeda — Sign out ter-detach dan skip-link `in main false` — saat mesin
  bersama berload ~8–10 di 4 core, lalu diulang utuh tanpa perubahan kode dan
  hijau penuh).

- 2026-11-16: PR #110 — **Ringkasan jumlah hasil pencarian di panel Today** —
  kotak **Find a concept** (PR #107) memotong daftar di 8 hasil tanpa memberi
  tahu berapa yang cocok, dan daftar `<ul>` bukan live region sehingga pembaca
  layar tidak mendengar apa pun saat pengguna mengetik. Kini tepat di bawah
  kotak ketik dan di atas daftar hasil ada satu baris tenang `role="status"`
  ber-`aria-live="polite"`: `1 concept found`, `<n> concepts found`, atau
  `<limit> of <total> concepts shown` bila daftar dipangkas. Helper murni baru
  `conceptSearchSummary` di `src/lib/concept-search.ts` mengembalikan `null`
  untuk query kosong/terlalu pendek (daftar memang tersembunyi), nol kecocokan
  (baris `No concepts match “…”` lama tetap satu-satunya pesan), dan limit
  ≤ 0/NaN/Infinity (tidak ada yang ditampilkan); id ganda dihitung sekali.
  Aturan pencocokan tidak disalin: isi `conceptSearchResults` diekstrak ke
  helper internal `rankedMatches` yang dipakai bersama lewat `resultLimit`
  yang sama, jadi hitungan yang diumumkan tidak bisa berbeda dari daftar, dan
  seluruh 16 test pencarian lama tetap lulus tanpa diubah. Panel memakai data
  yang sudah dimuat (tanpa panggilan baca/tulis, tombol, animasi, atau fokus
  paksa), baris ikut hilang saat learner berganti lewat key `search-<id>` yang
  sudah ada, dan bahasa Inggris (D2). Test `tests/concept-search.test.ts`
  16 → 25: delapan cabang helper (diam untuk kosong/pendek/nol/limit
  0/negatif/NaN/Infinity, tunggal, jamak, terpotong bawaan dan limit khusus,
  duplikat) + satu test kesepakatan ringkasan-vs-daftar untuk enam kombinasi
  query/limit + penjaga statis baris status (`role="status"`,
  `aria-live="polite"`, helper dipanggil, posisi di antara input dan daftar)
  tanpa `createServerFn`/`graphCall`/RPC/migrasi. Smoke tidak berubah
  (penjaga 2114 tetap). `docs/ROADMAP.md` mendapat entri log; `README.md` dan
  `Roadmap.md` tidak diubah (tidak ada klaim berubah, milestone tidak ditandai
  selesai). Catatan proses: sesi ini mengambil alih commit `f1f7297` yang
  sudah didorong dari worktree sesi lain tetapi belum punya PR/pembaruan
  state, memverifikasi ulang kode dan test terhadap spek, menambah pembaruan
  state ini, lalu menjalankan `npm run ci` utuh pada percobaan pertama tanpa
  perubahan kode dan hijau (typecheck, lint 0/0, 1234/1234 unit, build,
  anggaran bundel, CSP produksi, smoke Playwright + PGlite).

- 2026-11-16: PR #109 — **Tautan "Continue your last lesson" di panel Today** —
  pelajar yang sempat membuka atau mengerjakan sebuah konsep kini bisa langsung
  melanjutkannya tanpa mencari di **Learn next** atau kotak pencarian: di bawah
  bar progres/pencarian dan di atas kartu **Your week**, satu baris tenang
  berjudul **Continue your last lesson** menautkan ke `/learn/$conceptId`
  berisi nama konsep dari `conceptNameMap(current.concepts)`. Helper murni baru
  `src/lib/evidence/last-lesson.ts` (`lastLesson`) membaca log
  `learning_events`: hanya kind `study`/`quiz`/`practice`/`lesson` (`review`/
  `snooze`/`unsnooze`/`tutor` diabaikan), hanya source `app` (`/japanese`
  punya halaman sendiri), `conceptId` kosong dan `createdAt` rusak dilewati
  tanpa melempar, urutan array tidak berpengaruh, waktu seri dimenangkan
  kemunculan terakhir, dan `at` = ISO asli event. `getWeekRecap` diperluas —
  bukan server function baru — dengan `lastLesson` dari satu kali `listEvents`
  dan satu `now`; `authMiddleware`, validator
  `z.object({ learnerId: lookupId })`, dan isolasi akun tidak berubah. Baris
  disembunyikan bila konsepnya sudah tidak ada di akun, memakai `Link` biasa,
  target sentuh 40 px, focus ring yang sama, tanpa tombol/animasi/fokus
  paksa/panggilan tambahan. Test baru `tests/last-lesson.test.ts` (11) +
  penyesuaian penjaga `tests/week-recap.test.ts` dan `tests/streak.test.ts`.
  Smoke tidak berubah (penjaga 2114 tetap). `README.md` menyebut tautan ke
  pelajaran terakhir di baris fitur Today; `Roadmap.md` tidak diubah dan tidak
  ada milestone yang ditandai selesai. `npm run ci` hijau (1225/1225 unit =
  1214 + 11; percobaan pertama gagal hanya di smoke saat mesin berload ±8 dari
  sesi lain, lalu diulang utuh tanpa perubahan kode dan hijau).

- 2026-11-16: PR #108 — **Kartu penguasaan per subjek di My Profile** — pelajar
  melihat subjek mana yang sudah dikuasai dan mana yang masih perlu dikerjakan
  tanpa membuka Knowledge Graph atau Gap Analysis: di kartu **My learning**,
  setelah bar progres keseluruhan, satu baris per subjek memuat nama subjek,
  teks `"<mastered> of <total> concepts mastered"` (bentuk tunggal/jamak) dan
  bar `role="progressbar"` ber-`aria-label` subjek + `aria-valuenow`. Helper
  murni baru `src/lib/subject-mastery.ts` (`subjectMastery`) menghitung
  `{ domain, label, total, mastered, percent }` dari konsep + knowledge state
  yang **sudah** dimuat `load()` (tanpa panggilan baca/tulis, server function,
  RPC, atau migrasi baru): penguasaan dan persen memakai ulang
  `summarizeProgress` (`percentMastered`, ambang 80, clamp, NaN → 0), label
  `domainLabel`; hanya subjek fokus yang punya konsep, atau semua subjek
  ber-konsep bila tanpa fokus, urut pilihan pelajar; subjek tanpa konsep tidak
  ditampilkan, state tanpa konsep diabaikan, konsep tanpa state belum dikuasai,
  dan state learner lain dibuang lewat `learnerId` yang dioper panel. Kartu
  hanya tampil bila minimal satu baris, bahasa Inggris (D2), tanpa tautan/
  tombol/animasi. Test baru `tests/subject-mastery.test.ts` (17). Catatan
  proses: dua asersi test pertama mengira domain lain tetap ditampilkan saat
  fokus diisi; spek menetapkan hanya domain fokus, jadi helper diperbaiki
  (bukan test dilonggarkan) sebelum gerbang. `README.md` menyebut penguasaan
  per subjek di baris Progress Tracking; `Roadmap.md` tidak diubah dan tidak
  ada milestone yang ditandai selesai. `npm run ci` hijau (1214/1214 unit,
  smoke penjaga 2114 tetap).

- 2026-11-16: PR #107 — **Pencarian konsep di panel Today** — pelajar yang
  sudah tahu nama konsep kini punya kotak **Find a concept** di bawah bar
  progres Today; mencari seluruh konsep akun (nama, deskripsi, id, domain, tag,
  case-insensitive) dan tiap hasil adalah tautan biasa ke `/learn/$conceptId`
  berisi nama + label domain. Helper murni baru `src/lib/concept-search.ts`:
  `searchQuery` memangkas/merapatkan spasi dan mengosongkan query < 2 karakter;
  `conceptSearchResults` membuang id ganda, mengurutkan nama persis → nama
  mengandung → bidang lain menurut nama, dan memotong hasil (bawaan 8). Data
  memakai `allConcepts` yang sudah dimuat `load()` (tanpa RPC/server
  function/migrasi/dependensi baru), kotak hanya tampil bila akun punya konsep,
  query di-reset saat learner berganti, dan tanpa hasil muncul satu baris tenang
  `No concepts match “<query>”.` Test baru `tests/concept-search.test.ts` (16:
  pembersihan query/unicode/nilai hilang, kelima bidang, urutan, duplikat,
  limit, serta penjaga statis wiring tanpa `createServerFn`/`graphCall`/
  `db.searchConcepts`/RPC/migrasi). Catatan proses: percobaan pertama `npm run ci`
  gagal di smoke karena `key={current.learnerId}` pada komponen pencarian
  bertabrakan dengan key opsi pemilih learner (`me-sari-*`); React 19
  memperingatkan duplikat key dan editor subjek tertinggal terbuka. Key diberi
  namespace `search-<id>` lalu `npm run ci` utuh hijau (1197 unit, smoke
  2114 baris penjaga; percobaan kedua sempat flaky karena beban mesin dari sesi
  lain, bukan kode). `README.md` menyebut pencarian di baris fitur Today;
  `Roadmap.md` tidak diubah dan tidak ada milestone yang ditandai selesai.

- 2026-11-16: PR #106 — **MCP resources baca-saja (lanjutan M4)** — server
  `POST /api/mcp` kini juga melayani `resources/list` dan `resources/read`.
  `initialize` mengiklankan `capabilities: { tools: {}, resources: {} }`;
  versi protokol, `serverInfo`, `ping`, `tools/list`, `tools/call`, notifikasi
  202, dan galat lama tidak berubah. Dua bentuk URI:
  `learngraph://learner/<encodeURIComponent(id)>` (nama, mastery per konsep +
  persen + sumber lewat `masterySourceLabel`, review yang jatuh tempo saat ini
  dengan tanggal; "No concepts yet." / "Nothing due right now." dengan kalimat
  tenang) dan `learngraph://concept/<encodeURIComponent(id)>` (nama, domain,
  deskripsi, estimasi `timeEstimates`, prasyarat langsung dengan nama).
  `resources/list` learner dulu lalu konsep, masing-masing urut nama
  deterministik; params URI kosong/bukan string/>512 → `-32602`; URI tak
  dikenal atau milik akun lain → `-32002` "Resource not found: <uri>". Helper
  murni baru `src/lib/mcp/resources.ts` (encode/decode + Markdown, memakai
  ulang `conceptNameMap`/`conceptLabel`/`humanizeConceptId`) dan
  `src/lib/mcp/tools.ts` membaca hanya lewat `graphForOwner(owner)` API key
  (`listLearnerProfiles`, `listConcepts`, `getLearnerKnowledgeStates`,
  `getPrerequisites`) — tanpa dependensi, tabel/kolom, RPC, server function,
  atau migrasi baru; route tidak menambah autentikasi/rate limit. Test baru
  `tests/mcp-resources.test.ts` (24, murni) + 5 test PGlite di
  `tests/mcp-api.test.ts` (resources/list hanya akun sendiri, mastery & review
  jatuh tempo, prasyarat bernama, URI akun lain → `-32002`, jumlah baris graph
  tetap); smoke tidak berubah (penjaga 2114 tetap). `README.md` dan kalimat
  klaim M4 di `Roadmap.md` menyebut resources; milestone M4 tetap tidak
  ditandai selesai. Unit 1181/1181. `npm run ci` hijau (percobaan kedua setelah
  smoke flaky karena load mesin ~7 di 4 core; tanpa perubahan kode).

- 2026-11-16: PR #105 — **Streak harian di kartu "Your week"** — pelajar melihat
  berapa hari berturut-turut mereka belajar ("5-day streak"), dengan ajakan
  "study today to keep it going" bila hari ini belum ada aktivitas tetapi streak
  masih hidup dari kemarin. Helper murni `src/lib/evidence/streak.ts`
  (`learningStreak`/`streakLine`): hari kalender UTC, hanya kind
  `quiz`/`study`/`review`/`practice`/`lesson` (`snooze`/`unsnooze`/`tutor`
  diabaikan), timestamp rusak/masa depan diabaikan tanpa melempar, satu hari
  dihitung sekali walau banyak event dan urutan array tidak berpengaruh, hari
  ini jadi jangkar atau kemarin dengan `activeToday: false`, celah sehari penuh
  memutus streak. `getWeekRecap` diperluas (bukan fungsi baru) dengan satu kali
  `listEvents` dan satu `now` untuk `weekRecap` + `learningStreak`; validator
  `{ learnerId: lookupId }` dan isolasi akun tidak berubah. Kartu "Your week"
  merender baris streak setelah baris ringkas, teks biasa tanpa tombol, copy
  kosong lama tetap bila belum ada streak/aktivitas. Test baru
  `tests/streak.test.ts` (18) + penyesuaian penjaga `tests/week-recap.test.ts`;
  smoke tidak berubah (penjaga 2114 tetap). `docs/ROADMAP.md` mendapat entri
  log; `Roadmap.md` tidak diubah (tidak ada klaim berubah, milestone tidak
  ditandai selesai). `npm run ci` hijau.

- 2026-11-16: PR #104 — **Kartu rekap mingguan "Your week" di Today** — pelajar
  melihat aktivitas tujuh hari terakhir tanpa membuka halaman lain: review
  selesai, kuis lulus, dan konsep baru. Helper murni
  `src/lib/evidence/week.ts` (`weekRecap`/`weekRecapLines`): jendela inklusif
  dua sisi (tepat 7 hari lalu sampai sekarang), timestamp rusak/masa depan
  diabaikan tanpa melempar, konsep baru hanya bila event pertamanya (kind apa
  pun) jatuh di jendela, urutan array tidak berpengaruh, bentuk tunggal/jamak
  benar dan baris nol tidak ditampilkan. Server function `getWeekRecap` (pola
  `getLearningStats`: `authMiddleware`, validator `{ learnerId: lookupId }`,
  `listEvents` terikat `context.userId`) — tanpa RPC/tabel/migrasi baru. Kartu
  `<section aria-labelledby>` **Your week** di bawah bar progres Today, dimuat
  dalam `Promise.all` milik `load()` sehingga berganti bersama learner, dengan
  copy tenang saat belum ada aktivitas. Test baru `tests/week-recap.test.ts`
  (18) + satu cek smoke (setelah kuis lulus, "Your week" memuat baris
  "quizzes passed"); penjaga jumlah baris smoke 2103 → 2114.
  `docs/ROADMAP.md` mendapat entri log; `Roadmap.md` tidak diubah (tidak ada
  klaim berubah, milestone tidak ditandai selesai). `npm run ci` hijau.

- 2026-11-16: PR #103 — **Server MCP baca-saja (M4)** — `POST /api/mcp`
  berbicara JSON-RPC 2.0 "Streamable HTTP" sebagai `application/json`
  (`cache-control: no-store`, `GET` 405 + `Allow: POST`, tanpa SSE) memakai
  API key `lg_…` yang sudah ada lewat `authenticateApiRequest`; protokol murni
  `src/lib/mcp/protocol.ts` (initialize `2025-06-18`/`2025-03-26`, versi asing
  → terbaru, ping, notifikasi 202 tanpa body, `tools/list` dua alat, dan
  `tools/call` dengan galat `-32602`/`-32601`/`-32700`/`-32600`; batch
  ditolak). `src/lib/mcp/tools.ts` memakai ulang `learnersPayload`/
  `contextPayload` yang diekstrak dari `src/lib/api/v1.ts` sehingga REST tak
  berubah dan MCP tak bisa berbeda; galat domain (learner/konsep tidak ada)
  menjadi hasil `isError` alat. Route `src/routes/api/mcp.ts` + dynamic import
  server-only; tanpa dependensi/migrasi/RPC. Test baru: `tests/mcp-protocol.test.ts`
  (19, cabang protokol + penjaga wiring) dan `tests/mcp-api.test.ts` (9, handler
  di PGlite: 401 tanpa key, key dicabut seketika, isolasi akun, bentuk REST,
  brief default, 405, tabel tak berubah); smoke menambah cek MCP memakai key
  yang sama (initialize + serverInfo.name, tools/list, tools/call brief,
  tanpa key 401, GET 405). Penjaga jumlah baris smoke di
  `tests/skip-link.test.ts` diperbarui 2057 → 2103 karena smoke bertambah.
  `Roadmap.md` (bagian "Server MCP" selesai; milestone M4 tetap tidak
  ditandai selesai), `README.md`, dan entri log `docs/ROADMAP.md` diperbarui.
  `npm run ci` hijau.

- 2026-11-16: **Kebijakan loop diperbaiki** — PR **test-only dilarang**;
  sesi #55–#101 sempat menghasilkan puluhan PR "test: kunci …" setelah
  backlog roadmap habis. Tes kini hanya menyertai fitur/perbaikan, dan
  "Tugas berikutnya" wajib fitur/roadmap/poles. Tugas pertama dengan
  kebijakan baru: server MCP (M4).


- 2026-11-16: PR #101 — test: test unit langsung komponen
  `src/components/SkipLink.tsx` — tautan "Skip to content" (WCAG 2.4.1) anak
  pertama `<body>` (7 test di `tests/skip-link.test.ts`, node:test murni,
  transpilasi `.tsx` in-memory + `react-dom/server`
  `createElement`/`renderToStaticMarkup`, `document` tiruan per test yang
  dipulihkan di `finally`; tanpa PGlite/Playwright), komponen tidak diubah.
  Dikunci: markup tepat satu `<a href="#main">` berteks persis `Skip to
  content`, kelas `sr-only` lalu `focus:not-sr-only` (+ `focus:fixed`), tanpa
  `target`/`role`/`tabIndex`/`onKeyDown` di markup maupun props elemen (props
  hanya `href`/`onClick`/`className`/`children`). Handler diambil dari
  `SkipLink().props.onClick` (React 19 mengembalikan elemen): tanpa `<main>` →
  hanya `querySelector('main')`, `preventDefault` 0, tanpa
  `setAttribute`/`focus`/`scrollIntoView`; `<main>` tanpa `tabindex` → urutan
  persis `querySelector` → `preventDefault` → `hasAttribute('tabindex')` →
  `setAttribute('tabindex','-1')` → `focus()` →
  `scrollIntoView({ block: 'start' })`; `<main>` ber-`tabindex` `'0'`/`'-1'` →
  `setAttribute` tidak dipanggil, tetap fokus+scroll. Penjaga statis:
  `SkipLink.tsx` tepat satu impor `import type { MouseEvent } from 'react';`,
  tanpa `require`/hook/router/DB/`fetch`/`localStorage`, satu `<a>`, modul
  mengekspor tepat `['SkipLink']`; `__root.tsx` mengimpor dari
  `@/components/SkipLink` dan baris tepat setelah `<body …>` adalah
  `<SkipLink />` (sekali) sebelum `ThemeProvider`/`RouteAnnouncer`, jumlah
  baris 90; `scripts/smoke.mjs` tetap memuat cek
  `a11y: "Skip to content" is the first Tab stop`, `Tab`/`Enter`, jumlah baris
  2057 (dihitung `trimEnd().split('\n')` karena berkas ber-trailing newline).
  Catatan proses: `node_modules` belum ada di worktree sehingga `npm ci` lebih
  dulu; probe render + tiga cabang handler lebih dulu mengonfirmasi markup,
  urutan panggilan, dan props berisi tepat empat kunci; satu run `node --test`
  langsung hijau setelah menghapus impor `pathToFileURL` yang tak terpakai
  (lint 0/0); test menjadi 7 (spesifikasi menulis ± 4–6) dan itu yang dicatat;
  typecheck/lint 0/0 dan `npm run ci` utuh hijau pada percobaan pertama
  (load ± 2), termasuk cek smoke `a11y: "Skip to content" is the first Tab
  stop … in main true`. Tanpa perubahan aplikasi/perilaku/skema/RPC/migrasi/
  dependensi dan tanpa perubahan `docs/ROADMAP.md` (tidak ada baris backlog
  tersentuh). `npm run ci` hijau (install, typecheck, lint 0/0, 1085/1085 unit
  = 1078 + 7, build, anggaran bundel, CSP build produksi, smoke Playwright
  dan PGlite).

- 2026-11-16: PR #100 — test: test unit langsung komponen
  `src/components/SubjectChoices.tsx` (7 test di `tests/subject-choices.test.ts`,
  node:test murni, `react-dom/server` `createElement`/`renderToStaticMarkup`,
  tanpa PGlite/DOM/Playwright), komponen tidak diubah. Catatan pendekatan: Node
  tidak bisa mengimpor `.tsx` langsung (type stripping tidak mengubah JSX), jadi
  test mentranspilasi berkas asli in-memory dengan `ts.transpileModule`
  (`jsx: ReactJSX`) lalu mengimpornya dari `data:` URL; alias
  `@/lib/onboarding` dan `react/jsx-runtime` ditulis ulang ke URL absolut
  (`import.meta.resolve`/`pathToFileURL`). Dikunci: tiga domain (`mathematics`
  6, `computer-science` 1, `art_history` 0) + `chosen=['computer-science']` →
  tepat tiga `<label>` berurutan, teks persis `Mathematics6 concepts`/
  `Computer science1 concept`/`Art history0 concepts`, hitungan `6 concepts`/
  `1 concept`/`0 concepts`, `type="checkbox"` di semua, dan `checked=""` hanya
  di `computer-science` — **catatan probe: React SSR menulis atribut boolean
  sebagai `checked=""`/`disabled=""`, bukan `checked`/`disabled` telanjang
  seperti tertulis di spesifikasi tugas**. `chosen` kosong/asing → tanpa
  `checked`; duplikat `['alpha','alpha','not-a-domain']` tidak menggandakan
  label; `domains: []` → markup persis
  `<div class="mt-2 flex flex-wrap gap-2"></div>` tanpa `<label>`; `disabled`
  absen/`false` → tanpa atribut, `true` → `disabled=""` di semua checkbox;
  `onToggle` tidak dipanggil saat render server. Escaping: domain `<b>x</b>`
  → `&lt;b&gt;x&lt;/b&gt;` (tanpa `<b>` mentah), `a&b` → `A&amp;b`,
  `computer-science` → `Computer science`, `art_history` → `Art history`,
  `_music_` → `Music`, domain kosong → teks label kosong + hitungan. Penjaga
  statis: `SubjectChoices.tsx` tepat satu impor
  `import { domainLabel } from '@/lib/onboarding';`, tanpa `require`, tanpa
  hook/router/DB/`fetch`, tepat satu `<input`/`<label>`, dan
  `onChange={(e) => onToggle(domain, e.target.checked)}`; `Onboarding.tsx` dan
  `FocusEditor.tsx` sama-sama mengimpor `SubjectChoices` dari
  `@/components/SubjectChoices` (Onboarding tanpa `disabled`, FocusEditor
  `disabled={saving}`); anchor lima judul lama tetap utuh + jumlah baris
  `tests/onboarding.test.ts` **280** (spesifikasi menulis 281; berkas
  ber-trailing newline sehingga `trimEnd().split('\n').length` = 280 —
  catatan probe). Catatan proses: `node_modules` belum ada di worktree sehingga
  `npm ci` lebih dulu; probe render lebih dulu mengonfirmasi seluruh markup
  termasuk `checked=""`/`disabled=""`; satu run `node --test` langsung hijau;
  typecheck/lint 0/0 dan `npm run ci` utuh hijau pada percobaan pertama.
  Tanpa perubahan aplikasi/perilaku/skema/RPC/migrasi/dependensi dan tanpa
  perubahan `docs/ROADMAP.md` (tidak ada baris backlog tersentuh, pola
  PR #77/#78/#90/#92–#99). `npm run ci` hijau (install, typecheck, lint 0/0,
  1085/1085 unit = 1078 + 7, build, anggaran bundel, CSP build produksi,
  smoke Playwright + PGlite).

- 2026-11-16: PR #99 — test: test unit langsung penjaga CSP
  `src/lib/zod-config.ts` (6 test di `tests/zod-config.test.ts`, node:test
  murni, modul **tidak diubah**). Zod meng-cache `jitless` per proses, jadi
  tiap keadaan `window` diperiksa di proses anak baru lewat
  `spawnSync(process.execPath, ['--experimental-strip-types',
  '--input-type=module', '-e', skrip])`; skrip mengimpor
  `pathToFileURL(<src/lib/zod-config.ts>).href`, mencetak JSON
  `{ before, after }` dari `z.core.globalConfig.jitless`, dan test memastikan
  exit code 0 + stderr kosong (`JSON.stringify` membuang `undefined`, jadi
  kunci yang hilang berarti "belum dikonfigurasi"). Dikunci: `before` selalu
  `undefined` di tiap proses (Zod segar); tanpa `window` dan setelah
  `delete globalThis.window` → `after` tetap `undefined` (`z.config` tidak
  dipanggil); `window = {}` → `after === true`; rough edge `null`, `0`, dan
  `''` juga `true` karena guard memakai `typeof`, bukan truthiness. Penjaga
  statis: modul hanya `import { z } from 'zod';`, tanpa `require`, tanpa
  ekspor, dan guard persis
  `if (typeof window !== 'undefined') z.config({ jitless: true });` dengan
  tepat satu panggilan `z.config`; `src/router.tsx` menaruh komentar
  `// First: configures Zod before any route module builds a schema.` lalu
  `import './lib/zod-config';` sebagai dua baris pertama/impor pertama,
  sebelum `@tanstack/react-router` dan `routeTree.gen`; scan rekursif `src/`
  membuktikan hanya router yang mengimpor `zod-config` (pencocokan string
  ber-kutip). Anchor tetap utuh: `tests/security-headers.test.ts` 136 baris
  dan `tests/check-csp.test.ts` 263 baris (dihitung dengan
  `split('\n').length`). Catatan proses: `node_modules` belum ada di worktree
  sehingga `npm ci` dijalankan lebih dulu; probe lima keadaan `window` sebelum
  menulis test mengonfirmasi seluruh cabang dan rough edge, termasuk bahwa
  `null`/`0`/`''` memang mengaktifkan `jitless`. Tanpa perubahan
  aplikasi/perilaku/skema/RPC/migrasi/dependensi dan tanpa perubahan
  `docs/ROADMAP.md` (tidak ada baris backlog tersentuh, pola PR
  #77/#78/#90/#92–#98). `npm run ci` hijau (install, typecheck, lint 0/0,
  1078/1078 unit = 1072 + 6, build, anggaran bundel, CSP build produksi,
  smoke Playwright + PGlite).

- 2026-11-16: PR #98 — test: test unit langsung nilai default context data &
  tema `src/lib/db-context.ts` + `src/lib/theme-context.ts` (7 test di
  `tests/context-defaults-direct.test.ts`, node:test murni, impor modul
  langsung + `react-dom/server` `createElement`/`useContext`/
  `renderToStaticMarkup` tanpa PGlite/DOM), kedua modul tidak diubah;
  `tests/provider-split.test.ts` (5 `it`, **71** baris — catatan probe:
  spesifikasi tugas menulis 68, berkas aktual 71) dan
  `tests/theme-script.test.ts` (12 `it`) tetap utuh (dirujuk penjaga statis,
  asersinya tidak dipindah). Dikunci: `DBContext` default tepat empat kunci
  `db`/`isLoading`/`error`/`isReady` dengan `null`/`true`/`null`/`false`
  (`db` dan `error` persis `null`, bukan `Error`); `ThemeContext` default
  tepat tiga kunci, `theme 'system'`, `resolvedTheme 'light'`, dan `setTheme`
  fungsi no-op yang mengembalikan `undefined` untuk `'dark'`/`'light'`/
  `'system'` tanpa melempar (dibaca langsung, bukan lewat JSON). Provider
  menimpa default tanpa salinan: `DBContext.Provider` mengembalikan objek
  custom yang identik (termasuk `db` tiruan, `isLoading` false, `error`
  `Error` asli, `isReady` true); `ThemeContext.Provider` mengembalikan objek
  custom identik dan `setTheme`-nya memanggil tiruan (`'light'` tercatat),
  bukan no-op default. Penjaga statis: `db-context.ts` hanya dua impor
  (`createContext` dari `react` + `import type RemoteGraphDB` dari
  `@/lib/graph/methods`), tanpa `require`, mengekspor `DBContextValue` lalu
  `DBContext`; `theme-context.ts` hanya impor `createContext`, mengekspor
  `Theme`/`ThemeContextValue`/`ThemeContext` berurutan; `DBProvider.tsx`
  mengimpor `DBContext`+tipe dari `@/lib/db-context` dan mengoper
  `{ db, isLoading, error, isReady: !!db && !isLoading }` lewat
  `<DBContext.Provider value={value}>`; `ThemeProvider.tsx` mengoper
  `{ theme, resolvedTheme, setTheme }`; `theme.tsx` masih
  `return useContext(ThemeContext)`; `DBContext.tsx` mengimpor `DBContext`
  dari `@/lib/db-context` dan tetap mengekspor kedelapan hook. Catatan
  proses: `node_modules` belum ada di worktree sehingga `npm ci` lebih dulu;
  probe React server lebih dulu mengonfirmasi seluruh nilai/cabang; satu
  asersi draf `value.error instanceof Error` ditolak typecheck
  (TS2358 karena `Error | null`) dan dihapus — `error === null` sudah
  membuktikan bukan `Error`; satu regex draf `isReady,` salah karena kode
  aktual `isReady: !!db && !isLoading,` dan diperbaiki sebelum gerbang;
  prettier merapikan format. Tanpa perubahan aplikasi/perilaku/skema/RPC/
  migrasi/dependensi dan tanpa perubahan `docs/ROADMAP.md` (tidak ada baris
  backlog tersentuh, pola PR #77/#78/#90/#92–#97). `npm run ci` hijau
  (install, typecheck, lint 0/0, 1072/1072 unit = 1065 + 7, build, anggaran
  bundel, CSP build produksi, smoke Playwright + PGlite).

- 2026-11-16: PR #97 — test: test unit langsung judul tab & label halaman
  `src/lib/page-titles.ts` — `APP_NAME`/`PAGE_LABELS`/`pageTitle`/
  `titleForPath`/`pageHead`/`NOT_FOUND_TITLE`/`ERROR_TITLE`/
  `navigationAnnouncement` (18 test di `tests/page-titles-direct.test.ts`,
  node:test murni, impor modul langsung, tanpa PGlite/DOM), modul tidak
  diubah; `tests/page-titles.test.ts` (86 baris, tujuh `it`) tetap utuh
  (judul-judul lamanya dirujuk penjaga statis, bukan dipindah). Dikunci:
  `APP_NAME`/`NOT_FOUND_TITLE`/`ERROR_TITLE` persis; `PAGE_LABELS` **frozen**
  dengan **26** kunci berurutan — **catatan probe: spesifikasi tugas menulis
  25, kode aktual 26** (21 href menu + lima halaman ekstra; 21+5=26) —
  salinan eksplisit peta kunci → label termasuk `/japanese` → `Bahasa
  Jepang`, `/learn/$conceptId` → `Lesson`, `/` → `Dashboard`; tiap label
  non-kosong, ter-trim, dan sama dengan label menu untuk href menu.
  `pageTitle` — `'<label> · LearnGraph'`; kosong/`null`/`undefined`/
  whitespace → `LearnGraph`; `\s+` di-collapse dan di-trim (tab, NBSP
  `\u00a0`, baris baru, campuran); rough edge karakter kontrol
  non-whitespace tidak dibuang (`'A\u0000B\u202eC'` utuh; label
  `'\u0000'` tetap menghasilkan `'\u0000 · LearnGraph'`).
  `titleForPath` — href menu dikenal; trailing slash dibuang bila panjang
  > 1 (`/gaps/`, `/gaps//`, `/gaps///`, `/about//`, `/sign-in/`; rough edge
  `//`/`///` → path `''` → `LearnGraph`); query/hash/case/kurang garis
  miring (`/gaps?x=1`, `/gaps#x`, `/GAPS`, `gaps`, `/gaps /`) →
  `LearnGraph`; rute parameter satu segmen (`/learn/fractions`, literal
  `/learn/$conceptId`, `/learn/x/`, `/learn/$conceptId/` → `Lesson ·
  LearnGraph`; `/learn/`, `/learn//`, `/learn/a/b` → `LearnGraph`); kunci
  prototipe aman (`toString`, `/toString`, `/hasOwnProperty`, `__proto__`,
  `/__proto__`, `constructor`, `/constructor`, `''`) → `LearnGraph`.
  `pageHead('/gaps')`/`pageHead('/profile')` persis bentuk `{ meta: [{ title
  }] }`, path tak dikenal → `LearnGraph`; `navigationAnnouncement`
  delegasi ke `titleForPath` (`/gaps`, `/`, `/learn/x`, `/nope`). Penjaga
  statis: `page-titles.ts` tepat satu impor
  `import { NAV_SECTIONS } from './navigation.ts';`, tanpa `require`, dan
  mengekspor tepat delapan nama berurutan; `RouteAnnouncer.tsx` mengimpor
  `navigationAnnouncement` dari `@/lib/page-titles` dan memanggil
  `navigationAnnouncement(pathname)`; `src/routes/gaps.tsx` memakai
  `head: () => pageHead('/gaps')`; anchor tujuh judul `it` + jumlah baris
  86 `tests/page-titles.test.ts` tetap utuh. Catatan proses: `node_modules`
  belum ada di worktree sehingga `npm ci` lebih dulu (probe modul sendiri
  bisa tanpa `node_modules` karena `page-titles.ts` hanya mengimpor
  `navigation.ts` tanpa dependensi eksternal); probe menemukan 26 kunci
  (bukan 25) dan itu yang dikunci; prettier merapikan format; typecheck/
  lint 0/0 dan `npm run ci` utuh hijau pada percobaan pertama (install,
  typecheck, lint 0/0, 1065/1065 unit = 1047 + 18, build, anggaran bundel,
  CSP build produksi, smoke Playwright + PGlite). Tanpa perubahan
  aplikasi/perilaku/skema/RPC/migrasi/dependensi dan tanpa perubahan
  `docs/ROADMAP.md` (tidak ada baris backlog yang tersentuh, pola
  PR #77/#78/#90/#92–#96).

- 2026-11-16: PR #96 — test: test unit langsung gerbang akses lokal
  `src/lib/auth/local-access.ts` — `LOCAL_OWNER_ID`/`permitsLocalUser`
  (16 test di `tests/local-access.test.ts`, node:test murni, impor modul
  langsung, tanpa PGlite/DOM; `Request`/`URL`/`Headers` global Node 26 cukup),
  modul tidak diubah; `tests/japanese.test.ts` (66 baris) tetap utuh (satu
  judul test-nya dirujuk penjaga statis, bukan dipindah — catatan probe: test
  lama itu tidak pernah menyebut `LOCAL_OWNER_ID`, hanya `permitsLocalUser`).
  Dikunci: `LOCAL_OWNER_ID === 'local-japanese-owner'`. Configured origin —
  `undefined`/`''` → false (opt-in); malformed (`'not a url'`, `'http://'`,
  `'::::'`) → false lewat catch; `https` ditolak walau request juga https;
  `localhost`/`::1`/`127.0.0.2`/`0.0.0.0` ditolak; port bebas asal kedua sisi
  setuju (4321); path/query/trailing slash/userinfo pada configured origin
  diabaikan (hanya `origin` dibandingkan, rough edge); port default 80 dan
  kapitalisasi skema dinormalkan `URL`. Request origin — wajib sama persis
  (https/localhost/`::1`/port lain/`127.0.0.2` → false); path, query, hash,
  trailing slash diabaikan. URL request rusak (objek duck-typed karena
  `new Request` menolak URL invalid) dan header yang melempar → false lewat
  `try`/`catch`. Empat header proxy `forwarded`/`x-forwarded-host`/
  `x-forwarded-for`/`x-forwarded-proto` ditolak walau nilainya `''` dan
  pencarian case-insensitive (`Forwarded`). Header `origin`: sama → true,
  beda (termasuk trailing slash/kapitalisasi) → false, absen → true, string
  kosong → true (rough edge `if (origin && …)`). `sec-fetch-site`:
  `same-origin`/`none`/absen/`''` → true; `same-site`/`cross-site`/
  `SAME-ORIGIN` → false. Kombinasi: origin benar + `cross-site` → false,
  forwarded + header lain bersih → false, dan kombinasi bersih → true.
  Penjaga statis: `local-access.ts` tanpa impor/`require` dan mengekspor tepat
  `LOCAL_OWNER_ID`+`permitsLocalUser` (urut); `account.ts` mere-ekspor
  `LOCAL_OWNER_ID` dari `./auth/local-access.ts`; `verify.server.ts` mengimpor
  dan memanggil `permitsLocalUser(request, process.env.JAPANESE_LOCAL_ORIGIN)`;
  `api/japanese-backup.ts` memakai impor dinamis + guard yang sama; dan
  `DeleteAccount.tsx` membandingkan `user.id === LOCAL_OWNER_ID`; anchor judul
  test lama + jumlah baris 66 tetap utuh. Catatan proses: `node_modules` belum
  ada di worktree sehingga `npm ci` lebih dulu; satu asersi draf "port bebas"
  salah memakai configured origin tanpa port (origin `:1` ≠ `:80`) dan
  diperbaiki sebelum gerbang; prettier merapikan format; typecheck/lint 0/0
  dan `npm run ci` utuh hijau pada percobaan pertama. Tanpa perubahan
  aplikasi/perilaku/skema/RPC/migrasi/dependensi dan tanpa perubahan
  `docs/ROADMAP.md` (tidak ada baris backlog yang tersentuh, pola
  PR #77/#78/#90). `npm run ci` hijau (install, typecheck, lint 0/0,
  1047/1047 unit = 1031 + 16, build, anggaran bundel, CSP build produksi,
  smoke Playwright + PGlite).

- 2026-11-16: PR #95 — test: test unit langsung sapaan & tautan pintasan
  dashboard `src/lib/dashboard.ts` (13 test di `tests/dashboard-direct.test.ts`,
  node:test murni, impor modul langsung, tanpa PGlite/DOM), modul tidak
  diubah; `tests/dashboard.test.ts` (48 baris) tetap utuh (lima judul `it`
  lamanya dirujuk penjaga statis, bukan dipindah). Dikunci: `LEARNER_SHORTCUTS`
  — tepat empat tautan dengan urutan href persis `/recommendations`/`/gaps`/
  `/graph`/`/profile` beserta label dan description persis (salinan eksplisit
  `Recommendations`/`Gap Analysis`/`Knowledge Graph`/`My Profile`);
  `MANAGE_LINKS` — tepat lima dengan urutan href persis `/admin/learners`/
  `/admin/concepts`/`/admin/prerequisites`/`/admin/states`/`/data-entry`
  beserta label (`Learners`/`Concepts`/`Prerequisites`/`Knowledge States`/
  `Data Entry Guide`) dan description persis; tiap label/description non-kosong
  ter-trim; partisi learner tanpa `/admin*` dan `/data-entry`, manage hanya
  `/admin*`+`/data-entry`, gabungan sembilan href unik. `greetingName` —
  kata pertama nama dengan spasi liar di-collapse (`'  Muhammad   Lazuardi '`
  → `Muhammad`), fallback local-part email (`ardhy.ui@example.test` →
  `ardhy.ui`; plus-addressing `first.last+tag` utuh, spasi local-part
  di-trim, tanpa `@` tetap utuh `no-at-mark`), `null`/`undefined`/objek
  kosong/nama dan email kosong → `null`; karakter Cc/Cf dibuang dari nama
  maupun email sebelum split (`'S\u0000a\u202eri Smoke'` → `Sari`, ZWSP
  `'A\u200bri Budi'` → `Ari`); nama hanya kontrol (`'\u0007\u202e'`) →
  jatuh ke email yang juga dibersihkan (`'bo\u0000b@x.test'` → `bob`);
  rough edge hasil probe: tab adalah Cc sehingga dihapus **sebelum**
  `split(/\s+/)` — `'Sari\tSmoke'` → `'SariSmoke'` (kata menyatu, bukan
  terpisah; hanya spasi Zs yang memisah); batas `MAX_NAME` 40 per code
  point: tepat 40 utuh (`'a'×40`; juga 38a+😀😀 dan 39a+😀 di tepi batas),
  41 → 40 code point + `…` (`'a'×41` → panjang 41; 39a+😀😀 → 39a+😀+`…`
  = 41 cp / 42 unit UTF-16). `dashboardHeading` — `Hi, <nama>` bila
  non-null, persis `Your learning today` bila null. Penjaga statis:
  `dashboard.ts` tanpa impor/`require` dan mengekspor tepat
  `DashboardLink`/`LEARNER_SHORTCUTS`/`MANAGE_LINKS`/`greetingName`/
  `dashboardHeading` (urut); `src/routes/index.tsx` mengimpor ketiganya
  dari `@/lib/dashboard` dan merender `{dashboardHeading(user)}`/
  `LEARNER_SHORTCUTS.map`/`MANAGE_LINKS.map`; tujuh string description
  (literal ter-kutip penuh, diprobe unik ke `dashboard.ts` —
  `'Learner profiles'`/`'Concept nodes'` dikecualikan karena punya
  kecocokan sah di `navigation.ts`/`combined-graph.tsx`) tidak disalin di
  `src/` lain (scan rekursif); anchor lima judul `it` + jumlah baris 48
  `tests/dashboard.test.ts` tetap utuh. Catatan proses: `node_modules`
  belum ada di worktree sehingga `npm ci` lebih dulu; probe modul
  mengonfirmasi seluruh cabang sebelum menulis test (tab-dihapus-bukan-
  pemisah ditemukan di probe; satu typo literal penjaga
  `{dashboardHeading(user)}}` terkoreksi sebelum gerbang); prettier tidak
  mengubah format; run gerbang pertama gagal hanya di satu cek smoke
  (hydration `details open=""`) saat beban mesin bersama load ±6 di 4 core
  dengan log `Failed to fetch`/`AbortError` — pola flaky PR #84/#91;
  setelah load turun (±1,6) `npm run ci` utuh diulang tanpa perubahan
  kode dan hijau penuh. Sesi ini mengambil alih branch `test/dashboard-direct`
  lewat branch lokal `test/dashboard-direct-takeover` (tanpa mengubah file
  test), melengkapi state, lalu menjalankan ulang `npm run ci` utuh hijau
  pada percobaan pertama (load ±0,5). Tanpa perubahan aplikasi/perilaku/skema/RPC/
  migrasi/dependensi dan tanpa perubahan `docs/ROADMAP.md` (tidak ada
  baris backlog yang tersentuh, pola PR #77/#78/#90/#92/#93/#94).
  `npm run ci` hijau (install, typecheck, lint 0/0, 1031/1031 unit =
  1018 + 13, build, anggaran bundel, CSP build produksi, smoke Playwright
  + PGlite).

- 2026-11-16: PR #94 — test: test unit langsung data & helper navigasi utama
  `src/lib/navigation.ts` (15 test di `tests/navigation-direct.test.ts`,
  node:test murni, impor modul langsung, tanpa PGlite/DOM), modul tidak
  diubah; `tests/navigation.test.ts` (63 baris) tetap utuh (lima judul `it`
  lamanya dirujuk penjaga statis, bukan dipindah). Dikunci: `NAV_SECTIONS` —
  tepat empat section dengan id/urutan persis `learn`/`explore`/`manage`/
  `developer`, title persis `Learn`/`Explore`/`Manage data`/
  `Developer tools`, `collapsible` false/false/true/true, jumlah item
  6/4/9/2; daftar 21 href persis (salinan eksplisit per grup) unik; tiap
  item label/description non-kosong ter-trim dan `icon` anggota union 20
  nilai (salinan eksplisit); `/japanese` di grup Learn berlabel
  `Bahasa Jepang` ber-deskripsi `Jalur N5 sampai N1 dan latihan` (D2);
  partisi learn+explore tanpa `/admin*`/`/tests`/`/status`/`/data-entry`,
  manage hanya `/admin*`+`/data-entry`, developer hanya `/status`+`/tests`,
  section pertama `learn` dan item pertamanya `/`. `isNavItemActive` — `/`
  hanya exact (`/` true, `/gaps`/`//` false); href lain exact true, prefix
  segmen true (`/admin/learners` vs `/admin/learners/x`), prefix kata lain
  false (`/graph` vs `/graphs`); rough edge trailing slash: `/graph/` →
  true (memenuhi prefix `${href}/`) dan `/gaps/` → true. `sectionHasActive`
  — tiap section di halaman miliknya (learn `/`/`/graph`, explore
  `/about`, manage `/admin/concepts`/`/data-entry`, developer
  `/status`/`/tests`) dan false di halaman lain. `isSectionOpen` — section
  non-collapsible selalu true walau `saved` false; collapsible: halaman di
  dalamnya selalu true walau `saved` false, `saved` true → true walau di
  halaman lain, tanpa `saved` (termasuk `{ manage: undefined }`) → false
  (`?? false`), kunci mandiri (`developer:false`+`manage:true` → false).
  `NAV_STORAGE_KEY === 'learngraph:nav-open'`. `parseNavOpenState` —
  `null`/`undefined`/`''`/bukan JSON (`'not json'`)/array (`'[true]'`)/
  `'null'`/number/string JSON (`'42'`, `'"x"'`)/boolean JSON (`'true'`)/
  `'{}'` → `{}`; hanya boolean section collapsible yang diambil
  (`{"manage":true,"developer":false}` utuh); boolean untuk section
  non-collapsible (`learn`/`explore`) dan kunci asing diabaikan; nilai
  non-boolean per kunci (`"yes"`, 1, null) dibuang tanpa menggugurkan
  kunci lain; rough edge kunci duplikat JSON last-wins
  (`{"manage":true,"manage":false}` → `{manage:false}`). Penjaga statis:
  `navigation.ts` tanpa impor/`require` dan mengekspor tepat enam helper
  runtime + empat tipe (urut persis); `Sidebar.tsx` mengimpor keenam nama
  itu dari `@/lib/navigation`, memakai
  `window.localStorage.getItem(NAV_STORAGE_KEY)` dan
  `window.localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(next))`
  serta `isSectionOpen(section, pathname, savedOpen)`; `page-titles.ts`
  mengimpor `NAV_SECTIONS` dari `./navigation.ts` dan membangun peta judul
  lewat `NAV_SECTIONS.flatMap((s) => s.items.map((i) => [i.href, i.label]))`;
  lima string description (`'Your plan for today'`, `'What to learn next'`,
  `'Draft a course with AI'`, `'Run engine checks'`, `'Quick add forms'`)
  tidak disalin di `src/` lain (scan rekursif; probe lebih dulu — hindari
  `'See how concepts connect'` yang melekat di `dashboard.ts` serta label
  `'Functional Tests'`/`'Manage data'`/`'Bahasa Jepang'` yang punya
  kecocokan sah di rute); anchor lima judul `it` + jumlah baris 63
  `tests/navigation.test.ts` tetap utuh. Catatan proses: `node_modules`
  belum ada di worktree sehingga `npm ci` lebih dulu; probe modul
  mengonfirmasi seluruh cabang sebelum menulis test (trailing slash dan
  duplikat kunci ditemukan di probe); prettier merapikan format;
  typecheck/lint 0/0. Tanpa perubahan aplikasi/perilaku/skema/RPC/migrasi/
  dependensi dan tanpa perubahan `docs/ROADMAP.md` (tidak ada baris backlog
  yang tersentuh, pola PR #77/#78/#90/#92/#93). `npm run ci` hijau
  (install, typecheck, lint 0/0, 1018/1018 unit = 1003 + 15, build,
  anggaran bundel, CSP build produksi, smoke Playwright + PGlite).

- 2026-11-16: PR #93 — test: test unit langsung ukuran keberhasilan belajar
  `src/lib/evidence/measures.ts` (16 test di
  `tests/evidence-measures-direct.test.ts`, node:test murni, impor modul
  langsung, tanpa PGlite/DOM), modul tidak diubah; `tests/learning-measures.test.ts`
  (111 baris) dan `tests/evidence-events.test.ts` tetap utuh (dirujuk
  penjaganya, bukan dipindah). Dikunci: `returningLearners` — lima kind
  belajar (`quiz`/`study`/`review`/`practice`/`lesson`) dihitung dan
  `snooze`/`unsnooze`/`tutor` diabaikan kapan pun; batas minggu dua sisi
  (tepat 7 hari → minggu sebelumnya, 7 hari − 1 ms → recent, tepat 14 hari
  diabaikan, `now` tepat → recent, masa depan/`createdAt` rusak diabaikan);
  satu learner sekali walau empat event; recent-only tidak menambah
  `activeBefore`; rate tanpa pembulatan (1/3), `null` hanya saat
  `activeBefore === 0`, `before` tanpa kembali → 0. `finishesConcept` —
  true hanya `quiz`+`passed` dan `study`+`got-it`, lima kombinasi lain
  false. `activationTime` — penyelesai paling awal menurut waktu (urutan
  array diabaikan dua arah), `firstFinishedAt` ISO ber-milidetik,
  pembulatan `Math.round` half-up (10 dtk → 0, 30 dtk → 1, 90 dtk → 2),
  clamp 0 bila selesai sebelum akun; tanpa penyelesai → keduanya null;
  `accountCreatedAt` null/rusak → `firstFinishedAt` terisi tetapi `minutes`
  null; penyelesai ber-`createdAt` rusak diabaikan (sendirian → null,
  bercampur → yang sah menang). `learningMeasures` — `events` = jumlah
  baris; `retention`/`returning`/`activation`/`tutor` diteruskan
  (dibandingkan langsung dengan hasil `dueReviewRetention`/
  `tutorPreference` dari `events.ts`); `calibrationGap` hanya bila kedua
  rate non-null (0.75−2/3 → 8, 1/3−2/3 → −33, sama → 0,
  kuis-saja/laporan-saja → null); masukan kosong → seluruh cabang kosong.
  `measureRows` — keenam baris dikunci utuh (id/label/value/target persis,
  termasuk `Under 5 minutes` dan `80%`): keempat cabang retention (`No due
  reviews answered yet`, kuis-saja `quizzes 100% of 1`, laporan-saja
  `self-reports 100% of 1`, keduanya `quizzes 50% of 2, self-reports 50%
  of 2`); kalibrasi null/0/positif/negatif + bentuk tunggal `1 point`;
  returning null/`0 of 2 learners … (0%)`/`1 of 1 learner … (100%)`;
  aktivasi `No concept finished yet`/`Finished, but the account’s start
  date is unknown`/`1 minute`/`45 minutes`/`1 hour` (60)/`2 hours` (90,
  dibulatkan)/`2 days` (48 jam)/`3 days` (72 jam); string session tetap;
  personalisasi `No blind comparisons yet`/`2 of 3 comparisons (the other:
  1, no difference: 0)`/bentuk tunggal `1 of 1 comparison`. Penjaga statis:
  `measures.ts` tepat satu impor `./events.ts` persis dan tanpa `require`,
  mengekspor lima fungsi + empat tipe (urut); `evidence.functions.ts`
  memakai `import('@/lib/evidence/measures')` dinamis +
  `learningMeasures(events, created ? new Date(created).toISOString() :
  null, new Date())`; `LearningMeasures.tsx` mengimpor/memanggil
  `measureRows` dan merender `{r.label}`/`{r.value}`/`Target: {r.target}`;
  11 string nilai baris tidak disalin di `src/` lain (scan rekursif, hanya
  `measures.ts` dikecualikan); anchor lama kedua test lama tetap ada +
  jumlah baris `learning-measures.test.ts` tetap 111. Catatan proses:
  `node_modules` belum ada di worktree sehingga `npm ci` lebih dulu; probe
  modul mengonfirmasi seluruh cabang sebelum menulis test; satu asersi
  draf penjaga salah menghitung baris (112 ≠ 111 karena trailing newline)
  dan diperbaiki dengan `trimEnd()` sebelum gerbang; prettier merapikan
  format; typecheck/lint 0/0 dan `npm run ci` utuh hijau pada percobaan
  pertama (mesin sempat berload 6–7 selama langkah test, tetap lolos).
  Tanpa perubahan aplikasi/perilaku/skema/RPC/migrasi/dependensi dan tanpa
  perubahan `docs/ROADMAP.md` (tidak ada baris backlog yang tersentuh,
  pola PR #77/#78/#90). `npm run ci` hijau (install, typecheck, lint 0/0,
  1003/1003 unit = 987 + 16, build, anggaran bundel, CSP build produksi,
  smoke Playwright + PGlite).

- 2026-11-16: PR #92 — test: test unit langsung dataset kurikulum & bank soal
  Jepang `src/lib/japanese/curriculum.ts` + `src/lib/japanese/questions.ts`
  (12 test di `tests/japanese-curriculum.test.ts`, node:test murni, impor
  dataset langsung, tanpa PGlite/DOM/Playwright), kedua modul tidak diubah.
  Dikunci: `MODULES` tepat 40 dengan urutan id persis (salinan eksplisit
  `jp-hiragana` … `jp-n1-output`) dan unik, nama unik, level 24/4/4/4/4
  (N5–N1), mode 8/23/9 (quiz/external/michi), `LEARNER === 'japanese-ardhyui'`,
  name/level/description/resource non-kosong dan ter-trim; delapan modul kuis
  (`jp-hiragana` … `jp-counters`) dikunci objeknya utuh (id/name/level/
  description/prereqs/mode/resource, termasuk copy bahasa Indonesia, D2), dan
  resource per mode — kuis semuanya irodori, external tepat 23 modul dengan
  hanya `https://` dan lima URL unik (irodori, tadoku, samplequestions.jlpt,
  marugoto, aozora), michi tepat sembilan URL `http://127.0.0.1:17831/bab/…`
  untuk slug dasar/alam/ukuran/waktu/orang/sekolah/gerak/kota/angka.
  `QUESTIONS` tepat 48, id unik berpola `<slug>-1..6` (delapan slug hiragana,
  katakana, particles, existence, verbs, adjectives, te, counters), topik persis
  id delapan modul kuis, enam soal per topik berurutan, tanpa topik asing; tiap
  soal tiga opsi unik, answer muncul tepat sekali, prompt/answer/explanation
  non-kosong dan ter-trim; rough edge aktual bahwa `answer === options[0]` untuk
  seluruh 48 soal (opsi diacak saat undian, dataset tidak diubah); soal sulit
  `hiragana-4` (「りょ」 → `ryo`, opsi `['ryo','riyo','yo']`) dan `counters-1`
  (「三つ」 → `みっつ`) dikunci persis. Penjaga statis: kedua dataset tanpa impor/
  `require`; `japanese.functions.ts` mengimpor `MODULES`+`LEARNER` dari
  `@/lib/japanese/curriculum` dan `QUESTIONS` dari `@/lib/japanese/questions`,
  memfilter `m.mode === 'quiz'`/`'external'`/`'michi'`, dan memakai
  `QUESTIONS.filter((q) => q.topic === data.concept)`; scan seluruh `src/`
  (`ts`/`tsx` kecuali kedua dataset) tanpa salinan `japanese-ardhyui`/
  `jp-hiragana`/`export const MODULES`/`export const QUESTIONS`/
  `export const LEARNER =`; lima asersi lama `tests/japanese.test.ts` tetap
  utuh. Catatan proses: `node_modules` belum ada sehingga `npm ci` lebih dulu;
  satu asersi draf penjaga salinan gagal karena penanda `export const LEARNER`
  juga cocok dengan `export const LEARNER_SHORTCUTS` di `src/lib/dashboard.ts`,
  diperbaiki menjadi `export const LEARNER =` sebelum gerbang; prettier
  merapikan format; typecheck/lint 0/0 dan `npm run ci` utuh langsung hijau pada
  percobaan pertama. Tanpa perubahan aplikasi/perilaku/skema/RPC/migrasi/
  dependensi dan tanpa perubahan `docs/ROADMAP.md` (tidak ada baris backlog yang
  tersentuh, pola PR #77/#78/#90). `npm run ci` hijau (install, typecheck,
  lint 0/0, 987/987 unit = 975 + 12, build, anggaran bundel, CSP build
  produksi, smoke Playwright + PGlite).

- 2026-11-16: PR #91 — test: test unit langsung jadwal & patch state kuis
  evidence `src/lib/evidence/quiz.ts` — `reviewWasDue`/`quizStatePatch`
  (11 test di `tests/evidence-quiz-state.test.ts`, node:test murni, impor
  modul langsung, tanpa PGlite/DOM), modul tidak diubah. Dikunci:
  `reviewWasDue` — `null`/`undefined`/`{}`/mastery < 40/tanpa tanggal → false;
  mastery 40 + `firstSeen` 2 hari → true; `lastReviewed` menang atas
  `firstSeen` dua arah; snooze (`nextReview` besok) diabaikan sepenuhnya;
  reviewCount 0 + 2 hari + difficulty 0 → true; reviewCount 1 + 2 hari,
  difficulty 0/null/undefined → false; difficulty 10 → true (interval 2);
  reviewCount 1 + 1 hari → false; tepat di due (milidetik) → true dan 1 ms
  sebelumnya → false. `quizStatePatch` — `attempts: []` → cabang gagal
  (mastery 0, source `quiz`, lastAssessed/lastReviewed/nextReview ISO `now`,
  reviewCount 0, retention 0.3; strength 0.3 → 0.1); gagal terakhir → mastery
  `round(accuracy*70)` (2/4 → 35, 3/4 → 53, 0/0 → 0) walau pass sebelumnya 85,
  reviewCount 0, retention −0.2 dijepit 0.1; urutan array diabaikan — diurut
  `Date.parse(at)` dan percobaan terakhir secara waktu menentukan `passed`
  (dua arah; array/prior tidak dimutasi); lulus belum learned (tanpa prior
  atau mastery 39) → mastery 85, retention 0.8, reviewCount 0, ids/
  `delayedRetrieval` tak berpengaruh, 1/0 → 85 (rough edge); lulus learned
  due → reviewCount `(prior.reviewCount ?? 0)+1` (null/undefined → 1),
  retention `round2(min(1, strength+0.1))` (0.95 → 1, 0.2 → 0.3); lulus
  learned belum due → patch hanya `{mastery, masterySource, lastAssessed}`
  (retake dini tak meregangkan jadwal); `clamp01` `?? 0.5` — non-finite →
  0.5 (gagal 0.3/due pass 0.6), <0 → 0 (gagal 0.1), >1 → 1 (gagal 0.8/due
  pass 1), absen → 0.5; semua cabang `masterySource 'quiz'`,
  `lastAssessed` ISO now, dan `wasDue === reviewWasDue(prior, difficulty,
now)`. Catatan proses: `node_modules` belum ada sehingga `npm ci` lebih
  dulu; satu asersi draf memakai 2/3 sebagai "lulus" tetapi ambang 0.8 membuat
  itu gagal (diperbaiki menjadi 4/5) sebelum gerbang; run gerbang pertama
  gagal hanya di smoke karena beban mesin bersama (load ± 6,4 di 4 core; cek
  fokus "Skip to content" → `in main false`) sementara typecheck/lint/975
  unit/build/anggaran/CSP hijau; setelah load turun (± 0,4), `npm run ci`
  utuh diulang tanpa perubahan kode dan hijau penuh. Tanpa perubahan
  aplikasi/perilaku/skema/RPC/migrasi/dependensi dan tanpa perubahan
  `docs/ROADMAP.md` (tidak ada baris backlog yang tersentuh, pola
  PR #77/#78/#90). `npm run ci` hijau (install, typecheck, lint 0/0,
  975/975 unit = 964 + 11, build, anggaran bundel, CSP build produksi, smoke
  Playwright + PGlite).

- 2026-11-16: PR #90 — test: test unit langsung bank & penilaian kuis generik
  `src/lib/evidence/quiz.ts` — `shuffled`/`pickQuestions`/`gradeQuiz`/
  `questionInput` (23 test di `tests/evidence-quiz.test.ts`, node:test murni,
  impor modul langsung, tanpa PGlite/DOM), modul tidak diubah. Dikunci:
  konstanta `QUIZ_LENGTH` 3, `MIN_OPTIONS` 2, `MAX_OPTIONS` 6,
  `MAX_QUESTIONS_PER_CONCEPT` 50. `shuffled` — Fisher–Yates memanggil
  `randomInt` menurun `[4,3,2]` untuk 4 item (`[2]` untuk 2,
  `[6,5,4,3,2]` untuk 6), bukan urutan naik; `() => 0` pada `[1,2,3,4]` →
  `[2,3,4,1]`, `(n) => n - 1` → urutan asli, `['a','b','c']` →
  `['b','c','a']`; array kosong/satu item tanpa memanggil `randomInt`; hasil
  salinan, masukan tidak dimutasi. `pickQuestions` — pool diacak dulu lalu
  `sort` stabil menaruh id `previousIds` di belakang baru `slice`: pool
  `[a,b,c,d]`, previous `[a,b,c]`, count 3, `() => 0` → `[d,b,c]`; tanpa
  acak (n−1) → `[d,a,b]`; id previous asing diabaikan (`[x,y]` →
  `[b,c,d,a]`); count 99 → semua item tanpa duplikat, pool 2 → dua; count
  0/negatif → `[]` tetapi `randomInt` tetap dipanggil untuk seluruh pool
  (rough edge); pool & previous tidak dimutasi. `gradeQuiz` — hasil persis
  `{correct,total,results:[{questionId,picked,correct}]}` urut soal, `total`
  = jumlah soal, `'a'` vs kunci `'A'` → salah (kecocokan persis); jawaban
  absen/`undefined`/non-string/bukan opsi → `QuizAnswerError` `name`
  `'QuizAnswerError'`, `status` 400, pesan persis
  `'Answer every question first.'`; `Object.hasOwn` sehingga jawaban warisan
  prototipe melempar; kunci asing diabaikan; `[]` → nol; bank & jawaban tidak
  dimutasi. `questionInput` — `prompt`/`options`/`answer`/`explanation`
  di-trim dulu; default `explanation: ''` (spasi saja → `''`, rough edge);
  batas tepat 500/200/200/1000 sah dan 501/201/201/1001 gagal; 2..6 opsi unik
  setelah trim (duplikat `['A',' A ']` gagal; `answer: ' B '` cocok dengan
  opsi `' B '` → hasil trim `'B'`); `conceptId` lewat `writeId` (128 sah;
  kosong/129/`:`/kontrol/spasi tepi gagal); `id` opsional
  `^[A-Za-z0-9_-]{1,64}$` (64 sah, 65/spasi/kosong/`:` gagal); kunci asing
  dibuang (hasil tepat lima kunci). Penjaga statis: `service.ts` mengimpor
  `gradeQuiz`/`MAX_QUESTIONS_PER_CONCEPT`/`pickQuestions`/`QUIZ_LENGTH`/
  `quizStatePatch`/`reviewWasDue`/`shuffled` dari `./quiz.ts` dan tidak
  mendefinisikan salinan/konstanta sendiri; `evidence.functions.ts` →
  `questionInput`; `japanese.functions.ts` → `pickQuestions`+`shuffled` dan
  memanggil keduanya; rute admin mengimpor dan memakai
  `MIN_OPTIONS`/`MAX_OPTIONS`/`QUIZ_LENGTH`; delapan anchor lama di
  `tests/learning-evidence.test.ts` dan `questionInput.safeParse` di
  `tests/demo-questions.test.ts` tetap utuh; `quiz.ts` tetap mengekspor semua
  helper. Catatan proses: probe modul lebih dulu mengonfirmasi seluruh cabang
  sebelum menulis test; satu helper draf ekstraksi impor memakai regex
  `[\s\S]*?` sehingga serakah melewati blok impor pertama dan diperbaiki
  menjadi `[^}]*` sebelum gerbang; typecheck/lint 0/0 dan `npm run ci` utuh
  hijau pada percobaan pertama. Tanpa perubahan aplikasi/perilaku/skema/RPC/
  migrasi/dependensi dan tanpa perubahan `docs/ROADMAP.md` (tidak ada baris
  backlog yang tersentuh, pola PR #77/#78). `npm run ci` hijau (install,
  typecheck, lint 0/0, 964/964 unit = 941 + 23, build, anggaran bundel, CSP
  build produksi, smoke Playwright + PGlite).

- 2026-11-16: PR #89 — test: test unit langsung skrip tema tanpa kedip
  `src/lib/theme-script.ts` — `NO_FLASH_SCRIPT`, `THEME_STORAGE_KEY`
  (12 test di `tests/theme-script.test.ts`, node:test, impor modul langsung +
  `node:vm` dengan mock `localStorage`/`window.matchMedia`/
  `document.documentElement`; tanpa PGlite/DOM/Playwright), modul tidak
  diubah. Dikunci: `THEME_STORAGE_KEY === 'theme'`; skrip satu baris (tanpa
  `\n`/`\r`), IIFE `(function(){try{...}catch(e){}})();`, memuat
  `localStorage.getItem('theme')||'system'`; CSP-safe tanpa `eval`/
  `new Function`/`import(`/`fetch`, hanya menyentuh
  `localStorage`/`window`/`document`, query media persis
  `(prefers-color-scheme: dark)`. Perilaku: tersimpan `dark` → kelas `dark`
  - `colorScheme` `dark` tanpa bertanya media (matches true/false); `light` →
    tanpa kelas + `light`, tanpa media; `system`/kunci absen (`null`) →
    mengikuti media (true: kelas `dark` + `dark`; false: tanpa kelas + `light`)
    dan query dipanggil tepat sekali; nilai tak dikenal `blue` → terang tanpa
    media; kelas `dark` yang sudah ada dihapus saat terang; `getItem` melempar
    → ditelan, tanpa `classList` dan `colorScheme` lama tetap; rough edge
    `document.documentElement.style` absen → kelas `dark` sempat ditambahkan
    (atau kelas dihapus untuk terang), lalu assignment `colorScheme` melempar
    dan ditelan (`colorScheme` `undefined`, tanpa exception keluar). Penjaga
    statis: `theme.tsx` mengimpor `NO_FLASH_SCRIPT as NO_FLASH_SCRIPT_SOURCE`
    dari `./theme-script` dan mengekspor ulang `NO_FLASH_SCRIPT`;
    `ThemeProvider.tsx` memakai `THEME_STORAGE_KEY as STORAGE_KEY` untuk
    `getItem`/`setItem`; `__root.tsx` merender
    `<script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />`; SHA-256
    dihitung dari `NO_FLASH_SCRIPT` = `NO_FLASH_SCRIPT_SHA256` (konstanta
    dirujuk, bukan disalin) dan `tests/security-headers.test.ts` tetap
    merujuknya; asersi lama `tests/provider-split.test.ts` tetap utuh. Catatan
    proses: probe `node:vm` lebih dulu mengonfirmasi seluruh cabang sebelum
    menulis test; satu asersi draf penjaga lama gagal karena
    `tests/provider-split.test.ts` menyimpan regex ter-escape, diperbaiki
    menjadi pencocokan string; prettier merapikan format sebelum gerbang;
    `npm run ci` utuh langsung hijau pada percobaan pertama. Tanpa perubahan
    aplikasi/perilaku/skema/RPC/migrasi/dependensi dan tanpa perubahan
    `docs/ROADMAP.md` (tidak ada baris backlog yang tersentuh, pola PR
    #77/#78). `npm run ci` hijau (install, typecheck, lint 0/0, 941/941 unit =
    929 + 12, build, anggaran bundel, CSP build produksi, smoke Playwright +
    PGlite).

- 2026-11-16: PR #88 — test: test unit langsung label evidence
  `src/lib/evidence/labels.ts` — `masterySourceLabel`/`evidenceMode`/
  `quizResultNotice`/`retentionLine` (16 test di
  `tests/evidence-labels.test.ts`, node:test murni, impor modul langsung,
  tanpa PGlite/DOM), modul tidak diubah. Dikunci: `masterySourceLabel` —
  `quiz`/`self_report`/`manual`/`practice`/`sync` ke label persisnya; `null`,
  `undefined`, dan nilai tak dikenal (cast) → `Not quiz-checked`.
  `evidenceMode` — count > 0 selalu `quiz` (flag required true/false/absen);
  count 0 atau id absen → `elsewhere` hanya bila `evidenceRequired === true`,
  selain itu `self-report`; hitungan milik konsep lain diabaikan; count
  negatif (rough edge) tidak > 0 sehingga jatuh ke cabang `evidenceRequired`.
  `quizResultNotice` — string persis: gagal selalu `... not passed yet.
“name” stays in your plan ...` walau `wasDue` true/`masteryBefore` 95;
  lulus + `wasDue` → `... passed! “name” will come back after a longer
break.` (menang atas `masteryBefore` 90); lulus + tidak due +
  `masteryBefore` 80/85/100 → `... keeps its review date.`; `masteryBefore`
  0/79/79.9 → `... is mastered. A short review quiz comes back tomorrow.`;
  kutip lengkung dan skor `correct of total` disalin apa adanya.
  `retentionLine` — noun `due review` saat answered 1 dan `due reviews`
  selain itu; `answered === 0` (walau rate 0) atau `rate === null` → `null`;
  pembulatan 2/3 → 67%, 1/3 → 33%, 3/4 → 75%, 0/2 → 0%; rough edge tidak
  dijepit (1.5 → 150%, −0.1 → −10%). Penjaga statis: `labels.ts` hanya
  `import type` (`ConceptNode`/`MasterySource` dari `../graph/types.ts`,
  `RetentionStat` dari `./events.ts`) tanpa `require`; lima pemakai tetap
  mengimpor helper bersama (`StudyToday.tsx` evidenceMode+quizResultNotice,
  `learn.$conceptId.tsx` masterySourceLabel+quizResultNotice, `gaps.tsx`
  masterySourceLabel+retentionLine, `Onboarding.tsx` evidenceMode,
  `graph.tsx` masterySourceLabel); bunyi lima label tidak disalin sebagai
  literal di `src/` lain; asersi lama `tests/learning-evidence.test.ts`
  (3 `masterySourceLabel`, 3 `evidenceMode`, 3 `quizResultNotice`, 2
  `retentionLine`) tetap utuh. Catatan proses: probe awal mengonfirmasi
  seluruh perilaku sebelum menulis test dan gerbang penuh lulus pada
  percobaan pertama. Tanpa perubahan aplikasi/perilaku/skema/RPC/migrasi/
  dependensi. `npm run ci` hijau (install, typecheck, lint 0/0, 929/929 unit
  = 913 + 16, build, anggaran bundel, CSP build produksi, smoke Playwright +
  PGlite).

- 2026-11-16: PR #87 — test: test unit langsung ukuran log bukti
  `src/lib/evidence/events.ts` — `dueReviewRetention`/`tutorPreference`
  (17 test di `tests/evidence-events.test.ts`, node:test murni, impor modul
  langsung, tanpa PGlite/DOM), modul tidak diubah. Dikunci:
  `dueReviewRetention` — hanya `wasDue === true` dihitung (`false`, `null`,
  `undefined`, field absen tidak); kind `quiz` menambah `answered` dan hanya
  `outcome === 'passed'` yang `correct` (`failed`/`remembered`/`passed-ish`
  tidak); kind `review` menambah `answered` dan hanya `'remembered'` yang
  `correct` (`forgot`/`passed` tidak); `study`/`snooze`/`unsnooze`/
  `practice`/`lesson`/`tutor` diabaikan walau due; `rate = correct /
answered` tanpa pembulatan (4/4 → 1, 0/4 → 0, 2/4 → 0.5, 3/4 → 0.75,
  1/3 → 0.333…, 2/3 → 0.666…), `null` saat bucket kosong; dua bucket
  independen (satu kosong, yang lain terisi); `[]` → kedua bucket
  `{answered: 0, correct: 0, rate: null}`; masukan dibekukan dan snapshot
  utuh, hasil sama untuk urutan terbalik. `tutorPreference` —
  `prefer-context`/`prefer-plain`/`prefer-same` dihitung ke bucketnya
  (`same` = `prefer-same`) dan `compared` = jumlah event tutor ber-outcome
  `prefer-*`; rough edge dikunci: `prefer-other` masuk `compared` tetapi
  tidak ke bucket mana pun sehingga tiga bucket bisa < `compared`; event
  non-tutor ber-outcome `prefer-*` dan event tutor ber-outcome `asked`
  diabaikan; `[]` → semua 0; masukan tidak dimutasi, urutan tak
  berpengaruh. Penjaga statis: `events.ts` tanpa impor/`require` dan
  mengekspor tepat `LearningEventKind`, `LearningEventSource`,
  `LearningEventInput`, `LearningEvent`, `RetentionStat`,
  `dueReviewRetention`, `tutorPreference`; `measures.ts` mengimpor kedua
  fungsi dari `./events.ts` tanpa salinan (`wasDue !== true`/
  `answered ? correct / answered`/`startsWith('prefer-')`);
  `evidence.functions.ts` tetap `const { dueReviewRetention } = await
import('@/lib/evidence/events')`; asersi lama
  `tests/learning-evidence.test.ts` (judul retention) dan
  `tests/learning-measures.test.ts` (rate 0.5/0.75 + "preferred in 2 of 3
  comparisons") tetap utuh. Catatan proses: run gerbang pertama gagal di
  langkah unit oleh `/tmp` penuh (tmpfs 4,9 G terisi 3,9 G; errno 28
  ENOSPC dan -122 pada `tests/with-app-env.test.ts` +
  `tests/zpd-edges.test.ts`, keduanya tak terkait) — dihapus
  `/tmp/node-compile-cache` (3,5 G, cache yang bisa dibuat ulang) lalu
  `npm run ci` utuh diulang tanpa perubahan kode dan hijau penuh. Tanpa
  perubahan aplikasi/perilaku/skema/RPC/migrasi/dependensi.
  `npm run ci` hijau (install, typecheck, lint 0/0, 913/913 unit = 896 + 17,
  build, anggaran bundel, CSP build produksi, smoke Playwright + PGlite).

- 2026-11-16: PR #86 — test: test unit langsung penjaga evidence
  `src/lib/evidence/service.ts` — `requiresEvidence`, `guardGraphCall`,
  `seedDemoQuestions` (10 test di `tests/evidence-guards.test.ts`, node:test;
  satu PGlite on-disk + migrasi asli via `openTestWorkspaces`, baris `user`
  per owner karena `owner_id` ber-FK; 11 owner terpisah agar urutan test tidak
  saling mengunci), modul tidak diubah. Dikunci: `requiresEvidence` — konsep
  polos → `{required: false, concept: node, questions: 0}`; bank sendiri →
  `required: true` + jumlah; flag `evidenceRequired` tanpa soal →
  `required: true, questions: 0`; konsep hilang → `{required: false,
concept: null, questions: 0}`; soal owner lain pada id konsep sama tidak
  terlihat (tiap owner melihat konsepnya sendiri: 'Mine' vs 'Theirs').
  `guardGraphCall` — method selain `setKnowledgeState` (`addConcept`/
  `deleteConcept`/`setLearnerProfile`) diteruskan dengan identitas array;
  patch hanya `nextReview`, hanya `misconceptions`, atau keduanya lolos utuh
  walau konsep ber-soal; patch `{}`/`{mastery: undefined}`/`null` lolos
  (rough edge: `patch ?? {}` sehingga `null` diperlakukan seperti kosong);
  patch ber-field bukti (`mastery`, `reviewCount`+`lastReviewed`,
  `retentionStrength`, `lastAssessed`, `interactions`) →
  `EvidenceRequiredError` persis varian `its quiz`; konsep japanese ber-flag
  → varian `the Japanese page`; konsep japanese ber-soal tanpa flag juga
  memakai varian Japanese (wording ikut domain, bukan alasan quiz-checked);
  konsep tanpa soal: patch tanpa `mastery` → args identitas, patch dengan
  `mastery` → elemen ketiga `{...patch, masterySource: 'manual'}` (menimpa
  `'quiz'` palsu, `reviewCount` dipertahankan, patch pemanggil tidak
  dimutasi); konsep hilang tetap lolos penjaga dan tetap distempel `manual`
  bila ber-`mastery` (rough edge; penulisan state gagal belakangan).
  `seedDemoQuestions` — flag `seed:demo-questions` sudah ada → 0 tanpa
  menulis dan flag lama utuh; workspace 11 konsep demo → 44 (4 per konsep;
  bank `arithmetic` sama persis dengan `DEMO_QUESTIONS` ber-urutan id), flag
  `{at ISO wall-clock ≥ startedAt, added}` → panggilan kedua 0; skip: konsep
  demo domain diubah editor (`arithmetic` → `my-course`), konsep demo sudah
  punya bank sendiri (`fractions` 1 soal), konsep demo hilang, konsep
  non-demo (8 masuk dari `pre-algebra`+`linear-equations`); isolasi owner
  (seed owner lain tidak mengisi workspace ini; masing-masing bisa menabung
  44); konflik id lintas konsep → 43, `arithmetic` hanya dapat 3 soal
  (`demo-arithmetic-2..4`), baris penghalang tetap di konsepnya dengan
  prompt asli. Penjaga statis: urutan `requiresEvidence` (getConcept →
  filter `owner_id` → `concept_id` → `Number(row?.n ?? 0)` →
  `concept?.evidenceRequired === true || questions > 0`); urutan
  `seedDemoQuestions` (flag → counts → loop → per-demo
  `replace('concept:', '')`/`getConcept`/cek domain+bank `continue` →
  `DEMO_QUESTIONS.filter` → `onConflict ... doNothing`+`returning('id')` →
  `added += inserted.length` → `setMeta(..., { at, added })`), tanpa
  `doUpdateSet`/`updateTable`; urutan `guardGraphCall` (method duluan,
  filter `undefined`, `NON_EVIDENCE_FIELDS` tepat `nextReview`+
  `misconceptions`, `requiresEvidence`, lempar, cabang
  `mastery === undefined ? args : [...patch, masterySource 'manual']`);
  empat judul lama `tests/learning-evidence.test.ts` tetap utuh. Catatan
  proses: sesi otomasi sebelumnya terputus setelah push + `gh pr create`
  (#86) dan baru mengubah baris header `state.md` tanpa commit; sesi ini
  mengambil alih branch `test/evidence-guards` lewat branch lokal
  `test/evidence-guards-takeover` (tanpa mengubah file test), menjalankan
  ulang `npm run ci` utuh untuk verifikasi, lalu melengkapi state dan merge.
  Tanpa perubahan aplikasi/perilaku/skema/RPC/migrasi/dependensi.
  `npm run ci` hijau (install, typecheck, lint 0/0, 896/896 unit = 886 + 10,
  build, anggaran bundel, CSP build produksi, 110 cek smoke Playwright +
  PGlite).

- 2026-11-16: PR #85 — test: test unit langsung laporan mandiri evidence
  `src/lib/evidence/service.ts` — `recordSelfReport` (12 test di
  `tests/evidence-self-reports.test.ts`, node:test; satu PGlite on-disk +
  migrasi asli via `openTestWorkspaces`, baris `user` per owner karena
  `owner_id` ber-FK; 11 owner terpisah agar urutan test tidak saling mengunci),
  modul tidak diubah. Dikunci: penjaga — learner/konsep hilang → `EvidenceError`
  persis `'That learner no longer exists.'`/`'That concept no longer exists.'`
  tanpa baris `knowledge_states`/`learning_events` (dihitung SQL mentah);
  konsep ber-soal dan konsep `evidenceRequired` domain japanese →
  `EvidenceRequiredError` persis `“Quizzy” is quiz-checked: its mastery only
changes through its quiz.`/`“Hiragana” ... through the Japanese page.` untuk
  keempat hasil yang mengubah mastery tanpa menulis apa pun; `snooze`/
  `unsnooze` lolos penjaga walau konsep ber-soal (dua event `snooze:snoozed`/
  `unsnooze:unsnooze`); soal owner lain pada id konsep sama tidak memblokir
  laporan owner ini. State — `got-it` tanpa state `{mastery: 85}` +
  `masterySource 'self_report'`, retention 0.8, reviewCount 0,
  `lastReviewed`/`lastAssessed`/`nextReview` = argumen `now`; state 80 → 85
  dengan reviewCount 5 dan interaksi lama dipertahankan; `started`
  clamp(max(m+20,50),0,79) untuk 0/59/79 dan tetap 80/85 dengan
  reviewCount/retention lama (`?? 0`/`?? 0.5` untuk state baru);
  `remembered` clamp(max(m,40)+5,0,100) (0→45, 85→90, 20→45) reviewCount +1
  retention round2(min(1,+0.1)); `forgot` clamp(m−20,40,100) (0→40, 85→65,
  50→40) reviewCount 0 retention round2(max(0.1,−0.2)). Interaksi — satu entri
  `{timestamp now, type lesson/review, duration 0}` per hasil yang mengubah
  mastery (`got-it`/`started` lesson, `remembered`/`forgot` review), riwayat
  sah urut (field opsional score/bloomLevel/notes selamat), entri rusak
  dibuang (timestamp rusak, type asing, bukan objek, tanpa duration, duration
  negatif), entri baru selalu akhir, cap `MAX_INTERACTIONS` 1000 (1000 lama +
  1 baru → 1000, entri lama pertama terbuang); state lama tanpa `interactions`
  (ditulis mentah via `PostgresGraphStore.put('state:...')`) → array satu
  entri baru. Event — tepat satu per panggilan `study:got-it`/`study:started`/
  `review:remembered`/`review:forgot`/`snooze:snoozed`/`unsnooze:unsnooze`,
  `source 'app'`, `detail {}`, `correct`/`total` null, `masteryBefore` 0 tanpa
  state, `createdAt` ISO (default DB); `wasDue` `reviewWasDue(prior,
difficulty 5, now)`: state lewat jadwal (mastery 85, reviewCount 1, 40 hari)
  → true untuk remembered/snooze/unsnooze (reviewCount 1→2, retention 0.9),
  state 1 jam → false, kind `study` selalu false walau state lewat jadwal.
  Snooze/unsnooze — hanya `nextReview` = `now + SNOOZE_DAYS` (1 hari); state
  baru tanpa field lain (mastery 0, `masterySource` undefined, interactions
  []); unsnooze kembali ke `lastReviewed`/`firstSeen` bila ≤ now — tanggal
  terpilih dinormalkan `new Date(t).toISOString()` ber-milidetik `.000Z`
  (bukan string mentah) — fallback `now` bila tanggal tidak sah (`not-a-date`)
  atau masa depan; snooze lalu unsnooze mengembalikan jadwal semula.
  Penjaga statis: urutan `requireLearnerAndConcept` < `requiresEvidence`/
  `getKnowledgeState` < gerbang `changesMastery && (await requiresEvidence` <
  `setKnowledgeState` < `appendEvent`; `SELF_REPORT_KIND` memetakan keenam
  hasil persis; `outcome === 'snooze' ? 'snoozed' : outcome`; `wasDue` kind
  study dipaksa false; `masterySource: 'self_report'`;
  `sanitizeInteractions(prior?.interactions)` + `.slice(-MAX_INTERACTIONS)`;
  dua judul lama `tests/learning-evidence.test.ts` tetap utuh. Catatan proses:
  `node_modules` belum ada di worktree sehingga `npm ci` dijalankan lebih dulu;
  run test awal menyisihkan dua asersi draf (regex `isIso` kehilangan pemisah
  `T`; `applyUnsnooze` menormalkan tanggal ke ISO ber-milidetik) dan satu
  bug urutan pembuatan learner; setelah perbaikan, typecheck/lint 0/0 dan
  gerbang `npm run ci` utuh langsung hijau pada percobaan pertama. Tanpa
  perubahan aplikasi/perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau
  (install, typecheck, lint 0/0, 886/886 unit = 874 + 12, build, anggaran
  bundel, CSP build produksi, smoke Playwright + PGlite 107 baris PASS).

- 2026-11-16: PR #84 — test: test unit langsung sesi kuis evidence
  `src/lib/evidence/service.ts` — `startQuiz`/`submitQuiz` (10 test di
  `tests/evidence-quiz-sessions.test.ts`, node:test; satu PGlite on-disk +
  migrasi asli via `openTestWorkspaces`, baris `user` per owner karena
  `owner_id` ber-FK; 11 owner terpisah agar urutan test tidak saling mengunci),
  modul tidak diubah. Dikunci: `startQuiz` — learner/konsep hilang dan bank
  kosong → `EvidenceError` persis `'That learner no longer exists.'`,
  `'That concept no longer exists.'`, dan `“Nothing Here” has no quiz questions
yet.` tanpa baris `quiz_sessions` dan tanpa `random.uuid`; undian hanya dari
  bank konsep + owner itu (`QUIZ_LENGTH` 3, bank 2 → dua soal), respons
  `{sessionId, conceptId, conceptName, questions}` dengan tiap soal hanya
  `{id, prompt, options}`; snapshot mentah memuat
  `{id,prompt,options,answer,explanation}` (explanation `''`), `answers`/
  `correct`/`completed_at` null, `total` benar, `owner_id`/`learner_id`/
  `concept_id` benar, `created_at` ISO; `random.uuid` tepat sekali. Undian
  pengulangan: sesi selesai sebelumnya (id 0–2) membuat bank 6 memilih 3 id
  baru tanpa id lama dan bank 5 memilih dua baru + satu lama. Opsi diacak
  salinan (`int` 0 → rotasi kiri) dan baris bank tetap urut semula. `submitQuiz`
  — sesi tak dikenal dan sesi owner lain → persis `'This quiz was not found.
Start a new one.'`; submit kedua → persis `'This quiz is already graded.
Start a new one.'`; jawaban kosong atau bukan opsi → `QuizAnswerError` persis
  `'Answer every question first.'` tanpa mengubah `completed_at`/`answers`/
  `correct`, state, atau event. Lulus 3/3: kembalian persis 9 kunci dengan
  feedback `{questionId, picked, correct, prompt, answer, explanation}`; sesi
  `answers` jsonb + `correct` 3 + `completed_at` = `now`; state `masterySource`
  `quiz`, mastery 85, retention 0.8, reviewCount 0,
  `lastReviewed`/`lastAssessed`/`nextReview` = `now`; satu event `quiz:passed`
  correct/total 3, masteryBefore 0 / masteryAfter 85, `detail.sessionId` +
  `detail.answers`, source `app`, wasDue false, createdAt ISO (default DB, bukan
  `now`). Gagal 2/3, 1/3, 0/3 → outcome `failed`, mastery 47/23/0, retention
  0.3, reviewCount 0, `nextReview` = `now`. `wasDue` state lewat jadwal → true
  dan reviewCount 1 → 2, retention 0.9; state belum due → false, reviewCount 2
  dan `lastReviewed` lama dipertahankan, `nextReview` tetap absen. Konsep
  dihapus setelah mulai (bank ikut cascade kosong) tetap dinilai: `conceptName`
  = `conceptId`, state dan event tetap dibuat. Penjaga statis: urutan
  `requireLearnerAndConcept` < `listQuestions`, `completedAttempts` <
  `pickQuestions`, snapshot `answer`/`explanation` +
  `shuffled(q.options, random.int)` + `jsonb(questions)` + view map tanpa
  answer, `random.uuid()` tepat satu; submit memfilter `owner_id` + `id`, cek
  `completed_at` sebelum `gradeQuiz`, satu `updateTable('quiz_sessions')`
  dengan guard `completed_at is null` + `returning('id')`, `if (!done)` sebelum
  `quizStatePatch` → `appendEvent`; tiga judul lama di
  `tests/learning-evidence.test.ts` tetap utuh. Catatan proses: run gerbang
  pertama gagal hanya di smoke pada cek fokus "Skip to content" saat beban
  mesin bersama tinggi (load ± 8 di 4 core, dev server "Failed to fetch");
  typecheck/lint/unit/build/anggaran/CSP sudah hijau pada run itu. Setelah load
  turun (± 2,5), `npm run ci` utuh diulang tanpa perubahan kode dan hijau penuh.
  Tanpa perubahan aplikasi/perilaku/skema/RPC/migrasi/dependensi.
  `npm run ci` hijau (install, typecheck, lint 0/0, 874/874 unit = 864 + 10,
  build, anggaran bundel, CSP build produksi, 185 cek smoke Playwright +
  PGlite).

- 2026-11-16: PR #83 — test: test unit langsung bank soal evidence
  `src/lib/evidence/service.ts` — `saveQuestion`/`deleteQuestion`/
  `listQuestions`/`questionCounts` (12 test di
  `tests/evidence-questions.test.ts`, node:test; satu PGlite on-disk + migrasi
  asli via `openTestWorkspaces`, baris `user` per owner karena `owner_id`
  ber-FK; 14 owner terpisah agar urutan test tidak saling mengunci), modul
  tidak diubah. Dikunci: `saveQuestion` — konsep hilang → `EvidenceError`
  persis `'That concept no longer exists.'` tanpa baris dan tanpa `newId`;
  tanpa `input.id` → `newId()` tepat sekali (id dipakai, `explanation`
  `undefined` → `''`, nilai balik = baris tersimpan); `input.id` baru dipakai
  apa adanya tanpa `newId`; id lama diganti di tempat (jumlah tetap 1, isi baru
  menang) dan mengganti sambil mengubah `conceptId` memindahkan baris
  (`questionCounts` + `listQuestions`); cap 50 hanya jalur baru — 49 + 1
  generated = 50, ke-51 (generated maupun id eksplisit baru) → `EvidenceError`
  `'A concept can have at most 50 questions.'` tanpa baris, sedangkan
  mengganti id lama saat konsep tujuan penuh tetap boleh (rough edge);
  `newId()` mengembalikan id yang sudah ada → persis
  `'Could not create the question, please try again.'` tanpa menimpa baris
  lama. `deleteQuestion` — tepat satu baris owner itu, salinan id sama milik
  owner lain utuh, id absen tidak melempar, dan konsep yang tinggal kosong
  hilang dari `questionCounts`. `listQuestions` — urut `concept_id` →
  `created_at` → `id` (`created_at` dikendalikan lewat UPDATE SQL mentah; seri
  → urut id), filter konsep, tanpa filter = seluruh workspace, owner lain tak
  terlihat, `options` jsonb selalu array string (`[2,true]` → `['2','true']`,
  objek → `[]`) dan `explanation` selalu string. `questionCounts` — hanya
  konsep bersoal, nilai number, konsep kosong absen, workspace kosong `{}`,
  owner lain terpisah. Rough edge tambahan dikunci: memindahkan soal lama ke
  konsep yang sudah 50 menghasilkan 51 baris karena cap hanya di cabang
  `!existing`. Penjaga statis: `listQuestions` memfilter `owner_id` + urutan
  ketiga kolom; `saveQuestion` cek konsep sebelum `newId`, kedua sebutan
  `MAX_QUESTIONS_PER_CONCEPT` di dalam cabang `!existing`,
  ``onConflict ... doUpdateSet({ ...values, updated_at: sql`now()` })``, satu
  `insertInto('quiz_questions')`, tanpa `updateTable`; `deleteQuestion` filter
  `owner_id` + `id`; dua judul lama di `tests/learning-evidence.test.ts` tetap
  utuh. Catatan proses: dua asersi draf awal salah terhadap kode
  (`MAX_QUESTIONS_PER_CONCEPT` muncul dua kali di `saveQuestion` — perbandingan
  dan pesan; typecheck menolak `counts.cc` pada tipe hasil ter-infer
  `{ca,cb}`) dan diperbaiki sebelum gerbang; probe awal mengonfirmasi seluruh
  perilaku cap/move. Tanpa perubahan aplikasi/perilaku/skema/RPC/migrasi/
  dependensi. `npm run ci` hijau (install, typecheck, lint 0/0, 864/864 unit =
  852 + 12, build, anggaran bundel, CSP build produksi, 185 cek smoke
  Playwright + PGlite).

- 2026-11-15: PR #82 — test: test unit langsung bank soal demo
  `src/lib/evidence/demo-questions.ts` (7 test di `tests/demo-questions.test.ts`,
  node:test murni, impor dataset langsung, tanpa PGlite/DOM), modul tidak
  diubah. Dikunci: tepat 44 soal; 44 id eksplisit berurutan
  `demo-<conceptId>-1..4` (salinan eksplisit) dan unik, semuanya cocok
  `^[A-Za-z0-9_-]{1,64}$`; 11 `conceptId` = id `demoConcepts` (`concept:`
  di-strip) dalam urutan sama (salinan eksplisit dicocokkan dengan
  `demoConcepts`), masing-masing tepat 4 soal dengan prompt berbeda, tanpa
  konsep asing. Semua soal lolos `questionInput.safeParse` dengan
  id/conceptId diteruskan apa adanya; prompt/answer/explanation terisi tanpa
  spasi liar (nilai == hasil trim) dan dalam batas 500/200/1000. Opsi 3–4: 43
  soal 4 opsi, satu-satunya 3 opsi `demo-fractions-4` "Which is larger, 3/8 or
  1/2?" dengan opsi persis `['3/8', '1/2', 'They are equal']` dan answer
  `1/2`; tiap opsi unik dan 1..200 karakter; answer muncul tepat sekali.
  Penjaga statis: `demo-questions.ts` hanya satu `import type { QuizQuestion }`
  dari `./quiz.ts` tanpa impor runtime; scan seluruh `src/` (`ts`/`tsx`
  kecuali modul itu dan `service.ts`) tanpa `DEMO_QUESTIONS`/`demo-questions`
  lain; `service.ts` mengimpor `DEMO_QUESTIONS` dan `seedDemoQuestions`
  memfilter per `conceptId`; asersi lama di `tests/learning-evidence.test.ts`
  ("ships at least 3 valid questions…", `qs.length >= 3`, id unik) dan test
  seeding di `tests/learn-in-app.test.ts` tetap utuh. Catatan proses:
  `node_modules` belum ada di worktree sehingga `npm ci` dijalankan lebih
  dulu; typecheck pra-gerbang menolak `Set` hasil `demoIds` yang ter-infer
  union literal saat `has(q.conceptId: string)` — diperbaiki dengan
  `Set<string>` sebelum gerbang; prettier tidak mengubah format. Tanpa
  perubahan aplikasi/perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau
  (install, typecheck, lint 0/0, 852/852 unit = 845 + 7, build, anggaran
  bundel, CSP build produksi, 180 cek smoke Playwright + PGlite).

- 2026-11-15: PR #81 — test: test unit langsung layanan konten server
  `src/lib/content/service.ts` (11 test di `tests/content-service.test.ts`,
  node:test; satu PGlite on-disk + migrasi asli via `openTestWorkspaces`,
  baris `user` per owner karena `owner_id` ber-FK; lima owner terpisah agar
  urutan test tidak saling mengunci), modul tidak diubah. Dikunci:
  `seedDemoContent` — konsep demo dihapus / domain diubah editor / sudah punya
  konten sendiri dilewati tanpa menulis baris (diverifikasi `contentCounts`);
  konsep lain tetap 3 item; nilai balik 9; flag `seed:demo-content` ditulis
  `{ at ISO, added: 9 }` sehingga panggilan kedua 0; id bentrok di konsep
  non-demo (id `demo-arithmetic-text` milik `extra`) membuat `onConflict ...
doNothing` hanya memasukkan 17 dari 18 dan baris lama tetap utuh.
  `saveContent` — id sama mengganti item (jumlah tetap 1, `newId` tidak
  dipanggil untuk update); normalisasi `solution=''` untuk non-exercise dan
  `url=null` untuk non-link/video walau input menyediakannya (teks/exercise/
  link/video; nilai tersimpan = nilai kembali); batas 50 per konsep — 49+1
  sah, ke-51 `EvidenceError` "at most 50" tanpa baris baru, mengganti id di
  angka 50 tetap boleh. `deleteContent` tepat satu item owner; salinan id sama
  pada owner lain utuh. `listContent` urut `concept_id` → `position` → `id`
  (aa: m,a,z lalu bb: n) dan filter konsep. `contentMinutes` menjumlah menit
  eksplisit + fallback 2 non-link / 0 link (mm = 15, aa = 6, bb = 2, konsep
  tanpa konten absen). `recordLessonOpened` learner/konsep hilang →
  `EvidenceError` "no longer exists" dan `listEvents` tetap kosong. Penjaga
  statis: dalam `saveContent` tepat satu `const values`, satu `solution:`/
  `url:`, satu `insertInto`, tiga `...values` (insert, conflict update, nilai
  kembali), tanpa `updateTable`; empat asersi lama di
  `tests/learn-in-app.test.ts` tetap utuh (dirujuk, bukan diduplikasi); scan
  `DEMO_CONTENT` tetap di `tests/demo-content.test.ts`. Catatan proses: probe
  awal menyingkap dua asersi draf keliru (urutan `listContent` dengan id UUID
  acak, bukan urutan input — diperbaiki dengan id eksplisit; dan `...values`
  muncul tiga kali, bukan dua) sebelum gerbang; prettier merapikan format.
  Tanpa perubahan aplikasi/perilaku/skema/RPC/migrasi/dependensi.
  `npm run ci` hijau (install, typecheck, lint 0/0, 845/845 unit = 834 + 11,
  build, anggaran bundel, CSP build produksi, smoke Playwright + PGlite).

- 2026-11-15: PR #80 — test: test unit langsung dataset konten pelajaran demo
  `src/lib/content/demo-content.ts` (12 test di `tests/demo-content.test.ts`,
  node:test murni, impor dataset langsung, tanpa PGlite/DOM), modul tidak
  diubah. Dikunci: `DEMO_CONTENT` tepat 18 item dengan urutan id persis
  (salinan eksplisit 18 id `demo-<conceptId>-<kind>` berurutan) dan unik; enam
  `conceptId` = id matematika `demoConcepts` (`concept:` di-strip) dalam
  urutan sama (salinan eksplisit); per konsep kind persis
  `['text','example','exercise']` dengan `position` 0/1/2 dan title/body tak
  kosong; metadata seragam — `url: null`, `language: 'en'` (UI pelajar bahasa
  Inggris, D2), `source: 'LearnGraph example content'`, menit bulat 1..10
  (aktual 2..4); `solution` tak kosong hanya untuk exercise, `''` untuk
  text/example; semua item lolos `contentInput.safeParse` dengan menit dan id
  diteruskan apa adanya; `orderContent` tiap preferensi per konsep → tepat 3
  item tanpa duplikat dengan urutan kind dikunci (explain-first
  text/example/exercise, example-first example/text/exercise, practice-first
  exercise/example/text); tiap body & solusi `parseRichText` → ≥ 1 blok tanpa
  bagian teks kosong dan body tidak blank; tipografi Unicode utuh sebagai
  teks setelah parse (−, ×, ÷ di teks & solusi aritmetika, ² di teks
  kuadratik, ✓ di tiga contoh aljabar); `lessonMinutes` per konsep = jumlah
  menit eksplisit (salinan eksplisit: empat konsep pertama 8, dua terakhir
  11). Penjaga statis: scan seluruh `src/` (`ts`/`tsx` kecuali modul itu dan
  `service.ts`) tanpa `demo-content`/`DEMO_CONTENT` lain; `service.ts` tetap
  mengimpor dataset dan seeding memfilter `DEMO_CONTENT` per konsep;
  `demo-content.ts` hanya `import type { ContentItem }` dari `./content.ts`
  tanpa impor runtime; asersi lama "ships a complete example subject..." dan
  "accepts lesson items and only https links" di `tests/learn-in-app.test.ts`
  tetap utuh. Catatan proses: probe modul sebelum menulis test menyisihkan
  satu draf asersi yang tak cocok dengan data (✓ hanya di tiga contoh
  aljabar, bukan semua contoh) dan typecheck pra-gerbang menolak perbandingan
  `c.minutes >= 1` tanpa penyempitan (`Number.isInteger` bukan type guard —
  dikejar dengan cek `typeof`), lalu prettier merapikan format. Tanpa
  perubahan aplikasi/perilaku/skema/RPC/migrasi/dependensi. `npm run ci`
  hijau (install, typecheck, lint 0/0, 834/834 unit = 822 + 12, build,
  anggaran bundel, CSP build produksi, smoke Playwright + PGlite).

- 2026-11-15: PR #79 — test: test unit langsung modul konten pelajaran
  `src/lib/content/content.ts` (32 test di `tests/content.test.ts`,
  node:test murni, impor modul langsung, tanpa PGlite/DOM), modul tidak
  diubah. Dikunci: konstanta `CONTENT_KINDS`/`FORMAT_PREFERENCES` salinan
  eksplisit + satu label per nilai + `MAX_CONTENT_PER_CONCEPT = 50` +
  `FORMAT_TAG_PREFIX = 'format:'`; `contentInput` — minimal `{conceptId,
kind, title, body}` sah dengan default `{solution:'', url:null,
minutes:null, language:'en', source:'', position:0}`, kunci asing
  dibuang, title di-trim lalu 1..200 (200 sah/201 gagal), body/solution
  ≤ 20.000 tanpa trim, url `''` → null (sah untuk kind teks, tetap ditolak
  untuk link), hanya `https://` sah (http/ftp/relatif/rusak gagal) dan
  di-trim, link/video wajib url + body boleh kosong sedangkan text/example/
  exercise wajib body tak kosong setelah trim, menit int 1..600 atau null
  (0/601/1.5 gagal), bahasa `^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$` (`en`/`id`/
  `eng`/`en-US`/`nl-BE` lolos; `EN`/`e`/`english`/`en-US-x` gagal), posisi
  int 0..10.000, id opsional `^[A-Za-z0-9_-]{1,64}$`, `conceptId` lewat
  `writeId` (kosong/>128/`:`/spasi/kontrol gagal), kind di luar lima gagal;
  `determinePresentationStrategy` — tag `format:` sah menang `chosen` walau
  learningStyle menunjuk lain, tag `format:` **pertama** menentukan sehingga
  tag pertama tak sah menonaktifkan seluruh tag format lalu jatuh ke
  learningStyle (rough edge dikunci dua arah), kinesthetic → practice-first/
  suggested, visual → example-first/suggested, reading/auditory →
  explain-first/suggested, primary tak dikenal/tanpa learningStyle/learner
  null/undefined → explain-first/default, tag non-format diabaikan;
  `withFormatPreference` — semua tag `format:` lama dibuang, tag lain
  terjaga urutannya, tag baru di akhir, `null` hanya membuang, slice 50 hanya
  saat menambah (49 tag lain + pilihan → 50 dengan pilihan terakhir; 50 tag
  lain + pilihan → pilihan yang terbuang; jalur `null` tak memotong 51 —
  rough edge); `scoreContentMatch` matriks 15 nilai persis; `orderContent`
  skor menurun → posisi menaik → id localeCompare, skor tinggi tetap awal
  walau posisi besar, masukan tak dimutasi; `lessonMinutes` menjumlah menit
  eksplisit (termasuk 0 dan desimal), null/absen runtime → 2 kecuali link →
  0, `[]` → 0; `parseInline` — `**bold**`/`` `code` `` span bertanda, teks
  antar span utuh, penanda kosong (`****`, dua backtick) dan tak
  berpasangan tetap teks, span berurutan, `''` → `[]`; `parseRichText` —
  `\r\n`/`\r` dinormalkan, blok dipisah baris kosong (boleh berisi spasi,
  beberapa baris kosong = satu pemisah), baris paragraf di-trim lalu digabung
  satu spasi, `- `/`* ` (minimal satu spasi, boleh indentasi dan spasi
  ekstra) memulai `ul` dengan tiap item `parseInline`, paragraf ↔ daftar
  dua arah, `-`/`- `/`*` tanpa isi = paragraf marker telanjang (rough edge),
  body kosong/spasi → `[]`, `<b>`/`<script>` tetap teks. Penjaga statis:
  `content.functions.ts` memakai `contentInput` + `z.enum
(FORMAT_PREFERENCES)` + `z.enum(CONTENT_KINDS)` dan mengimpor
  `determinePresentationStrategy`/`orderContent` dari modul; rute
  `learn.$conceptId.tsx` memakai `withFormatPreference`/`orderContent`;
  `tutor/service.ts` mengimpor dan memanggil
  `determinePresentationStrategy(learner)`; `RichText.tsx` mengimpor
  `parseRichText` tanpa `dangerouslySetInnerHTML`/`innerHTML`; scan seluruh
  `src/` (`ts`/`tsx` kecuali modul itu) tanpa salinan `KIND_SCORES`/
  `FORMAT_TAG_PREFIX`/regex parser markup; empat asersi lama `tests/
learn-in-app.test.ts` tetap utuh. Catatan proses: probe modul sebelum
  menulis test menyisihkan dua draf asersi yang tak cocok dengan kode (url
  `''` pada kind `link` tetap ditolak refine; hasil `parseRichText` adalah
  array blok) dan typecheck pra-gerbang menolak helper `style` yang ter-infer
  string lebar — diperbaiki dengan `as const` (pola PR #77) sebelum gerbang;
  `npm run ci` lulus penuh pada percobaan pertama tanpa perubahan apa pun
  setelahnya. Tanpa perubahan aplikasi/perilaku/skema/RPC/migrasi/dependensi.
  `npm run ci` hijau (install, typecheck, lint 0/0, 822/822 unit = 790 + 32,
  build, anggaran bundel, CSP build produksi, smoke Playwright + PGlite).

- 2026-11-15: PR #78 — test: test unit langsung skor bukti belajar
  `src/lib/evidence/scoring.ts` (24 test di `tests/evidence-scoring.test.ts`,
  node:test murni, impor modul langsung, tanpa PGlite/DOM), modul tidak
  diubah. Dikunci: `PASS_RATIO = 0.8`; `passed` = `correct / max(1,total) >=
0.8` (4/5 true, 8/10 true, 3/4 & 7/10 false, 0/0 false, 1/0 true, 5/4 true);
  `evidenceMastery([])` → 0 dengan/tanpa opsi; gagal terakhir →
  `Math.round(accuracy*70)` (1/4 → 18, 2/4 → 35, 3/4 → 53, 0/4 → 0) dan
  menang atas pass sebelumnya; percobaan terakhir ditentukan `Date.parse`,
  bukan urutan array (dua arah diuji); default `delayedRetrieval` butuh pass
  kedua berjarak ≥ 86.400.000 ms (tepat di batas lolos, 1 ms kurang → 70)
  dengan gabungan id unik ≥ 4 (2+2 → 85; 3 id → 70; 2 id berbagi → 5 → 85);
  satu pass / dua pass hari sama → 70 walau id berbeda; `delayedRetrieval:
false` → 85 tanpa syarat jeda/id, gagal tetap `round(accuracy*70)`;
  `distinctQuestions` 2 → 85 untuk 2 id, 3 → 70, 0 → 85 pada pass berjeda
  (satu pass tetap 70); masukan tidak dimutasi. `nextQuizReview`: `[]` →
  null; gagal terakhir → ISO `at + 10 menit` (juga setelah dua pass); 1..7
  pass harian → +1/+2/+4/+8/+16/+30/+30 hari (tanggal persis dikunci); pass
  hari sama tidak menambah; kegagalan me-reset hitungan (3 pass, gagal, 1
  pass → +1 hari); urutan array tak berpengaruh; masukan tidak dimutasi.
  Penjaga statis: `src/lib/japanese/evidence.ts` tepat satu baris re-export
  `evidenceMastery`/`nextQuizReview`/`type Attempt` dari
  `../evidence/scoring.ts` (komentar di-strip lalu dibandingkan persis),
  `scoring.ts` tanpa impor apa pun dan mengekspor tepat enam nama
  (`Attempt`, `PASS_RATIO`, `passed`, `EvidenceOptions`, `evidenceMastery`,
  `nextQuizReview`), quiz generik mengimpor `evidenceMastery, passed, type
Attempt` dari `./scoring.ts` dan memakai `delayedRetrieval: false` tanpa
  salinan `PASS_RATIO`/`passed`/`Math.max(1, …)` lokal, serta
  `japanese.functions.ts` tetap mengimpor dari `@/lib/japanese/evidence` dan
  tak pernah menyebut `delayedRetrieval` (kebijakan Jepang = default ketat).
  Tanpa perubahan aplikasi/perilaku/skema/RPC/migrasi/dependensi; tanpa
  perubahan `docs/ROADMAP.md` (tidak ada baris backlog yang tersentuh, sama
  seperti PR #77). `npm run ci` hijau (install, typecheck, lint 0/0,
  790/790 unit = 766 + 24, build, anggaran bundel, CSP build produksi, 177 cek
  smoke Playwright + PGlite). Catatan proses: run gerbang pertama gagal di
  smoke saat mesin bersama menjalankan suite proyek lain (load ± 8 di 4 core;
  dev server sempat "Failed to fetch" dan tombol **Sign out** terlepas dari
  DOM sebelum diklik); typecheck/lint/unit/build/anggaran/CSP sudah hijau pada
  run itu. Percobaan `npm run smoke` terpisah tidak valid karena skrip smoke
  mengharapkan server dev yang sudah berjalan (ERR_CONNECTION_REFUSED di
  `/admin/concepts`); server dev tidak dijalankan manual, sesuai TASK_PROMPT.
  Setelah load turun (± 1), `npm run ci` utuh diulang tanpa perubahan kode dan
  hijau penuh (smoke 1382 detik).

- 2026-11-15: PR #77 — test: test unit langsung perencana "Today's session"
  `src/lib/session.ts` (21 test di `tests/session.test.ts`, node:test murni,
  impor modul langsung, tanpa PGlite/DOM), modul tidak diubah. Dikunci:
  konstanta `REVIEW_MINUTES = 3`, `MIN_LESSON_MINUTES = 5`,
  `MAX_LESSON_MINUTES = 20`, `SESSION_LENGTHS = [15, 30, 45, 60]` (salinan
  eksplisit); `sessionPacing` — short/medium/long 15/25/40 dengan jeda 5,
  `undefined`/`null`/nilai tak dikenal → medium, `intensive` → 23/38/60 dengan
  jeda 3, `structured`/`self-paced`/pace tak dikenal tetap jeda 5;
  `lessonSitting` — 30/20 → 20, `null`/`undefined` → 10, pembulatan (7.5 → 8,
  4.6 → 5), clamp 5..20 (0/-5 → 5, 20.5 → 20), non-finite/non-number (NaN,
  ±Infinity, `'15'`) → 10; `buildSessionPlan` — review (3 menit) selalu
  mendahului pelajaran, `minutes` di-`floor` (29,9 → 29, dibuktikan dengan 10
  review: 9 muat di 29, 10 muat di 30) dan negatif → 0, item pertama selalu
  direncanakan walau melebihi anggaran (`minutes: 0` tetap satu langkah), item
  yang tak muat dilewati tanpa mengubah urutan sehingga item pendek
  berikutnya tetap muat, biaya jeda ikut dihitung saat memutuskan muat
  (6 menit review + jeda 5 + pelajaran 20 = 31; gagal di 30, muat di 31),
  jeda hanya di antara langkah (tidak di awal/akhir), `plannedMinutes` =
  jumlah semua langkah termasuk jeda, `focusMinutes`/`breakMinutes`
  diteruskan dari `sessionPacing` (intensive 38/3), `left` dihitung per jenis,
  `reviews`/`next` kosong → `steps: []`/nol, dan masukan tidak dimutasi.
  Rough edge dikunci sesuai perilaku aktual: `minutes: NaN` membuat semua item
  muat (perbandingan dengan NaN selalu false) tanpa memperbaiki modul.
  Penjaga statis: `session.ts` hanya `import type` (aman di bundle klien),
  `StudyToday.tsx` tetap mengimpor `buildSessionPlan` + `SESSION_LENGTHS` +
  `REVIEW_MINUTES` dari `@/lib/session` dan memakai ketiganya, serta ketiga
  test lama di `tests/learn-in-app.test.ts` tetap ada (tidak dipindah/dihapus).
  Catatan proses: run gerbang pertama gagal di typecheck karena array pace
  terinfer union literal sehingga `sessionPacing('short', pace)` menolak
  `string`; diperbaiki dengan `as const` untuk pace sah + asersi terpisah
  untuk nilai tak dikenal, lalu gerbang penuh diulang. Tanpa perubahan
  aplikasi/perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau
  (install, typecheck, lint 0/0, 766/766 unit = 745 + 21, build, anggaran
  bundel, CSP build produksi, 177 cek smoke Playwright + PGlite).

- 2026-11-15: PR #76 — perf: gerbang anggaran ukuran bundel klien di CI
  (backlog P3 #4). Pengukuran build produksi preset Nitro `vercel` membuktikan
  code-splitting halaman graph **sudah** terjadi: `graph-*.js` 19.947 B,
  `combined-graph-*.js` 15.848 B, `domains-*.js` 22.392 B, React Flow di chunk
  bersama `esm-*.js` 176.445 B; entry bersama `index-*.js` 308.127 B; 85 berkas
  `.js` total 1.648.225 B (terbesar setelah entry: `profile-*.js` 177.808 B).
  Yang ditambahkan penjaganya: `scripts/check-bundle.mjs` (pola `check-csp.mjs`,
  `// @ts-check` + JSDoc, fungsi murni `checkBudgets(assets, budgets)`, `main`
  berpagar `import.meta.url`, hanya impor `node:`), anggaran bernama
  `ENTRY_MAX_BYTES` 339.000 / `CHUNK_MAX_BYTES` 339.000 / `TOTAL_MAX_BYTES`
  1.814.000 (= angka terukur + ±10 %), berkas non-`.js` diabaikan, problem urut
  nama berkas dengan total terakhir, ringkasan gagal menyebut anggaran yang
  dilanggar. `scripts/ci.mjs` menjalankan langkah **bundle budget on the
  production build** tepat setelah `build` (sebelum CSP) dan membaca
  `.vercel/output/static/assets/*.js` tanpa build kedua. `docs/ROADMAP.md`:
  baris P3 #4 dicoret + entri log bertanggal. Test baru
  `tests/check-bundle.test.ts` (18): lolos tepat di tiap anggaran/gagal 1 byte
  di atas, tiap aturan terpisah, klasifikasi entry vs `graph-*.js`/`index.js`/
  `Index-*.js`, non-`.js` diabaikan, urutan stabil, daftar kosong → `[]`, plus
  penjaga statis (pagar `main`, impor hanya `node:`, path build yang ada,
  konstanta bernama, urutan langkah CI build→bundel→CSP). Tanpa perubahan
  aplikasi/rute/skema/RPC/migrasi/dependensi. `npm run ci` hijau (install,
  typecheck, lint 0/0, 745/745 unit, build, anggaran bundel, CSP build
  produksi, 177 cek smoke Playwright + PGlite). Catatan proses: run gerbang
  pertama gagal di langkah smoke oleh beban mesin bersama (load ± 7 di 4 core;
  langkah smoke 1185 detik). Smoke diulang terpisah hijau 177/177 tanpa
  perubahan apa pun, lalu `npm run ci` utuh diulang dan hijau penuh.

- 2026-11-15: PR #75 — fix: tambal kerentanan audit dependensi dalam rentang.
  `npm audit fix` (tanpa `--force`) → `zod` 4.6.5 → 4.6.7
  (GHSA-mrhx-c7xc-m3w5, tinggi; Zod dipakai untuk semua validasi input server
  lewat `src/lib/graph/rpc-schemas.ts`) dan `seroval` 1.6.9 → 1.8.1
  (GHSA-f86p-h4j2-7qgj, GHSA-9wx9-5pv9-3349; serialisasi RPC TanStack Start),
  plus patch transitif dalam rentang: `@better-auth/*` 1.6.33 → 1.6.34,
  `@typescript-eslint/*` 8.71.1 → 8.72.2, `better-call` 1.4.0 → 1.4.5,
  `@better-fetch/fetch` 1.3.1 → 1.3.3, `@better-auth/utils` 0.4.2 → 0.5.1,
  `set-cookie-parser` 3.1.3 → 3.2.2 (hanya `package-lock.json`). Bagian
  opsional dikerjakan: `better-auth` `~1.6.30` → `~1.7.25` (minor, bukan
  mayor) menutup **kritis** GHSA-44jh-23m7-hpcf — rate limit Better Auth di
  PostgreSQL bisa terlampaui permintaan konkuren lewat adapter
  Kysely/Drizzle; kedelapan paket `@better-auth/*` naik ke 1.7.25. Tanpa
  perubahan kode aplikasi: `src/lib/auth/server.ts` tetap memakai
  `better-auth`, `better-auth/tanstack-start`, `better-auth/api`; limiter
  bawaan tetap storage Postgres dan gate per akun
  (`account-sign-in:<sha256(email)>`) tetap di modulnya sendiri —
  `tests/auth-rate-limit.test.ts` + `tests/account-rate-limit.test.ts` hijau
  tanpa perubahan. **Diketahui-ditinggalkan:** 7 temuan moderat sisa adalah
  rantai `typescript-eslint` (`@typescript-eslint/*` 8.72.2, `minimatch`
  10.2.6 bersarang di `typescript-estree`) — dev-only, tak ikut bundel
  produksi, dan `fixAvailable`-nya justru upgrade **mayor**
  `typescript-eslint` (di luar batas aman sesi otomatis). `npm audit`: 12 → 7
  temuan (2 rendah + 1 kritis + 1 tinggi hilang). `npm run ci` hijau
  (install, typecheck, lint 0/0, 727/727 unit, build, CSP build produksi,
  smoke Playwright + PGlite). Tanpa perubahan skema/RPC/migrasi/perilaku.

- 2026-11-15: PR #74 — test: test CLI langsung migrator deploy
  `scripts/migrate.mjs` (13 test di `tests/migrate-cli.test.ts`; node:test,
  anak via `spawnSync` karena modul memanggil `main()` saat impor — exit 0/1
  di level atas — sehingga tidak boleh diimpor; pola
  `tests/with-app-env.test.ts`), modul tidak berubah, tanpa database nyata
  (`DATABASE_URL` anak `postgres://127.0.0.1:1/db` → ECONNREFUSED instan).
  Dikunci: tanpa `DATABASE_URL` (env anak = salinan `process.env` minus
  `DATABASE_URL` dan `NODE_OPTIONS`; string kosong sama dengan tidak diisi)
  → exit 0 + pesan skip persis `[migrate] DATABASE_URL not set — skipping
(the PGLite fallback migrates itself).` dan stderr kosong; argumen CLI
  diabaikan (skip tetap); `.env` di samping skrip tidak dibaca (salinan
  skrip + `.env` berisi DATABASE_URL di root sementara, cwd root itu, tetap
  skip — mengunci modul beban-tanpa-dotenv). `DATABASE_URL` tak terjangkau
  pada checkout repo (9 migrasi pending) → exit 1 + baris mulai
  `[migrate] failed:` + ECONNREFUSED, stdout kosong; argumen tidak
  menyelamatkan. Jalur tanpa koneksi database (salinan `migrate.mjs` +
  `migration-plan.mjs` ke `tmp/x/scripts/` + **symlink** `node_modules` repo
  ke `tmp/x/node_modules` supaya impor `pg` tetap resolves; `migrations/`
  dihitung relatif lokasi salinan): direktori tidak ada → `[migrate] no
migrations/ directory — nothing to do.` exit 0; direktori ada tanpa
  `.sql` (README + subdir) → `[migrate] no migrations — nothing to do.`
  exit 0 — keduanya tetap exit 0 walau `DATABASE_URL` tak terjangkau (bukti
  pool tidak dibuka sebelum cek pending; urutan ini yang melindungi deploy
  tanpa skema dari koneksi sia-sia); kontras: satu `.sql` pending → pool
  dibuka → exit 1 (membuktikan exit-0 memang karena tak ada pending, bukan
  karena URL diabaikan). Penjaga statis di sumber: skip (dengan
  `process.exit(0)`) mendahului `main().catch`; `pendingMigrations(entries,
[])` mendahului `new pg.Pool` dan tanpa logika basename lokal (tanpa
  `.split('/')`); tiap migrasi `BEGIN` < `INSERT INTO _migrations` <
  `COMMIT` dengan `ROLLBACK` di catch setelah INSERT; handler galat mencetak
  `[migrate] failed:` sebelum `process.exit(1)`. Salinan & symlink hanya di
  direktori sementara yang dibersihkan di `after`. Tanpa perubahan
  perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau (727/727 unit =
  714 + 13 baru, lint 0/0, build, CSP build produksi, smoke Playwright +
  PGlite 117 cek). Catatan proses: run gerbang pertama gagal di smoke oleh
  beban mesin bersama (suite test sesi lain berjalan, load 9 di 4 core; dev
  server tak responsif di tengah sesi — pola flake lingkungan yang tercatat
  di ROADMAP 2026-11-08); diulang setelah menunggu jendela load tenang dan
  hijau penuh tanpa perubahan apa pun. Dengan ini seluruh skrip `scripts/`
  yang punya logika (`migrate`, `check-csp`, `with-app-env`,
  `migration-plan`, `compare-databases`) sudah punya test langsung.

- 2026-11-15: PR #73 — test: test unit langsung gerbang CSP build produksi
  `scripts/check-csp.mjs` (fungsi murni `checkPage(html, csp)`, 25 test di
  `tests/check-csp.test.ts`, node:test murni, impor `.mjs` langsung), modul
  tidak berubah sama sekali (JSDoc yang ada sudah cukup untuk `checkJs`).
  Dikunci: direktif `script-src` ditemukan di awal maupun setelah `;`, nilai
  dipisah spasi dan di-trim (spasi ganda di dalam/val sekitar daftar tetap
  terbaca), tanpa direktif (string kosong, `default-src` saja, `script-src`
  tanpa spasi/nilai, directive di tengah policy tanpa `;`, nama direktif
  huruf besar) → tepat `['no script-src directive']`;
  `'unsafe-inline'`/`'unsafe-eval'` satu problem per nilai, inline selalu
  sebelum eval terlepas urutan policy dan sebelum problem per-script; nonce —
  cocok lolos, beda → hash, beda + hash diizinkan → lolos, nonce base64
  (`+`/`/`/`=`) utuh, nonce pertama policy menang; hash — `sha256-` dari isi
  persis (indentasi/baris baru ikut; hash isi ter-trim tidak cocok), satu
  hash untuk banyak tag sama, pesan memotong isi ke tepat 80 karakter;
  script eksternal — `https://` dan `//…` wajib `nonce="<nonce policy>"`
  (tanpa/beda → `external script without the nonce: <src>`), `src` lokal,
  `data:`, `ftp://` tidak diperiksa walau nonce salah; beberapa tag
  dikumpulkan urut dokumen; tag `<SCRIPT>` huruf besar + atribut tambahan
  (`TYPE`, `defer`, `nonce` di depan `src`) dikenali. Rough edge dikunci
  eksplisit sesuai perilaku aktual: `''.split(/\s+/) === ['']` membuat
  `script-src ;`/`script-src ` lolos guard "no directive" (berperilaku
  sebagai allowlist kosong — semua inline script dilaporkan), dan script
  eksternal tidak pernah dilaporkan bila policy tanpa nonce
  (`undefined !== undefined`). Catatan proses: dua klaim spekk keliru
  terhadap kode (`script-src ;` ≠ `no script-src directive`; spasi ganda
  justru dikenali karena nilai di-trim) — ditemukan dengan menjalankan
  modulnya dulu, test mengunci perilaku kode yang sebenarnya. Penjaga statis:
  `checkPage` diekspor, `main` hanya jalan saat
  `import.meta.url === file://${process.argv[1]}` (tidak ada fetch saat
  impor, tanpa `BASE_URL`), `PAGES` tepat tiga halaman publik
  (`/sign-in`, `/privacy`, `/forgot-password`). Tanpa perubahan
  perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau (714/714 unit,
  lint 0/0, build, CSP build produksi, smoke Playwright + PGlite).

- 2026-11-15: PR #72 — test: test unit langsung wrapper `.env`
  `scripts/with-app-env.mjs` (27 test di `tests/with-app-env.test.ts`,
  node:test murni, impor `.mjs` langsung, tanpa database), modul tidak berubah
  perilaku. Dikunci: `parseDotEnv` — LF/CRLF, baris kosong/komentar penuh
  dibuang, kunci dan nilai di-trim, pemisah `=` pertama (`E=a=b` → `'a=b'`),
  baris tanpa `=` dan kunci kosong (`=bad`) dilewati, prefiks `export ` hanya
  bila diikuti whitespace (`export I=9` → `I`, `exportJ=10` tetap), kutip
  tunggal/ganda yang berpasangan dibuang, kutip tak berpasangan dipertahankan,
  satu kutip menjadi `''`, `#` setelah `=` bagian nilai, nilai kosong → `''`,
  duplikat nilai terakhir menang, tanpa interpolasi/escape; `projectRoot` =
  root repo (induk `scripts/`); `readDotEnv` — `.env` tidak ada → `{}`,
  direktori sementara berisi `.env` → hasil parse, tidak menggabungkan
  `process.env`; `exitStatusFromChild` — `0`/kode nonnol diteruskan,
  `null`/`undefined` → 1, sinyal menang atas kode (`SIGINT` 130, `SIGTERM` 143,
  `SIGHUP` 129, `SIGKILL` 137), sinyal tak dikenal → 129; CLI lewat
  `spawnSync` — tanpa argumen → 2 + usage, sukses → 0 + stdout anak, kode
  nonnol diteruskan, argumen verbatim tanpa interpretasi shell, perintah hilang
  → 127 + `[with-app-env] failed to run`, `.env` dibaca dari root wrapper
  (bukan cwd), dan `process.env` menang atas `.env` (wrapper disalin ke
  direktori sementara; `.env` repo tidak dibaca/ditulis). Catatan proses: CI
  pertama gagal di typecheck karena `tsconfig` `checkJs` kini memeriksa `.mjs`
  yang diimpor test (implicit `any`); modul hanya diberi anotasi JSDoc +
  `@ts-check` (tanpa perubahan runtime) lalu gerbang penuh dijalankan ulang.
  Tanpa perubahan skema/RPC/migrasi/dependensi. `npm run ci` hijau (689/689
  unit, lint 0/0, build, CSP build produksi, smoke Playwright + PGlite).

- 2026-11-15: PR #71 — test: test unit langsung helper bookkeeping migrasi
  `scripts/migration-plan.mjs` (17 test di `tests/migration-plan.test.ts`,
  node:test murni, impor `.mjs` langsung, tanpa database), modul tidak diubah.
  Dikunci: `migrationName` — basename POSIX (`migrations/0001_users.sql` →
  `0001_users.sql`, `migrations/auth/0002_auth.sql` → `0002_auth.sql`), nama
  tanpa folder apa adanya, path kosong/`migrations/`/`/` → `''` (bukan
  fallback `?? path`), backslash bukan pemisah (perilaku saat ini);
  `isMigrationFile` — hanya akhiran persis `.sql` (`a.sql` dan `.sql` true;
  `a.SQL`, `a.sql.bak`, `a.sqlite`, `migrations/auth`, `README.md`, `''`
  false); `pendingMigrations` — iterable (array/`Set`/generator) tanpa
  memutasi masukan, entri non-`.sql` dibuang, hasil `{ name, path }`
  mempertahankan path asli, urut `localeCompare` basename bukan urutan
  masukan, hanya nama di `applied` yang dilewati dan entri asing diabaikan,
  kunci selalu basename (`0001_auth.sql` melewati salinan di
  `migrations/auth/`, tetapi `auth/0001_auth.sql` tidak mencocokkan), dua path
  basename sama keduanya dikembalikan, masukan kosong → `[]`, filter
  `applied` setelah sort (urutan deterministik). Penjaga statis: kedua
  applier mengimpor `pendingMigrations` dari modul yang sama, tidak ada
  salinan `.split('/').pop()` di pemanggil, dan modul bebas impor. Tanpa
  perubahan perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau
  (662/662 unit, smoke Playwright + PGlite tetap hijau).

- 2026-11-15: PR #70 — test: test unit langsung modul akses database
  server-only `src/lib/db.ts` (13 test di `tests/db.test.ts`, node:test
  murni), modul tidak diubah. PGlite palsu disuntikkan lewat
  `globalThis.__learngraphPglite__` sebelum impor dinamis, jadi bootstrap
  otomatis meng-`await` objek palsu (tanpa WASM atau `import.meta.glob`).
  Dikunci: `dbSource` — `'pglite'` saat `DATABASE_URL` kosong (seperti CI)
  dan saat hanya whitespace (nilai di-trim), `'postgres'` saat terisi lewat
  child process yang hanya mencetak `dbSource` tanpa memanggil `getDb()`
  atau membuka koneksi; `getDb()` — dengan `globalThis.window` terdefinisi
  melempar persis `'@/lib/db is server-only — use it from a server function.'`
  tanpa membuat/menyimpan instance dan tanpa menyentuh database, tanpa
  `window` dua panggilan mengembalikan objek Kysely yang sama dan
  menyimpannya di `__learngraphKysely__`; `ensureDbReady()` — menunggu
  promise PGlite yang sudah di-memoize (belum selesai sebelum promise
  dilepas, identitas promise tak berubah, tidak membuat instance Kysely);
  `dumpLocalJapaneseDatabase()` — tanpa `JAPANESE_LOCAL_ORIGIN` menolak
  persis `'Local backup is disabled.'` tanpa memanggil `dumpDataDir`, dengan
  env memanggil `dumpDataDir('gzip')` tepat sekali dan mengembalikan
  `Uint8Array` berisi byte yang sama (bukan `Blob`); env dan global
  dipulihkan. Penjaga statis: docblock server-only di awal modul, `dbSource`
  diturunkan dari `DATABASE_URL` ter-trim, bootstrap otomatis hanya bila
  `typeof window === 'undefined' && dbSource === 'pglite'`, cek `window`
  mendahului memoization, guard backup mendahului `dumpDataDir`. Tanpa
  perubahan perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau
  (645/645 unit, smoke Playwright + PGlite tetap hijau).

- 2026-11-15: PR #69 — test: test unit langsung dua modul util kecil,
  `src/lib/utils.ts` (`cn`, 8 test di `tests/utils.test.ts`) dan
  `src/lib/uuid.ts` (`uuidv4`, 4 test di `tests/uuid.test.ts`), node:test
  murni, modul tidak diubah. Dikunci pada `cn`: tanpa argumen → `''`; string
  digabung berurutan; konflik Tailwind diselesaikan `tailwind-merge`
  (`p-2`+`p-4` → `p-4`, `text-sm text-red-500`+`text-lg` →
  `text-red-500 text-lg`, urutan sisa dipertahankan); kelas tak berkonflik
  tetap (`px-2`+`py-3`); `false`/`undefined`/`null` dibuang; bentuk objek dan
  array `clsx` bekerja; hasil selalu string. Dikunci pada `uuidv4`:
  `crypto.randomUUID` dipanggil tepat sekali tanpa argumen dan nilainya
  diteruskan apa adanya; hasil nyata cocok pola UUID v4 (36 karakter, versi 4,
  varian `[89ab]`) dan 1000 pemanggilan tidak berulang; galat sumber acak
  diteruskan tanpa fallback. Stub `crypto` dipasang lewat
  `Object.defineProperty` dan deskriptor asli dipulihkan per test. Tanpa
  perubahan perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau
  (632/632 unit, 184 cek smoke).

- 2026-11-15: PR #68 — test: test unit langsung registri psikometrik
  `src/lib/graph/psychometrics.ts` (14 test di `tests/psychometrics.test.ts`,
  node:test murni), modul tidak diubah. Dikunci: 39 domain dalam urutan tetap
  (salinan eksplisit), kunci `PSYCHOMETRIC_DOMAINS` unik dan nilainya sama
  dengan kunci huruf kecil, `ALL_DOMAIN_IDS` = urutan nilai sumber,
  `DOMAIN_METADATA` tepat satu entri per id tanpa kunci asing; tiap metadata
  mengisi `id`/`name`/`description`/`educationalRelevance`, kategori salah satu
  dari 12 `DOMAIN_CATEGORIES`, dan `scoreInterpretation.low/mid/high` tidak
  kosong; partisi 12 kategori tanpa domain ganda (gabungan = 39),
  `getDomainsByCategory` memfilter dalam urutan registri dan kategori tak
  dikenal → `[]`, `getDomainMetadata` mengembalikan objek registri yang sama;
  `estimateCognitiveProfile` — fallback netral untuk skor kosong
  (`medium`/`medium`/`medium`/`mixed` karena 50), jendela 65/35 inklusif dan
  64/36 netral, tiap bidang membaca pasangan rumusnya (`executive_functions`
  ikut attention, `cognitive_abilities` ikut speed), angka telanjang legacy
  0–1/string/null/array diabaikan, `{ score: NaN }` menghasilkan `medium`
  karena rata-ratanya NaN (perilaku saat ini — bukan klaim validasi rentang);
  bentuk hasil tepat empat bidang. `getLearningStyleDescription` memakai frasa
  modalitas/sosial/pace persis dari sumber dalam template
  `You're a <frasa modalitas> who <sosial> and learns best <pace>.` (frasa
  modalitas sendiri sudah memuat "who …"), dan `secondary`/
  `feedbackPreference` tidak mengubah teks. Tanpa perubahan
  perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau (620/620 unit,
  177 cek smoke).

- 2026-11-15: PR #67 — test: test unit langsung dataset demo
  `src/lib/demo-data.ts` (25 test di `tests/demo-data.test.ts`, node:test
  murni tanpa PGlite), modul tidak diubah. Dikunci: `demoLearners` (3) — id
  unik `learner:demo-*`, userId unik `demo-*`, nama/email domain
  `@demo.learngraph.dev`, ISO `createdAt <= updatedAt`, enum sah di
  `learningStyle`/`cognitiveProfile`, `psychometricScores` tetap angka telanjang
  0–1 dan `traitScore` mengembalikan `undefined` untuk kelima trait (demo tetap
  netral), `tags` array string; `demoConcepts` (11) — id unik `concept:*`, teks
  wajib terisi, difficulty bulat 1–10, salah satu dari enam nama Bloom,
  `estimatedMinutes > 0`, ISO; `demoEdges` (11) — id unik, `from`/`to` merujuk
  konsep demo, tanpa self-edge, weight 0–1, graf asiklik (DFS), ISO;
  `demoKnowledgeStates` (18) — id unik, pasangan (learner, concept) unik,
  referensi ke learner/konsep demo, mastery bulat 0–100, confidence 0–1,
  reviewCount bulat ≥ 0, `createdAt <= lastReviewed < DEMO_DATA_AS_OF`, jumlah
  per learner alice 6 / bob 3 / carol 9 sebagai salinan eksplisit;
  `isServerlessEnvironment` — `VERCEL === '1'`, Lambda non-kosong,
  `DEMO_MODE === 'true'` → true, semua kosong (termasuk `'0'`/`''`/`'false'`)
  → false, env distub lalu dipulihkan. `shiftDemoDate` tidak diduplikasi
  (tetap di `tests/demo-seed.test.ts`). Tanpa perubahan
  perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau (606/606 unit,
  184 cek smoke).

- 2026-11-15: PR #66 — test: test unit langsung store Postgres
  `src/lib/graph/store.ts` (`PostgresGraphStore` + `tableForKey`, 11 test di
  `tests/graph-store.test.ts`, node:test; satu PGlite in-memory + isi
  `migrations/*.sql` asli via `applyMigrations(pgliteMigratable(pg), ...)` +
  `Kysely<GraphDatabase>` dengan `pgliteDialect`; baris `user` disisipkan untuk
  tiap owner uji karena `owner_id` ber-FK), modul tidak diubah. Dikunci:
  `tableForKey` — keenam prefiks → tabel persis (`learner:`/`concept:`/
  `edge:prereq:`/`edge:related:`/`state:`/`index:`), prefiks telanjang (yang
  dipakai scan) juga dirutekan, prefiks tak dikenal (`bogus:x`, string kosong,
  `edge:`, `edge:other:x`, `learners`) melempar `Unknown LearnGraph key
prefix: <key>` persis; `GRAPH_TABLES` tepat enam tabel dalam urutan itu.
  Konstruktor menolak ownerId kosong. `get`/`put`/`del`/`exists` — kunci absen →
  null/false, round-trip nilai, overwrite via konflik `(owner_id, key)`
  (nilai baru menang), del kunci absen tanpa galat. Semantik JSON LevelDB —
  properti bernilai `undefined` hilang (bukan `undefined` sebagai nilai) dan
  `Date` menjadi string ISO, diuji lewat kunci `index:`. Kolom ekstraksi
  diverifikasi dengan SQL mentah ke tabel (bukan lewat engine): `learner:` →
  `user_id`; `concept:` → `concept_id` + `domain` dari nilai (hilang/non-string
  → kolom null, JSON tetap utuh); `edge:prereq:` → `from_concept`/`to_concept`
  dari `value.from/to` (hilang → null, ikut diperbarui saat overwrite);
  `edge:related:` → `edge_id`; `state:` → `learner_id`/`concept_id` dari
  `value.userId/conceptId` (hilang → null); `index:` tanpa kolom ekstraksi
  (`select *` → tepat `owner_id`/`key`/`data`). Skan prefiks — hanya rentang
  `>= prefix` dan `< prefix+'\xFF'`, urutan byte collate "C" (`concept:a` <
  `concept:a:1` < `concept:ab` karena ':' < 'b'; kasus-sensitif `concept:A`
  terpisah; `'1' < '10' < '2'` byte-wise bukan numeric sort), `reverse`
  menurun, `limit` memotong, `listEntries` mengembalikan pasangan kunci-nilai.
  Isolasi di level store (bukan engine) — kunci identik pada dua owner menjadi
  dua baris (count SQL = 2), get/scan masing-masing hanya melihat miliknya,
  del satu pihak tak menyentuh pihak lain. `batch` — array kosong tanpa efek,
  put/del diterapkan berurutan dalam satu transaksi (put lalu del → hilang, del
  lalu put → nilai baru), op put dengan `value === undefined` dilewati (tidak
  menulis dan tidak menghapus), satu op melempar (prefiks tak dikenal) →
  seluruh transaksi digulung balik. `clear` menghapus baris owner itu di keenam
  tabel saja (owner lain utuh, diverifikasi per tabel); `close` memanggil
  `options.onClose` tepat sekali. Tanpa perubahan
  perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau (581/581 unit,
  187 cek smoke).

- 2026-11-15: PR #65 — test: test unit langsung modul scaffolding psikometrik
  `src/lib/graph/scaffolding.ts` (23 test di `tests/scaffolding.test.ts`,
  node:test murni; helper kecil pembuat `LearnerProfile` dari `{ scores,
learningStyle, cognitiveProfile }`), modul tidak diubah. Dikunci:
  `adjustForPsychometrics` — profil kosong semua default (0 / `normal` / `[]` /
  `mixed`); openness >70 +0.2 dan <30 −0.1 (30/50/70 netral);
  conscientiousness >70 `faster`, <30 `slower` + consideration struktur;
  neuroticism >70 −0.2 + consideration encouragement (70 tidak); extraversion

  > 70 kolaboratif dan <30 solo — teks consideration persis dari sumber dan
  > urutan push conscientiousness→neuroticism→extraversion dikunci lewat
  > kombinasi semua trait; `presentationStyle` mengikuti `learningStyle.primary`
  > (visual/auditory/kinesthetic; `reading` dan tanpa gaya → `mixed`); ekstrem
  > tercapai −0.3/+0.2 (clamp [−0.5, 0.5] tidak terjangkau → dijaga statis);
  > `scaffoldingStrategies` identik `selectScaffoldingStrategies` untuk profil
  > sama; skor dibaca lewat `traitScore` — id kanonis dan alias lama
  > (`openness_to_experience`, `neuroticism`) terbaca, angka telanjang 0–1
  > legacy dan entri tanpa skor diabaikan, kanonis menang atas alias.
  > `selectScaffoldingStrategies` — profil kosong tepat satu `worked_example`
  > (8, `general`); tiap kondisi menambah strateginya (visual_aids 9,
  > guided_practice 8 + hints 7, chunking 9, peer_discussion 6, analogy 7,
  > repetition 7, guided_practice 9 kinestetik) dengan `source: 'profile'`;
  > profil yang mengenai semua kondisi terurut priority menurun dengan sort
  > stabil (chunking, guided_practice kinestetik, worked_example,
  > guided_practice neuroticism, hints, analogy, repetition, peer_discussion);
  > ambang ketat di batas: neuroticism 60/61, extraversion 70/71, openness
  > 40/39. `calculatePsychometricMatch` — basis 0.5; abstrak (abstractness >0.7,
  > batas ketat) × openness >60 +0.2 / <40 −0.2 / 50 netral, konsep konkret
  > netral; cognitiveLoad >0.7 (batas ketat) × workingMemory `high` +0.15 /
  > `low` −0.15 / medium & tanpa cognitiveProfile netral; jendela [4,7]
  > inklusif pada `adjustedDifficulty = absolute + modifier×10` (4 dan 7
  > termasuk; 5+0.2×10=7 ya; 8 dan 5−0.2×10=3 tidak); maksimum tercapai 0.95
  > dan minimum 0.15; hasil `adjustForPsychometrics` dipakai langsung sebagai
  > argumen ketiga (modifier −0.2 mengeluarkan konsep absolute 5 dari jendela).
  > Penjaga statis: baris `Math.max(-0.5, Math.min(0.5, difficultyModifier));`
  > masih ada; `scaffolding.ts` mengimpor `traitScore` dari `trait-scores.ts`;
  > `education-graph-db.ts` tetap `import * as scaffolding` dan mendelegasikan
  > ketiga nama fungsi. Catatan proses: ekspektasi urutan awal keliru karena
  > sort stabil menempatkan `worked_example` (disisipkan pertama) sebelum
  > `guided_practice` pada priority sama; perbandingan angka float memakai
  > epsilon (0.1+0.2 ≠ 0.3 persis di IEEE754). Tanpa perubahan
  > perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau (570/570 unit,
  > 187 cek smoke; `tests/scaffolding-source.test.ts` tetap utuh).

- 2026-11-15: PR #64 — test: test unit langsung allowlist metode graph yang
  boleh dipanggil browser `src/lib/graph/methods.ts` (`REMOTE_GRAPH_METHODS`,
  7 test di `tests/graph-methods.test.ts`, node:test murni), modul tidak
  diubah. Dikunci: tepat 46 nama dalam urutan sumber saat ini (salinan
  eksplisit di test — perubahan daftar harus disengaja dan terlihat di diff),
  semuanya string unik non-kosong tanpa duplikat; `open`/`close` (siklus
  hidup store lokal), `batch` (operasi mentah tanpa skema Zod), dan
  `addConceptsAndEdges` (jalur server-only) tidak boleh ada di daftar —
  keempatnya juga dipastikan tetap ada sebagai deklarasi method engine supaya
  lock tetap bermakna; setiap nama muncul sebagai deklarasi method
  `(<async>)? <nama>(` di `src/lib/graph/education-graph-db.ts` (async maupun
  sinkron — `predictDecay`/`scheduleNextReview`/`adjustForPsychometrics`/
  `selectScaffoldingStrategies` dikunci eksplisit tanpa async). Penjaga statis
  wiring: `methods.ts` bebas impor runtime (hanya `import type`, aman di
  bundle browser); `graph.functions.ts` memakai `method:
z.enum(REMOTE_GRAPH_METHODS)` (bukan `z.string()`) dan mengambil graph
  lewat `graphForOwner(context.userId)`; `createRemoteGraphDB` di
  `DBContext.tsx` membangun proxy dengan mengiterasi `REMOTE_GRAPH_METHODS`
  (tidak ada nama method hardcoded, termasuk yang terlarang) dan meneruskan
  `{ method, args }` hasil `JSON.parse(JSON.stringify(args ?? []))`. Catatan
  proses: typecheck menolak `methods.includes(name)` karena salinan terinfer
  array union literal — diperbaiki dengan mengetik salinan `string[]`
  (commit kedua), lalu CI penuh hijau. Tanpa perubahan
  perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau (547/547 unit,
  184 cek smoke).

- 2026-11-15: PR #63 — test: test unit langsung penerap migrasi PGlite
  `src/lib/migrations.ts` (`applyMigrations` + `pgliteMigratable`, 11 test di
  `tests/migrations.test.ts`, node:test murni), modul tidak diubah.
  `MigratableDb` palsu mencatat `exec`/`query`/`transaction` (SQL, parameter,
  penanda transaksi) dan memberi satu objek tx per migrasi; objek mirip PGlite
  untuk adapter. Dikunci: `exec` tabel `_migrations` persis lalu `query`
  `select name from _migrations` (files kosong = hanya dua panggilan itu);
  hanya `.sql`, nama = basename (`migrations/auth/0001_auth.sql` cocok dengan
  baris `0001_auth.sql`), entri non-`.sql` diabaikan; urutan deterministik
  menurut basename (`localeCompare`, termasuk beda huruf besar/kecil), migrasi
  yang sudah tercatat dilewati tanpa tulisan bookkeeping; tiap migrasi satu
  transaksi `tx.exec(<isi berkas>)` + `insert into _migrations (name) values
($1)`; galat `exec` maupun insert diteruskan dan migrasi berikutnya tidak
  dicoba; `pgliteMigratable` meneruskan teks/parameter apa adanya, `query` hanya
  mengembalikan `{ rows }`, `transaction` memanggil `pg.transaction` sekali dan
  meneruskan nilai kembalian, callback memakai objek transaksi (bukan `pg`
  luar). Tanpa perubahan perilaku/skema/RPC/migrasi/dependensi. `npm run ci`
  hijau (540/540 unit, smoke 177 cek).

- 2026-11-15: PR #62 — test: test unit langsung dialect PGlite
  `src/lib/pglite-dialect.ts` (17 test di `tests/pglite-dialect.test.ts`,
  node:test murni), modul tidak diubah. Klien palsu `{ query }` mencatat
  SQL/parameter dan mengembalikan `{ rows, affectedRows }` yang bisa diatur;
  `CompiledQuery` dari `kysely`. Dikunci: adapter/compiler/introspector
  Postgres + driver lazy (factory belum dipanggil saat dialect dibuat); `init()`
  dan acquire pertama memanggil `getClient` sekali, acquire berikutnya tidak;
  satu koneksi pada satu waktu dengan penunggu FIFO menerima koneksi yang sama,
  koneksi baru setelah antrean kosong, dan `Invalid connection` untuk koneksi
  asing; `begin` / `start transaction isolation level <level>` / `commit` /
  `rollback` tanpa parameter; `executeQuery` meneruskan SQL+parameter apa
  adanya dan menambah `numAffectedRows: BigInt(n)` hanya bila `affectedRows`
  truthy (0/undefined tidak); `streamQuery` menolak `chunkSize` tidak sah
  dengan `chunkSize must be a positive integer` tanpa memanggil klien, memecah
  baris berurutan, dan nol yield untuk hasil kosong; `destroy()` tidak memanggil
  `client.close()` dan acquire berikutnya memakai `getClient` lagi. Tanpa
  perubahan perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau (529/529
  unit, 177 cek smoke).

- 2026-11-15: PR #61 — fix: `interpretation` di `src/lib/assessments.ts` tidak
  lagi memakai `subscales[x] || 50` (nilai sah 0 dianggap "tidak ada" → 50),
  melainkan `?? 50` di kelima kuis ber-subskala (`attachment_style.full`,
  `information_processing.full`, `metacognition.full`, `political_ideology.full`,
  `cultural_values.full`). Dikunci di `tests/assessments.test.ts` (19 → 26):
  attachment semua `min` = 83 dengan teks persis `Secure attachment
(Anxiety=0, Avoidance=33).`, semua `max` = 17 dengan `Anxiety=100,
Avoidance=67`; information processing analytical 0 → `Holistic/Global` +
  `Analytical/Sequential=0`; metacognition knowledge 0 → `Regulation of
Cognition` + `Knowledge of Cognition=0`; political care/fairness 0 dengan
  binding tengah menyebut orientasi binding; cultural power distance/uncertainty
  0 menyebut egalitarian dan nyaman dengan ambiguitas; jawaban `{}` pada kelima
  kuis tetap tidak melempar dan menghasilkan teks tidak kosong. Tanpa perubahan
  `calculateScore`, registry, label, skema, RPC, migrasi, atau dependensi.
  `npm run ci` hijau (512/512 unit, 177 cek smoke).

- 2026-11-15: PR #60 — test: test unit langsung registri & skor psikometrik
  `src/lib/assessments.ts` (19 test di `tests/assessments.test.ts`, node:test
  murni), modul tidak diubah. Dikunci: 39 domain dalam urutan tetap dengan
  kunci = `quick.domainId` = `full.domainId`; `getQuickAssessments()` /
  `getFullAssessments()` 39 objek berurutan dan identik; `getAssessment`
  identik / `undefined` untuk domain tak dikenal; 78 kuis (minimal satu
  pertanyaan, id unik, teks/subscale/metadata tidak kosong); skala bulat
  `min < max`, label satu per nilai atau dua ujung, dan dua skala berlabel
  titik (`dark_triad_narcissism.quick` indeks 0/6,
  `life_satisfaction.quick` indeks 0/5/10) dikunci eksplisit agar kuis lain
  tidak memakai posisi label kosong; `calculateScore` semua `min`/semua
  `max`/`{}` bilangan bulat 0–100; item `reverseScored` tidak pernah
  menaikkan skor; `attachment_style.full` semua `min` = 83, semua `max` = 17,
  dan keempat gaya attachment terjangkau dengan `Anxiety=`/`Avoidance=`;
  `interpretation` 0/50/100 tanpa jawaban selalu tidak kosong dan tidak
  melempar; 8 kategori mencakup 39 domain tepat sekali. Temuan (tidak
  diperbaiki di PR test ini, dicatat sebagai tugas berikutnya):
  `subscales[x] || 50` membuat subskala sah 0 tampil/terklasifikasi sebagai 50
  (attachment semua `min`: skor 83 tetapi teks "Anxious-Preoccupied ...
  Anxiety=50"). Tanpa perubahan perilaku/skema/RPC/migrasi/dependensi.
  `npm run ci` hijau (505/505 unit, 184 cek smoke; cek kuis dan fokus Tab
  tetap).
- 2026-11-15: PR #59 — test: test unit langsung jebakan Tab dialog
  `src/lib/focus-trap.ts` (`trapTabKey`, 20 test di
  `tests/focus-trap.test.ts`, node:test murni), modul tidak diubah. Fake DOM
  minimal mewarisi `FakeNode`; `globalThis.Node` dan `globalThis.document`
  distub lalu dipulihkan di `after`. Dikunci: key selain `Tab` dan
  `container === null` → tanpa `preventDefault()`/fokus; kandidat dari
  `querySelectorAll` dengan selector persis `FOCUSABLE`, disaring
  `getClientRects().length > 0`, urutan DOM dipertahankan, elemen tersembunyi
  tak pernah difokuskan; tanpa kandidat terlihat → `preventDefault()` +
  `container.focus()` (Tab & Shift+Tab, container kosong); Tab dari luar/di
  kandidat terakhir → kandidat pertama, kandidat tengah/pertama/container/
  wrapper di dalam tidak dicegat; Shift+Tab dari luar/di kandidat pertama/di
  container → kandidat terakhir, kandidat tengah/terakhir/wrapper tidak
  dicegat; elemen aktif bukan `instanceof Node` dianggap di luar; kandidat
  tunggal membungkus ke dirinya sendiri. Tanpa perubahan
  perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau (486/486 unit,
  177 cek smoke; cek "Tab stays inside the quiz dialog" tetap).
- 2026-11-15: PR #58 — test: test unit langsung fokus setelah hapus baris
  admin `src/lib/focus-after-delete.ts` (`rememberRowFocus`/`restoreRowFocus`,
  19 test di `tests/focus-after-delete.test.ts`, node:test murni), modul tidak
  diubah. Fake DOM minimal + stub `window`/`document`/`requestAnimationFrame`
  (antre frame manual) yang dipulihkan di `after`. Dikunci: memo
  `{ row, list, rowIndex, buttonIndex }` (indeks tombol termasuk disabled;
  leluhur `tr`/`li`/`[data-row]`; tanpa baris/daftar → `null`); `null` atau
  tanpa `window` → tanpa frame; selama baris masih terhubung frame dijadwalkan
  ulang tanpa mencuri fokus; baris pengganti `rows[min(rowIndex, rows.length -
1)]` dan tombol aktif ke-`min(max(0, buttonIndex), buttons.length - 1)`;
  daftar/baris kosong atau daftar tak terhubung → fokus `main h1` dengan
  `tabindex="-1"` hanya bila belum ada; tidak mencuri fokus bila pengguna sudah
  pindah, tetapi tetap memulihkan bila elemen terfokus ikut terputus. Tanpa
  perubahan perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau
  (466/466 unit, 177 cek smoke; cek a11y fokus setelah hapus baris tetap).
- 2026-11-15: PR #57 — test: test unit langsung modul email
  `src/lib/email.ts` (17 di `tests/email.test.ts`, node:test murni), modul
  tidak diubah. Dikunci: `emailConfigured()` (kedua variabel wajib, trim,
  whitespace-only = kosong); `passwordResetAvailable()` (terkonfigurasi atau
  `NODE_ENV` bukan persis `production`); `sendEmail` terkonfigurasi = tepat
  satu POST ke `https://api.resend.com/emails` dengan `authorization: Bearer
<key>`, `content-type: application/json`, body `{from, to: [penerima],
subject, text}` ter-trim, resolve pada OK, galat `Email provider refused the
message (HTTP <status>).` tanpa retry; jalur dev tanpa konfigurasi resolve
  tanpa memanggil fetch (stub melempar), log dev, outbox `DEV_EMAIL_OUTBOX`
  satu baris JSON `{to, subject, text, at}` ISO yang di-append (tidak menimpa),
  tanpa file bila variabel kosong; produksi tanpa konfigurasi menolak `Email
is not configured on this server.`; builder reset/verifikasi berbahasa
  Inggris, memuat URL, tanpa rahasia server lain. `fetch`/env distub dan
  dipulihkan, outbox di `os.tmpdir()`. Tanpa perubahan
  perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau (447/447 unit,
  smoke tetap).
- 2026-11-15: PR #56 — refactor: keputusan isolasi lintas situs
  `assertSameSiteRequest` diekstrak ke helper murni
  `sameSiteAllowed(site, dest, mode, method): boolean`
  (`src/lib/auth/same-site.ts`, tanpa impor apa pun) agar teruji langsung dari
  Node; `isolation.server.ts` tetap file `.server.ts` pengimpor
  `@tanstack/react-start/server`, tetap melempar `CrossSiteRequestError`
  (nama class tak berubah, tetap di `EXPECTED_NAMES` `src/lib/errors.ts`),
  `middleware.ts` tak berubah. Test baru `tests/same-site.test.ts` (15):
  tabel keputusan (diizinkan: tanpa `sec-fetch-site` klien non-browser,
  `same-origin`, `same-none`, navigasi GET top-level walau lintas situs —
  callback OAuth; ditolak: ter-skrip `same-site`/`cross-site` termasuk form
  POST, navigate GET `object`/`embed`, navigate non-GET, GET tanpa navigate,
  nilai header tak dikenal), ekuivalensi dengan snapshot beku keputusan
  pra-ekstraksi untuk seluruh 1512 kombinasi site×dest×mode×method, dan
  penjaga statis (helper bebas impor; hanya `.server.ts` di `src/lib/auth/`
  boleh mengimpor `@tanstack/react-start/server`; `authMiddleware` tetap
  memanggil `assertSameSiteRequest()` sebelum `requireUserId()`). Tanpa
  perubahan perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau
  (430/430 unit, smoke tetap).
- 2026-11-15: PR #55 — test: handler API publik baca-saja M4
  (`apiLearners`/`apiContext`, `src/lib/api/v1.ts`) kini punya test unit
  langsung `tests/api-v1.test.ts` (13) sebagai handler sungguhan di atas satu
  PGlite yang disuntikkan ke global `__learngraphPglite__` yang di-memoize
  `getDb()` (key, workspace, dan permintaan berbagi satu database persis
  seperti server berjalan); resolve hook `registerHooks` di file test memetakan
  impor dinamis ekstensi-less ala Vite (`import('../db')`) ke `.ts` untuk Node
  murni, tanpa menyentuh kode aplikasi. Dikunci: 401 tanpa/malformed
  `Authorization` (header `www-authenticate: Bearer`, `cache-control:
no-store`) + 401 key dicabut; isolasi antar-akun di `learners` dan `context`
  (404 lintas akun, isi brief tak menyebut akun lain); bentuk `learners`
  persis `{ learners: [{ id, name, example }] }` (`example` hanya `demo-*`,
  nama jatuh ke id); default learner = non-`demo-*` pertama (fallback pelajar
  contoh, 404 akun kosong); konsep by id/nama case-insensitive + "Builds on";
  404 tak dikenal; 400 setelah batas 128/200 (tepat di batas tetap 404);
  `q` dipotong 1000 (kata kunci di luar → `general`); respons memuat
  `learner/concept/queryType/tokens/context`; jumlah baris 6 tabel graph tak
  berubah; 60 req/menit per key → ke-61 429, key lain tak terdampak, kedua
  endpoint berbagi. Tanpa perubahan perilaku/skema/RPC/migrasi. `npm run ci`
  hijau (415/415 unit, smoke tetap).
- 2026-11-15: PR #54 — feat: batas percobaan masuk **per akun** (20/15 menit
  per email, kunci `account-sign-in:<sha256(email)>` di tabel `rateLimit` yang
  sudah ada) berjalan bersama batas per IP; upsert atomik per percobaan dengan
  jendela tetap 15 menit (penolakan tidak memperpanjang jendela), 429 +
  `x-retry-after` sebelum Better Auth dipanggil, sukses masuk menghapus
  penghitung, email dinormalkan (trim/lowercase/≤254/rusak tak dihitung), body
  via `request.clone()`, degradasi senyap ke batas IP saat tabel gagal, modul
  tanpa `console`. Modul `src/lib/auth/account-rate-limit.ts`, gate
  `withAccountSignInLimit` di `src/routes/api/auth/$.ts`. Test baru
  `tests/account-rate-limit.test.ts` (10); test IP lama tetap hijau.
  `npm run ci` hijau (402/402 unit, 177 cek smoke). Baris backlog P1 #7
  dicoret.
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
