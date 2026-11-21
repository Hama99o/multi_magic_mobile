# Tables increment 5 — Collaborate

**Goal (owner, via Hello, 2026-11-20):** everything the web lets people do together on a table, on the phone.

## MUST → evidence

| # | Criterion | Check | Status |
|---|---|---|---|
| 1 | Long-press select, bulk edit one column, bulk delete, one Undo | `tablesApp.test.tsx` "bulk"; commit `0fd6735` | ☑ tests; device pass 2 |
| 2 | Share: invite by email with a role, change a role, resend, remove; owner only; the email warning on the button's line | `tablesApp.test.tsx` "share the base"; `0bc0c1d` | ☑ tests; never invites a real address on a device |
| 3 | Comments on a table or a row, newest first, older on demand; @mention by ACCOUNT id; edit or delete your own | `tablesApp.test.tsx` "comments and history"; `46cd209` | ☑ tests; device pass 2 |
| 4 | Files on a comment: the server's rule on the phone (5 files, 10 MB each, `TableApp::Comment::FILE_TYPES`), a refusal said by name and why, chips removable, files-only send, multipart `comment[files][]`, files open | `commentFiles.test.ts`, `tables.test.ts` "multipart", `tablesApp.test.tsx` "joins files"; `5fcd073` | ☑ red first (3 failed + the suite could not load) → green. ☑ device pass 3: mp4 refused (en + fr), chip removed, files-only sent, file opens in Chrome from :3020 storage |
| 5 | A files-only comment draws no empty line | `tablesApp.test.tsx` "files only draws"; `b7396b1` | ☑ red (1 empty text) → green; found on device pass 3 |
| 6 | History in words, by kind, with the assistant/import badge; Restore a deleted column | `history.test.ts`, `tablesApp.test.tsx` | ☑ tests; device pass 2 |
| 7 | History by person (server `user_id`), offered with ≥ 2 people, not on a row's history | `tablesApp.test.tsx` "filters the table's history by person", "a row's history offers no person filter"; `5fcd073` | ☑ red → green. ☑ device pass 3 on :3020: Everyone 4 lines, Sam 1, Alex 2; fr at 360 dp fits |

## Moved to 4b
- History grouped by day (Today / Yesterday / date), as the web's `HistoryFeed.tsx`.

## Hidden criteria
- en/fr ☑ (tests, plus the device at 360 dp in fr); 360 dp ☑ device; 800 dp ☐ not shot; dark ☐ not shot.
- Double tap: Send is disabled while busy ☑ (code; no device check).
- Roles: share is owner-only ☑ tests; restore is editor-only ☑ tests.
- Offline / slow network: the comment send shows its failure and keeps the text and files ☐ not measured on a device.

## Gates
feat/tables @ `5fcd073`, 22:07–22:15, each step at ≥ 8 GB: typecheck, lint, Jest 3610/3610, bundle `--clear`; the `.hbc` grep (`-a`) found `tables-comment-attach` 1, `tables-history-person` 1, `mm-doc/app` 0. `b7396b1`: lint and typecheck on the changed files, Jest tablesApp 54/54.

## Records created and deleted (device pass 3, :3020 demo DB)
Base 6 "[qa] p3 people" (shared with Sam Rivera, 2 rows, 1 comment with 1 file) was deleted at 22:36; a list call showed `bases_left: []`. The photo and video pushed to the emulator's gallery were removed.
