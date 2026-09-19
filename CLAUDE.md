# CLAUDE.md — multimagic-mobile

An Expo / React Native client for MultiMagic whose single destination is the
assistant. Four screens became thirteen; `docs/design/README.md` is the board.

**Read `docs/TESTING.md` before you trust a green.** It is eight times every
gate in this repo was green and the app was broken, each one an instance that
actually happened here. Everything below that looks arbitrary has an entry
there with the cost attached.

Every rule in this file names the file it comes from, because a rule you cannot
check is a rule the next session will argue with.

---

## The gates

```sh
npm run lint        # eslint, --max-warnings 0
npm run typecheck   # tsc --noEmit
npm test            # jest — 45 suites
npm run bundle      # expo export --platform android  ← the one that gets skipped
```

CI runs all four in that order (`.github/workflows/ci.yml`), fastest-failing
first.

**`npm run bundle` is not optional and it is not covered by the other three.**
On 2026-09-19 `tsc`, eslint and 465 Jest tests all passed on a tree that could
not bundle at all: `require(name)` with a variable argument, which Metro
rejects at transform time and Node's resolver accepts happily. The app dropped
straight to `DevLauncherErrorActivity` — nothing rendered, so no flow could
reach a first assertion. Seven hours, one emulator sitting claimed and warm
(`docs/TESTING.md` §1).

Run it before committing anything that changes **how a module is loaded**: a
`require`, a dynamic `import()`, a new dependency, a config plugin. About a
minute. It is the only gate that runs the real bundler.

**Run `nvm use` first, or the bundle gate lies to you.** This box's default
`node` is **v18.18.0** and `.nvmrc` pins **22.19.0**. Expo 54's metro-config
calls `Array.prototype.toReversed`, which is Node 20+, so on the default node
the export dies with

```
TypeError: Error loading Metro config at: …/metro.config.js
configs.toReversed is not a function
```

— an error naming neither Node nor a version, and easy to read as a broken
tree. It is a **NOT MEASURED**: you could not ask. `nvm use` reads `.nvmrc` and
CI pins the same file via `node-version-file`, so the two stay honest together.
(`nvm use` inside a pipeline is a no-op — the pipeline forks a subshell and the
PATH change dies with it. Run it as its own command.)

What each gate actually proves — and what it cannot see — is the table at the
end of `docs/TESTING.md`. The short version: **nothing in this repo measures a
pixel.** Jest has no layout engine, so no test here can tell you a French
string fits a 360 dp row or that text is legible on a dark ground. That is a
device and a screenshot.

There is a tracked pre-commit hook in `.githooks/`. **It is off** — git only
reads `.git/hooks`, so a committed hook changes nothing until someone runs
`git config core.hooksPath .githooks`, per clone. `.githooks/README.md` has the
argument for leaving it alone.

---

## Committing

**Stage individual paths. Never `git add -A`, and a directory is not a path.**

```sh
git add qa/run.sh qa/preflight.sh qa/QA_HANDBOOK.md    # yes
git add qa/ ; git add -A ; git commit -a               # no, no, no
```

Three sessions share this working tree and all three swept each other's
in-flight work into their own commits on 2026-09-18. `git add -A` was the first
cause; `git add qa/flows` was the second, and it took another session's three
new flows with it — **a directory is a set that grows**, so staging one stages
whatever anybody else dropped in it since you last looked
(`qa/QA_HANDBOOK.md`, "Stage individual paths").

**Check what actually staged before writing the message:**

```sh
git diff --cached --name-only
```

**And naming paths at `git add` time does not protect you at `git commit` time,
because the index is shared too.** The three sessions share one checkout, so
`git status` can show another session's work already staged — files you never
touched, sitting in `M `/`A ` with your own. A plain `git commit` then takes
them, however carefully you named your own paths a moment earlier. Commit by
pathspec instead, which builds the commit from the named paths' working-tree
content and leaves every other index entry exactly where it was:

```sh
git commit -F msg.txt -- CLAUDE.md docs/ACCESSIBILITY.md src/…    # yes
git commit -F msg.txt                                             # takes whatever is staged
```

This is not hypothetical: it happened while writing this file. A sibling had
staged a half-finished fix and a test that was **red at that moment**, and a
plain commit would have put both on `main` under somebody else's message.

