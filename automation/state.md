# State otomasi LearnGraph — dibaca & diperbarui setiap sesi

Terakhir diperbarui: 2026-11-13 (siklus 2: P0.4 selesai; berikutnya: P0.1 kunci learner aktif per akun)

## Tugas berikutnya

Backlog `docs/ROADMAP.md` P0.1 (baris "Lanjutan: pilihan learner disimpan per
browser (kunci lama `learngraph.activeLearner`, belum per akun)"): pilihan
learner aktif disimpan di SATU kunci localStorage global
`learngraph.activeLearner` di `src/lib/active-learner.ts`, jadi dua akun di
browser yang sama saling menimpa pilihan (aman — id asing diabaikan oleh
`resolveActiveLearner` yang memvalidasi terhadap daftar learner akun sendiri —
tetapi tiap ganti akun, pilihan akun sebelumnya hilang).

Ubah agar pilihan disimpan **per akun**:

1. Kunci penyimpanan jadi per akun: `learngraph.activeLearner:<userId>`
   (userId dari sesi — `useSession()` di `src/lib/auth/client.ts`, field
   `data.session.userId`). Sesi belum termuat/null → perlakukan seperti
   "tanpa akun": jangan baca/tulis kunci per-akun (pilihan tetap berlaku di
   dalam halaman lewat state, cuma tidak diingat lintas halaman; perilaku
   sama seperti sekarang saat storage gagal). Pembangun kunci murni
   (mis. `activeLearnerKey(userId?)`) dites langsung.
2. Migrasi sekali tanpa merusak: bila kunci per-akun kosong, nilai kunci lama
   `learngraph.activeLearner` tetap dibaca sebagai kandidat "remembered"
   (divalidasi `resolveActiveLearner` seperti biasa — id yang bukan milik
   akun ini diabaikan); kunci lama **tidak dihapus** (akun lain di browser
   yang sama mungkin masih memakainya). Penulisan selanjutnya hanya ke kunci
   per-akun.
3. `useActiveLearner` mengambil sesi sendiri lewat `useSession()` (satu
   tempat — JANGAN ubah keenam pemanggilnya: `src/components/StudyToday.tsx`,
   `src/routes/recommendations.tsx`, `src/routes/gaps.tsx`, `src/routes/graph.tsx`,
   `src/routes/profile.tsx`, `src/routes/learn.$conceptId.tsx`).
   SSR/hidrasi tetap sepakat: hook tetap `null` di server, baca storage hanya
   di `useEffect` (pola yang sudah ada).
4. Batas lama tetap: id > 128 karakter ditolak; storage gagal/private mode →
   no-op; hanya id yang disimpan, tanpa data learner.

Perilaku yang dikunci:

- `resolveActiveLearner` (murni) tidak berubah perilaku maupun tanda tangan —
  test lama di `tests/active-learner.test.ts` harus tetap hijau tanpa diubah.
- Dua userId berbeda punya pilihan masing-masing yang tidak saling menimpa.
- Setelah migrasi, penulisan baru tidak pernah menyentuh kunci lama.

Test: perluas `tests/active-learner.test.ts` (stub `window.localStorage`
sudah ada di file itu): kunci per akun terpisah untuk dua userId; migrasi
dari kunci lama (dibaca sekali sebagai kandidat, kunci lama tetap ada);
penulisan tak menyentuh kunci lama; sesi null → tidak membaca/menulis kunci
per-akun; pembangun kunci murni (userId kosong/aneh). Smoke: cek lama cukup
hijau; cek baru hanya bila murah dan tidak flaky (lihat catatan hidrasi di
log 2026-11-08/09).

Dokumentasi: coret baris backlog P0.1 itu di `docs/ROADMAP.md` dengan
`✅ <tanggal>` + satu baris penjelasan, plus entri log bertanggal di akhir
file mengikuti pola entri lama.

Gerbang: `npm run ci` utuh (±25 menit) harus hijau sebelum PR. Commit
berbahasa Indonesia, pola `fix:`. Setelah merge, tulis "Tugas berikutnya"
untuk sesi setelahnya: kandidat (pilih satu, spekkan dengan membaca kode
dulu): (a) backlog P0.2 "konfirmasi sebelum kuis menimpa nilai yang diisi
manual" di My Profile (`src/lib/quiz.ts`, `src/routes/profile.tsx`), atau
(b) backlog P0.4 "dialog kuis belum menjebak fokus Tab di dalamnya"
(`src/routes/profile.tsx`, pola laci sidebar).

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

## Blokiran

(tidak ada)
