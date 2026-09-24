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

### The same assertion, twice in one day, in two languages

**An assertion can match the wrong NODE and read as though it matched the
right one.** Two instances, three hours apart, both mine:

- `19-session-options.yaml` asserted `"QA options target.*"` after pressing
  Enter in the rename dialog. That matched the text **inside the dialog's own
  input field**, so the flow proved it had *typed* a title, not saved one, and
  then hunted a row menu sitting behind a modal. Found by the session running
  it.
- `AiSessionBar.test.tsx` asserted `/Renovation/` after opening the delete
  confirm. That is also the chat's title **in the bar behind the dialog**, so
  it would have passed with no dialog at all. Found by it passing while I
  read it.

Both are §2 with a modal instead of a container, and the second was written
after the first had been explained to me. The fix in both cases is to assert
something only the right node can satisfy — the control you actually mean
(`rename-save`), or the whole sentence rather than the word it shares with
the screen underneath.

> **When an assertion could be satisfied by two things on screen, it is
> satisfied by the wrong one.** Not "might be": a passing test tells you
> nothing about which, and the one you did not mean is usually the one that
> was already there.

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

The same applies to a deferral. On 2026-09-20 three screens were left out of
the width matrix because they "needed their own `expo-router` mocks" — a real
change to that file rather than three lines. They needed nothing of the kind;
the shared mock already had everything, and the whole job took under an hour.
**An estimate made from the outside is a guess with a number on it**, and the
cheapest way to check a deferral is to spend ten minutes trying it. The reason
this belongs beside the plant is that it is the same instinct: reasoning about
a thing instead of touching it, because the reasoning feels sufficient.

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

### The sharper form: plant an input from the class where the two differ

2026-09-21, and it is `multi-magic-mobile-41`'s statement of it rather than
mine. "Plant the break and watch it go red" is the practice; this is why it
sometimes does not work.

`AiChat.tsx` chooses which chat to open with

    Number.isFinite(stored) && stored > 0 ? stored : aiConv.id

A test was written for it, and the planted weakening was `stored || aiConv.id`.
**The suite stayed green.** The test used `'not-a-number'`, and
`Number('not-a-number')` is `NaN`, and `NaN` is falsy — so the weak form falls
back correctly for exactly that input. The two implementations **agree on the
entire class the test drew from**.

They differ on one class only: a **negative** value, which `||` treats as
truthy and would hand to the server as a conversation id. One test with `'-5'`
separates them; no amount of testing `'not-a-number'` ever will.

So:

> **A test distinguishes two implementations only if its input is drawn from
> the class where they differ — and finding that class is the work.**

Planting is what reveals you have not found it. A plant that leaves the suite
green does not mean the code is untestable; it means the input is from the
wrong class, and the next question is *which inputs would these two disagree
about?* — a question about the code rather than about the test.

The same file produced the other half of the lesson twice over: an assertion on
`.catch` behaviour that could not fail in two successive versions, because both
watched things that were true with or without the `catch`. The third watched
the only observable difference. **Two of five tests in that file asserted
something their first draft could not distinguish**, and both were found by
planting rather than by reading.

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

**And a fifth, about the other end of the same pipe: a check that resolves a
handle against the SOURCE cannot see a handle the RENDERER duplicates.**
`flow_lint.py` reads `testID="event-repeats"` in the file, once, and reports
it resolved — but every lucide icon passes its `testID` to both its wrapper
and the `Svg` inside it, so `getByTestId` on any icon in this app throws
*"Found multiple elements"*. The source is not the tree. A grep over source
answers a question about what was written; the defect lives in what was
rendered, and nothing that reads files can reach it.

Flagged by the session holding the device. The session that agreed with the
warning in a reply walked into it within the hour, which is why it is now a
comment at the call site (`EventRow.test.tsx`) rather than only in a message.

**A relative, from the same evening, and the sharpest form of it.** A session
chasing this very report ran `pkill -f 'while :; do :; done'` and killed its
own shell — because the process running the pattern had the pattern on its
command line. `QA_HANDBOOK`'s `pgrep -f maestro` trap, walked into by the
person who wrote it into `CLAUDE.md` that morning. It is §10 turned inside
out: not a search that misses a spelling, but **a search whose own invocation
is inside the set it searches.** Same root — the pattern was treated as if it
named an idea, when a pattern only ever names characters, and the characters
were also in the searcher.

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

**And that fourth one fails in the opposite direction from the other three,
which is worth separating out.** The first three all *under*-reported: a key
left unresolved, three literals left untranslated, three sheets left uncounted.
An under-reporting gate wastes protection you thought you had, and the damage is
whatever the missed thing goes on to do. The quote hole would have gone the
other way — a **live** key reported as dead — and the output of a gate is not
information, it is an instruction. That one would have produced a confident,
mechanically-derived instruction to delete a working string, with a green suite
behind it. An under-reporting gate spends your attention; a gate that
over-reports in this direction spends your trust *against* the code, and it is
much harder to argue with, because arguing means disbelieving the check.

So when a search term turns out to be a hypothesis about how people write, ask
which way the error runs before deciding how much it matters. Both are worth
fixing. Only one of them tells you to break something.

Writing the rule down did not protect the file the rule was written from. §2's
corollary, one level up.

---

## 11 · A diagnosis that was right about what it ruled out and wrong about what it ruled in

