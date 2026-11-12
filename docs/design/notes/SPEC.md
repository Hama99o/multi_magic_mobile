# Notes — a native rich-text editor, no WebView (2026-11-12)

**Status: `SPECIFIED`** (was `RESEARCHING` until 2026-11-12). Decided, not
built. Rule Zero done: 28 screens read on Mobbin and downloaded into
`references/`. A web feature parity table (§D) and the reusable editor parts
(§E) are written. The board is `board/notes-board-2026-11-12.png`. Nothing in
`src/` or `app/` exists for Notes yet. No device was used for this research.

The owner, 2026-11-12 (relayed by the supervisor session): *Notes as the next
full app, with a native editor (no WebView) that reads and writes the same
notes as the web, aiming for full parity with tiptop-editor. Edit the common
blocks on the phone now. Show what cannot be edited yet as read-only, with a
date for when it can be.*

That reverses "this app has no note screen, it composes a question"
(`CLAUDE.md`, Design) for notes, on the owner's request. Pages, Calendar and
Contacts did the same. The note screen keeps an **Ask the assistant** row in its
`⋯` menu, so nothing the old rule gave is lost.

> **About the folder name.** The owner said "refs/". The folder is
> `references/` because that is the name `.gitignore:46`
> (`docs/design/**/references/`) already ignores. **This repo is public**, so
> other companies' screenshots must never be committed. A `refs/` folder would
> be committed by the first `git add .`. `git check-ignore -v` confirms
> `references/notion-toolbar-01.png` is ignored.
>
> **The board is ignored too.** `board/notes-board-2026-11-12.png` embeds the
> same screenshots, so `board/.gitignore` ignores `*.png` there. Only
> `SPEC.md` and that `.gitignore` are meant to be committed. To publish the
> wireframes alone, crop the "Ours" row into `ours/` once they are real
> device screenshots (README rule 4).

---

## A · What the web and the API have, and where it lands on the phone

Read from `multi_magic/app/javascript/pages/notes/`,
`Api::V1::NoteApp::NotesController`, `NoteApp::NoteSerializer`, and
`tiptop-editor/src` (branch `feat/shared-doc-schema`), 2026-11-12.

