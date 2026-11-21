# Tables: the hidden-criteria sweep (2026-11-21)

**Asked by Hello:** font scale 200 %, screen-reader names on every icon button, empty/loading/error/offline on every Tables screen, double-tap guards on create/delete/submit, and the exact-name delete. Code and Jest now; device checks in flows 32–37.

| # | Criterion | What was found | Fix | Check | Status |
|---|---|---|---|---|---|
| 1 | 200 %: no clipped text in a fixed-height box | The card's title (16/22 in a 22 box), every field label (17 in 16, a pixel short **even at 100 %**), the value and the chips clipped. In the grid, rows, the header and the summary clipped too. | Boxes scale with `fontScale` up to `FONT_CAP` = 2, and the Text in them stops there (`maxFontSizeMultiplier`). `cardLayout(n, cover, fontScale)` keeps `getItemLayout` exact. `gridHeights(fontScale)`. | `fontScale.test.tsx`: every Text against its box, at 100 % and 200 % | ☑ red (3) → green; ☐ device (flow 37 pass B, 32–36 at 200 %) |
| 2 | A grid cell is its value | Each grid cell repeated its column's name above the value | `CardValue bare` | `fontScale.test.tsx`: the column name is drawn once | ☑ red → green |
| 3 | Every control named | The source scan already covered every Tables file. The runtime sweep had never rendered Tables. | The sweep now runs on the grid, the import map, and all four form tabs | `a11yFindings()` in tablesApp, importScreen, formsScreens | ☑ green (nothing was nameless); ☐ TalkBack on a device |
| 4 | States on every screen | **Import**: the table or the role failing to load left the buttons busy for ever. **Answers**: an error with no retry. **Grid**: an empty view drew an empty grid. | `tables-import-failed`, `tables-form-answers-failed` (LoadFailure, Try again); the grid only with rows, otherwise the cards' empty state | importScreen "does not load (offline)", formsScreens "answers that do not load", tablesApp "an empty grid view" | ☑ red → green; ☐ device (flow 37 offline) |
| 5 | Double tap = one write | **Add a row, bulk delete and New form sent two requests.** `disabled={isPending}` does not stop a tap that comes before the re-render. | `useOneAtATime` (a ref released when the work ends; `mutateAsync`) | Each create/delete/submit test now presses twice in one frame and counts the requests: add row, new base, new table, rename, field editor, view save, comment send, delete table, delete base, bulk delete, new form, import start | ☑ 3 red → green; the other 9 were already guarded |
| 6 | Exact-name delete: case and spaces | Already exact: `nameMatches` is `===`, nothing trimmed or folded | none | `logic.test.ts` (case, leading/trailing/double spaces, accents, empty) | ☑ (existing); ☐ device (flow 37) |

## Red, then green
- **Red:** the new tests on HEAD's code gave 9 failed of 96. The import test failed red for a test reason (the mock order) the first time. It was fixed and re-proved alone on HEAD's import.tsx ("Unable to find tables-import-failed").
- **Green:** the Tables, components, i18n, a11y and query-key suites, 790/790. tsc and changed-file lint are clean. All runs went through guarded.sh.

## Unproven
- Pixels at 200 %, TalkBack's speech, and offline on a device: flow 37 and the 200 % and dark passes of 32–36.
- iOS Dynamic Type above 200 %: capped by design (`FONT_CAP`).

## Device pass 4 (qa_phone, 2026-11-21 07:48–08:29, bundle b52e5df, :3020 demo account)
Contact sheet: `~/Downloads/multimagic-qa/2026-11-21-tables-p4.jpg`, also in MultiMagic Pages, space MultiMagic, folder 2026-11-21.

| Flow | Result |
|---|---|
| 37 hidden criteria, 100 % and 200 % | ☑ PASS. Double tap 25 → 26; `items` and `Items ` refused, cancelled; offline import showed its failure and Try again recovered; 200 % cards fit. |
| 36 grid at 800 dp, light and dark | ☑ PASS |
| 32 views and kanban | ⚠ fold ☑; Move up never offered: **app bug, fixed below** |
| 33 admin | ⚠ rename, new column, clear and Undo (25 back) ☑; the flow looked for the oldest row off screen (flow fixed); duplicate and new table not reached |
| 34 import and export | NOT MEASURED: Maestro's inputText drops `\n` (flow now types Enter between lines) |
| 35 forms | ⚠ list, new form and questions ☑; the flow expected an "Ask Phone" chip, but a new form asks every column (flow fixed) |

### Found on the device, fixed red first
1. **A board never showed Newest first**, so Table order, and with it a card's Move up/down, was unreachable. The proof ran across columns; a board is sorted by column first. `newestProven(rows, groupOf)` now reads it within each group (boards and grouped lists). Tests: logic "WITHIN each group", tablesApp "a board with two columns still shows Newest first".
2. **The table strip's pills were cut at the bottom at 411 dp** (and the board's chips are the same shape): a horizontal ScrollView shrinks by default. `flexShrink: 0` on both. Test: "the table strip and the board's chips never shrink". This cause is inferred from RN's defaults, not measured; device pass 5 checks the pixels.
3. **At 800 dp the + button covered the summary bar's last cell.** The grid now keeps `FAB_ZONE` (96, what the card list already kept) free below it. Test: "the + button never covers the grid's summary bar". At 360 dp there is no grid; the card list already keeps the same 96.

Red: 4 of 6 new tests failed on the old code (the other 2 are guards that must stay false). Green: 344/344 in the Tables, i18n and a11y suites. tsc and lint are clean.

## Device pass 5 (qa_phone, 2026-11-21 09:26–10:09, bundle b5dfdf9, :3001 QA account)
Hello's option (b): the QA account, credentials read by name from `.env`, signed-in email checked before the run (YES). Fixtures are `[qa]` bases made through the API and deleted by id (8–15, all "left: []"). The account's language went fr → en for the run → fr. Shots: `~/Downloads/multimagic-qa/2026-11-21-tables-p5/`. Only the 100 % pass fit in the slot.

| Flow | Result at 100 %, light |
|---|---|
| 33 admin | ☑ PASS in full: rename, new column, clear + Undo (count back to 25), duplicate, new table |
| 35 forms | ☑ PASS in full: list, new form, the four tabs, delete wording then confirm |
| 34 import and export | ⚠ the paste typed with Enter reads 2 rows, maps, starts, banner shown; the import never finished (no job worker on :3001): its end, and export, NOT MEASURED |
| 32 views and kanban | ⚠ new view and fold ☑. Move up: NOT MEASURED. :3001 ignores `sort=-created_at` (the board came oldest first), so the chip is rightly hidden; fix 1 above is proven by Jest only until a run on a server that sorts |

Not run: the 200 % and dark passes of 32–35. Not measured on a device yet: fixes 2 (strip) and 3 (+ over the grid).

Rig notes:
- After `pm clear` the dev client shows its first-run developer menu over the app; dismiss it before the flows.
- Metro served another worktree through the shared node_modules cache until restarted with `--clear`; check the served bundle for this tree's paths.
