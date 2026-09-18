#!/usr/bin/env bash
# Preflight, then every flow, then turn anything logcat caught into findings.
#
#   ./qa/run.sh            # all flows
#   ./qa/run.sh smoke      # only the smoke-tagged ones
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/qa.config.sh"
export PATH="$HOME/.maestro/bin:$PATH"
TAG="${1:-}"

if [ "${SKIP_PREFLIGHT:-0}" != 1 ]; then
  "$DIR/preflight.sh" || { echo "Aborting: preflight failed — that is the first finding."; exit 1; }
  echo
fi

# DO NOT `pm clear` Expo Go by default. Measured: it wipes Expo Go's OWN state,
# not just our project's, and the next deep link lands on Expo Go's
# "Something went wrong" ErrorActivity instead of the app — which then fails
# every flow with "sign-in-email is not visible", an assertion that points at
# our screen and blames the wrong thing entirely.
#
# A signed-out start is achieved in `login.yaml` instead, by signing out when a
# session is already open. Opt in with CLEAR_EXPO_GO=1 only when Expo Go itself
# needs resetting, and expect a slow first bundle after it.
if [ "${CLEAR_EXPO_GO:-0}" = 1 ]; then
  adb -s "$SERIAL" shell pm clear "$APP_ID" >/dev/null 2>&1 || true
  echo "Expo Go state cleared — the first flow will wait on a cold bundle"
fi

# Warm the bundle once so the first flow is not paying for a cold compile.
adb -s "$SERIAL" shell am start -a android.intent.action.VIEW -d "$DEEP_LINK" "$APP_ID" >/dev/null 2>&1
sleep 30

adb -s "$SERIAL" logcat -c >/dev/null 2>&1 || true
LOG="$DIR/reports/logcat-$(date +%Y%m%d-%H%M%S).txt"
mkdir -p "$DIR/reports"
adb -s "$SERIAL" logcat > "$LOG" 2>/dev/null & LOGPID=$!
trap 'kill $LOGPID >/dev/null 2>&1 || true' EXIT

echo "Running flows on $SERIAL ($AVD) against $API_URL"
set +e
ARGS=(-e APP_ID="$APP_ID" -e EMAIL="$QA_EMAIL" -e PASSWORD="$QA_PASSWORD" -e DEEP_LINK="$DEEP_LINK")
if [ -n "$TAG" ]; then
  maestro --device "$SERIAL" test --include-tags "$TAG" "${ARGS[@]}" "$DIR/flows"
else
  maestro --device "$SERIAL" test "${ARGS[@]}" "$DIR/flows"
fi
rc=$?
set -e

# Runtime errors during the run become findings. "Cannot find native module" is
# in the list because it does not crash loudly — it takes down one import chain
# and the screen simply fails to render.
# `AndroidRuntime` alone matches the `am` command's own startup lines, which are
# benign — the first run reported five "runtime errors" that were nothing but
# an intent being dispatched. Match the SEVERITY marker, not the tag.
errs=$(grep -E 'FATAL EXCEPTION|E AndroidRuntime|Cannot find native module|ReactNativeJS.*(Error|Unhandled)' "$LOG" 2>/dev/null | head -20 || true)
if [ -n "$errs" ]; then
  echo; echo "Runtime errors during the run (full log: $LOG):"; echo "$errs" | sed 's/^/  /'
fi
echo; echo "screenshots: $DIR/reports/"
exit $rc
