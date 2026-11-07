# Roadmap LearnGraph

Arah pengembangan berdasarkan kondisi kode per 8 November 2026 (v0.2.0, commit `2b693ef`).

| Dokumen | Isi |
|---------|-----|
| `Roadmap.md` (dokumen ini) | Apa yang dikerjakan berikutnya, urutannya, dan alasannya |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Backlog rinci dan log tiap putaran kerja |
| [`research/phases.md`](research/phases.md) | Spesifikasi dan tes fungsional per fase |

## Ringkasan

Mesin LearnGraph sudah berjalan: rekomendasi ZPD, deteksi celah, dan jadwal review saling konsisten, dengan data terisolasi per akun. Namun di luar `/japanese`, pelajar belum punya materi untuk dipelajari, dan penguasaan hanya berasal dari tombol seperti "I've got it". Rekomendasi jadi bertumpu pada data yang belum teruji, dan tutor AI (Fase 7) akan mewarisi masalah yang sama.

Karena itu roadmap ini mengubah urutan fase lama, yang menempatkan Fase 7 di atas Fase 6: **bukti belajar dan konten dulu, baru AI.**

| # | Milestone | Hasil bagi pengguna | Fase lama | Ukuran |
|---|-----------|---------------------|-----------|--------|
| M0 | Dasar yang jujur | CI hijau, dokumen sesuai kode | - | S |
| M1 | Bukti belajar | Penguasaan dibuktikan kuis, riwayat tercatat | 6C (manual) | M |
| M2 | Belajar di dalam aplikasi | Ada materi per konsep dan sesi harian | 6A | L |
| M3 | Siap dipakai orang lain | Data bisa diunduh dan dihapus, akun bisa dipulihkan | - | M |
| M4 | Tutor AI | AI mengenal riwayat dan kesulitan pelajar | 7 | M |
| M5 | Kurikulum dan soal dengan AI | Guru mendeskripsikan kursus, AI membuat draf | 6B, 6C | L |
| M6 | Guru dan kelas | Kurikulum bersama dan dasbor kelas | - | L |
| M7 | Riset dan model | Personalisasi dikalibrasi dari data nyata | 8 | L |

Ukuran bersifat relatif (S < M < L), bukan janji tanggal. 🔒 berarti butuh akun, secret, atau keputusan biaya dari pemilik. Milestone dikerjakan berurutan, dengan dua pengecualian: M3 bisa dimajukan bila aplikasi akan dibuka lebih awal, dan bagian tanpa biaya di M4 bisa dimulai setelah M1.

## Kondisi saat ini

### Yang sudah kuat

- Fase 1 sampai 5 selesai: graph ganda, ZPD, deteksi celah, dan satu model memori di `src/lib/graph/spacing.ts`.
- Fondasi server: PostgreSQL dengan isolasi per akun, validasi Zod untuk 46 method RPC, rate limit auth, dan header keamanan.
- Pengalaman pelajar: panel Today, onboarding, navigasi mobile, serta dasar aksesibilitas.
- `/japanese` membuktikan alur berbasis bukti: 48 soal, penilaian di server, dan syarat bukti tertunda sebelum dianggap kuasai.

### Yang membentuk urutan roadmap

