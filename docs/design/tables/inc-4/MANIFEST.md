# Tables increment 4 (Kanban + Calendar): done-manifest

From the Tables spec (`../SPEC.md` §F row 4, C6). Branch `feat/tables`, on top of increment 3 (`7b40518`). Local only.

Status per line: ☐ open · ☑ proven (evidence beside it) · ⚠ unproven (said so).

**Goal:** a kanban view and a calendar view work on a phone, the way the web's own phone mode draws them.

## MUST

| # | Criterion | Check | Status |
|---|---|---|---|
| K1 | A board asks the rows grouped by its column (`group_by` = the view's `kanban_field_id`) and shows one column per option in order, then "No value", each with the server's count over the whole view | `boardViews.test.ts`; `tablesApp.test.tsx` › "a board asks…" (planted: no group_by → red) | ☑ |
| K2 | One column per screen, the next one peeking; a chip strip that jumps to a column | `KanbanView.tsx` (`snapToInterval`, chips) | ☑ code · ⚠ device |
| K3 | A card moves by long press → "Move to…" (never a drag across pages), through `records#update`; shown at once, put back if refused; Undo moves it back | `tablesApp.test.tsx` › "a long press moves a card…" | ☑ · ⚠ a screen reader has no long press: the same move is the Status field on the row page |
| K4 | "+" at a column's foot adds a row already in that column | `tablesApp.test.tsx` › "+ at a column's foot…" | ☑ |
| K5 | A value no option has any more lands in No value, never out of sight | `boardViews.test.ts` | ☑ |
| C1 | A calendar asks for the month on screen only (`on_or_after` / `on_or_before` on the view's `calendar_field_id`), added to the person's filters | `boardViews.test.ts` (month range, leap year); `tablesApp.test.tsx` › calendar (planted: no month filter → red) | ☑ · when the person's filters are OR-ed, the month cannot be ANDed in: the whole view is paged instead |
| C2 | A dot per row on its day (the row colour when the view colours rows); the chosen day's rows under the month | `CalendarView.tsx`; `rowsByDay` test | ☑ code · ⚠ device |
| C3 | "No date" lists the rows without one (its own request, `empty`) | `tablesApp.test.tsx` › calendar | ☑ |
| C4 | "+" adds a row ON the chosen day | `CalendarView` `onAdd` → `createRecord({ [date]: day })` | ☑ code · ⚠ no screen test |
| E2 | en and fr | `keys.test`, `locales.test` | ☑ |

## Scheduled: increment 4b, before Tables is called done (Hello, 2026-11-20: full web parity)

The web has each of these, so each one ships. None is dropped.

| # | Web feature (file) | Phone | Size (estimate, not measured) |
|---|---|---|---|
| 4b.1 | Reorder cards within a column (`KanbanBoard.tsx`, SortableJS; `records/reorder`) | a Reorder mode per column, Flow's pattern (`DragReorder.tsx`, drag or up/down), sent as `POST tables/:id/records/reorder` (`ids`) | 1–1.5 days |
| 4b.2 | Fold a column (`KanbanBoard.tsx:151-158`, `collapsed_columns` on the view) | folding is PERSONAL (the owner's rule): kept in the layer, never a PATCH; a folded column shrinks to its chip with its count | 0.5 day |
| 4b.3 | Choose the board's or calendar's column, and a gallery's cover, when making a view (`ViewSwitcher.tsx:9,54-61,177-192`, `NewView`) | "New view" (type + column), plus "Rename / Duplicate / Delete a view" (`views#update/duplicate/destroy`). Rename, duplicate and delete behave as on the web: they change the shared view, so they are editors' only, with a confirm that says so in words; the view's QUERY stays in the personal layer (Hello, 2026-11-20). | 1–1.5 days |

**Increment 4b in all: about 3 days.** It is in SPEC §F.

## Gates

| Gate | Status |
|---|---|
| typecheck | ☑ clean |
| lint | ☑ clean |
| jest (full) | ☑ 271 suites, 3,542 tests, after one fix: the full run was red on `queryKeys.test` (the No date list, one page, sat under the infinite list's key shape); it got its own key (`tablesKeys.undated`), and `editRow` / `dropRows` now edit a lone page too. Re-run: that suite and the Tables suites green |
| bundle | ☑ exported |
| device | ☐ |
