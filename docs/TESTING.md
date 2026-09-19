# What our tests cannot see

Four gates run on every change: `npm run lint`, `npm run typecheck`,
`npm test`, and `npm run bundle`. This file is about the times **all of them
were green and the app was broken** — each entry is an instance that actually
happened in this repo, what it cost, and the gate that now catches it.

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

## What each gate is actually for

| Gate | Proves | Cannot see |
|---|---|---|
| `npm run typecheck` | the shapes agree | anything about runtime, bundling, or words on a screen |
| `npm run lint` | the banned forms are absent | a banned form with a `disable` comment on it |
| `npm test` | behaviour, under **Node's** resolver and with **no layout** | whether the app bundles; whether anything fits; whether a colour is legible |
| `npm run bundle` | Metro, Babel, NativeWind, expo-router and the config plugins agree — **the app can start** | whether it then works |
| the flows, on a device | it works, for a person | only what a flow asserts |

**Nothing above measures a pixel.** Jest has no layout engine, so no test in
this repo can tell you that a French string fits a 360 dp row or that text is
readable on a dark ground. That is a device and a screenshot, and it is why
`docs/design/README.md` makes a device screenshot at three widths part of
`DONE`.