**2026-09-19, and the wrong half reached a commit message and two reports
before the right one arrived.**

Two suites failed in a full run: `ScopeDialog` once, `PendingFiles` the next
time. Each passed alone in under a second after taking sixteen under load.
Both were untracked files belonging to another session.

The experiment was sound. I stashed my own three changed files, ran the whole
suite against the same tree, and it came back green — so my change was not the
cause. That conclusion was correct and it is the only thing the experiment
supported.

Then I attached a cause: **flaky under parallel contention**. It fitted every
observation. A different suite each run, a twentyfold slowdown under load, and
green in isolation are exactly what test pollution looks like, and the machine
really was at load 25.

The real cause was that a sibling session was **planting breaks** in those two
components to check its new tests could fail. Seconds each, reverted
immediately. I ran the suite inside the window, twice, and caught two different
plants. *"A different suite each time"* was two different plants. *"Green
alone"* was after the revert. There was nothing left to find by the time I
looked, because the evidence had already restored itself.

> **The rule: a controlled experiment licenses exactly one conclusion, and
> "not me" is not "therefore this".** Ruling yourself out is cheap and worth
> doing; naming the cause is a second claim that needs its own evidence. When
> the observation is *"something changed underneath me"*, the only honest
> report is that sentence — and in a tree three sessions share, **the first
> hypothesis should be another session, not the machine.**

What made it costly rather than merely wrong is that the wrong half travelled:
it went into `bf0ec10`'s message and into a report, and "flaky" was repeated
onward by somebody who had no way to check it. The observation would have
travelled just as usefully without the cause attached.

**Fixed at the source too**, by the session that was planting: planting a
break is a destructive edit to state three sessions share. It is invisible in
a normal repo because it lasts seconds; here a sibling running `npm test`
inside the window sees files they do not own going red, and the honest reading
of that is wrong. Announce the file and the window, or plant when nobody else
is running — in `CLAUDE.md` as of `240cf14`.

Which means this file now argues both halves: **plant the break** (§2), and
**say when you are about to**, because in a shared tree the cost of your plant
lands on whoever is being careful at that moment.

---

## 11 · Two assertions that could not fail for the reason they were named after

**2026-09-19, both mine, both within an hour, both found only by planting.**

§2 says a test that has never failed is a hypothesis. These are the sharper
case: tests that **did** have a reason to fail, written deliberately, against
code that could break — and could not detect the break, because the thing being
asserted and the thing being guarded against **agree with each other today**.

**One.** `edited` on a changed message was a bare English literal. Fixed to
`t("thread.edited")`, with a test named *"comes from a key rather than from a
literal"*:

```ts
expect(screen.getByText("edited")).toBeTruthy();
```

English's value for `thread.edited` **is** `"edited"`. The assertion passes
against the literal it was written to forbid. It asserts in French now —
`modifié` present, `edited` absent — which is the only place a key and a literal
differ.

**Two.** `msg-retry` carried its name only through its child `<Text>`, which is
how a French screen reader came to read an English literal as the button's whole
name. Fixed by pinning `accessibilityLabel`, with a test named *"names the way
back, rather than leaving it to whatever text is inside"*:

```ts
expect(screen.getByTestId("msg-retry")).toHaveAccessibleName("Not sent. Tap to retry.");
```

React Native computes the accessible name from descendant text when no label is
given, and the child renders the same string — so deleting the label leaves the
computed name **identical**. The assertion cannot see the pinning at all. There
are two assertions now: the computed name, which is what a person hears, and the
prop, which is the pinning, with the reason written beside it.

### What they have in common, which is the useful part

Neither was lazy and neither was wrong about the app. Both asserted **the
outcome** — the right instinct, and this file argues for it elsewhere — in a
case where the outcome is produced identically by the mechanism and by the
accident. *A correct value arrived by luck is indistinguishable from a correct
value arrived by design, and only the design survives the next edit.*

So: **when a fix replaces one source of a value with another, ask whether the
two sources currently produce the same value.** If they do, the outcome cannot
distinguish them and the assertion has to reach for the thing that differs — the
other locale, the prop, a second render. Both of these were caught by planting,
neither by reading, and the second was caught by a plant aimed at something
else entirely.

> **The rule: name what the test would have to see, then check that it can see
> it.** "Comes from a key" is invisible while the key's value equals the
> literal. "Is named explicitly" is invisible while the explicit name equals the
> inherited one. A test's name is a claim about a mechanism; its assertion is
> usually about a value; and the gap between those two is where a green lives
> that means nothing.

---

---

## 14 · A check that can only report success, and a habit fixed in one place

**2026-09-20. Two instances, hours apart, the second after the first was
found, written up, and passed on to another session.**

Every gate in this repo was being run by hand like this:

```sh
npm run lint 2>&1 | tail -1
```

**A pipeline's exit status is the last command's.** `tail` always succeeds, so
the `&&` chain after it walked past a failing gate into a commit, twice:

1. **`71bc742`** landed on `main` with eslint red. Found immediately, fixed in
   `03ee80b`, written into that commit message, and passed to the session
   holding the device so it could check the rig for the same shape.
2. **The `sdk-57` branch had been red since the compiler audit**, and I had
   reported it green twice in the interval. Two causes underneath — three
   React Compiler rules flipped to `"error"` by a `sed` and never reverted,
   and an unused `useRef` left by my own refactor — and **both were invisible
   for exactly the reason I had already found and fixed on main.**

