# Doc Tools — SPEC

**Status: IN PROGRESS** (2026-11-20). Hub, intake, viewer and Sign are
built; Merge, Pages, Text, Convert and Compress follow. Not DONE until the
360/411/800 dp screenshots in `ours/` exist and the flows have run.
Mobbin searched first (RULE ZERO, `docs/design/README.md`); 16
references read, all cited below.

What the app is comes from the parity audit
(`mm-parity-audit/docs/parity/doc.md` §1–2, §5): **a PDF and image toolkit,
not a document store.** Six tools (Sign, Merge, Pages, Text editor, Convert,
Compress). The only records on the server are the user's **signatures**. Every
other tool takes a file from the phone, sends it to the server, and hands the
result back through Share / Save.

---

## A · References (Mobbin, 2026-11-20)

The images are in `references/` (gitignored: other companies' screenshots, and
this repo is public). The links below do not expire.

**Hub and intake**
- 01 ElevenReader, Import: <https://mobbin.com/screens/499ce035-77a7-4fa7-9254-e3f3db60c2d5>. **Take:** a 2-column grid of equal, quiet tiles, a line icon over a one-line label, nothing else on the page. **Not:** the tab bar; we have `AppHeader`.
- 02 Docusign, Add Documents sheet: <https://mobbin.com/screens/9e9d3cbf-0ee5-463c-bb7f-ecbf18f1e3c1>. **Take:** the intake is a bottom sheet of sources (Scan, Photos, Files) and Scan is first. **Not:** round outline buttons and seven cloud providers; we show three or four rows.

**Signatures**
- 03 Apple Photos, Markup › signatures: <https://mobbin.com/screens/3bbd0740-59a0-476a-b499-1fcc527403f9>. **Take:** saved signatures as stacked wide cards, ink only, one tap uses one; "Add or Remove Signature" as the last row. This is our library inside the Sign screen.
- 04 Fresha, Add a signature (Type): <https://mobbin.com/screens/fbd13da1-f26f-4c90-8593-21ff3774e410>. **Take:** one field for the name, a Type / Draw segmented control, the live preview under it. **Not:** the legal paragraph; we have no e-sign claim to make.
- 05 Fresha, Add a signature (Draw): <https://mobbin.com/screens/d6becd9c-f79e-4e33-8fa9-0f4921b1777b>. **Take:** the same frame keeps its place across both modes, Clear in the corner of the pad, the primary button pinned at the bottom.
- 06 Edits, handwritten fonts: <https://mobbin.com/screens/0f152303-6e51-481e-be11-c3b6808c0742>. **Take:** each font shown as a tile **rendering its own name in itself**. Ours render the user's typed name in each of the six fonts.
- 07 Apple Notes, New Signature: <https://mobbin.com/screens/382b5f28-bb29-48e5-ae69-48de924e97f2>. **Take:** a full-width pad with an `×` baseline and "Sign with your finger" under it; Done in the header. The baseline tells a first-time user where to write.

**Placing**
- 08 Freeform, a selected stamp on a PDF: <https://mobbin.com/screens/dde423f8-98d7-4edc-abd5-9f639fb92797>. **Take:** the selected item gets a thin accent frame with corner dots and a small floating bar (duplicate, delete) above it. That is our placed signature.
- 09 Docusign, Add Fields: <https://mobbin.com/screens/fb7fe2c6-56c8-4556-8c80-c2d8fd9ec06a>. **Take:** the page fills the screen, the tools sit in a rail at the bottom, and the primary action is one button under it. **Not:** recipients; one signer, us.

**Merge and Pages**
- 10 Docusign, Add Documents list: <https://mobbin.com/screens/94488f54-b549-42e4-a10e-5309e2aaa494>. **Take:** one row per file (type badge, name, "1 Page"), a ⋯ per row, "Add another document" as a dashed row at the end, the action pinned at the bottom.
- 11 Apple News, select grid: <https://mobbin.com/screens/0fb77b7c-cbad-4cb3-81de-25425cc6915d>. **Take:** thumbnails in a grid with a check in the corner, "1 Selected" in a bottom bar between its actions. Our page grid's selection mode.
- 12 Google Photos, Edit book: <https://mobbin.com/screens/dcb01727-1fce-4150-81f3-73e9f9327a92>. **Take:** the page number under each thumbnail, and a hint written in the first cell ("Hold, then drag to rearrange · Tap any page to edit").

