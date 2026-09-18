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

## React Native caches window dimensions at startup

Both MultiMagic sessions measured the same phantom 360 dp bug — content
overflowing right, the gutter gone, the composer clipped — and both were
measuring their own `wm density` change rather than the app. **RN reads the
window once at startup**, so a density changed underneath it leaves every
layout computed against the old one.

**Force-stop and relaunch after every `wm density` or `wm size`, then judge.**
Two sessions lost the same hour to this on the same evening; it belongs beside
the `adb reverse` note because it is the same shape — an instrument reporting
truthfully about a state that no longer exists.

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

## The device claim — and a claim is on the DEVICE, not on the AVD

`./qa/qa.sh claim <session> [why]` · `release <session>` · `claims`

Ported from `karwan-mobile/qa/qa.sh:453`, which claims *features* so a fleet can
sweep without duplicating work. Same mechanism — a `flock` around a
read-modify-write on a shared file — different subject.

**"Released" has to mean free for ANYBODY, including the other app.** That is
the distinction that cost an hour on 18 September: a release was read as "this
app has finished with it", when there is **one emulator at a time on this box**
(`RIG_CONTRACT.md` §2), so a claim held by multimagic blocks Karwan exactly as
hard as it blocks the other multimagic session. One device, one lock, and the
lock does not know which repo you are in.

**Blocked is exit 3, never 1.** Somebody else holding the device means you
measured nothing. That is not a failing test, and counting it as one is how a
quiet evening turns into a bug report about a feature nobody ran.

### Two traps this encodes, both paid for on 18 September

**`pgrep -f <word>` matches the watcher looking for the word.** A shell running
`until ! pgrep -f maestro` *is* a process whose command line contains
`maestro`, so it finds itself and waits for ever — and a kill loop built on it
kills its own shell. Four "maestro processes" were counted that evening and all
four were the watcher. **For a JVM, ask `ps -eo comm= | grep -c '^java$'`**,
which matches the executable name and cannot match the question.

**Liveness here is a timestamp, not a process check.** `qa.sh claim` exits
immediately, so the claiming PID is dead long before anybody looks — `kill -0`
would free every claim the instant it was taken. A claim older than
`CLAIM_TTL_MIN` (45 minutes) is broken with a warning on stderr rather than
honoured for ever by a session that has gone.

### And one for the screenshots

**Force-stop and relaunch after every `wm density` change.** React Native reads
the window dimensions at startup and caches them, so changing density under a
running app leaves JS laying out for the old width: content overflows right, the
gutter vanishes and the composer clips. On 18 September that was measured as a
360 dp layout bug and a fix was already being written before a cold restart
showed the layout was correct all along. Same class as the `adb reverse` trap —
the app is fine and the rig is lying.

## Expo Go was the harness's problem, not the app's

Three of the evening's harness faults were one cause wearing different clothes,
and all three vanish with a development build:

| Under Expo Go | Why |
|---|---|
| Deep link resolved to the emulator | `exp://127.0.0.1:<port>` needs `adb reverse`; the app is reached by URL rather than by launching |
| The dev menu covered the screen and swallowed taps | Expo Go's menu, not ours |
| Back exited the app; `openLink …/--/chat` left the project | Navigation belongs to Expo Go's experience host, not to expo-router |
| Dictation could never be witnessed | Expo Go carries no custom native modules, so `expo-speech-recognition` is simply absent |

**A development build has its own package** (`co.byseven.multimagic`), so
`launchApp` launches OUR app, Back behaves the way expo-router intends, there is
no dev-menu overlay in front of the UI, and the speech module is in the binary.

`npx expo prebuild --platform android` then `./gradlew assembleDebug`. `android/`
is generated and gitignored — it is build output, not source, and prebuild
regenerates it from `app.json` whenever the config changes.

**The sibling predicted its own `06-people-chat` would hit the Back-exits-root
wall before running it.** If it does, that is not a new bug: it is this one, and
the fix is the build rather than a fourth harness patch. A prediction on the
record before the fact is worth more than a diagnosis after it.

## `pgrep -f` matches the watcher looking for the thing

`until ! pgrep -f maestro; do sleep 15; done` never exits: the shell running it
has "maestro" in its own command line, so it finds itself and waits for ever.
A kill loop built on the same pattern kills its own shell — twice, tonight, in
this session, and it also produced a report of "four Maestro processes" when
none was running.

For a JVM ask for the executable name, which cannot match the question:

```sh
ps -eo comm= | grep -c '^java$'
```

Narrow patterns are still fine — `pgrep -f "expo start --port 3029"` cannot
match a watcher unless the watcher quotes it exactly.
