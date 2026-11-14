# Everything is editable on the phone (owner decision, 2026-11-13)

> "for notes we should be able to do all on mobile" (the owner, after trying
> the editor on the emulator).

There is no "Edit on the web" or "View on web" anywhere in Notes. Every block
the web edits, the phone edits. The rule from plan §8 stays: **a block the
person did not touch leaves the phone byte for byte** (source map, tested).

This replaces SPEC §C8 ("read-only blocks are a view-on-web card"), the
"read-only" rows 11, 17, 18, 43 and 44 of §D, and the read-only part of §H.

## Sources (Mobbin, 2026-11-13)

| App | Screen | What we take | What we reject |
|---|---|---|---|
| Craft | [Edit table sheet](https://mobbin.com/screens/e98ab0b4-9fb4-40da-88fc-c62edb474d7e) | a cell tapped shows a ⋮ handle; the handle opens an **Edit table** sheet: Insert row / column, Move, then **Delete row / column in red, last** | moving columns (the web has no column move) |
| Apple Notes | [Row menu](https://mobbin.com/screens/8a0f7c91-f68c-417d-aadc-e8462a8424e9) | the table is edited **inline**, in the note, with a small menu on the row handle (Add row, Delete row) | Paste in that menu (the OS menu has it) |
| Evernote | [Insert table cell](https://mobbin.com/screens/f2801f7e-5914-433c-bcb8-bece060b9f11) | the four inserts named by side: **column left / right, row above / below** (the web's `addColumnBefore/After`, `addRowBefore/After`) | — |
| Freeform | [Rows / columns steppers](https://mobbin.com/screens/5c75799e-9c8c-4a1e-b65e-db8a9e04c49a) | rows and columns as − / + steppers when **inserting** a new table | autogrow cells |
| Evernote | [Code language list](https://mobbin.com/screens/c5ca7850-e863-4999-9fdd-b962f6a08ded) | the code block shows its language as a chip on the block; the chip opens the list | a dropdown over the text (it hides the code on a phone) |
| Notion | [Language search](https://mobbin.com/screens/12781a0c-9ef3-4086-8581-252bda8c0bf7) | **a sheet with a search field** for the language, Done on the right | — |
| Craft | [Edit code](https://mobbin.com/screens/611f805b-52e9-4dc8-90f1-a15a307a8367) | monospace, line numbers off by default, a Copy action on the block | a separate full-screen code editor (ours is inline) |
| Attio, Dropbox | [Comment actions](https://mobbin.com/screens/78060571-5f36-4a6a-aaf6-899e4b992a0c), [thread sheet](https://mobbin.com/screens/6e634f22-a53f-4071-ae37-b7f5fcc00487) | kept for when the web turns comments on (decision 4) | everything, for now |

## Decisions

1. **Code blocks are edited inline** by engine B (B edits `codeBlock`; we saw
   it on the spike). Monospace, no autocorrect or capitalisation (not yet:
   switching them breaks B's input, see MISSING_FEATURES, 2026-11-14), whitespace
   kept as typed. A **language chip** on the block opens a sheet with search
   (Notion). The list is the web's lowlight languages. The block writes the
   web's `<pre><code class="language-x">`.
2. **Sub/sup are real marks**: toolbar keys **x₂** and **x²** in the
   selection row and the Format panel. B does not draw them (nor highlight)
   on Android, so we patch B's Kotlin renderer: `SubscriptSpan` /
   `SuperscriptSpan` at 0.75 size, and `BackgroundColorSpan` for highlight
   (`RenderBridgeInlineAndAtoms.kt`, via patch-package). It's a Kotlin-only
   change; the Rust core is not rebuilt. The patch is pinned to B 2.2.3 and
   offered upstream after the owner's "oui". iOS gets the same patch when
   iOS starts.
3. **Tables are edited inline** in B (`withTablesSchema`, Tiptap preset;
   built 2026-11-13: a table key in the bar opens the table panel with the
   web's eleven commands; the "Edit table sheet" below became that panel).
   Tapping a cell puts the caret in it. The cell's ⋮ handle opens the
   **Edit table** sheet: Insert column left / right, Insert row above /
   below, Header row on/off, Delete row, Delete column, Delete table (the
   three deletes in red, last). Commands go through B's `runTableCommand`.
   **Spans:** B must keep `colspan`/`rowspan`/`colwidth`. A Jest test checks
   our glue, and a device test checks B. **If B drops or breaks spans**, the
   fallback is the owner's: a table whose cells span opens in a **table
   editor sheet** (a native grid of cell inputs over our JSON). The inline
   path stays for plain tables.
4. **Comments: off on the web, so off on the phone** (Hello's decision,
   2026-11-13; revisit if the web turns them on). There is no comments UI,
   no store and no web toggle, and multi_magic is not touched. Comment
   markup already in a stored note is kept: the codec reads it with its
   comments profile, and the comment travels through engine B as an
   invisible mark (and `commentId` on blocks). So it survives edits around
   it, even in the same paragraph, and is written back as the web wrote it.
   Deleting the commented text deletes it. It is drawn as plain text.
5. **Legacy content becomes normal blocks when we know its type**: a legacy
   `<img data-width>` is an image block (replace, delete, move). A YouTube
   `<iframe>` is an embed block (change the link, delete, move). `h4–h6`
   becomes editable headings kept at their level. The block keeps its bytes
   until the person edits it; then it is written the web's way. **Truly
   unknown markup** stays one preserved block that can be moved or deleted,
   with a neutral label and no web link.
6. **No web link anywhere in Notes**: not in the read view's header, not on
   any card.

## Keyboard never hides what you type (owner, 2026-11-13)

> "make sure we check the keyboard hiding places"

Checked on a phone (411 dp) **and** a small phone (360 × 640 dp), keyboard
up, with a screenshot of each case for the QA sheet:

- the caret line is above the keyboard and the toolbar: at the top, the
  middle and the end of a long note, and in the title;
- with the keyboard up, nothing sits behind the toolbar: the save state, the
  last line, a table cell, a code block, the comment input sheet;
- rotation, opening and closing the keyboard repeatedly, hardware Back with
  the keyboard up;
- Pashto and Dari (RTL) lines.

Test-first: a Maestro helper asserts the focused element's bounds end above
the keyboard's top (from `dumpsys input_method`/window insets), and flow 27
calls it after each typing step.

## Order of work (each step test-first, each its own commit)

1. Remove every web link from Notes (read view and editor).
2. Code blocks editable plus the language sheet.
3. Sub/sup marks plus keys; the B Kotlin patch (sub/sup/highlight), then a
   native rebuild.
4. Tables inline plus the Edit table sheet; spans checked on the device;
   the sheet editor if needed.
5. Legacy img / iframe / h4–h6 as normal blocks; unknown markup moveable and
   deletable.
6. Comment markup kept as an invisible mark (no UI).
7. Keyboard occlusion QA plus flow 27 on two sizes, then the full device pass.

## Parity: web editor feature → phone control (keep it green)

The source of truth is `WEB_PARITY` in `src/screens/notes/editor/toolbarModel.ts`.
`toolbarModel.test.ts` fails if a web feature has no control. "Where" says
how it is reached; the last column is the state on the device.

| Web feature (tiptop-editor) | Phone control | Where | Device |
|---|---|---|---|
| Paragraph, Heading 1–3 (slash, turn into) | block chips | `+`, `Aa`, block-type key | NOT MEASURED |
| Bulleted / numbered / to-do list | list keys | main row, `Aa`, `+` | NOT MEASURED |
| Blockquote | block chip | `Aa`, `+` | NOT MEASURED |
| Code block (create, convert, language, edit) | block chip + language chip | `Aa`, `+`, on the block | NOT MEASURED |
| Separator | insert item | `+` | NOT MEASURED |
| Image | insert item + picker | main row, `+` | step 5 |
| Table (insert 3 × 3 with header) | insert item | `+` | NOT MEASURED |
| Table: row above/below, column left/right, header row/column, merge, split, delete row/column/table (the web's 11) | table panel | the bar's table key, while the caret is in a table | NOT MEASURED |
| Bold, italic, underline, strike, inline code | mark keys | selection row, `Aa` | NOT MEASURED |
| Subscript, superscript | mark keys | selection row, `Aa` | drawn by the B patch; NOT MEASURED |
| Link | link key + address dialog | selection row | NOT MEASURED |
| Text colour (10 web colours) | colour panel | selection row, `Aa` | NOT MEASURED |
| Highlight (10 web colours) | colour panel | selection row, `Aa` | drawn by the B patch; NOT MEASURED |
| Align left / centre / right / justify | align keys | `Aa` | NOT MEASURED |
| Indent / outdent (lists) | keys | main row, `Aa` | NOT MEASURED |
| Undo / redo | keys | main row | NOT MEASURED |
| H4–H6 | not offered: the web has only levels 1–3; stored h4–h6 are kept | — | — |
| Comments | not offered: off on the web (decision 4); markup kept | — | — |

**iOS:** none of this is measured on an iPhone yet. This Linux box has no
simulator. The owner's iPhone checklist is in the QA report when the build
reaches TestFlight.
