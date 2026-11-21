#!/bin/bash
# PAGES PARITY (M1–M10), ON A DEVICE, IN ONE GO. (Doc busy: mm-doc qa/doc-busy.sh.)
#
#   qa/pages-parity.sh seed       fixtures on the API (demo account, :3020 by default)
#   qa/pages-parity.sh device     push the test folder and files onto the device
#   qa/pages-parity.sh run        every flow below, in order, with the kill tests
#   qa/pages-parity.sh widths     the screenshots at 360, 411 and 800 dp
#   qa/pages-parity.sh clean      delete what seed and the flows made
#   qa/pages-parity.sh all        seed, device, run, widths, clean
#
# WHICH BACKEND. This drives multi-magic-83's sandbox stack on :3020 (its own
# database, the demo accounts) and NEVER the owner's real MultiMagic: the
# seed WRITES. `API_LOCAL` must say 3020, or the script refuses.
#
# What Maestro cannot do is done here, between flows:
# - list the app's own Documents/pages-uploads before and after each kill
#   (`run-as`, a debug build only), which is the proof that a kill leaves no
#   orphan copy (Hello, 2026-11-21);
# - the widths: `wm size`/`wm density`, then force-stop and relaunch, because
#   React Native caches window dimensions at startup (QA_HANDBOOK).
#
# Exit 3 is NOT MEASURED (no device, no backend), never a pass or a fail.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/qa.config.sh"
export PATH="$HOME/.maestro/bin:${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools:$PATH"

API_LOCAL="${API_LOCAL:-http://localhost:3020}"
case "$API_LOCAL" in *:3020*) ;; *) echo "REFUSED: seed writes; API_LOCAL must be the :3020 sandbox, not $API_LOCAL"; exit 2;; esac
QA_EMAIL="${QA_EMAIL:-demo@example.com}"
SERIAL="${SERIAL:?set SERIAL to the claimed device, e.g. emulator-5580}"
APP_ID="${APP_ID:-com.multimagics.mobile}"
OUT="$DIR/reports/pages-parity-$(date +%Y%m%d-%H%M)"
STATE="$DIR/reports/.pages-parity.state"   # space/note ids for clean (gitignored reports/)
SPACE_TITLE="QA Parity"
mkdir -p "$OUT"

need_pw() { [ -n "${QA_PASSWORD:-}" ] || { echo "QA_PASSWORD is not set (read from the gitignored .env, never typed into argv)"; exit 3; }; }
token() {
  need_pw
  curl -s -D - -o /dev/null --max-time 20 -H 'Content-Type: application/json' \
    --data-binary @<(printf '{"user":{"email":"%s","password":"%s"}}' "$QA_EMAIL" "$QA_PASSWORD") \
    "$API_LOCAL/users/login" | awk -F': ' 'tolower($1)=="authorization"{print $2}' | tr -d '\r'
}
api() { local m=$1 p=$2; shift 2; curl -s --max-time 60 -X "$m" -H "Authorization: $TOK" "$@" "$API_LOCAL/api/v1$p"; }
jget() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)"; }
# The app's own copies (uploads.store.ts adopt → Documents/pages-uploads/<id>/).
list_copies() { adb -s "$SERIAL" shell run-as "$APP_ID" sh -c "'cd files 2>/dev/null && find . -path \"*pages-uploads*\" -type f -exec ls -l {} \\;'" 2>&1; }

seed() {
  TOK=$(token); [ -n "$TOK" ] || { echo "NOT MEASURED: login failed on $API_LOCAL"; exit 3; }
  local fx; fx=$(mktemp -d)
  printf 'line one\nline two\n' > "$fx/a-notes.txt"
  printf 'Place,Cost\nLyon,40.5\nPorto,120\n' > "$fx/b-sheet.csv"
  printf '# Read me\n\nA *Markdown* file.\n' > "$fx/d-readme.md"
  python3 - "$fx/c-budget.xlsx" <<'EOF'
import sys, datetime, openpyxl
wb=openpyxl.Workbook(); ws=wb.active; ws.title="Trips"
ws.append(["Place","Cost","When"]); ws.append(["Lyon",40.5,datetime.date(2026,11,21)]); ws.append(["Porto",120,datetime.date(2026,12,2)])
w2=wb.create_sheet("Notes"); w2.append(["Note"]); w2.append(["Bring a charger"])
wb.save(sys.argv[1])
EOF
  local sid trip
  sid=$(api POST /page_app/spaces -H 'Content-Type: application/json' -d "{\"space\":{\"title\":\"$SPACE_TITLE\"}}" | jget "d['space']['id']")
  trip=$(api POST /page_app/spaces/$sid/nodes -H 'Content-Type: application/json' -d '{"node":{"kind":"folder","title":"Trip"}}' | jget "d['node']['id']")
  api POST /page_app/spaces/$sid/nodes -H 'Content-Type: application/json' -d "{\"node\":{\"kind\":\"folder\",\"title\":\"Day 1\",\"parent_id\":$trip}}" >/dev/null
  local f txt
  for f in a-notes.txt b-sheet.csv c-budget.xlsx d-readme.md; do
    id=$(api POST /page_app/spaces/$sid/nodes -F "node[title]=$f" -F "node[kind]=file" -F "node[parent_id]=$trip" -F "node[attachment]=@$fx/$f" | jget "d['node']['id']")
    [ "$f" = a-notes.txt ] && txt=$id
  done
  # One earlier version of a-notes.txt (parity #39): replacing keeps the old one.
  printf 'line one, edited\n' > "$fx/a-notes.txt"
  api PATCH /page_app/spaces/$sid/nodes/$txt -F "node[attachment]=@$fx/a-notes.txt;type=text/plain" >/dev/null
  api POST /page_app/spaces/$sid/nodes -H 'Content-Type: application/json' -d "{\"node\":{\"kind\":\"page\",\"title\":\"Plan\",\"parent_id\":$trip,\"content\":{\"html\":\"<p>Hello</p>\"}}}" >/dev/null
  local note; note=$(api POST /note_app/notes -H 'Content-Type: application/json' -d '{"title":"QA linked note","description":"<p>for the link test</p>"}' | jget "d['note']['id']")
  printf 'space=%s\ntrip=%s\nnote=%s\n' "$sid" "$trip" "$note" > "$STATE"
  rm -rf "$fx"; unset TOK
  echo "seeded: space $sid ($SPACE_TITLE), folder Trip $trip, note $note"
}

