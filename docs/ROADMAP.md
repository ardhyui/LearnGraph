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
   - ~~Lanjutan: pesan error mentah dari server function masih ikut terkirim ke klien~~ ✅ 2026-11-01 (putaran #6).
   - Lanjutan: error yang dilempar langsung oleh loader route saat SSR (bukan lewat server function) dan error sebelum middleware (mis. "Payload too large" bawaan TanStack) belum disaring server-side; saat ini tak ada loader yang melempar error mentah.
4. ~~Header keamanan (CSP, X-Frame-Options, Referrer-Policy) lewat `vercel.json`/middleware~~ ✅ 2026-11-01
   - Lanjutan: CSP masih `script-src 'unsafe-inline'` (skrip hidrasi TanStack + skrip tema inline); perketat dengan nonce per request.
   - Lanjutan: file statis yang dilayani CDN Vercel (`/assets/*`) tidak lewat middleware; pertimbangkan `routeRules` Nitro untuk `X-Content-Type-Options` di sana.
5. ~~Validasi input server-side dengan Zod untuk semua server function yang menulis data~~ ✅ 2026-11-01
   - Lanjutan: data lama (dibuat sebelum validasi) bisa masih berisi id dengan `:` atau bentuk `learningStyle` lama dari demo; pertimbangkan migrasi data aditif yang menormalkannya.
   - Lanjutan: `seedDemoData` di server masih menyimpan `learningStyle`/`cognitiveProfile` demo berbentuk lama (string/angka 0–1); normalkan di `demo-data.ts`.
6. Bersihkan 86 warning lint (bertahap) lalu jadikan `--max-warnings` ketat di CI.
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
- **2026-11-01 ~02:00 WIB** — Putaran #4: header keamanan di setiap respons (halaman, server function, `/api/auth`) lewat middleware request global baru `src/start.ts` + `src/lib/security-headers.ts` — berlaku sama di dev, preview, dan Vercel: Content-Security-Policy (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`/`form-action 'self'`, gambar dari `framerusercontent.com` diizinkan untuk latar dekoratif, websocket hanya di dev), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, dan HSTS hanya untuk HTTPS di luar dev. Karena mendefinisikan `startInstance` menggantikan middleware CSRF bawaan TanStack, CSRF untuk server function kini dipasang eksplisit (panggilan lintas situs → 403). Test unit baru (8) + 2 cek smoke (header terkirim, CSRF menolak). Smoke juga diverifikasi manual terhadap build produksi (preset node-server): semua halaman tanpa pelanggaran CSP. Tanpa migrasi.
- **2026-11-01 ~04:15 WIB** — Putaran #5: validasi input server-side untuk SEMUA panggilan `graphCall` (`src/lib/graph/rpc-schemas.ts`): skema Zod per method (46 method) memeriksa tiap argumen sebelum engine dijalankan, plus batas ukuran payload 256 KB. Id yang menjadi kunci penyimpanan (learner, konsep, domain) wajib 1–128 karakter tanpa `:` (pemisah kunci — mencegah data learner `a:b` bocor ke pemindaian learner `a`), tanpa karakter kontrol/spasi di tepi; baca/hapus tetap menerima id lama. Angka wajib finite dan dalam rentang terdokumentasi (mastery 0–100, skor psikometrik 0–100, confidence 0–1, Bloom 1–6, difficulty 1–10), string/array/record dibatasi, enum dicek, field tak dikenal/milik server (`userId`, `createdAt`, …) dibuang. Error validasi = 400 yang tidak dicatat sebagai error server, pesannya terbaca di form ("Invalid input for addConcept: argument 1.conceptId: must not contain ":""). Sekalian memperbaiki 3 bug data yang ketahuan validasi: form Data Entry menyimpan mastery 0–1 (bukan 0–100), Admin › States menyimpan Bloom level sebagai teks (`"understand"`) bukan 1–6, tombol "Create Sample Users" mengirim `learningStyle`/`cognitiveProfile` berbentuk lama. Test unit baru (11) + cek smoke (form konsep menolak id dengan `:`). Lint 89 → 86 warning. Tanpa migrasi.
- **2026-11-01 ~06:30 WIB** — Putaran #6: error tak terduga dari server function tidak lagi bocor ke browser di produksi. Sebelumnya `authMiddleware` melempar ulang error apa adanya, dan TanStack Start mengirim `message`-nya ke klien (mis. `Learner not found: <id>`, pesan SQL/driver Postgres berisi nama tabel). Kini `toClientError` (`src/lib/errors.ts`) menggantinya dengan `InternalServerError` generik "Something went wrong on our side. Please try again. (ref xxxx)" — `ref` sama dengan baris log JSON di server, dan halaman error di klien memakai ref yang sama (dibaca dari pesan). Error wajar (400 validasi, 401, 403, 429) tetap membawa pesannya (form masih menampilkan teks validasi) tapi stack server dibuang. Di dev semua detail tetap tampil. Middleware kini juga membungkus cek sesi/CSRF (error DB saat lookup sesi ikut disaring & dicatat), dan `getCurrentUser` memakai `serverErrorMiddleware` baru. Diverifikasi manual pada build produksi (preset node-server): error engine → pesan generik + ref, error validasi → pesan validasi utuh, log server berisi detail aslinya. Test unit baru (6). Tanpa migrasi.
