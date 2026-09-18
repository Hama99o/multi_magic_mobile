#!/usr/bin/env bash
# Preflight — prove the app is testable BEFORE any flow runs.
#
# Adapted from the qa-sweep skill's template, with three changes this app needs:
# the seed guard (see qa.config.sh), the two-address split, and Expo Go's deep
# link instead of a package launch.
#
# A failing preflight IS the first finding. Do not start testing around it.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/qa.config.sh"

fail=0
ok(){   echo "  ok    $1"; }
bad(){  echo "  FAIL  $1"; fail=1; }
warn(){ echo "  warn  $1"; }

echo "== MultiMagic mobile — QA preflight =="

# 1. Tooling
command -v adb >/dev/null 2>&1 && ok "adb present" || bad "adb not found"
if command -v maestro >/dev/null 2>&1; then ok "maestro $(maestro --version 2>/dev/null | head -1)"
elif [ -x "$HOME/.maestro/bin/maestro" ]; then
  export PATH="$HOME/.maestro/bin:$PATH"; ok "maestro $(maestro --version 2>/dev/null | head -1) (from ~/.maestro)"
else bad "maestro not installed"; fi

# 2. THE SEED GUARD. Fails, never warns — see qa.config.sh.
if [ -n "${QA_SEED_CMD:-}" ]; then
  bad "QA_SEED_CMD is set to '$QA_SEED_CMD'."
  bad "  This backend is the owner's REAL MultiMagic. There is nothing to seed"
  bad "  and everything to lose. Unset it; do not work around this."
else
  ok "QA_SEED_CMD empty — the real database will not be seeded or reset"
fi

# 3. Credentials, from .env only
if [ -n "${QA_EMAIL:-}" ] && [ -n "${QA_PASSWORD:-}" ]; then
  ok "QA account loaded from .env (not printed)"
else
  bad "QA_EMAIL / QA_PASSWORD missing from .env — QA must never sign in as the owner"
fi

# 4. Our device, and only ours
if adb devices 2>/dev/null | awk -v s="$SERIAL" 'NR>1 && $1==s && $2=="device"{f=1} END{exit !f}'; then
  ok "device online ($SERIAL)"
else
  bad "$SERIAL not online — start $AVD on port $EMULATOR_PORT"
fi
# Name the AVD, so nobody has to guess whose device is up.
others=$(pgrep -af qemu-system 2>/dev/null | sed -n 's/.*-avd \([A-Za-z0-9_]*\).*/\1/p' | grep -v "^$AVD$" || true)
[ -n "$others" ] && warn "another AVD is running: $others (not ours — leave it alone)" || ok "no foreign AVD in the way"

# 5. The emulator networking trap, checked the right way round
if echo "$API_URL" | grep -qiE '127\.0\.0\.1|localhost'; then
  bad "API_URL is $API_URL — from an emulator that is the EMULATOR itself. Use 10.0.2.2."
else
  ok "API_URL uses the emulator's host alias ($API_URL)"
fi

# 6. Metro, on OUR port
if curl -s --max-time 3 "http://localhost:$METRO_PORT/status" 2>/dev/null | grep -qi packager; then
  ok "Metro running on :$METRO_PORT"
else
  bad "Metro not answering on :$METRO_PORT — npx expo start --port $METRO_PORT"
fi

# 6b. THE SAME TRAP AS THE API URL, ONE PORT ALONG — and it cost a whole suite.
#
# The deep link is `exp://127.0.0.1:$METRO_PORT`, and from inside the emulator
# `127.0.0.1` is THE EMULATOR, not the host. `expo start --android` sets up the
# `adb reverse` that makes it work; starting Metro on its own does not, and then
# Expo Go fails with "Failed to download remote update" and drops to its own
# ErrorActivity — so every flow fails on "sign-in-email is not visible", an
# assertion that points at our screen and blames entirely the wrong thing.
#
# Checked AND repaired here, because a preflight that can fix a one-line
# environment problem should.
if adb -s "$SERIAL" reverse --list 2>/dev/null | grep -q "tcp:$METRO_PORT"; then
  ok "adb reverse tcp:$METRO_PORT in place (the deep link can reach Metro)"
else
  if adb -s "$SERIAL" reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT" >/dev/null 2>&1; then
    ok "adb reverse tcp:$METRO_PORT established"
  else
    bad "no adb reverse for :$METRO_PORT — the deep link would resolve to the emulator itself"
  fi
fi

# 7. Backend, checked over the LOCAL address because a shell cannot use 10.0.2.2
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$API_URL_LOCAL/up" 2>/dev/null || echo 000)
[ "$code" = "200" ] && ok "backend reachable ($API_URL_LOCAL/up -> $code)" \
                    || bad "backend NOT reachable at $API_URL_LOCAL/up (got $code)"

# 8. Expo Go present, and the right build for this SDK
if adb -s "$SERIAL" shell pm list packages 2>/dev/null | grep -q "$APP_ID"; then
  v=$(adb -s "$SERIAL" shell dumpsys package "$APP_ID" 2>/dev/null | grep -m1 versionName | cut -d= -f2 | tr -d '\r')
  case "$v" in
    54.*) ok "Expo Go $v (matches SDK 54)" ;;
    *)    bad "Expo Go $v does not match SDK 54 — install ~/.expo/android-apk-cache/Expo-Go-54.0.8.apk" ;;
  esac
else
  bad "$APP_ID not installed"
fi

# 9. Clean launch over the deep link
if [ "$fail" = 0 ]; then
  adb -s "$SERIAL" logcat -c >/dev/null 2>&1
  adb -s "$SERIAL" shell am start -a android.intent.action.VIEW -d "$DEEP_LINK" "$APP_ID" >/dev/null 2>&1
  sleep 25
  crash=$(adb -s "$SERIAL" logcat -d 2>/dev/null | grep -iE 'FATAL EXCEPTION|AndroidRuntime|Cannot find native module|Unable to load script|Could not connect to development server' | head -5)
  [ -z "$crash" ] && ok "app launched over $DEEP_LINK with no fatal errors" \
                  || { bad "errors after launch:"; echo "$crash" | sed 's/^/        /'; }
fi

echo
[ "$fail" = 0 ] && echo "preflight PASSED" || echo "preflight FAILED — that is the first finding"
exit $fail
