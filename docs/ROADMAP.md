# Roadmap LearnGraph

Backlog prioritas untuk perbaikan otomatis (satu item per putaran, tiap 2 jam).
Urutan: **aman → andal → berguna → mudah ditemukan**. Item yang butuh akun,
secret, atau keputusan biaya dari pemilik ditandai 🔒 dan dilewati sampai ada keputusan.

## Backlog

### P0 — Aman & andal
1. 🔒 CI GitHub Actions (typecheck, lint, test, build, smoke) sebagai gerbang setiap merge — workflow sudah siap di `docs/ci/ci.yml`, tetapi token bot tidak punya scope `workflow`. Pemilik perlu menjalankan `gh auth refresh -s workflow` (atau memindahkan file itu ke `.github/workflows/ci.yml` sendiri).
2. Rate limiting endpoint auth (sign-in/sign-up) untuk mencegah brute force (pakai rate limiter bawaan better-auth, storage DB).
3. Error boundary global + halaman 404/500 yang ramah; log error server yang konsisten.
4. Header keamanan (CSP, X-Frame-Options, Referrer-Policy) lewat `vercel.json`/middleware.
5. Validasi input server-side dengan Zod untuk semua server function yang menulis data.
6. Bersihkan 89 warning lint (bertahap) lalu jadikan `--max-warnings` ketat di CI.
7. 🔒 Reset password & verifikasi email — butuh layanan pengirim email (mis. Resend) dan API key dari pemilik.

### P1 — Berguna untuk banyak pengguna
8. Onboarding pengguna baru: wizard singkat (profil, pilih domain), opsi mulai tanpa data demo.
9. Alur belajar inti di dashboard: "lanjutkan belajar", antrean review hari ini, tandai selesai/kuasai.
10. Aksesibilitas: label form, fokus keyboard, kontras, `aria-*` pada graph.
11. Pisahkan halaman admin/debug (`/tests`, `/status`, `/admin/*`) dari navigasi pengguna biasa.
12. Ekspor/impor data pengguna (JSON) — juga jalur migrasi data lama dari IndexedDB.
13. Fase 6: konten adaptif berdasarkan profil psikometrik.
14. 🔒 Fase 7: integrasi RAG/LLM — butuh API key berbayar; perlu keputusan biaya dari pemilik.

### P2 — Polesan
15. SEO dasar: `<title>`/meta per halaman, Open Graph, `robots.txt`, sitemap.
16. Mode offline/PWA (service worker) — kembalikan yang dihapus saat migrasi.
17. Pakai Zustand untuk state UI bersama atau hapus dependensinya.
18. Performa: code-splitting halaman graph yang berat.

## Log

- **2026-10-31** — Putaran #1: menyiapkan workflow CI di `docs/ci/ci.yml` (belum aktif: push ke `.github/workflows` ditolak karena token tanpa scope `workflow`). Memperbaiki bug engine spaced repetition: `getReviewQueue` menghitung tanggal review berikutnya dari *sekarang*, sehingga antrean review jatuh tempo (halaman Gaps) selalu kosong. Kini dihitung dari tanggal review terakhir + interval; ditambah test unit baru. Cek Fase 5 di `/tests` diperbaiki (konsep yang di-review 30 hari lalu harus jatuh tempo, yang baru di-review tidak) dan smoke test kini mewajibkan 0 kegagalan. Menyusun roadmap ini.
