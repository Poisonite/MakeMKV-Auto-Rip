#!/usr/bin/env bash
#
# ddrescue-recover.sh
#
# Image a (possibly damaged) optical disc with GNU ddrescue, skipping unreadable
# areas so a usable copy can still be produced even when individual sectors are
# physically unreadable. Intended to be invoked from the MakeMKV Auto Rip
# read-error recovery service through the MSYS2 bash shell on Windows.
#
# Usage:
#   ddrescue-recover.sh <device> <output-image-path>
#
#   <device>             Optical device node inside MSYS2, e.g. /dev/sr0
#   <output-image-path>  Destination image path (Windows "C:\..." or MSYS path)
#
# Behaviour is tuned through environment variables (all optional):
#   DDR_PASSES        How many passes to run (1-3). Pass 1 is the fast copy that
#                     grabs everything readable; passes 2-3 are slow scraping
#                     retries of the damaged areas that usually claw back very
#                     little for a large time cost.                (default: 1)
#   DDR_RETRIES       Retry count for the scraping passes          (default: 3)
#   DDR_TIMEOUT       ddrescue --timeout value, e.g. "30m". Aborts a pass when
#                     no data is read for this long. Empty disables.  (default: "")
#   DDR_MAX_RUNTIME   Hard wall-clock ceiling in SECONDS for the whole run; a
#                     watchdog stops every pass once it elapses.  (default: 0 = off)
#   DDR_REVERSE       "1" to add a reverse-direction scraping pass    (default: 1)
#   DDR_DIRECT        "1" to use direct disc access (-d / O_DIRECT)   (default: 0)
#   DDR_RESUME        "1" to resume from an existing image+mapfile    (default: 1)
#
# Produces <image> plus <image>.map (ddrescue mapfile) and <image>.size (the
# device size, used to detect a different disc on resume). The mapfile lets a
# later run resume only the still-unreadable areas, e.g. after cleaning the disc.
#
# Exit codes:
#   0    success (some data recovered)
#   2    bad arguments
#   3    ddrescue not found on PATH
#   4    device not readable (no Administrator rights, no media, or dead disc)
#   5    no data recovered
#   143  stopped by signal or by the max-runtime watchdog (partial image kept)

set -u

DEVICE="${1:-}"
OUT_RAW="${2:-}"

PASSES="${DDR_PASSES:-1}"
RETRIES="${DDR_RETRIES:-3}"
TIMEOUT="${DDR_TIMEOUT:-}"
MAX_RUNTIME="${DDR_MAX_RUNTIME:-0}"
REVERSE="${DDR_REVERSE:-1}"
DIRECT="${DDR_DIRECT:-0}"
RESUME="${DDR_RESUME:-1}"

CURRENT_PID=""
WATCHDOG_PID=""

log()  { echo "ddrescue-recover: $*"; }
warn() { echo "ddrescue-recover: $*" >&2; }

# --- signal handling -------------------------------------------------------
# A trapped TERM/INT must stop the current ddrescue AND abort the script so it
# does NOT roll on to the next pass. Without this, killing the process only ends
# one pass and the script immediately starts the next one (or orphans ddrescue).
stop_watchdog() {
  [[ -n "$WATCHDOG_PID" ]] && kill "$WATCHDOG_PID" 2>/dev/null
  WATCHDOG_PID=""
}

on_term() {
  warn "received stop signal; terminating ddrescue and aborting (partial image kept)."
  [[ -n "$CURRENT_PID" ]] && kill -TERM "$CURRENT_PID" 2>/dev/null
  stop_watchdog
  exit 143
}
trap on_term TERM INT
trap stop_watchdog EXIT

