# The QA rig contract — multimagic-mobile must never disturb Karwan

Hamma9900, 2026-09-18: *"for qa test karwan and mm should not disturb each
other, both should launch its own, it's important man. Remember the setting in
hatiwal for wifi and hotspot — in weekend i use hotspot, so same should be for
karwan and mm."*

Two instructions. The first is an allocation; the second is a rule Hatiwal
already solved and both apps inherit.

---

## 1 · THE HOTSPOT RULE — `10.0.2.2`, always, and never a LAN IP

From `hatiwal-mobile/qa/QA_HANDBOOK.md:1453` and `qa/lib/common.sh:99`:

> From inside an Android emulator, **`10.0.2.2` IS the host.** It does not change
> between office WiFi and a home hotspot, and it works with no network at all.
> This machine moves between networks, and a **stale LAN IP makes every request
> fail in a way that looks exactly like an app bug.**

**He switches to a hotspot at weekends.** That is the whole reason this rule
exists — a LAN IP written on Friday is wrong on Saturday, and the symptom is a
screen that looks broken rather than a network that has moved.

So, in both apps:

| variable | value | who uses it |
|---|---|---|
| `HOST_IP` | **`10.0.2.2`** — never a LAN IP, never `localhost` | the emulator, and therefore the app |
| `API_URL` | `http://10.0.2.2:<port>/api/v1` | the app |
| `API_URL_LOCAL` | `http://localhost:<port>/api/v1` | **the shell**, because a shell cannot reach `10.0.2.2` — that address means something only inside the emulator |

**Metro must agree, because it inlines `EXPO_PUBLIC_API_URL` at build time.**
Starting Metro without `HOST_IP` set bakes the wrong address into the bundle,
and no amount of reloading fixes it.

**A real phone on the same hotspot is the one case that needs a LAN IP** — and
that value is machine-local and belongs in `.env`, never tracked. `10.0.2.2`
stays the tracked default precisely because it is the same on every machine and
every network.

## 2 · THE ALLOCATION — one of everything each, nothing shared

Karwan's rig owns `qa_phone`, `qa_tablet`, Metro **3028** and API **3017**
(`karwan-mobile/qa/qa.config.sh:48,49,60,78`). **This app takes its own of
each:**

| | Karwan | **multimagic-mobile** |
|---|---|---|
| phone AVD | `qa_phone` | **`qa_phone4`** (was `qa_phone2` — see below) |
| tablet AVD | `qa_tablet` | `qa_phone3`, resized — only when a wide reading is needed |
| Metro port | 3028 | **3029** |
| API port | 3017 (karwan-api) | **3001** (multi_magic) |
| scheme | `karwan` | `multimagic` |
| app id | `com.karwan.app` | its own |

**The AVD line is the one that has already gone wrong once.** On 18 September
this session booted **`qa_phone`** — Karwan's — and then reported it as
*"Karwan's tablet"*. Two sessions on one AVD means one installs over the other,
and neither can tell whose state it is looking at. **An AVD of our own exists on this
box already; use it.**

### The phone AVD moved to `qa_phone4` — 2026-09-21

`qa_phone2` wedges on `Application Not Responding: com.android.systemui` within
minutes of booting, every time. Four boots in one evening: windowed at
`-memory 2048` and headless at `-memory 3072`, host load average 9.5 on the
first and 4.6 on the last, free RAM 2.4 GB at worst and 15 GB at best, `pswpin`
flat throughout. It ANR'd in all four, and preflight PASSED twice in between —
reachable, then not, before a flow could assert anything. A full sweep went
**0 PASS, 0 FAIL, 24 NOT MEASURED**.

