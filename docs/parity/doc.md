# Doc app: web → mobile parity audit

Read-only inventory, 2026-11-20. Web = `~/Apps/Personal/multi_magic` (paths below are relative to it unless prefixed `mobile:`). Mobile = `~/Apps/Personal/mm-parity-audit` (origin/main, release 1.3.0, commit 4dd5e8f). Abbreviations: `D/` = `app/javascript/pages/doc/`, `C/` = `app/javascript/pages/doc/components/`.

## 1. Summary: what Doc is

**Doc is a PDF and image toolkit, not a document store.** It keeps no documents. The only thing it saves on the server is the user's **signatures** (`doc_app_signatures`, with a PNG attached). Every other tool takes a file from the user's device, works on it and hands back a download. Nothing is written to Pages, Contacts or anywhere else. `docs/DOC_APP.md` covers the hub and `docs/PDF_EDITOR.md` the text editor.

- No OCR, no scanning and no AI. The assistant's catalogue lists Doc as "sign, merge and convert PDF documents" with `actions: nil` (`app/services/ai/app_catalog.rb:91-97`), so the assistant has no Doc tools.
- No templates and no document generation.
- No list, search, sort or filter over records. The only list is "your signatures", newest-active first (`app/controllers/api/v1/doc_app/signatures_controller.rb:9`: `order(active: :desc, created_at: :desc)`).
- **Most of the work happens in the browser.** Merge, page tools, signing, convert, the PDF validity check and every thumbnail run on pdf-lib, pdf.js and `<canvas>`. The server handles only signatures CRUD, compression, image decoding (HEIC/AVIF/TIFF → JPEG/PNG) and the PDF text editor (read text, render a page, rewrite text). **This is the biggest parity issue:** a phone has no canvas or pdf.js, so the work that runs in the browser needs a new home, ideally server endpoints (§4).

**Six tools.** The URL is `/doc/:tab` and an unknown tab falls back to `sign` (`D/Index.tsx:222-235`). The tool list is `D/Index.tsx:173-204`:

| Tab | Route | What it does |
| --- | --- | --- |
| Sign | `/doc/sign` (default) | Keep reusable signatures (drawn or typed) and stamp them on a PDF or an image |
| Merge | `/doc/merge` | Combine several PDFs and images into one A4 PDF |
| Pages | `/doc/pages` | Rotate, delete and reorder pages, extract a selection, split into one file per page (zip) |
| Text | `/doc/text` | Edit the existing words of a PDF in place: font, size, colour, highlight (server-side, HexaPDF) |
| Convert | `/doc/convert` | Image → PDF/JPG/PNG/WebP; PDF → JPG/PNG (zip if more than one page) |
| Compress | `/doc/compress` | Shrink a PDF or an image: Basic, Strong, or a target size in MB, with a before/after preview |

**Ways in on the web:** home tile (`app/javascript/pages/Home.tsx:134`), app registry (`app/javascript/lib/apps.ts:139-147`, `paneable: true`) and global search deep links to sign, merge, convert and compress (`app/javascript/components/search/registry.ts:149-161`). Search has no entry for Pages or Text.

**Mobile today: nothing.** No route, screen, API client or i18n for Doc.
- `mobile:src/apps/registry.ts:46-57`: the app switcher and home list have no `doc` entry.
- `grep -ri "doc_app\|/doc"` over `mobile:app/` and `mobile:src/` has one hit, `mobile:src/lib/pageContext.ts:39` (`["/doc", "doc"]`). That is a web route prefix → app key mapping for the assistant's page context, not a screen.
- **No overlap with Pages:** `mobile:app/pages/*` and `mobile:src/screens/pages/PdfView.tsx` only *view* a stored PDF (pdf.js 3.11.174 from cdnjs inside a WebView on Android, the native WebView on iOS). They do not sign, merge, edit or compress.
- **No overlap with contacts:** `mobile:app/contacts/document.tsx` only *views* a contact's attached file (image gallery, PDF viewer or a Share card) using the Pages viewer pieces. Nothing to edit or transform.
- **Reusable pieces:** the file pickers in `mobile:src/screens/pages/addFiles.ts:105,133,152` (library, document picker, camera), `PdfView` (render a PDF in a WebView), the share-intent bridge (`mobile:app/share.tsx`, which today routes shared files to Contacts or Pages only), and the `expo-sharing`, `expo-file-system`, `expo-media-library`, `react-native-svg`, gesture-handler and reanimated packages, all already installed.

**Web size:** about 5,300 lines of TSX/TS in `D/` and 364 lines of Ruby across 4 controllers, plus 7 services in `app/services/doc_app/`. The `doc.*` i18n namespace has **about 209 strings** (`app/javascript/i18n/locales/en.ts:1522`, 239 lines), and each needs EN and FR on mobile.

---

## 2. Web inventory by tab

