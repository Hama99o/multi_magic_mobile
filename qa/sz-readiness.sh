#!/bin/bash
# SAFEZONE READINESS ON A DEVICE (docs/RELEASE_READINESS.md).
#
#   qa/sz-readiness.sh run      70 wrong/right PIN, 71 kill relocks, 72 offline,
#                               73 form keyboard, 74 double-tap Save (DB count)
#   qa/sz-readiness.sh layout   75 at 411, 360, 800, 411 dark, 411 at 200 %
#
# THE QA ACCOUNT ON THE :3030 LOCAL STACK ONLY (Hello, 2026-11-24), never the
# owner's: a made-up PIN set on that copy. Credentials and the PIN come from a
# gitignored 600 file read by name (ENV_FILE); the PIN reaches Maestro only as
# MAESTRO_SZ_* environment digits, never argv, never printed. The WRONG PIN is
# the right one with its last digit changed (one attempt of five; a right PIN
# resets the count). FLAG_SECURE blacks out every SafeZone screenshot on
# Android by design, so the cells here are asserted by the view tree.
# Exit 3 is NOT MEASURED.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ENV_FILE:?set ENV_FILE to the gitignored QA file}"
[ -f "$ENV_FILE" ] || { echo "NOT MEASURED: no $ENV_FILE"; exit 3; }
set -a; . "$ENV_FILE"; set +a
[ -n "${QA_EMAIL:-}" ] && [ -n "${QA_PASSWORD:-}" ] && [ -n "${QA_SAFEZONE_PIN:-}" ] || { echo "NOT MEASURED: QA_EMAIL/QA_PASSWORD/QA_SAFEZONE_PIN missing"; exit 3; }
case "$QA_SAFEZONE_PIN" in [0-9][0-9][0-9][0-9][0-9][0-9]) ;; *) echo "NOT MEASURED: QA_SAFEZONE_PIN is not six digits"; exit 3;; esac
[ "${QA_API_PORT:-}" = 3030 ] || { echo "REFUSED: SafeZone readiness runs against the :3030 copy only"; exit 3; }
export PATH="$HOME/.maestro/bin:${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools:$PATH"
SERIAL="${SERIAL:?set SERIAL to the claimed device}"
APP_ID="${APP_ID:-com.multimagics.mobile}"
METRO_PORT_SZ="${METRO_PORT_SZ:-3031}"
DEEP_LINK_SZ="multimagic://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A${METRO_PORT_SZ}"
CONTAINER="${CONTAINER:-mm-ee-live}"
OUT="$DIR/evidence/sz-readiness-$(date +%Y%m%d-%H%M)"; mkdir -p "$OUT"

for i in 1 2 3 4 5 6; do export "MAESTRO_SZ_P$i=${QA_SAFEZONE_PIN:$((i-1)):1}"; done
for i in 1 2 3 4 5; do export "MAESTRO_SZ_W$i=${QA_SAFEZONE_PIN:$((i-1)):1}"; done
export "MAESTRO_SZ_W6=$(( (${QA_SAFEZONE_PIN:5:1} + 1) % 10 ))"

prime() { # cold start, the bundle running, the dev gear parked mid-left
  adb -s "$SERIAL" shell am force-stop "$APP_ID"
  adb -s "$SERIAL" logcat -c
  adb -s "$SERIAL" shell am start -a android.intent.action.VIEW -d "$DEEP_LINK_SZ" "$APP_ID" >/dev/null
  local i
  for i in $(seq 1 90); do
    if adb -s "$SERIAL" logcat -d | grep -q 'Running "main"'; then
      sleep 3; adb -s "$SERIAL" shell input swipe 955 265 40 1250 900; adb -s "$SERIAL" shell input swipe 110 2226 40 1250 900
      return 0
    fi
    sleep 2
  done
  echo "NOT MEASURED: the dev client never ran the bundle"; exit 3
}

