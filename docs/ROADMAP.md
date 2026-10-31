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
3. Error boundary global + halaman 404/500 yang ramah; log error server yang konsisten.
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