Columns: **Feature** | **Web file:line** | **Mobile today** | **Phone mapping** | **MUST/LATER**. "—" in Mobile today means absent.

### 2.0 Hub (shared by every tab)

| Feature | Web | Mobile today | Phone mapping | |
| --- | --- | --- | --- | --- |
| Page header (icon and "Doc") | `D/Index.tsx:397-402` | — | `AppHeader` with title | MUST |
| Tool switcher: grid of 6 cards with icon, label and blurb (2 columns on a phone, 3 at sm, 5 at lg), `aria-current` | `D/Index.tsx:409-448` | — | Hub screen: 2-column card grid; each card pushes its own screen (`/doc/sign` and so on) | MUST |
| Deep link `/doc/:tab`, unknown → sign | `D/Index.tsx:222-235` | — | expo-router `app/doc/[tool].tsx` or one file per tool | MUST |
| App registry entry, home tile, search deep links | `lib/apps.ts:139-147`, `Home.tsx:134`, `search/registry.ts:149-161` | — | Add `doc` to `mobile:src/apps/registry.ts` and the home list | MUST |
| One shared dropzone (drag-drop, click to browse, busy spinner, `multiple`, `accept`) | `C/DocDropzone.tsx:15-107` | — | **One shared "Add a file" sheet**: Scan document (camera), Photos, Files, From Pages. Busy state is a spinner on the sheet | MUST (From Pages: LATER) |
| Accepted inputs: PDF plus every image type (HEIC, HEIF, AVIF, TIFF, JP2, BMP, SVG, ICO) | `D/lib/files.ts:14-19` | — | Same list. The iOS picker can hand back JPEG for HEIC itself, so fewer server round trips | MUST |
| Server decode for formats the browser cannot read (`needsServerDecode`, `toDrawableFile`, `toEmbeddableFile`) | `D/lib/files.ts:25-95` → `POST /doc_app/images/convert` | — | Same endpoint (multipart `{uri,name,type}`, the same pattern as `mobile:src/api/images.ts`) | MUST |
| Refuse a locked, damaged or empty PDF by name (`readPdf`, `pdfErrorKey` → `doc.errors.pdfLocked/pdfDamaged/pdfEmpty`) | `D/lib/files.ts:113-140` | — | No pdf-lib check on the phone. **API gap G6**: the server must report the reason | MUST |
| `formatBytes` ("2.4 MB") | `D/lib/files.ts:98-103` | `mobile:src/screens/pages/parts.tsx` has `formatBytes` | Reuse | MUST |
| Toasts for every success and error | throughout | the app has a toast or banner pattern | Same | MUST |

### 2.1 Sign (`/doc/sign`)

**Signature library (left sidebar on desktop, stacked on a phone)**

| Feature | Web | Mobile today | Phone mapping | |
| --- | --- | --- | --- | --- |
| List of signatures (`GET signatures`, `staleTime 0`, loads only on this tab) | `D/Index.tsx:253-258`, `612-672` | — | List screen or a horizontal strip of signature cards | MUST |
| Loading: 3 skeleton rows | `D/Index.tsx:582-587` | — | Skeleton | MUST |
| Empty state with a "Create your first signature" button | `D/Index.tsx:589-607` | — | Empty state with a CTA | MUST |
| Thumbnail: server PNG (`imageUrl`), else typed text in its font, else a pen icon | `D/Index.tsx:135-152` | — | `<Image>` of `imageUrl`; typed text fallback needs the fonts | MUST |
| Auto-select the active (or first) signature on first load | `D/Index.tsx:261-266` | — | Same | MUST |
| Tap a row to select it (check mark and "Selected" / "Tap to use") | `D/Index.tsx:623-641` | — | Same | MUST |
| Edit a signature (opens the creator in draw or type mode) | `D/Index.tsx:645-657` | — | Push the creator with the record | MUST |
| Delete a signature (**no confirmation on the web**) | `D/Index.tsx:658-667`, `308-316` | — | Swipe or menu → **confirm** (a phone mis-tap is costlier). Small deviation, deliberate | MUST |
| Add signature (header `+` and bottom button) | `D/Index.tsx:568-578`, `674-685` | — | FAB or header `+` | MUST |
| Default name "Signature N" (no rename UI anywhere) | `D/Index.tsx:210-215`, `323` | — | Same; no rename needed for parity | MUST |
| `active` flag is kept on save, but the UI cannot set it | `D/Index.tsx:329` | — | Keep. No UI needed | — |

**Creator: Draw** (`C/SignaturePad.tsx`)