**And a failing suite in a shared tree belongs to whoever holds the files, not
to whoever ran it.** `npm test` reads the whole tree, so the red you are looking
at is very often somebody else's uncommitted line. Find out whose before you fix
it: a well-meant fix to a file another session is mid-edit in is the same sweep
as `git add -A`, arriving through the working tree instead of the index. Say
what you saw and let them land it. This happened twice tonight in opposite
directions.

**Pathspec does not help inside a file.** Two sessions editing the same file
cannot be separated by naming paths at all, so the only thing that works is one
of them landing or reverting before the other stages. Ask, and say which files
you are mid-edit in when you report progress.

The cost is not tidiness. One sweep put a personal email address into a public
repo. Another hid a session's finished work from the session chasing it — the
header icons existed for half an hour while being asked for twice, committed
under somebody else's name.

### This repo is PUBLIC

`github.com/Hama99o/multi_magic_mobile`. Nothing of the owner's personal data
goes into a fixture, a doc, a commit message, a spec or a screenshot.

What `.gitignore` already encodes, and why:

- `.env` — the QA account's address and password live there and nowhere else.
- `docs/design/**/references/` — other companies' app screenshots, curated by
  Mobbin under their terms. Fine as internal reference, not ours to publish.
  Each `SPEC.md` cites `mobbin.com/screens/<id>` instead, which does not expire
  (Mobbin's image URLs expire after 30 days).
- `docs/design/**/ours/*.xml` and `qa/evidence/` — view-hierarchy dumps are a
  full text dump of a real session's screen, every label and every value.
- `docs/design/**/ours/*.png` **is tracked, deliberately** — `DONE` is defined
  as those screenshots existing, and a definition pointing at files
  `git clean -x` deletes is not a definition.

---

## The device, and the backend behind it

### One emulator at a time on this box

`qa/RIG_CONTRACT.md` §2. This app owns **`qa_phone2`**, Metro **3029**, API
**3001**; Karwan owns `qa_phone`, 3028, 3017. On 2026-09-18 a session here
booted Karwan's `qa_phone` and reported it as "Karwan's tablet" — two sessions
on one AVD means one installs over the other and neither can tell whose state
it is looking at.

The memory envelope is **one device each, two at most, never three** — this box
hard-rebooted from exhaustion on 2026-09-15. A second AVD is not a standing
permission. Before booting one, **measure free RAM and the `pswpin` *rate* at
that moment, put both numbers in your report, and boot only if the box stays
above 4 GB.** When the numbers are close enough that you are arguing with
yourself, ask a human rather than rounding in your own favour.

The number is deliberately in the rule instead of a name. A rule that routes
through a particular session is a rule that expires when that session does, and
this file is meant to outlive every session in it.

Claim it, and understand what the claim covers:

```sh
./qa/qa.sh claim <session> [why]   ·   release <session>   ·   claims
```

**The claim is on the DEVICE, not on the AVD** — released has to mean free for
anybody, including Karwan. One device, one lock, and the lock does not know
which repo you are in (`qa/QA_HANDBOOK.md`).

**Name the AVD in every report.** `pgrep -af qemu-system` prints `-avd <name>`.
"An emulator is running" is not an observation.

### `10.0.2.2`, always — never a LAN IP, never `localhost`

From inside an Android emulator `10.0.2.2` **is** the host. It is the same on
office WiFi and on a weekend hotspot and it works with no network at all. A
stale LAN IP makes every request fail in a way that looks exactly like an app
bug, and the owner switches to a hotspot at weekends (`qa/RIG_CONTRACT.md` §1).

A shell cannot reach `10.0.2.2` — that alias exists only inside the emulator —
so anything asking "is the backend up?" from a terminal uses
`EXPO_PUBLIC_API_URL_LOCAL` / `localhost`. Two values for one host, because two
very different things are asking (`src/config/env.ts`).

### `EXPO_PUBLIC_*` is inlined at BUILD time

`process.env.EXPO_PUBLIC_*` and `Constants.expoConfig.extra` are both baked into
the bundle. Neither is read at runtime, so **changing a hostname is a bundle
push, not a settings change**, and starting Metro without the right value bakes
the wrong address in — no amount of reloading fixes it
(`src/config/env.ts` header, `.env.example`, `qa/RIG_CONTRACT.md` §1).

A **release** build refuses to start without `EXPO_PUBLIC_API_URL` rather than
falling back to `10.0.2.2`. Silent fallback is right in development and a
disaster in a preview build — the app installs, launches, renders, and every
request goes to a machine that is not on the internet. Karwan shipped exactly
that.

### The backend is the owner's REAL MultiMagic

Not fixtures. His notes, contacts, loans, expenses, calendar. There is nothing
to reset and everything to lose (`qa/RIG_CONTRACT.md` §3, §4).

- **Never seed.** `QA_SEED_CMD` must be empty and the doctor fails rather than
  warns if it is ever set.
- **Never `docker compose down -v`** — not here, not in `multi_magic`, not in
  Karwan's. A volume on this machine is the only copy of real data. Nothing
  under `qa/` issues a `down` of any kind; the only verbs are `up -d`, `ps`,
  `logs` and a read-only `exec … psql`.
- **Never let the rig migrate `multi_magic_development`.** The `web` service's
  own compose command runs `db:prepare`, so *starting the stack migrates*.
  Preflight brings up postgres and redis only, and compares **every** file in
  `db/migrate/` against `schema_migrations` — every version, not
  `max(version)`, because a migration numbered below the newest applied one is
  exactly the case a high-water mark misses. Pending migrations are a FAIL that
  names the files. A human migrates that database; a rig never does.
- **A flow signs in as the QA account, never his.** `QA_EMAIL` / `QA_PASSWORD`
  in the gitignored `.env`. A run signed in as the owner writes conversations
  into his real assistant history and a delete test deletes his real records.
- **No test calls account deletion against a real account.** When that path is
  exercised it is against a throwaway user, by hand. `18-delete-account` opens
  the screen, asserts the disclosure and the gate, and never confirms.

---

## Writing tests

**Plant the break you claim to catch, watch it go red, then restore.** A test
that has never failed is a hypothesis. `screens.render.test.tsx` was renamed to
claim "both languages"; a hardcoded English title planted in `app/chats.tsx`
left it green, because a `testID` sits on a *container* and the English text
inside survives a language switch untouched. The test was making a true but
much weaker claim than its name (`docs/TESTING.md` §2).

**Never write an assertion whose only source is a comment in the file you are
testing.** `dialogs.keyboard.test.tsx` asserted `behavior === undefined` on
Android because a comment above the code said Android resizes its own window.
That was true until `edgeToEdgeEnabled: true` landed — an edge-to-edge window
is *not* resized for the IME — and the composer went under the keyboard on
every Android phone. The test passed, and would have passed forever. Fixing the
app required deleting a passing test, which is the one move code review is
trained to stop (`docs/TESTING.md` §5). If you cannot say where a rule came from
— a platform doc, the framework's source, a device you watched — you are not
testing the code, you are notarising it.

**Anything that can change at runtime cannot be a module-level `const`.** A
`const` is evaluated once, at import, before the stored language has been read.
Four user-facing sentences were module constants and would have stayed English
in a French app, with every test passing because the tests compared against the
same constant (`docs/TESTING.md` §3).

**Build test query clients from `src/__tests__/queryClient.ts`, not by hand.**
`gcTime: 0` has to be said twice — mutations are a separate cache with a
separate 300 000 ms default — and a suite that runs a mutation schedules a
five-minute GC on unmount, which surfaces as "a worker process has failed to
exit gracefully", names nothing, and costs 50 s on every full run.
`client.clear()` in an `afterEach` does not save you: RNTL registers its
cleanup first, Jest runs `afterEach` in reverse, so the clear happens before
the unmount that schedules the timer. And `--detectOpenHandles`, the flag the
warning recommends, implies `--runInBand` — in band there is no worker, so
there is nothing to fail to exit and the run reports clean
(`docs/TESTING.md` §7).

**Walk every list both ways.** Every check here asked "is what we call
defined?" and none asked "is what we define called?" `calendar.event` existed
in both locales, was asserted by the locale test and listed in the docs — and
was called by nothing, while `EventRow` interpolated its own English template
two lines below. An unused key is not a broken screen; it is the *receipt* for
one, because a key gets written when a string was going somewhere, and a key
with no caller means the string went somewhere else — a literal in a component.
The backward question is the cheaper one, because the answer is a list you can
read (`docs/TESTING.md` §8).

---

## Code rules with gates behind them

All three are `no-restricted-syntax` in `.eslintrc.js`, and each is there
because a comment warning about it had already been ignored.

**A function `style` on `Pressable` is silently discarded** by NativeWind's
interop — the whole object, not just the pressed state. One instance lost a
button's background, height, padding and centring and rendered white on a light
ground; nine more stacked an avatar above a name and put white text on a white
bubble. Track pressed in state (`src/components/reusables/button.tsx`) or use
`android_ripple`.

**`require()` needs a string literal.** See the gates section. One literal per
module, each in its own `try` — `src/stores/readAloud.store.ts`.

**An accessibility string is a user-facing string.** `accessibilityLabel` and
`accessibilityHint` are read aloud, so they come from `t()`. Two were written as
English literals and shipped; a French user's screen reader read them in
English — the only untranslated part of the interface, in the place nobody
looks, for the users least able to route around it. **The rule catches a bare
worded literal and nothing else**: it says nothing about a label that is
missing, wrong, duplicated or announcing the wrong thing.

Note `ignorePatterns` excludes `docs/` and `*.config.js`, so lint covers `app/`
and `src/` only.

---

## Accessibility

`docs/ACCESSIBILITY.md` is the audit: what was measured, what was fixed, what
needs a device, and what is the owner's decision rather than a defect.

`src/__tests__/a11y.test.tsx` is the gate, and it is the only test here that
reads the **accessibility tree** — every other gate reads `testID`s, visible
text, or the locales against each other. It asserts that no `Pressable` with a
press handler is nameless, that a name computed from children survives the
component changing shape, that headings carry the `header` role, and that a
field error is a live region.

**Three things its green does not mean**, all of them live rather than
hypothetical: it does not mean a gesture can be performed (`06-people-chat`
fails on a long press whose hint and handler are both correct — Android's
text-selection ActionMode takes it first, and only the OS knows that); it does
not mean a control is reachable (a `Pressable` is an accessibility element
unless told otherwise, `Pressable.js:245`, and on iOS such an element groups its
children — RNTL does not emulate that); and it measures no pixel, so touch
targets are read from source and settled on a device.

**An accessibility string is a user-facing string, and a `<Text>` child is one
too.** The eslint rule guards `accessibilityLabel` and `accessibilityHint`
only — three untranslated English literals sit in visible `<Text>` children in
people-chat, one of which is a control's entire accessible name.

---

## i18n

English and French, on the same `users.lang` column the web's switcher writes,
so a change on the laptop reaches the phone (`docs/LANGUAGES.md`). Four checks
guard it, and the table in that file says exactly what each one can and cannot
see:

- `src/i18n/__tests__/keys.test.ts` — every key the app calls resolves in both
  languages, **and** every key defined is called by something, **and** the grep
  knows every name `t` is imported under (it knew `t(` and not `translate(`, so
  every key reached through the module-level alias had never been resolved in
  either language).
- `src/i18n/__tests__/locales.test.ts` — same keys, no empties, matching
  interpolations, and no French value still identical to the English.
- `src/screens/__tests__/screens.render.test.tsx` — every screen, three widths,
  both schemes, both languages, each row carrying a distinctive French sentence.
- `src/stores/__tests__/language.store.test.ts` — the choice survives a restart
  and reaches the server.

**Not checked: whether a French string fits.** The 1.9× length budget in
`locales.test.ts` is a proxy for a translation that wandered into an
explanation, and it is named as one. The real check is a device at 360 dp.

---

## QA flows

`qa/flows/*.yaml`, Maestro, linted by `qa/flow_lint.py`. `qa/FLOW_REGISTER.md`
carries every flow's verdict **and a "does NOT cover" column**, which is the
column that earns the file: a flow is trusted for exactly what it asserts.

**`NOT MEASURED` is a verdict, not a pass and not a failure.** Exit **3**, never
1 (`qa/qa.sh`, `qa/run.sh`, `qa/bundle_check.sh`). A blocked preflight or a held
device means you measured nothing — it has found no bug, it has found nothing.
Counting it as a failure is how a quiet evening turns into a bug report about a
feature nobody ran; counting it as a pass is worse.

**A verdict is only as strong as the hardest case the run actually executed —
and a caveat written in a header is a claim about the world, not evidence about
it.** `09-keyboard` asserts the composer stays visible with the keyboard up.
That is the right assertion, aimed squarely at §5's defect, and it sat in the
register as keyboard coverage while having **never executed once**. A flow
written and never run proves exactly as much as no flow, and is worse in one
respect: it occupies the slot where somebody would otherwise notice the gap.

*This section's first draft repeated §6's own retracted first version — that the
flow had been passing against a floating Gboard, the easy case with no inset.
None of that happened. It came from the flow's header, and the first real run
photographed a docked, full-width keyboard. The header was a guess in a
convincing typeface and so was my summary of it; both were corrected from a
screenshot rather than from an argument.*

**Say in the result which case ran**, not only in the file which cases exist.
Several current passes are thin for exactly this reason and say so: `07` and
`08` took empty-state branches because the QA account has no notifications and
no events.

What `flow_lint.py` enforces:

- **`TESTID`** — every `id:` selector resolves to a real `testID` in `app/` or
  `src/`.
- **`DBID`** — a selector that resolves *only* through a testID built on a
  database id. **Several testIDs here are built on database ids** —
  `session-row-<id>`, `chat-row-<id>`, `notification-row-<id>`,
  `msg-<side>-<id>` — and that is a **finding, not a selector**: a flow that
  needed a particular row could not name one, because no serializer sends a
  slug. Address the row by its label instead ("Options for …", or its title),
  or mark the site `# lint: dbid-ok — <why>` when *any* row genuinely is the
  subject. The markers do not close the finding.
- **`OPTIONAL` / `TOOTHLESS`** — **never `optional: true` on the step that is
  the point of the flow.** Optional turns "did not work" into "did not happen",
  and on an assert it cannot fail at all. Every optional carries a written
  reason on its own command.
- **`ANCHORED`** — Maestro matches the **whole** text node, so a flow asserting
  the first line of a two-line caption can never pass. A full node or a `.*`.

Three rules the register enforces itself:

- **An empty list is a legitimate state, not a pass.** Reach it, screenshot,
  stop — do not assert into it.
- **Destructive paths are opened and cancelled**, and assert the *wording*.
- **Arrive the way a user arrives.** A flow that deep-links past the navigation
  proves the screen works, not that anybody can reach it.

Two device facts that have each cost an hour (`qa/QA_HANDBOOK.md`):

- **React Native caches window dimensions at startup**, so force-stop and
  relaunch after every `wm density` or `wm size` before judging anything. Two
  sessions measured the same phantom 360 dp overflow bug that was their own
  density change.
- **`pgrep -f <word>` matches the watcher looking for the word.** `until !
  pgrep -f maestro` finds itself and waits for ever. For a JVM ask
  `ps -eo comm= | grep -c '^java$'`.

---

## Design

`docs/design/README.md` is both the rules and the board — one folder per screen,
a `SPEC.md` saying where each idea came from, what changed, and how it will be
coded.

- **RULE ZERO: search Mobbin first, then decide.** The reference is the check,
  not the authority — a screen may land where none of the references went.
  *Deciding without looking* is what is forbidden, and the SPEC carries the
  receipt.
- **Download reference images; never link them** (Mobbin URLs expire in 30
  days), and they stay gitignored — see the public-repo section.
- **Every "how we code it" names real identifiers** — a token, a component, a
  file, a line. A spec that names no identifier is a wish.
- **`DONE` needs three things**: `ours/` holding a device screenshot at **360,
  411 and 800 dp**, the flows for that screen run, and the SPEC updated in the
  same commit.

Status vocabulary: `RESEARCHING` · `SPECIFIED` · `IN PROGRESS` · `BLOCKED` ·
`NEEDS HAMMA9900` · `DONE`.

The architectural decision that keeps four screens from becoming forty: this app
has no note, loan, contact or event screen, so wherever something would "open a
record" it **composes a question instead**. That is why a notification row has
no chevron.

**The privacy policy's DRAFT banner is a release gate**, not a detail — it stays
until Hamma9900 approves the text (`docs/design/account/SPEC.md`, row 13).
