# What our tests cannot see

Four gates run on every change: `npm run lint`, `npm run typecheck`,
`npm test`, and `npm run bundle`, and the flows run on a device after them.
This file is about the times **every one of them was green and the app was
broken** — each entry is an instance that actually happened in this repo, what
it cost, and the gate that now catches it.

It exists because the same mistake keeps arriving in a new costume: **a check
that passes for a reason unrelated to the thing it is named after.**

---

## 1 · Three green gates and an app that could not start

**2026-09-19, `e41be2a` → fixed in `5e37367`. Cost: seven hours, one
emulator sitting claimed and warm, twelve flows unable to begin.**

`src/stores/readAloud.store.ts` loaded two optional native modules through a
helper:

```ts
function tryRequire<T>(name: string): T | null {
  try { return require(name) as T; } catch { return null; }
}
```

**Metro resolves `require` statically**, so a call whose argument is a
variable is rejected at transform time — `Invalid call at line 90:
require(name)`. Node's resolver does not care.

- `tsc` passed: the call is type-correct.
- `eslint` passed, and the line carried an `eslint-disable` for
  `no-require-imports`, which made it look **considered** rather than
  unexamined. A disable comment is a claim that somebody thought about the
  rule they switched off; this one was true and irrelevant.
- **465 Jest tests passed**, because Jest runs on Node's resolver and never
  asks Metro for anything.

On the device the dev client dropped straight to `DevLauncherErrorActivity`:
nothing rendered, so no flow could even reach a first assertion.

**The gate already existed and was not run.** `.github/workflows/ci.yml` has
carried `npx expo export --platform android` from the start, with a comment
saying in as many words that lint, tsc and jest "all passed on a tree that
could not bundle at all". The comment was right and the author of `e41be2a`
did not read it.

> **The rule: a JavaScript test runner cannot tell you the app starts.**
> Run `npm run bundle` before committing anything that changes how a module
> is loaded — a `require`, a dynamic import, a new dependency, a config
> plugin. It takes about a minute. It is the only gate that runs the real
> bundler.

Found by the QA session asking Metro for the bundle over HTTP, which is the
only place it was visible.

---

## 2 · A test whose name claimed more than the test did

**2026-09-19, caught before landing, by planting a break.**

`screens.render.test.tsx` renders every screen at 360, 411 and 800 dp in both
modes and asserts a written list of `testID`s. When French arrived it gained a
language dimension, and the name became "every handle, every width, both
modes, **both languages**".

To check the new pass could fail, one hardcoded English title was planted in
`app/chats.tsx`. **The table stayed green.** A handle sits on a *container*;
the English text inside it survives a language switch untouched, and every
`findByTestId` still resolved. The test was making a true but much weaker
claim than its name — *the screen renders in French* — while reading as *the
screen is translated*.

Each row now also carries a distinctive French sentence that must be on
screen. Re-planting the same break fails.

> **The rule: a test that has never failed is a hypothesis.** Plant the break
> you claim to catch, watch it go red, then restore. If it stays green, the
> test is measuring something else — find out what, because that is usually
> more interesting than the test you meant to write.

### The corollary, earned the hard way on 2026-09-19

Four assertions written that evening could not have failed. Three were tests:
`delete-account.test.tsx` checked an empty request history one line after an
**async** press, so no time had passed; `PersonMessageRow.test.tsx` fired a long
press and asserted a spy ran, but RNTL's `fireEvent` walks up through
**composite** elements, reached the component under test and called the prop
the test itself had just handed it. The fourth was worse than a test — see
below.

**Every one was found by planting. None was found by reading**, and all four
were written by somebody who had just written the rule above.

> **So: the plant is cheapest exactly when the neighbouring tests have just
> gone green — and that is when the odds are worst.** Six siblings passing is
> not evidence about the seventh; it is the feeling that makes you skip the
> one check that would have told you. The moment it feels unnecessary is the
> moment to do it.

### And the worst shape of all: a rule that cannot fire

The fourth was a `no-restricted-syntax` selector. It was added with the defect
it forbids sitting in the tree, believed because that instance went red, and
its first form used `:has(> JSXOpeningElement > JSXAttribute[…])` — which this
esquery does not support. It matched **nothing**. Forever.