> **The rule: correcting a habit in the place you found it leaves every other
> place still doing it — and you will trust those places MORE afterwards, not
> less, because you believe the habit is fixed.** The fix is not the fix. The
> sweep is.

### What the sweep found, which is the better half

Every committed file was already clean:

| Where | State |
|---|---|
| `qa/*.sh` — all six | **already `set -o pipefail`** |
| `package.json` scripts | no pipelines |
| `.github/workflows/ci.yml` | five bare `run:` steps |
| `.githooks/pre-commit` | `set -e`, gates invoked bare or redirected — no gate pipeline |

**So the defect was never in the repository. It was in the human in the
loop**, and the repository was already more disciplined than the person
typing into it — six scripts set `pipefail`, presumably because somebody met
this before and fixed it *there*.

`pipefail` is now on the hook too, for consistency rather than as a fix, and
it says so in the file.

### Why this one is different from the other thirteen

Every earlier entry is a **test or a rule** that could not see a defect. This
is the first where **the gate was right and the thing reading the gate was
wrong** — and the reader was a person, so nothing in CI would ever have
caught it. A check that can only report success is the shape this file has
now met five times; this is the first time it was the harness around the
check rather than the check.

Read exit codes directly:

```sh
npm run lint >/dev/null 2>&1; echo "lint=$?"
```

### And the hardening produced the mirror image, the same day, in my own hands

`qa/verify_activate.sh` was written hours later with `set -euo pipefail` at
the top — the discipline this entry argues for. It then read an optional
value:

```sh
PGUSER_MM="$(grep -m1 '^POSTGRES_USER=' "$MM_DIR/.env" | …)"
```

A `grep` that finds nothing exits 1. Under `set -e` that **killed the script
before it reached the `${VAR:-default}` fallback written on the next line** —
exit 1, no output at all. A check whose entire job is to report something
became a check that could only ever report nothing, and did so silently.

> **`set -e` turns every command that is allowed to fail into a command that
> must not.** The same flag that stops a pipeline hiding a failure will hide
> an entire script, and the failure it produces is worse: a swallowed exit
> code still runs the rest of the program, while `set -e` on a legitimate
> non-zero stops it where nobody is looking. Mark the ones allowed to fail —
> `|| true` — at the moment you add the flag, not after somebody finds the
> corpse.

**Two of the four instances in this entry are the same person on the same
day, and the second was caused by fixing the first.** That is the strongest
argument in this file for the rule above it: correcting a habit changes what
you do next, and what you do next is where the next one lives.

### A third instance, and the reason the second one is always harder

The session holding the device moved a language restore into an `EXIT` trap
so it would survive a kill rather than only a clean return — the right
correction, for the right reason, made *because* of the cleanup-only-on-the-
happy-path finding earlier that evening. Then it read the loop the trap
depends on: `echo "$COMBOS" | while read` runs its body in a **subshell**, so
the flag the trap tests is set in a process that no longer exists by the time
the trap fires.

**The fix was dead on arrival and its failure mode was silence** — not an
error, just the QA account quietly staying in French for whatever ran next,
which is the exact thing the trap had been written to prevent. It was caught
by *reading* the loop after writing the trap. Nothing would have failed.

> **The second error is systematically harder to see than the first, because
> the first one taught you what to look for and the second one is somewhere
> you have just stopped looking.** You arrive at it carrying a fresh, correct,
> specific idea of the danger — and that idea is a torch pointed away from
> wherever you now are.

Three instances, two of them fixes-of-fixes, three different people-shaped
mistakes in one evening. **This entry's own history is its argument**, which
is the least comfortable and most useful thing in this file.

---

Found by the session running the script. Its fix was right and its
explanation was not, which is the third finding: it read the failing grep as
*"`.env` sets neither variable"*. `.env` sets **both, twice each**, as
`export POSTGRES_USER=…` — and `^POSTGRES_USER=` cannot match a line starting
`export `. The read had been dead all along and the default happened to be
correct, which is why nothing ever complained. `qa/preflight.sh:162-163`
carries the identical anchor and its migration guard — the one protecting his
real database — has been running on that fallback ever since.

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

---

## 12 · Prove the fix on the cheapest case first

