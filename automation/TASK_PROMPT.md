# Misi kontribusi LearnGraph — satu tugas per sesi (tanpa pengawasan)

Kamu bekerja otomatis di repo **LearnGraph** (graph-based adaptive education, TanStack Start + React 19, Postgres/PGlite, Node 26).
Tujuan loop ini: perbaikan mandiri berkelanjutan — bug fix, item backlog kecil terkurasi, penguatan tes, dan polesan `docs/ROADMAP.md` — sesuai keputusan pemilik D8 ("lanjutkan putaran otomatis untuk item kecil").

Baca `automation/state.md` terlebih dahulu. **Selesaikan "Tugas berikutnya" yang tertulis di sana** — jangan memilih tugas lain kecuali tugas itu sudah ditandai `blocked` (dua kegagalan berturut-turut dengan alasan jelas).

## Alur wajib setiap sesi

1. `git fetch origin main` lalu buat branch baru dari `origin/main`: `feat/<slug>` atau `fix/<slug>`.
2. Implementasikan **SATU** tugas sampai tuntas: kode + test + dokumentasi bila relevan.
   Dokumentasi mengikuti konvensi repo: backlog di `docs/ROADMAP.md` dicoret (`~~...~~`) dengan `✅ <tanggal>` + satu baris penjelasan, plus entri log bertanggal di akhir file (lihat entri lama sebagai pola). `Roadmap.md` (dokumen induk) hanya bila arah/kondisi berubah.
3. Gerbang wajib, semuanya harus hijau sebelum PR (aturan repo: CI hijau sebelum setiap merge):
   ```bash
   npm run ci
   ```
   Ini satu perintah lengkap: `npm ci`, typecheck, lint (0 warning), test unit (~306), build, CSP build produksi, smoke Playwright + PGlite. Butuh ±25 menit — jalankan utuh, jangan dipotong. Bila `node_modules` hilang, `npm ci` dijalankan oleh langkah pertamanya. **Jangan pernah `npm uninstall`** (npm 12 menolaknya di repo ini); bila dependensi harus berubah, edit `package.json`/`package-lock.json` lalu `npm install`.
4. Commit berbahasa Indonesia, pola konvensi repo: `feat: ...`, `fix: ...`, `chore: ...`, `perf: ...`, `docs: ...` dengan deskripsi ringkas (lihat `git log --oneline -20`). Push, `gh pr create --base main`, lalu `gh pr merge <n> --merge` **hanya setelah CI hijau**.
5. Perbarui `automation/state.md` pada branch yang sama sebelum PR:
   - pindahkan tugas selesai ke "Riwayat" (satu baris: tanggal, PR #, ringkasan),
   - tulis "Tugas berikutnya" yang konkret untuk sesi berikutnya (spekkannya seperti tugas yang kamu terima: lokasi kode, perilaku yang dikunci, gerbang),
   - catat kegagalan/blokiran bila ada.
6. Setelah merge, **berhenti**. Satu sesi = satu tugas = satu PR. Jangan mulai tugas kedua.

## Sumber tugas (urut prioritas)

1. Bug nyata: test gagal, typecheck/lint error, error runtime yang bisa direproduksi.
2. Item backlog terbuka di `docs/ROADMAP.md` (baris "Lanjutan:" yang belum dicoret) yang teknis dan bisa diverifikasi otomatis.
3. Perbaikan kecil terukur: aksesibilitas, performa, dokumentasi, penguatan tes (mis. modul murni yang belum punya test langsung).

**Dilarang memilih** item yang menunggu keputusan/pemilik: tabel "Keputusan untuk pemilik" di `Roadmap.md` (D1–D8), apa pun yang bertanda 🔒 (butuh akun/secret/biaya), M6 (ditunda menurut D1), M7 (butuh data pengguna nyata), dan jangan menandai milestone/selesai-bila apa pun sebagai tercapai — itu hak pemilik.

## Lingkungan ini (penting)

- Sesi ini berjalan di **git worktree terpisah** milik opencode. Jangan menyentuh checkout utama pengguna; semua commit/push/PR dilakukan dari worktree ini.
- CI memakai PGlite in-memory (DATABASE_URL dikosongkan) dan memilih port bebas sendiri; jangan menjalankan server dev manual untuk gerbang — smoke sudah bagian dari `npm run ci`.
- Git dan `gh` sudah terautentikasi. Jangan pernah: force-push, commit langsung ke `main`, menyentuh `.env`/rahasia/API key, atau mengubah kontrak bukti Michi (`docs/MICHI-SKILL-EVIDENCE.md`, `src/lib/michi/`, `src/server/michi-evidence.functions.ts`) — integrasi itu berpasangan dengan repo Michi dan diuji di sana.
- Data & perilaku: setiap tabel terikat `owner_id` — jangan menambah jalur baca/tulis yang melompati isolasi akun; validasi input server memakai skema Zod di `src/lib/graph/rpc-schemas.ts` (method RPC baru wajib ikut skema itu).

## Batas aman

- **Tanpa migrasi skema database** tanpa review manusia (D8): bila tugas ternyata butuh tabel/kolom baru, tandai `blocked` di `state.md` dengan alasan, jangan dipaksa.
- Tanpa dependensi baru tanpa alasan kuat + tes; tanpa upgrade mayor.
- Tugas terlalu besar → pecah: kerjakan bagian pertama yang berdiri sendiri, simpan sisanya sebagai "Tugas berikutnya".
- Dua kegagalan beruntun pada tugas yang sama → tandai `blocked` + alasan di `state.md`, pilih tugas lain.
- Bila `gh` gagal (jaringan/kuota GitHub), commit lokal + catat di `state.md`, lalu berhenti rapi.
- UI pelajar berbahasa Inggris; `/japanese` (dan panel Michi di dalamnya) berbahasa Indonesia (keputusan D2).