A lint rule that cannot fire is not a weak test; it is indistinguishable from a
passing one, in CI, in a diff and in review. It is worse than no rule, because
it occupies the slot where somebody would otherwise notice the gap — and unlike
a vacuous test, nobody ever runs it with the break in place, because the break
is what it exists to stop being written.

Hence `eslint-fixtures/`: one file per custom rule containing exactly the shape
it forbids, plus a `clean.tsx` of the legitimate forms, and
`src/__tests__/eslintRules.test.ts` running the real `eslint` binary over them
in `npm test`. Every rule in this repo has now been planted and watched to
fire, including the compound accessibility selector's four separate branches.
The audit was itself planted: restoring the dead selector leaves `npm run lint`
perfectly clean and turns the audit red, naming the rule that went quiet.

It is the same instrument as §8's inverse key check, pointed at the linter.
Every gate asked whether the code satisfies the rules; none asked whether the
rules are capable of being broken.

---

## 3 · A constant evaluated before the thing it depends on exists

**2026-09-19, found while wiring i18n.**

`SAFE_SENTENCE`, `EMPTY_FORM_SENTENCE`, `SESSION_END_SENTENCE` and
`DELETED_WITH_ACCOUNT` were module-level `const`s holding user-facing English.
A `const` is evaluated **once, at import** — before the stored language has
been read, and never again after a switch. Every one would have stayed
English in a French app, and every test would have passed, because the tests
compared against the same constant.

All four are functions now. The tests call the same function, so the sentence
and its assertion cannot drift apart.

> **The rule: anything that can change at runtime cannot be a module-level
> constant** — and a test that compares a value against itself proves the
> value is consistent, not that it is right.

---

## 4 · A style that is silently discarded

**Earlier, and it shipped twice.** A function `style` on `Pressable` is
dropped whole by NativeWind's interop — background, height, padding and
centring with it — so a button renders as bare text, `onAccent` white on a
light ground, i.e. invisible. Seventy tests, `tsc`, a bundle and a boot all
passed; only looking at the screen found it.

That one has a gate: `no-restricted-syntax` in `.eslintrc.js`. It is here
because it is the same family, and because the warning had been sitting in
`button.tsx`'s own header while the code below it did the forbidden thing.

> **The rule: a warning in a comment is not a gate.** If it matters, make it
> fail.

---

## 5 · A test that defended the bug

**2026-09-19, found on a device by the QA session, after the unit test had
guarded the broken behaviour for as long as it existed.**

`ScreenContainer` passed `behavior={Platform.OS === "ios" ? "padding" : undefined}`
to `KeyboardAvoidingView`, above a comment explaining that Android resizes the
window itself so padding would double-count. That was true once. It stopped
being true when `edgeToEdgeEnabled: true` went into `app.json` — an
edge-to-edge window is **not** resized for the IME — and the composer went
under the keyboard on every Android phone.

`dialogs.keyboard.test.tsx` asserted exactly that: `behavior` is `undefined` on
Android. It passed. It would have passed forever.

This is the worst entry in this file, and it is worth being precise about why.
The other four are gates that could not see a problem. **This one could see it
perfectly and had been told the wrong answer.** A test written from a comment
rather than from a device inherits the comment's belief and then outranks it —
the comment is prose somebody may argue with, the test is a red X in CI. Fixing
the app required *deleting a passing test*, which is the one move code review
is trained to stop.

The file is gone. `src/components/__tests__/keyboard.test.tsx` replaces it and
asserts `padding` on **both** platforms, across every surface with a field in
it, which is a claim about behaviour rather than about an implementation
detail.

> **The rule: never write an assertion whose only source is a comment in the
> file you are testing.** If you cannot say where the rule came from — a
> platform doc, the framework's source, a device you watched — you are not
> testing the code, you are notarising it. And a test that merely restates
> what the code does will survive the code being wrong.

---

## 6 · A flow counted as coverage that had never been run — and an entry, here, that invented its green