| Feature | Web | Mobile today | Phone mapping | |
| --- | --- | --- | --- | --- |
| Draw / Type segmented toggle | `D/Index.tsx:514-539` | — | Segmented control | MUST |
| Freehand canvas with pressure-like strokes (perfect-freehand) | `C/SignaturePad.tsx:21-50`, `505-509` | — | `react-native-gesture-handler` Pan, perfect-freehand (pure JS), `react-native-svg` paths. **A finger beats a mouse here** | MUST |
| Brush: Pen / Pencil ("Feel") | `:148-151`, `352-359` | — | Chips | MUST |
| Pen colour: 5 swatches | `:133-139`, `369-381` | — | Swatches | MUST |
| Custom pen colour (native colour input) | `:385` | — | Colour picker | LATER |
| Background: White / Cream / Paper / Transparent | `:141-146`, `399-408` | — | Swatches | MUST |
| Thickness slider (shows px value) | `:420-433` | — | Slider (`@react-native-community/slider` or a custom one) | MUST |
| Zoom −/+/reset, 0.5–3× | `:155-157`, `443-471` | — | Pinch on the canvas, or leave out on a phone (the canvas fills the width) | LATER |
| Undo last stroke / Clear | `:271-279`, `520-535` | — | Buttons | MUST |
| Save (and "Save changes" when editing) → payload with strokes, size, colours **and a PNG `dataUrl`** cropped to the ink | `:85-95`, `288-293`, `540-545`; `D/Index.tsx:319-341` | — | **The PNG has to be produced on the phone**: `react-native-view-shot` or Skia (a new native dependency, so an EAS build). See G7 | MUST |
| Edit restores the strokes, background and thickness | `D/Index.tsx:542-549` | — | Same | MUST |

**Creator: Type** (`C/TypeSignature.tsx`)

| Feature | Web | Mobile today | Phone mapping | |
| --- | --- | --- | --- | --- |
| Name input with placeholder | `:166-171` | — | TextInput | MUST |
| 6 script fonts (Caveat, Dancing Script, Pacifico, Sacramento, Great Vibes, Allura) from Google Fonts, previewed in place | `:17-24`, `33-45`, `179-191` | — | **Bundle the 6 OFL fonts with `expo-font`.** Otherwise the typed thumbnails and the preview fall back to the system font | MUST |
| Colour: 5 swatches | `:26`, `204-212` | — | Swatches | MUST |
| Background: Transparent / White / Cream | `:27-31`, `222-233` | — | Swatches | MUST |
| Font size slider (default 72) | `:63`, `242-250` | — | Slider | MUST |
| Live canvas preview, saved as PNG | `:98-152` | — | `<Text>` in the font inside a view, captured to PNG (G7) | MUST |

**Document side**

| Feature | Web | Mobile today | Phone mapping | |
| --- | --- | --- | --- | --- |
| Dropzone for a PDF or any image (`doc.dropDocHere`, `doc.signHelp`) | `D/Index.tsx:695-703` | — | Add-a-file sheet. **Scan is better here**: photograph the paper and sign it | MUST |
| Load a file: PDF check, image decode through the server for HEIC, error toast `doc.couldNotOpenFile` | `D/Index.tsx:349-382` | — | Same through the server | MUST |
| File name and "Change document" | `D/Index.tsx:707-712`, `726-731` | — | Header row | MUST |
| PDF: page renderer at fit width (pdf.js) | `C/DocPdfSigner.tsx:99-137` | — | **No pdf.js natively.** Render pages with `POST pdf/page` (exists) or the `PdfView` WebView. G5 | MUST |
| PDF: previous/next page, "page X of N" | `C/DocPdfSigner.tsx:299-311` | — | Pager or vertical scroll | MUST |
| Hint "Click to place" / "Select a signature first" (warning toast) | `C/DocPdfSigner.tsx:139-145`, `323` | — | "Tap to place" | MUST |
| Tap to place the active signature (22 % of page width, stored as ratios) | `C/DocPdfSigner.tsx:139-175` | — | Same, stored as ratios | MUST |
| After one placement the active signature is deselected (one stamp per pick) | `D/Index.tsx:717-720`, `737` | — | Same, or keep it selected for multi-stamping (owner decision) | MUST |
| Drag a placement | `C/DocPdfSigner.tsx:180-197`, `349` | — | Pan gesture | MUST |
| Resize from the corner handle | `:198-218`, `413-415` | — | **Pinch, which beats a handle**, plus a corner handle for one-handed use | MUST |
| Rotate from the top handle | `:219-237`, `402-404` | — | **Two-finger rotate**, plus a handle | MUST |
| Remove a placement (×) | `:376-392` | — | × on the selected stamp | MUST |
| Tap the background to deselect | `:330` | — | Same | MUST |
| Download the signed PDF (pdf-lib `embedPng`, `drawImage` with rotation) → `<name>-signed.pdf`; warning if nothing is placed | `:239-283` | — | **API gap G3** (stamp on the server), or pdf-lib on Hermes. Output goes to Share / Save to Files / Save to Pages | MUST |
| Image: canvas fitted to width **and** height, so the buttons stay on screen | `C/DocImageSigner.tsx:85-104` | — | Fit inside the safe area | MUST |
| Image: download the signed image in its own format (PNG only when there is transparency, otherwise JPEG; WebP stays WebP) | `C/DocImageSigner.tsx:34-40`, `237-256`, `307-311` | — | Server stamp (G3), or capture on the phone with view-shot | MUST |
| Image: "Download as PDF" | `C/DocImageSigner.tsx:261-295`, `316-320` | — | Same endpoint with `output=pdf` | MUST |
| Same drag, resize, rotate and remove on images | `C/DocImageSigner.tsx:146-205`, `342-417` | — | Same gestures | MUST |

