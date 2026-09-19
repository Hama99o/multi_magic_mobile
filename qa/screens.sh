#!/usr/bin/env bash
# THE PICTURE PASS — nine screens, three widths, two modes, and French at 360.
#
#   ./qa/screens.sh            # the whole pass
#   ./qa/screens.sh 360-dark   # one combination, by name
#
# ── WHAT DONE MEANS, AND WHY THE ORDER IS BY SCREEN ──────────────────────
# `docs/design/README.md` §4: a screen is DONE when `ours/` holds it at 360,
# 411 and 800 dp. Hamma9901 added French at 360 in both modes as a fourth,
# because whether a French string FITS is the one check Jest cannot make — its
# 1.9x length budget is a proxy and says so.
#
# If the device runs short, STOP AT A WHOLE SCREEN, never a whole width. Five
# screens complete is five DONEs; nine screens missing 411 is nine folders that
# look finished and are not, which is the failure README §4 exists to prevent.
#
# ── WIDTH IS DENSITY, NOT RESOLUTION ─────────────────────────────────────
# dp = px * 160 / density. The panel stays 1080 wide and the density moves, so
# nothing re-lays-out for a resolution the app will never meet:
#
#   360 dp -> density 480      the small phone, and the one that truncates
#   411 dp -> density 420      this AVD's own, the canonical phone
#   800 dp -> 1600px @ 320     the tablet, where §8 says the measure centres
#
# ALWAYS `wm size reset` and `wm density reset` at the end. A device left with
# an Override is a device the next session cannot trust, and `adb shell wm size`
# printing an Override line is exactly what Karwan uses as release proof.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/qa.config.sh"
export PATH="$HOME/.maestro/bin:$PATH"
ONLY="${1:-}"
DL="multimagic://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${METRO_PORT}"

reset_device() {
  adb -s "$SERIAL" shell wm size reset >/dev/null 2>&1
  adb -s "$SERIAL" shell wm density reset >/dev/null 2>&1
  adb -s "$SERIAL" shell cmd uimode night no >/dev/null 2>&1
}
trap reset_device EXIT

run_flow() {  # run_flow <yaml> <extra -e args...>
  local f="$1"; shift
  maestro --device "$SERIAL" test \
    -e APP_ID="$APP_ID" -e EMAIL="$QA_EMAIL" -e PASSWORD="$QA_PASSWORD" -e DEEP_LINK="$DL" \
    "$@" "$DIR/flows/$f"
}

set_width() {
  case "$1" in
    360) adb -s "$SERIAL" shell wm size 1080x2400 >/dev/null 2>&1
         adb -s "$SERIAL" shell wm density 480 >/dev/null 2>&1 ;;
    411) adb -s "$SERIAL" shell wm size 1080x2400 >/dev/null 2>&1
         adb -s "$SERIAL" shell wm density 420 >/dev/null 2>&1 ;;
    800) adb -s "$SERIAL" shell wm size 1600x2560 >/dev/null 2>&1
         adb -s "$SERIAL" shell wm density 320 >/dev/null 2>&1 ;;
  esac
}

# width mode lang — the order is every mode of a width together, so a width is
# either complete or plainly absent.
COMBOS="360 light en
360 dark en
360 light fr
360 dark fr
411 light en
411 dark en
800 light en
800 dark en"

echo "$COMBOS" | while read -r width mode lang; do
  [ -z "$width" ] && continue
  SHOT="$width-$mode-$lang"
  [ -n "$ONLY" ] && [ "$ONLY" != "$SHOT" ] && [ "$ONLY" != "$width-$mode" ] && continue

  echo
  echo "== $SHOT =================================================="
  set_width "$width"
  if [ "$mode" = dark ]; then
    adb -s "$SERIAL" shell cmd uimode night yes >/dev/null 2>&1
  else
    adb -s "$SERIAL" shell cmd uimode night no >/dev/null 2>&1
  fi

  # THE APP IS KILLED AFTER THE LAST CONFIG CHANGE, NOT BEFORE. Measured
  # 2026-09-19, and it nearly shipped nine wrong pictures as evidence: the
  # force-stop used to sit inside `set_width`, ahead of the night-mode change,
  # and the 360 dark pass produced a screen laid out at the OLD density inside
  # the NEW window — text cut off mid-word, the header missing its fourth icon.
  # It reads exactly like a real 360 dp overflow. A clean relaunch at the same
  # density renders perfectly, so it was the pass lying, not the app.
  adb -s "$SERIAL" shell am force-stop "$APP_ID" >/dev/null 2>&1
  adb -s "$SERIAL" shell am force-stop host.exp.exponent >/dev/null 2>&1
  sleep 4

  # Language is app state, not device state, so it is set through the app.
  if [ "$lang" = fr ]; then
    run_flow set-language.yaml -e LANG_ID="language-fr" >/dev/null 2>&1 \
      || { echo "  could not switch to French — combination SKIPPED, not shot"; continue; }
  fi

  # PIPESTATUS, not $?. After a pipe `$?` is `tail`'s status, which is always 0
  # — so every combination would report complete, including the ones that were
  # not. That is the exact shape of lie this pass exists to avoid.
  run_flow 99-screens.yaml -e SHOT="$SHOT" 2>&1 | tail -4
  rc=${PIPESTATUS[0]}
  "$DIR/evidence.sh" >/dev/null 2>&1
  [ "$rc" = 0 ] && echo "  $SHOT complete" || echo "  $SHOT INCOMPLETE — see the register"

  # Back to English immediately, so a failure here never leaves the account
  # French for whatever runs next.
  if [ "$lang" = fr ]; then
    run_flow set-language.yaml -e LANG_ID="language-en" >/dev/null 2>&1 || true
  fi
done

echo
echo "resetting the device — an Override left behind is a device nobody can trust"
reset_device
adb -s "$SERIAL" shell wm size | tr -d '\r'
adb -s "$SERIAL" shell wm density | tr -d '\r'