**2026-09-19. Corrected the same night, from a screenshot.**

`qa/flows/09-keyboard.yaml` raises the keyboard and asserts the composer, the
send button and the attach button are all still visible. It is the right
assertion, aimed at exactly the defect in §5, and it sat in the register as
keyboard coverage.

**It had never executed.** Not once. So when `app/chat.tsx` carried the same
`behavior={undefined}` that put the assistant's composer under the keyboard,
this flow caught nothing — there was no green to have been vacuous, there was
nothing at all. *A flow that is written and never run proves exactly as much as
no flow*, and it is worse than no flow in one respect: it occupies the slot
where somebody would otherwise notice the gap.

### What this entry said first, which was wrong

The first version of §6 said the flow had been **passing against a floating
Gboard** — the easy case, no inset, so the composer could not have been covered
— and reported as coverage of the docked case. That was a good story and none
of it happened.

It came from the flow's own header, which asserted that Gboard on that AVD runs
floating. The first real run produced `reports/50-keyboard-up.png`: a **docked,
full-width** keyboard with the composer sitting above it. The header was wrong,
and it had been load-bearing — it was the reason to doubt the flow rather than
the screen.

So the author of this file read a claim in a comment, believed it because it
was specific, and wrote it up as a finding in **the document about checks that
pass for reasons unrelated to their name**. The correction came from QA running
the thing and photographing the screen.

That is the entry. The rule underneath did not change, but the instance is now
the honest one, and the honest one is sharper: the invented mechanism was
plausible, internally consistent, and would have been believed.

> **The rule, twice over.** A verdict is only as strong as the hardest case the
> run actually executed — so say in the *result* which case ran, not only in the
> file which cases exist. And **a caveat written in a header is a claim about
> the world, not evidence about it.** A comment describing an emulator's
> behaviour is exactly as trustworthy as the last person to look, and if nobody
> has looked, it is a guess in a convincing typeface. §5's rule was *never write
> an assertion whose only source is a comment*; this is the same mistake made in
> prose instead of in code, by the person who had just written that rule down.

The fix in §5 is now **verified on a device**: the same run shows the composer
above a docked full-width Gboard with a message sent and ticked.

---

## 7 · A warning whose own diagnostic cannot reproduce it

**Arrived 2026-09-18 with `0de82e7`, chased 2026-09-19. Cost: a day of full
runs force-killing a worker, and about 50 seconds on every one of them.**

Every full `npm test` ended with:

> A worker process has failed to exit gracefully and has been force exited.
> This is likely caused by tests leaking due to improper teardown. Try running
> with `--detectOpenHandles` to find leaks.

It names no file, no test and no library, and nothing failed, so it read as
noise. It was a **five-minute timer**, and the path to it has three turns worth
remembering.

**`gcTime: 0` has to be said twice.** Every test client set
`defaultOptions.queries.gcTime = 0`. Mutations are a *separate cache with a
separate default*, and that default is 300 000 ms. `0de82e7` gave
`SessionsSheet` its first mutation and its test the queries-only client in the
same commit, so from that moment any suite that actually **ran** a mutation
scheduled a five-minute garbage collection on unmount. Only one suite did,
which is why it looked intermittent and unattributable.

**`client.clear()` in an `afterEach` does not save you.** Jest runs `afterEach`
in reverse order of registration, and RNTL registers its auto-cleanup from
`setupFilesAfterEnv` — before any test file body. So the file's own `clear()`
runs **first** and the unmount that schedules the timer runs after it. Clearing
a cache cannot cancel a timer that does not exist yet.

**And the suggested diagnostic is the one thing that cannot see it.**
`--detectOpenHandles` implies `--runInBand`. In band there is no worker, so
there is nothing to fail to exit: the run is clean and reports no handles. The
warning and the flag it recommends are mutually exclusive. Finding it took
wrapping `setInterval`/`setTimeout` in a throwaway setup file and printing what
was still pending in an `afterAll` — five minutes of work that a day of reading
the warning never started.

The fix is `src/__tests__/queryClient.ts`, one helper instead of four literals,
so the next client cannot be written with only half of it. The full suite went
from 84 s to 33 s, all of the difference being a worker nobody was waiting for.

