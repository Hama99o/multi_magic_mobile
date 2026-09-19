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

# Expo Go, because dictation's native module needs a dev build we do not have.
# The app is reached by deep link rather than by launching a package of its own.
APP_ID="${APP_ID:-host.exp.exponent}"
DEEP_LINK="${DEEP_LINK:-exp://127.0.0.1:$METRO_PORT}"

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
