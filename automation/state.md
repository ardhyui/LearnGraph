# State otomasi LearnGraph — dibaca & diperbarui setiap sesi

Terakhir diperbarui: 2026-11-15 (siklus 29: test langsung registri psikometrik + `estimateCognitiveProfile` di `src/lib/graph/psychometrics.ts`, PR #68; berikutnya: test langsung modul util kecil `cn` di `src/lib/utils.ts` + `uuidv4` di `src/lib/uuid.ts`)

## Tugas berikutnya

Penguatan tes: test unit langsung dua **modul util kecil** yang dipakai lintas
aplikasi tetapi belum punya test langsung: `src/lib/utils.ts` (`cn`, pembungkus
`clsx` + `tailwind-merge`) dan `src/lib/uuid.ts` (`uuidv4`, pembungkus Web
Crypto). Keduanya adalah sisa modul `src/lib` tanpa test langsung. **Modul tidak
diubah — test saja.**

Test baru `tests/utils.test.ts` dan `tests/uuid.test.ts` (`node:test` murni)
mengunci:

- `cn` — tanpa argumen → `''`; beberapa string digabung berurutan; kelas
  Tailwind yang berkonflik diselesaikan `tailwind-merge` (bandingkan hasil
  persis: `cn('p-2', 'p-4')` → `'p-4'`, `cn('text-sm text-red-500', 'text-lg')`
  → `'text-red-500 text-lg'` — urutan kelas sisa dipertahankan); kelas yang
  tidak berkonflik tetap (`cn('px-2', 'py-3')` → `'px-2 py-3'`); nilai
  kondisional `false`/`undefined`/`null` dibuang (`cn('mt-4', false, undefined,
  null, 'mb-2')` → `'mt-4 mb-2'`); bentuk objek/array `clsx` bekerja
  (`cn({ 'font-bold': true, hidden: false })` → `'font-bold'`,
  `cn(['flex', false && 'hidden', 'gap-2'])` → `'flex gap-2'`); hasil selalu
  string.
- `uuidv4` — memanggil `globalThis.crypto.randomUUID()` tepat sekali dan
  mengembalikan nilainya apa adanya (stub string tetap diteruskan); hasil
  sungguhan cocok pola UUID v4 (`4` di posisi versi, varian `[89ab]`, 36
  karakter huruf kecil) dan 1000 pemanggilan tidak berulang; bila
  `crypto.randomUUID` melempar, galat yang sama diteruskan (tanpa fallback
  diam-diam). Stub dipasang lewat `Object.defineProperty(globalThis, 'crypto',
  …)` dan deskriptor asli dipulihkan di `after`/`finally` — jangan menyentuh
  `crypto` global di luar test ini (tiap file test berjalan di proses sendiri).

Gerbang: `npm run ci` utuh (±25 menit) hijau sebelum PR. Commit berbahasa
Indonesia pola `test:`. Tanpa perubahan perilaku/skema/RPC/migrasi/dependensi.

## Riwayat

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
  >70 kolaboratif dan <30 solo — teks consideration persis dari sumber dan
  urutan push conscientiousness→neuroticism→extraversion dikunci lewat
  kombinasi semua trait; `presentationStyle` mengikuti `learningStyle.primary`
  (visual/auditory/kinesthetic; `reading` dan tanpa gaya → `mixed`); ekstrem
  tercapai −0.3/+0.2 (clamp [−0.5, 0.5] tidak terjangkau → dijaga statis);
  `scaffoldingStrategies` identik `selectScaffoldingStrategies` untuk profil
  sama; skor dibaca lewat `traitScore` — id kanonis dan alias lama
  (`openness_to_experience`, `neuroticism`) terbaca, angka telanjang 0–1
  legacy dan entri tanpa skor diabaikan, kanonis menang atas alias.
  `selectScaffoldingStrategies` — profil kosong tepat satu `worked_example`
  (8, `general`); tiap kondisi menambah strateginya (visual_aids 9,
  guided_practice 8 + hints 7, chunking 9, peer_discussion 6, analogy 7,
  repetition 7, guided_practice 9 kinestetik) dengan `source: 'profile'`;
  profil yang mengenai semua kondisi terurut priority menurun dengan sort
  stabil (chunking, guided_practice kinestetik, worked_example,
  guided_practice neuroticism, hints, analogy, repetition, peer_discussion);
  ambang ketat di batas: neuroticism 60/61, extraversion 70/71, openness
  40/39. `calculatePsychometricMatch` — basis 0.5; abstrak (abstractness >0.7,
  batas ketat) × openness >60 +0.2 / <40 −0.2 / 50 netral, konsep konkret
  netral; cognitiveLoad >0.7 (batas ketat) × workingMemory `high` +0.15 /
  `low` −0.15 / medium & tanpa cognitiveProfile netral; jendela [4,7]
  inklusif pada `adjustedDifficulty = absolute + modifier×10` (4 dan 7
  termasuk; 5+0.2×10=7 ya; 8 dan 5−0.2×10=3 tidak); maksimum tercapai 0.95
  dan minimum 0.15; hasil `adjustForPsychometrics` dipakai langsung sebagai
  argumen ketiga (modifier −0.2 mengeluarkan konsep absolute 5 dari jendela).
  Penjaga statis: baris `Math.max(-0.5, Math.min(0.5, difficultyModifier));`
  masih ada; `scaffolding.ts` mengimpor `traitScore` dari `trait-scores.ts`;
  `education-graph-db.ts` tetap `import * as scaffolding` dan mendelegasikan
  ketiga nama fungsi. Catatan proses: ekspektasi urutan awal keliru karena
  sort stabil menempatkan `worked_example` (disisipkan pertama) sebelum
  `guided_practice` pada priority sama; perbandingan angka float memakai
  epsilon (0.1+0.2 ≠ 0.3 persis di IEEE754). Tanpa perubahan
  perilaku/skema/RPC/migrasi/dependensi. `npm run ci` hijau (570/570 unit,
  187 cek smoke; `tests/scaffolding-source.test.ts` tetap utuh).

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