> **The rule: a warning that names nothing is still a measurement.** This file
> has four entries about gates that could not see a problem; this is the
> opposite — a gate saw it, said so on every run for a day, and was read as
> noise because it could not say what it had seen. If a tool keeps saying
> something, the cost of finding out is bounded and the cost of ignoring it is
> not.

---

## 8 · A key that existed, was tested, and was called by nothing

**Found 2026-09-19 while fixing §5's sibling — the untranslated accessibility
strings. Cost: a screen reader read an English sentence to a French user for as
long as the key sat there unused.**

`calendar.event` was defined in `en.ts`. It was defined in `fr.ts`. It was
asserted by `locales.test.ts`, which compares the two locales for the same keys,
no empty values and matching interpolations. It was listed in
`docs/LANGUAGES.md` for review. Four places agreed the translation existed.

`EventRow` never called it. Two lines below the key's own value, the component
interpolated its own template and wrote its hint as an English literal.

**Every gate was pointed the same way.** `keys.test.ts` starts from the calls
and asks whether the key exists — it cannot see a key nothing asks for.
`locales.test.ts` compares the locales *to each other*, so a key present in both
and wanted by neither is perfectly consistent. The render tests read `testID`s
and visible text, and an `accessibilityHint` is neither.

An unused key is not a broken screen, which is why it sits for weeks. **It is
the sign of one.** A key gets written because a string was going somewhere; a
key with no caller means the string went somewhere *else*, and somewhere else is
a literal in a component — untranslated by definition. The orphan is not the
bug, it is the receipt for the bug.

`karwan-a3` hit the mirror image this week and called it dead code that was
alive. This is a live key that was dead.

**Two gates now, and they do different jobs.** The `no-restricted-syntax` rule
in `.eslintrc.js` rejects a bare worded string in `accessibilityLabel` or
`accessibilityHint` — that is what *found* this one, and it only finds the cases
where the literal happens to be spoken. The check that *catches* the class is
the inverse of `keys.test.ts`: every key defined in `en.ts` must be called by
something. Deliberately no allowlist, because a key kept for later is a key
nobody can tell from a key that was forgotten.

Turning it on found three more dead keys, and — more usefully — a hole in the
forward check. The grep knew `t("…")` and not `translate("…")`, the aliased
module-level import used outside components, so every key reached through the
alias had never been resolved in either language. The inverse check found the
forward check's blind spot. There is now a test asserting that the set of names
`t` is imported under is the set the grep knows.

> **The rule: a check that only runs in one direction only proves one
> direction.** Every gate here asked "is what we call defined?" and none asked
> "is what we define called?" — and the second question is the cheaper one,
> because the answer is a list you can read.

### It earned itself back the same day, twice

**Once as a gate.** Three sessions were working in one tree that evening.
Three new `thread.*` keys were sitting uncommitted when another session staged
the same two locale files by pathspec, so the keys landed under its commit
while the components calling them stayed unstaged. Main had three keys nothing
called — for about **eleven minutes**, because this check went red on its own
and named all three.

Nobody was careless. The other session named its paths, read its diff, and had
written the warning about this exact hole an hour earlier. Pathspec separates
sessions *between* files and cannot separate them *inside* one, and the window
is between "I need these files" and "go" — which is a gap a message cannot
close, because both messages are true when they are sent.

> **So the rule is not "be careful", it is: a key and its callers are one
> change.** Land them in one commit. A string that exists and a string that is
> used are not two pieces of work that can be sequenced across two sessions,
> and no amount of care makes them two.

Eleven minutes rather than a week is the strongest thing any gate in this file
has done, and it is worth being exact about why: the backward check written
that afternoon is the *only* reason it was visible at all. `tsc` was happy —
the keys type-check. `locales.test.ts` was happy — both locales agreed.
Nothing renders an unused key, so no screen test could see it.

