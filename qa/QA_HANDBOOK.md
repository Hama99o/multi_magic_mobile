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

## The backend starts itself — and the one thing that stops it

His instruction: *"for both Karwan and MultiMagic, always use Docker Compose."*
There is nothing in **this** repo to containerise — an Expo app is Metro and an
emulator, neither of which sensibly lives in Docker. What it means here is that
**a run never waits on a human having started the API.**

`preflight.sh` brings `multi_magic` up from `$MM_COMPOSE_FILE` when `/up` does
not answer, polls the health checks rather than sleeping, and on failure names
the service that is down — `web is not running` sends you somewhere; "API not
reachable" sends you to the app, which is the wrong place.

Two things it will not do, both in `RIG_CONTRACT.md` §4:

- **No `docker compose down -v`, anywhere on this box.** A volume here is the
  only copy of real data. The rig's only verbs are `up -d`, `ps`, `logs` and a
  read-only `psql`.
- **It will not migrate his development database.** The `web` service's command
  is `bundle install && bin/rails db:prepare && rails server`, so *starting the
  stack migrates* — against `multi_magic_development`, which is his real data.
  So postgres and redis come up first, every file in `db/migrate/` is checked
  against `schema_migrations`, and a pending migration is a **FAIL that names
  the files** with `web` left stopped. A human runs those; a rig never does.

**If preflight stops with pending migrations,** that is not a rig fault and not
something to work around. Tell whoever landed the migration. Applying it is a
decision about his real records.

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

## A development build needs `expo-dev-client` as a DEPENDENCY

`npx expo prebuild` + `./gradlew assembleDebug` produces an APK either way, and
without `expo-dev-client` in `package.json` what it produces is a **plain React
Native debug app**, not an Expo dev client. That app loads
`index.android.bundle` with entry `./index` — and this is an expo-router
project whose entry is `expo-router/entry`, so Metro 404s and the device shows
"Unable to load script."

The symptoms point everywhere except the cause. In order, it looked like:

1. a port problem (the app asks for 8081; our Metro is on 3029);
2. a Metro-mode problem (`--dev-client` not passed);
3. an intent-timing problem (`onNewIntent while context is not ready`).

All three are real observations and none is the fault. Karwan's `package.json`
has `expo-dev-client`; ours did not, and nothing in the build says so — the APK
builds, installs and launches, and only fails when it tries to fetch JS.

**Check the dependency before debugging the transport.** And note the APK is
~188 MB and the build costs ~8 GB of disk, so it is not a thing to rebuild
casually while the box is at 96%.

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

## A check that returns SOME of the answer is the hardest kind to doubt

`docs/TESTING.md` §10 separates a gate that under-reports from one that
over-reports, and asks which way the error runs. This is one level inside the
first of those, and it is about how convincing the output is rather than which
direction it points.

**2026-09-19, the `ICON` check.** It detects handles sitting on a lucide icon,
which hand their `testID` to both the wrapper and the `Svg` inside — one
handle, two nodes. Three exist in this app: `event-repeats`,
`session-scoped-*` and `session-instructed-*`.

The first version found **one**. Its brace pattern was flat — `\{[^}]*\}` —
so it stopped at the `}` inside `${session.id}` and both template handles fell
out. It then printed a result, cleanly, with no error:

    handles that sit on an icon: ['event-repeats']

**A zero would have made me look. A one made me believe it.** An empty result
reads as "the check did not work"; a partial result reads as "the check
worked, and this is the answer". Nothing about the output distinguishes
one-of-three from three-of-three, and the plausible number is the one that
stops the investigation.

It was caught by planting a flow that tapped the handle and watching the check
fire — the practice from `TESTING.md` §2, applied to a check rather than to a
test. Planting also forced the question "fire on *which* of the three?", which
is the question that found it.

**So: when a check reports a count, ask what the count should be before
reading what it is.** For this one the answer was knowable from the source in
about ten seconds. The risk is not that a check returns nothing; that announces
itself. The risk is that it returns something.

*(The same day, four instruments in this repo and its siblings were each right
about their own question and silent about the one being asked: a locale parse
that read `en.ts` line by line, a literal check comparing two disjoint
languages, a picture pass that photographed a layout it had disturbed itself,
and a backward handle walk that had never been run at all. Three of the four
produced output the whole time.)*

