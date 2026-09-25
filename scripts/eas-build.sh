#!/usr/bin/env bash
# `eas build`, behind the release guard. Use this, not `eas build` directly.
#
#   ./scripts/eas-build.sh -p ios --profile production --non-interactive
#
# The guard (scripts/release_guard.js) is also wired as the EAS
# `eas-build-pre-install` hook, but Expo's docs do not say a failing hook
# fails the build, so that layer is UNVERIFIED. This one is certain: the guard
# runs HERE, on this machine, before anything is uploaded, and `set -e` stops
# the script if it refuses. Belt and braces; the hook stays.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/release_guard.js
exec eas build "$@"
