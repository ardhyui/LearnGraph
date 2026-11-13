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
RATE_LIMIT_RE='429|rate.?limit|quota|usage.?limit|limit.*(exceed|reached)|too many requests|exceeded|insufficient.?balance|top.?up'
# LEARNGRAPH_DRY_RUN=1 (sukses) | limit (kuota utama) | limit2 (kuota saat fallback) | error (gagal)
DRY_RUN="${LEARNGRAPH_DRY_RUN:-0}"

mkdir -p "$LOG_DIR"
LOCK="/tmp/learngraph-self-improve.lock"
exec 9>"$LOCK"
flock -n 9 || { echo "Loop LearnGraph lain sudah berjalan; keluar."; exit 0; }

log() { echo "[$(date -Is)] $*"; }

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

  # Simulasi kuota saat model sudah berada di fallback.
  [ "$DRY_RUN" = "limit2" ] && current_model="$FALLBACK_MODEL"

  args=(opencode run --auto --archived --worktree --format json --title "self-improve #$run_no" --file "$REPO_DIR/automation/TASK_PROMPT.md")
  [ -n "$current_model" ] && args+=(--model "$current_model")
  [ -n "$AGENT" ] && args+=(--agent "$AGENT")
  args+=("Jalankan satu siklus perbaikan mandiri LearnGraph sesuai automation/TASK_PROMPT.md (terlampir): selesaikan 'Tugas berikutnya' di automation/state.md sampai merge PR, lalu perbarui automation/state.md untuk siklus berikutnya, lalu berhenti.")

  log "run #$run_no → $logfile"
  if [ "$DRY_RUN" != "0" ]; then
    log "DRY-RUN($DRY_RUN): ${args[*]}"
    case "$DRY_RUN" in
      limit|limit2) printf '%s\n' 'Error: 429 too many requests (simulasi)' >"$logfile" ;;
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
      current_model="$FALLBACK_MODEL"
      log "kuota ${PRIMARY_MODEL} habis — beralih ke ${current_model} tanpa jeda"
      [ "$DRY_RUN" != "0" ] && exit 0
      continue
    fi
    if [ -n "$PRIMARY_MODEL" ] && [ "$current_model" = "$FALLBACK_MODEL" ]; then
      current_model="$PRIMARY_MODEL"
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
