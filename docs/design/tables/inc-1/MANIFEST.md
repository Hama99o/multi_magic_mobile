# Tables increment 1 (browse, read-only): done-manifest

From the Tables spec (`../SPEC.md`), which Hello approved on 2026-11-20. Branch `feat/tables`, worktree `mm-tables`, stacked on Step 0 (`c168fe6`) and Flow (`7ece87f`, merged in `74749c0`) for the shared field layer. Local only: nothing is pushed without the owner's yes.

Status per line: ☐ open · ☑ proven (evidence beside it) · ⚠ unproven (said so).

**Goal:** browse his tables on the phone. Open a base, switch its tables and views, scroll the rows as cards, open a row and read every field.

## MUST

| # | Criterion | Check | Status |
|---|---|---|---|
| B1 | Bases list: colour square, name, description, table count; newest first (the server's default since 9c's change; before the deploy, the server's `updated_at desc`); search; a sort chip offering Newest · Recently changed · A–Z | jest `tablesApi.test.ts` (parse, sort param), `tablesApp.test.tsx` › bases | ☑ `tables.test.ts` (sort param), `tablesApp.test.tsx` › bases (server order, nothing sent for newest, the chip sends `name_asc`, accent-blind search) |
| B2 | Empty, loading and error states on the bases list | `tablesApp.test.tsx` › states (`LoadFailure`, skeleton, empty sentence) | ☑ `tablesApp.test.tsx` › a failed load is not "no bases"; empty state; skeleton · ⚠ device |
| T1 | Table screen: header (base name), a table chip strip, the table's description line, a row count ("1,204 rows" / "42 of 1,204") | `tablesApp.test.tsx` › table | ☑ `tablesApp.test.tsx` › cards (count line, description, table strip) |
| T2 | Rows as a fixed-height card list: title plus at most 3 fields (label above value), select chips, attachment thumbnail plus "+N", link chips; row-colour bar | `RecordCard.test.tsx`; eslint `list-cell-animation` | ☑ `tablesApp.test.tsx` › cards (label + chip + link title); fixed height via `getItemLayout` (`RecordCard.cardLayout`); eslint clean · ⚠ device |
| T3 | Paging at 100, rows de-duplicated by id; "Loading more…"; a failed page shows Retry and keeps the rows already shown | `tablesApp.test.tsx` › paging | ☑ `tablesApp.test.tsx` › next page, no row twice, Retry keeps rows |
| T4 | View switch (the shared views), gallery as one column with a cover | `tablesApp.test.tsx` › views | ☑ view switch (setParams only); gallery cover in `RecordCard` · ⚠ gallery not seen on a device |
| T5 | Quick search (debounced, server `search`). It belongs to the personal layer and never writes the view | `tablesApp.test.tsx` › search; `personalView.test.ts` | ☑ search is a request parameter; every screen test fails on any `PATCH …/views/` (planted: red) |
| T6 | Newest first by default when the view has no sort (`sort=-created_at`; C3); "Table order" one tap away | `personalView.test.ts`, `tablesApi.test.ts` | ☑ `personalView.test.ts`, `tablesApp.test.tsx` (`sort=-created_at`; a sorted view keeps its sort; Table order drops it) (planted: red) |
| R1 | Record screen: title, then every field with its label above and its value (e2's `FieldRow`, `editable={false}`); "Empty" for a blank; prev/next "3 / 25" | `tablesApp.test.tsx` › record | ☑ `tablesApp.test.tsx` › a row (title, every column) |
| R2 | Phone, email and url act (call/WhatsApp, mail, open); a link chip opens the linked row | `tablesApp.test.tsx` › record actions | ☑ `tablesApp.test.tsx` › tel:, wa.me, linked row · ⚠ file open not tested |
| R3 | Roles: a viewer sees no write control (there are none in increment 1); the role is parsed and kept for increment 2 | `tablesApi.test.ts` | ☑ `tables.test.ts` › an unknown role reads as a viewer |
| E1 | Entry points: the app switcher (`registry.ts` key `tables`); links `table_app_table` and `table_app_record` open in the app (`inAppRoute.ts`); "Ask about this table" opens the assistant with scope `tables` | `inAppRoute.test.ts`, `registry` test, `tablesApp.test.tsx` | ☑ `inAppRoute.test.ts` (tables links), `appShell.test.tsx` (registry), Ask in the ⋯ sheet and on the row |
| E2 | en and fr, every string through `t()` | `keys.test`, `locales.test` before every commit that touches a locale | ☑ `keys.test`, `locales.test` green |

## MUST NOT

- Write the shared view (`PATCH views/:id`) from the phone: the owner's rule (C1).
- Use a layout animation or transform on a list cell, or let a cell change height.
- Run on the owner's bases: QA account only.
- Fork e2's field layer. Additions go into its files, and a `FieldRow` prop change is asked of e2 first.

## Hidden criteria

| | Status |
|---|---|
| Dark and light | ☐ device |
| 360, 411, 800 dp | ☐ device |
| Offline / slow network: rows already shown stay, Retry | ☑ T3 (a failed page) · ⚠ device |
| Recycled cells: fixed height, `getItemLayout` | ☑ code; ⚠ device |
| Newest first | ☑ T6, B1 (server param live since `9730a4f7`; an older server ignores it) |
| A table with 0 rows; a table with 20k rows (paging only) | ☐ |

## Gates

Every heavy command runs under `flock /data/box-heavy.lock`, starting at ≥ 5 GB free and stopping under 3 GB; Jest at `--maxWorkers=1`.

| Gate | Status |
|---|---|
| typecheck | ☑ clean (lowest 11 GB) |
| lint | ☑ clean |
| jest (full) | ☑ 267 suites, 3,496 tests |
| bundle | ☑ exported |
| device (qa_phone2, 360/411/800, light/dark, en/fr) | ☐ after Step 0's device QA |

## Device pass 1 (2026-11-20, 18:10–18:32, `qa_phone3`, the 1.2.0 dev build running `feat/tables` @ `64bd9b6` through Metro 3029, QA account)

Contact sheet: MultiMagic Pages, space MultiMagic / 2026-11-20 / "Step 0 + Tables device pass (QA account)" (node 2561); local `~/Downloads/multimagic-qa/2026-11-20-step0-tables.jpg`. Fixture: one throwaway base "[qa] Tables device" made through the API (`tables_fixture.py`), deleted after; a list call showed none left.

| Seen on the device | Verdict |
|---|---|
| Bases list (colour square, "2 tables · 27 rows", Newest / Recently changed / A–Z) at 411 and 360 dp | ☑ |
| Table: chip strip, view pill, cards (label over value), count, FAB, at 411 / 360 / 800 dp, dark at 411 | ☑ |
| Row page: "1 / 25", prev/next, Status chip, Phone with Call + WhatsApp, the Office link, Ask about this row | ☑ |
| Phone editor with the keypad up: the sheet sits above it; Save reached the server, and the table's history logged `row.updated (Phone)`, so the write went through `records#update`, not core | ☑ |
| One-link column: picking Herat raised the Replace alert; Replace linked Herat on the server | ☑ · the alert named "#0": **bug, fixed in `168f989`** |
| + → the new row opens; ⋯ → Delete → confirm → back → "Row deleted · Undo" (360 dp) | ☑ |
| Newest first | **NOT MEASURED**: the local API (multi_magic master `e9adf512`) lacks 9c's sort, so it sent the table order while the chip said "Newest first": **bug, fixed in `168f989`** (the chip shows only when the rows prove it) |
| The view's name at 360 dp (icon only) and 411 dp ("G…") | **bug, fixed in `168f989`** |
| A linked row shown twice on the row page | **bug, fixed in `168f989`** |
| Kanban, calendar, filter sheet, fields sheet, French | ☐ not run: the next slot |
| The fixes above on a device | ☐ the next slot |