**And once as a diagnosis.** The three English literals fixed that night —
`"UNREAD"`, `"This message was deleted"`, `"Not sent. Tap to retry."` — were
found by a *backward walk over drawn text*: what does the app render that never
asks for a key? The forward gate could not see them, and neither could the
eslint rule added in `49a0a7a`, which guards `accessibilityLabel` and
`accessibilityHint` — **a `<Text>` child is neither**.

`49a0a7a` is also the commit that last touched `PersonMessageRow.tsx`. It fixed
two literals in that file and these survived it, two lines away.

> **A gate aimed at one shape of a bug will watch the other shape walk past it
> — in the same file, on the same day, in the same commit.** When you write a
> rule, name the shape it does not cover, in the rule.

---

## 9 · A fix that would have caused the defect it was fixing

**2026-09-19, caught while writing the fix, and the two tests written to guard
it both stayed green on the broken version.**

`docs/ACCESSIBILITY.md` D2: the assistant's answer and the user's question are
told apart **by shape** — a bubble on the right, an unbubbled serif for the
answer. `MessageRow`'s own header says so: *"authorship is legible by shape
before anybody reads a word."* True, and a claim about eyes. A screen reader
read question and answer as one undifferentiated run, so the job was to add the
spoken half without touching the visual.

The obvious implementation is to wrap the answer in an element carrying the
speaker's name. **That would have made every link in every answer unreachable.**
A named accessibility element groups its children — `Pressable.js:245`,
`accessible: accessible !== false`, and on iOS grouping is absolute — and
`AnswerMarkdown` renders `accessibilityRole="link"` pressables *inside* answers,
because the assistant puts a file's download link in the answer it writes.

That is **N1 of the same audit**, arriving through its own remedy: the fix for
"nobody is told who is speaking" would have caused "the control inside cannot be
reached". It was avoided by putting the name on a leaf — the first text block —
and never on the container.

### The part that belongs in this file: neither gate could see it

A test was written to guard exactly this — *a link inside an answer is still
reachable after the answer is attributed* — and the naive fix was planted to
watch it fail. **It stayed green.** RNTL builds a JS tree and does not emulate
native accessibility grouping, so its queries find children that VoiceOver would
never reach. The test is not useless, but what it proves is that the link is
still *in the tree*, which is not what its name suggests.

So a static check went in: a name on a container that holds a control. Its scope
was then measured in both directions rather than assumed.

- Planted a name on a container that **lexically** holds the send button in
  `Composer.tsx` — it fires, naming the line.
- Planted the same thing on `AnswerMarkdown`'s own container — **it stays
  green.** That component builds its children into an array and interpolates
  them (`{blocks}`), so nothing interactive is lexically inside the JSX and a
  source walk cannot see what will be rendered there.

The check earns its place anyway: it found **five** sheet scrims with this
shape, and **three of the five were missed by the hand-read that wrote N1 up** —
the first pass grepped for the press-swallowing child, and `SourceSheet` stops
propagation instead, so it looked different while being identical. But the exact
shape that prompted it is the shape it cannot check.

> **The rule: an accessibility fix that adds a container is a grouping change,
> and a grouping change is the same class of defect as the one being fixed.**
> Put the name on a leaf. If you must name a container, the test to write first
> is that what was reachable before is still reachable after — **and then prove
> that test can fail**, because in Jest it usually cannot. What was reachable is
> a native question; a JS tree will answer it wrongly and confidently. Where no
> gate can reach, say so in the file rather than banking the green.

---

## 10 · A grep for a spelling finds a spelling, not an idea

**2026-09-19. Three instances in one evening, by three different sessions, and
none of them recognised it until the third.**

§8 is about a check that only runs in one direction. This is its neighbour and
it is narrower: **a check built by searching for how an idea was WRITTEN finds
only the places it was written that way**, and the places it was written
differently are invisible in exactly the same manner as the places it was not
written at all.

The three, in the order they surfaced:

1. **`keys.test.ts` knew `t("…")` and not `translate("…")`.** The alias is the
   module-level import used outside components, so every key reached through it
   had never been resolved in either language — not a weak check, no check. §8.
