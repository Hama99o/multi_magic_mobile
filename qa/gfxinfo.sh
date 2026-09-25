#!/usr/bin/env bash
# FRAME TIMING ON A DEVICE: smoothness, layer 2. A COMPARISON INSTRUMENT ONLY.
#
#   ./qa/gfxinfo.sh run <label>        # one drive, one report
#   ./qa/gfxinfo.sh compare <a> <b>    # two reports, side by side
#
# ── READ THIS BEFORE QUOTING A NUMBER ─────────────────────────────────────
# An x86 emulator on a sixteen-core desktop is not his phone. Absolute
# numbers from it mean nothing; a before-and-after on the same emulator,
# same drive, same boot, means something. And this is the DEV build: its
# JavaScript runs unminified, in development mode, which alone makes every
# absolute figure slower than the app he will install. So never write
# "2% jank" as a property of the app. Layer 1 (render counts,
# src/screens/__tests__/renders.test.tsx) carries the absolute claims.
#
# Two runs of the SAME code on the same boot differ too. Run the baseline
# twice and read that spread before believing any difference: a change
# smaller than the noise is no change.
#
# AND A BUSY HOST IS A THIRD APP. Measured 2026-09-25: two baselines of the
# same code, same boot, same 16-step drive: 781 frames at 21% jank, then 341
# at 57%, while another session's test suite held the host at load 24.7 on 16
# cores. So every report records the load, and a run refuses (NOT MEASURED)
# when the 1-minute load is over HALF the cores, at the start OR at the end
# of the drive: past that, the numbers are the host's. `compare` prints both loads; unequal loads make it no
# comparison.
#
# What it reads: `dumpsys gfxinfo <package>` after a reset, around the fixed
# drive `qa/flows/22-drive.yaml`: frames rendered, janky frames, and the 50th,
# 90th, 95th and 99th percentile frame times. Sign-in happens BEFORE the reset,
# so its frames are not counted.
#
# Needs: the emulator up and claimed, a Metro serving the dev build (qa.sh up),
# the QA account able to sign in. It starts nothing and stops nothing.
# Exit 0 · 1 the drive failed · 3 NOT MEASURED.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
export USE_DEV_BUILD=1
. "$DIR/qa.config.sh"
export PATH="$HOME/.maestro/bin:$PATH"
OUT="$DIR/reports/gfxinfo"
mkdir -p "$OUT"

not_measured() { echo "NOT MEASURED: $*"; exit 3; }

summary() {
  # The lines that matter from a gfxinfo dump, in a fixed order.
  grep -E "^(Total frames rendered|Janky frames|50th percentile|90th percentile|95th percentile|99th percentile):" "$1" \
    | grep -v "legacy" | head -6
}

case "${1:-}" in
  run)
    label="${2:?a label, e.g. baseline-1}"
    [ "$(adb -s "$SERIAL" get-state 2>/dev/null)" = device ] || not_measured "no device on $SERIAL"
    curl -s --max-time 3 "http://localhost:$METRO_PORT/status" | grep -q running || not_measured "no Metro on :$METRO_PORT (./qa/qa.sh up)"
    cores=$(nproc)
    load_start=$(cut -d' ' -f1 /proc/loadavg)
    awk -v l="$load_start" -v c="$cores" 'BEGIN { exit !(l > c / 2) }' \
      && not_measured "the host is busy (load $load_start on $cores cores, limit $((cores / 2))): frame timing would measure the host"
    export MAESTRO_QA_EMAIL="$QA_EMAIL" MAESTRO_QA_PASSWORD="$QA_PASSWORD"
    open_dev_build
    sleep 30
    maestro --device "$SERIAL" test -e APP_ID="$APP_ID" -e DEEP_LINK="$DEEP_LINK" "$DIR/flows/login.yaml" >/dev/null 2>&1 \
      || not_measured "could not sign in (maestro login.yaml)"
    front=$(adb -s "$SERIAL" shell dumpsys window 2>/dev/null | grep -m1 -E 'mCurrentFocus|mFocusedApp' | tr -d '\r')
    case "$front" in
      *host.exp.exponent*) not_measured "the app in front is EXPO GO, not the dev build $DEV_BUILD_ID";;
      *"$APP_ID"*) ;;
      *) not_measured "the app in front is not $APP_ID: ${front:-nothing}";;
    esac
    adb -s "$SERIAL" shell dumpsys gfxinfo "$APP_ID" reset >/dev/null
    maestro --device "$SERIAL" test -e APP_ID="$APP_ID" "$DIR/flows/22-drive.yaml" >"$OUT/$label.maestro.log" 2>&1
    rc=$?
    report="$OUT/$label.txt"
    adb -s "$SERIAL" shell dumpsys gfxinfo "$APP_ID" | tr -d '\r' > "$report.raw"
    {
      echo "# $label — $(date -Iseconds) — $AVD ($SERIAL), DEV build, drive 22-drive.yaml"
      echo "# COMPARISON ONLY: absolute numbers from an emulator mean nothing."
      echo "# host load: $load_start at start, $(cut -d' ' -f1 /proc/loadavg) at end, $cores cores"
      summary "$report.raw"
    } > "$report"
    # The END load too: on 2026-09-25 a run started at 7.23 and ended at
    # 14.29. Its frames were taken on a busy host, so they are not a number.
    load_end=$(cut -d' ' -f1 /proc/loadavg)
    if awk -v l="$load_end" -v c="$cores" 'BEGIN { exit !(l > c / 2) }'; then
      echo "# INVALID: the host load rose to $load_end during the drive (limit $((cores / 2)))" >> "$report"
      cat "$report"
      not_measured "the host got busy during the drive (load $load_end at the end); these frames are the host's"
    fi
    cat "$report"
    [ $rc -eq 0 ] || { echo "the drive FAILED (log: $OUT/$label.maestro.log); these frames are not a full drive"; exit 1; }
    ;;
  compare)
    a="$OUT/${2:?}.txt"; b="$OUT/${3:?}.txt"
    [ -f "$a" ] && [ -f "$b" ] || { echo "no such report: $a or $b"; exit 3; }
    echo "# COMPARISON ONLY, same emulator and boot assumed; check the headers agree."
    paste -d'|' <(sed 's/^/  /' "$a") <(sed 's/^/  /' "$b") | column -t -s'|'
    ;;
  *)
    sed -n '2,5p' "$0"; exit 3;;
esac
