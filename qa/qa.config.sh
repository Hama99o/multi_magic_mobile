#!/usr/bin/env bash
# THE RIG'S CONTRACT, BAKED IN RATHER THAN DOCUMENTED BESIDE IT.
#
# `qa/RIG_CONTRACT.md` states these rules; this file is what actually enforces
# them, because a rule that lives only in prose is a rule the next run ignores.

# ── Devices: ours, never Karwan's ───────────────────────────────────────────
# `qa_phone` and `qa_tablet` belong to karwan-mobile's rig. Two sessions on one
# AVD means one app installs over the other and neither can tell whose state it
# is looking at. His instruction: "karwan and mm should not disturb each other,
# both should launch its own."
# ── WHY THIS IS qa_phone4 AND NOT qa_phone2 — 2026-09-21 ────────────────────
# `qa_phone2` wedges on `Application Not Responding: com.android.systemui`
# within minutes of booting, every time. Four boots that evening: windowed at
# `-memory 2048` and headless at `-memory 3072`, host load average 9.5 on the
# first and 4.6 on the last, free RAM 2.4 GB at worst and 15 GB at best,
# `pswpin` flat throughout. It ANR'd in all four, and preflight PASSED twice in
# between — so the device was reachable and then stopped being, before any flow
# could assert anything. A whole sweep went 0 PASS, 0 FAIL, 24 NOT MEASURED.
#
# Ruled out first, and recorded so nobody re-spends it: host CPU, host RAM,
# orphaned Metro instances (there were two, both accounted for) and GPU cost
# (`-no-window` changed nothing). Disk was 97 % full with 17 G free, which is a
# standing risk and probably not this.
#
# **His decision was a different device rather than a wipe**, so `qa_phone2`
# keeps its state and stays available to whoever wants to diagnose it.
# `qa_phone4` is 2.1 GB, idle since 2 September, and its quick-boot snapshot
# was cleared. `qa_phone3` exists at 32 MB and is the fallback — a fuller image
# is likelier to have a working system partition than one that has never
# started.
#
# IF qa_phone4 WEDGES THE SAME WAY, do not reach for a third. Two devices
# failing identically means the fault is shared — the system image, the
# emulator binary, KVM, or this host — and that is a different investigation
# from one damaged AVD.
AVD="${AVD:-qa_phone4}"
AVD_TABLET="${AVD_TABLET:-qa_tablet2}"
EMULATOR_PORT="${EMULATOR_PORT:-5556}"
SERIAL="${SERIAL:-emulator-$EMULATOR_PORT}"

# Karwan's Metro is 3028. Ours is not.
METRO_PORT="${METRO_PORT:-3029}"

# ── Two addresses for one host, because two different things are asking ─────
# The APP reaches the host at 10.0.2.2 — the emulator's alias. It is identical
# on every machine AND on every network, so it survives the switch from office
# WiFi to a weekend hotspot and works with no network at all. A stale LAN IP
# fails in a way that looks exactly like an app bug.
#
# A SHELL cannot reach 10.0.2.2 at all: that alias exists only inside the
# emulator. So anything checking "is the backend up?" uses the local one.
API_URL="${API_URL:-http://10.0.2.2:3001}"
API_URL_LOCAL="${API_URL_LOCAL:-http://localhost:3001}"

# ── WHICH BINARY THE FLOWS DRIVE ────────────────────────────────────────────
#
# Expo Go was the harness's problem rather than the app's, and all of it is one
# consequence of not having our own package:
#
#   * the deep link resolves to the EMULATOR without `adb reverse`;
#   * Expo Go's dev menu covers the screen and swallows taps;
#   * Back exits the app, because the assistant is the ROOT route and Expo Go
#     owns the stack above it;
#   * and no custom native module is present at all, so dictation can never be
#     witnessed — only its absence.
#
# The development build has its own package, so `launchApp` launches OUR app,
# Back behaves the way expo-router intends, there is no menu in front of the UI,
# and `expo-speech-recognition` is in the binary (verified: 146 matches for
# ExpoSpeechRecognition in classes16.dex).
#
# Build it with:  npx expo prebuild --platform android && (cd android && ./gradlew assembleDebug)
DEV_BUILD_APK="${DEV_BUILD_APK:-android/app/build/outputs/apk/debug/app-debug.apk}"
# RENAMED 2026-09-21 with `app.json`, and these two must move together.
# If the manifest changes and this does not, the rig launches a package that
# no longer exists and EVERY flow fails on "sign-in-email is not visible" —
# an assertion pointing squarely at our screen. A package name living in two
# places is the shape that ships.
DEV_BUILD_ID="${DEV_BUILD_ID:-com.multimagics.mobile}"

