# Otomasi self-improve LearnGraph

Loop tanpa pengawasan yang menjalankan `opencode run` (model GLM dari coding plan)
untuk menyelesaikan **satu tugas per sesi**: perbaiki bug / item backlog kecil /
perkuat tes → gerbang `npm run ci` utuh → PR → merge → catat tugas berikutnya.
Sesuai keputusan pemilik D8 di `Roadmap.md`: putaran otomatis hanya untuk item
kecil; perubahan model data dan keputusan produk tetap milik manusia
(lihat larangan di `TASK_PROMPT.md`).
Saat kuota per-5-jam habis, loop **tidur 15 menit lalu lanjut sendiri**.

## Komponen

| Berkas | Fungsi |
| --- | --- |
| `self-improve.sh` | Loop utama (panggil `opencode run`, deteksi limit, bersihkan worktree) |
| `TASK_PROMPT.md` | "Konstitusi" setiap sesi: alur wajib, gerbang, larangan, batas aman |
| `state.md` | Memori antar sesi: tugas berikutnya, riwayat PR, blokiran |
| `log/run-*.log` | Log per sesi (di-gitignore) |
| `learngraph-self-improve.service` | Unit systemd user (opsional, auto-jalan saat boot) |

## Menjalankan

Cara termudah (pantau kapan saja, berhenti dengan Ctrl-C):

```bash
cd ~/Projects/LearnGraph
tmux new-session -d -s learngraph-auto 'bash automation/self-improve.sh'
tmux attach -t learngraph-auto   # lihat progres; detach: Ctrl-b d
```

Tanpa tmux, langsung di terminal: `bash automation/self-improve.sh`.
Berhenti: `tmux kill-session -t learngraph-auto` (atau Ctrl-C).

Opsi systemd (jalan terus setelah reboot; kegagalan fatal diulang setiap 1 jam):

```bash
mkdir -p ~/.config/systemd/user
cp automation/learngraph-self-improve.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now learngraph-self-improve
journalctl --user -u learngraph-self-improve -f     # pantau
systemctl --user disable --now learngraph-self-improve  # berhenti
```

## Variabel lingkungan

| Variabel | Default | Arti |
| --- | --- | --- |
| `LEARNGRAPH_MODEL` | `zai-coding-plan/glm-5.3` | Model utama tiap sesi |
| `LEARNGRAPH_FALLBACK_MODEL` | `opencode-go/deepseek-v4.1-flash` | Otomatis dipakai saat kuota model utama habis (kosongkan untuk menonaktifkan) |
| `LEARNGRAPH_AGENT` | (default opencode) | Agent yang dipakai tiap sesi |
| `LEARNGRAPH_SLEEP_LIMIT` | `900` | Detik menunggu reset kuota (15 menit) |
| `LEARNGRAPH_SLEEP_TASK` | `300` | Jeda antar tugas sukses (CI LearnGraph ±25 menit/session) |
| `LEARNGRAPH_SLEEP_FAIL` | `300` | Jeda antar kegagalan |
| `LEARNGRAPH_MAX_FAIL` | `6` | Stop setelah N kegagalan beruntun |
| `LEARNGRAPH_DRY_RUN` | `0` | `1`/`limit`/`limit2`/`error` = simulasi satu iterasi tanpa memanggil model |

## Cara kerja & batas

- Setiap sesi berjalan di **git worktree terpisah** (`--worktree`) — pekerjaan manualmu
  di checkout utama tidak tersentuh. Worktree sesi lama dibersihkan otomatis hanya bila
  sudah >3 jam tidak aktif **dan** bersih; worktree kotor dibiarkan untuk diperiksa.
  Log sesi >30 hari dihapus otomatis.
- Checkout utama di-fast-forward ke `origin/main` sebelum tiap sesi (hanya bila bersih),
  supaya worktree baru selalu dekat kode terbaru.
- Merge ke `main` hanya lewat PR, dan hanya jika `npm run ci` utuh hijau
  (install, typecheck, lint 0 warning, test unit, build, CSP build produksi, smoke).
  Tidak ada force-push, tidak ada commit langsung ke main.
- Loop sengaja **tidak** mengerjakan: item keputusan pemilik (D1–D8 di `Roadmap.md`),
  apa pun yang bertanda 🔒, M6/M7, dan migrasi skema database (D8: review manusia).
  Ringkasannya di `TASK_PROMPT.md`; tandai `blocked` di `state.md` bila tugas
  ternyata masuk area itu.
- Limit kuota dideteksi dari pola pesan pada log sesi (429/rate limit/quota/insufficient
  balance). Perilakunya:
  1. **Kuota GLM habis → otomatis pindah ke DeepSeek 4.1 Flash** tanpa jeda.
  2. **Kuota fallback juga habis → tidur 15 menit**, lalu kembali mencoba GLM.
  3. Tanpa fallback (`LEARNGRAPH_FALLBACK_MODEL=""`) → tidur 15 menit lalu ulangi model yang sama.
  `opencode run` bisa exit 0 meski model error, jadi sukses juga diverifikasi dari event
  `step_finish` di output JSON. Bila pola error provider berubah, sesuaikan `RATE_LIMIT_RE`.
- Keamanan: `--auto` menyetujui izin tool secara otomatis. Loop ini hanya seaman
  task prompt-nya; review `TASK_PROMPT.md` dan riwayat PR (`gh pr list`) secara berkala,
  dan pisahkan limit kuota bila perlu. Satu instance saja (dilindungi flock).
- Log per sesi ada di `automation/log/`; audit hasil lewat `gh pr list` dan
  `automation/state.md`.
