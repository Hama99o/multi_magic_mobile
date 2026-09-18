# QA handbook — why this rig is shaped like this

Commands are in `qa.sh --help`. This file is the reasoning: what each
convention exists to prevent, and which bug already paid for it.

## The exit codes are the contract

```
0  measured, everything passed
1  measured, something failed        <- a finding
3  NOT MEASURED (preflight blocked)  <- not a finding at all
```

**3, not 1.** A box with no emulator, no Metro or no backend has not found a
bug; it has found nothing. Collapsing the two is how a green gets invented and a
red gets misread, and the exit code is the first thing any caller sees.

## Two addresses for one host

The **app** reaches the backend at `10.0.2.2` — the emulator's alias. It is the
same on every machine *and every network*, so it survives the switch to a
weekend hotspot and works with no network at all. A stale LAN IP fails in a way
that looks exactly like an app bug.

A **shell** cannot use `10.0.2.2`; that alias only exists inside the emulator.
So anything checking "is the backend up?" uses `API_URL_LOCAL`.

**And the same trap has a second door, which cost a whole suite.** The deep link
is `exp://127.0.0.1:<metro>`, and from inside the emulator `127.0.0.1` is *the
emulator*. `expo start --android` quietly sets up the `adb reverse` that makes
it work; starting Metro on its own does not. Expo Go then fails with "Failed to
download remote update", drops to its own error screen, and **every flow fails
on `sign-in-email is not visible`** — an assertion pointing at our screen while
blaming entirely the wrong thing. The preflight now checks it and repairs it.

## The rig may never seed or reset the database

Karwan's rig seeds safely because its dev data is fixtures. **Ours is the
owner's real MultiMagic** — his notes, contacts, loans, expenses and calendar.
There is nothing to seed and everything to lose. `QA_SEED_CMD` stays empty and
the doctor **fails** rather than warns if it is ever set, because a warning is
something people learn to scroll past.

For the same reason QA signs in as a dedicated test account, never the owner's:
a run signed in as him writes conversations into his real assistant history.
Credentials live in `.env` only — never a doc, a spec, a fixture or a commit.

## Our device, and only ours

`qa_phone`/`qa_tablet` belong to karwan-mobile. Two sessions on one AVD means
one app installs over the other and neither can tell whose state it is looking
at. Ours is `qa_phone2` on port 5556, Metro on 3029.

**Name the AVD whenever you report one.** `pgrep -af qemu-system | sed -n 's/.*-avd \([A-Za-z0-9_]*\).*/\1/p'`
settles in one line a question that otherwise gets arbitrated in messages.

## A screenshot is evidence; a passing tree is not

The rule that paid for this rig: a sign-in screen passed 70 unit tests, `tsc`,
a bundle and a boot **with no visible button**. NativeWind's interop drops a
*function* style on `Pressable`, so the button lost its background, height,
padding and centring at once and rendered as white text on a light ground.
Every instrument was green and every one was reading a true thing about the
wrong subject. So every flow ends in a screenshot, and the screenshot is the
artefact.

## Change one thing, wait, read it back

Changing `wm size`/`wm density` under a running app ANR'd SystemUI twice and
produced a layout that *looked* broken at 360 dp — a bubble overflowing, an icon
gone. A cold relaunch at the same density rendered perfectly. Set once, wait,
**read the value back**, relaunch, then judge. Without that discipline the first
finding of the day would have been a bug report about code that was fine.

## Match the severity marker, not the tag

The first run reported five "runtime errors" that were the `am` command's own
startup lines: the grep matched `AndroidRuntime`, which is a tag, not a
severity. It matches `E AndroidRuntime` and `FATAL EXCEPTION` now. A rig that
cries wolf is a rig whose output gets skimmed.

## Stage individual paths — a directory is not a path

Three sessions share this repo and all three swept each other's in-flight work
into their own commits today. `git add -A` was the first cause; the fix looked
obvious, and the obvious fix was not enough.

**`git add qa/flows` took another session's three new flows with it.** A
directory is not a path — it is *a set that grows*, so staging one stages
whatever anybody else put in it since you last looked. Name every file:

```sh
git add qa/run.sh qa/preflight.sh qa/QA_HANDBOOK.md    # yes
git add qa/ ; git add -A ; git commit -a               # no, no, no
```

And check what actually staged before writing the message — `git diff --cached
--name-only` — because the difference between what you meant to stage and what
you staged is exactly the thing this rule exists to catch.

The cost is not only tidiness. One sweep put a personal email address into a
public repo. Another **hid a session's finished work from the session chasing
it** — the header icons existed for half an hour while being asked for twice,
because they had been committed under somebody else's name.