# Run one ddrescue pass in the background and wait, so a trapped signal can
# interrupt the wait, kill the child, and abort before the next pass. ddrescue's
# per-second status block is left on stdout: the app parses it for live progress
# (percentage, bad areas, rates) and throttles it down to a periodic summary.
# Our own "ddrescue-recover:" lines are how the app tells the two apart.
run_pass() {
  ddrescue "$@" &
  CURRENT_PID=$!
  wait "$CURRENT_PID"
  local rc=$?
  CURRENT_PID=""
  return $rc
}

# Print a single summary line for a finished pass: how much is now rescued, how
# much is still unreadable, and how long the pass took. Totals come from the
# mapfile (bash evaluates the 0x.. sizes directly; awk only formats decimals).
report_pass() {
  local label="$1" elapsed="$2"
  local rescued=0 bad=0 total=0 sz pos size status
  if [[ -s "$MAP" ]]; then
    while read -r pos size status _; do
      [[ "$size" == 0x* ]] || continue
      sz=$((size))
      total=$((total + sz))
      [[ "$status" == "+" ]] && rescued=$((rescued + sz))
      [[ "$status" == "-" ]] && bad=$((bad + sz))
    done < "$MAP"
  fi
  local pct badmb
  pct=$(awk -v r="$rescued" -v t="$total" 'BEGIN { printf "%.2f", (t > 0) ? r * 100 / t : 0 }')
  badmb=$(awk -v b="$bad" 'BEGIN { printf "%.2f", b / 1048576 }')
  log "$label done in ${elapsed}s - rescued ${pct}%, ${badmb} MB still unreadable"
}

# --- argument / tool validation -------------------------------------------
if [[ -z "$DEVICE" || -z "$OUT_RAW" ]]; then
  warn "missing arguments"
  warn "usage: ddrescue-recover.sh <device> <output-image-path>"
  exit 2
fi

if ! command -v ddrescue >/dev/null 2>&1; then
  warn "ddrescue not found on PATH"
  exit 3
fi

# Accept either a Windows path (C:\...) or an MSYS path for the output image.
if command -v cygpath >/dev/null 2>&1; then
  OUT="$(cygpath -u "$OUT_RAW")"
else
  OUT="$OUT_RAW"
fi
MAP="${OUT}.map"
SIZEFILE="${OUT}.size"

mkdir -p "$(dirname "$OUT")"

# Probe the device with a real read rather than a bare "-r" test: on Cygwin/MSYS2
# the "-r" test is unreliable for raw optical nodes, and the most common failure
# modes only show up when you actually try to read sector 0.
if ! dd if="$DEVICE" of=/dev/null bs=2048 count=1 >/dev/null 2>&1; then
  warn "cannot read $DEVICE (sector 0)."
  warn "likely causes: (1) not running as Administrator (raw optical reads need it),"
  warn "               (2) no disc inserted, or (3) the disc is too damaged to read at all."
  exit 4
fi

# --- disc-identity fingerprint (detect a different disc on resume) ---------
DEVICE_SIZE=0
if command -v blockdev >/dev/null 2>&1; then
  DEVICE_SIZE="$(blockdev --getsize64 "$DEVICE" 2>/dev/null || echo 0)"
fi

discard_stale() {
  warn "$1 - discarding the old image and starting fresh."
  rm -f "$OUT" "$MAP" "$SIZEFILE"
}

if [[ "$RESUME" != "1" ]]; then
  if [[ -e "$OUT" || -e "$MAP" ]]; then
    discard_stale "resume disabled"
  fi
elif [[ -s "$OUT" && -s "$MAP" ]]; then
  # Resume requested and prior data exists - validate it still matches this disc.
  if [[ "$DEVICE_SIZE" != "0" && -s "$SIZEFILE" ]]; then
    PREV_SIZE="$(cat "$SIZEFILE" 2>/dev/null || echo 0)"
    if [[ "$PREV_SIZE" != "$DEVICE_SIZE" ]]; then
      discard_stale "device size changed ($PREV_SIZE -> $DEVICE_SIZE); this looks like a different disc"
    fi
  fi
  # Guard against a corrupt/truncated mapfile from an interrupted write: a valid
  # ddrescue mapfile has at least one hex position line. If none, it cannot be
  # resumed, so back it up and start clean rather than failing every retry.
  if [[ -s "$MAP" ]] && ! grep -qE '^0x' "$MAP" 2>/dev/null; then
    warn "mapfile looks corrupt; backing it up to ${MAP}.bad and starting fresh."
    mv -f "$MAP" "${MAP}.bad" 2>/dev/null || rm -f "$MAP"
    rm -f "$OUT"
  fi
