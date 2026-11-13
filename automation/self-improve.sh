#!/usr/bin/env bash
# LearnGraph self-improvement loop.
# Menjalankan `opencode run` satu tugas per sesi; jeda otomatis saat kuota
# per-5-jam habis, lalu lanjut sendiri. Lihat automation/README.md.
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR" || exit 1
# systemd/tmux bisa mewarisi PATH minimal; pastikan shim mise (opencode, node, gh) tersedia.
export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

PRIMARY_MODEL="${LEARNGRAPH_MODEL:-zai-coding-plan/glm-5.3}"              # model utama (coding plan GLM)
FALLBACK_MODEL="${LEARNGRAPH_FALLBACK_MODEL:-opencode-go/deepseek-v4.1-flash}"  # otomatis dipakai saat kuota GLM habis
current_model="$PRIMARY_MODEL"
AGENT="${LEARNGRAPH_AGENT:-}"            # kosong = agent default
STATE="automation/state.md"
LOG_DIR="automation/log"
WORKTREE_DIR="${HOME}/.local/share/opencode/worktree"   # lokasi worktree sesi opencode
RATE_SLEEP="${LEARNGRAPH_SLEEP_LIMIT:-900}"   # 15 menit: tunggu reset kuota
TASK_SLEEP="${LEARNGRAPH_SLEEP_TASK:-300}"    # jeda antar tugas sukses (CI LearnGraph ±25 menit)
FAIL_SLEEP="${LEARNGRAPH_SLEEP_FAIL:-300}"    # jeda antar kegagalan
MAX_FAILS="${LEARNGRAPH_MAX_FAIL:-6}"         # stop setelah N kegagalan beruntun
# Jeda aman setelah waktu reset yang dilaporkan provider sebelum mencoba model utama lagi.
RESET_GRACE="${LEARNGRAPH_RESET_GRACE:-60}"
RATE_LIMIT_RE='429|rate.?limit|quota|usage.?limit|limit.*(exceed|reached)|too many requests|exceeded|insufficient.?balance|top.?up'
# LEARNGRAPH_DRY_RUN=1 (sukses) | limit (kuota utama) | limit2 (kuota saat fallback) | limitreset (kuota utama + waktu reset dekat) | error (gagal)
DRY_RUN="${LEARNGRAPH_DRY_RUN:-0}"

mkdir -p "$LOG_DIR"
LOCK="/tmp/learngraph-self-improve.lock"
exec 9>"$LOCK"
flock -n 9 || { echo "Loop LearnGraph lain sudah berjalan; keluar."; exit 0; }

log() { echo "[$(date -Is)] $*"; }

# Epoch kapan model utama boleh dicoba lagi (0 = tidak menunggu). Diisi saat
# kuota model utama habis; sesi berikutnya kembali ke model utama begitu waktu
# ini lewat, alih-alih menetap di fallback sampai fallback ikut kehabisan kuota.
primary_retry_at=0

# Ambil waktu reset dari pesan provider pada log ("... reset at 2026-11-13
# 16:34:58"), tafsirkan sebagai waktu lokal. Kosong bila tidak ada / tidak masuk
# akal (>12 jam ke depan) — pemanggil lalu memakai jeda percobaan pendek.
parse_primary_reset() {
  local hint epoch now
  hint=$(grep -oiE 'reset (at|on) [0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?' "$1" 2>/dev/null |
    tail -1 | sed -E 's/^reset (at|on) //I')
  [ -n "$hint" ] || return 1
  epoch=$(date -d "$hint" +%s 2>/dev/null) || return 1
  now=$(date +%s)
  [ "$epoch" -gt "$now" ] || return 1
  [ "$epoch" -le "$((now + 43200))" ] || return 1
  printf '%s\n' "$epoch"
}

command -v opencode >/dev/null 2>&1 || {
  log "FATAL: opencode tidak ditemukan di PATH"
  exit 1
}
command -v gh >/dev/null 2>&1 || log "PERINGATAN: gh tidak ditemukan; langkah PR otomatis akan gagal"

