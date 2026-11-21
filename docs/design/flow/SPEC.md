# Flow — SPEC

**Status: IN PROGRESS** (2026-11-20). Built on `feat/flow-app`: every MUST
row below is coded, with API, logic and screen tests. Not yet device-QA'd: the
emulator slot comes from Hello. `DONE` needs `ours/` screenshots at 360, 411
and 800 dp, the flows in `qa/flows/` run, and this file updated in the same
commit.

The owner, via Hello (2026-11-20): *"Flow, then Tables, then Doc. Attack, do
it well."* The bar is the web's Flow in full (inventory with file:line:
`mm-parity-audit/docs/parity/flow.md`), in an easy phone design, with the
custom-field editors built once for Tables to reuse.

---

## R · Mobbin first (RULE ZERO)

Searched 2026-11-20, iOS. The images are in `references/` (gitignored, other
companies' screens); the links below do not expire.

| Ref | Screen | What we took | What we left |
|---|---|---|---|
| Jira Cloud board | [6a847e41](https://mobbin.com/screens/6a847e41-d3f0-446b-bb98-09faf22c2f8e) | One column per page, the next one peeking; filter chips above; "+ Create" at the end of a column | The page dots (our column chips say more: name and count) |
| Jira Cloud board, dark | [098ce53c](https://mobbin.com/screens/098ce53c-ccf8-48c1-a8d6-97fda934d532) | Date chip and priority on the tile, legible on dark | — |
| Asana board | [e8502c9c](https://mobbin.com/screens/e8502c9c-3cea-422b-8434-0e871f4c4d71) | Avatars bottom-right of a tile; an add row per column | The full-width purple header |
| Linear issues by status | [26badb99](https://mobbin.com/screens/26badb99-f19d-4bd2-bd56-a3ce1e28f63b) | Sections per status with a + each: our **Backlog** tab | — |
| GitHub project views | [7d35dba1](https://mobbin.com/screens/7d35dba1-4695-4d82-9d6e-cc648bf9ad73) | A chip in the header that switches what the board shows: our **sprint chip** | — |
| ClickUp task | [84eb5561](https://mobbin.com/screens/84eb5561-df0d-4416-94bf-f5d5ba135874) | Property rows (icon, label, value), then description, then activity: our **card screen** and `FieldRow` | Its separate Details/Activity tabs: one scroll is simpler |
| Todoist task | [131fe373](https://mobbin.com/screens/131fe373-2208-4c8f-933b-b6047a92fb68) | Comment box pinned at the bottom; "Move to…" as an action | — |
| Jira issue | [2173c375](https://mobbin.com/screens/2173c375-47b6-4605-8831-8758c056bb9a) | The status (our column) as a tappable property that moves the card | Grouping every field behind "Details ›": a phone card has few fields, so they show |

## A · Web parity

| # | Web (file) | Mobile | Where |
|---|---|---|---|
| A1 | Projects list, newest first, search, empty, error, skeleton (`Index.tsx`) | Same; **paged** (the web shows the first 20 only); search on the server (`?search=`, 8fc40eea) | `app/flow/index.tsx` |
| A2 | Project card ⋯: edit, members, fields, columns, delete (`ProjectCard.tsx`) | Long press or ⋯ → `ActionSheet`, **role-gated** (the web shows all and lets the server refuse) | `ProjectsTab` |
| A3 | Project form: title, description, colour (`ProjectDrawer.tsx`) | `ProjectSheet`; colour names as the web stores them (`PROJECT_COLORS`) | `src/screens/flow/ProjectSheet.tsx` |
| A4 | Members: owner, list, role, resend, remove, add by search or email (`ProjectMembersDrawer.tsx`) | `MembersSheet`; removal **confirmed**; a member can leave (policy allows, web has no button) | `src/screens/flow/MembersSheet.tsx` |
| A5 | Board: columns, counts, colour, priority filter, sprint selector (`Board.tsx`, `BoardColumn.tsx`) | Pager + column chips; filter sheet (priority, **assignee, label**, order) | `app/flow/board.tsx`, `BoardColumn.tsx`, `FilterSheet.tsx` |
| A6 | Drag cards within and across columns | **Move to…** sheet (column, top/bottom, sprint) through `move` (writes history); "Move to <next>" in one tap; **Reorder mode** (drag or ▲▼) inside a column | `MoveSheet.tsx`, `DragReorder.tsx` |
| A7 | Quick add (Enter adds, stays open) | Same, and the card lands **in the sprint shown** (web bug: it leaves the sprint) | `QuickAdd` |
| A8 | Tile: labels, priority, title, due (red if overdue), assignees, comments | Same, fixed height (`TILE_HEIGHT`), due from the **Due Date field** (web bug: shows the column the UI never edits) | `CardTile` in `parts.tsx` |
| A9 | Delete a card (confirm) | Long press → Delete, creator or owner/admin only (`CardPolicy#destroy?`) | board, card |
| A10 | Sprints: list, create, activate, complete, delete (`SprintManagerDrawer.tsx`) | `SprintsSheet`; delete **confirmed** and says the cards return to the backlog; **edit** (API has it, web has no form) | `SprintsSheet.tsx` |
| A11 | Card: title, column, creator, sprint, custom fields, description, comments, notes, history (`CardDetailDrawer.tsx`, `CardShow.tsx`) | One scroll; comment authors by **name** (web shows an id); history as **sentences** (web shows raw keys); comment **edit** for the author | `app/flow/card.tsx`, `CardActivity.tsx` |
| A12 | Unsaved-changes guard | `beforeRemove` on a half-edited title: Keep editing / Discard / Save | card |
| A13 | Backlog: projects, backlog cards by column, inline add (`Backlog.tsx`) | Same, every project paged, a card opens the **card** (web opens the board), an error state (web has none) | `src/screens/flow/Backlog.tsx` |
| A14 | Manage columns: colour, rename, final, reorder, delete, add (`ProjectColumns.tsx`) | Same; delete says where the cards go; reorder by drag or ▲▼ | `app/flow/columns.tsx` |
| A15 | Project fields: 13 types, record class, required, options, labels (`ProjectFields.tsx`) | Same, types **in words, both languages** (web: English literals); deletes confirmed | `app/flow/fields.tsx` |
| A16 | Links `flow_project`, `flow_card`, `?card=` | Open the board / the card in the app | `src/lib/inAppRoute.ts` |
| A17 | Assistant reads and changes boards | "Ask the assistant" on board and card composes a question (the app's rule) | `useAsk.ts` |

LATER, as the audit: reorder fields, reset a sprint's end date, the project icon.

## F · The shared field editors (Tables reuses them)

Agreed with e9 (Tables) 2026-11-20: Tables bases on these files and extends
them; nobody forks them.

- `src/api/fields.ts`: definitions, values (`scalar` / `records` / `files`), every `core/*` call. App-agnostic: a write names `{type, id}` of its record.
- `src/components/fields/useFieldWrites.ts`: optimistic writes for any record, given a `FieldTarget` (its caches and how to patch them).
- `src/components/fields/FieldRow.tsx`: one row per field, the editor per type (text family with formats, rich text in the Notes editor, switch, month grid and time wheel, options, server-searched record picker with label creation, files).
- `src/components/fields/display.ts`: what a value reads as, pure and tested.

## D · Decisions, with the reason

1. **Default scope "All cards"** where the server pages (multi_magic feat/flow-rest-paging): a person opening a board expects to see the cards. On an older server the chip says "No sprint (backlog)", which is what it then shows.
2. **"Board order" by default**, priority as an option: reorder only means something in the board's own order (the web sorts by priority, so its drag inside a column is mostly undone on reload).
3. **No layout or transform animation on a tile** (owner rule 2026-11-17). Reorder is a mode that swaps the recycled list for a plain one.
4. **Colours are data**: project colours are names, column colours hexes, both as the web stores them; not theme tokens.
5. Flow's app colour is **mint** `#3ecf9a` (`MINT`), clear of the icon's teal and green.

## QA — the device plan (to run when Hello gives the slot)

**Rig.** `qa_phone2` only (claim it: `./qa/qa.sh claim flow`), Metro 3029, API
3001 through `10.0.2.2`, `nvm use` first. The QA account only, never the
owner's (`.env` `QA_EMAIL`). Everything this run makes is named `[qa] …` and
deleted at the end; nothing is seeded. Name the AVD in the report
(`pgrep -af qemu-system`). Force-stop and relaunch after every `wm density`
(RN caches the window size).

**Matrix.** Each screen at **360, 411 and 800 dp** (`wm size` / `wm density`),
**light and dark**, **en and fr**. That is 12 shots per screen; a contact sheet of
them goes to MultiMagic Pages and to Hello, and the three-width set to `ours/`.

| # | Screen / state | How it is reached | Passes when |
|---|---|---|---|
| Q1 | Projects list, empty | fresh QA account (or after cleanup) | empty state + "Create your first project"; no overlap at 360 fr |
| Q2 | Projects list, rows | after Q3 | newest first; stats line fits 360 fr; role pill absent for owner |
| Q3 | New project sheet | FAB | keyboard does not cover Save (edge-to-edge, `KeyboardPadding`); empty title refused |
| Q4 | Board, phone | the new project | one column per page with the next peeking; chips scroll; chip jumps; snapping lands on a column edge |
| Q5 | Board, tablet (800 dp) | same | columns side by side, 300 dp each, no peeking clip |
| Q6 | Quick add | + in To Do | card shows at once, field stays open for the next |
| Q7 | Long press menu, Move to…, Move to next | a card | the board follows the card to its new column; history says "moved it from To Do to Done" |
| Q8 | Reorder mode | column ⋯ › Reorder | drag by the grip moves the card; ▲▼ too; Done returns to the list; **no row overlap after leaving the mode** (recycled-cell rule) |
| Q9 | Filter sheet | Filter | the count badge; "1 of 2" in the column header; Clear |
| Q10 | Sprints | sprint chip | create (dates, end before start refused), start, complete, switch scope, delete (confirm says cards go back) |
| Q11 | Card | tap a card | each field type opens its editor; date grid; time wheel; option colours; record picker search; **attachment from Photos and from Files**, opens, removes |
| Q12 | Description | Add a description | the Notes editor opens and the text comes back rendered |
| Q13 | Comments, notes, history | card tabs | composer above the keyboard; long press → Copy / Edit / Delete; link a `[qa]` note and open it |
| Q14 | Columns screen | board ⋯ › Columns | rename, colour, Final, reorder, add, delete (confirm names the target) |
| Q15 | Fields screen | board ⋯ › Project fields | types in words (fr too); add a select with options; labels editor; delete confirmed |
| Q16 | Members | board ⋯ | search finds a user; role sheet; invite by email is **opened and cancelled** (an email would go to a real address) |
| Q17 | **Viewer** | needs a second account made viewer on a QA project | no + / ⋯ / field editors; comment still possible. **Needs a throwaway second account: if none exists this is NOT MEASURED** (jest covers it: `flowApp.test.tsx` "gives a viewer…") |
| Q18 | **Long board, paging** | a QA project with 250 `[qa]` cards made through the REST API as the QA account, deleted after | the "Loading cards… n of 250" pill, then every card; scroll a 120-card column without jank; counts right |
| Q19 | **Offline** | `svc wifi disable; svc data disable` on the emulator, then back | the offline banner; a write fails and is put back with its sentence; Retry after reconnect |
| Q20 | **Error** | API stopped is NOT allowed (shared backend): use `qa/faults.sh` proxy 5xx | `LoadFailure` with Retry on projects, board and card |
| Q21 | Links | `adb shell am start -d 'multimagic://flow/card?projectId=…&id=…'` and a chat link | opens the card with Home under it |
| Q22 | Reopen | kill on a board, relaunch | reopens that board |
| Q23 | Cleanup | delete the QA project(s) | none of `[qa] …` left (checked with a GET as the QA account) |

`qa/flows/28-flow.yaml` covers Q1-Q7 and Q23 automatically; the rest is driven
by hand with screenshots, each with its verdict in the report.

## Receipts

| Gate | Result | When |
|---|---|---|
| `tsc --noEmit` | rc 0 | 2026-11-20 15:11 |
| `eslint --max-warnings 0 app src` | rc 0 | 2026-11-20 15:12 |
| Jest, full, `--maxWorkers=1` | 3419/3420; the one failure (a nameless "Show older" button, `a11y.test.tsx`) fixed and its suite rerun green | 2026-11-20 15:20-15:36 |
| Planted breaks | viewer given `editCards`, tile due date read from the card's column: 5 tests red; restored | 2026-11-20 15:17 |
| `npm run bundle` (node 22.19.0) | rc 0, android Hermes bundle 8 MB | 2026-11-20 15:52 |
| Device QA | NOT MEASURED (awaiting the slot) | — |