## Cleanup that only runs on the happy path is not cleanup

Two instances in one session, one layer apart, and the shape generalises past
this repo.

**A flow that tidies after itself still fills the account when it fails
early.** `19-session-options` creates a conversation named `QA options target`
and deletes it through the real confirm as its **last** step. That is correct,
and it changed nothing: the flow failed five times on steps in the middle, and
each failure left one behind. **Nine had accumulated before anybody noticed**,
on an account whose cap is fifty. This is `04`'s hazard — the one the register
already warns about — arriving through a flow that does everything right.

**A pass that restores state as its last step leaves it wrong when it is
killed.** `qa/screens.sh` switched the app to French, shot, and switched back.
A run killed mid-French left the QA account in French, and the next flow then
failed looking for *"Options for New chat"* — because that label is
`t()`-translated while the row's title is the server's untranslated
`DEFAULT_TITLE`. A language problem surfacing as a missing menu, with nothing
in the failure pointing at the cause. It cost a diagnosis.

**The remedy is the same both times and it is structural, not diligence.**
Restoration belongs in a trap, or in the *next* run's setup, or in a cleanup
that is idempotent and cheap enough to run unconditionally — anywhere except
the end of the happy path. `screens.sh` now restores in its `EXIT` trap, which
fires on a kill as well as on a return, and says so when it cannot.

The general form: **if the only thing that undoes your side effect is the last
line of the thing that caused it, the side effect is permanent for every run
that does not reach that line** — and the runs that do not reach it are
exactly the ones that went wrong, which is when a dirty account hurts most.

## A flow that writes and never cleans up has a verdict that depends on its own history

The section above is about cleanup that does not run. This one is about
cleanup that was never written, and it is worse, because the flow keeps
passing while the damage accumulates.

**Two symptoms, 2026-09-21 and 22, and they are one bug.** `06-people-chat`
sends the constant string `[qa] automated test message` and removes nothing.
On the seventh run the live tree held **seven `msg-*` elements, six carrying
that identical accessibility label**, one per previous run. `msg-mine-.*`
matches all six, Maestro picks one, and by then the one it picks has scrolled
off the screen. `15-sessions-switch` creates a conversation called `QA switch
target` and later asserts it is gone — against an account that still holds one
from an earlier run, so the assertion fails before the test begins.

The general property is worth stating on its own, because it is not "these two
flows are dirty":

> **A flow that writes to a live server and never removes what it wrote has a
> verdict that depends on how many times it has been run before.**

That is a worse property than failing outright. It **passes early and fails
later**, so the failure arrives detached from the change that caused it — which
is nobody's change, because nothing changed. Both times, the first reading was
that the app had regressed. Twice I reported a cause that was wrong, and the
wrong cause reached the board. A flow like this does not just fail; it
**manufactures false defect reports about the product**.

**The rule, and it is a fork, not a preference.** Every flow that creates data
does one of two things, and says in its header which:

- **Removes it**, structurally — not as the last line of the happy path. See
  the section above for why that distinction is the whole of it.
- **Makes what it creates unique per run and addresses it by that
  uniqueness.** A constant string is not a selector; it is a selector that
  works once. `evalScript` can stamp a run id, and the value is then usable in
  both the `inputText` and the selector that finds it again.

Uniqueness is the stronger of the two, because it survives the run being
killed. Removal alone does not.

### The audit, so the next session greps for a shorter list

All 24 files `flow_lint` counts — 22 flows and 2 helpers — read on 2026-09-22
for what they commit to the server. The answer to "is it only 06 and 15" is **no**, and
the shape of the rest is the useful part.

**Accumulates, no cleanup at all — the defect above:**

- `06-people-chat` — a constant message, sent. **Confirmed breaking the flow.**
- `01-ask` — sends `Do I owe anyone money?` to **the QA account's** standing
  conversation and never removes it: one question and one real AI answer per
  run, without bound. Not his account — `run.sh` and `qa.sh` export `EMAIL`
  from `QA_EMAIL`, and the standing rule holds. Saying "his" here, as an
  earlier draft of this line did, was one relay from reaching his board as
  *"the tests are writing into your account"*: alarming, false, and the same
  shape as the five causes below — a sentence that was nearly right, written in
  passing, then read as fact. Not failing yet. Note what it has already
  caused, though — `15`'s own header *depends* on that conversation being
  non-empty ("every `01-ask` run adds to it"), so a flow is already resting an
  assertion on another flow's residue. That is the dependency this rule exists
  to forbid, and it is already written down as design.