| # | Temuan | Bukti | Akibat |
|---|--------|-------|--------|
| 1 | Penguasaan di subjek umum adalah laporan diri | `applyStudyOutcome` di `src/lib/study.ts` menaikkan mastery ke ≥ 85 saat "I've got it" | Gerbang prasyarat ZPD membaca angka yang belum teruji |
| 2 | Belum ada materi belajar | `ConceptNode` hanya punya `description`; `bloomObjectives` tidak tampil di halaman pelajar; akun baru mendapat 11 konsep contoh | "Learn next" menyebut topik, tetapi tidak mengajarkannya |
| 3 | Riwayat belajar nyaris tidak tercatat | Satu-satunya penulis `interactions` adalah `recordJapanesePractice` | Retensi tak terukur, mode "Automatic" tak bisa dibangun, Fase 8 tak punya data |
| 4 | Sistem bukti hanya untuk bahasa Jepang | Tabel `japanese_quizzes`, cek prefiks `jp-` di `src/server/graph.functions.ts:30` | Pola yang benar belum bisa dipakai subjek lain |
| 5 | Hanya 10 dari 39 domain psikometrik memengaruhi rencana belajar | `trait-scores.ts`, `deriveLearningStyle`, `estimateCognitiveProfile` | 29 domain, termasuk `political_ideology` dan `dark_triad_*`, ditanyakan tanpa manfaat bagi rencana belajar |
| 6 | Kontrol data belum lengkap | Tidak ada UI hapus akun atau persetujuan, walau `docs/SYSTEM_OVERVIEW.md` menjanjikan kontrol pengguna | Belum layak untuk pengguna selain pemilik |
| 7 | Gerbang CI tidak andal | 4 dari 217 test, yaitu benchmark warisan (tulis < 5 ms, baca < 2 ms), gagal di `main` pada mesin ini, padahal lulus di PR #29; `scripts/ci.mjs` berhenti di langkah pertama yang gagal | `npm run ci` bergantung pada kecepatan mesin, dan build serta smoke tidak sempat berjalan |
| 8 | Dokumen menyimpang dari kode | Penyebutan LevelDB, REST `/api/zpd`, port 3000, `/api/seed-users`, badge "37/37", `LICENSE` dan `docs/api.md` yang tidak ada | Pembaca dan agen AI mendapat arahan yang salah |
| 9 | Klaim hasil tanpa pengukuran | README menulis "Gap detection accuracy 90%: Achieved", tetapi tidak ada kode atau test yang mengukurnya | Efektivitas produk belum diketahui |
| 10 | Pengecekan prasyarat boros | `classifyConcept` membaca seluruh edge sekali per konsep lewat `getEdgesToConcept` | Melambat seiring kurikulum bertambah, terutama di Postgres jarak jauh |

## Milestone

### M0: Dasar yang jujur

**Tujuan:** gerbang CI bisa dipercaya dan dokumen sesuai kode.

- [ ] Putuskan PR #29 (unduh data CSV/JSON): rebase ke `main`, jalankan `npm run ci`, lalu merge atau tutup. Tidak ada konflik teks, tetapi hasil CI-nya mendahului PR #30.
- [ ] Pindahkan benchmark warisan dari `npm test` ke `npm run test:perf`, dengan target yang sesuai Postgres/PGlite. Lihat bagian "Performance" di `tests/education-graph-db.test.ts`.
- [ ] Selaraskan `README.md`, `.claude/CLAUDE.md`, dan `docs/SYSTEM_OVERVIEW.md` dengan arsitektur nyata: Postgres, server function, port 8080, jumlah test, `/japanese`.
- [ ] Ganti klaim yang tak terukur menjadi "belum diukur".
- [ ] Tambahkan file `LICENSE` (`README.md` dan `package.json` menyebut MIT).
- [ ] Hapus yang tak terpakai: `zustand`, `class-variance-authority`, `src/components/ui/background-beams.tsx`.

**Selesai bila:**

- `npm run ci` hijau dari checkout bersih `main`.
- Setiap perintah dan URL di README bisa dijalankan.

### M1: Bukti belajar

**Tujuan:** penguasaan berasal dari jawaban yang dinilai, dan setiap aktivitas belajar tercatat. Mengingat lewat kuis juga lebih efektif daripada sekadar menandai selesai (Roediger & Karpicke, 2006).

- [ ] Angkat kuis Jepang menjadi modul umum: bank soal per konsep, sesi kuis, penilaian di server, serta `evidenceMastery` dan `nextQuizReview` yang bisa dipakai ulang. Migrasi aditif; `/japanese` dan datanya tetap utuh.
- [ ] Ganti cek prefiks `jp-` dengan properti konsep, misalnya `evidenceRequired`.
- [ ] Catat aktivitas di tabel append-only baru, misalnya `learning_events`: jawaban, review, tunda, kuis. Tabel baru menghindari sanitasi data lama yang menghambat pencatatan riwayat di backlog.
- [ ] Sediakan editor soal di Admin, dan minimal 3 soal untuk tiap 11 konsep contoh.
- [ ] Panel Today memakai kuis singkat untuk "Learn next" dan "Review now" bila konsep punya soal. Konsep tanpa soal tetap memakai laporan diri (keputusan D5).
- [ ] Tampilkan asal penguasaan ("dari kuis" atau "laporan diri") di Gap Analysis dan Knowledge Graph.
- [ ] Tambahkan alur kuis umum ke smoke test di `npm run ci`. Smoke Jepang saat ini berada di luar CI.