*(There are two sections numbered 11 above. Left as they are — renumbering
another session's file mid-night is how a cross-reference stops resolving.)*

**The rule.** When a check, a gate or a rig is repaired, re-run it on the
**cheapest case that can show the repair worked** before re-running it on the
expensive one that motivated it. A fix is a hypothesis about a mechanism, and
the cheap case tests the mechanism for a fraction of the cost.

**2026-09-19, four attempts at one picture set.** The picture pass shoots nine
screens at a width. 360 dp costs about two minutes; 800 dp costs the same but
needs a size AND density change, an app relaunch and a settled display, and it
is the combination where everything goes wrong. Every repair that night was
verified by going straight back to 800.

The three failures, all in the instrument rather than the app:

1. `wait_for_geometry "$1"` — inside the loop body `$1` is the **script's**
   argument, not the width. It asked the device for a window `800-light` px
   wide, which nothing will ever be, and refused with a message that read
   exactly like the display failing to settle. `return` was also used in a
   `while` body rather than a function.
2. `screens.sh` never set `USE_DEV_BUILD`, so `APP_ID` resolved to **Expo Go**.
   The pass had always worked anyway, because `login.yaml` does `launchApp`
   (Expo Go) and then `openLink` with the dev-client URL, which hands over to
   our own app. It surfaced only once something **outside** maestro had to
   launch the right binary.
3. The check read the root node of `uiautomator dump`. **That dump describes
   the foreground window, not the display.** With an ANR dialog on screen the
   entire dump is the dialog, there is no `[0,0]` root at all, and the check
   reported "window reports nothing px" while the display had settled
   perfectly.

**Every one of the three would have appeared at 360 dp**, for two minutes each,
and each was instead discovered by a full 800 dp attempt. Three of them in a
row, and then the battery went before any fix could be proved green.

**What this is not.** It is not "the checks were bad". Two things stayed true
all night and the rule depends on both:

- **The one false picture that escaped did so BEFORE the check existed.** It
  reached the owner, who photographed a sign-in screen with every line clipped
  and sent it up as a product defect. Nothing has escaped since.
- **All three failures were the check REFUSING TO SHOOT.** An instrument that
  fails closed costs time; one that fails open costs credibility, and the
  second is what the deleted 800 dp set nearly spent. Refusing for the wrong
  reason is the right direction to be wrong in.

So the cost of not having this rule was three wasted expensive runs, not a
false result — and that is exactly the failure mode worth a rule rather than
an apology. The remedy is one line of discipline: **fix, then reach for the
two-minute case, and only then for the one you actually want.**

**Karwan's corollary, and it is the better half:** the cheapest case is also
**the one you can afford to run twice**, which is what turns a value into a
reading. A single number from an expensive run is a value — you accept it,
because getting another costs what the first one did. Two numbers from a cheap
run are a reading, and the second is what tells you whether the first was
about the thing you meant. It found the clipping bug below by happening to
scroll and measure again; a two-minute case makes that second measurement a
habit rather than an accident.

**And the same night gave the two halves of one mistake**, which are worth
seeing side by side because they look nothing alike from inside:

| what you read | the real number is about |
|---|---|
| a **child** node's bounds | the wrong **region** — clipped to what is visible |
| the **root** node's bounds | the wrong **window** — whatever is in front |

Karwan's cost a false 31.6 dp touch target on the role whose premise is huge
targets in sunlight; a scroll and a second measurement made it 56 dp, exactly
its token. Mine cost two refusals on a device that was ready. **Both
instruments were honest and both readers were not.**

Related: §10 asks which way a gate's error runs. `qa/QA_HANDBOOK.md`'s "a check
that returns SOME of the answer is the hardest kind to doubt" asks how
convincing its output is. This one asks what you re-run after changing it.

---

## 13 · A test that never re-renders cannot see a stale closure

**2026-09-20, on the SDK 57 branch, found by planting — and the tests it got
past were not vacuous.**

Three hooks kept a "latest callback" in a ref, written in the render body:

```ts
const onFinalRef = useRef(onFinal);
onFinalRef.current = onFinal;      // ← rejected by the React Compiler
```

SDK 57's eslint config rejects that, so it moved into an effect. To check the
move was safe, the update was deleted outright — so the hook would call
whatever callback it was handed on its **first render, for the rest of the
session.**

`useAssistantEcho`'s suite caught it. **`useSpeechToText`'s did not: every one
of its tests stayed green.** The defect that shape ships is a dictated sentence
appended to a draft belonging to a conversation the person had already left —
the composer re-renders on every keystroke and passes `onFinal` inline, so the
ref is the only thing keeping the callback current.

### Why this is not §2 again

**The tests were not vacuous and they were not weak.** They test the right
things — availability, permissions, the four failure sentences, interim and
final transcripts — and every assertion in them can fail. What they never do
is **render the hook twice with a different callback.**

A stale closure is invisible to any test that renders once. There is no
assertion to strengthen, no name that overclaims, nothing wrong with the file
at all. The gap is not in what it checks; it is in the *shape of the exercise*
— one mount, one prop set, one interaction. A whole class of bug lives on the
far side of a second render and cannot be reached from this side of it.

> **The rule: when state or a callback is held across renders, the test has to
> re-render.** `rerender` with a different function, then fire the thing that
> calls it, and assert the SECOND one ran and the first did not. Anything that
> mounts once is testing the first render's world, and a stale closure is by
> definition a bug about the second.
>
> And the corollary for refactors: **the compiler-clean form of a ref is not
> always behaviour-identical.** Moving a write from render to effect changes
> *when* it lands. The way to find out whether that matters is to plant the
> stale value and watch — not to reason about the ordering, which is exactly
> what makes it look safe.

The same evening, `ScopeDialog` had the twin: removing the `key` that re-seeds
a dialog whose seed changes **while it is open** left all ten of its tests
green, for the same reason — none of them changed a prop on a mounted dialog.

Both have tests now, both go red when the fix is removed, and `useDraft` — the
hook that decides whether somebody's half-typed question survives a screen
change — had no test file at all.

### And writing THAT file produced the sharpest plant of the night

`useDraft` cancels a storage read when the person leaves a conversation before
it resolves, so a slow read cannot land in the composer of the conversation
they moved to. The new test switched conversations and asserted the composer
was empty. Deleting the `cancelled` guard outright left **all eleven tests
green**.

The test was not missing an assertion. It was exercising a **different
situation from the one its name described**: conversation four had nothing
stored, so the slow read resolved to `null`, and there was nothing to arrive
late. It proved that **null is not a draft** — true, and useless.

The race needs the read to be both slow *and* non-empty. It holds a deferred
promise now, releases it after the switch, and the same deletion turns it red.

> **A plant that reveals the test was exercising a different situation than its
> name says is a sharper instrument than one that reveals a missing
> assertion.** A missing assertion is visible on reading; a test whose *setup*
> cannot produce the condition is not, because every line of it is correct.
> The only way to find out is to break the thing it claims to watch.

That is twice in one evening that a plant was the only thing between a
confident green and a report.

### The free instance of the opposite shape

Reading the chat spine for the same refactor turned up
`setStatus(conversationId == null ? "loading" : "loading")` — both branches the
same value. **Code that reads as a decision and decides nothing**, which is the
mirror of a test that reads as a check and checks nothing, and survives for the
same reason: it looks considered.

---

## 15 · Two sessions remembered doing the same night's work

Every entry above is a gate that was honest about the wrong question. This one
is the same failure with a **session** in place of a gate, and it is the only
one where the instrument that failed was a memory.

**2026-09-21.** Two sessions were opened on this repo minutes apart. Both were
asked what they remembered. Both answered, in first person and in detail, that
they had done the previous night's device work: the twelve flows and their
verdicts, the picture pass to eight of eight combinations, the store
screenshots after finding this AVD is 2.22:1 where Play rejects past 2:1, the
listing draft, and the `activate` proof — `ai_session_id` 269 → 263, *New chat*
→ *Do I owe anyone money?*, QA user 494.

**Those cannot both be first-hand accounts of one night.** At least one was
reconstructed from having read the repo, and **neither session could tell which
it was.**

### Three measurements were tried. All three failed, and how they failed is the
### useful part

| what was measured | why it settled nothing |
|---|---|
| the session's own scratchpad | recreated today at 09:23 and **empty** — the battery death overnight wiped `/tmp`, so the absence of yesterday's files means nothing |
| `ListAgents` process start times | the sibling's process started three minutes ago — but **a resumed session also starts a new process**, so it does not separate resumption from a fresh start |
| the transcript on disk, 19.6 MB | a size consistent with a long session, and **equally consistent with reading one as with writing one** |

**And git cannot answer either.** Every commit in this repo is authored
`Hama99o`, because the sessions share one checkout and one identity. There is
no field in a commit that says which session wrote it. Whether the trailer
should carry a session identifier is a change to how this project commits, and
therefore **his call, not a session's** — it has been put to him with the
reason, which is that today it mattered and git could not answer.

### The discriminator that the subject could read

The supervisor proposed settling it by asking each session to name something
"only the session that did the work could know" — specifically that a geometry
check had failed by reading the **foreground window** rather than the display,
which it believed had never been written down and had only reached it in a
report.

**It is in the repo, in two files:** `qa/qa.config.sh:155` and
`qa/FLOW_REGISTER.md:511`, both in those words. Any session that had read them
could produce it in first person, in detail, with feeling. **The test would
have passed both and proved nothing** — and it would have allocated the work on
that basis.

**A discriminator the subject can read is not a discriminator.** That is §10's
shape — a correct search for a true spelling, answering a narrower question
than the one being asked — arriving one level up, in the method rather than in
the code. It was built by choosing a detail from memory without checking
whether it was on disk, which is the exact error it was designed to catch.

### The rule

**"I remember doing X" is not evidence anywhere in this project.**

No session asserts anything from recall — not about the code, and not about its
own past. **It checks on disk first.** That is already the house rule for
everything else here; it turns out to apply to the authors as much as to the
work.

The smaller version of this had already happened twice the day before, both
times caught with `git log -S` rather than by argument: one session claimed two
documents it had only read, and another claimed a `TESTING.md` entry that was
not its. Those were corrected in minutes. **This one could not be corrected at
all**, which is the difference between reconstructing a fact and reconstructing
a night.

### How the work was actually split, since the memory could not settle it

**By where the work is, not by who remembers doing it** — a criterion that
needs nobody to be believed. The device half is nearly empty today: every flow
carries a dated verdict, none red, and the one outstanding device task is a
re-proof of something already proved. The code half is larger. Both sessions
reached that description independently, which is worth noting and is *also* not
evidence of anything.

---

## 16 · Empty output defends itself. Plausible output does not.

§10 asks which **direction** a gate's error runs. This asks something else:
**how convincing the wrong answer looks**, and therefore whether anybody goes
and checks.

**The rule.** A check that returns *nothing* announces itself — nobody reads a
blank result as an answer. A check that returns *something plausible* ends the
investigation, because a number that could be right looks exactly like a number
that is right. **The dangerous failure is not the silent one; it is the
articulate one.**

### Four instances from one week, all of them real

**The picture count, twice, in the same direction.** `screens.sh` reported
`9 of 9` for a run that shot **nothing** — it was counting files in `ours/`
from the previous day. Later it reported `10 of 9` for a complete run, because
it had started counting the run directory and caught `login.yaml`'s own
screenshot. Both numbers came from the wrong set. **The `10 of 9` was fixed
within a minute and the `9 of 9` survived a full run and was committed**,
because nine of nine is what a correct run looks like.

**The geometry check.** Its first version read the root node of a
`uiautomator dump` and reported `window reports nothing px` — investigated
immediately, because "nothing" is obviously not an answer. Its *underlying*
bug was worse and went unexamined for longer: the dump describes the
**foreground window**, so with an ANR dialog on screen it returned a real,
correct number about a window that was not the app's.

**The `ICON` detector**, built to find handles that resolve to two nodes. Its
first version found **one of three** — a flat `\{[^}]*\}` stopped at the `}`
inside `${session.id}` — and printed a clean, non-empty list. *A zero would
have made me look. A one made me believe it.*

**A guard test on the web client.** `stored || aiConv.id` and
`Number.isFinite(stored) && stored > 0` agree on every input **except a
negative**, because `Number('not-a-number')` is `NaN` and `NaN` is falsy. The
test fed it a non-numeric value — the class where the two forms agree — so it
passed against both and could not have separated them.

### What to do about it

**When a check reports a count, work out what the count should be before
reading what it is.** For the `ICON` case the answer was knowable from the
source in about ten seconds, and asking first would have turned a believable
`1` into an obvious `1 of 3`.

**And when a check reports a value rather than a count, ask which inputs would
make two candidate implementations disagree, then use one of those.** A test
distinguishes two implementations only if its input is drawn from the class
where they differ; finding that class *is* the work, and it is the part
"plant the break" does not tell you how to do.

*The count instance was found while building the picture pass; the general
form is `8a`'s, from reading it back. Neither of us had written it down, which
is why it is here — §15 is about exactly how little a session's memory of a
thing is worth.*

---

## 17 · A gate that reported the pipe's exit code, and a linter run on one file

Two greens on 2026-09-21, both false, both from running a gate in a shape that
looks like the gate and is not it. Neither is about a test. Both are about
**how the answer was read**, which is why they belong here rather than in a
tooling note nobody opens when it breaks.

### The suite said exit 0 and had 24 failures

The full backend suite was run in the background as

    bundle exec rspec 2>&1 | tail -25

and the harness reported **exit code 0**. It was `tail`'s. A shell pipeline's
status is the status of its **last** command, and `tail` succeeds at tailing a
failure exactly as well as it succeeds at tailing a pass. The output sitting
directly above that `0` was rspec's "Failed examples:" list — twenty-four of
them — and it was read as a pass anyway, because the exit code is the thing you
look at and the exit code said what it said.

*(Those twenty-four were `NameError: uninitialized constant Vips::Image`:
libvips is not installed on this box and `.github/workflows/ci.yml` installs it,
so they cannot pass here and pass in CI. The diagnosis was right. The green it
was attached to was not.)*

**What to do.** Do not pipe a gate into anything when the exit code is the
answer you want. If the output must be trimmed, trim it afterwards, or read
`${PIPESTATUS[0]}`, or write the full output to a file and tail the file. And
when a long command reports success **instantly**, that is the tell: the thing
that exited is not the thing you ran.

### The linter said no offenses and the repo was red

Rubocop was run on the one file that had just been edited:

    bundle exec rubocop spec/requests/api/v1/legal_spec.rb
    1 file inspected, no offenses detected

CI runs `bundle exec rubocop` with **no argument**, across all 337 files, and it
was failing — on `spec/requests/api/v1/ai/speech_spec.rb`, a file that had not
been touched and that had been red since an earlier commit. The deploy job needs
`[rubocop, brakeman, bundler_audit, rspec, frontend]`, so **nothing had deployed
since**, silently, including a privacy-policy change that a store reviewer
opens.

A per-file run is a strictly weaker claim than the gate it resembles: it proves
your file is clean, and says nothing about whether the gate passes. The two
answers are the same words.

**What to do.** Run the gate the way CI runs it, argument for argument. And when
a gate has been green locally for a while, check the actual CI result rather
than inferring it — a red that predates your change still blocks your change.

### The sibling shape: an error that names the wrong cause

Not a false green, but the same lesson from the other side, and it belongs
beside these. `openssl pkcs12 -export` on OpenSSL 3 defaults to AES-256.
node-forge — what EAS reads a `.p12` with — cannot open that, and reports it as
**a password error on a password that is correct**. The fix is `-legacy`; the
cost of not knowing is an evening spent re-typing a password that was never
wrong. It is in `docs/APP_STORE_CONNECT.md` §2 beside the command that needs it.

The common thread with the two above: **the message you get and the problem you
have are different objects**, and the gap is where the time goes.

## 18 · Planting the instruments themselves, 2026-09-24

The rule is "a test that has never failed is a hypothesis". This is the same
rule applied to the checkers, one feature removed at a time. Five suspected,
two dead, three alive, and the survivors are written down so nobody
re-suspects them.

**Dead, and fixed:**
- `src/i18n/__tests__/keys.test.ts` could not see a key written as DATA
  (`labelKey: "…"`, the sign-up key maps). A theme option labelled
  `appearance.doesNotExist` left 77 suites and 869 tests green. It now also
  collects key-shaped literals whose namespace exists (`e261c4c`).
- Nothing caught words typed straight into a `<Text>`. A planted sentence
  passed every gate; Jest noticed only when it replaced a key that then went
  unused. Now a lint error (`505640a`), which closes the class and not just
  one instance: a new sentence without a key is caught too.

**Alive on plant, and what each one actually proves:**
- `src/__tests__/a11y.test.tsx`, "finds no nameless Pressable": removing the
  name from the icon-only *Clear read notifications* button fails it. It
  proves every press handler in `app/` and `src/` has a name. It does NOT
  prove the name is right, or that the control can be reached.
- `src/i18n/__tests__/locales.test.ts`, "no French value that is still the
  English one": setting `whySkip` to "Skip" in `fr.ts` fails it. It proves
  no French value was copied from English, apart from the reasoned exceptions
  in `SAME_IN_BOTH`. It does NOT prove the French is good.
- `ScopeDialog.test.tsx` caught a planted scope option, but **by accident**:
  it counts the options. It is not a key check, and it would not catch a
  wrong label on an existing option.

**And the instrument that was dead on arrival:** the first trial of the
`<Text>` rule used a config that crashed ESLint. Stderr went to `/dev/null`,
so the crash read as "0 findings", which is §16's shape exactly, a minute
after it was the thing being hunted. Show a new check firing before
believing its silence.

**A green run means two numbers.** `e262136` was committed on "tests passed"
while a whole suite had failed to RUN: "1 failed, 76 passed; 733 tests",
where the full count is 869. A suite that crashes on import reports zero
failures for every test in it. Quote the suite count AND the test count, and
compare the test count with the last one.

**A comment that says HOW something works outlives the how.** Three stale
behaviour comments were found on 2026-09-24, and all three described a
mechanism that had since been replaced: notifications "optimistic, put back
on failure" (no optimistic step existed), the feedback contract (changed by
`622c25b`), and the assistant chat's "stays as a bubble" (replaced by
`85585e8`). A comment that says WHY survives a refactor; one that says WHAT
does not. When a comment claims behaviour, the claim belongs in a test, and
the comment shrinks to the reason. The test goes red when the claim stops
being true; the comment never does.

