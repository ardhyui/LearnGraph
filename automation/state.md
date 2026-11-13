# State otomasi LearnGraph — dibaca & diperbarui setiap sesi

Terakhir diperbarui: 2026-11-13 (siklus 4: P0.2 selesai; berikutnya: daftar per-item penundaan review di panel Today)

## Tugas berikutnya

Backlog `docs/ROADMAP.md` P0 #1 (baris "tombol di ringkasan Today
mengakhiri **semua** penundaan sekaligus (pilihan per item ada di Gap
Analysis); bila pelajar sering menunda banyak review, pertimbangkan daftar
kecil per item di Today"): ringkasan snoozed di panel Today hanya punya SATU
tombol "Review it now / Review them now" yang memanggil `unsnoozeAll`
(`src/components/StudyToday.tsx` ±baris 316–349) — pelajar yang menunda
banyak review tidak bisa mengakhiri satu saja tanpa mengakhiri semuanya
(pilihan per item baru ada di Gap Analysis).

Perilaku yang diinginkan: di bawah baris ringkasan snoozed di panel Today
(render ±baris 650–671, `snoozedSummary(...)` dari `src/lib/gaps.ts` +
tombol + tautan "See snoozed reviews"), tampilkan daftar kecil per item:
nama konsep + tombol "Review it now" masing-masing. Tombol "Review them
now" (semua sekaligus) tetap dipertahankan untuk >1 item (tanpa regresi —
backlog hanya minta tambahan per item, bukan penghapusan). Per-item
memakai `recordStudyOutcome` outcome `'unsnooze'` yang sama persis
(tiru `reviewNow` di `src/routes/gaps.tsx` ±baris 266–289: `busy` per
`conceptId`, notice `"${name}" is due again — you can review it now on the
dashboard.`, fokus kembali ke tombol yang sama di baris penggantinya atau
ke judul daftar bila kosong).

Rencana implementasi:

1. Nama konsep belum ada di data panel: `TodayData.snoozed` hanya
   `SnoozedReview` (`conceptId` + `until`, dari `src/lib/graph/spacing.ts`).
   Di `load` StudyToday (±baris 147–197) `allConcepts` sudah dimuat —
   gabungkan nama di sana (mis. perluas entri snoozed jadi
   `{ conceptId, name, until }`, peta nama dari `allConcepts`; konsep tanpa
   nama memakai `conceptLabel`/id terbaca seperti pola gaps). Bentuk
   `SnoozedReview` di `spacing.ts` TIDAK diubah.
2. `unsnoozeOne(item)` baru di StudyToday mengikuti pola `unsnoozeAll`
   (guard `activeLearnerIdRef` agar notice tidak bocor ke learner lain,
   `pendingFocus.current` sebelum await, `await load()` setelah sukses);
   `busy` memakai `item.conceptId` (sudah dipakai `save`), bukan
   `UNSNOOZE_BUSY`.
3. Daftar kecil di bawah baris ringkasan: `<ul>` dengan nama + tombol
   "Review it now" per item (target sentuh ≥40 px, `disabled={!!busy}`
   seperti tombol yang ada). Item habis → daftar menghilang, ringkasan
   kembali polos.

Perilaku yang dikunci:

- Server function `recordStudyOutcome` + outcome `'unsnooze'` tidak
  berubah; Gap Analysis (`/gaps`) tidak berubah; `snoozedSummary` tidak
  berubah.
- Penundaan tetap tidak dihitung jatuh tempo; progres/interval tak berubah.
- `unsnoozeAll` tetap berfungsi seperti sekarang (tombol + notice banyak).
- UI pelajar berbahasa Inggris (D2).

Test: unit untuk penggabung nama bila dibuat helper murni; cek dulu
`tests/study.test.ts` / `tests/unsnooze.test.ts` untuk pola — ikuti yang
ada (kemungkinan test statis sumber seperti quiz.test.ts). Smoke: cek lama
(ada cek "Review them now"? cari `snoozed-summary`/`unsnooze` di
`scripts/smoke.mjs`) tetap hijau; cek baru hanya bila tidak flaky.

Dokumentasi: coret baris backlog itu di `docs/ROADMAP.md` dengan
`✅ <tanggal>` + satu baris penjelasan, plus entri log bertanggal di akhir
file mengikuti pola entri lama.

Gerbang: `npm run ci` utuh (±25 menit) harus hijau sebelum PR. Commit
berbahasa Indonesia, pola `feat:` atau `fix:`. Setelah merge, tulis
"Tugas berikutnya" untuk sesi setelahnya — kandidat (spekkan dengan membaca
kode dulu): (a) backlog P0 #3 baris 37 "kunjungan pertama … layar muat
penuh tanpa sidebar; pertimbangkan kerangka halaman (sidebar + placeholder)"
di `DBContext.tsx` (WAJIB baca catatan percobaan 12 Nov di baris backlog
itu: cek harus menunggu keadaan, bukan waktu), atau (b) backlog P0 #4
baris 48 "gaya belajar turunan memakai nilai 50 untuk topik yang belum
diisi … pertimbangkan hanya menurunkan bila topik kunci sudah diisi".

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

## Blokiran

(tidak ada)