**Convert, Compress, Result**
- 13 Canva, Save as: <https://mobbin.com/screens/22db95ee-5140-45da-92dc-2c9ae2c9102f>. **Take:** every format as a row with a reason under it ("Best for sharing"), a check on the chosen one. We put these reasons on our chips' long-press / a11y hint and under the chosen chip.
- 14 Halide, Compression: <https://mobbin.com/screens/ee62b6b4-c413-4549-b568-782040db0caf>. **Take:** the preview image with "Quality: 90% — 25.1 MB" under it. The size is the answer; we show before → after.
- 15 Photoroom, result: <https://mobbin.com/screens/1532a9af-44dc-436d-a2fb-35405801b7c8>. **Take:** the result as a preview, then a row of equal labelled actions (Save, Share…), then a quiet "Close". **Not:** "Keep creating" upsell.
- 16 Apple Mail, document scanner: <https://mobbin.com/screens/b7c5eff7-39fb-4edd-8387-674027bf7c47>. **Take:** the system scanner itself (edge overlay, auto shutter, page count thumbnail). We do not draw a scanner: we call the platform's.

---

## B · The family rules every Doc screen follows

- **Header:** `AppHeader` (`src/components/shell/AppHeader.tsx`), the same top as
  every app; the tool screens show ‹ and the tool's name.