| Web | API | Phone |
|---|---|---|
| Notes grid with search, tag tabs and a pinned-only filter | `GET /api/v1/note_app/notes?search=&tag_id=&pinned=&page=` (server order: `pinned desc, updated_at desc`, `notes_controller.rb:195`) | `app/notes/index.tsx`: a list, not a grid. A **Pinned** section, then the rest, in the server's order (§C1) |
| Open a note (`Show.tsx`) | `GET notes/:id` → `{ note: { id, title, description, data, status, pinned, color, tags, tag_ids, role, is_shared, shared_users, updated_at … } }` | `app/notes/[id].tsx`: the editor (§C2) |
| New note | `POST notes` (`title, description, data, color, pinned`, `note_params` at `:213`) | the list's round **+** creates the note and opens it with the cursor in the title |
| Autosave: **`AUTOSAVE_MS = 500`** (`Show.tsx:32`, `NoteWindowBody.tsx:46`), body = `editor.getHTML()` (`NoteEditor.tsx:107`) | `PUT notes/:id` `{ title?, description?, pinned?, color? }` | the same 500 ms debounce, **after** the local draft is written (§C11) |
| Pin, colour, tags | `PUT notes/:id` (`pinned`, `color`), `PUT notes/:id/toggle_tag`, `GET tags` | the editor's `⋯` sheet: Pin, Colour (the note's colour dot), Tags |
| Trash, restore, delete for ever, duplicate | `DELETE :id`, `GET trashes`, `PUT :id/restore`, `DELETE :id/destroy_permanently`, `POST :id/duplicate` | Delete with Undo (the Calendar's `UNDO_MS`). A Trash screen, as in Contacts |
| Share with a user, rights | `PUT :id/share_with_user_toggle`, `update_shared_user_rights` | **read-only for now.** The `role` the server sends decides whether the note can be edited. A viewer gets the editor with `editable={false}`. Managing shares stays on the web (open question 4) |
| Images in the editor: `imgUploadUrl = ${API_URL}/api/v1/images` (`NoteEditor.tsx:48`), answer `url` or `image.url` | `POST /api/v1/images` (multipart) | `ImageBlock` uploads there with a progress bar (§C8) |

**The stored format is HTML, not JSON.** `note_app_notes.description` is a
text column holding tiptop's `getHTML()`
(`tiptop-editor/docs/SHARED_DOC_SCHEMA_PLAN.md` §6). The phone does not render
that HTML in a WebView. It parses it into the document model with **the codec
in `tiptop-editor/schema`** (`fromHTML(html) → doc`), edits that model natively,
and writes it back with `toHTML(doc)`. `toHTML` produces the same bytes as the
web's `getHTML()`, so opening and closing a note on the phone without changes
leaves it byte-for-byte unchanged (plan §8, guarantees 1–3). The phone keeps
anything it cannot edit (tables, code blocks, legacy markup) as a node that
holds its original HTML, and writes it back **at the same place, byte for
byte** (§C7). A phone save never removes something the web would have shown.

The phone only ever creates content `validate()` accepts, using the default
profile (no `comments`: MultiMagic web does not set `showCommentMenu`). It
never produces mark pairs the schema excludes: `code` excludes every other
mark, so the toolbar disables B/I/U/S/colour/link inside inline code instead
of writing a pair the web would drop (plan §8, "Mark exclusions matter").

## B · Sources (Rule Zero): 28 screens, images in `references/` (gitignored)

Apps: Notion ×9, Apple Notes ×4, Bear ×3, Craft ×3, Obsidian ×2, plus seven
from other apps where none of the six had the pattern on Mobbin (reorder,
checklist state, empty list). **Google Keep is not on Mobbin.** iOS and web
searches for Keep returned other apps, so this SPEC has no Keep reference.
The Keep ideas it would have given (a coloured note card, checked items
greyed) are covered by Apple Notes, Amie, Numo and Obvious.

| App | Screen | File | What we TAKE | What we REJECT |
|---|---|---|---|---|
| Notion | [Selection + toolbar](https://mobbin.com/screens/39700986-5ab0-4ed9-b654-5d1a6ac92f38) | `notion-toolbar-01.png` | **one row above the keyboard** that swaps to inline marks (B I U S `</>` link) while text is selected; a keyboard-hide key at the trailing end | the AI and equation keys (no such thing here) |
| Notion | [Table on a phone](https://mobbin.com/screens/d53b3912-f60a-4bd1-872e-18276fe2acd5) | `notion-table-01.png` | evidence: a 3-column table is already cramped at 375 pt and needs its own handles, so tables wait (§C7) | editing cells on a phone in phase 3 |
| Notion | [New page, empty](https://mobbin.com/screens/e1f4852b-5b5c-4f70-858d-bb024afd4dc2) | `notion-empty-01.png` | a new note opens with the **cursor already in it** and the keyboard up | template chips in the toolbar (no templates on the server) |
| Notion | [Image block](https://mobbin.com/screens/1cbd6884-2c4a-4911-9fb4-296a30ba3979) | `notion-image-01.png` | the image at **full measure with rounded corners**, the toolbar still docked under it | caption and ALT (the `imageUploader` node has no such attribute, `schema/spec.ts`) |
| Notion | [+ menu, basic blocks](https://mobbin.com/screens/23ebacc5-4ddd-4afc-ae8e-3a07063e80cd) | `notion-insert-01.png` | **`+` replaces the keyboard with a two-column grid** of block tiles under a section label; the toolbar stays on top with ↑ ↓ (move block) next to `+` | Heading 4, toggle, page (outside the schema) |
| Notion | [+ menu, more blocks](https://mobbin.com/screens/4f773fc9-7d28-4915-998c-637ac1014804) | `notion-insert-02.png` | sections in one scroll: Basic, Media, Insert. Table and Divider are listed in the same grid | callout, link to page, embeds |
| Notion | [Insert media](https://mobbin.com/screens/165bc0c5-95b9-42b2-9e71-9b5725722c4f) | `notion-insert-media-01.png` | the image tile asks **Photo library / Take photo** in a small sheet | Scan document, Choose files (images only, `allowedMimeTypes`) |
| Notion | [Image block actions](https://mobbin.com/screens/ffbb0bcf-8417-4242-a446-dd95101be27f) | `notion-block-actions-01.png` | a **block action sheet**: the block's own actions first (Replace, View original), then Duplicate / Move / **Delete in red**, last | Copy link to block, Comment, Ask AI, "last edited by" |
| Notion | [Table block actions](https://mobbin.com/screens/6ecea6c7-4682-4c35-b649-412a0a240738) | `notion-block-actions-02.png` | the same sheet for a block the phone cannot edit (Duplicate, Move, Delete stay available; the table's own toggles do not) | Header row / column toggles on the phone (2027-01) |
| Apple Notes | [Editor + toolbar](https://mobbin.com/screens/f3dafb4e-2677-4bde-9b7d-9cd0095b5766) | `apple-notes-toolbar-01.png` | **`Aa` · checklist · table · attach** as large spaced keys, the checklist one key away; undo in the header | the table key (2027-01) and the pencil |
| Apple Notes | [Format sheet](https://mobbin.com/screens/27b24c96-d8b4-4e63-8cfe-26f72f121449) | `apple-notes-format-01.png` | **`Aa` opens a Format panel in place of the keyboard**: block style chips (Title, Heading, Subheading, Body), then B I U S, then lists and indent | Monostyled (that is the code block, 2027-01) |
| Apple Notes | [Format + indent](https://mobbin.com/screens/c44efc4f-794f-4085-9f4f-63fcd5308883) | `apple-notes-format-02.png` | indent / outdent as a **pair of buttons in the panel**, active style filled in the accent | the left bar "block quote" key placement (ours is in the style row) |
| Apple Notes | [Notes list](https://mobbin.com/screens/ff5bb02d-d35d-4eb6-80ce-e6668947104a) | `apple-notes-list-01.png` | **Pinned** as its own section first; each row = title, then time + first line of text | date buckets ("Previous 7 days"): one list is enough |
| Bear | [Compact toolbar](https://mobbin.com/screens/d40bfbfe-dafe-4287-bdd9-fdfe8896529e) | `bear-toolbar-01.png` | **undo / redo on the toolbar's leading edge** and a single "format" key, so the row fits at 360 dp | `#` tags inline (our tags are on the note, not in the text) |
| Bear | [Format keyboard](https://mobbin.com/screens/59fa6333-106b-4839-81da-79a938280de4) | `bear-format-01.png` | proof that a **format panel the height of the keyboard** fits every mark, list, link and indent with 48 dp keys | the markdown-in-the-text model (we are WYSIWYG) |
| Bear | [List + swipe](https://mobbin.com/screens/dd37517e-1454-49b7-9aca-872c2ce5ba93) | `bear-list-01.png` | **swipe a row** for Pin and Delete; the round **+** bottom-right | thumbnails strip (a note's images are not in the list payload) |
| Craft | [Editor toolbar](https://mobbin.com/screens/c2e7aff1-aa47-44f5-9c0f-888145dbcc7a) | `craft-toolbar-01.png` | a short toolbar, everything else one tap deeper | the floating ✓ "done" button over the text |
| Craft | [Block panel](https://mobbin.com/screens/8a2eb10e-4a67-4cd7-ba68-5a7340294798) | `craft-format-01.png` | **checklist, bullet, numbered, outdent, indent** as one row of equal keys; the colour well | Focus, Page, toggle ▶ |
| Craft | [Inline + align](https://mobbin.com/screens/8d70cdbf-ff7a-48ba-9344-aacaa73968d1) | `craft-format-02.png` | **align left / centre / right / justify** as four keys in the same panel (the web has the same four, `MoreOptionsButtonMenu`) | font families, Copy/Paste format |
| Obsidian | [List keys](https://mobbin.com/screens/8b508182-a6ce-4e17-be7e-3057372db316) | `obsidian-toolbar-01.png` | the toolbar **scrolls sideways** when it does not fit; checklist and indent keys in the first screenful | the wrench (command palette) |
| Obsidian | [Selection keys](https://mobbin.com/screens/20277cd4-bf20-4864-8acf-a98ac3d10f77) | `obsidian-toolbar-02.png` | with a selection the row becomes **marks: B I S highlight `</>` quote link** | markdown `==` shown in the text |
| Weverse | [Change order](https://mobbin.com/screens/ed039910-5701-4df1-bcf7-26253ef17e1a) | `weverse-reorder-01.png` | a text block and an image block **in one reorder list**, each with a `≡` handle on the trailing edge | a separate "Change order" screen (ours is in place) |
| Insight Timer | [Drag in progress](https://mobbin.com/screens/b6656f86-9598-4320-807b-fc7ce4e00a72) | `insighttimer-reorder-01.png` | the dragged row **lifts with a shadow** and the others close the gap under it | the Done button (a drop is the commit) |
| Amie | [Todos](https://mobbin.com/screens/583eba8b-b47c-4e55-9645-0a03a560042f) | `amie-checklist-01.png` | a checked item **fills the box and greys the text**; an undo toast after a destructive move | "Hide 1 done" (that moves items; in a note the order is the content) |
| Numo | [Checklist](https://mobbin.com/screens/2fe0b728-0f4b-49c0-bd51-28486049651e) | `numo-checklist-01.png` | checked = **filled box + strike-through** | coloured cards per item |
| Obvious (web) | [Note with checklist](https://mobbin.com/screens/98b11e94-6497-424a-8ce1-87aba8daf1ff) | `obvious-checklist-01.png` | a checklist **mixed with paragraphs and bullets in one note**, square boxes, strike-through, no reordering on check | — |
| ClickUp | [Empty notepad](https://mobbin.com/screens/7644c46b-71e9-4947-8c03-3c45bc742e32) | `clickup-empty-01.png` | one line, then **suggestion chips that each create a note** | the large grey icon |
| Granola | [Empty notes](https://mobbin.com/screens/12127f71-e9d4-43e2-92a3-fe9e4f51a612) | `granola-empty-01.png` | the empty state is **one sentence inside the list's own card**, not a takeover; the primary "New note" stays where it always is | "Get desktop app" banner |

## C · Decisions

Each decision cites the pictures it came from. The mockups are on the board
(`board/notes-board-2026-11-12.png`, bottom row).

1. **The notes list is a list, Pinned first, in the server's order.**
   *(apple-notes-list-01, bear-list-01)* Section **Pinned**, then the rest.
   Each row shows the title (or "Untitled"), then the relative time and the
   first line of plain text from `description`, then the tag chips. The note's
   `color` shows as a 4 dp bar on the leading edge, not a filled card, because
   the colours have to work in dark mode. Search sits on top (the server's
   `?search=`, debounced 300 ms as on the web, `Index.tsx:52`). Swipe a row for
   **Pin** and **Delete** (Delete has Undo). The round **+** sits
   bottom-right. Order is `pinned desc, updated_at desc` as the server sends
   it, so the note you just wrote is on top: a new note has the newest
   `updated_at`, so it lands first in the unpinned section, on page 1.
2. **The editor is a page, not a form.** *(notion-empty-01,
   apple-notes-toolbar-01, craft-toolbar-01)* Header: back · sync state
   ("Saved", "Saving…", "On this phone only") · `⋯`. Below it, the title as a
   large single-line heading field, then the blocks at full measure. Body text
   uses the **UI grotesque, not the serif**: IDENTITY §2 keeps the serif for
   the assistant's voice, and "the user's own words stay in the UI face". At
   ≥ 800 dp the page takes `METRICS.maxMeasure` (640) and is centred
   (IDENTITY §8). A new note opens with the cursor in the title. Return in
   the title moves to the first block.
3. **One toolbar docked above the keyboard. It changes with the selection;
   the screen never changes mode.** *(notion-toolbar-01, obsidian-toolbar-01,
   obsidian-toolbar-02, bear-toolbar-01)*
   - *Cursor:* `↶` `↷` · `+` · `Aa` · `☑` · `•` · `⇥` `⇤` · `🖼` · `⌄`
     (hide keyboard). It scrolls sideways when it does not fit at 360 dp. The
     first eight keys fit without scrolling (8 × 44 dp).
   - *Text selected:* B · I · U · S · `</>` · link · colour · highlight ·
     `⌄`. Inside inline `code`, the other marks are disabled (mark exclusion,
     §A).
   - Every key is a `ToolbarButton` with a 48 dp hit area, an
     `accessibilityLabel` from i18n, and `accessibilityState.selected` when
     its mark or block is active.
   - **`Aa` replaces the keyboard with a Format panel the keyboard's height**
     *(apple-notes-format-01, apple-notes-format-02, bear-format-01,
     craft-format-01, craft-format-02)*. Row 1: block chips **Title (H1) ·
     Heading (H2) · Subheading (H3) · Body · Quote**. Row 2: B I U S `</>`.
     Row 3: ☑ • 1. ⇤ ⇥. Row 4: align ⟸ ≡ ⟹ ☰. Row 5: text colour and
     highlight swatches (the web's nine plus default, `constants.ts`
     `colorSections`). Tap the keyboard key or the text to get the keyboard
     back.
4. **Insert is one menu, reached by `+` or by typing `/`.** *(notion-insert-01,
   notion-insert-02, notion-insert-media-01)* `+` replaces the keyboard with
   a two-column grid of tiles in the web's groups and order
   (`commandGroups`): **Typography** (Paragraph, Heading 1–3), **Format**
   (Bulleted, Numbered, To-do, Quote, Code block), **Insert** (Separator,
   Image, Table). Typing `/` at any point opens the same `InsertMenu` as a
   list docked on the toolbar (not a floating popover the keyboard can
   cover). Typing after `/` filters it with the web's rule (title
   `startsWith`, `SlashCommandSuggestion.ts`). The phone cannot create **Code
   block** or **Table** yet: they are shown, dimmed, with "On the web for
   now". They are not hidden, so the menu matches the web and nobody wonders
   where they went (the Contacts rule: disabled, not hidden). Image opens
   Photo library / Take photo.
5. **Reorder: long-press and drag, with Move up/down as the accessible
   path.** *(insighttimer-reorder-01, weverse-reorder-01, notion-insert-01's
   ↑ ↓)* Long-press a block for 350 ms: haptic tick, the block lifts with a
   shadow, a `BlockHandle` `≡` shows on its trailing edge, and the other
   blocks open a gap. The list auto-scrolls near the top and bottom edges.
   Drop to commit. The move is one undo step. A screen-reader user and
   anyone who prefers it gets **Move up / Move down** in the block action
   sheet and as ↑ ↓ keys at the end of the toolbar. A list item moves inside
   its list. Dragging it out of the list is phase 3b.
6. **Block actions: a sheet.** *(notion-block-actions-01,
   notion-block-actions-02)* Tap a `BlockHandle` (visible while a block is
   focused) or long-press without moving. The sheet shows: Turn into…,
   Colour, Move up, Move down, then (phase 3b) Duplicate, Copy text, Reset
   formatting, then **Delete** in `danger`, last. The same entries as the
   web's drag-handle menu (`TiptopDragHandle.tsx`), in the web's order.
7. **The checklist look.** *(amie-checklist-01, numo-checklist-01,
   obvious-checklist-01)* A rounded square box 22 dp inside a 48 dp hit area,
   aligned to the first line of text. Checked = box filled with `accent`, a
   check in `onAccent`, text in `inkMuted` with a strike-through. **A checked
   item does not move**: the web does not move it, and in a note the order
   is the content. Return on an empty item ends the list (the web's ListKit
   behaviour). Tapping the box toggles it even with the keyboard down,
   without moving the caret.
8. **Read-only blocks are a "view on web" card.** *(notion-table-01,
   notion-block-actions-02)* Tables, code blocks and legacy content
   (`<img data-width>`, YouTube iframes, `h4–h6`, anything unknown) render as
   a `RawBlockCard`: a bordered `surface` card with an icon and a kind label
   ("Table · 3 × 4", "Code · ruby", "Embedded video"). Then a **static
   preview**: the table as a horizontally scrolling grid of plain text, code
   in the monospace face with no highlighting, a legacy image as the image.
   Then **View on web**, which opens the note on the web. The card can be
   moved and deleted like any block. Its HTML is written back byte for byte
   (§A). The caret steps over it; it never enters it.
9. **The image block.** *(notion-image-01, notion-insert-media-01,
   notion-block-actions-01)* Full measure, `radius.md`, the picture's own
   aspect ratio, never cropped. Insert takes a picture from the library or
   the camera. HEIC is converted to JPEG and anything over the web's
   **5 MB** limit (`ImageUploaderExtension.ts`, `maxFileSize`) is downsized
   **before** upload, because the web only allows `image/jpeg` and
   `image/png`. While uploading, a determinate bar shows across the bottom of
   the picture (the node's `uploading`/`progress` attributes). On failure the
   picture stays, dimmed, with **Retry** and the reason (`failed`,
   `errorMessage`). Nothing is saved to the server until `src` is a server
   URL: a note never points at a phone file path. Tap the image for its sheet:
   Replace, View full size, Move, Delete.
10. **Empty states say what to do in one sentence.** *(clickup-empty-01,
    granola-empty-01, notion-empty-01)* Empty list: "No notes yet." and three
    chips that each create a note: **Checklist** (opens with one to-do item),
    **Idea**, **Meeting notes** (opens with an H2). The chips are localised in
    en/fr. No mascot or illustration, as everywhere else in this app
    (IDENTITY §6). Empty search: "Nothing matches '…'" with the search kept.
    Empty note body: the placeholder "Write something, or tap + to insert".
    It is the web's placeholder (`createDefaultExtensions.ts`) with `/`
    replaced by `+`, because a phone keyboard hides `/` on the second layer.
    Empty Trash: one line. Offline with no cache: the `states/` sentences.
11. **"Works very well": the rules a build is checked against.**
    - **The keyboard never hides the caret.** The toolbar is pinned to the
      keyboard's top edge (`react-native-keyboard-controller`'s sticky view).
      After every selection change the editor scrolls so the caret's rect sits
      ≥ 16 dp above the toolbar. This is tested at 360 × 640 dp with the
      tallest keyboard (numbers row on), with the caret on the last line of a
      long note and inside a list item.
    - **Undo / redo.** Toolbar keys plus the OS shortcuts (a hardware keyboard
      on a tablet, Ctrl/⌘-Z). History is per editing session. Typing groups
      into one step per 500 ms pause. A drag, a format change, an insert and a
      delete are each one step. Undo works with the keyboard hidden. History
      does not survive leaving the note, so a draft restore (below) is a
      separate, explicit action.
    - **A local draft, so a slow network never loses text.** Every change is
      written to a local draft (`noteDrafts` store, keyed by note id, holding
      the HTML and the `updated_at` it was based on) **before** the 500 ms
      network autosave. The draft is cleared only when a `PUT` succeeds with
      the same content. On open, a draft newer than the server's copy is
      restored, with a one-line notice. If the server's `updated_at` moved
      past the draft's base (someone edited on the web meanwhile), the phone
      **does not overwrite**. It asks: *Keep mine* · *Keep the web's* · *Keep
      both* (mine saved as a copy through `POST notes`). The header says "On
      this phone only" while unsent. Nothing is ever dropped silently.
    - **RTL.** As on the web (`dir: 'auto'`, `NoteEditor.tsx:99`), **each
      block takes its direction from its first strong character**. A Pashto
      line in an English note reads right-to-left, bullets and boxes on the
      right. Indent keys and the handle mirror with the block. Align keeps the
      web's stored values (`left`/`right` are physical, not start/end), so a
      note looks the same on both.
    - **Dark mode.** Dark is the design mode, and both modes come from
      `TOKENS`. The web stores text colour and highlight as fixed `hsl(…)`
      strings, the same in both of its themes (`constants.ts`). The phone
      writes exactly those strings and shows them unchanged. Highlighted text
      gets `ink` from the mode with the stronger contrast against that
      highlight, so it stays readable on both grounds.
    - **A small phone (360 dp) and a tablet (800 dp).** At 360, the first
      eight toolbar keys show without scrolling and the Format panel's keys
      stay ≥ 44 dp. At 800 the page is centred at 640 and the toolbar's keys
      centre on the same measure. Rule 4's `ours/` screenshots at 360, 411
      and 800 dp are part of `DONE`.

## D · Web feature parity: one row per tiptop-editor feature

Read from `tiptop-editor/src` 2026-11-12: `constants.ts` (`commandGroups`,
`colorSections`), `extensions/slashCommand/*`, `components/menus/*`,
`components/editor/{TiptopDragHandle,DragHandleColorList,TableSelectionMenu,createDefaultExtensions}.tsx`,
`extensions/{image,emoji,comment}/*`, plus MultiMagic's `NoteEditor.tsx`
wrapper. **Full parity is the goal.** Every row that is not "edit on mobile
now" has a date.

Status key: **now** = edit on mobile now (phase 3) · **3b** = phase 3b,
≈ 2026-12 · **read-only** = shown and kept byte for byte, not editable yet,
with the reason and a target date.

| # | Web feature | Where on the web | Phone | Status |
|---|---|---|---|---|
| 1 | Slash menu `/` | `SlashCommand.ts`, `SlashCommandSuggestion.ts` | `InsertMenu` docked on the toolbar, same filter (§C4) | now |
| 2 | Paragraph | `commandGroups.typography` | Body chip / insert tile | now |
| 3 | Heading 1 | idem | Title chip | now |
| 4 | Heading 2 | idem | Heading chip | now |
| 5 | Heading 3 | idem | Subheading chip | now |
| 6 | Bulleted list | `commandGroups.format` | toolbar `•`, panel, tile | now |
| 7 | Ordered list | idem | panel `1.`, tile | now |
| 8 | To-do list (taskList / taskItem `checked`) | idem | toolbar `☑`, `ChecklistItem` (§C7) | now |
| 9 | Indent / outdent in lists | `ListKit` keymap (Tab / Shift-Tab) | toolbar `⇥ ⇤`, panel | now |
| 10 | Blockquote | `commandGroups.format` | Quote chip / tile | now |
| 11 | Code block (`codeBlock`, `language`, lowlight highlighting) | `CodeBlock.ts` | `RawBlockCard` with monospace preview | **read-only**: needs a native code input with whitespace kept exactly and no autocorrect, plus highlighting. Target **2027-01** |
| 12 | Separator (horizontal rule) | `commandGroups.insert`, `HorizontalRule.ts` | tile; a hairline block | now |
| 13 | Image (`imageUploader`) insert + upload with progress, failed + retry | `ImageUploader*.ts`, `ImageUploaderView.tsx` | `ImageBlock` (§C9) | now |
| 14 | Image type and size limits (JPEG/PNG, 5 MB) | `ImageUploaderExtension.ts` options | convert HEIC, downsize before upload | now |
| 15 | Paste or drop an image file | `FileHandler` in `ImageUploaderExtension.ts` | paste an image from the clipboard | 3b |
| 16 | Download an image | drag-handle menu, `canShowDownloadImage` | image sheet: Save to Photos (needs the media-library module the Pages note already asks for) | 3b |
| 17 | Table insert and display | `commandGroups.insert`, `TableKit` | `RawBlockCard` with a scrolling text grid | **read-only**: a usable cell editor at 360 dp needs its own design and handles (notion-table-01). Target **2027-01** |
| 18 | Table editing: rows/columns before/after, delete, merge/split, header row/column, column resize | `TableButtonMenu.tsx`, `TableSelectionMenu.tsx`, `resizable: true` | none yet | **read-only**: same reason, comes with row 17. Target **2027-01** |
| 19 | Bold | `TextSelectionMenu.tsx` | selection toolbar, panel | now |
| 20 | Italic | idem | idem | now |
| 21 | Underline | idem | idem | now |
| 22 | Strikethrough | idem | idem | now |
| 23 | Inline code (excludes other marks) | idem | idem; other marks disabled inside it | now |
| 24 | Link: add / edit | `LinkButtonMenu.tsx` | link key → a small sheet with the URL field | now |
| 25 | Link: open / remove | `LinkPreviewMenu.tsx` | tap a link → sheet: Open, Edit, Remove | now |
| 26 | Text colour (default + 9) | `ColorButtonMenu.tsx`, `colorSections.text` | swatches in the panel and the selection toolbar | now |
| 27 | Highlight (default + 9, multicolor) | `colorSections.highlight` | idem | now |
| 28 | Superscript / subscript | `MoreOptionsButtonMenu.tsx` | panel row | 3b |
| 29 | Align left / centre / right / justify (paragraph, heading) | `MoreOptionsButtonMenu.tsx`, `TextAlign` | panel row 4 | now |
| 30 | `+` beside a block (adds a block after it, opens `/`) | `TiptopDragHandle.tsx`, `addSlashParagraphAfterCurrentBlock` | toolbar `+` inserts after the focused block | now |
| 31 | Drag to reorder blocks | `TiptopDragHandle.tsx` (`DragHandle`) | long-press drag + Move up/down (§C5) | now |
| 32 | Block colour (text colour / highlight on the whole block) | `DragHandleColorList.tsx` | block sheet → Colour | now |
| 33 | Transform into | `TransformIntoButtonMenu.tsx`, drag-handle menu | panel chips + block sheet → Turn into | now |
| 34 | Delete block | drag-handle menu, `deleteNode` | block sheet → Delete | now |
| 35 | Duplicate block | `duplicateNode` | block sheet | 3b |
| 36 | Copy block text to clipboard | `copyNodeTextContent` | block sheet | 3b |
| 37 | Reset formatting | `removeAllFormatting` | block sheet | 3b |
| 38 | Emoji node display (`emoji` node, `name`) | `TiptopEmoji.ts` | rendered as the emoji, kept on save | now |
| 39 | Emoji `:` shortcode picker and emoticons (`:)` → 🙂) | `TiptopEmojiSuggestion.ts`, `enableEmoticons` | a `:` list docked like `/`. Unicode emoji from the phone keyboard already work as text | 3b |
| 40 | Hard line break (Shift-Enter → `hardBreak`) | StarterKit | shown and kept now; created from a "line break" key in the panel | 3b |
| 41 | Placeholder | `Placeholder` | §C10 sentence | now |
| 42 | Undo / redo | StarterKit history | toolbar + shortcuts (§C11) | now |
| 43 | Comments (comment mark, block `commentId`, comment menu) | `extensions/comment/*`, `components/comment/*` | kept untouched if present | **read-only**: MultiMagic web does not turn comments on (`showCommentMenu` unset), so there is nothing to match yet. Decide with the owner by **2027-02** (open question 3) |
| 44 | Legacy content: `h4–h6`, `<img data-width>`, YouTube iframes, unknown markup | not in tiptop (MultiMagic's first editor) | `RawBlockCard`, byte for byte | **read-only**: the web itself cannot edit it. `h4–h6` gets a "Make it a Subheading" button in **3b**; legacy images become normal image blocks with tables, **2027-01** |
| 45 | Dictation into the note | MultiMagic `NoteEditor.tsx` `SpeechButton` | the mic key, reusing `expo-speech-recognition` from the chat | 3b |
| 46 | Word count | MultiMagic `NoteEditor.tsx` | in the `⋯` sheet | 3b |
| 47 | Right-to-left by content (`dir: 'auto'`) | MultiMagic `NoteEditor.tsx:99` | per block (§C11) | now |

**Counts:** now **32** · 3b **10** · read-only **5** (code block 2027-01;
table and table editing 2027-01; comments 2027-02; legacy content: 3b for
`h4–h6`, 2027-01 for the rest). Total 47.

## E · The editor's parts: presentational, props only

Small components with **no MultiMagic store, no API client, no router, no
i18n import**. Strings, colours and callbacks come in as props. They are meant
to move later into `tiptop-editor/native`, next to `tiptop-editor/schema`, so
any React Native app can use them. Until then they live in
`src/screens/notes/editor/` and import nothing from `src/stores`, `src/api`
or `app/`. An eslint `no-restricted-imports` rule on that folder will enforce
it. Shared types: `DocNode` / `DocMark` from `tiptop-editor/schema`.

```ts
type Colors = Pick<Tokens, "ground" | "surface" | "border" | "ink" | "inkMuted" | "accent" | "onAccent" | "danger">;
type Dir = "ltr" | "rtl";
type Selection = { anchor: number; head: number };          // offsets in the block's text

interface BlockProps {                                         // one top-level block: chooses the renderer
  node: DocNode; path: number[]; colors: Colors; dir: Dir;
  focused: boolean; editable: boolean; dragging?: boolean;
  onFocus(path: number[]): void;
  onLongPress(path: number[]): void;                            // starts drag (§C5) or opens the sheet
  renderInline(node: DocNode, path: number[]): React.ReactNode; // InlineText for text-bearing blocks
}

interface InlineTextProps {                                    // the editable run of one textblock
  content: DocNode[];                                          // text + hardBreak + emoji, with marks
  variant: "body" | "h1" | "h2" | "h3" | "quote" | "listItem";
  align: null | "left" | "center" | "right" | "justify";
  colors: Colors; dir: Dir; editable: boolean; placeholder?: string;
  selection?: Selection;
  onChangeContent(next: DocNode[], selection: Selection): void;
  onSelectionChange(sel: Selection, caretRect: { y: number; height: number }): void; // keyboard rule §C11
  onSubmit(): void;                                            // Return: split block / end list
  onBackspaceAtStart(): void;                                  // join with previous block
  onLinkPress(href: string): void;
}

interface ToolbarProps {
  mode: "cursor" | "selection" | "format" | "insert";
  colors: Colors; dir: Dir; compact: boolean;                  // compact = width < 400 dp
  children: React.ReactNode;                                   // ToolbarButtons, in order
  onHideKeyboard(): void;
}

interface ToolbarButtonProps {
  icon: React.ComponentType<{ color: string; size: number }>;
  label: string;                                               // accessibilityLabel, already translated
  active?: boolean; disabled?: boolean; mirrorInRtl?: boolean;
  colors: Colors; onPress(): void; testID?: string;
}

interface InsertMenuProps {
  groups: { key: string; title: string; items: InsertItem[] }[]; // built from commandGroups
  query: string;                                               // "" for the + grid, text after "/" otherwise
  presentation: "grid" | "list";                               // + replaces the keyboard / "/" docks a list
  colors: Colors; onPick(key: string): void; onClose(): void;
}
interface InsertItem { key: string; title: string; icon: string; disabled?: boolean; disabledNote?: string }

interface ChecklistItemProps {
  checked: boolean; colors: Colors; dir: Dir; editable: boolean;
  onToggle(next: boolean): void;                               // works with the keyboard down
  children: React.ReactNode;                                   // the InlineText
}

interface ImageBlockProps {
  src: string | null; localUri?: string;                       // local preview while uploading
  width?: number; height?: number;
  uploading: boolean; progress: number; failed: boolean; errorMessage?: string | null;
  colors: Colors; labels: { retry: string; uploading: string };
  onRetry(): void; onPress(): void;                            // opens the image sheet
}

interface RawBlockCardProps {
  kind: "table" | "codeBlock" | "legacyImage" | "embed" | "heading456" | "unknown";
  title: string;                                               // "Table · 3 × 4", already translated
  preview?: { rows: string[][] } | { code: string; language?: string | null } | { imageUri: string } | { text: string };
  colors: Colors; labels: { viewOnWeb: string; convert?: string };
  onViewOnWeb(): void; onConvert?(): void;                     // convert: h4–h6 → H3 in 3b
}

interface BlockHandleProps {
  visible: boolean; dragging: boolean; colors: Colors; dir: Dir;
  label: string;                                               // "Block actions, double tap; long-press to move"
  onPress(): void; onDragStart(): void;
}
```

What does **not** belong in these parts: the document model and its
transactions (`src/screens/notes/editor/model.ts`, pure and tested in Jest),
the codec (`tiptop-editor/schema`), the draft store, the API, and i18n. The
screen wires those together.

## F · How we code it (names to be created; none exist yet)

| Thing | Where |
|---|---|
| API (list, show, create, update, trash, restore, destroyForever, duplicate, tags, images upload) | `src/api/notes.ts` |
| HTML ⇄ doc | `tiptop-editor/schema` `fromHTML` / `toHTML` (plan §8) |
| document model + transactions + undo history | `src/screens/notes/editor/model.ts` |
| the parts of §E | `src/screens/notes/editor/*.tsx` |
| local draft | `src/stores/noteDrafts.store.ts` |
| list, editor, trash | `app/notes/{index,[id],trash}.tsx`; a Home tile |

## G · The owner's answers (2026-11-12, board approved: "it's good, attack")

1. **Tablet (≥ 800 dp):** the list and the editor side by side, as in Apple
   Notes. This replaces the single-column decision.
2. **Conflict with a web edit:** a version check on save. On a conflict, ask
   "keep mine / keep the web's / keep both". "Keep both" is the default: it
   saves a copy titled "… (conflict 12 Nov 15:40)". Never a silent
   last-write-wins.
3. **Comments:** off everywhere for now. Row 43 stays read-only.
4. **Sharing on the phone:** view, and add or remove people (web parity),
   in phase 3b.
5. **Notes list:** last edited first (pinned on top).