**Worse than a stale comment: one that forecloses an option.** The fourth on
2026-09-24, in `Arriving.tsx`: Reanimated's worklets "would not run here"
for want of a babel plugin. They would: `babel-preset-expo` adds that plugin
automatically (`build/index.js:284`). The comment was found only because the
keyboard research needed Reanimated. Left alone, it would have ruled out the
right tool before anyone tried it. A wrong comment that only misinforms is a
nuisance; one that says "this can't work here" is a decision made by a dead
line of text. Before trusting a comment that rules something out, check it
against the source it names.

## 19 · A test that checks something was BUILT passes for code that never runs it

Found 2026-09-24 in the author's own test, minutes after writing it.
`OpeningAnimation.test.tsx` was meant to prove the opening starts on mount
instead of waiting for the Reduce Motion answer. It asserted
`Animated.sequence` had been called. A plant that kept building the sequence
and moved only its `.start()` behind the promise left it green, because the
object was still constructed on mount. The freeze it was meant to prevent,
0.72 s of tiles standing still, would have shipped under a passing test named
after its absence.

The shape is general. An animation, a subscription, a request, a timer: each
is an object first and an effect second, and a spy on the constructor sees
only the object. A factory call proves the code *could* do the thing. Assert
the call that makes it happen (`start`, `subscribe`, the fetch, the timer
firing) or the outcome. The fixed test wraps the composite's `start` and
counts that (`34e179b`).