**Selesai bila:**

- Konsep bersoal tidak bisa menjadi "mastered" tanpa kuis yang lolos, termasuk lewat RPC langsung (ada test).
- Setiap jawaban dan review tercatat sebagai event yang terikat akun (ada test isolasi).
- Persentase review jatuh tempo yang dijawab benar bisa dihitung dari event.

### M2: Belajar di dalam aplikasi (Fase 6A)

**Tujuan:** pengguna baru bisa benar-benar mempelajari sesuatu tanpa keluar dari aplikasi.

- [ ] Model konten per konsep, misalnya `content_items`: teks, tautan, video, latihan, durasi, bahasa, sumber. Konten dirender dengan sanitasi.
- [ ] Halaman `/learn/$conceptId`: tujuan, materi, contoh, kuis singkat, langkah berikutnya.
- [ ] `buildSessionPlan()`: gabungkan review jatuh tempo dan konsep ZPD menjadi sesi sesuai waktu yang dipilih pelajar, dari pola "Sesi hari ini" di `/japanese`.
- [ ] Tempo dan saran istirahat sederhana dari `pacePreference` dan `attentionSpan`.
- [ ] `scoreContentMatch()` dan `determinePresentationStrategy()` sebagai preferensi format yang bisa diubah pelajar, bukan diagnosis. Bukti bahwa mencocokkan materi dengan "gaya belajar" meningkatkan hasil masih lemah (Pashler dkk., 2008), jadi format yang dipakai dicatat di event agar efeknya bisa diuji.
- [ ] Lengkapi satu subjek sebagai contoh utuh (keputusan D6).
- [ ] Muat edge sekali per perhitungan ZPD, sebelum kurikulum melewati 100 konsep.

**Selesai bila:**

- Akun baru bisa menyelesaikan satu konsep (materi dan kuis) kurang dari 5 menit setelah daftar.
- `computeZPD` < 200 ms di Postgres dengan 200 konsep.
- Tes fungsional Fase 6A lulus: "Start session → content matches your style".

### M3: Siap dipakai orang lain

**Tujuan:** orang selain pemilik bisa memakai LearnGraph dengan aman, dan aplikasi tidak menjanjikan hal yang belum ada.

- [ ] Impor JSON sebagai pasangan ekspor dari PR #29.
- [ ] Hapus akun dan seluruh data dari UI. Foreign key `on delete cascade` sudah tersedia.
- [ ] Opsi mulai tanpa data contoh.
- [ ] Profil hanya menanyakan domain yang dipakai; domain sensitif tidak aktif secara bawaan dan ada persetujuan singkat (keputusan D4).
- [ ] Sembunyikan mode "Automatic" dan "Set, then adjust" sampai inferensinya benar-benar ada.
- [ ] Tetapkan bahasa antarmuka (keputusan D2).
- [ ] 🔒 Reset password dan verifikasi email (butuh layanan pengirim email).
- [ ] Kebijakan privasi singkat, dan uji pemulihan backup database produksi.

**Selesai bila:**

- Pengguna baru bisa daftar, memulihkan password, mengunduh data, dan menghapus akun tanpa bantuan.
- Pemulihan backup pernah diuji dan berhasil.
- Setiap klaim privasi di dokumen dan UI sudah benar-benar berlaku.

### M4: Tutor AI (Fase 7, sebagian 🔒)

**Tujuan:** LLM mana pun bisa menjelaskan sesuai riwayat dan kesulitan pelajar.

Bagian tanpa biaya LLM:

- [ ] `getRAGContext(learnerId, query)` sebagai fungsi tanpa LLM, ≤ 2000 token dan < 150 ms, berisi miskonsepsi, penguasaan beserta asalnya, ZPD, dan scaffolding.
- [ ] Deteksi jenis pertanyaan dan template prompt.
- [ ] Domain sensitif tidak pernah masuk konteks (daftar tolak dengan test).
- [ ] Tombol "Salin konteks untuk AI tutor", dengan isi yang bisa dilihat sebelum disalin.
- [ ] Antarmuka baca untuk LLM eksternal: API key per akun atau server MCP. Saat ini belum ada API publik, padahal tesis produknya adalah "makes any LLM smarter".

