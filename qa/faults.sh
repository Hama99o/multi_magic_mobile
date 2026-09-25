#!/usr/bin/env bash
# Run 21-faults.yaml: the fault proxy up, Metro baked to it, the flow, and
# BOTH torn down, whatever happened.
#
#   ./qa/faults.sh            # needs the emulator up and claimed, the backend up
#   FAULTS_FLOW=path.yaml ./qa/faults.sh   # another flow through the same rig
#
# About three minutes (168 s on 2026-09-25), far inside the ~14-minute
# ceiling measured on background tasks that night; it traps TERM anyway.
#
# Exit 0 pass · 1 the flow failed · 3 NOT MEASURED (no device, no backend, a
# port already held, or the rig itself could not come up).
#
# ── THE TEARDOWN IS THE RISKY PART ────────────────────────────────────────
# `EXPO_PUBLIC_API_URL` is inlined into the bundle at BUILD time
# (src/config/env.ts), so a Metro left running here is baked to the proxy.
# After the proxy stops, every later run would get an app that cannot reach
# the server, which looks exactly like an app bug. So:
#   - the teardown is a `trap` on EXIT, INT and TERM. It runs when the flow
#     fails, when Maestro crashes, and on Ctrl-C, not only on a pass;
#   - it stops what THIS script started, by the process group it recorded,
#     then checks both ports by `ss` and stops any listener left, by PID;
#   - it NEVER selects a process by command line. `pkill -f <pattern>`
#     matches the shell running it, and that killed a session's own shell on
#     2026-09-25 (CLAUDE.md, "pgrep -f matches the watcher").
# It leaves :$METRO_PORT FREE rather than restarting an ordinary Metro. The
# next `qa.sh up` or `run.sh` then starts one baked to the real API, which is
# the only way a baked value can be trusted.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
# THE DEV BUILD, NEVER EXPO GO. qa.config.sh falls back to Expo Go unless
# USE_DEV_BUILD=1, and on 2026-09-25 four runs of this flow went to Expo Go
# unnoticed: the header taps "COMPLETED" and navigated nowhere, and the mic
# was missing, because Expo Go has no speech module. The register already
# recorded 20-refresh failing on Expo Go and passing on the dev build.
export USE_DEV_BUILD=1
. "$DIR/qa.config.sh"
export PATH="$HOME/.maestro/bin:$PATH"
PROXY_PORT="${FAULT_PROXY_PORT:-3031}"
PROXY_LOG="$DIR/reports/fault-proxy-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$DIR/reports"

not_measured() { echo "NOT MEASURED: $*"; exit 3; }

# ── what must already be true ────────────────────────────────────────────
[ "$(adb -s "$SERIAL" get-state 2>/dev/null)" = device ] || not_measured "no device on $SERIAL (boot and claim it: ./qa/qa.sh up)"
curl -s --max-time 5 -o /dev/null -w '%{http_code}' "$API_URL_LOCAL/up" | grep -q 200 \
  || not_measured "the backend is not answering at $API_URL_LOCAL"
ss -ltn | grep -q ":$PROXY_PORT " && not_measured ":$PROXY_PORT is already held; whose? (ss -ltnp)"
adb -s "$SERIAL" shell pm list packages 2>/dev/null | grep -q "package:$APP_ID\b" \
  || not_measured "the dev build ($APP_ID) is not installed on $SERIAL (./qa/qa.sh install)"
[ -n "${QA_EMAIL:-}" ] && [ -n "${QA_PASSWORD:-}" ] || not_measured "QA_EMAIL / QA_PASSWORD not set (the gitignored .env)"

listener() { ss -ltnp 2>/dev/null | grep ":$1 " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u; }

PROXY_PGID=""
METRO_PGID=""
CHILD=""
# THE LONG STEPS RUN AS CHILDREN WE `wait` ON. Bash runs a trap only after
# the FOREGROUND command returns, so a TERM during a foreground Maestro run
# would wait for Maestro to finish, and a harness that follows TERM with
# KILL (a ~14-minute ceiling on background tasks was measured 2026-09-25)
# would never see the teardown. `wait` is interrupted by the trap at once.
in_child() { "$@" & CHILD=$!; wait "$CHILD"; local rc=$?; CHILD=""; return $rc; }
teardown() {
  local rc=$?
  trap - EXIT INT TERM
  [ -n "$CHILD" ] && kill "$CHILD" 2>/dev/null
  [ -n "$PROXY_PGID" ] && kill -- "-$PROXY_PGID" 2>/dev/null
  [ -n "$METRO_PGID" ] && kill -- "-$METRO_PGID" 2>/dev/null
  sleep 2
  for port in "$PROXY_PORT" "$METRO_PORT"; do
    for pid in $(listener "$port"); do kill "$pid" 2>/dev/null; done
  done
  sleep 1
  local left=""
  for port in "$PROXY_PORT" "$METRO_PORT"; do
    for pid in $(listener "$port"); do kill -9 "$pid" 2>/dev/null; left="$left :$port"; done
  done
  if ss -ltn | grep -qE ":($PROXY_PORT|$METRO_PORT) "; then
    echo "TEARDOWN FAILED: still listening on$(ss -ltn | grep -oE ":($PROXY_PORT|$METRO_PORT) " | tr -d ' ' | tr '\n' ' ')"
    echo "  Metro there is baked to the proxy. Stop it by PID before any other run (ss -ltnp)."
    exit 1
  fi
  echo "teardown: :$PROXY_PORT and :$METRO_PORT are free${left:+ (needed kill -9 on$left)}. The next ordinary run starts a clean Metro."
  exit "$rc"
}
trap teardown EXIT INT TERM