# `USE_DEV_BUILD=1` drives our own app; anything else falls back to Expo Go, so
# the rig still runs on a machine where nobody has built one.
if [ "${USE_DEV_BUILD:-0}" = 1 ]; then
  APP_ID="${APP_ID:-$DEV_BUILD_ID}"
  # Its own scheme (app.json `scheme`), and it launches directly — no Metro URL.
  DEEP_LINK="${DEEP_LINK:-multimagic://}"
else
  APP_ID="${APP_ID:-host.exp.exponent}"
  DEEP_LINK="${DEEP_LINK:-exp://127.0.0.1:$METRO_PORT}"
fi

# ── THE BACKEND IS BROUGHT UP, NOT ASSUMED ──────────────────────────────────
# Hamma9900: *"for both Karwan and MultiMagic, always use Docker Compose."*
#
# There is no service in THIS repo to containerise — Metro and an emulator do
# not sensibly live in Docker, and pretending otherwise would be a gesture. What
# the instruction means for the rig is that a run must never depend on a human
# having remembered to start the API. `multi_magic` is already fully composed —
# web, cable, worker, postgres, redis — so preflight brings it up itself.
#
# The path is configurable rather than assumed: this box keeps the two repos
# side by side, another may not.
MM_COMPOSE_FILE="${MM_COMPOSE_FILE:-$HOME/Apps/Personal/multi_magic/docker-compose.yml}"

# The services the rig actually needs. `node` (Vite, for the WEB front end) is
# deliberately absent: the phone never loads it, and starting it costs an
# `npm install` on a cold container for nothing.
MM_COMPOSE_SERVICES="${MM_COMPOSE_SERVICES:-postgres redis web cable worker}"

# How long to wait for `/up` after starting it. A cold `web` runs `bundle
# install` before Rails boots, which is minutes, not seconds — and the wait is
# a POLL of the health endpoint, never a sleep, so a warm start costs one probe.
MM_COMPOSE_TIMEOUT="${MM_COMPOSE_TIMEOUT:-300}"

# ── TWO THINGS THE RIG MUST NEVER DO TO THAT STACK ──────────────────────────
#
# 1. `docker compose down -v` — ANYWHERE on this box, not just here. A volume
#    on this machine is the only copy of real data. Nothing in `qa/` issues a
#    `down` of any kind: the only verbs are `up -d`, `ps` and `logs`.
#
# 2. Migrate his development database. This one is not hypothetical and it is
#    not obvious: the `web` service's own command is
#
#      bundle install && bin/rails db:prepare && bin/rails server
#
#    so STARTING the stack runs `db:prepare` against `multi_magic_development`,
#    which holds his real notes, contacts, loans and calendar. If a sibling has
#    landed a migration that nobody has applied, an unattended preflight at 3am
#    would apply it to his real data. So preflight checks for pending
#    migrations FIRST, with postgres up and `web` still stopped, and fails
#    rather than starting the thing that would migrate.