flow() { # flow <file> [KEY=VALUE]
  local f=$1 n; n=$(basename "$f" .yaml)${2:+-${2#*=}}
  MAESTRO_QA_EMAIL="$QA_EMAIL" MAESTRO_QA_PASSWORD="$QA_PASSWORD" \
    maestro --device "$SERIAL" test -e APP_ID="$APP_ID" -e DEEP_LINK="$DEEP_LINK_SZ" ${2:+-e "$2"} --test-output-dir "$OUT/$n" "$f" > "$OUT/$n.log" 2>&1
  echo "$n: $([ $? = 0 ] && echo PASS || echo FAIL)" | tee -a "$OUT/verdicts.txt"
}

# The QA account's SafeZone password ids on the :3030 copy (read-only).
pw_ids() {
  docker exec "$CONTAINER" bash -c 'cd /app && printf "%s\n" "\$stdout.puts ActiveRecord::Base.connection.select_values(\"SELECT id FROM safezone_app_passwords WHERE owner_id = 1 ORDER BY id\").join(\" \")" > /tmp/szids.rb && bin/rails runner /tmp/szids.rb 2>/dev/null | tail -1'
}

restore() {
  adb -s "$SERIAL" shell svc wifi enable; adb -s "$SERIAL" shell svc data enable
  adb -s "$SERIAL" shell pm grant "$APP_ID" android.permission.CAMERA 2>/dev/null
  adb -s "$SERIAL" shell pm grant "$APP_ID" android.permission.RECORD_AUDIO 2>/dev/null
  adb -s "$SERIAL" shell cmd uimode night no >/dev/null; adb -s "$SERIAL" shell settings put system font_scale 1.0
  adb -s "$SERIAL" shell wm size reset; adb -s "$SERIAL" shell wm density reset
}
trap restore EXIT

run() {
  prime
  flow "$DIR/flows/70-safezone-unlock-wrong-then-right.yaml"
  flow "$DIR/flows/71-safezone-kill-relocks.yaml"
  flow "$DIR/flows/sz-open.yaml"   # online: signed in, on the lock screen
  adb -s "$SERIAL" shell svc wifi disable; adb -s "$SERIAL" shell svc data disable
  flow "$DIR/flows/72-safezone-offline-unlock-says-so.yaml"
  adb -s "$SERIAL" shell svc wifi enable; adb -s "$SERIAL" shell svc data enable
  flow "$DIR/flows/73-safezone-form-keyboard.yaml"
  local before after new
  before=$(pw_ids)
  flow "$DIR/flows/74-safezone-double-tap-saves-once.yaml"
  after=$(pw_ids)
  new=$(comm -13 <(tr ' ' '\n' <<<"$before" | sort) <(tr ' ' '\n' <<<"$after" | sort) | grep -c .)
  echo "74 double-tap: $new new password row(s) on :3030 (expect 1)" | tee -a "$OUT/verdicts.txt"
  for id in $(comm -13 <(tr ' ' '\n' <<<"$before" | sort) <(tr ' ' '\n' <<<"$after" | sort)); do
    docker exec "$CONTAINER" bash -c "cd /app && printf '%s\n' 'SafezoneApp::Password.find($id).destroy; \$stdout.puts \"cleaned $id\"' > /tmp/szdel.rb && bin/rails runner /tmp/szdel.rb 2>/dev/null | tail -1" | tee -a "$OUT/verdicts.txt"
  done
  echo "verdicts: $OUT/verdicts.txt"
}

layout_at() { # layout_at <name> <size> <density>
  adb -s "$SERIAL" shell wm size "$2"; adb -s "$SERIAL" shell wm density "$3"
  adb -s "$SERIAL" shell am force-stop "$APP_ID"   # RN reads the window size at startup
  flow "$DIR/flows/75-safezone-layout-by-hierarchy.yaml" "SHOT=$1"
}

layout() {
  prime
  layout_at 411 1080x2400 420; layout_at 360 1080x2280 480; layout_at 800 1600x2560 320
  adb -s "$SERIAL" shell cmd uimode night yes; layout_at 411-dark 1080x2400 420; adb -s "$SERIAL" shell cmd uimode night no
  adb -s "$SERIAL" shell settings put system font_scale 2.0; layout_at 411-font200 1080x2400 420
}

case "${1:-}" in
  run) run;; layout) layout;;
  # The cross-app readiness cells written 2026-11-25: 76 RTL content, 77 camera
  # and mic refused, 78 a draft across a force-stop, 79 Chats offline.
  extra) prime; flow "$DIR/flows/76-rtl-content-assistant-chats-safezone.yaml"; flow "$DIR/flows/77-perm-camera-and-mic-refused.yaml"
    adb -s "$SERIAL" shell pm grant "$APP_ID" android.permission.CAMERA; adb -s "$SERIAL" shell pm grant "$APP_ID" android.permission.RECORD_AUDIO
    flow "$DIR/flows/78-kill-keeps-the-draft.yaml"
    flow "$DIR/flows/login.yaml"; adb -s "$SERIAL" shell svc wifi disable; adb -s "$SERIAL" shell svc data disable
    flow "$DIR/flows/79-chats-offline-says-so.yaml"; adb -s "$SERIAL" shell svc wifi enable; adb -s "$SERIAL" shell svc data enable;;
  permkill) prime; flow "$DIR/flows/77-perm-camera-and-mic-refused.yaml"
    adb -s "$SERIAL" shell pm grant "$APP_ID" android.permission.CAMERA; adb -s "$SERIAL" shell pm grant "$APP_ID" android.permission.RECORD_AUDIO
    flow "$DIR/flows/78-kill-keeps-the-draft.yaml";;
  rtlperm) prime; flow "$DIR/flows/76-rtl-content-assistant-chats-safezone.yaml"; flow "$DIR/flows/77-perm-camera-and-mic-refused.yaml";;
  only) prime; shift; for n in "$@"; do flow "$(ls "$DIR"/flows/${n}-safezone-*.yaml | head -1)"; done;;
  dtap) prime; b=$(pw_ids); flow "$DIR/flows/74-safezone-double-tap-saves-once.yaml"; a=$(pw_ids)
    new=$(comm -13 <(tr ' ' '\n' <<<"$b" | sort) <(tr ' ' '\n' <<<"$a" | sort)); echo "74 double-tap: $(grep -c . <<<"$new") new password row(s) on :3030 (expect 1)" | tee -a "$OUT/verdicts.txt"
    for id in $new; do docker exec "$CONTAINER" bash -c "cd /app && printf '%s\n' 'SafezoneApp::Password.find($id).destroy; \$stdout.puts \"cleaned $id\"' > /tmp/szdel.rb && bin/rails runner /tmp/szdel.rb 2>/dev/null | tail -1" | tee -a "$OUT/verdicts.txt"; done;;
  *) sed -n 2,14p "$0"; exit 2;;
esac