Host CPU, host RAM, orphaned Metro instances and GPU cost were ruled out first
(`-no-window` changed nothing; it ANR'd at load 4.6 as readily as at 9.5).

**He chose a different device rather than a wipe**, so `qa_phone2` keeps its
state and stays available to anybody who wants to diagnose it. It is NOT ours
any more and should not be booted as though it were. `qa_phone3` (32 MB, never
started) is the fallback if `qa_phone4` fails the same way — but see the next
paragraph before reaching for it.

**`qa_phone4` wedged identically, so the fault is shared.** Booted clean, Expo
Go 54.0.8 installed from `~/.expo/android-apk-cache/`, **preflight PASSED** —
and SystemUI ANR'd within minutes of the first flow, exactly as `qa_phone2`
does. A third AVD was NOT tried, because two failing the same way answers a
different question than a third would.

**What they share**, and it is the whole finding:

| | |
|---|---|
| system image | `system-images/android-35/google_apis/x86_64/` — **identical on both** |
| and on | `qa_phone` (Karwan's) and `qa_edu_phone` too |
| emulator | 36.6.11.0 (build 15507667) |
| KVM | present, `/dev/kvm` readable, 32 CPU virt flags |

Ruled out by measurement rather than by argument: host CPU (ANR at load 4.6 as
readily as at 9.5), host RAM (14.5 GB available at the last attempt, `pswpin`
zero), GPU window cost (`-no-window` identical), and the memory setting (2048
and 3072 identical).

**The one thing not yet varied is the system image**, and an alternative is
already installed: `android-35/google_apis_playstore/x86_64`, which
`hatiwal_play` uses. That is the next experiment — a new AVD on the *playstore*
image — and it is a different move from "try another AVD on the same image",
which is what has now failed twice.

Worth telling Karwan's side: their `qa_phone` runs the same image, so if their
rig starts wedging, this is why and it is not their app.

**Name the AVD in every report.** `pgrep -af qemu-system` prints `-avd <name>`,
and it settles in one line whose device is up. *"An emulator is running"* is not
an observation.

**Each session takes its own emulator — 2026-09-21, his instruction**, rather
than queuing on a shared one. That relaxes "one at a time"; it does NOT relax
the ceiling, which is his own measurement rather than a guess: **two on this box
is safe, three is fatal.** A third is not available for any reason, however
good, and the answer to "I only need it for a minute" is still no.

**And the memory envelope is still one device each, two at most, never three** —
his own measurement, and this box hard-rebooted from exhaustion on 15 September.
Two apps with their own AVDs does not mean two AVDs at once whenever you like:
measure available RAM and the `pswpin` **rate** at the moment you boot, and
ask Hamma9901 if the second one would take it under 4 GB.

## 3 · THE RULE THAT IS ONLY OURS: **NEVER SEED THE MULTIMAGIC DATABASE**

Karwan's rig resets its own database — `qa.sh seed` runs
`db:seed:reset_e2e` — and that is safe, because Karwan's dev data is fixtures.

**This app's backend is his REAL MultiMagic**: his notes, his contacts, his
loans, his expenses, his calendar. There is nothing to reset and everything to
lose.

- **`QA_SEED_CMD` must be empty**, and the doctor should **fail** rather than
  warn if it is ever set.
- **QA runs use a dedicated test account**, never the owner's own account. A
  run signed in as the owner would write conversations into his real assistant
  history, and a delete test would delete his real records. The test account's
  address and id live in `.env` (untracked), never in this file — this repo is
  public.
- **No test may call account deletion against a real account.** When that
  endpoint exists, the deletion flow is exercised against a throwaway user and
  nothing else.

That third point is why this file exists at all: the instruction was *"do not
disturb each other"*, and the worst thing either app could disturb is not the
other app.

---

## 4 · THE BACKEND IS BROUGHT UP BY THE RIG, AND TWO THINGS ARE NEVER DONE TO IT

His instruction, 2026-09-19: *"for both Karwan and MultiMagic, always use
Docker Compose."*

One honest distinction first, because pretending otherwise would be a gesture
rather than a practice: **there is no service in this repo to containerise.**
This is an Expo app. Metro and an Android emulator do not sensibly live in
Docker, and a Dockerfile here would be a file that exists to satisfy a sentence.

What the instruction means for the rig is real and was missing: **a run must
never depend on a human having remembered to start the API.** `multi_magic` is
already fully composed — web, cable, worker, postgres, redis — so
`qa/preflight.sh` brings it up itself from `$MM_COMPOSE_FILE` (configurable;
the two repos sit side by side on this box and may not elsewhere), waits by
**polling `/up` and the compose health checks rather than sleeping**, and when
it cannot, **names the service that is down** instead of saying "API not
reachable" and sending the next person to look at the app.

### 4a · Never `docker compose down -v`, anywhere on this box

Not in this repo, not in `multi_magic`, not in Karwan's. A volume on this
machine is the only copy of real data. Nothing under `qa/` issues a `down` of
any kind: the only verbs are `up -d`, `ps`, `logs` and a read-only `exec … psql`.

### 4b · Never let the rig migrate `multi_magic_development`

This one is not hypothetical, and it is not visible from the outside. The
`web` service's own command in `docker-compose.yml` is

```
bundle install && bin/rails db:prepare && bin/rails server -b 0.0.0.0
```

so **starting the stack migrates**, and the database it migrates is
`multi_magic_development` — his real notes, contacts, loans and calendar. A
migration a sibling landed and nobody applied would be applied by a rig at 3am
with nobody watching.

So preflight brings up **postgres and redis only**, waits for their health
checks, and compares **every file in `db/migrate/` against `schema_migrations`**
before `web` is allowed to start. Any pending migration is a **FAIL** that names
the files and stops there. A human runs migrations against that database; a QA
rig never does.

*(Every version, not `max(version)`: a migration numbered below the newest
applied one is exactly the case a high-water mark misses.)*

The rig also touches nothing when the backend is **already answering** — `up -d`
on a running stack can recreate a container under whoever is using it, and there
is nothing to gain.
