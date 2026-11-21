# MM mobile integration: `integration/mm-mobile-next`

Local only, never pushed. The tree the owner's next build comes from (Hello,
2026-11-21). Integrator: multi-magic-mobile-ff. Each run: a fresh branch off
`origin/main`, the branches merged in the order below with `--no-ff`, every
conflict and its resolution written here, then tsc, full Jest (1 worker) and
`expo export --clear` with a grep per app, all through `/data/box-tools/guarded.sh`.

`git rerere` is on in this clone: a resolution recorded here is replayed on
the next run, and the run log says "Resolved … using previous resolution".
Read the result anyway.

## Run 1 — 2026-11-21, on origin/main 4dd5e8f

| # | Branch @ head | Owner | Result |
|---|---|---|---|
| 1 | `fix/hygiene-step0` @ a35273b | 88 | clean |
| 2 | `fix/media-kind-rebased` @ 232275c | ee | clean |
| 3 | `fix/header-own-width` @ 746b39b | ff | clean |
| 4 | `feat/flow-app` @ 9d82e20 | ff | 2 conflicts, below |
| 5 | `feat/tables` @ 718e232 | 88 | 36 files: it carries the OLD, pre-rebase Flow, below |
| 6 | `feat/doc-tools` @ 4aa353d | ee | 11 files: each app registers itself in the same spots, below |
| 7 | `feat/pages-parity` @ 0b87a6b | ee | 5 files, below |
| 8 | `feat/notes-parity` @ f5a6bba | ff | 1 file, below |
| 9 | `feat/global-search` @ 2559fdb | ff | 2 files + its tests updated to the integrated routes, below |
| 10 | `feat/sheet-frame` @ 7cd0d7b | ff | clean (`SheetFrame.tsx` is byte-identical on 8, 4 and 10) |

### 4 · feat/flow-app

- `src/i18n/__tests__/locales.test.ts` — both added `SAME_IN_BOTH` entries
  (hygiene: `finance.sort.az`, two family labels; Flow: its words). **Union.**
- `src/lib/inAppRoute.ts` — hygiene added the finance paths and keys, Flow
  the flow paths and keys, and both rewrote the header comment. **Union**, one
  comment naming both.

### 5 · feat/tables — the old Flow inside it