2. **The `no-restricted-syntax` accessibility rule guards `accessibilityLabel`
   and `accessibilityHint`.** A worded English literal in a `<Text>` child is
   neither, so three of them sat in people-chat. `49a0a7a` fixed two literals in
   `PersonMessageRow.tsx` and one survived it two lines away, in the same file,
   on the same day. §8 again.
3. **The scrim audit grepped for `onPress={() => {}}`** — the press-swallowing
   child that the two sheets it found happen to use. `SourceSheet` writes
   `e.stopPropagation()` instead and `AttachSheet` and `SessionsSheet` have no
   swallower at all. The hand-read reported **two** sheets with the grouping
   defect. The static check that asked the structural question instead — *is
   there a named container with a control inside it* — reported **five**. Every
   modal in the app, not two of them.

The third is the one that makes the pattern legible, because the search term was
not even wrong. `onPress={() => {}}` really is how two of the five are written.
It was a correct grep for a true spelling, and it under-reported the finding by
more than half, and it would have gone into the audit as "two sheets" and been
believed — by the session that had just written §8 up.

**What distinguishes the instrument that worked**: it did not look for a
spelling at all. It parsed the tree and asked a question about the shape — a
name on a container, a control inside it — which is the same question however
anybody chooses to write it. A regex searches the text; a parser searches the
structure, and the idea lives in the structure.

> **The rule: when a check is built from a search term, the term is a hypothesis
> about how people write, and it will be wrong about somebody.** Prefer a
> question about the SHAPE — an AST, a rendered tree, a type — over a question
> about the characters. Where a grep is genuinely the only instrument, **write
> down the spellings it knows** next to it, because that list is the finding
> waiting to happen: `t(` was one such list and `translate(` was missing from
> it, and nobody could see that until somebody asked the question from the other
> end.

**A fourth, an hour after this entry was written, in the instrument that
supplied its first example.** `keys.test.ts` had by then written down the two
*names* `t` is imported under, with a test that fails if a third appears. It
had not written down the *quote*: the pattern matched `"` only, so
`t('session.expired')` in single quotes would have been invisible twice —
never resolved in either language, and never counted as a caller by §8's
inverse check, which would then have reported a live key as **dead** and
invited somebody to delete a working string. Nothing in the repo writes it that
way and nothing enforces that; there is no prettier config in this tree, so the
convention is a habit, which is precisely the kind of fact the rule above says
a grep must not rest on. Fixed in `d2e196b`; the key count did not move, and a
planted single-quoted missing key now fails in both languages.

Writing the rule down did not protect the file the rule was written from. §2's
corollary, one level up.

---

## What each gate is actually for

| Gate | Proves | Cannot see |
|---|---|---|
| `npm run typecheck` | the shapes agree | anything about runtime, bundling, or words on a screen |
| `npm run lint` | the banned forms are absent — and every custom rule is proven able to fire, by `eslint-fixtures/` (§2) | a banned form with a `disable` comment on it |
| `npm test` | behaviour, under **Node's** resolver and with **no layout** | whether the app bundles; whether anything fits; whether a colour is legible — and it will keep passing while telling you something is wrong in a sentence that names nothing (§7) |
| `npm run bundle` | Metro, Babel, NativeWind, expo-router and the config plugins agree — **the app can start** | whether it then works |
| the flows, on a device | it works, for a person, **on that device in that state** | only what a flow asserts, only on the cases that device actually produced — and nothing whatever until it has been RUN once (§6) |

**Nothing above measures a pixel.** Jest has no layout engine, so no test in
this repo can tell you that a French string fits a 360 dp row or that text is
readable on a dark ground. That is a device and a screenshot, and it is why
`docs/design/README.md` makes a device screenshot at three widths part of
`DONE`.

---

## Running them

`npm run lint`, `npm run typecheck`, `npm test`, `npm run bundle`. The last one
is the one that gets skipped, and §1 is what that costs.

There is a tracked pre-commit hook in `.githooks/` that runs the first two
always and the third when the staged change touches how a module is loaded.
**It is off**, and `.githooks/README.md` has both the one line that enables it
and the argument for leaving it alone — chiefly that the `require()` rule in
`.eslintrc.js` already catches §1's exact class in milliseconds, on a gate
everybody runs.