**Creates and removes, but only on success — and with a constant name, so an
aborted run poisons the next one:** `04-delete-conversation` (`QA delete
target`), `15-sessions-switch` (`QA switch target`, `QA switch other`),
`19-session-options` (`QA options target`). The previous section already has
these; the constant name is the second ingredient, and uniqueness fixes both at
once.

**Writes, but overwrites rather than appends:** `13-profile` sets the first
name and the About text to the same values every run, so nothing grows. It does
hold **the QA account's** profile at a rig-written string and never restores it
— which is a decision, not a defect, and it is now stated in that flow's
register row rather than left to surprise whoever next opens that account.

**A side effect outside the database:** `11-forgot-password` submits the real
form, so a password-reset email reaches the QA mailbox on every run.

**Types but never commits, and this is deliberate in each case** — worth
recording so nobody "fixes" one into writing: `02-sign-in` (wrong credentials
on purpose), `03-dictation` and `09-keyboard` (type into the composer, never
press send — `09` clears it), `10-sign-up` (signs up with the QA address, which
already exists, so it cannot create), `14-change-password` (the final submit
carries a deliberately wrong *current* password, so the password never
changes), `16-ai-keys` (an invalid key the provider rejects before it is
saved).

**Reads only:** `05-upload` (opens the attach sheet, never picks a file),
`07`, `08`, `12`, `17`, `18-delete-account` (opens and never confirms), `20`,
`99`, `signed-out`, and both helpers.

## What a Maestro selector actually matches — read out of the jar, not guessed

Answering "does `id:` plus `text:` compose the way I assumed?" from
`~/.maestro/lib` rather than from another emulator boot. Maestro 2.7.0,
`javap` on `maestro-client.jar` and `maestro-orchestra.jar`. Four facts, each
checkable the same way:

- **Several keys on one selector are an AND, over the same node set.**
  `Orchestra.buildFilter` collects one filter per key and combines them with
  `Filters.intersect`, which applies each to the *same* input list and
  set-intersects the results. So `id:` + `text:` means one element satisfying
  both, not two elements.
- **`id:` reads `resource-id` and nothing else** (`Filters.idMatches`). On
  React Native Android that is `testID`.
- **`text:` reads three attributes and unions them**: `text`, `hintText` and
  **`accessibilityText`**, which `AndroidDriver` fills from `content-desc` —
  so on Android a selector's `text:` matches an `accessibilityLabel` too. That
  is not obvious from the name and it is the reason a `text:` selector can hit
  a `Pressable` that displays no text of its own.
- **Newlines are replaced with spaces before matching**, and each attribute
  gets three chances: the regex against the raw value, an exact equality
  against the *pattern* string, and the regex against the newline-flattened
  value. A two-line label is therefore matchable as one line with a space —
  which narrows, but does not repeal, the `ANCHORED` rule: Maestro still
  matches the **whole** node.

**What this settles, and what it does not.** The combined selector was NOT the
reason the `06` fix failed — the composition is exactly what it looked like, so
that suspect is now excluded by reading rather than by another run. What
remains untested is whether `${output.…}` interpolation reaches a *selector*
the same way it reaches an `inputText`, which is the next thing to probe and
needs a device.

## A recorded cause is a hypothesis until something re-measures it

`FLOW_REGISTER.md` is rigorous about verdicts. `PASS`, `NOT MEASURED` and the
"does NOT cover" column exist precisely so nobody reads more into a green than
it earned. **The causes written beside those verdicts get none of that
discipline**, and the cause is what the next session actually acts on — a
verdict tells you where to look, a cause tells you what to do.

**Five recorded causes were found wrong in a single night, 2026-09-21 into 22.**
Three of them in this repo, measured here:

1. *"Maestro's `longPressOn` does not land."* It lands. An isolated probe opens
   the reaction sheet. The flow's selector was ambiguous — six identical labels.
2. *"Deleting a conversation closes the sheet."* It does not. `onClose` is
   called at four sites and none is the delete path, and a run on 19 September
   deleted two conversations back to back and passed.
3. *"A cleanup that opens its own sheet finds no `chat-open-sessions`."* Not a
   bug at all: a `Modal` covering a header, behaving exactly as it should.

