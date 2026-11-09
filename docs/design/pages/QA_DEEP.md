# Pages: deep QA pass, 2026-11-07 (round 2: every open item closed or stated)

**Why:** the owner tested TestFlight build 7 on his iPhone and found things wrong
that our QA had not caught: "the size, the folders… if we open the files, they
still show the folders, and it's the same for the reverse."

**How:** by hand, as a user, on the Android emulator `qa_phone`, mostly at
360 dp. The build is the dev client with Metro 3029, signed in as the QA
account against the local backend.

**What the bugs were judged against:** Google Drive's behaviour. Its reference
screens are the Mobbin ids listed in `SPEC.md` §1.

**Rules for this file:**
- Each defect has a severity, the screenshot that shows it (under
  `ours/qa/`), its cause when found, and its status.
- "Fixed" means three things: a test that was red first, a test that turns red
  when the fix is planted back out, and a re-shot on the device.

Severity:
- **High**: wrong information, or Drive users would be lost.
- **Medium**: missing Drive behaviour, or a clear rough edge.
- **Low**: polish.

## Defects

| # | Sev | Where | What was wrong | Cause | Status |
|---|-----|-------|----------------|-------|--------|
| 1 | High | Folder, type filters | **Images / PDFs / Videos… still listed every folder** (the owner's report). Drive's type filter lists only matching files. Before: `360-a2-filter-images.png`. | `node_sorting.rb` `apply_content_type_filter` keeps folders on purpose, for the web; the phone never asked for `kind=file`. | **Fixed.** `src/screens/pages/drive/filters.ts` `listFilter`: a type sends `kind=file`; the server applies `kind` before the type. After: `360-f1-images-only.png`. Test: `filters.test.ts`, planted back red. |
| 2 | High | Folder, filters | **No way to see only folders** ("the reverse"). Drive has a "Folders" filter. | Missing. | **Fixed.** A "Folders" chip after All sends `kind=folder`. EN "Folders", FR "Dossiers". After: `360-f2-folders-only.png`. |
| 3 | High | Grid view | **Folders and files shared rows.** A folder next to a file card stretched to the card's height and showed as a tall empty card ("Vlog 2026"). Drive's grid keeps short folder tiles and tall file cards on separate rows. Before: `360-a3-root-grid.png`. | One `FlatList` with `numColumns=2`, mixed items, rows stretched to the tallest item. | **Fixed.** `NodeCollection.tsx`: folders first; with an odd number, a spacer closes their row; rows align to the top. After: `360-f3-grid-fixed.png`, dark `360-h1-dark-grid.png`. Tests: 3 grid cases, red first. |
| 4 | High | Every size | **Sizes did not match the phone.** IMG_2041.jpg is 107,247 bytes: Android's Files app said "107 kB", Pages said "105 KB". A 283 MB clip said "270 MB". "1004 B" where the phone says "1 KB". | `formatBytes` divided by 1024. iOS Files/Photos and Android Files count in thousands. | **Fixed.** `parts.tsx` `formatBytes` counts in thousands and never prints "1000 KB". Re-shot: 107 KB, 3.8 MB. Tests: 6 cases, red first. |
| 5 | High | Move (⋯ → Move, multi-select Move) | **In a folder, Move opened on the list of spaces**, not where the file is. The Jest test claimed "opens in its space" and was green. Before: `360-i1-move-sheet.png`. | A folder listing sends `space: null` (only drive-wide lists send `with_space`). The test's fixture carried a `space`, data a folder screen never receives. | **Fixed.** `sheets.tsx` `MoveSheet` fetches the space name and the parent folder (its `show` has the ancestors) and opens there: Spaces › QA Pages › QA uploads. After: `360-i2-move-opens-here.png`. Test uses `space: null`, red first. |
| 6 | Medium | Move | "Move to QA uploads" was offered where the file already is. Drive greys it. | Missing. | **Fixed in Jest; NOT re-shot.** Disabled until another place is chosen; test red first. `360-i2-move-opens-here.png` was taken just before this fix and still shows the button enabled. |
| 7 | Low | ⋯ → Details | Dates showed seconds and a numeric date: "11/6/2026, 3:45:40 PM". Before: `360-e2-folder-details.png`. | `toLocaleString()` with no options. | **Fixed.** "Nov 6, 2026, 3:45 PM" (`dateStyle: medium, timeStyle: short`, follows the language). After: `360-f4-details-date.png`. |
| 8 | Medium | Search | Search was still the old screen: a title, then a field, no type chips. Before: `360-c1-search.png`. | Not redone in the Drive pass. | **Fixed.** `drive/SearchView.tsx`: a pill with back and clear; chips **Type · Modified · Owner**, each a sheet; a chip alone searches ("PDFs" with nothing typed). Type is filtered on the server; Modified and Owner on the phone (the server has neither), reading on while the filtered list is short. Fixed on the device too: the first tap on a chip with the keyboard up only closed the keyboard; the chip row now keeps that tap. After: `360-m2-search-empty.png`, `360-m3-search-images.png`, FR `360-x2-fr-search-modified.png`. Tests: `SearchTrash.test.tsx` (planted: Modified ignored → red). |
| 9 | Medium | Trash | Trash was the old screen: "Tap an item to restore it", with no Delete forever and no Empty trash. Before: `360-j2-trash.png`. | Not redone. | **Fixed.** `drive/TrashView.tsx`: ⋯ per item → Restore (at once, as Drive) / Delete forever, plus an "Empty trash" button. Both deletes ask first and say "This can’t be undone" (`360-n3-delete-confirm.png`, `360-n4-empty-confirm.png`, opened and CANCELLED on the device). Restore measured. There is no empty-trash endpoint, so `pagesApi.emptyTrash` destroys each item. Tests: planted (no confirmation) → red. |
| 10 | Medium | Photo viewer | No pinch-zoom, no swipe to the next photo, light background. Before: `360-d1-view-image.png`. | Not built. | **Fixed.** `ImageGallery.tsx`: dark, swipe through the folder's images in name order ("2 of 3"), the header following the photo shown; pinch, drag when zoomed, double-tap. Built on RN `PanResponder`/`Animated`, since gesture-handler/Reanimated are unused in this app. Device: swipe and double-tap MEASURED (`360-o2-gallery-swiped.png`, `360-o3-gallery-zoomed.png`). **Two-finger pinch NOT MEASURED** (adb cannot send one); its arithmetic is in Jest. |
| 11 | Medium (Android only) | PDF viewer | On Android a PDF was not shown inline. Before: `360-d2-view-pdf.png`. | Android WebView does not render PDFs. | **Fixed.** `PdfView.tsx`: the file is downloaded and drawn page by page by pdf.js 3.11.174 (cdnjs, pinned) in a WebView; above 25 MB, or offline, it says so and offers Share. After: `360-p1-pdf-android.png`. iOS unchanged (native viewer, never watched on a device). **Known limit:** pdf.js is fetched from cdnjs when a PDF is opened, so on Android with no connection a PDF falls back to Share. Bundling pdf.js in the app is a later option. |
| 12 | Low | Grid, folder tiles | Names were cut early at 360 dp ("QA uploa…"). | Tile layout. | **Fixed.** A folder's name gets two lines ("QA / uploads"); file cards keep one so previews line up. `360-r2-grid-names.png`. |
| 13 | Low | Search pill | "Rechercher dan…" was cut at 360 dp; once the avatar became a button (#15), "Search in Pag…" was cut in English too. | The pill holds back, ⋮, AI and avatar. | **Fixed.** The pill says "Search" / "Rechercher" (`pages.searchPill`); the search screen keeps the full words. `360-x1-fr-pages.png`. |
| 14 | Low | Inside a folder | The bottom tabs were gone inside a folder. | The folder is a pushed screen. | **Fixed.** The tabs show in every folder; a tap goes back to that tab (`/pages?tab=`). Measured: Starred from inside a folder lands on Starred. `360-r3-folder-tabs.png`. Render sweep planted → red. |
| 15 | Low | Search pill | The avatar was not a button. | Not wired. | **Fixed.** It opens the same account sheet as Home. `360-r1-avatar-sheet.png`. Render sweep planted → red. |
| 16 | Low | PDF thumbnail | The first page was cropped on the left ("eekend itinerary"). | `contentFit: cover` centred a wide render. | **Fixed.** Document thumbnails anchor top-left (`PAGE_LIKE`). `360-r2-grid-names.png`. |
| 17 | Medium | Audio viewer | An mp3 played inside a screen-high, empty grey video frame; then, in a shorter box, Android's native controls showed only Play while paused, with no seek bar. | Audio and video shared one `VideoView` with native controls. | **Fixed.** A music card with controls drawn by the app (`AudioCard` in `app/pages/view.tsx`): play/pause, a bar you tap to seek, and the clock, driven by the player's `timeUpdate`/`playingChange`; Play at the end starts again. Device: playing, "0:03 / 0:04" with the bar moving, `360-y1-audio-playing.png`. Tests: 5, including a planted break (clock not listening) → red. |
| 18 | High (Android) | + New → photos | A photo picked from Android's photo picker uploaded as **"1000017023.jpg"**, its media id; `qa_offline_24.jpg` was its real name. The picker keeps names private. | `asset.fileName` is the media id on Android 13+. | **Fixed.** `friendlyName`: a media-id name becomes `IMG_YYYYMMDD_HHMMSS.ext`, from the photo's EXIF date, else the time it was picked. Before: `360-u4-picker-media-id-names.png`; after: `360-u6-named.png` ("IMG_20261107_011756.jpg"). Tests red first. iOS gives real names ("IMG_0042.HEIC"), which are kept. |
| 19 | Medium | + New → camera | A camera photo uploaded as "12cd5e03-9e01-….jpeg", the picker's cache UUID. | Same: no real name. | **Fixed (Jest; not re-shot).** The UUID case is caught by `friendlyName` too. Test red first. |
| 20 | Low | + New sheet | The sheet stayed open behind Android's camera-permission dialog. | The picker started while the sheet was still sliding away. | **Fixed.** `NewSheet` closes, then starts the picker after `SHEET_CLOSE_MS` (350 ms). Device: the permission dialog over the folder, sheet gone, `360-y2-camera-permission.png`. Test red first. |
| 21 | ? | Folder after a camera upload | Once, the open folder did not list the camera photo until reopened; the tray said "Saved". | Not found. | **NOT REPRODUCED.** Picker and file uploads appeared at once. |

## Checked and fine (on the device today)

- **Tabs.** Home lists recent files with space, size and modified time. Starred,
  Shared (empty state "Nobody has shared anything with you.") and Files (spaces)
  all render.
- **Folder list.** Folders come first, then files by name; folder rows say
  "N items". The list scrolls to the end, with the + not covering the last row.
- **Opening files.** A photo opens; a video plays (00:04 clip); a PDF works as in
  defect 11.
- **⋯ actions on a file, each measured.**
  - Add to starred: the menu then offers "Remove from starred".
  - Rename: Budget.xlsx → Budget-2026.xlsx.
  - Move into Vlog 2026: gone from the root, present in Vlog 2026.
  - Move to trash: asks first, "You can restore it from Trash."
  - Restore from Trash: it goes back to Vlog 2026.
  - Then everything was undone: moved back, renamed back, unstarred.
- **Multi-select, list and grid.** Shown in batch 2; the + hides while selecting.
- **The AI button over Pages (Starred tab) and back.** X returns to the Starred
  tab, still selected, with its content.
- **French at 360 dp.** Tabs (Accueil, Favoris, Partagés, Fichiers), chips
  (Tout, Dossiers, Images, PDF, Vidéos) and units ("107 Ko", "3,8 Mo") are all
  correct.
- **Dark mode.** Grid and filter after the fixes.

## Coverage asked for in round 2, and what actually ran

| Item | Result |
|------|--------|
| 120+ items, paging, scroll, sort | **NOT MEASURED, blocked.** `qa/seed_pages.py` (seed and clean one "QA seeded (delete me)" folder in the QA space, QA account only) was refused by the session's permission check as a write to a shared resource (the local backend's database). It was not run and not worked around; it needs the owner's go-ahead. Paging is covered in Jest only. |
| Long names (60+) | **MEASURED.** A file renamed in the app to a 76-character name ends with "…" in the list and the viewer header, and sorts by its new first letter. Renamed back afterwards. `360-s1-long-list.png`, `360-s3-long-viewer.png`. |
| RTL names | **NOT MEASURED.** `adb input text` sends ASCII only, so a Pashto or Arabic name could not be typed. The seed script holds three RTL names for when it may run. |
| Audio / Office / zip / page viewers | **MEASURED.** Audio: the card (#17). docx, xlsx, pptx, zip: "No preview… Share it to open it in another app" on Android, which is honest; iOS opens Office inline (not watched). Page: opens as html. |
| + New on the device | **MEASURED.** Photos: 2 picked, uploaded with correct sizes (35 KB, 105 KB), and the names led to #18. A file through the document picker: IMG_2041.jpg, 107 KB, real name kept. Camera: shot and uploaded; the name led to #19. A **large video** was not re-run today; it was measured 2026-11-06 (SPEC §7: 283/283/569 MB, two kills, airplane mode, byte-identical). |
| Upload tray | **MEASURED.** It lists each upload with "Saved in QA Pages / QA uploads". |
| Shared space with a viewer role | **Jest only.** A second QA account would mean creating a user in the local backend; not done. `SaveToPages.test.tsx` covers view-only greying. |
| French, 360 dp | **MEASURED.** Search chips and sheet, Trash with "Vider la corbeille", the pill "Rechercher". |

Test data left behind in the QA space: in QA uploads, `IMG_2041.jpg` and
`IMG_20261107_011756.jpg` (uploads); in Trash, the three badly named test
uploads. All of it is QA account only.

## What only an iPhone can show (Android cannot stand in)

1. **The share extension** (Photos → Share → MultiMagic).
   - Build 7 shipped without it (app-only).
   - The full build waits on `eas credentials`: an App Group plus a second
     profile for `com.multimagics.mobile.share-extension`.
2. **Background uploads.** `expo-file-system` `sessionType: "background"` uses
   iOS's background `URLSession`.
   - Locking the phone mid-upload and reopening the app are iOS behaviours we
     have never watched.
   - Android ran the same code with its own uploader.
3. **Documents inline.** PDF and Office files go through the `document` viewer
   mode, iOS only.
4. **The Photos permission sheet**, including "Limited access" and the
   one-photo-at-a-time picker on iOS 17+.
5. **Safe areas**: the notch or Dynamic Island, and the home indicator.
   - Affected: the bottom upload bar, the tabs and the + button.
   - The emulator has a status bar and gesture bar only.
6. **Fonts and truncation.** SF Pro is narrower than Roboto, so lines that fit
   here may fit with room on the iPhone. The reverse is not guaranteed for the
   bold labels.

## Gates after the fixes

- lint 0, typecheck 0.
- Jest **1,422** passed, 106 suites. Round 2 added tests for Search,
  Trash, the gallery, the PDF view, audio, file names, the folder tabs and
  the avatar. Each was red first, or a planted break turned it red.
- bundle 0.
- Backups refreshed (scratchpad).