### 2.2 Merge (`/doc/merge`, `C/MergePdf.tsx`)

| Feature | Web | Mobile today | Phone mapping | |
| --- | --- | --- | --- | --- |
| Multi-file dropzone (PDF and any image) with help text | `:543-561` | — | Add-a-file sheet with multi-select. **Scan with several pages counts as one file** | MUST |
| HEIC/TIFF decoded through the server, original file name kept on the row | `:212-223` | — | Same | MUST |
| Locked or damaged PDFs refused by name while the rest still load | `:229-242` | — | Server check (G6) | MUST |
| `onlyPdf` toast when nothing usable was picked | `:224-227` | — | Same | MUST |
| Card per file: thumbnail (first page or the image), colour badge, page count ("1 page" / "N pages") | `:246-278`, `:59`, `:660-670` | — | Thumbnails from the server (G5) | MUST |
| "Insert here" slot between and after cards (adds files at that position) | `:307-310`, `:582-584`, `:678-680` | — | "Add here" row between cards, or add at the end and reorder | MUST |
| Drag to reorder (HTML5 DnD) | `:323-361` | — | Long-press drag (`react-native-draggable-flatlist` or reanimated) **or** up/down arrows, as Pages does. Arrows are simpler and match the web's own Pages decision | MUST |
| Select a card (checkbox) | `:364-369`, `:622-633` | — | Tap to select / checkbox | MUST |
| Remove one file (×) | `:371-378`, `:645-653` | — | × | MUST |
| "Add more" tile | `:685-708` | — | Tile | MUST |
| Summary: file count and total pages | `:719-723` | — | Footer text | MUST |
| Bulk "Delete selected (n)" | `:730-733`, `:380-383` | — | Same | MUST |
| "Clear all" | `:740-746` | — | Same, with a confirm | MUST |
| Preview modal: every page of every file rendered large, Esc closes, loading state | `:386-419`, `:195-201`, `:785-806` | — | Full-screen pager of server-rendered pages | LATER (thumbnails already show the order) |
| "Need two files" guard, button disabled under 2 files | `:461-465`, `:762` | — | Same | MUST |
| Merge: every page normalised to A4 and centred; PDFs copied as vectors; encrypted or odd PDFs fall back to raster; images embedded (JPEG direct, others as PNG) → `merged.pdf` | `:44-56`, `:461-533`, `:423-459` | — | **API gap G1** (server merge). Output goes to Share / Save | MUST |
| "Merging…" busy state | `:762-773` | — | Same | MUST |

### 2.3 Pages (`/doc/pages`, `C/PagesDoc.tsx`)