Two more were reported over the relay the same night from the other repos — a
swallowed 422 said to make later calls fail when four endpoints returned 200,
and a nullable session expiry pinned in a spec as a deliberate admin feature
that exists nowhere. **Those two are recorded here as reported, not as
measured**, which is the whole of this section applied to itself.

**They are all one object.** A plausible explanation, written down at the moment
of a failure, never re-measured, then read as a fact by whoever came next. Each
cost more than the defect it described: #1 and #2 together cost four reverted
attempts and put a non-defect in front of him as the app's only known bug.

**The rule.** Every cause recorded next to a verdict carries one word:

- **measured** — somebody drove it and watched the outcome, or read the code
  that decides it. Say what was driven or which file and line.
- **inferred** — it is the best explanation of a failure nobody has re-tested.

An unmarked cause reads as **inferred**. That is the safe default and it is the
honest one, because most of them are. The marker costs a word; #1 and #2 above
would each have been caught by somebody reading "inferred" and spending ten
minutes rather than four attempts.

And the sharper half, which is the one that actually bites: **a cause is not
made measured by being confidently written, by being repeated, or by being
quoted back to you.** Two of the five were repeated to a peer as established
fact before anybody drove them. Being told your own guess is the same as being
told nothing.

## Ask what the report would look like if the step had done nothing

The costliest failures in this rig are not steps that fail. They are steps that
**report success for a reason unrelated to the thing being asked**. A green that
could not have been red is not weak evidence, it is no evidence, and it reads
exactly like the real thing.

One question catches all of them, before the run rather than after:

> **If this step had done nothing at all, what would its report look like?**
> If the answer is "the same", the step is not evidence.

Two worked examples from one night, two different masks on the same object:

**The tool reported success for an action that never reached the app.**
`longPressOn: id: msg-mine-.*` prints `COMPLETED` when the gesture is
dispatched, not when anything receives it. With the keyboard up it reached
nothing, and `COMPLETED` was printed just the same. That single misreading
produced two wrong recorded causes over two nights — first "the gesture is not
drivable", then "the selector is ambiguous" — and cost a defect report against
an app that did not have the defect. What finally settled it was three runs
changing **one** variable, with a case that was known to pass as the control.

**The assertion was incapable of failing for the right reason.**
`15-sessions-switch`'s first cleanup ended with `assertNotVisible` on two
conversation titles. It passed — against a sheet completely covered by a delete
confirm that had never closed. `assertNotVisible` cannot tell *"the row is
gone"* from *"nothing is visible at all"*, so a covered screen satisfies it
perfectly. Green assertion, real dialog, invisible cause, and a failure four
steps later pointing at `sessions-new`, which was innocent.

**The remedy for a negative assertion is a positive one in front of it.** Assert
the surface is present and usable, *then* assert what is absent from it. Absence
only means something once you have established there was somewhere for the thing
to be. `15` now asserts `sessions-sheet` and `sessions-new` before asserting the
two titles are gone.

**And knowing this entry does not protect you from it.** The `assertNotVisible`
example above was written into a cleanup **eleven minutes after** the session
writing it committed this section's first half. A supervising session made the
same move at wider spacing the same night: corrected on a memory gauge at six
o'clock, wrote the correction down, and handed out a tripwire built on the wrong
number at ten. Knowing a rule and holding it under time pressure are different
skills, and the gap between them does not close by stating the rule more
clearly.

What closed both was not care. It was **an artifact and a second pair of eyes**
— a hierarchy dump from the failing step, and somebody who measured
independently instead of taking the report. So the operational form of this
entry is not "be careful", which is not a rule:

> **Look at what the run produced, not at what you meant it to do.**

The dump, the log, the screenshot. Every wrong cause recorded this week
survived because somebody reasoned about the run instead of opening its
artifacts, and every one of them died within minutes of somebody opening them.

And the general one: **a negative control is not optional rigour, it is what
converts a pass into information.** When `${output.…}` was checked against a
selector, the four passes meant nothing until a fifth run asserted a string that
was deliberately absent and failed — printing the resolved value, which proved
the interpolation had happened at all. Three suspects were excluded that night
by negative controls and all three had been believed.

## `pgrep -f <pattern>` matches the process doing the looking — including you