Bagian 🔒 (keputusan D3):

- [ ] Chat tutor bawaan dengan provider di balik satu antarmuka.
- [ ] Bandingkan jawaban dengan dan tanpa konteks pada pertanyaan yang sama.

**Selesai bila:**

- Tes fungsional Fase 7 lulus: "Ask tutor → knows your history/struggles".
- Sebagian besar penguji menilai jawaban terasa personal (target Fase 7: 80%).

### M5: Kurikulum dan soal dengan AI (Fase 6B dan 6C, 🔒)

**Tujuan:** mengatasi kekurangan konten tanpa menyerahkan mutu sepenuhnya kepada AI.

- [ ] Deskripsi atau silabus teks menjadi draf konsep, prasyarat, tingkat kesulitan, dan level Bloom. PDF dan Word menyusul.
- [ ] Validasi draf: tanpa siklus prasyarat, id valid, lolos skema yang ada.
- [ ] Review visual sebelum disimpan, lalu simpan secara atomik.
- [ ] Buat Quick Check, Mastery Test, dan Misconception Probe sebagai draf di bank soal M1, wajib disetujui manusia. Fitur ini punya toggle `assessmentsEnabled`.
- [ ] Simpan koreksi guru sebagai data. `learnFromCorrections()` ditunda sampai datanya cukup.

**Selesai bila (target Fase 6):**

- Minimal 80% edge dari AI disetujui, dan graph satu kursus selesai kurang dari 5 menit.
- Minimal 80% soal dari AI disetujui, dan review kurang dari 2 menit per konsep.

### M6: Guru dan kelas

Dikerjakan hanya bila keputusan D1 memilih sekolah.

- [ ] Peran guru dan pelajar; halaman admin dan developer disembunyikan dari pelajar.
- [ ] Kurikulum bersama lintas akun. Ini perubahan arsitektur terbesar karena semua data kini terikat `owner_id`.
- [ ] Dasbor kelas: celah dan progres per konsep.
- [ ] Rate limit per akun, agar sekolah di balik satu IP tidak terblokir.
- [ ] Telaah hukum data anak (UU PDP, GDPR) dan alur persetujuan wali.

**Selesai bila:** satu guru bisa menjalankan satu kelas nyata selama satu unit pelajaran tanpa bantuan pengembang.

### M7: Riset dan model (Fase 8)

Dimulai setelah data event cukup. Perkiraan awal: 3 bulan data dari 50 pelajar aktif.

- [ ] Uji domain psikometrik mana yang benar-benar memprediksi hasil belajar, lalu hapus sisanya dari rencana belajar.
- [ ] Kalibrasi interval review dari data, dan bandingkan dengan FSRS.
- [ ] `extractLearnerFeatures()`, `extractConceptFeatures()`, dan `exportForGNNTraining()` dengan anonimisasi.
- [ ] Latih GNN hanya bila model sederhana terbukti kurang.

**Selesai bila:** ekspor valid untuk pelatihan (semua fitur dalam [0,1], tanpa NaN), dan ada laporan apakah personalisasi meningkatkan hasil belajar.

## Pekerjaan lintas milestone

Dikerjakan saat menyentuh area terkait. Rinciannya ada di `docs/ROADMAP.md`.

- **Aksesibilitas:** tautan "Skip to content", jebakan fokus di dialog kuis, fokus setelah hapus baris admin, `aria-*` pada graph.
- **Mobile:** tabel admin menjadi kartu, panel detail graph menjadi bottom sheet.
- **Keamanan:** CSP dengan nonce, karena `script-src` masih memakai `unsafe-inline`.
- **Performa:** code-splitting halaman graph.
- **Utang kode:** pecah file terbesar saat diubah, yaitu `src/lib/assessments.ts` (2516 baris), `src/routes/profile.tsx` (2009), dan `src/lib/graph/education-graph-db.ts` (1950).
- **Dependensi:** `nitro` masih dipin ke versi beta; pindah ke rilis stabil saat tersedia.

## Ukuran keberhasilan

Angka berikut menggantikan klaim yang belum terukur. Sumbernya data aplikasi sendiri, tanpa analitik pihak ketiga.

