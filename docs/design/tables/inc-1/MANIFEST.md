# Tables increment 1 (browse, read-only): done-manifest

From the Tables spec (`../SPEC.md`), which Hello approved on 2026-11-20. Branch `feat/tables`, worktree `mm-tables`, stacked on Step 0 (`c168fe6`) and Flow (`7ece87f`, merged in `74749c0`) for the shared field layer. Local only: nothing is pushed without the owner's yes.

Status per line: ☐ open · ☑ proven (evidence beside it) · ⚠ unproven (said so).

**Goal:** browse his tables on the phone. Open a base, switch its tables and views, scroll the rows as cards, open a row and read every field.

## MUST

| # | Criterion | Check | Status |
|---|---|---|---|
| B1 | Bases list: colour square, name, description, table count; newest first (the server's default since 9c's change; before the deploy, the server's `updated_at desc`); search; a sort chip offering Newest · Recently changed · A–Z | jest `tablesApi.test.ts` (parse, sort param), `tablesApp.test.tsx` › bases | ☐ |
| B2 | Empty, loading and error states on the bases list | `tablesApp.test.tsx` › states (`LoadFailure`, skeleton, empty sentence) | ☐ |
| T1 | Table screen: header (base name), a table chip strip, the table's description line, a row count ("1,204 rows" / "42 of 1,204") | `tablesApp.test.tsx` › table | ☐ |
| T2 | Rows as a fixed-height card list: title plus at most 3 fields (label above value), select chips, attachment thumbnail plus "+N", link chips; row-colour bar | `RecordCard.test.tsx`; eslint `list-cell-animation` | ☐ |
| T3 | Paging at 100, rows de-duplicated by id; "Loading more…"; a failed page shows Retry and keeps the rows already shown | `tablesApp.test.tsx` › paging | ☐ |
| T4 | View switch (the shared views), gallery as one column with a cover | `tablesApp.test.tsx` › views | ☐ |
| T5 | Quick search (debounced, server `search`). It belongs to the personal layer and never writes the view | `tablesApp.test.tsx` › search; `personalView.test.ts` | ☐ |
| T6 | Newest first by default when the view has no sort (`sort=-created_at`; C3); "Table order" one tap away | `personalView.test.ts`, `tablesApi.test.ts` | ☐ |
| R1 | Record screen: title, then every field with its label above and its value (e2's `FieldRow`, `editable={false}`); "Empty" for a blank; prev/next "3 / 25" | `tablesApp.test.tsx` › record | ☐ |
| R2 | Phone, email and url act (call/WhatsApp, mail, open); a link chip opens the linked row | `tablesApp.test.tsx` › record actions | ☐ |
| R3 | Roles: a viewer sees no write control (there are none in increment 1); the role is parsed and kept for increment 2 | `tablesApi.test.ts` | ☐ |
| E1 | Entry points: the app switcher (`registry.ts` key `tables`); links `table_app_table` and `table_app_record` open in the app (`inAppRoute.ts`); "Ask about this table" opens the assistant with scope `tables` | `inAppRoute.test.ts`, `registry` test, `tablesApp.test.tsx` | ☐ |
| E2 | en and fr, every string through `t()` | `keys.test`, `locales.test` before every commit that touches a locale | ☐ |

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
| Offline / slow network: rows already shown stay, Retry | ☐ |
| Recycled cells: fixed height, `getItemLayout` | ☐ |
| Newest first | ☐ T6, B1 |
| A table with 0 rows; a table with 20k rows (paging only) | ☐ |

## Gates

Every heavy command runs under `flock /data/box-heavy.lock`, starting at ≥ 5 GB free and stopping under 3 GB; Jest at `--maxWorkers=1`.

| Gate | Status |
|---|---|
| typecheck | ☐ |
| lint | ☐ |
| jest (full) | ☐ (read `Test Suites:`, not only `Tests:`) |
| bundle | ☐ |
| device (qa_phone2, 360/411/800, light/dark, en/fr) | ☐ after Step 0's device QA |