| Feature | Web | Mobile today | Phone mapping | |
| --- | --- | --- | --- | --- |
| Dropzone, PDF only, "Reading…" busy state | `:236-245` | — | Add-a-file sheet (PDF only; Scan → PDF also works) | MUST |
| Load every page as a thumbnail (pdf.js at scale 0.4) | `:69-112` | — | Server thumbnails (G5) | MUST |
| Header: page count and "n selected" | `:256-257` | — | Same | MUST |
| Undo (20-step history) | `:62-69`, `:261-263` | — | Same (client state) | MUST |
| "Change document" | `:265-266` | — | Same | MUST |
| Tap a page to select it | `:280-290` | — | Same | MUST |
| Per-page move left/right, rotate left/right (on top of the page's own rotation), delete | `:116-141`, `:305-337` | — | Same buttons (the web chose arrows *because* they work on a phone, `docs/DOC_APP.md` §Pages). Thumbnail rotates visually | MUST |
| "Save all" → `<name>-edited.pdf` | `:146-182`, `:350-356` | — | **G2** (server page ops) or pdf-lib | MUST |
| "Extract n pages" → `<name>-pages.pdf` (disabled when nothing is selected) | `:186-197`, `:358-366` | — | G2 | MUST |
| "Split each page" → zip of one PDF per page | `:200-224`, `:368-369` | — | G2. On a phone a zip is poor: share N PDFs, or save them into a Pages folder. Zip as the fallback | MUST |

### 2.4 Text editor (`/doc/text`, `C/TextEditorDoc.tsx`, server `pdf_controller.rb`)

| Feature | Web | Mobile today | Phone mapping | |
| --- | --- | --- | --- | --- |
| Dropzone, PDF, "Reading…" | `:473-482` | — | Add-a-file sheet | MUST |
| Read every text run (box, font, size, colour, alphabet, container stream), outlines, unreadable count, page geometry | `:280-313` → `POST pdf/text` | — | Same endpoint, unchanged | MUST |
| Load warnings: too much text (truncated at 2,000 runs), only invisible text (scan with OCR layer), only unreadable text, no text (a scan) | `:300-310` | — | Same banners | MUST |
| Page rendered **by the server** (poppler), width tied to zoom and pixel ratio | `:340-365`, `:171-182` → `POST pdf/page` | — | Same endpoint (device pixel ratio from `PixelRatio`) | MUST |
| Zoom −/+ 75–300 % | `:505-525` | — | Pinch-zoom on a ScrollView, plus buttons for a11y | MUST |
| Previous/next page | `:532-552` | — | Same | MUST |
| "n changes" counter | `:498` | — | Same | MUST |
| Discard all changes | `:558-564` | — | Same, with a confirm | MUST |
| Change document | `:566-567` | — | Same | MUST |
| Save → `POST pdf/edit` → `<name>-edited.pdf`; toasts: saved (n), saved with a substitute font, some rejected (n), a shared form changed (n pages) from `X-Edit-Report` | `:410-458`, `:569-571` | — | Same endpoint. Read the header in RN (exposed). Share / Save | MUST |
| Rotated page is read-only (warning banner) | `:487`, `:575-578` | — | Same | MUST |
| "The preview is a preview" note | `:583` | — | Same | MUST |
| Overlay marks in % of the page box: blue = editable (tap), amber dotted = unreadable, grey dashed = picture of text, invisible OCR layer, each with a "why" tooltip | `:623-712`, `:127-170` | — | Absolute views in %. **Tooltips become tap → a sheet with the "why" text** | MUST |
| Legend with counts (editable / unreadable / invisible / picture) | `:723-743` | — | Same | MUST |
| Tap a line → inline input in place, in the run's colour and size; Enter/Esc to finish | `:704-705`, `:840-855` | — | **Phone-hard**: runs are 6–12 pt at 360 dp. Tap the line → **bottom sheet editor** (text field plus the toolbar) while the page stays visible above, plus a live preview patch on the page | MUST |
| Missing-glyph warning while typing ("these characters force a substitute") / "Restyled" / "Exact match" | `:893-921` | — | Same logic (pure JS) | MUST |
| Bold / Italic toggles | `:931-939` | — | Same | MUST |
| Font family: original / sans / serif / mono | `:945-953` | — | Segmented control or picker | MUST |
| Size −/+ (4–96) | `:961-972` | — | Stepper | MUST |
| Text colour swatches | `:978-985` | — | Swatches | MUST |
| Highlight swatches (tap again to toggle off) | `:990-998` | — | Swatches | MUST |
| Clear line / Done | `:1007-1012` | — | Same | MUST |
| Live preview: old words covered in the sampled page colour (`lib/pageInk.ts`, median ring of pixels), new words drawn in the requested style, highlight drawn | `:370-405`, `:760-815`; `D/lib/pageInk.ts:1-90` | — | **Phone-hard**: sampling pixels needs canvas `getImageData`. Use Skia on the page PNG, or have the server return the ground colour per run with `pdf/text` (G8). Fallback: white cover | MUST (ground sampling: LATER if white is acceptable for v1) |

### 2.5 Convert (`/doc/convert`, `C/ConverterDoc.tsx`)

| Feature | Web | Mobile today | Phone mapping | |
| --- | --- | --- | --- | --- |
| Dropzone for any image or PDF, `anyImageToDoc` help | `:363-371` | — | Add-a-file sheet. **Photo or scan → PDF is the main phone case** | MUST |
| Unsupported-format and locked/damaged PDF toasts | `:243-277` | — | Same | MUST |
| File card: icon, original name, size, "prepared for the browser" note when the server decoded it, clear (×) | `:374-399` | — | Same (drop the "browser" wording) | MUST |
| Output format chips, driven by what the file *is*: image → PDF/JPG/PNG/WebP minus its own format; PDF → JPG/PNG | `:51-73`, `:403-421` | — | Same chips | MUST |
| "Select a format" hint; Clear; Convert (disabled until chosen; "Converting…") | `:427-456` | — | Same | MUST |
| Image → A4 PDF (pdf-lib) → `<name>.pdf` | `:130-152`, `:306-313` | — | **G4a** (server) | MUST |
| PDF → images at 2× (pdf.js); one page → a single file, several → `<name>_pages.zip` | `:170-200`, `:314-333` | — | **G4b** (server `pdftoppm`). Several pages → share N images or save to the gallery / a Pages folder | MUST |
| Image → image (canvas; JPEG gets a white ground, quality 0.92) | `:154-163`, `:334-342` | — | **Already possible**: `POST images/convert` with `to=jpg|png|webp` | MUST |
| Output named after the original file, not the intermediate | `:236-238`, `:304` | — | Same | MUST |

### 2.6 Compress (`/doc/compress`, `C/CompressDoc.tsx`, server `compress_controller.rb`)

| Feature | Web | Mobile today | Phone mapping | |
| --- | --- | --- | --- | --- |
| Dropzone for a PDF or any image (no MIME whitelist; the server reads HEIC) | `:110-138`, `:336-340` | — | Add-a-file sheet | MUST |
| File card with clear | `:345-366` | — | Same | MUST |
| Mode radio: Basic / Strong (crown icon, **decorative only**: no plan gate on the server) / Custom | `:372-400` | — | Radio list | MUST |
| Custom target size in MB (0.1–100), debounced 800 ms | `:405-425`, `:152-156` | — | Numeric input | MUST |
| **Auto-preview**: every mode or target change re-runs `POST compress` | `:189-258` | — | Same. Cancel in-flight requests with an AbortController | MUST |
| Before/After cards (first-page render for a PDF, the image itself) with sizes and % reduction; "Generating…" | `:166-187`, `:430-457`, `:660-720` | — | Before: local image / server page 1. After: the returned bytes | MUST |
| "Target not met" and "No reduction" notices | `:466-480` | — | Same | MUST |
| Lightbox: full-screen before/after toggle; the PDF in an iframe, the image as `<img>` | `:520-640` | — | Full-screen viewer (`PdfView` for a PDF) | LATER |
| Download → `<name>_compressed.<ext>`, the cached result (no second request) | `:254-273`, `:498-512` | — | Share / Save | MUST |
| Server: 50 MB cap; PDF via HexaPDF image recompression with quality per mode (custom = step down to the target); image via libvips (quality 78/45/65, strong caps at 2500 px); **never returns a bigger file**; reports the real output MIME | `compress_controller.rb:4-57`, `app/services/doc_app/pdf_compressor.rb:6-50`, `image_compressor.rb:14-61` | — | Same endpoint | MUST |

### 2.7 States, permissions, background work, links to other apps

| Item | Web | Mobile mapping |
| --- | --- | --- |
| Empty state: only the signature list has one; each tool's dropzone *is* its empty state | `D/Index.tsx:589-607`, `C/DocDropzone.tsx` | Same: each tool opens on its intake card |
| Loading: signature skeletons; busy labels per dropzone and button ("Reading…", "Merging…", "Converting…", "Generating…", "Preparing…") | throughout | Same strings |
| Errors: toasts with named reasons (locked, damaged, empty, unsupported, page failed, compress error) | `D/lib/files.ts:138-140` and throughout | Same, plus **offline**: the web needs the server only for some tools; on mobile almost every tool will need it, so say so |
| Permissions: Pundit, owner-only signatures (`app/policies/doc_app/signature_policy.rb`); stateless endpoints need only login | — | Camera / photo library permission prompts (already handled by `addFiles.ts`) |
| Background jobs / polling: **none**. Every endpoint is synchronous (`pdftoppm` is spawned with a timeout, `pdf_page_image.rb:46-58`) | — | Expect 1–10 s calls; show progress and allow cancel |
| Links to other apps: **none** on the web (no Pages import or export, no Contacts link) | — | Phone extras: open from Pages or a share intent, save the result to Pages (LATER, not parity) |
| Assistant: no Doc actions (`app_catalog.rb:91-97`) | — | None needed |

---

## 3. API endpoints mobile needs

Existing (`config/routes.rb:280-291`, namespace `api/v1/doc_app`):

| Verb | Path | Controller#action | Used for | Mobile notes |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/doc_app/signatures` | `signatures#index` (paginated, root `signatures`) | Signature list | Fine |
| GET | `/api/v1/doc_app/signatures/:id` | `signatures#show` | (unused by the web UI) | Optional |
| POST | `/api/v1/doc_app/signatures` | `signatures#create` | name, kind, strokes[{color,size,brush,points[[x,y,p]]}], width, height, bg_color, text, font, color, font_size, active, **data_url (PNG base64)** | The phone must produce the PNG (G7) |
| PATCH | `/api/v1/doc_app/signatures/:id` | `signatures#update` | Same fields; PNG replaced only if `data_url` is sent | Fine |
| DELETE | `/api/v1/doc_app/signatures/:id` | `signatures#destroy` | Delete | Fine |
| POST | `/api/v1/doc_app/images/convert` | `images#convert` (multipart `file`, `to`=auto/jpg/png/webp, `max`, `quality`) → **raw bytes**, `X-Original-Size`, `X-Converted-Size` | HEIC/TIFF decode; **image → image conversion** | Read as a blob or write to a file with `expo-file-system` |
| POST | `/api/v1/doc_app/compress` | `compress#create` (multipart `file`, `mode`, `target_mb`) → JSON `{original_size, compressed_size, file: base64, mime_type}` | Compress | Works. Base64 of up to 50 MB in JSON is heavy on a phone (G9) |
| POST | `/api/v1/doc_app/pdf/text` | `pdf#text` (`file`, optional `page`) → runs, outlines, unreadable, truncated, pages geometry | Text editor | Works |
| POST | `/api/v1/doc_app/pdf/page` | `pdf#page_image` (`file`, `page`, `width` 320–2400) → PNG | Text editor page image. **Also usable for every thumbnail and signer page**, at one upload per page (G5) | Works |
| POST | `/api/v1/doc_app/pdf/edit` | `pdf#edit` (`file`, `edits` JSON) → PDF bytes plus `X-Edit-Report` | Text editor save | Works |

Every endpoint is **stateless and multipart**: each call uploads the whole file again. The web gets away with that because it uploads only for the text editor and compress.

## 4. API gaps (what the web does in the browser, which has to move to the server for a phone)

Recommendation: **put each of these on the server** using the libraries the server already has (HexaPDF, poppler `pdftoppm`, libvips). The other route is pdf-lib inside Hermes: it is pure JS and does run, but a 20–50 MB PDF held as base64 in JS memory is a crash risk, it still cannot *render*, and it would be a second implementation of logic the server can own once. **Inferred, not measured**: no Hermes benchmark was run.

| # | Gap | Web does it in | Proposed endpoint |
| --- | --- | --- | --- |
| **G1** | Merge PDFs and images into an A4-normalised PDF (vector copy, raster fallback for encrypted PDFs) | `C/MergePdf.tsx:461-533` (pdf-lib, pdf.js) | `POST doc_app/pdf/merge`: multipart `files[]` in order → PDF bytes |
| **G2** | Page ops: reorder, rotate, delete, extract, split | `C/PagesDoc.tsx:146-224` (pdf-lib, fflate) | `POST doc_app/pdf/pages`: `file` + `pages: [{source, rotation}]` → PDF; `split=true` → zip (or N files) |
| **G3** | Stamp signatures onto a PDF or an image, with rotation, at % placements | `C/DocPdfSigner.tsx:239-283`, `C/DocImageSigner.tsx:205-295` | `POST doc_app/sign`: `file`, `placements: [{page, x, y, w, h, rotation}]` in ratios, `signature_id` (the server already has the PNG), `output=same|pdf` → bytes |
| **G4a** | Image → A4 PDF | `C/ConverterDoc.tsx:130-152` | Covered by G1 with a single file, or `POST images/convert to=pdf` |
| **G4b** | PDF → JPG/PNG per page | `C/ConverterDoc.tsx:170-200` | `POST doc_app/pdf/images`: `file`, `format`, optional `page` → image, or a zip for all pages |
| **G5** | Thumbnails of every page (Pages, Merge, Sign, Compress "before") | pdf.js on canvas, `C/PagesDoc.tsx:69-100` and others | `pdf/page` exists but needs one full upload per page, so a 30-page PDF costs 30 × N MB. Need `POST doc_app/pdf/thumbnails` → every page small in one response (zip or JSON of base64 JPEGs), **or** an upload-once token (`POST doc_app/uploads` → id; later calls take `upload_id`), which would also fix G9 and the repeated uploads in the text editor |
| **G6** | Tell a locked PDF from a damaged or empty one | `D/lib/files.ts:117-135` (pdf-lib) | `pdf#text` and `pdf#page_image` currently answer a generic `pdf_unreadable` 422 for both. Add a `reason: locked|damaged|empty` code (or a `POST pdf/inspect` → `{pages, reason}`) |
| **G7** | Rasterise a drawn or typed signature to PNG | `<canvas>.toDataURL`, `C/SignaturePad.tsx:85-95`, `C/TypeSignature.tsx:98-152` | Either the client uses `react-native-view-shot` / Skia (a new native dependency, so an EAS build, and the quota is small), or the **server renders the PNG from the strokes and text** when `data_url` is absent (libvips SVG). The server route avoids a native dependency |
| **G8** | Sample the page's ground colour under a run for the edit preview | `D/lib/pageInk.ts` (`getImageData`) | Add `ground: "#rrggbb"` per run to `pdf#text`, computed from the poppler render. Optional, see §2.4 |
| **G9** | Compress returns base64 inside JSON (about 1.33× the size, parsed in memory) | `compress_controller.rb:22-29` | Accept `?raw=1` → bytes plus `X-Original-Size`/`X-Compressed-Size` headers, like `images#convert` |
| G10 (finding) | **Custom target for an image is ignored**: `ImageCompressor.call` takes no `target_mb` (`compress_controller.rb:49`, `image_compressor.rb:18`), yet the web shows the target field for images too (`C/CompressDoc.tsx:405`) | — | A server fix or UI hide, decided on the web first. Inferred from code, not reproduced |

## 5. Phone-hard items and the phone equivalent

| Item | Why it is hard on a phone | Equivalent |
| --- | --- | --- |
| PDF rendering (thumbnails, signer pages, previews) | No canvas, no pdf.js natively | Server `pdf/page` and the batch thumbnails (G5). The `PdfView` WebView (pdf.js from cdnjs, needs internet, 25 MB cap) is only for full-document viewing |
| pdf-lib work (merge, pages, sign, image→PDF) | Memory and base64 bridging in Hermes | Server endpoints G1–G4 |
| Drawing a signature and exporting a PNG | Needs gesture plus vector drawing, then a raster | gesture-handler + svg + perfect-freehand (all JS or already installed). PNG via server (G7) or view-shot |
| Typed-signature fonts | Google Fonts are loaded at runtime on the web | Bundle the 6 OFL fonts (`expo-font`), so they work offline too |
| Drag, resize and rotate stamps | Tiny 20 px handles | **Better on a phone**: pan plus pinch plus two-finger rotate (gesture-handler `Simultaneous`) |
| Text-editor inline input over 6–12 pt runs at 360 dp | Tap targets far below 44 pt; the keyboard covers the page | Tap → bottom sheet editor; pinch-zoom; a list mode ("all editable lines") as an accessible way in |
| Hover tooltips ("why is this unreadable") | No hover | Tap a mark → small sheet |
| Download / zip | No downloads folder; a zip is unfriendly on iOS | `expo-sharing` share sheet; Android SAF "Save to…"; images → `expo-media-library`; several outputs → share several files, or save to a Pages folder |
| Drag-and-drop files, a dropzone | Not on a phone | One "Add a file" sheet: Scan / Photos / Files / (Pages) |
| HEIC | The web needs a server round trip | The iOS picker can hand back JPEG (compatible mode) |
| 50 MB uploads over mobile data | Slow; every stateless call re-uploads the file | Upload-once token (G5), progress bar, cancel |
| Offline | Almost every tool will need the server on mobile | Say so plainly; Sign's library can be cached |

**Where the phone is BETTER than the web:**
1. **Document scanning.** The web has none. A native scanner with edge detection, perspective correction and multi-page capture (iOS VisionKit / Android ML Kit, e.g. `react-native-document-scanner-plugin`, a new native dependency) feeds straight into Merge (scan → PDF), Sign (photograph a paper and sign it), Compress and Convert. This should be the first option in the Add-a-file sheet. It is not web parity but an equivalent the phone does better, so treat it as MUST.
2. **Signing with a finger**, rather than a mouse.
3. **Gestures** for placing, resizing and rotating a stamp.
4. **Share-in**: a PDF from Mail or WhatsApp → "Sign / Compress with MultiMagic". `mobile:app/share.tsx` already routes shared files to Contacts and Pages; add Doc as a target (LATER).
5. **Share-out**: the signed PDF goes straight back into Mail or WhatsApp.

## 6. Size

**Screens (about 11):**
1. Doc hub
2. Sign: signature library
3. Signature creator (draw / type)
4. Sign: place on document (PDF pager or image)
5. Merge
6. Merge preview (LATER)
7. Pages
8. Text editor
9. Text edit sheet (a sheet, not a screen)
10. Convert
11. Compress, with a compare viewer (LATER)

Plus shared pieces: the Add-a-file sheet with scanner, the output Share/Save helper, a server-thumbnail hook, and the Doc API client.

**Rough dev-days (one agent, gates plus device QA included):**

| Block | Days |
| --- | --- |
| Server: G1, G2, G3, G4b, G5 (thumbnails and/or upload token), G6, G7, G9, with request specs (the repo has 567 lines of doc_app request specs to extend) | 5–6 |
| Mobile shared: API client, intake sheet with scanner (new native dependency, so a dev build), output share/save, thumbnails, i18n of about 209 keys EN/FR, registry/home/deep links | 4–5 |
| Sign (library, draw pad, typed fonts, placement gestures, PDF and image output) | 6–7 |
| Merge | 2–3 |
| Pages | 2 |
| Text editor (overlay in %, zoom, sheet toolbar, glyph check, preview, edit report) | 5–7 |
| Convert | 1–1.5 |
| Compress | 1.5–2 |
| Device QA at 360/411/800 dp, flows, SPEC and screenshots per the repo's DONE rule | 3–4 |
| **Total** | **about 30–37 dev-days** (about 6–7 weeks). The quickest useful slice is Hub + Sign + Compress + Convert (image→image and image→PDF) on top of G3/G4/G7, about 12–14 days |

Every number above is an estimate from reading the code. Nothing was built or run.
