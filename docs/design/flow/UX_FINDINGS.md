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
| W1 | The board tile shows `card.dueDate`, the column only the AI writes; the card's **Due Date field**, the one a person edits, never reaches the board | Someone sets a due date, goes back to the board, and the date is not there and the card never turns red when it is late | Tile reads the `due_date` field value first, the column as fallback (mobile: `dueOf` in `src/screens/flow/logic.ts`) | Source: `components/BoardCard.tsx:62` | SENT |
| W2 | Quick add creates the card with `flowAppSprintId: null` | Viewing a sprint, you add a card and it vanishes from the column you typed it into (it went to the backlog) | Send the sprint being shown (mobile: `QuickAdd` passes the board's sprint) | Source: `Board.tsx:80` | SENT |
| W3 | A comment's author is `username ?? email ?? id` | A member with no username is shown to everyone on the board by their **email address**, or as a bare number | Show the person's name; never the email; "Someone" as the last fallback | Source: `components/CardDetailDrawer.tsx:646`, `CardShow.tsx:529` | SENT |
| W4 | History shows the raw `eventType` (`card_moved`, `field_changed`…) | Not a sentence; English keys in a French app; says nothing about *what* changed | One translated sentence per event with the values ("moved this from To do to Done") (mobile: `historySentence` in `CardActivity.tsx`) | Source: `CardShow.tsx:640`, `components/CardDetailDrawer.tsx:785` | SENT |
| W5 | Field type names are English literals (`'Text'`, `'Date'`…) | Untranslated in the French app | Through `t()` | Source: `ProjectFields.tsx:28-` | SENT |
| W6 | Every project action shows for every role; the server refuses afterwards | A viewer taps Delete or Edit and gets an error toast: a control that cannot work | Use `my_role` (served since 8fc40eea) to hide what the role cannot do | Source: parity audit, SPEC A2 | SENT |
| W7 | No way for a member to leave a project (the policy allows it) | Stuck on someone else's board until the owner removes you | "Leave project" in the members drawer for a non-owner | Source: `components/ProjectMembersDrawer.tsx` (no leave) | SENT |
| W8 | A sprint cannot be edited after creation (the API has update) | A typo in a sprint name or a wrong end date means delete and recreate, which sends its cards to the backlog | Edit form in `SprintManagerDrawer.tsx` | Source: SPEC A10 | SENT |
| W9 | Backlog has no error state, only a toast on a failed mutation | If the load fails the page is just empty, which reads as "no backlog" | An error state with Retry | Source: `Backlog.tsx` | SENT |

## Mobile (feat/flow-app)

Filled during the device block (360 / 411 / 800 dp, light and dark, en and fr).

| # | Problem | Why it hurts | Fix | Evidence | Status |
|---|---|---|---|---|---|
