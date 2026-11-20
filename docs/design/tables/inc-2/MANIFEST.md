# Tables increment 2 (edit rows): done-manifest

From the Tables spec (`../SPEC.md` §F row 2), go from Hello on 2026-11-20. Branch `feat/tables`, worktree `mm-tables`, on top of increment 1 (`2b03bb4`). Local only.

Status per line: ☐ open · ☑ proven (evidence beside it) · ⚠ unproven (said so).

**Goal:** change his rows on the phone: every field, add, duplicate, delete with Undo, links (with Replace), files.

## MUST

| # | Criterion | Check | Status |
|---|---|---|---|
| W1 | Every editable type is edited on the row page, through the shared editors (`FieldRow`, Flow's), and SENT through Tables' own endpoints (`records#update`, `#link`, `#unlink`), so `TableApp::RecordWriter` checks it and the history logs it | `useFieldWrites.test.tsx` (both paths; planted both ways: red); `tablesApp.test.tsx` › "an editor changes a value through the row's own endpoint, never core's" (planted: red) | ☑ text proven end to end · ⚠ select, date, link and file editors are e2's, tested in Flow; not exercised against Tables endpoints on a device |
| W2 | A one-link column already full offers "Replace" (the web's cardinality answer) | `tables.test.ts` › cardinality (`CardinalityError`, `replace: true`) | ☑ API · ⚠ the Alert path (`RowLinkConflict`) has no screen test: the record picker is driven through a server search the test does not stage |
| W3 | Add a row: the + button makes an empty row and opens it at once (the web's `reveal`; SPEC C3) | `tablesApp.test.tsx` › "the add button…" | ☑ |
| W4 | Duplicate a row (cells and links, the server's `RowCopy`) and show the copy | `tablesApp.test.tsx` › duplicates | ☑ |
| W5 | Delete after a confirm that says where it goes (trash, 30 days, with links and comments); back to the table; Undo restores it | `tablesApp.test.tsx` › deletes… Undo | ☑ |
| W6 | Copy the row's link (the web's URL, so it opens on the laptop and, through `inAppRoute`, on the phone) | menu action; `inAppRoute.test.ts` (row links) | ☑ code · ⚠ clipboard not asserted |
| W7 | Previous / next by a sideways swipe as well as the chevrons; a vertical scroll stays a scroll | `PanResponder` (dx > 2·dy, 60 px) | ⚠ device only |
| W8 | Relations: every linked row (past the 12 a page carries), each opening its row | `tables.test.ts` › relations; `tablesApp.test.tsx` › "links past the first 12…" (planted: red) | ☑ (the relations API test was written with its code, not run red first) |
| W9 | Roles: an owner or editor edits; a viewer gets no editor, no + and no write in the menu | `tablesApp.test.tsx` › viewer (2 tests; planted: red) | ☑ |
| W10 | Files: add (photos or files), open, remove, through e2's `FilesSheet` (core `field_attachments`, which is what the web Tables uses too) | e2's tests | ⚠ not exercised on a Tables row |
| E2 | en and fr | `keys.test`, `locales.test` | ☑ |

## MUST NOT

- Write the shared view: still enforced by every screen test (increment 1).
- Write a table row through core's `field_values#batch_update` (no checks, no history).
- Fork e2's field layer: one additive `FieldTarget.send`, agreed and reviewed by e2.

## Hidden criteria

| | Status |
|---|---|
| Double tap: + and the menu's duplicate and delete are disabled while their request runs | ☑ code (`disabled` on pending) |
| Offline: a write that fails says so in the row's words and the editor's guess is rolled back (`useOptimistic`) | ☑ e2's rollback · ⚠ device |
| Keyboard over the text editor (edge-to-edge Android) | ⚠ device (e2's `BottomSheet` is keyboard-safe on Flow) |
| Dark/light, 360/411/800, en/fr | ⚠ device |

## Not done in this increment, and why

- "Enter = next field" (the web's `enterkeyhint`): every text field opens its own sheet on the phone (e2's editors commit on Save), so there is no next field to move to. Decided with e2 (SPEC C5).

## Gates

Under `flock /data/box-heavy.lock`, ≥ 5 GB to start, killed under 3 GB, Jest on one worker; the bundle goes to `/data`.

| Gate | Status |
|---|---|
| typecheck | ☑ clean |
| lint | ☑ clean |
| jest (full) | ☑ 268 suites, 3,511 tests (lowest 11 GB) |
| bundle | ☑ exported to `/data/mm-bundle-check-e9` |
| device | ☐ after Step 0 and increment 1's device pass |

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
