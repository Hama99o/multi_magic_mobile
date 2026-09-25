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
  # EXIT 3, NOT 1. A blocked preflight means NOT MEASURED, which is a different
  # fact from a failed test: no emulator, no Metro or no backend has found no
  # bug — it has found nothing. Collapsing the two is how a green gets invented
  # and a red gets misread, and the caller sees this code before anything else.
  "$DIR/preflight.sh" || { echo "Aborting: preflight failed — NOT MEASURED, not failed."; exit 3; }
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
# ── THE PASSWORD DOES NOT GO ON THE COMMAND LINE ───────────────────────────
# `-e PASSWORD=...` puts the QA account's password in the process table, where
# any `ps` on this box reads it, and into any shell history or CI log that
# captures the invocation. Maestro resolves `${VAR}` from the ENVIRONMENT as
# well as from `-e` — BUT ONLY FOR NAMES PREFIXED `MAESTRO_`.
#
# The 2026-09-21 measurement was real and was also narrower than the change
# built on it: its probe was `MAESTRO_PROBE_VALUE`, prefixed, and the rig then
# exported bare `EMAIL`/`PASSWORD`. From `71c2e16` until 2026-09-24 every
# sign-in from a signed-out app typed the literal `undefined` into both fields
# ("That email and password do not match."), which nothing noticed because
# runs that started signed in skip the typing. Re-measured 2026-09-24, Maestro
# 2.7.0, with a negative control: exported `MAESTRO_PROBE_PFX=yes` → assert
# COMPLETED; exported `PROBE_BARE=yes` → the same assert FAILED.
#
# The address and the app id stay as `-e`: they are not secrets, and keeping
# them visible makes a wrong APP_ID obvious in `ps` when a run misbehaves.
export MAESTRO_QA_EMAIL="$QA_EMAIL"
export MAESTRO_QA_PASSWORD="$QA_PASSWORD"
ARGS=(-e APP_ID="$APP_ID" -e DEEP_LINK="$DEEP_LINK")
# `faults`-tagged flows need qa/fault_proxy.py in front of the backend and a
# Metro baked to it; only `qa/faults.sh` provides both. Run here, they fail.
EXCLUDE=(--exclude-tags faults)
if [ -n "$TAG" ]; then
  maestro --device "$SERIAL" test --include-tags "$TAG" "${EXCLUDE[@]}" "${ARGS[@]}" "$DIR/flows"
else
  maestro --device "$SERIAL" test "${EXCLUDE[@]}" "${ARGS[@]}" "$DIR/flows"
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
# The screenshots are NOT in $DIR/reports — this line said they were, for as
# long as the file has existed, and nothing has ever written a .png there.
# Maestro keeps them under ~/.maestro/tests/<timestamp>/<flow>/, which is
# outside the repo entirely. `evidence.sh` is what brings them in, to both the
# run's own record and the `ours/` folder each screen's DONE is measured by.
echo
"$DIR/evidence.sh" || echo "evidence.sh did not file anything — the pictures are still under ~/.maestro/tests/"
# Which side of every `runFlow: when:` ran. A PASS on an empty branch and a
# PASS on a populated one exit the same; this is the line that tells them
# apart (`qa/FLOW_REGISTER.md`, "What run 9 would need", item 5).
echo
python3 "$DIR/branches.py" || true
exit $rc
