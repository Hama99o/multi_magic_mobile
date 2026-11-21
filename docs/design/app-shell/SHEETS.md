# One sheet shape for the whole app (2026-11-21)

**Rule (Hello for the owner):** a sheet is a bottom sheet the width of the
screen on a phone, and a centred 560 dp card on a tablet (≥ `SPLIT_AT`,
800 dp). That is the Apps sheet's shape (`src/components/shell/AppSwitcher.tsx`).
Found on the device: at 800 dp the Notes sheets spanned the whole width.

**The component:** `src/components/SheetFrame.tsx` (`SHEET_CARD_WIDTH` = 560;
`keyboard` for a sheet with a field; a tap on the scrim closes it). Proof:
`src/components/__tests__/SheetFrame.test.tsx`, and in Notes
`notes-index` "sheets on a tablet".

## Migrated

Notes (feat/notes-parity, 04a9c14): colour picker, reminder, share, Edit
labels, a note's Labels, Linked in pages, the grid's selection ⋯, the
editor's ⋮, the code-language sheet.

## To migrate, in this order

Shared components first: one change moves many sheets.

| # | Where | Sheets | Field (keyboard) | Notes |
|---|---|---|---|---|
| 1 | `src/screens/pages/drive/sheets.tsx` `BottomSheet` | 12 uses in Pages | some | Pages' own frame: point it at `SheetFrame` |
| 2 | Flow `src/components/BottomSheet.tsx` (feat/flow-app) | 37 uses | yes (`focusRef`) | keep its `focusRef`/`focusSoon`; wrap `SheetFrame` |
| 3 | `src/components/settings/ProfileSheet.tsx` | 1 | no | opened from every header |
| 4 | `src/components/sessions/SessionsSheet.tsx` | 1 | no | assistant history |
| 5 | `src/components/chat/AttachSheet.tsx`, `SourceSheet.tsx`, `FilePreview.tsx` | 3 | no | |
| 6 | `src/screens/people/NewConversationSheet.tsx`, `MembersSheet.tsx` | 2 | yes | |
| 7 | `src/screens/todos/TaskSheet.tsx` | 1 | yes | |
| 8 | `src/screens/finance/Ledger.tsx`, `parts.tsx`, `HelpSheet.tsx`, `manage/BudgetSheet.tsx` | 4 | Ledger, parts | |
| 9 | `app/finance/loan.tsx`, `app/finance/loan-edit.tsx` | 2 | loan-edit | |
| 10 | `src/screens/pages/ItemSheet.tsx`, `ShareSheet.tsx`, `SpaceForm.tsx` | 3 | yes | |
| 11 | `src/screens/contacts/ActionSheet.tsx`, `src/screens/calendar/ChoiceSheet.tsx` | 2 | no | |

Each row: swap the `Modal` + scrim + card for `SheetFrame`, keep the card's
own padding and `testID`, run that app's suite, and one 800 dp screenshot.
A row is one commit. Centred dialogs (confirmations, the delete-label
question) are already centred and stay as they are.
