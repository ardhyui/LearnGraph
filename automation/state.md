# State otomasi LearnGraph — dibaca & diperbarui setiap sesi

Terakhir diperbarui: 2026-11-13 (loop dibuat lewat PR #39; tugas pertama: alasan ZPD berisi nama konsep)

## Tugas berikutnya

Backlog `docs/ROADMAP.md` P0.4 (baris "Lanjutan: alasan zona dari engine… masih
berisi id"): alasan "too_hard" dari `classifyConcept` di
`src/lib/graph/education-graph-db.ts` (±baris 1069) menyusun teks
`Missing N prerequisite(s): <id>, <id>, …` dengan **id konsep mentah**, dan
`src/components/StudyToday.tsx` (±baris 729) menampilkannya langsung ke pelajar
(`rec.reasons[0]`), jadi pengguna melihat "concept:fractions" alih-alih nama.

Ubah agar teks alasan memakai **nama konsep** dengan cadangan id yang terbaca,
memakai helper yang sudah ada dan teruji di `src/lib/gaps.ts`:
`conceptLabel(id, name)` (nama → id dibuat terbaca) dan
`conceptNames(ids, names)`. Bentuk akhir yang diinginkan:
`Missing 2 prerequisite(s): Fractions, Decimals` (nama konsep dari
`concept.name`; maksimal 3 dicantumkan + "…" bila lebih, seperti sekarang).

Perilaku yang harus dikunci:

1. Alasan "too_hard" karena prasyarat kurang memuat nama (bukan id) untuk
   maksimal 3 prasyarat yang hilang, diikuti "…" bila lebih dari 3 — jumlah
   total tetap ditulis angka.
2. Konsep tanpa `name` (atau kosong) memakai cadangan terbaca dari
   `conceptLabel` (mis. "Fractions" dari `concept:fractions`), bukan id mentah.
3. Alasan jalur lain tidak berubah: "Already mastered (…)%", "All
   prerequisites mastered - ready to learn!", "Most prerequisites met (…)%",
   "Low readiness (…)%" — bentuk respons `computeZPD` selain isi teks reason
   tidak boleh berubah (tidak ada field baru, tidak ada field yang hilang).
4. Tanpa regresi performa: jangan memanggil `getConcept` sekali per konsep
   yang diklasifikasi (pola N+1; lihat pelajaran M2 di `docs/ROADMAP.md`).
   Sebaliknya, susun peta nama sekali per `computeZPD` dari konsep yang sudah
   dimuat (pola `listConcepts`/cache konsep yang dipakai metode itu), lalu
   teruskan ke `classifyConcept`.

Saran implementasi (boleh menyesuaikan bila kode menunjukkan cara yang lebih
rapi): helper murni baru, mis. `missingPrereqReason(count, labels)` atau
pemakaian `conceptNames` langsung, di `src/lib/gaps.ts` atau modul kecil di
`src/lib/graph/` — murni, tanpa I/O, dengan test unit sendiri. Engine memakai
helper itu untuk menyusun `reason`.

Test:

- Unit untuk helper baru (pola test di `tests/gaps.test.ts` bila ada, kalau
  tidak lihat `tests/seed-gate.test.ts`): 0/1/3/4 prasyarat hilang, nama
  campur id mentah, name kosong/whitespace, nama panjang.
- Test engine: pakai pola `tests/zpd-edges.test.ts` (`openTestGraphDB` dari
  `tests/support/graph-db.ts` + `seedDemoDataIfEmpty`), tambah konsep ber-name
  jelas dengan prasyarat belum dikuasai, panggil `computeZPD(learner)`, dan
  pastikan (a) ada rekomendasi too_hard — itemnya di
  `result.zones.tooHard`/bentuk sesuai respons — yang reason-nya memuat nama
  prasyarat dan TIDAK memuat "concept:", (b) konsep zpd tetap direkomendasikan
  seperti sebelumnya (tidak ada perubahan zona akibat perubahan ini).
- Smoke tidak perlu cek baru bila cek lama hijau; tapi bila mudah, cek
  "Learn next" tidak menampilkan "concept:" bisa ditambah ke blok dashboard
  di `scripts/smoke.mjs` (opsional, jangan sampai cek baru flaky — lihat
  catatan hidrasi di log 2026-11-08/09).

Dokumentasi: coret baris backlog P0.4 itu di `docs/ROADMAP.md` dengan
`✅ <tanggal>` + satu baris penjelasan, dan tambah entri log bertanggal di
akhir file mengikuti pola entri lama.

Gerbang: `npm run ci` utuh (±25 menit) harus hijau sebelum PR
(test unit bertambah, smoke tetap lulus). Commit berbahasa Indonesia,
pola `feat:` atau `fix:`. Setelah merge, tulis "Tugas berikutnya" untuk
sesi after: kandidat berikutnya (pilih satu, spekkan dengan membaca kode
dulu): (a) backlog P0.1 "kunci learner aktif per akun" di
`src/lib/active-learner.ts`, atau (b) backlog P0.2 "konfirmasi sebelum kuis
menimpa nilai yang diisi manual" di My Profile (`src/lib/quiz.ts`,
`src/routes/profile.tsx`).

## Riwayat

- 2026-11-13: PR #39 — Loop self-improve dibuat (automation/): self-improve.sh
  (loop opencode run satu tugas per sesi, deteksi kuota + fallback model,
  worktree terpisah, flock satu instance), TASK_PROMPT.md (konstitusi sesi:
  gerbang `npm run ci` utuh, PR ke main, dilarang item keputusan pemilik/🔒/
  migrasi skema), state.md (file ini), README.md, unit systemd, dan
  `automation/log/` di-gitignore. Tugas pertama: alasan ZPD berisi nama
  konsep (backlog P0.4).

## Blokiran

(tidak ada)
