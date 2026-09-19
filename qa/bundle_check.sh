#!/usr/bin/env bash
# THE GATE THAT ASKS METRO. The only one that exercises the path a phone takes.
#
#   ./qa/bundle_check.sh          # against the working tree, on $METRO_PORT
#
# ── WHY THIS EXISTS, WITH THE DATE ───────────────────────────────────────
# On 2026-09-19 `main` could not bundle for seven hours and every gate we run
# was green the whole time. `e41be2a` added, in `src/stores/readAloud.store.ts`:
#
#     function tryRequire<T>(name: string): T | null {
#       try { return require(name) as T; } catch { return null; }
#     }
#
# Metro resolves requires STATICALLY, so a require of a variable is rejected at
# transform time: `Invalid call at line 90: require(name)`. Node resolves at
# runtime and does not care — which is exactly why it passed:
#
#   tsc      0 errors    — `require` is typed, the call is legal TypeScript
#   eslint   0 errors    — the line even carries a no-require-imports disable
#   jest     465 passed  — Node's require, not Metro's
#
# Three green gates, none of which bundles. On the device the dev client drops
# to DevLauncherErrorActivity and NOTHING renders — so every flow would have
# failed on "sign-in-email is not visible", blaming the screen again.
#
# ── EXIT CODES, SAME CONTRACT AS THE REST OF THE RIG ─────────────────────
#   0  the bundle built            (measured, passed)
#   1  the bundle FAILED           (measured, a real finding)
#   3  could not ask               (NOT MEASURED — no node, no Metro)
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/qa.config.sh"
REPO="$(cd "$DIR/.." && pwd)"

# Expo 54's Metro config calls Array.prototype.toReversed, which is Node 20+.
# On Node 18 `expo start` dies with "configs.toReversed is not a function",
# which reads like a broken metro.config.js and is not one. `.nvmrc` pins the
# version; the box default does not have to match it.
NODEV="$(node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
if [ -z "$NODEV" ] || [ "$NODEV" -lt 20 ]; then
  want="$(tr -d 'v \n' < "$REPO/.nvmrc" 2>/dev/null)"
  if [ -n "$want" ] && [ -x "$HOME/.nvm/versions/node/v$want/bin/node" ]; then
    export PATH="$HOME/.nvm/versions/node/v$want/bin:$PATH"
    echo "  node $(node --version) (from .nvmrc; the box default was v${NODEV:-none})"
  else
    echo "  NOT MEASURED: node is v${NODEV:-none}, Expo 54 needs 20+ and .nvmrc's is not installed"
    exit 3
  fi
fi

started=0
if ! curl -s --max-time 3 "http://localhost:$METRO_PORT/status" 2>/dev/null | grep -qi packager; then
  echo "  starting Metro on :$METRO_PORT"
  ( cd "$REPO" && setsid nohup npx expo start --port "$METRO_PORT" --dev-client \
      > "$DIR/reports/metro-bundle-check.log" 2>&1 < /dev/null & )
  started=1
  waited=0
  until curl -s --max-time 2 "http://localhost:$METRO_PORT/status" 2>/dev/null | grep -qi packager; do
    [ "$waited" -ge 120 ] && { echo "  NOT MEASURED: Metro did not come up in ${waited}s"; exit 3; }
    sleep 3; waited=$((waited + 3))
  done
fi

# Expo 54 serves the router entry from a virtual module; `index.bundle` is the
# bare-RN entry and 404s on an expo-router project, which is a different
# failure with the same shape and would read as a false red.
URL="http://localhost:$METRO_PORT/.expo/.virtual-metro-entry.bundle?platform=android&dev=true&minify=false"
OUT="$DIR/reports/bundle-check.out"
mkdir -p "$DIR/reports"

echo "  asking Metro for the Android bundle (this is a real build, allow a minute)"
code=$(curl -s --max-time 900 "$URL" -o "$OUT" -w '%{http_code}' 2>/dev/null || echo 000)
size=$(wc -c < "$OUT" 2>/dev/null || echo 0)

# Stop a Metro we started; leave one we found alone — somebody is using it.
if [ "$started" = 1 ]; then
  pid=$(ss -ltnp 2>/dev/null | grep ":$METRO_PORT" | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
  # By PORT, never `pkill -f "expo start"`: that pattern matches the shell
  # running it and kills this script. Measured, twice, on 18 September.
  [ -n "$pid" ] && kill "$pid" 2>/dev/null
fi

if [ "$code" = "200" ] && [ "$size" -gt 100000 ]; then
  echo "  ok    the app bundles for Android ($((size / 1024)) KB)"
  exit 0
fi

if [ "$code" = "000" ]; then
  echo "  NOT MEASURED: Metro never answered"
  exit 3
fi

echo "  FAIL  the app does NOT bundle (http $code, $size bytes)"
# The message, not the stack: the stack is node_modules and tells nobody whose.
python3 - "$OUT" <<'PY' 2>/dev/null || head -c 400 "$OUT"
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print("        " + d.get("type", "error") + ": " + d.get("message", "").split("\n")[0])
except Exception:
    print("        " + open(sys.argv[1]).read()[:400])
PY
echo "        full response: $OUT"
exit 1