# ── A DISPLAY CHANGE IS NOT DONE WHEN adb RETURNS ───────────────────────────
# This lives here rather than in one script because the next session to change
# a size or a density will hit it and will not know to look.
#
# `wm size` and `wm density` return immediately; the display keeps
# reconfiguring afterwards, and an app launched into that window lays itself
# out at the OLD geometry inside the NEW one. What that produces is not a
# crash and not a blank screen — it is a perfectly sharp screenshot of text
# clipped mid-letter, vertically as well as horizontally. It looks exactly
# like a real overflow bug at that width.
#
# On 2026-09-19 it produced two sets of nine pictures, and one of them reached
# Hamma9900, who photographed the sign-in screen and sent it up as a product
# defect. It is not one: force-stop, relaunch at the same Override, and the
# screen renders perfectly.
#
# Changing density ALONE settles in a few seconds. Changing SIZE AND DENSITY
# together does not, and no sleep is the right length — so this asks the window
# instead. Call it after every configuration change, before anything is
# measured or photographed.
#
# ── IT READS THE ROOT NODE, AND THAT IS LOAD-BEARING ────────────────────────
# `uiautomator dump` reports every node's bounds CLIPPED TO THE VISIBLE REGION.
# A control half covered by a pinned footer is reported at the size of the part
# you can see, not the size it is.
#
# Karwan measured a courier's map button at 83 px — 31.6 dp, below Android's
# 48 dp floor, on the role whose whole premise is huge targets in sunlight —
# and was one line from filing it. Scrolling four hundred pixels and measuring
# again gave 147 px, exactly 56 dp, exactly the role's token. The first number
# was real and it was a fact about VISIBILITY that reads as a fact about
# LAYOUT. Same family as the stale-layout screenshot: a real number about the
# wrong thing.
#
# This function is safe because the ROOT node is never clipped — it IS the
# visible region. Point it at a child and it inherits the trap silently.
# NEVER take a size from a dumped child node without proving it is fully on
# screen first.
#
# ── AND IT MUST ANSWER INSIDE THE CALLER'S PATIENCE ─────────────────────────
# Karwan's copy timed out on its first real run: 40 iterations at 3 s, plus two
# adb round trips each, outlives a 150 s cap and never answers at all. A check
# nobody can afford to wait for is a check nobody runs. This one polls faster
# and gives up sooner, and a caller with a tighter budget should pass its own.
#
#   wait_for_geometry <expected-width-px> [app-id] [deep-link]
wait_for_geometry() {
  local want="$1" app="${2:-$APP_ID}" link="${3:-${DEEP_LINK:-}}" n=0 got=""
  # THE DISPLAY, ASKED OF THE WINDOW MANAGER — not the accessibility dump.
  #
  # This read the root node of `uiautomator dump` and it was wrong twice over.
  # That dump describes the FOREGROUND WINDOW, not the display: when an ANR
  # dialog owns the screen the whole dump is the dialog, there is no `[0,0]`
  # root at all, and the check reported "window reports nothing px" while the
  # display had in fact settled perfectly. Measured 2026-09-19 at 800 dp.
  #
  # It is also the same trap Karwan hit from the other side — dumped bounds
  # are clipped to the visible region, so any CHILD node's size is a fact
  # about visibility rather than about layout.
  #
  # `dumpsys window displays` reports the display's current size. A dialog
  # cannot hijack it and nothing clips it.
  until [ "$n" -ge "${GEOMETRY_TRIES:-25}" ]; do
    got=$(adb -s "$SERIAL" shell dumpsys window displays 2>/dev/null \
          | grep -oE 'cur=[0-9]+x[0-9]+' | head -1 | cut -d= -f2 | cut -dx -f1)
    [ -n "$got" ] && [ "$got" = "$want" ] && break
    n=$((n + 1)); sleep "${GEOMETRY_WAIT:-2}"
  done
  if [ "$got" != "$want" ]; then
    echo "  display reports ${got:-nothing}px wide, asked for ${want}px" >&2
    return 1
  fi
  # THE DISPLAY HAS SETTLED; NOW start the app INTO it. Starting before this
  # point is the whole bug — the app lays out at the old geometry inside the
  # new window and photographs as text clipped mid-letter.
  [ -n "$link" ] && adb -s "$SERIAL" shell am start -a android.intent.action.VIEW \
      -d "$link" "$app" >/dev/null 2>&1
  return 0
}

# ── THE RULE THAT MAKES THIS A RIG AND NOT A HAZARD ─────────────────────────
# Karwan's rig seeds and resets its database safely, because its dev data is
# fixtures. OURS IS HIS REAL MULTIMAGIC — his notes, contacts, loans, expenses
# and calendar. There is nothing to reset and everything to lose.
#
# So this must stay empty, and the doctor FAILS rather than warns if it is ever
# set. A warning is something people learn to scroll past.
QA_SEED_CMD=""

# QA signs in as a dedicated test account, never the owner's: a run signed in as
# him writes conversations into his real assistant history. Values live in .env,
# which is gitignored — never in this file, never in a commit, never in a doc.
[ -f "$(dirname "${BASH_SOURCE[0]}")/../.env" ] && {
  set -a; . "$(dirname "${BASH_SOURCE[0]}")/../.env"; set +a
}
