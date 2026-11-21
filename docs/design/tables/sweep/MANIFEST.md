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
