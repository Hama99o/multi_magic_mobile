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

# 7. Backend — checked over the LOCAL address because a shell cannot use
#    10.0.2.2, and STARTED rather than assumed. A night's run must not be lost
#    because nobody remembered to bring the API up. See qa.config.sh for the
#    two things this must never do to that stack.
MM_DIR="$(dirname "$MM_COMPOSE_FILE")"
compose(){ docker compose -f "$MM_COMPOSE_FILE" "$@"; }
backend_up(){
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$API_URL_LOCAL/up" 2>/dev/null || echo 000)" = "200" ]
}

if backend_up; then
  # Already serving: touch nothing. `up -d` on a running stack can recreate a
  # container under whoever is using it, and there is nothing to gain here.
  ok "backend reachable ($API_URL_LOCAL/up -> 200)"
elif ! command -v docker >/dev/null 2>&1; then
  bad "backend not answering and docker is not installed — cannot bring it up"
elif [ ! -f "$MM_COMPOSE_FILE" ]; then
  bad "backend not answering, and no compose file at $MM_COMPOSE_FILE"
  bad "  point MM_COMPOSE_FILE at wherever multi_magic lives on this machine"
else
  warn "backend not answering — bringing it up from $MM_COMPOSE_FILE"

  # The data stores FIRST, and only those. `web` is the service whose command
  # runs `bin/rails db:prepare`, and it must not start until the next check has
  # passed.
  compose up -d postgres redis >/dev/null 2>&1
  waited=0
  until [ "$(compose ps --format '{{.Service}}|{{.Health}}' 2>/dev/null \
             | grep -cE '^(postgres|redis)\|healthy$')" = "2" ]; do
    [ "$waited" -ge 90 ] && break
    sleep 2; waited=$((waited + 2))
  done
  unhealthy=$(compose ps --format '{{.Service}}|{{.State}}|{{.Health}}' 2>/dev/null \
              | grep -E '^(postgres|redis)\|' | grep -v 'healthy$' || true)

  if [ -n "$unhealthy" ]; then
    # NAME THE SERVICE. "API not reachable" sends the next person to the app.
    bad "the data stores did not come up healthy in ${waited}s:"
    echo "$unhealthy" | sed 's/^/        /'
    compose logs --tail=15 postgres redis 2>/dev/null | sed 's/^/        /'
  else
    ok "postgres and redis healthy (${waited}s)"

    # ── THE GUARD, AND THE REASON IT IS HERE AT ALL ───────────────────────
    # `web`'s command is `bundle install && bin/rails db:prepare && rails
    # server`. STARTING the stack therefore migrates — and the database it
    # migrates is `multi_magic_development`, which holds his real notes,
    # contacts, loans and calendar. A migration a sibling landed and nobody
    # applied would be applied at 3am by a rig nobody is watching.
    #
    # Every migration FILE must already be in `schema_migrations`. Not
    # max(version): a migration numbered below the newest applied one is
    # exactly the case a high-water mark misses.
    PGUSER_MM="$(grep -m1 '^POSTGRES_USER=' "$MM_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'\r')"
    PGDB_MM="$(grep -m1 '^POSTGRES_DB=' "$MM_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'\r')"
    applied=$(compose exec -T postgres psql -U "${PGUSER_MM:-multi_magic}" \
              -d "${PGDB_MM:-multi_magic}_development" -tAc 'select version from schema_migrations' 2>/dev/null)
    pending=""
    for f in "$MM_DIR"/db/migrate/*.rb; do
      [ -e "$f" ] || continue
      v="$(basename "$f" | cut -d_ -f1)"
      printf '%s\n' "$applied" | grep -qx "$v" || pending="$pending$(basename "$f")
"
    done

    if [ -z "$applied" ]; then
      bad "could not read schema_migrations from ${PGDB_MM:-multi_magic}_development"
      bad "  NOT starting web: it would run db:prepare against a database this"
      bad "  check could not inspect. Bring the backend up by hand and look."
    elif [ -n "$pending" ]; then
      bad "$(printf '%s' "$pending" | grep -c .) migration(s) in multi_magic are NOT applied to development:"
      printf '%s' "$pending" | sed 's/^/        /'
      bad "  NOT starting web. Its command runs db:prepare, which would apply"
      bad "  these to his REAL data with nobody watching. A human runs them."
    else
      ok "development is fully migrated — web may start without migrating anything"
      compose up -d $MM_COMPOSE_SERVICES >/dev/null 2>&1
      # A POLL of the health endpoint, not a sleep: a warm start costs one
      # probe, and a cold one runs `bundle install` before Rails boots.
      waited=0
      until backend_up; do
        [ "$waited" -ge "$MM_COMPOSE_TIMEOUT" ] && break
        sleep 3; waited=$((waited + 3))
      done
      if backend_up; then
        ok "backend up in ${waited}s ($API_URL_LOCAL/up -> 200)"
      else
        bad "backend still not answering ${waited}s after docker compose up"
        down=$(compose ps --format '{{.Service}}|{{.State}}' 2>/dev/null | grep -v '|running$' || true)
        if [ -n "$down" ]; then
          bad "  these services are not running:"
          echo "$down" | sed 's/^/        /'
        else
          bad "  every service is running, so this is Rails not booting, not compose:"
        fi
        compose logs --tail=25 web 2>/dev/null | sed 's/^/        /'
      fi
    fi
  fi
fi

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
