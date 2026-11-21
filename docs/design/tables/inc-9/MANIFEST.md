# Tables increment 9: the grid on a tablet

**Goal (owner, via Hello, 2026-11-20):** on a tablet, a grid view looks like the web's grid, not a phone's cards.

## MUST → evidence

| # | Criterion | Check | Status |
|---|---|---|---|
| 1 | A grid view shows as a grid from 720 dp (the web's own breakpoint); below that, and for kanban, calendar and gallery, nothing changes | `grid.test.ts` "the grid from the web's phone breakpoint"; `tablesApp.test.tsx` "the tablet grid": 1024 shows `tables-grid`, 411 keeps the cards | ☑ tests; ☐ device at 800 dp |
| 2 | The title column held at the left, the header at the top; the other columns slide sideways; rows a fixed 44 dp (`getItemLayout`), no animation on a recycled cell | `GridView.tsx` | ☑ code; ☐ device scroll |
| 3 | Column widths: the view's own (`column_widths`, as set on the web, clamped 60–800), else the web's width by type; the title column 220 | `grid.test.ts` "widths" | ☑ tests |
| 4 | Summary bar over the whole view (`records#summary`, with the search and filters): rows; filled per column; sum and average for numbers | `grid.test.ts` "the summary"; `tablesApp.test.tsx` "2 rows", "1 filled"; shape checked on :3020 | ☑ tests; ☑ server shape |
| 5 | A phone never asks for the summary | `tablesApp.test.tsx` phone case: no summary request | ☑ tests |
| 6 | A tap on a row opens its page, where every column edits | `tablesApp.test.tsx`: `tables-grid-row-1` opens record 502 | ☑ tests |
| 7 | More rows load at the end of the list | `onEndReached` → `fetchNextPage` | ☑ code; ☐ device |

## Not done here (the web has them)
- Editing a cell in place in the grid: a tap opens the row instead.
- Grouping inside the grid.
- Resizing or reordering a column by dragging.

## Hidden criteria
- Tablet ☐ device at 800 dp, light and dark. Phone: the existing Tables tests run at 411 wide now (a `useWindowDimensions` mock), so every earlier test still checks the cards.
- en/fr ☑ keys and locales tests (rows/filled plurals); fit ☐ device.
- Empty, loading and error: the same as the cards (the screen's own states) ☑ code.
- Recycled cells: fixed height, no transform ☑ code.

## Server check (:3020 demo DB)
`records/summary` answered `{"summary":{"<decimal id>":{"filled":2,"sum":5.5,"avg":2.75},"<text id>":{"filled":1}}}`. With a filter, a column with nothing filled is left out, and the grid draws an empty cell. Throwaway base "[qa] e9 grid" deleted (204); no "[qa]" base left.

## Gates
- Red: on the old table.tsx, the new grid test failed.
- Green: tsc and changed-file lint are clean; full Jest 3752/3753 with one worker, every Tables suite passing.
- The failure is `src/screens/pages/__tests__/spaceEdit.test.tsx`. It isn't touched here, it passes alone, and it also failed in the full run at 18bbeca. It's reported to the integrator as order- or load-dependent.
- All runs went through `/data/box-tools/guarded.sh`.