| Ukuran | Definisi | Tersedia sejak | Target awal |
|--------|----------|----------------|-------------|
| Retensi saat review | Persentase review jatuh tempo yang dijawab benar di kuis | M1 | Mendekati prediksi `spacing.ts` |
| Kalibrasi laporan diri | Selisih antara "I've got it" dan hasil kuis | M1 | Dipantau, dasar untuk meninjau D5 |
| Kembali belajar | Persentase pelajar aktif minggu ini yang aktif lagi minggu depan | M1 | Ditetapkan setelah 4 minggu data |
| Aktivasi | Waktu dari daftar sampai konsep pertama selesai | M2 | < 5 menit |
| Penyelesaian sesi | Persentase sesi dimulai yang selesai | M2 | 80% |
| Efek personalisasi | Hasil kuis dengan dan tanpa personalisasi | M2 | Lebih baik; bila tidak, fitur disederhanakan |

## Keputusan untuk pemilik

| # | Keputusan | Rekomendasi | Memengaruhi |
|---|-----------|-------------|-------------|
| D1 | Siapa pengguna utama 6 bulan ke depan: pemilik, publik, atau sekolah? | Pemilik dulu (sudah memakai `/japanese`), lalu publik skala kecil. Sekolah belakangan. | M3, M6 |
| D2 | Bahasa antarmuka? Kini campur: `/japanese` berbahasa Indonesia, sisanya Inggris. | Satu bahasa utama sesuai D1. Sistem i18n hanya bila benar-benar butuh dua bahasa. | M2, M3 |
| D3 | Bagaimana membiayai LLM? 🔒 | Mulai dari "salin konteks" tanpa biaya, lalu kunci API milik pengguna atau model lokal. API berbayar proyek paling akhir. | M4, M5 |
| D4 | Apa yang dilakukan pada domain sensitif dan yang tak terpakai? | Berhenti menanyakan yang tak dipakai rencana belajar. Data yang sudah tersimpan tidak dihapus otomatis. | M3 |
| D5 | Bolehkah laporan diri menghasilkan "mastered"? | Boleh untuk konsep tanpa soal, dengan label yang jelas. Konsep bersoal wajib lewat kuis. | M1 |
| D6 | Subjek konten pertama? | Matematika dasar dari data contoh, untuk pengguna baru. Jepang tetap dipakai sendiri oleh pemilik. | M2 |
| D7 | Di mana produksi dan layanan email? 🔒 Status produksi tidak bisa dipastikan dari repo. | Vercel dan Postgres terkelola sesuai konfigurasi yang ada, plus satu pengirim email. | M3 |
| D8 | Lanjutkan putaran otomatis? Putaran terakhir di `main` adalah #27 (3 November). | Lanjutkan untuk item kecil. Perubahan model data di M1 dan M2 sebaiknya direview manusia. | Semua |

## Sengaja ditunda

- **GitHub Actions:** keputusan pemilik, CI tetap lokal lewat `npm run ci`.
- **GNN dan `learnFromCorrections()`:** belum ada data untuk melatihnya.
- **Inferensi kepribadian dari perilaku:** tidak dibangun sebelum event tercatat dan ada persetujuan pengguna.
- **PWA dan mode offline:** menunggu alur belajar inti stabil.
- **Sinkronisasi multi-perangkat untuk integrasi Michi:** tetap integrasi satu workstation.

## Cara memakai dokumen ini

1. Milestone aktif adalah milestone pertama yang kriteria "Selesai bila"-nya belum terpenuhi.
2. Pecah item milestone aktif menjadi tugas kecil di `docs/ROADMAP.md`. Backlog lama masuk ke sini: P0.6 ke M0 dan M3, P1.7 ke M6, P1.8 ke M3, P2.1 ke M2, P2.2 ke M4 dan M5, sisanya ke pekerjaan lintas milestone.
3. Perbarui dokumen ini saat milestone selesai atau saat satu keputusan diambil. Catatan harian tetap di `docs/ROADMAP.md`.

## Referensi

- Roediger, H. L. & Karpicke, J. D. (2006). Test-Enhanced Learning. *Psychological Science*.
- Pashler, H., McDaniel, M., Rohrer, D. & Bjork, R. (2008). Learning Styles: Concepts and Evidence. *Psychological Science in the Public Interest*.
