# Tables increment 4b — Board and views, the rest

**Goal (Hello for the owner, 2026-11-20: full parity):** what the web's board and view switcher do that increment 4 left out.

## MUST → evidence

| # | Criterion | Check | Status |
|---|---|---|---|
| A | History grouped under Today / Yesterday / the date, in the reader's language (the web's `HistoryFeed.tsx`) | `history.test.ts` "historyDays"; `7f1f54b` | ☑ red 3 → green |
| B1 | An editor makes a view of any type, posted from the view on screen with its own column (kanban select, calendar date, optional gallery cover); it opens | `tables.test.ts` "manage views"; `tablesApp.test.tsx` "a new KANBAN view"; `a335f0d` | ☑ red → green |
| B2 | A kanban or calendar with no suitable column says why; Create stays off | `tablesApp.test.tsx` "a calendar cannot be made" | ☑ |
| B3 | Rename (name alone), duplicate (opens the copy), delete (asks; opens another view when the deleted one was on screen); the last view offers no delete | `tablesApp.test.tsx` "rename sends the name alone…", "the last view offers no delete" | ☑ |
| B4 | A viewer switches views and manages nothing | `tablesApp.test.tsx` "a viewer switches views" | ☑ |
| B5 | SPEC C1: no view SETTING is ever written from the phone; a PATCH to a view carries `{ view: { name } }` only | file-wide guard in `tablesApp.test.tsx` (afterEach) | ☑ planted "rename also sends config" → red; Hello approved the narrowed guard, 2026-11-20 |
| C1 | Fold a kanban column: leaves the pages, stays a dimmed chip with a hint, its chip unfolds and goes there; writes no view | `tablesApp.test.tsx` "a folded column leaves the pages…"; `938c289` | ☑ red → green |
| C2 | A fold is kept on the device and is not a difference (no tint; "Back to the shared view" keeps it) | `personalView.test.ts` "folded kanban columns are kept", "'Back to the shared view' … keeps the folds", "a folded kanban column is not a difference" | ☑ planted "a fold is a difference" → 2 red |
| C3 | Reorder within a column in Table order only: Move to the top / up / down → `records#reorder` with the column's ids; no-op moves not offered; with newest first (a sort) no reorder is offered | `boardViews.test.ts` "moving a card within its column"; `tablesApp.test.tsx` "Table order on, the first card moves down…", "with newest first … offers no reorder" | ☑ red → green |

## Hidden criteria
- en/fr ☑ (keys and locales tests); a French string fits at 360 dp: ☐ device.
- dark ☐ device; 800 dp ☐ device.
- Roles: views managed by editors only ☑ tests; reorder needs `editable` (the long press is editor-only) ☑ code.
- Recycled cells: no animation added; the kanban cards keep `getItemLayout` ☑ code.
- Double tap: the views sheet disables its buttons while busy ☑ code.

## Device (owed, the slot after 00:45, `qa_phone3`, :3020 demo DB)
- New kanban view from the grid → it opens; rename → the server's name shows; duplicate → the copy opens; delete → confirm wording → another view opens.
- Fold a column → the chip is dimmed; relaunch → still folded; "Back to the shared view" → still folded; tap the chip → back.
- Table order on → Move down / Move to the top → the order holds after a refresh.
- fr at 360 dp: the views sheet and the move sheet.
