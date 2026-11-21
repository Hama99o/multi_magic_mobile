# Flow · UX and design findings

The owner, 2026-11-20: Flow has "a lot of problems linked to user experience
and design, web also. First implement on mobile, you'll notice the things, and
fix them on web too."

One row per problem: what it is, why it hurts, the fix, and the evidence.
**Web** rows go to the session that owns the web (multi-magic-83); **mobile**
rows are fixed on `feat/flow-app`. Status: `OPEN` · `FIXED <sha>` · `SENT`.

Evidence is labelled by kind. *Source* means read in the code at the commit
named, not yet seen on a screen; a screenshot replaces it after the device
block (`ours/`, or the web at the same width).

## Web (multi_magic, read at e9adf512)

| # | Problem | Why it hurts | Fix | Evidence | Status |
|---|---|---|---|---|---|
| W1 | The board tile shows `card.dueDate`, the column only the AI writes; the card's **Due Date field**, the one a person edits, never reaches the board | Someone sets a due date, goes back to the board, and the date is not there and the card never turns red when it is late | Tile reads the `due_date` field value first, the column as fallback (mobile: `dueOf` in `src/screens/flow/logic.ts`) | Source: `components/BoardCard.tsx:62` | FIXED f19b58c3 (web `fix/flow-web-ux`, local) |
| W2 | Quick add creates the card with `flowAppSprintId: null` | Viewing a sprint, you add a card and it vanishes from the column you typed it into (it went to the backlog) | Send the sprint being shown (mobile: `QuickAdd` passes the board's sprint) | Source: `Board.tsx:80` | FIXED f19b58c3 (web `fix/flow-web-ux`, local) |
| W3 | A comment's author is `username ?? email ?? id` | A member with no username is shown to everyone on the board by their **email address**, or as a bare number | Show the person's name; never the email; "Someone" as the last fallback | Source: `components/CardDetailDrawer.tsx:646`, `CardShow.tsx:529` | FIXED f19b58c3 (web `fix/flow-web-ux`, local) |
| W4 | History shows the raw `eventType` (`card_moved`, `field_changed`…) | Not a sentence; English keys in a French app; says nothing about *what* changed | One translated sentence per event with the values ("moved this from To do to Done") (mobile: `historySentence` in `CardActivity.tsx`) | Source: `CardShow.tsx:640`, `components/CardDetailDrawer.tsx:785` | FIXED f19b58c3 + 331241f6 (web `fix/flow-web-ux`, local) |
| W5 | Field type names are English literals (`'Text'`, `'Date'`…) | Untranslated in the French app | Through `t()` | Source: `ProjectFields.tsx:28-` | FIXED f19b58c3 (web `fix/flow-web-ux`, local) |
| W6 | Every project action shows for every role; the server refuses afterwards | A viewer taps Delete or Edit and gets an error toast: a control that cannot work | Use `my_role` (served since 8fc40eea) to hide what the role cannot do | Source: parity audit, SPEC A2 | FIXED f19b58c3 (web `fix/flow-web-ux`, local) |
| W7 | No way for a member to leave a project (the policy allows it) | Stuck on someone else's board until the owner removes you | "Leave project" in the members drawer for a non-owner | Source: `components/ProjectMembersDrawer.tsx` (no leave) | FIXED f19b58c3 (web `fix/flow-web-ux`, local) |
| W8 | A sprint cannot be edited after creation (the API has update) | A typo in a sprint name or a wrong end date means delete and recreate, which sends its cards to the backlog | Edit form in `SprintManagerDrawer.tsx` | Source: SPEC A10 | FIXED f19b58c3 (web `fix/flow-web-ux`, local) |
| W9 | Backlog has no error state, only a toast on a failed mutation | If the load fails the page is just empty, which reads as "no backlog" | An error state with Retry | Source: `Backlog.tsx` | FIXED f19b58c3 (web `fix/flow-web-ux`, local) |
| W10 | A new project's columns, field names and priority options are created in English whatever the person's language ("To Do", "Priority", "High") | A French user's first board is half English, on web and phone alike | Server: seed `default_columns` and `default_fields` in the creator's `users.lang` | Source: `app/models/flow_app/project.rb:75`, `project/default_fields.rb`; device: `ours/411-dark-fr-card.png` | SENT |
| W11 | Field edits (priority, points, labels, dates…) write no card history; only create, move and comment do | "Who changed the priority?" has no answer anywhere | Server: write a `CardHistory` row from `core/field_values#batch_update` when the record is a Flow card | Source: `FlowApp::CardHistory` is written by card actions only; device: history after setting High and 5 | SENT |
| W12 | With no sprint picked the board shows only cards outside any sprint, under a chip that reads "Sprints" (found by multi-magic-83) | Looks like "all cards" while sprint cards are hidden | Same label on both: "Not in a sprint" / "Hors sprint" (mobile already) | multi-magic-83, web | SENT |

## Mobile (feat/flow-app)

Filled during the device block (360 / 411 / 800 dp, light and dark, en and fr).

| # | Problem | Why it hurts | Fix | Evidence | Status |
|---|---|---|---|---|---|
| M1 | One Enter in quick add created the same card **twice** (server log: two POSTs in the same second, ids 48/49 and 50/51); the two placeholder cards also shared a list key | A board fills with duplicates a person has to find and delete; the duplicate key can make a row vanish or repeat | `useSubmitText` (`src/lib/useSubmitText.ts`): the text is taken from a ref and emptied in the same tick, so the second call finds nothing; used by quick add, backlog add, labels; the column form ignores a second save for 500 ms; placeholder ids from a counter (`nextGuessId`) | Device: `ours/411-light-en-board.png`, server log; red test `flowApp.test.tsx` "sends a card ONCE…" | FIXED (uncommitted) |
| M2 | Every sheet with a field (story points, new project, sprint, column, field name, comment edit, note search) placed the cursor and opened **no keyboard** | A second tap on every edit; on a phone that is most of the edits | `BottomSheet` `focusRef`: focus once the Modal reports it is shown (`onShow`), not at mount | Device: number pad up at once after the fix; `BottomSheet.focus.test.tsx`, planted break red | FIXED (uncommitted) |
| M3 | The board had **two** side gutters (`Screen`'s 16 dp and its own): the header title shrank to 75 % in an 83 dp slot, and the next column's peek (28 dp) fell to ~2 dp | The project name is unreadable on the one screen that is about it; nothing says the board scrolls sideways | The board's content runs edge to edge inside `Screen` (`marginHorizontal: -lg`) | Device: `ours/411-light-en-board.png` (before) / `ours/411-light-en-board-fullbleed.png` (after) | FIXED (uncommitted) |
| M4 | Every tile is 112 dp whatever it holds; a title-only card is two thirds empty | Five cards a screen on a 411 dp phone; a column of twenty is four screens of scrolling | A tile height computed from what the card shows (badge row, two title lines, meta row): still fixed per card, not measured, so recycling stays stable | Device: `ours/411-light-en-board-fullbleed.png` | OPEN |
| M5 | Empty projects list shows **two** create buttons (the empty state's and the FAB) | Two answers to one question | Hide the FAB while the list is empty | Device: `ours/411-light-en-projects-empty.png` | OPEN |
| M6 | "Created by" shows twice on a card: a property row and the footer line | Noise in the densest screen | Keep the footer (it carries the time), drop the row | Device | OPEN |
| M7 | Priority sheet offers "None" and "Clear", which do the same | Two answers to one question | Drop "Clear" where the options have a "none" | Device | OPEN |
| M8 | Back from a card opened by a link goes to the Assistant, not to the card's board | A notification about a card leads to a dead end after one Back | When a card is the first screen, Back opens its board | Device | OPEN |
| M9 | Field edits (priority, story points) write no history; only create, move and comment show | "Who changed the priority?" has no answer, on web or phone | Server: write a history entry from `core/field_values/batch_update` for a Flow card | Device: history after setting High and 5 | OPEN (server, to confirm in code) |

## Measured on the demo stack (:3020, multi-magic-83), 2026-11-20 21:50–22:07

The three items the first block could not reach, on qa_phone3 with the
bundle confirmed to be mm-flow (served bundle grepped for its path and
`10.0.2.2:3020`):

| What | Result | Evidence |
|---|---|---|
| Paging, 268 cards (owner) | The board follows every page by itself; "All cards" offered (this server pages); column counts 45/45/45/45/44/44 equal the database's | `ours/411-light-fr-demo-bigboard.png`, a read-only count per column |
| Viewer (lea.noname, no username) | No add (+) and no column ⋯; board menu = People + Ask only; card fields read-only ("—"); card menu = Open the board + Ask; People shows owner, member and "You" with Leave, no invite or remove; her comment is signed "Léa Bernard", never an email; she deletes her own comment | `ours/411-light-*-viewer-*.png`; the `[qa]` comment deleted (0 left) |
| Backlog with data | Grouped by column with counts; no inline add for a viewer | `ours/411-light-en-viewer-backlog-open.png` |

Small, OPEN: the backlog's collapsed project row shows no card count; People opens 320 ms after the menu closes (deliberate, to let the menu's Modal go), which reads as a lag.