There is already a note above about `until ! pgrep -f maestro` waiting for
itself forever. It has a second face, and it caught a session on 2026-09-22
checking the emulator count for a teardown report:

```sh
pgrep -af qemu-system | wc -l     # 3   ← two of them were the shell running this
ps -eo comm= | grep -c '^qemu-system'   # 1   ← the truth
```

`pgrep -f` matches the full command line, and the command line of the thing
asking the question contains the pattern by definition. Reporting "three
emulators are running" on a box whose whole contract is *one device at a time*
would have been an emergency invented out of a grep. **Match on `comm` — the
executable name — whenever you are counting processes**, and keep `-f` for
finding one you already know exists.

Both traps are the same object as the section above: a command that answers
confidently without being able to answer.

## PARKED, NOT FIXED — the backend check asserts a status, not an identity

Not done. Written down on 2026-09-23 so it is not lost, and left for whoever
picks it up with time to do it properly.

`qa/preflight.sh`'s `backend_up()` reports **"backend reachable"** on a 200 from
`$API_URL_LOCAL/up`. Nothing in it asserts *which application answered*, and it
is the odd one out in this rig: `qa.sh`'s Metro check greps the response body
for `packager`, which is an identity, and is already the right shape.

**Measured here, and it is worse than the body being ignored:**

```sh
backend_up(){ … curl -s -o /dev/null -w '%{http_code}' … "$API_URL_LOCAL/up" … = "200" }
```

- `-o /dev/null` **throws the body away**, so there is nothing to identify with.
- And keeping it would not help. `/up` is `rails/health#show`
  (`config/routes.rb:5`), the Rails **default** health route that every Rails
  7.1+ app has, and its entire body is
  `<html><body style="background-color: green"></body></html>`. **It carries
  nothing identifying at all.** Any Rails app on any port answers it the same.

**Why it matters, from Karwan's rig the same night** — reported, not measured
here: their preflight asked `localhost:3000`, got a healthy 200, and then 404ed
on every real route, because 3000 is a different Rails app. What exposed it was
a version string in the 404, and only because the failure came first. **A run
that happened to succeed would have gone green against a stranger's app and
been believed.**

**And here it is on this box, measured 2026-09-23 — not a story about Karwan's
rig.** Port 3000 is one of the booklet stacks; 3001 is ours:

```
$ curl -s http://localhost:3000/up   # booklet's app
<!DOCTYPE html><html><body style="background-color: green"></body></html>  HTTP 200
$ curl -s http://localhost:3001/up   # ours
<!DOCTYPE html><html><body style="background-color: green"></body></html>  HTTP 200
```

**Byte for byte identical.** Two different applications, same status, same body,
nothing to tell them apart. A supervising session produced this by accident
while checking the claim above — curled 3000 to see the body and got a healthy
green page — three hours into writing this lesson down. That is not a careless
moment, it is the entry's own point: the report is identical whoever answers,
so there is no amount of attention that distinguishes them.

**And what an identity check looks like — also measured here, same night,
same box.** Karwan's step-4 endpoint, on their port:

```
$ curl -s http://localhost:3017/api/v1/public/merchant_categories
{"merchant_categories":[{"id":1,"slug":"kabab","name":"کباب"},
 {"id":2,"slug":"qabuli","name":"قابلی پلو"},{"id":3,"slug":"mantu","name":"منتو"},…
```

**Content only that application could produce** — not a version header, not a
status code. Nothing else on this machine answers with those. That is the bar,
and a health endpoint every framework ships cannot clear it by construction,
which is why the fix here is a different endpoint rather than a better read of
`/up`. (Their public catalogue, read-only, one GET; nothing of theirs touched.)

Put the two side by side and the whole finding is three commands: 3000 and 3001
indistinguishable, 3017 unmistakable.

**Read `karwan-api/bin/preflight` step 4 BEFORE writing anything.** It already
does this: it fetches a real endpoint and branches three ways — ours, nothing
answered, and **something else answered**. That third branch is the point;
collapsing it into "not reachable" throws away the whole finding. The session
over there nearly built a second mechanism beside the one that already existed,
so the first move here is to go and read theirs, not to design ours.

Their general lesson, in their words: **a guard only guards the path it is on.**
Theirs was correct, enforced, and walked around by hand.

This sits with "Ask what the report would look like if the step had done
nothing" above. A 200 from a stranger and a 200 from us are the same report.
