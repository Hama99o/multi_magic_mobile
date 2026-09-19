# SDK 54 → 57 — the baseline this is measured against

Branch `sdk-57`, off `362ee00` on `main`, in a worktree so the other two
sessions keep a working `main` while React Native moves three majors.

## The four gates at `362ee00`, before anything changed

| Gate | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **53 suites, 593 tests, all passing** |
| `npm run bundle` | exit 0 |

Recorded before the first install, because after it every one of these will
fail for a while and the only question worth answering is *which failures are
the migration and which are mine*. 593 is the instrument and also the risk: a
test that changes meaning under a new preset is worse than one that breaks.

## Starting point

| | at 54 | |
|---|---|---|
| `expo` | 54.0.35 | |
| `react-native` | 0.81.5 | |
| `react` | 19.1.0 | |
| `expo-speech-recognition` | 3.1.3 | pinned; a 57 line exists (57.1.0) |
| `nativewind` | 4.x | |
| `jest-expo` | sdk-54 | `latest` is 57.0.5 |

## Why, and what it does not fix

Hamma9900's Expo Go is **SDK 57** and Expo Go supports exactly one SDK, so it
refused this project outright — which is why two packet captures saw nothing:
it gave up before connecting. Not a network problem at any point.

**It does not give him the mic.** `expo-speech-recognition` is not in Expo Go
at any SDK version, so dictation stays absent there by design, and that is the
control being absent rather than broken. Read-aloud does work in Expo Go:
`expo-audio` and `expo-speech` are both bundled.

---

## Result: all four gates green on 57, identical to the baseline

| Gate | at 54 | at 57 |
|---|---|---|
| `npm run lint` | clean | clean — **with three React Compiler rules deferred**, see `SDK57_COMPILER_DEFERRED.md` |
| `npm run typecheck` | clean | clean |
| `npm test` | 53 suites, 593 tests | **53 suites, 593 tests** |
| `npm run bundle` | exit 0 | exit 0 |
| `npx expo-doctor` | — | **21/21** |

593 to 593 is the number that matters: not one test was deleted, skipped or
rewritten to pass. Two assertions changed, both because the API they named
changed underneath them, and both are noted at the call site.

## What actually broke, in the order it surfaced

1. **`app.json` schema** — `newArchEnabled` and `android.edgeToEdgeEnabled`
   are gone because both are now unconditional, and `splash` moved into the
   `expo-splash-screen` plugin's own options. `--fix` also added explicit
   config plugins for `expo-audio`, `expo-font`, `expo-image`,
   `expo-splash-screen`, `expo-status-bar` and `expo-asset`.
   **`ios.bundleIdentifier`, `android.package` and the EAS project id are
   untouched** — confirmed against the diff.
2. **`StyleSheet.absoluteFillObject` removed.** `absoluteFill` is now the
   plain spreadable object it used to be, so the five scrims are a rename.
   Checked against RN 0.86's own `.d.ts` rather than guessed.
3. **`ColorSchemeName` lost `null`** and gained `'unspecified'`. Same
   behaviour, a word instead of an absence. The test's NAME was the assertion
   — "with null and not a string" — so both moved together.
4. **`jest-expo` no longer carries the RN preset**: `@react-native/jest-preset`
   is a separate package now, and it must match `react-native` EXACTLY. The
   `latest` tag installs 0.87.1 against RN 0.86.3 and fails looking for a file
   that version does not have.
5. **`react-test-renderer` must match `react`** — 19.2.3, not 19.1.0.
6. **Two new transitive packages ship untranspiled ESM**: `expo-glass-effect`
   and `standard-navigation`, both pulled in by expo-router's native stack.
   They fail with `Unexpected token 'export'` pointing at OUR test's first
   import line, which is what `jest.config.js`'s header has always warned
   about.
7. **A stale `eslint-disable` stopped naming anything.** `no-var-requires`
   became `no-require-imports`, so `cable.ts`'s load-order `require` had
   quietly become a warning. The argument is a literal, so the repo's own
   require rule is satisfied and stays on.

## What this costs on the emulator

**e0's installed dev build is SDK 54 and will refuse this bundle**, the same
way his Expo Go refused SDK 54 — that is the whole bug, seen from the other
side. The native layer moved from RN 0.81.5 to 0.86.3, six config plugins were
added, the new architecture is now the only architecture, and
`expo-speech-recognition` went from 3.1.3 to 57.1.0. **A rebuild is mandatory,
not an optimisation**, and nothing in `qa/` can run against the old binary
once this merges.

Worth knowing before that rebuild: `edgeToEdgeEnabled` is gone because edge to
edge is now unconditional, which makes `28cf795`'s keyboard fix **more**
necessary rather than less — the window is never resized for the IME on any
Android build from here.
