# Tables increment 3 (find + personal views): done-manifest

From the Tables spec (`../SPEC.md` §F row 3, C1, C7). Branch `feat/tables`, on top of increment 2 (`94b137a`). Local only.

Status per line: ☐ open · ☑ proven (evidence beside it) · ⚠ unproven (said so).

**Goal:** find rows the way the web does (filters, sorts, groups, the fields shown), and keep every change the person's own, as the owner ruled. Sharing is one explicit action.

## MUST

| # | Criterion | Check | Status |
|---|---|---|---|
| F1 | Filter & sort in one sheet: every operator family per column kind (the web's `filters.ts`, the server's `OPERATORS`), AND / OR, a value editor per kind | `filters.test.ts` (6); `tablesApp.test.tsx` › "a filter from the sheet…" | ☑ · ⚠ a date is typed `YYYY-MM-DD` (no picker yet) |
| F2 | The apply button says how many rows it keeps ("Show 1 row"), from a one-row count request | same test | ☑ |
| F3 | An unfinished condition stays out of the query (the web's `isComplete`) | `filters.test.ts`, `personalView.test.ts` | ☑ |
| F4 | Multi-sort with the web's direction words by type (A → Z, 1 → 9, Oldest → Newest, First → Last); a sort replaces newest first | `filters.test.ts` (`directionSet`, `addSort`); increment 1's T6 | ☑ |
| F5 | Group by a single select: a header per group with the server's count over the whole view, folding; fixed heights kept (`getItemLayout` over headers and cards) | `grouping.test.ts` (3); `tablesApp.test.tsx` › grouping (planted: red) | ☑ |
| F6 | Fields and cards: hide a field, choose up to 3 on cards, colour by a single select | `tablesApp.test.tsx` › "hiding a field…" | ☑ · ⚠ field ORDER is not editable on the phone yet |
| F7 | "No match" offers Clear the filters | `tablesApp.test.tsx` › no match | ☑ |
| F8 | Every one of these is the person's: sent as the query, never as `PATCH views` (the owner, C1); the toolbar shows it (tint, dot, the note) | the suite-wide `afterEach` guard; a planted PATCH on apply: red | ☑ |
| F9 | "Save as a new view…" (editors and owners): says in words that everyone on the base will see it, makes a NEW view from the one on screen (`from_view_id`), opens it, and drops the layer from the old view | `tables.test.ts` › createView; `tablesApp.test.tsx` › save (POST only, no PATCH) | ☑ |
| E2 | en and fr | `keys.test`, `locales.test` | ☑ |

## Hidden criteria

| | Status |
|---|---|
| A French label at 360 dp ("Afficher 1 204 lignes", the operator chips) | ⚠ device |
| Keyboard over the sheet's value field (`BottomSheet` + `KeyboardPadding`) | ⚠ device |
| Recycled cells: headers and cards at two fixed heights | ☑ code (`layoutOf`) · ⚠ device |
| A count request per keystroke: debounced 350 ms | ☑ code |

## Not done here, and why

- Field order (drag) on the phone: the web keeps it on the shared view (`field_order` reorders the table's columns for everyone, `views_controller.rb:66`). A personal order needs a design decision first. It stays with the web for now.
- A date picker in the filter: the value is typed. e2's `DateSheet` is bound to a record's writes; one for filters is a small follow-up.

## Gates

| Gate | Status |
|---|---|
| typecheck | ☑ clean |
| lint | ☑ clean |
| jest (full) | ☑ 270 suites, 3,529 tests |
| bundle | ☑ exported |
| device | ☐ with increments 1–2 |