- **App colour:** `APP_COLORS.doc` in `src/theme/appColors.ts`, plus `"doc"` in
  `HOME_APPS`. Eleven colours are taken and *"no two share one"*
  (`appColors.test.ts`). **Decided (2026-11-20, Hello for the owner):**
  `SLATE = "#7a9cc6"` (a paper-and-ink steel blue, 213°, clear of BLUE
  `#49b4e4` by saturation and lightness). Red is refused on purpose: it is
  `colors.danger`, and a delete must never look like the app. The web has no
  Doc accent yet (only its storage chart's red `#e5484d`, also a danger tone),
  so the web can adopt this slate later and the two will match.
- **Tokens only:** `useColors()` (`src/hooks/useColors.ts`) and `METRICS`
  (`useMetrics()`): `space` 4/8/12/16/24, `radius` 8/12/20, `touch` 48.
  16 dp side gutter. Rows ≥ 56 dp.
- **Width:** phone 360 / 411 dp is one column. **Tablet 800 dp:** content
  centres at `METRICS.maxMeasure` (640) except a page canvas, which takes the
  width up to 720 and keeps its tool rail under it, and the page grid, which
  goes from 3 to 5 columns.
- **Dark + light:** one token set. The PDF page itself is always drawn on
  white in both schemes (a page is paper); only the chrome around it changes.
  Signature ink previews sit on `surface`, and a black-ink signature on the
  dark ground gets a white card behind it, so black ink is never invisible.
- **Language (en + fr):** French runs ~1.3× longer. Tool labels are one word
  in both (Signer, Fusionner, Pages, Texte, Convertir, Compresser); blurbs are
  two lines max and wrap, never truncate. Buttons say the verb + object
  ("Fusionner 3 fichiers"); at 360 dp they wrap to two lines rather than clip.
  Every string through `t()`, including `accessibilityLabel` (eslint).
- **Motion:** no Reanimated layout or transform animations on any recycled list
  cell (owner rule). Thumbnails fade opacity only, reset per item. Grid cells
  and rows have a fixed measured height. Gestures on the *canvas* (one item, not
  a list) may use transforms.
- **Network:** every tool except the signature library needs the server. Each
  tool screen shows `OfflineBanner` and disables its primary action offline
  with the reason, never a silent spinner.
- **Long calls (1–10 s):** a determinate upload bar, then "Working…", with
  **Cancel** (an `AbortController` in `docApi`).

---

## C · Screens

### C1 · Hub — `app/doc/index.tsx`

**Draws on:** 01 (grid of equal tiles), 09 (calm, one purpose per screen).

Six cards in a 2-column grid (3 at 800 dp): icon in an `APP_COLORS.doc`-tinted
circle, the tool name (`body` 600), one muted line of what it does. Order:
Sign, Merge, Pages, Text, Convert, Compress (the web's order,
`D/Index.tsx:173-204`). Each card pushes its own route. **No recent files
list**: Doc keeps no documents, and an invented history would be a lie about
what is stored. A static grid, not a recycled list.

**States:** none to load. Offline: the banner on top; the cards stay tappable
(Sign's library works from cache).
**How we code it:** `app/doc/index.tsx` renders a `View` grid from a `DOC_TOOLS`
const in `src/screens/doc/tools.ts` (`{ key, route, icon, labelKey }`), the
labels resolved with `t()` at render, never at module level (CLAUDE.md, runtime
values). `doc` added to `src/apps/registry.ts` and the Home list.

### C2 · Add a file — `src/screens/doc/IntakeSheet.tsx`

**Draws on:** 02 (a sheet of sources, Scan first), 16 (scanner is the system's).

A bottom sheet with rows, each 56 dp, a leading icon: **Scan** (behind a flag,
C12), **Photos**, **Files**, **Camera**. Each tool passes `accept`
(`pdf` | `image` | `any`) and `multiple`; a row that cannot produce an accepted
type is hidden, not disabled (Pages and Text hide Photos and Camera). While a
pick is being read the sheet shows a spinner on the tapped row and stays open,
so a slow HEIC decode is visible.

**Errors** name the file and the reason: locked (`doc.errors.pdfLocked`),
damaged, empty, over 50 MB, unsupported type. A refused file never removes the
others picked with it (Merge).
**How we code it:** wraps the pickers in `src/screens/pages/addFiles.ts`
(library, document picker, camera) and `src/screens/pages/permissions.ts`;
returns `DocFile { uri, name, type, size }[]`. Sizes through `formatBytes`
(`src/screens/pages/parts.tsx`).

### C3 · Sign — `app/doc/sign.tsx` (library + document)

**Draws on:** 03 (stacked signature cards), 09 (page + bottom rail), 08 (selected stamp).

**Before a file:** the signature library as a horizontal strip of wide cards
(120 × 64 dp, ink on `surface`), then a large "Choose a document" card that
opens the IntakeSheet. **Order: active first, then newest**, exactly the
server's `order(active: :desc, created_at: :desc)`. The first card is selected
on load. The last card in the strip is "+ New signature". Long-press a card →
`ActionSheet` (`src/screens/contacts/ActionSheet.tsx`): Edit, Delete. Delete
asks to confirm (the web does not; a phone mis-tap costs more) and offers
`UndoToast`.

**After a file:** see C5. The strip stays at the bottom as the rail.

**States:** loading = 3 skeleton cards (`skeleton.tsx`); empty = the strip is
replaced by one card "Create your first signature" (88 dp tinted circle, pen
icon); error = `LoadFailure` with Retry. Offline: the cached library still
shows; creating or deleting is disabled with the reason.
**How we code it:** `docApi.signatures.list/create/update/remove` in
`src/api/doc.ts`; React Query key `["doc","signatures"]`; thumbnails are
`<Image source={{ uri: imageUrl }}>` with a typed-text fallback in its font.

### C4 · Signature creator — `app/doc/signature.tsx`

**Draws on:** 04 + 05 (one frame, Type / Draw toggle, preview), 07 (baseline + hint), 06 (font tiles that render themselves).

A modal screen. Segmented **Draw | Type** at the top; the pad keeps the same
frame in both modes (05), aspect 3:1, full width minus gutters; on 800 dp it is
capped at 560 wide and centred.

- **Draw:** the pad with an `×` baseline and a muted hint "Sign with your
  finger" under it (07); Undo and Clear in the pad's top right; below it, Pen /
  Pencil chips, 5 colour swatches, background swatches (White, Cream, Paper,
  Transparent shown as a checkerboard), thickness slider.
- **Type:** a name field; under it a 2-column grid of the **six font tiles**,
  each rendering the typed name in that font (06), the chosen one ringed in the
  app colour; colour swatches, background swatches, size slider.
- **Save** pinned at the bottom (05), disabled until there is ink or text.
  Editing says "Save changes". Name defaults to "Signature N" (no rename, like
  the web).

**States:** saving = spinner in the button; error = inline message above the
button, the drawing kept. Leaving with unsaved ink asks once.
**en/fr:** "Signez avec le doigt"; font tiles show the user's name, so length
is theirs; the tile clips with ellipsis at one line.
**How we code it:** `src/screens/doc/SignaturePad.tsx` (gesture-handler `Pan`,
`perfect-freehand`, `react-native-svg` `Path`); fonts from
`assets/fonts/signatures/*.ttf` loaded with `expo-font` (OFL files beside
them); the PNG produced on the phone by capture (parity G7) and sent with the
strokes to `docApi.signatures.create`.

### C5 · Place signature — inside `app/doc/sign.tsx`

**Draws on:** 09 (page fills, rail at bottom, one button), 08 (thin frame, corner dots, floating bar).

The page fills the width on white; "Page 2 of 5" with ‹ › under it. A hint
"Tap where the signature goes". A tap stamps the selected signature at 22 % of
the page width, stored as ratios. The selected stamp shows a 1.5 dp
`APP_COLORS.doc` frame, corner dots, and a small floating bar with **Remove**.
Drag moves, pinch resizes, two-finger twist rotates (gesture-handler
`Simultaneous`); a corner handle (48 dp hit area) does resize + rotate one-handed.
Tap the page to deselect. The signature strip is the bottom rail; **Done**
under it (disabled with "Place a signature first" until one is placed) produces
the result (C11). For an image the canvas fits width **and** height so the rail
never leaves the screen.

**States:** page loading = a white page-shaped skeleton at the right aspect;
page failed = "This page could not be shown" with Retry on the page; locked
PDF = refused at intake, never reaches here.
**How we code it:** `src/screens/doc/Placement.tsx` (one `Placement` per stamp,
`{ page, x, y, w, rotation }` in ratios); page images from `docApi.pdfPage`
(`POST pdf/page`); output via `docApi.sign` (server stamp, parity G3).

### C6 · Merge — `app/doc/merge.tsx`

**Draws on:** 10 (file rows, dashed "add another", action pinned), 12 (numbers make order visible).

One row per file, 72 dp fixed: thumbnail (first page or the image), name (one
line, middle ellipsis), "PDF · 3 pages · 1.2 MB", then ↑ ↓ buttons and ⋯
(Remove). **Order is the user's**, the order picked, not newest first: this is
a working set, not a list of records. Reorder by ↑ ↓ (the web's own Pages
decision, and accessible); long-press drag is LATER. A dashed "Add files" row
ends the list. Footer: "3 files · 11 pages" and **Merge 3 files**, disabled
under 2 with "Add at least two files". Clear all in ⋯ of the header, with a
confirm.

**States:** empty = the intake card ("Choose files to merge") opens the sheet;
loading a thumbnail = an opacity-only fade per cell; a locked file = its row
stays with a danger line "Locked — remove it to merge", and Merge is disabled.
**How we code it:** a plain `FlatList` with fixed `getItemLayout`, no layout
animations on cells; thumbnails from `src/screens/doc/thumbs.ts`;
`docApi.merge(files)` (parity G1).

### C7 · Pages — `app/doc/pages.tsx`

**Draws on:** 11 (check in the corner, "n selected" bar), 12 (page number under each, hint in the first cell).

A grid of page thumbnails, 3 columns at 360/411 dp, 5 at 800, each cell a fixed
height with the page number under it. Tap selects (check in the corner, 11).
Each cell carries a small ⋯ → Rotate left, Rotate right, Move earlier, Move
later, Delete. The bottom bar shows "2 selected" between **Extract** and
**Delete**; with nothing selected it shows **Save** and **Split** (one PDF per
page; shared as several files, zip only as the fallback). Undo in the header
(20 steps, client state). Rotation shows on the thumbnail by swapping the
server render, not by a transform on the cell.

**States:** empty = intake card (PDF only); reading = "Reading pages…" with a
skeleton grid of the right count once known; locked = refused at intake.
**How we code it:** `FlatList numColumns`, fixed cell height, opacity fade
only; ops as client state `{ order, rotation[], deleted[] }` then
`docApi.pages(op)` (parity G2).

### C8 · Text editor — `app/doc/text.tsx` + edit sheet

**Draws on:** 09 (page fills, tools at bottom), 08 (selection frame), 13 (rows with a reason, for the legend).

The server-rendered page with overlay marks in % of the box: blue = editable,
amber dotted = unreadable, grey dashed = a picture of text. A legend chip row
with counts under the page; tapping a chip explains it in a small sheet (no
hover on a phone). Pinch-zoom on the page plus − / + buttons. Header: ‹, "3
changes", ⋯ (Discard all, with a confirm; Change document). **Tap a blue line
→ a bottom sheet editor**: the text field, then Bold / Italic, font
(Original, Sans, Serif, Mono), size stepper, text colour, highlight, Clear
line, Done. The page stays visible above the sheet and the tapped line is
scrolled into view. A missing-glyph warning shows under the field.
**Save** produces the result; the toasts from `X-Edit-Report` (substituted
font, n rejected) appear on the result card.

**States:** load warnings as `UnreadableNotice`-style banners (too much text,
only invisible text, no text: "This looks like a scan"); a rotated page is
read-only with a banner.
**How we code it:** `docApi.pdfText`, `docApi.pdfPage`, `docApi.pdfEdit`; the
sheet sits on `KeyboardPadding` so the composer-under-keyboard defect
(`docs/TESTING.md` §5) cannot recur; a list mode ("All editable lines") is the
accessible way in.

### C9 · Convert — `app/doc/convert.tsx`

**Draws on:** 13 (formats with a reason), 14 (the file is the subject).

A file card (icon, name, size, ×). Under it, format **chips** built from what
the file is: an image gets PDF / JPG / PNG / WebP minus its own; a PDF gets
JPG / PNG. Under the chosen chip one muted line says why (13): "Best for
sharing", "Keeps transparency", "One image per page". **Convert to PDF**
(the verb names the target) is disabled until a chip is chosen.

**States:** empty = intake card ("Choose a photo or PDF"); converting = button
spinner + Cancel; unsupported = named error on the card.
**How we code it:** chips are a `View` row (they wrap at 360 dp in French);
`docApi.convert(file, to)` (`POST images/convert` for image → image,
parity G4a/G4b for the rest).

### C10 · Compress — `app/doc/compress.tsx`

**Draws on:** 14 (preview with the size under it).

A file card, then three radio rows: **Basic**, **Strong**, **Target size**
(a MB field, 0.1–100, debounced 800 ms). Every change re-runs the preview and
cancels the one in flight. Two cards side by side (stacked at 360 dp): Before
and After, each with the first page / image and its size; between them
"−62 %". **Save** uses the cached result (no second request).

**States:** generating = the After card shows a skeleton and "Working…";
"Target not met (2.4 MB is the smallest)" and "Already as small as it gets"
are named notices, not errors; the server never returns a bigger file.
**How we code it:** `docApi.compress(file, mode, targetMb, signal)`; no crown
or plan badge (the web's is decorative and there is no gate).

### C11 · Result — `src/screens/doc/ResultCard.tsx`

**Draws on:** 15 (preview, then a row of equal labelled actions, then Close).

Shown by every tool when its output is ready: a thumbnail of the result, the
file name (`<name>-signed.pdf`, `<name>_compressed.pdf`…), its size, then
equal actions with labels: **Share**, **Save** (Files on iOS, a folder via SAF
on Android, Photos for an image), and **Save to Pages** as LATER. **Done**
returns to the tool with the file still loaded, so a second edit needs no
re-pick. Several outputs (Split, PDF → images) show a count and share them
together.

**States:** saving = the tapped action spins; a refused permission names the
setting. Success is a toast, not a second screen.
**How we code it:** `expo-sharing`, `expo-file-system` cache dir,
`expo-media-library` for images; reuses `src/screens/pages/savePicker.ts`.

### C12 · Scanner (behind a flag, later)

**Draws on:** 16 (the system scanner), 02 (Scan as the first row).

Not built now. The IntakeSheet row exists behind `DOC_SCANNER_ENABLED = false`
and is hidden while false. When enabled it calls the platform scanner
(VisionKit / ML Kit, a new native dependency, so an EAS build) and returns one
multi-page PDF as one `DocFile`. We draw nothing of our own: the system UI is
the one users know.

---

## D · Decisions that carry weight

1. **The intake is one sheet for all six tools** (02), not six dropzones;
   rows a tool cannot use are hidden, not disabled.
2. **Placement is gestures plus one handle** (08, 09): the phone beats the web
   here, and the handle keeps it one-handed.
3. **Order is the user's in Merge and Pages**, by arrows first; only the
   signature list is a record list, and it is active first then newest.
4. **No list cell animates a transform**: thumbnails fade opacity, rotation
   swaps the render, cells have fixed heights.
5. **A page is paper in both schemes**: the canvas is white in dark mode; the
   chrome follows the tokens.

## E · Unproven until built

Every pixel claim above (French fits at 360 dp, the white-card rule on dark,
the 48 dp handle) is a device check at 360, 411 and 800 dp, light and dark,
saved to `ours/` before this row may say `DONE`.
