#!/usr/bin/env bash
# DOES SWITCHING A CHAT ON THE PHONE TELL THE SERVER?
#
# The one thing `docs/SESSION_PARITY.md` found and the one thing no flow can
# assert, because the evidence is not on this device.
#
# `Ai::Sessions.current` is `remembered || list.first || create`, and
# `remembered` reads `users.data->>'ai_session_id'`. Only two things write it:
# `POST /ai/sessions/:id/activate`, and `ai#show` — asking a question. Mobile
# had only the second until `3088fd2`, so switching a chat and putting the
# phone down left every other client opening the chat you left.
#
# ── WHAT THIS PROVES, AND WHAT IT DOES NOT ───────────────────────────────
# It proves **the write happened**: the column now holds the id that was
# chosen on the phone. That is exactly the thing that was missing.
#
# It does **not** prove the other device behaves — nothing here opens a
# browser, and a laptop reading that column correctly is the web's behaviour,
# not mobile's. Two clients would prove that; this proves mobile's half. The
# distinction is why the audit found the gap at all: the missing call had no
# symptom on the device performing it, and a test that could only look at the
# phone would have been green throughout.
#
# ── WHY A READ AND NOT A SECOND CLIENT ───────────────────────────────────
# `RIG_CONTRACT.md` permits a read-only `psql` exec and nothing else. A
# browser session against the same backend is outside the rig's half and
# outside anybody's contract here. This costs one query.
#
# ── SAFETY ───────────────────────────────────────────────────────────────
# Read-only: one `select`, no write of any kind. Against the **QA account**,
# whose address is in the gitignored `.env` and nowhere else — never his.
# Nothing is seeded, migrated or deleted, and the script refuses rather than
# guesses if it cannot identify the QA user.
#
# ── STATUS: WRITTEN, NEVER RUN ───────────────────────────────────────────
# Authored by the session holding the code half; the device is another's.
# `docs/TESTING.md` §6 — until it executes it is worth nothing. Whoever runs
# it should record the verdict, and **say which id it saw**, not just that it
# changed.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. "$DIR/qa.config.sh"

MM_DIR="${MM_DIR:-$HOME/Apps/Personal/multi_magic}"
compose(){ docker compose -f "$MM_COMPOSE_FILE" "$@"; }

# `|| true` because a grep that finds nothing is not an error here — without
# it, `set -euo pipefail` killed this script before it reached the
# `${VAR:-default}` fallbacks on the very next lines, with exit 1 and NO
# OUTPUT. Silent death is the least debuggable failure available to a check
# whose whole job is to report something. Found and fixed by the session
# running it; `docs/TESTING.md` §14 has why I wrote it that way.
#
# ── AND THE REASON IT FOUND NOTHING WAS NOT WHAT IT LOOKED LIKE ──────────
# It is not that `.env` lacks the variables. **It sets both, twice each** —
# as `export POSTGRES_USER=…`. The anchor `^POSTGRES_USER=` cannot match a
# line beginning `export `, so the read was dead and the default was doing
# all the work. It happens to be the right default, which is exactly why
# nobody noticed: `qa/preflight.sh:162-163` has the identical anchor and its
# migration guard has been passing on the fallback for as long as it has
# existed.
#
# That matters beyond tidiness. If the real user or database ever stopped
# matching the default, `q()` would fail, `2>/dev/null` would hide it, `uid`
# would come back empty, and this script would report **"no user matches
# QA_EMAIL"** — blaming the QA account for a connection it never made.
# `optional_env` matches both spellings, and the connection is checked
# separately from the lookup below so the two failures cannot be confused.
optional_env(){ grep -m1 -E "^(export )?$1=" "$MM_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"'\''\r' || true; }
PGUSER_MM="$(optional_env POSTGRES_USER)"
PGDB_MM="$(optional_env POSTGRES_DB)"

q(){ compose exec -T postgres psql -U "${PGUSER_MM:-multi_magic}" \
       -d "${PGDB_MM:-multi_magic}_development" -tAc "$1" 2>/dev/null | tr -d '\r' | head -1; }

# Can we talk to the database at all? Asked on its own, because every failure
# below this line would otherwise arrive disguised as "no such user".
if [ "$(q 'select 1')" != "1" ]; then
  echo "NOT MEASURED — cannot read the database as '${PGUSER_MM:-multi_magic}' on"
  echo "'${PGDB_MM:-multi_magic}_development'. That is a connection problem, not a finding."
  exit 3
fi

if [ -z "${QA_EMAIL:-}" ]; then
  echo "NOT MEASURED — QA_EMAIL is not set. It lives in .env and nowhere else."
  exit 3
fi

# The QA account, by the address in .env. Quoted through psql's own quoting so
# an address with an apostrophe cannot become SQL.
esc="${QA_EMAIL//\'/\'\'}"
uid="$(q "select id from users where email = '$esc'")"
if [ -z "$uid" ]; then
  # Refuse rather than fall back to "the first user", which on this machine is
  # HIS account. RIG_CONTRACT.md §3.
  echo "NOT MEASURED — no user matches QA_EMAIL. Refusing to guess which account to read."
  exit 3
fi

before="$(q "select data->>'ai_session_id' from users where id = $uid")"
echo "QA user $uid · ai_session_id before: ${before:-<unset>}"
echo
echo "NOW, ON THE PHONE: open the conversations sheet and tap a DIFFERENT chat."
echo "Do not ask a question — asking is the other thing that writes this column,"
echo "and it would prove the wrong half."
echo
read -r -p "Press Enter once you have switched, and type the id you chose: " chosen

after="$(q "select data->>'ai_session_id' from users where id = $uid")"
echo "ai_session_id after:  ${after:-<unset>}"

if [ -n "$chosen" ] && [ "$after" = "$chosen" ]; then
  echo "PASS — the server was told, and it holds the id chosen on the phone."
  exit 0
fi
if [ "$after" != "$before" ]; then
  echo "PARTIAL — the column changed to '$after' but '$chosen' was expected."
  echo "Worth reading before calling it a pass: something wrote it, possibly not the tap."
  exit 1
fi
echo "FAIL — the column did not change. Switching did not reach the server."
echo "That is the defect 3088fd2 fixed; on a build older than it, this is expected."
exit 1