device() {
  local d; d=$(mktemp -d)
  mkdir -p "$d/qa-folder/sub"; printf 'two\n' > "$d/qa-folder/two.txt"; printf 'three\n' > "$d/qa-folder/sub/three.txt"; printf 'hidden\n' > "$d/qa-folder/.hidden"
  python3 -c "open('$d/qa-folder/one.jpg','wb').write(bytes.fromhex('ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f00d2cf20ffd9'))"
  adb -s "$SERIAL" shell rm -rf /sdcard/Download/qa-folder /sdcard/Download/qa-big.bin
  adb -s "$SERIAL" push "$d/qa-folder" /sdcard/Download/ >/dev/null
  # 300 MB: long enough to copy and to send that a kill lands inside each.
  adb -s "$SERIAL" shell "dd if=/dev/zero of=/sdcard/Download/qa-big.bin bs=1048576 count=300 2>/dev/null"
  adb -s "$SERIAL" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download >/dev/null 2>&1
  rm -rf "$d"; echo "device: qa-folder (3 files + a hidden one), qa-big.bin 300 MB in Download"
}

flow() { # flow <file> : one flow, its own log, and the verdict line
  local f=$1 n; n=$(basename "$f" .yaml)
  MAESTRO_QA_EMAIL="$QA_EMAIL" MAESTRO_QA_PASSWORD="$QA_PASSWORD" \
    maestro --device "$SERIAL" test -e APP_ID="$APP_ID" -e DEEP_LINK="${DEEP_LINK:-multimagic://}" --test-output-dir "$OUT/$n" "$f" > "$OUT/$n.log" 2>&1
  local rc=$?; echo "$n: $([ $rc = 0 ] && echo PASS || echo FAIL rc=$rc)" | tee -a "$OUT/verdicts.txt"
}

run() {
  need_pw
  : > "$OUT/verdicts.txt"
  for f in 30 31 32 33 34 35 36 37 38 39; do flow "$(ls "$DIR"/flows/${f}-*.yaml)"; done
  # The kill tests: the copies listed before, between and after.
  for k in 40-pages-kill-mid-copy 41-pages-kill-mid-upload; do
    { echo "== $k before"; list_copies; } >> "$OUT/copies.txt"
    flow "$DIR/flows/$k.yaml"
    { echo "== $k after relaunch"; list_copies; } >> "$OUT/copies.txt"
  done
  echo "verdicts: $OUT/verdicts.txt  copies: $OUT/copies.txt"
}

widths() { # the same three screens at 360, 411 and 800 dp
  local w px d
  for w in 360 411 800; do
    case $w in 360) px=1080x2280; d=480;; 411) px=1080x2400; d=420;; 800) px=1600x2560; d=320;; esac
    adb -s "$SERIAL" shell wm size $px; adb -s "$SERIAL" shell wm density $d
    adb -s "$SERIAL" shell am force-stop "$APP_ID"   # RN caches the window size at startup
    MAESTRO_QA_EMAIL="$QA_EMAIL" MAESTRO_QA_PASSWORD="$QA_PASSWORD" maestro --device "$SERIAL" test -e APP_ID="$APP_ID" -e DEEP_LINK="${DEEP_LINK:-multimagic://}" -e WIDTH=$w --test-output-dir "$OUT/widths-$w" "$DIR/flows/42-pages-shots-at-width.yaml" > "$OUT/widths-$w.log" 2>&1
    echo "widths $w dp: $([ $? = 0 ] && echo PASS || echo FAIL)" | tee -a "$OUT/verdicts.txt"
  done
  adb -s "$SERIAL" shell wm size reset; adb -s "$SERIAL" shell wm density reset; adb -s "$SERIAL" shell am force-stop "$APP_ID"
}

clean() {
  [ -f "$STATE" ] || { echo "clean: nothing seeded"; return 0; }
  . "$STATE"; TOK=$(token)
  api DELETE /page_app/spaces/$space -o /dev/null -w "space $space: %{http_code}\n"
  api DELETE /note_app/notes/$note -o /dev/null -w "note $note: %{http_code}\n"
  unset TOK; rm -f "$STATE"
  adb -s "$SERIAL" shell rm -rf /sdcard/Download/qa-folder /sdcard/Download/qa-big.bin 2>/dev/null
  echo "clean: done (the uploads the flows made live in the deleted space)"
}

case "${1:-}" in
  seed) seed;; device) device;; run) run;; widths) widths;; clean) clean;;
  all) seed && device && run; widths; clean;;
  *) sed -n 2,9p "$0"; exit 2;;
esac
