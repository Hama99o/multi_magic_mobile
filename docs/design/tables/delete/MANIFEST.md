# Delete a table or a base, by its exact name: done-manifest

The owner, 2026-11-20 (relayed by Hello): "he can't delete a table once created." Brought forward from increment 6. Branch `feat/tables`. Local only.

Status per line: ☐ open · ☑ proven (evidence beside it) · ⚠ unproven (said so).

## MUST

| # | Criterion | Check | Status |
|---|---|---|---|
| D1 | The server endpoint exists and works for a table with rows, views and links | API run on the QA account (2026-11-20, local server `e9adf512`): a throwaway base, Items (25 rows, an extra view, a link to Offices). `impact` said 25 rows, 4 columns, and Offices' inverse column; DELETE gave 204; Offices then had only its own "Name" column; the base held only Offices; the base was deleted after | ☑ (no server work needed; multi-magic-83 not called) |
| D2 | Delete stays disabled until the typed text is the name EXACTLY: case, spaces, accents; no trim, no folding | `logic.test.ts` › `nameMatches` (7 cases); `tablesApp.test.tsx` › "refuses 'qa table' and 'QA table '" (also " QA table", "QA  table"; pressing does nothing; no DELETE sent). Planted: a trimming, case-blind match → 3 red | ☑ · ⚠ the device proof ("QA table" refused for "qa table" and "QA table ") is owed at the next slot |
| D3 | The name is shown to copy (selectable text, and a Copy button) | `DeleteByNameSheet.tsx` | ☑ code · ⚠ device |
| D4 | The sheet says what goes with it: rows, columns and views, and other tables' link columns (`tables#impact`); for a base, its tables and rows, for everyone it is shared with | `tablesApp.test.tsx` (the impact sentences) | ☑ |
| D5 | Who: a table by an owner or editor (`TablePolicy#destroy?` = manage); a base by its owner only (`BasePolicy#destroy?`) | `tablesApp.test.tsx` › viewer sees neither; the bases list's long press is the owner's only | ☑ |
| D6 | After: a toast ("Table “QA table” deleted"), the lists refreshed, and the screen moves to the base's next table (none left: back to the bases) | `tablesApp.test.tsx` › "the exact name deletes it…" | ☑ |
| D7 | A base from the bases list (long press, or the accessibility action) with the typed text sent as typed (`confirm_name`; the server trims, the phone does not) | `tablesApp.test.tsx` › "the owner deletes a base…"; `tables.test.ts` | ☑ |
| D8 | The field never "corrects" the name: no autocapitalise, no autocorrect, no suggestions | `DeleteByNameSheet.tsx` props | ☑ code · ⚠ device (Gboard) |
| E2 | en and fr | `keys.test`, `locales.test` | ☑ |

## Gates

| Gate | Status |
|---|---|
| typecheck | ☑ clean |
| lint | ☑ clean |
| jest (full) | ☑ 272 of 273 suites green in the full run; the 273rd, `queryKeys.test`, was red on a spread-built impact key and is fixed (`tablesKeys.impact`); that suite and the Tables suites re-ran green (80 tests) |
| bundle | ☑ exported |
| device | ☐ next slot: "QA table" refused for "qa table" and "QA table ", then deleted |
