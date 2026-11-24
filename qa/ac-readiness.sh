#!/bin/bash
# ASSISTANT + CHATS READINESS ON A DEVICE (docs/RELEASE_READINESS.md).
#
#   qa/ac-readiness.sh smoke     FIRST: open the bundle, sign in, shoot Home;
#                                look at the shot before running anything else
#   qa/ac-readiness.sh run       61 offline, 62 mic refused, 63 2×tap, 64 kill,
#                                65 memory state, 66 ask from a thread, 67 keyboard
#   qa/ac-readiness.sh shots     60 and 68 at 360, 411, 800, 411 dark, 411 at 200 %
#
# THE QA ACCOUNT ON :3001 (Hello, 2026-11-21), never the owner's: the account
# comes from the main checkout's gitignored .env, read here and never printed.
# Writes are the QA account's own assistant conversations (63, 64), each
# renamed and deleted by its title in the same flow. Chats sends NOTHING: a
# send reaches another person. Exit 3 is NOT MEASURED.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ENV_FILE:-$HOME/Apps/Personal/multi_magic_mobile/.env}"
[ -f "$ENV_FILE" ] || { echo "NOT MEASURED: no $ENV_FILE"; exit 3; }
set -a; . "$ENV_FILE"; set +a
[ -n "${QA_EMAIL:-}" ] && [ -n "${QA_PASSWORD:-}" ] || { echo "NOT MEASURED: QA_EMAIL/QA_PASSWORD missing from $ENV_FILE"; exit 3; }
export PATH="$HOME/.maestro/bin:${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools:$PATH"
SERIAL="${SERIAL:?set SERIAL to the claimed device}"
APP_ID="${APP_ID:-com.multimagics.mobile}"
METRO_PORT_AC="${METRO_PORT_AC:-3031}"
DEEP_LINK_AC="multimagic://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A${METRO_PORT_AC}"
OUT="$DIR/evidence/ac-readiness-$(date +%Y%m%d-%H%M)"; mkdir -p "$OUT"

prime() { # the bundle running before any flow (2026-11-21: the launcher trap)
  adb -s "$SERIAL" logcat -c
  adb -s "$SERIAL" shell am start -a android.intent.action.VIEW -d "$DEEP_LINK_AC" "$APP_ID" >/dev/null
  local i
  for i in $(seq 1 90); do
    if adb -s "$SERIAL" logcat -d | grep -q 'Running "main"'; then
      echo "prime: bundle running"
      sleep 3; adb -s "$SERIAL" shell input swipe 955 265 40 1250 900; adb -s "$SERIAL" shell input swipe 110 2226 40 1250 900  # mid-left: bottom-left covered the Pages Home tab (2026-11-24)   # the dev gear off the avatar
      return 0
    fi
    sleep 2
  done
  echo "NOT MEASURED: the dev client never ran the bundle"; exit 3
}

flow() { # flow <file> [KEY=VALUE]
  local f=$1 n; n=$(basename "$f" .yaml)${2:+-${2#*=}}
  MAESTRO_QA_EMAIL="$QA_EMAIL" MAESTRO_QA_PASSWORD="$QA_PASSWORD" \
    maestro --device "$SERIAL" test -e APP_ID="$APP_ID" -e DEEP_LINK="$DEEP_LINK_AC" ${2:+-e "$2"} --test-output-dir "$OUT/$n" "$f" > "$OUT/$n.log" 2>&1
  echo "$n: $([ $? = 0 ] && echo PASS || echo FAIL)" | tee -a "$OUT/verdicts.txt"
}

restore() { # whatever a column changed, put back
  adb -s "$SERIAL" shell svc wifi enable; adb -s "$SERIAL" shell svc data enable
  adb -s "$SERIAL" shell pm grant "$APP_ID" android.permission.RECORD_AUDIO 2>/dev/null
  adb -s "$SERIAL" shell cmd uimode night no >/dev/null; adb -s "$SERIAL" shell settings put system font_scale 1.0
  adb -s "$SERIAL" shell wm size reset; adb -s "$SERIAL" shell wm density reset
}
trap restore EXIT

run() {
  prime
  adb -s "$SERIAL" shell svc wifi disable; adb -s "$SERIAL" shell svc data disable
  flow "$DIR/flows/61-assistant-offline-says-so.yaml"
  adb -s "$SERIAL" shell svc wifi enable; adb -s "$SERIAL" shell svc data enable
  adb -s "$SERIAL" shell pm revoke "$APP_ID" android.permission.RECORD_AUDIO
  flow "$DIR/flows/62-assistant-mic-refused.yaml"
  adb -s "$SERIAL" shell pm grant "$APP_ID" android.permission.RECORD_AUDIO
  flow "$DIR/flows/63-assistant-double-tap-sends-once.yaml"
  flow "$DIR/flows/64-assistant-kill-mid-answer.yaml"
  flow "$DIR/flows/65-assistant-memory-review-state.yaml"
  flow "$DIR/flows/66-chats-ask-the-assistant-from-a-thread.yaml"
  flow "$DIR/flows/67-chats-keyboard-draft-not-sent.yaml"
  echo "verdicts: $OUT/verdicts.txt"
}

shot() { # shot <label> <px> <density>
  adb -s "$SERIAL" shell wm size "$2"; adb -s "$SERIAL" shell wm density "$3"
  adb -s "$SERIAL" shell am force-stop "$APP_ID"   # RN caches the window size at startup
  flow "$DIR/flows/60-assistant-shots.yaml" "SHOT=$1"; flow "$DIR/flows/68-chats-shots.yaml" "SHOT=$1"
}

shots() {
  prime
  shot 360 1080x2280 480; shot 411 1080x2400 420; shot 800 1600x2560 320
  adb -s "$SERIAL" shell cmd uimode night yes; shot 411-dark 1080x2400 420; adb -s "$SERIAL" shell cmd uimode night no
  adb -s "$SERIAL" shell settings put system font_scale 2.0; shot 411-font200 1080x2400 420
}

case "${1:-}" in
  smoke) prime; flow "$DIR/flows/00-smoke-signed-in.yaml"; echo "LOOK: $OUT/00-smoke-signed-in before the batch";;
  run) run;; shots) shots;;
  *) sed -n 2,13p "$0"; exit 2;;
esac