# ── an ordinary Metro on the port is baked to the real API: stop it ─────
for pid in $(listener "$METRO_PORT"); do
  echo "stopping the Metro on :$METRO_PORT (pid $pid); it is baked to the real API"
  kill "$pid" 2>/dev/null
done
sleep 2
ss -ltn | grep -q ":$METRO_PORT " && not_measured ":$METRO_PORT is still held after stopping its listener"

# ── the proxy ────────────────────────────────────────────────────────────
# `setsid` gives each its own process group, whose id is the pid `$!` names,
# so the teardown can stop npx, npm, node and everything they started.
FAULT_PROXY_UPSTREAM="$API_URL_LOCAL" setsid python3 "$DIR/fault_proxy.py" </dev/null >"$PROXY_LOG" 2>&1 &
PROXY_PGID=$!
for _ in $(seq 1 20); do
  curl -s --max-time 1 "http://localhost:$PROXY_PORT/__fault" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -s --max-time 2 "http://localhost:$PROXY_PORT/__fault" >/dev/null 2>&1 \
  || not_measured "the fault proxy did not come up on :$PROXY_PORT (log: $PROXY_LOG)"

# ── Metro, baked to the proxy ────────────────────────────────────────────
( cd "$DIR/.." && EXPO_PUBLIC_API_URL="http://10.0.2.2:$PROXY_PORT" exec setsid npx expo start --port "$METRO_PORT" </dev/null >/dev/null 2>&1 ) &
METRO_PGID=$!
for _ in $(seq 1 60); do
  curl -s --max-time 2 "http://localhost:$METRO_PORT/status" 2>/dev/null | grep -q running && break
  sleep 2
done
curl -s --max-time 2 "http://localhost:$METRO_PORT/status" 2>/dev/null | grep -q running \
  || not_measured "Metro did not come up on :$METRO_PORT"
# The pgid is the setsid'd process's own pid, which `exec` made the subshell's.
METRO_PGID=$(ps -o pgid= -p "$METRO_PGID" 2>/dev/null | tr -d ' ' || echo "$METRO_PGID")

# PROVE the bake before trusting a single assertion: the bundle Metro serves
# must carry the proxy's address. This also warms it.
BUNDLE="http://localhost:$METRO_PORT/.expo/.virtual-metro-entry.bundle?platform=android&dev=true&minify=false"
BUNDLE_FILE="$(mktemp)"
in_child curl -s --max-time 300 -o "$BUNDLE_FILE" "$BUNDLE"
baked=$(grep -c "10.0.2.2:$PROXY_PORT" "$BUNDLE_FILE")
rm -f "$BUNDLE_FILE"
[ "${baked:-0}" -ge 1 ] || not_measured "the bundle does not carry http://10.0.2.2:$PROXY_PORT; the app would talk to something else"
echo "Metro :$METRO_PORT is baked to the proxy :$PROXY_PORT (checked in the bundle)"

adb -s "$SERIAL" reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT" >/dev/null
adb -s "$SERIAL" shell am force-stop "$APP_ID" >/dev/null 2>&1
# Warm the app on the new bundle, as run.sh does. Without it the first taps
# land while the dev client is still loading and are silently ignored: on
# 2026-09-25 two header taps "COMPLETED" and opened nothing.
adb -s "$SERIAL" shell am start -a android.intent.action.VIEW -d "$DEEP_LINK" "$APP_ID" >/dev/null 2>&1
in_child sleep 30

export MAESTRO_QA_EMAIL="$QA_EMAIL"
export MAESTRO_QA_PASSWORD="$QA_PASSWORD"
echo "Running 21-faults on $SERIAL ($AVD) through the fault proxy"
in_child maestro --device "$SERIAL" test -e APP_ID="$APP_ID" -e DEEP_LINK="$DEEP_LINK" \
  -e PROXY_PORT="$PROXY_PORT" "${FAULTS_FLOW:-$DIR/flows/21-faults.yaml}"
exit $?
