#!/usr/bin/env bash
#
# Upload the latest iOS build to App Store Connect.
#
# WHY THIS SCRIPT EXISTS, rather than just `eas submit`:
#
# `eas submit --non-interactive` refuses to SET UP an App Store Connect API key
# -- "App Store Connect API Keys cannot be set up in --non-interactive mode" --
# and there is no CLI flag to hand it one. It will only read the key from the
# submit profile in eas.json.
#
# But this repo is PUBLIC, and those fields identify the owner's Apple account.
# Worse, Apple names the key file AuthKey_<KEYID>.p8, so even `ascApiKeyPath`
# discloses the key id -- the safe-looking half of the rule is the half that
# leaks.
#
# So eas.json stays clean in git, and this script injects the three fields for
# the duration of one command and restores the file on the way out, including
# on failure or Ctrl-C. The tracked file is never left dirty.
#
#   export EXPO_ASC_API_KEY_PATH=~/.appstoreconnect/AuthKey_XXXXXXXXXX.p8
#   export EXPO_ASC_KEY_ID=XXXXXXXXXX
#   export EXPO_ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
#   ./scripts/submit-ios.sh [--latest | --id <buildId>]
#
set -euo pipefail
cd "$(dirname "$0")/.."

for v in EXPO_ASC_API_KEY_PATH EXPO_ASC_KEY_ID EXPO_ASC_ISSUER_ID; do
  [ -n "${!v:-}" ] || { echo "missing $v -- see docs/APP_STORE_CONNECT.md section 0" >&2; exit 2; }
done
KEY_PATH="${EXPO_ASC_API_KEY_PATH/#\~/$HOME}"
[ -f "$KEY_PATH" ] || { echo "no key at $KEY_PATH" >&2; exit 2; }

BACKUP="$(mktemp)"
cp eas.json "$BACKUP"
restore() { cp "$BACKUP" eas.json; rm -f "$BACKUP"; }
trap restore EXIT INT TERM

python3 - "$KEY_PATH" <<'PY'
import io, json, sys
d = json.load(open("eas.json"))
d.setdefault("submit", {}).setdefault("production", {}).setdefault("ios", {}).update({
    "ascApiKeyPath": sys.argv[1],
    "ascApiKeyId": __import__("os").environ["EXPO_ASC_KEY_ID"],
    "ascApiKeyIssuerId": __import__("os").environ["EXPO_ASC_ISSUER_ID"],
})
io.open("eas.json", "w", encoding="utf-8").write(json.dumps(d, indent=2) + "\n")
PY

# stdin closed and no pipe on purpose: a pipe here took stdin and left the last
# submission asleep for 24 minutes (docs/TESTING.md section 17).
npx eas submit -p ios --profile production --non-interactive "${@:---latest}" < /dev/null
