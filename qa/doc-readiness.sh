#!/bin/bash
# DOC READINESS ON A DEVICE (docs/RELEASE_READINESS.md, the Doc row).
#
#   qa/doc-readiness.sh smoke     FIRST: open the bundle, sign in, shoot Home;
#                                 look at the shot before running anything else
#   qa/doc-readiness.sh device    push qa-doc.pdf to Download, fps overlay off
#   qa/doc-readiness.sh run       flow 48 (keyboard), then flow 49's shots at
#                                 360, 411, 800, 411 dark, 411 at 200 % font
#   qa/doc-readiness.sh busy      flow 50, right after multi-magic-83 confirms
#                                 it holds the Doc slot ("hold slot")
#
# The :3020 sandbox only (Doc tools write files there), as pages-parity.sh:
# API_LOCAL must say 3020; the password comes from QA_PASSWORD in the
# environment, never argv. Exit 3 is NOT MEASURED.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/qa.config.sh"
export PATH="$HOME/.maestro/bin:${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools:$PATH"
API_LOCAL="${API_LOCAL:-http://localhost:3020}"
case "$API_LOCAL" in *:3020*) ;; *) echo "REFUSED: API_LOCAL must be the :3020 sandbox, not $API_LOCAL"; exit 2;; esac
QA_EMAIL="${QA_EMAIL:-demo@example.com}"
SERIAL="${SERIAL:?set SERIAL to the claimed device}"
APP_ID="${APP_ID:-com.multimagics.mobile}"
METRO_PORT_DOC="${METRO_PORT_DOC:-3031}"
DEEP_LINK_DOC="multimagic://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A${METRO_PORT_DOC}"
OUT="$DIR/evidence/doc-readiness-$(date +%Y%m%d-%H%M)"; mkdir -p "$OUT"
[ -n "${QA_PASSWORD:-}" ] || { echo "QA_PASSWORD is not set (environment only)"; exit 3; }

fps_off() {
  local prefs="shared_prefs/${APP_ID}_preferences.xml"
  adb -s "$SERIAL" shell am force-stop "$APP_ID"
  echo "fps_debug before: $(adb -s "$SERIAL" shell run-as "$APP_ID" grep -o 'fps_debug" value="[a-z]*' "$prefs" 2>/dev/null || echo absent)"
  adb -s "$SERIAL" shell run-as "$APP_ID" sed -i 's/name="fps_debug" value="true"/name="fps_debug" value="false"/' "$prefs" 2>/dev/null
  echo "fps_debug after: $(adb -s "$SERIAL" shell run-as "$APP_ID" grep -o 'fps_debug" value="[a-z]*' "$prefs" 2>/dev/null || echo absent)"
}

device() { # a one-page PDF with one real text line, written by hand (no library)
  local f; f=$(mktemp --suffix=.pdf)
  python3 - "$f" <<'PY'
import sys
objs=[b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
 b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
 None, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
text=b"BT /F1 24 Tf 72 760 Td (Trip to Lyon) Tj ET"
objs[3]=b"<< /Length %d >>\nstream\n" % len(text) + text + b"\nendstream"
out=b"%PDF-1.4\n"; offs=[]
for i,o in enumerate(objs,1):
    offs.append(len(out)); out+=b"%d 0 obj\n" % i + o + b"\nendobj\n"
x=len(out); out+=b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs)+1)
for o in offs: out+=b"%010d 00000 n \n" % o
out+=b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs)+1, x)
open(sys.argv[1],"wb").write(out)
PY
  adb -s "$SERIAL" push "$f" /sdcard/Download/qa-doc.pdf >/dev/null && rm -f "$f"
  adb -s "$SERIAL" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/qa-doc.pdf >/dev/null 2>&1
  echo "device: qa-doc.pdf in Download"; fps_off
}

# OPEN THE BUNDLE BEFORE ANY FLOW (measured 2026-11-21, slot 2 rerun): on a
# device whose dev client last showed its launcher, Maestro's openLink did not
# load the bundle and every flow stopped on "Development servers" for 50 min.
# `am start` with the package does load it. So: open it, wait for the JS to
# run, and stop here as NOT MEASURED (exit 3) if it never does.
prime() {
  adb -s "$SERIAL" logcat -c
  adb -s "$SERIAL" shell am start -a android.intent.action.VIEW -d "$1" "$APP_ID" >/dev/null
  local i
  for i in $(seq 1 90); do
    if adb -s "$SERIAL" logcat -d | grep -q 'Running "main"'; then
      echo "prime: bundle running"
      # The dev client's floating gear sits ON the app's avatar (header-profile),
      # and a tap there opens the dev menu instead (multi-magic-mobile-ff,
      # measured on qa_phone 2026-11-21). Drag it to the bottom-left once.
      sleep 3; adb -s "$SERIAL" shell input swipe 955 265 60 2150 900
      return 0
    fi
    sleep 2
  done
  echo "NOT MEASURED: the dev client never ran the bundle from $1"; exit 3
}

flow() { # flow <file> [KEY=VALUE]
  local f=$1 n; n=$(basename "$f" .yaml)${2:+-${2#*=}}
  MAESTRO_QA_EMAIL="$QA_EMAIL" MAESTRO_QA_PASSWORD="$QA_PASSWORD" \
    maestro --device "$SERIAL" test -e APP_ID="$APP_ID" -e DEEP_LINK="$DEEP_LINK_DOC" ${2:+-e "$2"} --test-output-dir "$OUT/$n" "$f" > "$OUT/$n.log" 2>&1
  echo "$n: $([ $? = 0 ] && echo PASS || echo FAIL)" | tee -a "$OUT/verdicts.txt"
}

shots() { # shots <label> <px> <density> : relaunch, then flow 49
  adb -s "$SERIAL" shell wm size "$2"; adb -s "$SERIAL" shell wm density "$3"
  adb -s "$SERIAL" shell am force-stop "$APP_ID"   # RN caches the window size at startup
  flow "$DIR/flows/49-doc-shots.yaml" "SHOT=$1"
}

run() {
  prime "$DEEP_LINK_DOC"
  flow "$DIR/flows/48-doc-text-edit-sheet-over-keyboard.yaml"
  shots 360 1080x2280 480; shots 411 1080x2400 420; shots 800 1600x2560 320
  adb -s "$SERIAL" shell cmd uimode night yes; shots 411-dark 1080x2400 420; adb -s "$SERIAL" shell cmd uimode night no
  adb -s "$SERIAL" shell settings put system font_scale 2.0; shots 411-font200 1080x2400 420; adb -s "$SERIAL" shell settings put system font_scale 1.0
  adb -s "$SERIAL" shell wm size reset; adb -s "$SERIAL" shell wm density reset; adb -s "$SERIAL" shell am force-stop "$APP_ID"
  echo "verdicts: $OUT/verdicts.txt"
}

case "${1:-}" in smoke) prime "$DEEP_LINK_DOC"; flow "$DIR/flows/00-smoke-signed-in.yaml"; echo "LOOK: $OUT/00-smoke-signed-in before the batch";; device) device;; run) run;; busy) prime "$DEEP_LINK_DOC"; flow "$DIR/flows/50-doc-busy-countdown-then-retry.yaml";; *) sed -n 2,10p "$0"; exit 2;; esac
