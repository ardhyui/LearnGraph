# Roadmap LearnGraph

Backlog prioritas untuk perbaikan otomatis (satu item per putaran, tiap 2 jam).
**CI = lokal `npm run ci`** (tanpa GitHub Actions, sesuai keputusan pemilik): npm ci bersih,
typecheck, lint, test, build, smoke test Playwright dengan PGlite. Wajib hijau sebelum setiap merge.

Urutan: **aman → andal → berguna → mudah ditemukan**. Item yang butuh akun,
secret, atau keputusan biaya dari pemilik ditandai 🔒 dan dilewati sampai ada keputusan.

## Backlog

### P0 — Aman & andal
1. ~~CI sebagai gerbang setiap merge~~ ✅ 2026-10-31 — lokal: `npm run ci` (pemilik tidak ingin GitHub Actions).
2. ~~Rate limiting endpoint auth (sign-in/sign-up)~~ ✅ 2026-10-31
3. ~~Error boundary global + halaman 404/500 yang ramah; log error server yang konsisten~~ ✅ 2026-11-01
   - Lanjutan: pesan error mentah dari server function masih ikut terkirim ke klien (UI sudah menyembunyikannya di produksi); pertimbangkan menyaring pesan error 5xx di sisi server.
4. Header keamanan (CSP, X-Frame-Options, Referrer-Policy) lewat `vercel.json`/middleware.
5. Validasi input server-side dengan Zod untuk semua server function yang menulis data.
6. Bersihkan 89 warning lint (bertahap) lalu jadikan `--max-warnings` ketat di CI.
7. Pantau batas rate limit untuk sekolah di balik satu IP (NAT); pertimbangkan batas per akun selain per IP.
8. 🔒 Reset password & verifikasi email — butuh layanan pengirim email (mis. Resend) dan API key dari pemilik.

### P1 — Berguna untuk banyak pengguna
9. Onboarding pengguna baru: wizard singkat (profil, pilih domain), opsi mulai tanpa data demo.
10. Alur belajar inti di dashboard: "lanjutkan belajar", antrean review hari ini, tandai selesai/kuasai.
11. Aksesibilitas: label form, fokus keyboard, kontras, `aria-*` pada graph.
12. Pisahkan halaman admin/debug (`/tests`, `/status`, `/admin/*`) dari navigasi pengguna biasa.
13. Ekspor/impor data pengguna (JSON) — juga jalur migrasi data lama dari IndexedDB.
14. Fase 6: konten adaptif berdasarkan profil psikometrik.
15. 🔒 Fase 7: integrasi RAG/LLM — butuh API key berbayar; perlu keputusan biaya dari pemilik.

### P2 — Polesan
16. SEO dasar: `<title>`/meta per halaman, Open Graph, `robots.txt`, sitemap.
17. Mode offline/PWA (service worker) — kembalikan yang dihapus saat migrasi.
18. Pakai Zustand untuk state UI bersama atau hapus dependensinya.
19. Performa: code-splitting halaman graph yang berat.

## Log

- **2026-10-31** — Putaran #1: menyiapkan workflow CI di `docs/ci/ci.yml` (belum aktif: push ke `.github/workflows` ditolak karena token tanpa scope `workflow`). Memperbaiki bug engine spaced repetition: `getReviewQueue` menghitung tanggal review berikutnya dari *sekarang*, sehingga antrean review jatuh tempo (halaman Gaps) selalu kosong. Kini dihitung dari tanggal review terakhir + interval; ditambah test unit baru. Cek Fase 5 di `/tests` diperbaiki (konsep yang di-review 30 hari lalu harus jatuh tempo, yang baru di-review tidak) dan smoke test kini mewajibkan 0 kegagalan. Menyusun roadmap ini.
- **2026-10-31** — Putaran #2: CI lokal `npm run ci` (`scripts/ci.mjs`) menggantikan rencana GitHub Actions; `docs/ci/ci.yml` dihapus. Rate limiting auth via rate limiter bawaan Better Auth dengan storage Postgres (migrasi aditif `0003_rate_limit.sql`): sign-in 10×/menit, sign-up 5×/10 menit per IP; pesan ramah di UI saat kena batas; test unit + cek smoke baru.
- **2026-11-01** — Putaran #3: error boundary global + halaman 404/error yang ramah (`src/components/ErrorPages.tsx`): URL tak dikenal kini memberi HTTP 404 dengan tautan kembali ke dashboard; error render/loader menampilkan halaman "Something went wrong" dengan tombol *Try again*, tautan ke dashboard, dan kode referensi. Di produksi detail error disembunyikan (bisa berisi SQL/internal), di dev ditampilkan. Log error konsisten (`src/lib/errors.ts`): satu baris JSON per error tak terduga (`level`, `time`, `scope`, `ref`, `userId`/`path`, `name`, `message`, `stack` dipangkas); error wajar (401/403/429/validasi Zod) tidak dicatat sebagai error. `authMiddleware` mencatat error tak terduga dari semua server function lalu melempar ulang tanpa diubah. Test unit baru (8) + cek smoke 404. Tanpa migrasi.
