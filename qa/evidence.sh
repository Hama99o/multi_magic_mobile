#!/usr/bin/env bash
# Every picture a run took, filed in BOTH places it belongs, immediately.
#
#   ./qa/evidence.sh              # the newest run under ~/.maestro/tests
#   ./qa/evidence.sh 2026-09-19_022052
#
# ── WHY THIS EXISTS ──────────────────────────────────────────────────────
# Maestro does not put screenshots where `qa/run.sh` used to say it did. A
# `takeScreenshot: reports/66-x` lands in
#
#   ~/.maestro/tests/<timestamp>/<flow>/takeScreenshot/reports/66-x.png
#
# and nowhere in this repo at all. Two places want them and they want them for
# different reasons:
#
#   qa/evidence/     — the run's own record, every picture, by flow. What a
#                      verdict in FLOW_REGISTER.md points at.
#   docs/design/<screen>/ours/
#                    — what `docs/design/README.md` §4 defines DONE against.
#                      A screen is not done until its own folder holds it.
#
# Filing them at the end of the night means remembering which run was which;
# filing them as each flow lands means the verdict and the picture are written
# together. This script is the second one.
#
# ── AND THE FRAMES FOR STEPS THAT DID NOT HOLD ───────────────────────────
# Maestro also writes a screenshot and the whole view hierarchy for any step
# that did not complete cleanly, under `screenshots/` and `screen-hierarchy/`.
# That pair answers "why did it not see it" without the device still being
# attached, so it is kept next to the flow's own pictures.
#
# NOT called `failed/`, because measured: in run 7 both frames 12-account left
# behind were status WARNED, not FAILED — `login.yaml`'s optional probe asking
# "is the sign-in screen up?" and correctly finding it was not. A folder named
# `failed/` full of a passing flow's frames teaches the next reader to ignore
# the folder, which is exactly when it stops working. They go in `not-met/`,
# and never in `ours/`: a frame of an assertion that did not hold is not
# evidence that a screen is done.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"
RUNS="$HOME/.maestro/tests"

RUN="${1:-}"
if [ -z "$RUN" ]; then
  RUN="$(ls -1 "$RUNS" 2>/dev/null | sort | tail -1)"
fi
SRC="$RUNS/$RUN"
[ -d "$SRC" ] || { echo "No run at $SRC"; exit 3; }

# The screen each flow is evidence FOR. A flow can only file into a folder that
# exists — `docs/design/` has nine, and the board's DONE rows are these nine.
# Where a flow covers a screen that has no folder of its own (privacy, reached
# from the account screen; change-password, specified in profile/SPEC.md §2.2),
# it files under the folder whose SPEC actually specifies it.
screen_for() {
  case "$1" in
    01-ask|03-dictation|09-keyboard)            echo chat ;;
    02-sign-in|10-sign-up|11-forgot-password)   echo sign-in ;;
    04-delete-conversation|15-sessions-switch)  echo sessions ;;
    05-upload)                                  echo upload ;;
    06-people-chat)                             echo people-chat ;;
    07-notifications)                           echo notifications ;;
    08-calendar)                                echo calendar ;;
    12-account|16-ai-keys|17-privacy|18-delete-account) echo account ;;
    13-profile|14-change-password)              echo profile ;;
    *)                                          echo "" ;;
  esac
}

echo "Run: $SRC"
total=0; failed=0
for flowdir in "$SRC"/*/; do
  flow="$(basename "$flowdir")"
  [ "$flow" = "maestro.log" ] && continue
  screen="$(screen_for "$flow")"

  # THE PICTURE PASS FILES BY PICTURE, NOT BY FLOW. `99-screens` visits all
  # nine screens in one run, so one destination for the whole flow would put
  # the calendar in the chat's folder. Its filenames carry the screen —
  # `360-dark-en-calendar.png` — and that is what routes them.
  if [ "$flow" = "99-screens" ] && [ -d "$flowdir/takeScreenshot/reports" ]; then
    mkdir -p "$REPO/qa/evidence/$flow"
    cp -f "$flowdir/takeScreenshot/reports"/*.png "$REPO/qa/evidence/$flow/" 2>/dev/null
    for pic in "$flowdir/takeScreenshot/reports"/*.png; do
      [ -e "$pic" ] || continue
      base="$(basename "$pic" .png)"
      # <width>-<mode>-<lang>-<screen>: the screen is everything after the
      # third dash, because `people-chat` and `sign-in` contain one themselves.
      scr="$(echo "$base" | cut -d- -f4-)"
      if [ -d "$REPO/docs/design/$scr" ]; then
        mkdir -p "$REPO/docs/design/$scr/ours"
        cp -f "$pic" "$REPO/docs/design/$scr/ours/" 2>/dev/null
        total=$((total + 1))
      else
        echo "  $base -> NO docs/design/$scr — picture kept in qa/evidence only"
      fi
    done
    echo "  $flow: filed by screen into docs/design/*/ours/"
    continue
  fi

  shots="$flowdir/takeScreenshot/reports"
  if [ -d "$shots" ]; then
    mkdir -p "$REPO/qa/evidence/$flow"
    cp -f "$shots"/*.png "$REPO/qa/evidence/$flow/" 2>/dev/null
    n=$(ls -1 "$shots"/*.png 2>/dev/null | wc -l)
    total=$((total + n))
    if [ -n "$screen" ]; then
      mkdir -p "$REPO/docs/design/$screen/ours"
      cp -f "$shots"/*.png "$REPO/docs/design/$screen/ours/" 2>/dev/null
      echo "  $flow: $n → qa/evidence/$flow/ and docs/design/$screen/ours/"
    else
      # Not a silent skip: a flow with no screen is a mapping this script has
      # not been taught, and its pictures would otherwise never reach a SPEC.
      echo "  $flow: $n → qa/evidence/$flow/ only — NO SCREEN MAPPED, teach screen_for()"
    fi
  fi

  # Steps that did not hold — failed, or warned because an optional probe
  # found nothing. The status is in commands.json; the frame is here.
  if ls "$flowdir"/screenshots/step-*.png >/dev/null 2>&1; then
    mkdir -p "$REPO/qa/evidence/$flow/not-met"
    cp -f "$flowdir"/screenshots/step-*.png "$REPO/qa/evidence/$flow/not-met/" 2>/dev/null
    cp -f "$flowdir"/screen-hierarchy/step-*.json "$REPO/qa/evidence/$flow/not-met/" 2>/dev/null
    cp -f "$flowdir"/commands.json "$REPO/qa/evidence/$flow/not-met/" 2>/dev/null
    f=$(ls -1 "$flowdir"/screenshots/step-*.png 2>/dev/null | wc -l)
    failed=$((failed + f))
    echo "      + $f frame(s) for steps that did not hold → qa/evidence/$flow/not-met/"
  fi
done

echo
echo "$total screenshots filed, $failed frame(s) for steps that did not hold."
[ "$total" = 0 ] && echo "NOTHING FILED — that is not a pass, it is a run that took no pictures."
exit 0