`feat/tables` merged Flow at **7ece87f** (74749c0, "merge: Flow … under
Tables"), BEFORE Flow was rebased onto the header slot. Flow's history now
has the same work as b4e7c0e plus a day of device fixes, so every Flow file
conflicted old-against-new.

- **Flow-only files** (`app/flow/*`, `src/screens/flow/*`,
  `src/i18n/locales/flow/*`, `docs/design/flow/*`, `qa/flows/28-flow.yaml`):
  **the current Flow (ours).** Checked: Tables changed one of them after its
  Flow merge, 2b03bb4, adding `fields.yes` and `fields.more_one/_other` to
  `locales/flow/{en,fr}.ts`. **Re-added by hand.**
- **`src/components/BottomSheet.tsx`, `src/components/fields/FieldRow.tsx`**:
  Tables has no commit of its own on them. **Ours.**
- **The other 16 shared files** (`api/keys.ts`, `apps/registry.ts`,
  `apps/lastPlace.ts`, `fields/display.ts`, `fields/useFieldWrites.ts`,
  `icons.ts`, `appShell.test.tsx`, `keys.test.ts`, `locales.test.ts`,
  `locales/{en,fr}.ts`, `inAppRoute.ts`, `appColors.ts` and its test,
  `docs/design/README.md`, `qa/FLOW_REGISTER.md`): **ours, then Tables' OWN
  commits replayed on top** (`git log --no-merges origin/main..feat/tables
  --not 7ece87f fix/hygiene-step0 -- <file>`, each `git apply --3way`). All 37
  patches applied cleanly.
- **For 88:** merge the current `feat/flow-app` into `feat/tables` (or rebase
  Tables onto it) so the next run has nothing of this. Until then this
  resolution is in rerere.

### 6 · feat/doc-tools — the registration spots

Flow, Tables and Doc each add themselves to the same lists. **Union** in
every file, then three fixes by hand:
- `src/apps/registry.ts` header comment: one sentence for Flow, Tables and Doc.
- `src/theme/appColors.ts` `HOME_APPS`, and `appColors.test.ts` (its list and
  the "additions" test): the two one-line declarations combined into one list,
  `… "finance", "flow", "tables", "doc"`.
- `src/components/shell/__tests__/appShell.test.tsx`: the app list in the
  registry's merged order (`… "finance", "flow", "tables", "chats", "doc", …`).
- `docs/design/README.md`: Doc's row renumbered 21 → 23.

### 7 · feat/pages-parity

- `qa/flows/login.yaml`: a comment; **ours** (names `doc.creator.keep`).
- `api/keys.ts`, `keys.test.ts`, `locales.test.ts`: **union**.
- `src/components/icons.ts`: **union**, then the duplicate `import TypeIcon`,
  `HistoryIcon` and their `export const`s removed (Flow and Doc both import
  them; a union of both is a compile error).

### 8 · feat/notes-parity

- `src/i18n/__tests__/keys.test.ts` `PLURAL`: **union** (`notes.links.chip`).

### 9 · feat/global-search

- `src/lib/inAppRoute.ts`: search added finance AND SafeZone paths; hygiene
  already has finance (an entry opens on its ledger tab with its sheet).
  **Hygiene's finance kept, search's SafeZone added, search's finance
  dropped.**
- `locales.test.ts`: **union**.
- Search's tests, updated **in this merge** to the integrated routes: an
  expense hit opens `/finance` with `{ tab: "expenses", entry }`; a Flow card
  hit opens the card (Flow is here); the "no screen, ask the assistant" case
  uses a Doc signature hit (`/doc/sign` has no phone screen).
- **For ff:** when hygiene lands, rebase `feat/global-search` and make the
  same test change there.

### A union can cut a block (found by tsc, run 1)

`src/api/keys.ts`: Tables' `fieldKeys`, Doc's `docKeys` and Pages'
`storageKeys` end and start at the same lines, so "ours then theirs" dropped
two `};` and a `/**`, and the file no longer parsed (tsc, Jest and the export
all failed on it). Restored by hand; the export set checked to be exactly the
union of every branch's (14). The two rerere postimages that held the cut
were fixed in `rr-cache` too, so the next run does not replay it. **Rule: after
any union, tsc before anything else.**

## Gates for run 1 (at ed44584, guarded.sh, 0 emulators at the start)

| Gate | Result |
|---|---|
| tsc | 0 errors |
| Jest, full, 1 worker | 313 suites: 312 passed; 4015 tests: **4014 passed, 1 failed** |
| `expo export --platform android --clear` | built; every app's marker in the .hbc: drawer-pinned, flow-board-pager, tables-activity-tabs, doc-compress-intake, pages-shared-row, search-input, switcher-global-search, header-search, home-search, note-links, notes-selection-more, profile-sheet |

**The one failure is real, and only the merge shows it:** the header-slot rule
(`ScreenContainer.header.test.tsx`, from `fix/header-own-width`) finds 15
screens that draw `AppHeader` inside `<Screen>`. Their branches started from
main, before the slot existed:

| Owner | Screens |
|---|---|
| ee (feat/doc-tools) | doc/compress, convert, index, merge, sign, signature, signatures, text |
| ee (feat/pages-parity) | pages/storage |
| 88 (feat/tables) | tables/activity, import, index, record, table |
| 88 (fix/hygiene-step0 or tables) | contacts/my-family |

Each is the same one-line move: `<Screen …><AppHeader …/>` becomes
`<Screen … header={<AppHeader …/>}>`. It cannot be done on those branches
until `fix/header-own-width` is on main (the prop does not exist there).
**Recommendation: land `fix/header-own-width` first** (one commit, 746b39b,
gated, 800 dp shots in 2e0af49), then each owner moves their screens.

## Run 2 — 2026-11-21, on origin/main 4dd5e8f (merges done, gates waiting)

Every branch that started before the slot now carries `fix/header-own-width`
(746b39b) merged in by its owner, and Tables carries the current Flow and
hygiene, so most of run 1's resolutions are now inside the branches.

| # | Branch @ head | Owner | Result |
|---|---|---|---|
| 1 | `fix/hygiene-step0` @ 9deb622 | 88 | clean (746b39b merged, my-family moved to `header=`) |
| 2 | `fix/media-kind-rebased` @ 232275c | ee | clean |
| 3 | `fix/header-own-width` @ 746b39b | ff | clean |
| 4 | `feat/flow-app` @ 9d82e20 | ff | 2 files, rerere replayed run 1 |
| 5 | `feat/tables` @ 224c68e | 88 | 2 files: **Tables' copy** (below) |
| 6 | `feat/doc-tools` @ 88d169a | ee | 11 files: 7 rerere, 4 union + fixes (below) |
| 7 | `feat/pages-parity` @ b9cd2f9 | ee | 5 files: 1 rerere, 4 union + fixes (below) |
| 8 | `feat/notes-parity` @ f5a6bba | ff | 1 file, union |
| 9 | `feat/global-search` @ 2559fdb | ff | 2 files + run 1's test edits re-applied |
| 10 | `feat/sheet-frame` @ 7cd0d7b | ff | clean |

### 5 · feat/tables
88 merged Flow (9d82e20) and hygiene (9deb622) into Tables, so the old-Flow
conflict of run 1 is gone. What is left is Tables' resolution against ours in
`locales.test.ts` and `inAppRoute.ts`. **Checked: Tables' copy holds every
line of ours** except the comment "the table keys still return null", which
Tables makes false. **Theirs.**

### 6 · feat/doc-tools, 7 · feat/pages-parity — the same two traps again
Tables' increment 8 moved the context under Doc's and Pages' additions, so
rerere could not replay `keys.ts`, `icons.ts`, `keys.test.ts`, `locales.test.ts`.
Union, then:
- `keys.ts`: the union cut a block TWICE: `fieldKeys` lost its `};` and Doc's
  comment its `/**` (Doc merge); `docKeys` lost its `};` (Pages merge).
  Restored; 14 exports, 14 `};`, the export set equal to run 1's.
- `icons.ts`: Doc's duplicate `TypeIcon`/`Type` and Pages' duplicate
  `HistoryIcon`/`History` removed (Flow already has both).
- Every union file parse-checked with the TypeScript parser before committing.
The four new resolutions are in rerere.

### 9 · feat/global-search
`inAppRoute.ts` replayed run 1 (result identical to run 1's). The test edits
run 1 made inside the merge (`app/__tests__/search.test.tsx`,
`src/lib/__tests__/inAppRoute.test.ts`: finance entry routes, a Flow card
opens, a Doc signature hit for the ask case) are not conflicts, so rerere does
not carry them: **re-applied from run 1's merge c96e31c.**

### ee's header moves, merged on top
`feat/doc-tools` @ 39270b1 (the 8 Doc screens) and `feat/pages-parity` @
51ef26d (pages/storage), merged into the run-2 branch after the rest: both
clean, all 9 screens pass `header=`.

## Gates for run 2 (at 14ec569, guarded.sh, 0 emulators, node 22.19.0)

| Gate | Result |
|---|---|
| tsc | 0 errors |
| Jest, full, 1 worker | 318 suites passed; **4041 / 4041 tests passed, 0 failed** |
| `expo export --platform android --clear` | built; all 12 app markers in the .hbc (as run 1) |

**Run 2 meets the bar: 0 failures.** The header-slot rule passes on every
screen. `spaceEdit.test` (Pages), which 88 saw fail in 2 of 3 full runs on
their box, passed here.

Next: run 3 adds `feat/tables` @ ced0326 (import fix + tablet grid, touches
`keys.ts` / `keys.test.ts`).

## Run 3 — 2026-11-21, run 2 plus `feat/tables` @ 889b41b

Tables moved past the ced0326 88 announced: a1d6073 (import the previewed
sheet, upload_expired), ced0326 (tablet grid, increment 9), 889b41b (device
flows). Merged on top of run 2 (6da137b): **clean**. `keys.ts` checked after
the merge: parses, 14 exports, 14 `};`, `tablesKeys.summary` inside its
block. No new heads from ee.

| Gate (guarded.sh, ee's emulator up, Jest 1 worker, node 22.19.0) | Result |
|---|---|
| tsc | 0 errors |
| Jest, full | 319 suites passed; **4049 / 4049 tests passed, 0 failed** |
| `expo export --platform android --clear` | built; all 12 app markers in the .hbc |

**Run 3: 0 failures.** `integration/mm-mobile-next` @ 6da137b is the base
for 88's W0 (useNav).

## Run 4 — 2026-11-21, run 3 plus the hidden-criteria sweeps

| Branch @ head | Owner | What is new | Merge |
|---|---|---|---|
| `feat/flow-app` @ 8b9f29b | ff | tiles grow with the system font (025020e); sprint pills on theme tokens `success`/`info` (8b9f29b) | clean |
| `feat/tables` @ b52e5df | 88 | the Tables sweep (useOneAtATime, font scale, flows 32–37) | clean |
| `feat/notes-parity` @ 887b603 | ff | a double tap on + makes one note | clean |

Merged on top of run 3 (head 7605190). ee's spaceEdit flake fix was not
ready and was not waited for (Hello). `feat/pages-parity` has moved since
(75175d4, the login flow's Home fix): run 5.

| Gate (guarded.sh, Jest 1 worker, node 22.19.0) | Result |
|---|---|
| tsc | 0 errors |
| Jest, full | 322 suites passed; **4069 / 4069 tests passed, 0 failed** |
| `expo export --platform android --clear` | built; all 12 app markers in the .hbc |

**Run 4: 0 failures.** The base for 88's W0 (useNav).

## Run 5 — 2026-11-21, run 4 plus the keyboard work and the sweeps' follow-ups

| Branch @ head | Owner | What is new | Merge |
|---|---|---|---|
| `fix/kav-height` @ 990d723 | ee | new: a lint rule refusing KeyboardAvoidingView "height" | 2 files, below |
| `feat/tables` @ b5dfdf9 | 88 | the device pass's three findings | clean |
| `feat/doc-tools` @ 0c5c012 | ee | the text sheet rises with KeyboardPadding | clean |
| `feat/pages-parity` @ 5958fde | ee | keyboard fixes, the spaceEdit flake fix, login.yaml | clean |
| `feat/sheet-frame` @ 59670cd | ff | the unused `Modal` imports (found by 88's lint) | clean |

- `eslint-fixtures/clean.tsx`: hygiene's `EmptyFade` and kav-height's
  `PaddingIsFine` are both legitimate forms. **Both kept.**
- `src/__tests__/eslintRules.test.ts`: the clean-fixture test's title, "all
  nine" against "every rule". **kav-height's**, which does not go stale.
- No KeyboardAvoidingView "height" anywhere in the merged tree (grep); every
  one is "padding".

**The gates now include eslint** (88 found a warning no other gate sees): `--cache
--max-warnings 0` on every `.ts`/`.tsx` the integration changes against
origin/main.

| Gate (guarded.sh, Jest 1 worker, node 22.19.0) | Result |
|---|---|
| tsc | 0 errors |
| eslint, 329 changed files | 0 errors, 0 warnings |
| Jest, full | 323 suites passed; **4078 / 4078 tests passed, 0 failed** |
| `expo export --platform android --clear` | built; all 12 app markers in the .hbc |

**Run 5: 0 failures** at 73d14ad (code); docs after it: the release table.

## Run 6 — 2026-11-21, run 5 plus pane-nav and the 200 % fixes

| Branch @ head | Owner | What is new | Merge |
|---|---|---|---|
| `feat/pane-nav` @ 53594e7 | 88 | W0: `useNav`, the codemod (100 files), the pane-nav lint rule | clean |
| `feat/tables` @ 27819f0 | 88 | device pass 5 notes | clean |
| `feat/pages-parity` @ 1685c37 | ee | durations on grid cards, the login scroll (da2572f), slot-2 readiness flows | 2 files, below |
| `fix/home-tile-names` @ e842db8 | ff | new: an app's name is never cut at 200 % | 1 file, below |
| `fix/contacts-font-scale` @ a766921 | ff | new, off hygiene: Contacts rows, headers, A–Z at 200 % | 1 file, below |

- `src/screens/pages/drive/ui.tsx`, `parts.tsx`: media-kind's `mediaKind()`
  against Pages' new `DurationBadge`. **Both**: the badge added, `isVideo`
  kept on `mediaKind()` (media-kind's rule: the type, never the name).
- `app/__tests__/home.test.tsx`: search's Home-field test and the 200 % tests
  both appended at the end. **Union**, each block closed.
- `app/contacts/index.tsx`: the import line. pane-nav replaced `router` with
  `useNav`; the fix added `useWindowDimensions`. **Both**, no `router` import.
- The pane-nav codemod re-run over the merge: no change (its 4 skipped files
  are its allowlist).

| Gate (guarded.sh, Jest 1 worker, node 22.19.0) | Result |
|---|---|
| tsc | 0 errors |
| eslint, 372 changed files (with the pane-nav and kav-height rules) | 0 errors, 0 warnings |
| Jest, full | 326 suites passed; **4102 / 4102 tests passed, 0 failed** |
| `expo export --platform android --clear` | built; all 12 app markers in the .hbc |

**Run 6: 0 failures** at d205479.

## Run 7 — 2026-11-21, run 6 plus the Finance sweep

| Branch @ head | Owner | What is new | Merge |
|---|---|---|---|
| `feat/tables` @ feebf23 | 88 | a bounded wait in formsScreens.test (a flake under load) | clean |
| `fix/finance-sweep` @ 32ed64e | 88 | new: the Finance hidden-criteria sweep; `useOneAtATime` moves to `src/hooks` | clean |

Checked after the merge: no import of the old `src/screens/tables/useOneAtATime`
path is left; the pane-nav codemod changes 0 files.

| Gate (guarded.sh, Jest 1 worker, node 22.19.0) | Result |
|---|---|
| tsc | 0 errors |
| eslint, 376 changed files | 0 errors, 0 warnings |
| Jest, full | 327 suites passed; **4103 / 4103 tests passed, 0 failed** |
| `expo export --platform android --clear` | built; all 12 app markers in the .hbc |

**Run 7: 0 failures** at 6eb7245.
