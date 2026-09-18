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
AVD="${AVD:-qa_phone2}"
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
DEV_BUILD_ID="${DEV_BUILD_ID:-co.byseven.multimagic}"

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