The same plant pass found the opposite case, and it belongs here so nobody
"fixes" it. Deleting the `stop()` on the Reduce Motion path stayed green, and
that is correct. Starting the fade on `cover` already stops the `parallel`
that animates it, and with it the burst, so the line is redundant. A plant
that survives does not always mean a dead test. Sometimes it means the code
it removed was dead. Say which, in the file.

**Then the class, the same evening.** The same plant, `.start()` removed, was
tried on every other animated component with a test: `ThinkingDots`,
`Arriving`, the skeleton pulse and `KeyboardPadding`. **All four suites stayed
green.** Two of those would have been visible defects on every use. `Arriving`
sets a new message to opacity 0 before fading it in, so the message would
never appear. `KeyboardPadding` would leave the composer under the keyboard.
Each test spied on `Animated.timing` and checked its config, which is the
construction.

Closed as a class rather than four times:
- `watchTimings()` in `src/__tests__/animated.ts` wraps each timing's own
  `start`. It records the ones that ran, including those started by a
  `loop`, `sequence` or `stagger` around them.
- All five suites now assert on what STARTED. The same plant turns every one
  red, the opening included.
- A lint rule (`animated-spy` in `.eslintrc.js`, fixture
  `eslint-fixtures/animated-spy.ts`) refuses `jest.spyOn(Animated, …)`
  everywhere except that helper. The next test to watch an animation cannot
  make the old mistake without being told.

