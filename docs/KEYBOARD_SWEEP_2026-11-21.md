# Keyboard sweep, 2026-11-21

**Why.** Two controls were measured under the keyboard on qa_phone (Android,
edge-to-edge) during the Pages parity run:

- the Pages text-file editor's Save and Cancel (flow 33), inside a
  `KeyboardAvoidingView` with `behavior={Platform.OS === "ios" ? "padding" : "height"}`;
- the Pages note picker (flow 34): the whole `BottomSheet` (a `Modal`) sat
  behind the keyboard, because nothing in it lifted at all.

An edge-to-edge Android window is not resized for the keyboard
(`docs/TESTING.md` §5). What lifts a view here is arithmetic on the
keyboard's own position: `KeyboardAvoidingView` `"padding"` does it in one
frame, and `KeyboardPadding` (`src/components/KeyboardPadding.tsx`) does the
same arithmetic, eased. `"height"` is the shape measured broken.

**What was searched**, on `origin/main` (4dd5e8f) and on every local and
remote `feat/*` and `fix/*` branch:

1. every `KeyboardAvoidingView` and its `behavior`;
2. every file that renders a `Modal` and a text input without
   `KeyboardPadding`;
3. every component that wraps a `Modal` around `{children}` (the input is
   then in the caller, which search 2 cannot see).

**Blind spot of the search.** A sheet built on a wrapper the search does not
recognise, or an input that is a custom component not named
`TextInput`/`Input`/`TextField`/`SearchField`/`SearchInput`. And no row below
was measured on a device unless it says so.

## Hits

| File | Shape | Verdict | Why |
|---|---|---|---|
| `app/pages/view.tsx` (feat/pages-parity, feat/pane-nav) | KAV `"height"` on Android | **bug, measured** (flow 33) | Save under the keyboard. Fixed on feat/pages-parity: `KeyboardPadding`. |
| `src/screens/pages/drive/sheets.tsx` `BottomSheet` | Modal wrapper, no lift | **bug, measured** (flow 34) | Note picker hidden behind the keyboard. Fixed on feat/pages-parity: `KeyboardPadding` inside the Modal. |
| `app/doc/text.tsx` `KeyboardSheet` (feat/doc-tools, feat/pane-nav) | KAV `"height"` on Android | **bug, same shape, not measured** | The Doc text edit sheet. Fixed on feat/doc-tools: `KeyboardPadding`. |
| `src/components/ScreenContainer.tsx` | KAV `"padding"` | fine, measured | The composer case `docs/TESTING.md` §5 was settled with; iOS path. |
| `src/components/chat/FeedbackReasonDialog.tsx` | KAV `"padding"` in a Modal | fine, not measured | Same overlap arithmetic as `KeyboardPadding`; jumps in one frame instead of easing. |
| `src/components/sessions/RenameDialog.tsx` | KAV `"padding"` in a Modal | fine, not measured | As above. |
| `src/components/sessions/SessionOptionsDialogs.tsx` | KAV `"padding"` in a Modal | fine, not measured | As above. |
| `src/components/shell/AppSwitcher.tsx` | Modal + search input, no lift | probably fine, not measured | The field is at the top of a bottom sheet capped at 80 % of the screen, so it stays above a docked keyboard; the lower rows of the grid go under it. Worth one device look. |
| `app/notes/index.tsx` | Modal + input in one file | fine | The input is on the screen, not in either Modal (two confirm dialogs). |
| `src/screens/finance/Ledger.tsx` | Modal + input in one file | fine | The search is on the screen, not in the Modal. |
| `src/screens/finance/parts.tsx`, `src/screens/pages/ShareSheet.tsx`, `SpaceForm.tsx`, `PageEditorSheets.tsx`, `ItemSheet.tsx`, notes `ShareSheet`/`labels`/`edit`, `todos/TaskSheet.tsx`, `people/NewConversationSheet.tsx`, `finance/loan-edit.tsx` | Modal + input | fine | Already inside `KeyboardPadding`. |

No hit in Tables or in global search / Notes beyond the rows above.

## The guard

`.eslintrc.js` `kav-height` (`no-restricted-syntax`): a `"height"` literal
anywhere in a `KeyboardAvoidingView`'s `behavior` is an error, including the
`Platform.OS === "ios" ? "padding" : "height"` ternary that shipped twice.
Fixture `eslint-fixtures/kav-height.tsx`, case in
`src/__tests__/eslintRules.test.ts`.

DOES NOT COVER: a Modal with an input and no lift at all (the note picker's
shape), a `behavior` computed in a variable, and `"position"`.