cleanup_worktrees() {
  # Hapus hanya worktree sesi opencode yang benar-benar tidak aktif (>3 jam) DAN bersih.
  # Worktree kotor sengaja dibiarkan agar hasil yang belum di-commit bisa diperiksa.
  git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2}' |
    while IFS= read -r wt; do
      case "$wt" in
        "$WORKTREE_DIR"/*)
          if [ -n "$(find "$wt" -maxdepth 0 -mmin +180 2>/dev/null)" ]; then
            if [ -z "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then
              git worktree remove "$wt" 2>/dev/null && log "bersihkan worktree lama: $wt"
            else
              log "worktree lama kotor, dibiarkan untuk diperiksa: $wt"
            fi
          fi
          ;;
      esac
    done
  git worktree prune 2>/dev/null || true
  find "$LOG_DIR" -name 'run-*.log' -mtime +30 -delete 2>/dev/null || true
}

log "mulai loop self-improve di $REPO_DIR (utama=${PRIMARY_MODEL:-default}, fallback=${FALLBACK_MODEL:-none}, dry-run=$DRY_RUN)"

fails=0
run_no=0
while true; do
  run_no=$((run_no + 1))
  stamp="$(date +%Y%m%d-%H%M%S)"
  logfile="$LOG_DIR/run-$stamp.log"

  git fetch origin main >/dev/null 2>&1 || log "warning: git fetch gagal"
  # Segarkan checkout utama bila bersih, supaya worktree sesi baru selalu dekat origin/main.
  if [ -z "$(git status --porcelain)" ]; then
    git merge --ff-only origin/main >/dev/null 2>&1 || log "warning: fast-forward main gagal"
  fi

  # Kembali ke model utama begitu perkiraan waktu reset kuotanya lewat,
  # walaupun fallback masih punya kuota (tanpa ini loop menetap di fallback).
  if [ "$current_model" = "$FALLBACK_MODEL" ] && [ -n "$PRIMARY_MODEL" ] &&
     [ "$primary_retry_at" -gt 0 ] && [ "$(date +%s)" -ge "$primary_retry_at" ]; then
    current_model="$PRIMARY_MODEL"
    primary_retry_at=0
    log "perkiraan kuota ${PRIMARY_MODEL} sudah pulih — kembali ke model utama"
  fi

  # Simulasi kuota saat model sudah berada di fallback.
  [ "$DRY_RUN" = "limit2" ] && current_model="$FALLBACK_MODEL"
  # Mode uji transisi: tanpa grace agar putaran berikutnya langsung melihat waktunya lewat.
  [ "$DRY_RUN" = "limitreset" ] && RESET_GRACE=0

  args=(opencode run --auto --archived --worktree --format json --title "self-improve #$run_no" --file "$REPO_DIR/automation/TASK_PROMPT.md")
  [ -n "$current_model" ] && args+=(--model "$current_model")
  [ -n "$AGENT" ] && args+=(--agent "$AGENT")
  args+=("Jalankan satu siklus perbaikan mandiri LearnGraph sesuai automation/TASK_PROMPT.md (terlampir): selesaikan 'Tugas berikutnya' di automation/state.md sampai merge PR, lalu perbarui automation/state.md untuk siklus berikutnya, lalu berhenti.")

  log "run #$run_no → $logfile"
  if [ "$DRY_RUN" != "0" ]; then
    log "DRY-RUN($DRY_RUN): ${args[*]}"
    case "$DRY_RUN" in
      limit|limit2) printf '%s\n' 'Error: 429 too many requests (simulasi)' >"$logfile" ;;
      limitreset)
        # Putaran 1: kuota utama dengan waktu reset 3 detik lagi; putaran 2: sukses.
        if [ "$run_no" -eq 1 ]; then
          printf 'Error: 429 quota reached. Your limit will reset at %s (simulasi)\n' \
            "$(date -d '+3 seconds' '+%Y-%m-%d %H:%M:%S')" >"$logfile"
        else
          printf '%s\n' '{"type":"step_finish"}' >"$logfile"
        fi
        ;;
      error) printf '%s\n' 'Error: simulasi kegagalan tak dikenal' >"$logfile" ;;
      *) printf '%s\n' '{"type":"step_finish"}' >"$logfile" ;;
    esac
    rc=0
    [ "$DRY_RUN" = "error" ] && rc=1
  else
    "${args[@]}" >"$logfile" 2>&1
    rc=$?
  fi

  cleanup_worktrees

  # Sukses dibuktikan event selesai model (rc=0 saja tidak cukup).
  success=0
  [ "$rc" -eq 0 ] && grep -q '"type":"step_finish"' "$logfile" && success=1

  # Limit hanya relevan bila sesi tidak sukses; log sukses bisa memuat kata "quota".
  if [ "$success" -eq 0 ] && grep -qiE "$RATE_LIMIT_RE" "$logfile"; then
    fails=0  # kuota/billing habis bukan kegagalan tugas
    if [ -n "$FALLBACK_MODEL" ] && [ "$current_model" != "$FALLBACK_MODEL" ]; then
      local_reset=$(parse_primary_reset "$logfile" || true)
      current_model="$FALLBACK_MODEL"
      if [ -n "$local_reset" ]; then
        primary_retry_at=$((local_reset + RESET_GRACE))
        log "kuota ${PRIMARY_MODEL} habis — beralih ke ${current_model}; ${PRIMARY_MODEL} dicoba lagi setelah $(date -d "@$primary_retry_at" '+%Y-%m-%d %H:%M:%S')"
      else
        # Waktu reset tak terbaca: coba model utama lagi setelah satu jeda kuota.
        primary_retry_at=$(($(date +%s) + RATE_SLEEP))
        log "kuota ${PRIMARY_MODEL} habis — beralih ke ${current_model}; waktu reset tak terbaca, ${PRIMARY_MODEL} dicoba lagi setelah $(date -d "@$primary_retry_at" '+%Y-%m-%d %H:%M:%S')"
      fi
      if [ "$DRY_RUN" = "limitreset" ]; then
        # Tunggu singkat agar putaran berikutnya melihat waktunya sudah lewat.
        sleep 3
        continue
      fi
      [ "$DRY_RUN" != "0" ] && exit 0
      continue
    fi
    if [ -n "$PRIMARY_MODEL" ] && [ "$current_model" = "$FALLBACK_MODEL" ]; then
      current_model="$PRIMARY_MODEL"
      primary_retry_at=0
      log "kuota fallback ${FALLBACK_MODEL} habis — tidur ${RATE_SLEEP}s, lalu coba ${PRIMARY_MODEL} lagi"
      [ "$DRY_RUN" != "0" ] && exit 0
      sleep "$RATE_SLEEP"
      continue
    fi
    log "kuota ${current_model} habis — tidur ${RATE_SLEEP}s, lalu lanjut otomatis"
    [ "$DRY_RUN" != "0" ] && exit 0
    sleep "$RATE_SLEEP"
    continue
  fi

  if [ "$success" -eq 1 ]; then
    fails=0
    log "run #$run_no selesai (rc=0)"
    if ! grep -q '^## Tugas berikutnya' "$STATE" 2>/dev/null; then
      log "PERINGATAN: $STATE tidak memuat '## Tugas berikutnya' — periksa run terakhir"
    fi
    [ "$DRY_RUN" != "0" ] && exit 0
    sleep "$TASK_SLEEP"
    continue
  fi

  fails=$((fails + 1))
  log "run #$run_no gagal (rc=$rc, kegagalan beruntun=$fails). Log: $logfile"
  if [ "$fails" -ge "$MAX_FAILS" ]; then
    log "terlalu banyak kegagalan beruntun — loop berhenti. Periksa $logfile"
    exit 1
  fi
  [ "$DRY_RUN" != "0" ] && exit 0
  sleep "$FAIL_SLEEP"
done
