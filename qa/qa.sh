#!/usr/bin/env bash
# THE one entry point. Same shape as hatiwal-mobile, karwan-mobile and edu-safi,
# so anybody who knows one of those knows this.
#
#   ./qa/qa.sh doctor     preflight only — is this box able to measure anything?
#   ./qa/qa.sh up         boot our AVD and Metro
#   ./qa/qa.sh down       release the device and stop Metro
#   ./qa/qa.sh flow NAME  one flow by name
#   ./qa/qa.sh claim WHO [why]   take the DEVICE; exit 3 if somebody holds it
#   ./qa/qa.sh release WHO       give it back
#   ./qa/qa.sh claims            who holds it, and since when
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
    ensure_node
    # ── HARDWARE GPU WHEN THERE IS ONE. THIS IS THE SYSTEMUI ANR. ───────────
    #
    # This line said `-gpu swiftshader_indirect` unconditionally, and software
    # rendering is why `qa_phone2` and then `qa_phone4` both wedged on
    # `Application Not Responding: com.android.systemui` within minutes of every
    # boot — four boots, then four more, and a whole sweep of 0 PASS, 0 FAIL,
    # 24 NOT MEASURED.
    #
    # Read from the trace rather than guessed (`/data/anr/anr_2026-09-21-*`,
    # both files identical):
    #
    #   Subject: …com.android.systemui… failed to complete startup
    #   outgoing transaction … to 451 … elapsed 14114ms      ← 451 = surfaceflinger
    #   at SurfaceControl.getGPUContextPriority(SurfaceControl.java:2655)
    #   at com.android.systemui.SystemUIApplication.onCreate
    #
    # SystemUI blocks in `onCreate` on a synchronous binder call to
    # surfaceflinger and never returns. It is a graphics stall AT STARTUP —
    # before any flow, which is what rules out the two theories we had:
    #
    #   - NOT the AVD. Two different devices, identical failure.
    #   - NOT the system image. `qa_phone` ran on 19 September and
    #     `qa_edu_phone` through early September on the same byte-identical
    #     `android-35/google_apis/x86_64` without this.
    #   - NOT `wm size`/`wm density` (`QA_HANDBOOK.md:97`), which was the best
    #     candidate we had. No flow in either run touched geometry, preflight
    #     confirmed no inherited override, and the ANR is at SystemUI startup.
    #   - NOT host load. It ANR'd at load average 4.6 as readily as at 9.5.
    #
    # KARWAN'S RIG IS THE CONTROL and it had the answer written down the whole
    # time (`Karwan/karwan-mobile/qa/lib/emulator.sh:62-63`): default to
    # swiftshader, and use `host` when `/dev/dri/renderD128` exists. It does
    # exist on this box. That is why their `qa_phone` runs and ours does not.
    #
    # Verified: `qa_phone4` booted with `-gpu host` reaches the launcher and
    # writes no new ANR trace.
    GPU="swiftshader_indirect"
    [ -e /dev/dri/renderD128 ] && GPU="host"
    pgrep -af qemu-system 2>/dev/null | grep -q -- "-avd $AVD" \
      || nohup "${ANDROID_HOME:-$HOME/Android/Sdk}/emulator/emulator" -avd "$AVD" \
           -port "$EMULATOR_PORT" -no-snapshot-save -no-boot-anim \
           -gpu "$GPU" -no-audio -memory 2048 >/dev/null 2>&1 &
    adb -s "$SERIAL" wait-for-device
    # ── FULLY DETACHED, OR `up` NEVER RETURNS ──────────────────────────────
    # Measured 2026-09-21: two `qa.sh up` processes sat alive for 43 minutes
    # each with their work long finished — Metro serving, preflight passing,
    # flows running. `up` returns in well under a second when Metro is ALREADY
    # up and it has nothing to start, so the backgrounded Metro is what holds
    # the shell: it keeps the script's stdin and process group, and a caller
    # reading the script's output waits for an EOF that a living child will
    # never send. Two `up` processes racing is then its own way to wedge a
    # device.
    #
    # `setsid` puts Metro in its own session and `</dev/null` gives up the
    # inherited stdin, so nothing of the script survives in it.
    curl -s --max-time 10 "http://localhost:$METRO_PORT/status" | grep -q packager \
      || ( cd "$DIR/.." && setsid nohup npx expo start --port "$METRO_PORT" \
             </dev/null >/dev/null 2>&1 & )
    echo "up: $AVD on $SERIAL, Metro :$METRO_PORT";;
  install)
    # The dev build, onto whatever device is up. Needs the box; everything
    # before it does not, which is why the APK is built ahead of the claim.
    [ -f "$DIR/../$DEV_BUILD_APK" ] || { echo "no APK at $DEV_BUILD_APK — build it first:"; \
      echo "  npx expo prebuild --platform android && (cd android && ./gradlew assembleDebug)"; exit 1; }
    adb -s "$SERIAL" install -r "$DIR/../$DEV_BUILD_APK" || exit 1
    echo "installed $DEV_BUILD_ID — run flows with USE_DEV_BUILD=1";;
  down)
    adb -s "$SERIAL" emu kill >/dev/null 2>&1
    pgrep -f "expo start --port $METRO_PORT" | while read -r p; do kill "$p" 2>/dev/null; done
    echo "down: $AVD released, Metro stopped";;

  # ── THE DEVICE CLAIM ──────────────────────────────────────────────────────
  #
  # Ported from `karwan-mobile/qa/qa.sh:453`, which claims FEATURES so a fleet
  # can sweep without duplicating work. The mechanism is the same — a flock
  # around a read-modify-write on a shared file — and the thing being claimed is
  # not: here it is **the device**.
  #
  # ── A CLAIM IS ON THE DEVICE, NOT ON THE AVD ──────────────────────────────
  # This is the distinction that cost an hour on 18 September. "Released" was
  # read as "this app is finished with it", when what it has to mean is **free
  # for anybody, including the other app**. One emulator at a time on this box
  # (`RIG_CONTRACT.md` §2), so a claim held by multimagic blocks Karwan just as
  # hard as it blocks the other multimagic session. There is one device and one
  # lock, and the lock does not know which repo you are in.
  #
  # ── WHY IT EXITS 3 AND NOT 1 ──────────────────────────────────────────────
  # Somebody else holding the device means you MEASURED NOTHING. That is not a
  # failing test and must never be counted as one — the same reason a blocked
  # preflight is 3.
  #
  # ── LIVENESS IS A TIMESTAMP, NOT A PROCESS CHECK ──────────────────────────
  # `qa.sh claim` exits immediately, so the claiming PID is dead long before
  # anyone looks — `kill -0` would free every claim the moment it was taken. And
  # `pgrep -f <word>` is worse than useless here: it matches the watcher looking
  # for the word, which on 18 September counted four maestro processes that were
  # four `until ! pgrep -f maestro` shells, and killed its own shell twice. So
  # staleness is age: a claim older than CLAIM_TTL_MIN is broken with a warning
  # rather than honoured for ever by a session that has gone.
  claim)
    who="${2:-}"; why="${3:-}"
    [ -n "$who" ] || { echo "claim: name yourself — ./qa/qa.sh claim <session> [why]" >&2; exit 2; }
    mkdir -p "$DIR/reports"
    exec 8>"$DIR/reports/.claims.lock"
    flock 8
    claims="$DIR/reports/.claims"
    if [ -s "$claims" ]; then
      holder=$(cut -d" " -f1 "$claims"); since=$(cut -d" " -f2 "$claims")
      age=$(( ( $(date +%s) - $(cut -d" " -f3 "$claims") ) / 60 ))
      if [ "$holder" != "$who" ] && [ "$age" -lt "${CLAIM_TTL_MIN:-45}" ]; then
        flock -u 8
        echo "BLOCKED: $holder holds $AVD (since $since, ${age}m ago). NOT MEASURED." >&2
        exit 3
      fi
      [ "$holder" != "$who" ] && \
        echo "note: breaking $holder's stale claim (${age}m > ${CLAIM_TTL_MIN:-45}m)" >&2
    fi
    printf "%s %s %s %s\n" "$who" "$(date -Iseconds)" "$(date +%s)" "$why" > "$claims"
    flock -u 8
    echo "claimed: $AVD by $who${why:+ — $why}";;

  release)
    who="${2:-}"
    [ -n "$who" ] || { echo "release: name yourself — ./qa/qa.sh release <session>" >&2; exit 2; }
    exec 8>"$DIR/reports/.claims.lock"
    flock 8
    claims="$DIR/reports/.claims"
    holder=$(cut -d" " -f1 "$claims" 2>/dev/null || true)
    if [ -z "$holder" ]; then
      flock -u 8; echo "release: nobody held $AVD"; exit 0
    fi
    if [ "$holder" != "$who" ]; then
      flock -u 8
      echo "release: $holder holds it, not you — say so to them rather than taking it" >&2
      exit 1
    fi
    rm -f "$claims"
    flock -u 8
    # Free for ANY session and ANY app on this box, not just the next one of ours.
    echo "released: $AVD is free for anybody, Karwan included";;

  claims)
    claims="$DIR/reports/.claims"
    if [ -s "$claims" ]; then
      awk '{ why=""; for (i=4; i<=NF; i++) why = why (i>4 ? " " : "") $i
             printf "%s holds '"$AVD"' since %s%s\n", $1, $2, (why ? " — " why : "") }' "$claims"
    else
      echo "$AVD is free"
    fi;;

  flow)
    require_rig || exit 3
    # The password is EXPORTED, never argv — see `run.sh` for the measurement,
    # and for why the name MUST start `MAESTRO_`: a bare export is invisible
    # to the flow, which then types `undefined`.
    export MAESTRO_QA_EMAIL="$QA_EMAIL" MAESTRO_QA_PASSWORD="$QA_PASSWORD"
    maestro --device "$SERIAL" test \
      -e APP_ID="$APP_ID" -e DEEP_LINK="$DEEP_LINK" \
      "$DIR/flows/${2:?name a flow}";;
  smoke) SKIP_PREFLIGHT=0 "$DIR/run.sh" smoke;;
  all)   SKIP_PREFLIGHT=0 "$DIR/run.sh";;
  *) sed -n '2,20p' "$0"; exit 2;;
esac
