#!/usr/bin/env bash
# Tests for qa/app_checks.sh, run by `npm test` (pretest). Canned adb and git
# text in, a decision out; no device needed. Plant a break in app_checks.sh
# and this goes red.
set -uo pipefail
cd "$(dirname "$0")"
# shellcheck source=app_checks.sh
. ./app_checks.sh

fails=0
check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then echo "  ok    $1"; else echo "  FAIL  $1: expected '$2', got '$3'"; fails=1; fi
}

# ── step 8: is the installed build current? ─────────────────────────────
DUMP='    versionName=1.0.0
    lastUpdateTime=2026-09-21 21:56:12'
# A device on UTC+2: its local 12:00:00 is 10:00:00 UTC.
LOCAL_NOW="2026-09-25 12:00:00"
EPOCH_NOW=$(utc_epoch "2026-09-25 10:00:00")
got=$(installed_epoch "$DUMP" "$LOCAL_NOW" "$EPOCH_NOW")
check "the device's local time is converted with the device's own clock" "$(utc_epoch "2026-09-21 19:56:12")" "$got"

NATIVE_AFTER=$(utc_epoch "2026-09-24 15:58:54")
NATIVE_BEFORE=$(utc_epoch "2026-09-20 10:00:00")
build_is_current "$got" "$NATIVE_AFTER" && r=current || r=stale
check "a build older than a native change is STALE" stale "$r"
build_is_current "$got" "$NATIVE_BEFORE" && r=current || r=stale
check "a build newer than every native change is current" current "$r"

installed_epoch "no such line" "$LOCAL_NOW" "$EPOCH_NOW" >/dev/null && r=read || r=unreadable
check "no lastUpdateTime is unreadable, not a pass" unreadable "$r"

# ── step 9: what is actually in front? ──────────────────────────────────
APP=co.byseven.multimagic
check "the app's own activity" app \
  "$(front_is "$APP" '  topResumedActivity=ActivityRecord{1 u0 co.byseven.multimagic/.MainActivity t12}')"
check "the dev launcher, waiting for a server" launcher \
  "$(front_is "$APP" '  topResumedActivity=ActivityRecord{1 u0 co.byseven.multimagic/expo.modules.devlauncher.launcher.DevLauncherActivity t12}')"
check "nothing launched: the home screen is in front" other \
  "$(front_is "$APP" '  topResumedActivity=ActivityRecord{1 u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity t1}')"
check "no resumed activity at all" other "$(front_is "$APP" 'nothing here')"

echo
[ "$fails" = 0 ] && echo "app_checks: all passed" || echo "app_checks: FAILED"
exit $fails
