# Checks for preflight steps 8 and 9, as PURE functions of the text adb and
# git print, so they can be tested without a device (qa/app_checks_test.sh).
# Sourced by qa/preflight.sh.
#
# Both replace a check that could pass without measuring (2026-09-25):
# - step 8 asked whether the dev build was INSTALLED, not whether it was
#   CURRENT, so an APK older than a native change passed;
# - step 9 launched over a deep link the dev client ignores (every recording
#   on this rig used `monkey`), then reported "no fatal errors" having
#   launched nothing.

# Seconds since the epoch for "YYYY-MM-DD HH:MM:SS", read as UTC.
utc_epoch() { date -u -d "$1" +%s 2>/dev/null; }

# The installed build's time as an epoch, from `dumpsys package` output.
# `lastUpdateTime` is printed in the DEVICE's local time, which need not be
# the host's, so it is converted with the device's own clock: its local "now"
# (`date '+%F %T'`) against its epoch "now" (`date +%s`).
#   installed_epoch "<dumpsys text>" "<device local now>" "<device epoch now>"
installed_epoch() {
  local stamp offset
  stamp=$(printf '%s\n' "$1" | grep -m1 -o 'lastUpdateTime=[0-9-]* [0-9:]*' | cut -d= -f2)
  [ -n "$stamp" ] || return 1
  offset=$(( $(utc_epoch "$2") - $3 ))
  echo $(( $(utc_epoch "$stamp") - offset ))
}

# 0 when the installed build is at least as new as the newest native change.
#   build_is_current <installed epoch> <native change epoch>
build_is_current() { [ "$1" -ge "$2" ]; }

# What is in front, from `dumpsys activity activities`:
#   app       the app's own activity
#   launcher  the dev client's launcher, waiting for a server to be picked
#   other     anything else, including nothing launched at all
#   front_is <app id> "<dumpsys text>"
front_is() {
  local resumed
  resumed=$(printf '%s\n' "$2" | grep -m1 -E 'topResumedActivity|mResumedActivity|ResumedActivity:' || true)
  case "$resumed" in
    *"$1"/*DevLauncher*) echo launcher ;;
    *"$1"/*) echo app ;;
    *) echo other ;;
  esac
}
