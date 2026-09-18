#!/usr/bin/env bash
# THE one entry point. Same shape as hatiwal-mobile, karwan-mobile and edu-safi,
# so anybody who knows one of those knows this.
#
#   ./qa/qa.sh doctor     preflight only — is this box able to measure anything?
#   ./qa/qa.sh up         boot our AVD and Metro
#   ./qa/qa.sh down       release the device and stop Metro
#   ./qa/qa.sh flow NAME  one flow by name
#   ./qa/qa.sh all        doctor, then every flow
#   ./qa/qa.sh smoke      doctor, then the smoke-tagged flows
#
# EXIT CODES ARE PART OF THE CONTRACT:
#   0  measured, everything passed
#   1  measured, something failed        <- a real finding
#   3  NOT MEASURED (preflight blocked)  <- not a finding at all
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/qa.config.sh"
export PATH="$HOME/.maestro/bin:$ANDROID_HOME/platform-tools:$PATH"

require_rig() { "$DIR/preflight.sh"; }

case "${1:-all}" in
  doctor) require_rig; exit $?;;
  up)
    pgrep -af qemu-system 2>/dev/null | grep -q -- "-avd $AVD" \
      || nohup "${ANDROID_HOME:-$HOME/Android/Sdk}/emulator/emulator" -avd "$AVD" \
           -port "$EMULATOR_PORT" -no-snapshot-save -no-boot-anim \
           -gpu swiftshader_indirect -no-audio -memory 2048 >/dev/null 2>&1 &
    adb -s "$SERIAL" wait-for-device
    curl -s --max-time 2 "http://localhost:$METRO_PORT/status" | grep -q packager \
      || ( cd "$DIR/.." && nohup npx expo start --port "$METRO_PORT" >/dev/null 2>&1 & )
    echo "up: $AVD on $SERIAL, Metro :$METRO_PORT";;
  down)
    adb -s "$SERIAL" emu kill >/dev/null 2>&1
    pgrep -f "expo start --port $METRO_PORT" | while read -r p; do kill "$p" 2>/dev/null; done
    echo "down: $AVD released, Metro stopped";;
  flow)
    require_rig || exit 3
    maestro --device "$SERIAL" test \
      -e APP_ID="$APP_ID" -e EMAIL="$QA_EMAIL" -e PASSWORD="$QA_PASSWORD" -e DEEP_LINK="$DEEP_LINK" \
      "$DIR/flows/${2:?name a flow}";;
  smoke) SKIP_PREFLIGHT=0 "$DIR/run.sh" smoke;;
  all)   SKIP_PREFLIGHT=0 "$DIR/run.sh";;
  *) sed -n '2,20p' "$0"; exit 2;;
esac