It does not cover `jest.mock` of the whole module.

**And "started" is not "the right thing moved".** A fade started on some
other `Animated.Value` passes every check on what started. The obvious
outcome check does not work here: under the test renderer an animation never
reaches the rendered props. A view animated 0 → 1 still reads
`{ opacity: 0 }`, native driver or not (probed 2026-09-24), because Animated
updates the view directly and not through React. So a test on
`props.style` reads the first frame for ever. `boundValue()` in the same
helper reads the `Animated.Value` the view was actually handed, which is the
subject. `Arriving` and `KeyboardPadding` now assert where their view ended
up: fully visible, and the spacer at the overlap and back at 0. A fade on the
wrong value is red in both.

The first version of the `Arriving` outcome test was toothless too, for a
new reason. The view starts at opacity 1 and drops to 0 only after Reduce
Motion answers, so asserting "ends at 1" before the fade exists passes for
anything. It now waits for the fade to be built first. **An outcome
assertion that holds at the starting state proves nothing.** Make sure the
state you are checking had to be reached.

Not covered: the dots and the skeleton loop for ever and have no end state,
so they keep the "started, natively" check only.

**An exemption that matches TEXT cannot tell code from commentary.** Found
2026-09-24 in the French render sweep (`screens.render.test.tsx`). To excuse
fixture data, the English words the test feeds in, it exempted every
double-quoted string in the test file. That file's comments QUOTE the bugs
the sweep exists to find ("11:30 AM", "Sep 18"), so writing a bug down made
the sweep blind to it. With the region-formatted time planted back, the
sweep stayed green. **The more carefully a check is documented, the wider
that hole gets.** It was found only by planting AGAIN after the fix and
noticing green. It now reads code only, comments stripped. Anyone building an
allowlist by scanning a file is one comment away from the same thing: scan
the structure you mean (literals in code, keys in a map), never the text.