fi

if [[ -s "$OUT" && -s "$MAP" ]]; then
  log "existing image and mapfile found - resuming previous recovery."
fi

# Record the current device size for the next resume check.
[[ "$DEVICE_SIZE" != "0" ]] && echo "$DEVICE_SIZE" > "$SIZEFILE"

# --- runtime watchdog (hard wall-clock cap) --------------------------------
if [[ "$MAX_RUNTIME" =~ ^[0-9]+$ && "$MAX_RUNTIME" -gt 0 ]]; then
  MAIN_PID=$$
  ( sleep "$MAX_RUNTIME"; echo "ddrescue-recover: max runtime ${MAX_RUNTIME}s reached; stopping." >&2; kill -TERM "$MAIN_PID" 2>/dev/null ) &
  WATCHDOG_PID=$!
  log "max runtime watchdog armed for ${MAX_RUNTIME}s."
fi

# A non-numeric or sub-1 pass count makes no sense; fall back to a single pass.
[[ "$PASSES" =~ ^[0-9]+$ && "$PASSES" -ge 1 ]] || PASSES=1

# Assemble the options shared by every pass.
COMMON=(-b 2048)
[[ "$DIRECT" == "1" ]] && COMMON+=(-d)
[[ -n "$TIMEOUT" ]] && COMMON+=(--timeout="$TIMEOUT")

log "device=$DEVICE image=$OUT passes=$PASSES retries=$RETRIES timeout=${TIMEOUT:-none} max_runtime=${MAX_RUNTIME}s reverse=$REVERSE direct=$DIRECT"

# Pass 1: fast copy of all readable areas, no scraping or retrying (-n). This
# grabs the bulk of the disc quickly and records bad regions in the mapfile.
log "pass 1 start (fast copy, skip unreadable areas)"
START=$SECONDS
run_pass -n "${COMMON[@]}" "$DEVICE" "$OUT" "$MAP" || true
report_pass "pass 1" "$((SECONDS - START))"

# Pass 2 (DDR_PASSES>=2): revisit only the damaged regions recorded in the
# mapfile, trimming and retrying a few times to claw back as much as the drive
# can still read. Skipped by default - pass 1 already gets nearly everything.
if [[ "$PASSES" -ge 2 ]]; then
  log "pass 2 start (retry damaged areas forward, retries=$RETRIES)"
  START=$SECONDS
  run_pass -r"$RETRIES" "${COMMON[@]}" "$DEVICE" "$OUT" "$MAP" || true
  report_pass "pass 2" "$((SECONDS - START))"
fi

# Pass 3 (DDR_PASSES>=3 and reverse enabled): retry the still-bad regions reading
# backwards. A reverse sweep often recovers sectors right after a defect that a
# forward read cannot.
if [[ "$PASSES" -ge 3 && "$REVERSE" == "1" ]]; then
  log "pass 3 start (retry damaged areas in reverse, retries=$RETRIES)"
  START=$SECONDS
  run_pass -R -r"$RETRIES" "${COMMON[@]}" "$DEVICE" "$OUT" "$MAP" || true
  report_pass "pass 3" "$((SECONDS - START))"
fi

stop_watchdog

if [[ ! -s "$OUT" ]]; then
  warn "no data recovered"
  exit 5
fi

log "done ($(stat -c %s "$OUT" 2>/dev/null || echo '?') bytes in image)"
exit 0
