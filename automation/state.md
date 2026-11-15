# State otomasi LearnGraph — dibaca & diperbarui setiap sesi

Terakhir diperbarui: 2026-11-15 (siklus 42: test unit langsung layanan konten `src/lib/content/service.ts`, PR #81; berikutnya: test langsung bank soal demo `src/lib/evidence/demo-questions.ts`)

## Tugas berikutnya

Penguatan tes: **test unit langsung bank soal demo**
`src/lib/evidence/demo-questions.ts` (81 baris; `DEMO_QUESTIONS` dibangun dari
`BANK` 11 konsep × 4 soal). Node:test murni, impor dataset langsung, tanpa
PGlite/DOM, modul **tidak diubah**. Pola PR #80 (`tests/demo-content.test.ts`).
Keempat soal per konsep dipakai `seedDemoQuestions` di
`src/lib/evidence/service.ts`; perilaku seed-nya sendiri tidak diuji di sini
(milik tugas layanan evidence berikutnya). Asersi lama "ships at least 3 valid
questions for each of the 11 example concepts" di
`tests/learning-evidence.test.ts` tetap utuh dan tidak dipindah. Kunci:

1. File baru `tests/demo-questions.test.ts`:
   - tepat 44 soal; 11 `conceptId` = id `demoConcepts` (`concept:` di-strip)
     dalam urutan yang sama, masing-masing tepat 4 soal berurutan
     `demo-<conceptId>-1..4`; seluruh 44 id unik dan cocok
     `^[A-Za-z0-9_-]{1,64}$`; konsep di luar `demoConcepts` tidak ada.
   - setiap soal lolos `questionInput.safeParse` (dari `./quiz.ts`) dengan
     `id` diteruskan apa adanya; prompt/answer/explanation terisi (tanpa
     trim) dan dalam batas 500/200/1000; 3–4 opsi (aktual: 4, dan soal
     "Which is larger, 3/8 or 1/2?" tepat 3 — kunci contohnya), tiap opsi
     unik dan 1..200 karakter, answer muncul tepat satu kali di opsi.
   - dalam satu konsep keempat prompt berbeda (tidak ada duplikat); urutan
     grup = urutan kunci `BANK` = urutan `demoConcepts`; nomor id 1..4
     (bukan 0-based).
2. Penjaga statis: `demo-questions.ts` hanya `import type { QuizQuestion }`
   dari `./quiz.ts` (tanpa impor runtime); scan seluruh `src/` (`ts`/`tsx`
   kecuali modul itu dan `service.ts`) tanpa `DEMO_QUESTIONS`/`demo-questions`
   lain; `service.ts` mengimpor `DEMO_QUESTIONS` dan `seedDemoQuestions`
   memfilter per `conceptId`; asersi lama di `tests/learning-evidence.test.ts`
   (≥3 soal sah per konsep, id unik) dan `tests/learn-in-app.test.ts` tetap
   utuh.

Gerbang: `npm run ci` utuh hijau sebelum PR (unit naik ± 6–8). Commit pola
`test: ...` (mis. `test: kunci bank soal demo dengan test langsung`). Tanpa
perubahan aplikasi/perilaku/skema/RPC/migrasi/dependensi. UI tetap bahasa
Inggris (D2).

## Riwayat

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