**The same hole twice more, the same night.** The fixture stripper's regex
required four characters inside it, so past a short literal like `"Qa"` the
quote pairing slipped and it matched `", lastName: "` as a string. It cried
wolf; the same defect could as easily have swallowed a real string. Then,
once comments were excluded, TEST TITLES and ASSERTED strings still counted
as data: `chat.test.tsx` names a test "Ask again re-sends the last
question" and asserts `getByText("Ask again")`, so a hard-coded English
"Ask again" was cut out and the sweep stayed green. **A scanner's own
parsing is part of what it measures.** Decide what a string IS (data fed in,
text asserted, a name, a comment) before deciding whether it excuses
anything. The stripper now matches every literal and drops the short ones
afterwards, and skips titles, queries and matcher arguments. A string
passed any other way still counts as data, and that limit is written in
`src/__tests__/i18nSweep.ts`.

**A wait on a mock's call HISTORY passes on the previous render's calls.**
Found 2026-09-24 in the assistant sweep (`app/__tests__/chat.test.tsx`),
which renders the screen twice in one test. `waitForSession()` waits for
`toHaveBeenCalledWith({ conversationId: 4 })`. In the second render the
first render's call was still on the mock, so it returned at once, before
that render had its session. The send then landed on a screen with no
conversation to send to, and "send failed" never appeared, because nothing
was sent. It was red one run in two to three. My first diagnosis, the
reachability probe left running, was wrong; it was fixed anyway, because a
leaked timer is wrong on its own. The real fix clears the mock before each
render. **A wait is only evidence about the state it was waiting for if the
thing it reads could not already have been true.** That is §19's starting
state again, in time rather than in content.

**A comment claiming a feature EXISTS stops anyone building it.** Found
2026-09-24 in `app/chat.tsx`. The documents poll's header explained that
without it "the chip a user just uploaded says pending for ever". No such
chip existed: after an upload, a chip showed name and size whatever the
server did, so a file the server could not read looked ready. The earlier
false comments described a mechanism that had since changed, and they
misled a reader. This one described a feature that had never been built,
so nobody built it. A comment that says "X shows Y" is a claim about the
UI, and the UI is the only place to check it.

### The family: a check that is true for a reason unrelated to its claim

Eight instruments in this repo, built on 2026-09-24, were each green on
their first run and blind. Every one was found by a plant, and several only
by planting AGAIN after a fix. They share one sentence: **the check was true
for a reason unrelated to the claim.**

| # | What it claimed | Why it was true anyway |
|---|---|---|
| 1 | the opening starts on mount | it checked the animation was BUILT |
| 2 | four animated parts run | each spied on the constructor |
| 3 | a message ends visible | it starts visible, and it asserted before the fade |
| 4 | the chats screen reads French | it swept before the list's data arrived |
| 5 | no region-formatted time | its own comments, quoting the bug, excused it |
| 6 | "Qa Mobile" is fixture data | a regex's quote-pairing slipped (false positive; could as easily hide) |
| 7 | "Ask again" is translated | the test's title and assertion, containing it, excused it |
| 8 | a radio announces its state | the framework adds an empty state object |

And one more in time rather than content: a wait on a mock's call history
passed on the previous render's calls. The general form, for the next
instrument: **before trusting green, ask what ELSE would make this true.**
`docs/INSTRUMENTS.md` has each as a recipe for the web.


**A leak between TESTS is the same family as a leak between people**
(2026-09-25, `useDraft.test.ts`). One test replaced `AsyncStorage.getItem`
with `mockImplementation`, which `jest.clearAllMocks()` does not undo. Every
later test that read the same conversation got that test's words back. It
stayed invisible until a later test read that conversation, which is when a
new draft test went red for a reason that had nothing to do with it. The
fix restores the real implementation before each test. The general rule:
**whatever a test replaces, the next test inherits unless something puts it
back**, and `clearAllMocks` clears calls, not implementations.
