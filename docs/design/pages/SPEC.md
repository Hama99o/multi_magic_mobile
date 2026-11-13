# Pages — files in and out of the phone, and the drive behind them

**Status: `IN PROGRESS`**: phase 1 is built, passes every gate, and ran on an
Android device (§7). **Outstanding:** `ours/` at 360, 411 and 800 dp (the run
was at 411 only), and the iPhone-only checks in §8, which no emulator here can
run.

His words, 2026-11-06: *"read the code and mm web api, also we see page app,
we will add page app in mobile"*, then *"make sure all feature as web we has
should be there all"*, then *"if we want to import from iphone or ios we
should able to have option to select space and we should able to select
whatever folder we want and import should work also and export also it should
be fast and clear as google drive"*, then *"smooth to use, not has problem."*

And how he actually uses it, from the supervising session: vlog clips and
photos from his iPhone, 200 MB to 2 GB each, into the space "Vloging", one
folder per day, fetched later from the laptop. **So phase 1 is the way IN.**
Browsing stays simple; parity with the web's drive is phased (§6).

**This reverses a rule.** This app had no record screens: wherever something
would "open a record" it composed a question for the assistant instead
(`docs/design/README.md`, the architectural decision). Pages is the first
exception, and it is his decision, made in the words above. The assistant is
still the app's home: Pages is a door in the profile menu (§2.1).

---

## §1 · Sources (Rule Zero), checked 2026-11-06 before any screen was drawn

| Reference | What we took | What we left |
|---|---|---|
| Google Drive, "Selecting destination" (`mobbin.com/flows/b12e46f5-3fc7-42bb-b844-f55417a81c1a`) | The share extension's sheet shows **Location** before anything is chosen, and it starts where the last upload went. "Save here" names the place. | Renaming the file in the sheet: a clip's camera name is what he searches for later. |
| Dropbox, "Adding content" (`mobbin.com/flows/0f9c59df-2862-42ba-94fb-91b1c61e64b7`) | "Choose a folder": the files as a **strip of thumbnails** at the top, folders below, **one full-width Upload button** at the bottom. | The folder search: his spaces are few and his folders are dates. |
| Dropbox, "Sharing a file" (`mobbin.com/flows/037b3348-12d0-4dee-b36a-68297fab896c`) | A row is a thumbnail, the name, and **one** muted line "size · modified". | The bottom tab bar: this app has one destination. |
| Upload progress screens (`mobbin.com/screens/c82c4ffa-b3ab-490b-8352-6a0eb6f62f01`, ElevenLabs; `…/ac7935a2-9097-490f-b2c0-07a830d1cd73`, Alta) | A per-file row with its own state, and a way to see the whole queue. | Blocking the screen while it uploads (CapCut's full-screen "Uploading… 18%"). |

**And one thing no reference has, which is his habit:** a folder per day. So
the first action inside any space is **"Today's folder (2026-11-06)"**, one tap:
created if missing, opened if it exists (`goToToday`, `app/pages/save.tsx`).

The reference images are not kept (the repo is public, `docs/design/README.md`
rule 2); the links above are the receipts.

---

## §2 · The screens

| Route | File | What it is |
|---|---|---|
| `/pages` | `app/pages/index.tsx` | Places (Recent, Starred, Shared with me, Trash) as a 2×2, then the spaces. One **Add** button bottom right. |
| `/pages/folder` | `app/pages/folder.tsx` | A space or a folder: folders first (the server does it, `FOLDERS_FIRST`), sort sheet, type chips, 25 a page. Add here uploads **here**. Long-press = item sheet. |
| `/pages/drive` | `app/pages/drive.tsx` | Recent / Starred / Trash / Search across every space, and Shared with me. Each row names its space. Trash: tap to restore. |
| `/pages/view` | `app/pages/view.tsx` | One page or file, by type (`src/screens/pages/viewerModes.ts`). |
| `/pages/save` | `app/pages/save.tsx` | **Save to Pages**: where the share sheet and the Add sheet land. |
| `/pages/uploads` | `app/pages/uploads.tsx` | The queue: bar, bytes, and why a row failed, in words. |

### 2.1 · The door is the profile menu, not the chat header

At 360 dp the chat header already holds the "Assistant" title (about 110 dp)
and five 48 dp targets (`app/chat.tsx`, the four doors and the avatar):
about 350 dp in a 328 dp row. A sixth would collide. So Pages is the first row
of the profile sheet (`profile-open-pages`, `ProfileSheet.tsx`). **The way in
that matters most does not need a door at all:** it is the phone's own share
sheet (§3).

---

## §3 · The way in

1. **Another app's share sheet.** Photos or Files → Share → MultiMagic.
   `expo-share-intent@8.0.1` (the SDK-57 line; 9.x needs SDK 58) adds an iOS
   share extension for up to 100 images, movies or files, and Android intent
   filters for one or many `*/*` (`app.json`). The extension opens the app with
   `multimagic://dataUrl=…`, which `app/+native-intent.tsx` sends to
   `/pages/save`; `ShareIntentBridge` puts the files in hand. Signed out, the
   files wait for sign-in rather than vanishing.
2. **Add → Photos and videos** (`pickMedia`, `src/screens/pages/addFiles.ts`):
   multi-select, and **the original file**:
   `preferredAssetRepresentationMode: Current` and
   `videoExportPreset: Passthrough`, so a 4K HEVC clip is not transcoded
   (minutes, and a worse file) before it is sent;
   `shouldDownloadFromNetwork: true`, so a clip kept in iCloud is fetched.
3. **Add → Files**, **Add → Camera.**

**Inside a folder, Add uploads there.** From the Pages home there is no folder
yet, so Add goes to the destination picker.

### 3.1 · The queue (`src/stores/uploads.store.ts`)

- Each file is **moved** into `Documents/pages-uploads/<id>/` (a rename, free
  for 2 GB), because a picker's cache can be emptied by the OS.
- The queue is persisted (AsyncStorage `mm-pages-uploads`) on every status
  change, and hydrated at launch (`app/_layout.tsx`), whether or not Pages is
  opened.
- The bytes travel in native code: `expo-file-system` `UploadTask`,
  multipart, field `node[attachment]` with `node[title]`, `node[kind]=file`,
  `node[parent_id]`, i.e. exactly what the web sends. **iOS: a background
  URLSession** (`sessionType: "background"`), so it continues with the phone
  locked or the app swiped away.
- 2 at a time; a dropped connection is retried 3 times by itself, then waits
  for **Retry**; every unfinished row has **Cancel**.
- **A relaunch checks before it re-sends.** iOS may finish a background
  upload while no JS is running. An item found mid-upload at launch is checked
  against its folder (same title, same bytes, newer than when it was queued);
  only if it is not there is it sent again. Without this, every interrupted
  2 GB clip would arrive twice.
- Refused before a byte is sent: over 2 GB (`MAX_ATTACHMENT_SIZE`).
  Refused by the server and said in words: quota (`storage_quota_exceeded`),
  signed out, a file that has gone.

### 3.2 · Two Android crashes in `expo-share-intent`, found on a device and patched

Found 2026-11-06 on the emulator by sharing a clip from the Files app into
MultiMagic. Both are in the library's `getFileInfo`
(`ExpoShareIntentModule.kt`), both killed the WHOLE app, and no Jest test could
have seen either, because both live in Kotlin:

1. **An empty cursor.** It reads the first row of the URI's metadata without
   checking there is one (`CursorIndexOutOfBoundsException: Index 0 requested,
   with a size of 0`). A provider that answers with no row (a share without a
   proper grant, here) crashed the app.
2. **A video read by raw path.** For `video/*` it turns the `content://` URI
   into `/storage/emulated/0/...` and opens that with `MediaMetadataRetriever`
   (`IllegalArgumentException: ... does not exist`). Under scoped storage the
   app can open the URI and not the path, so **every video shared from Files
   crashed the app.** And the JS side PREFERS that unreadable path over the URI,
   so even without the crash, the upload would have failed to read the file.

`patches/expo-share-intent+8.0.1.patch` (applied on every install by
`patch-package`, `postinstall` in `package.json`): a guarded cursor, a default
MIME type, video metadata read from the URI, metadata failures swallowed (they
are dimensions, not the file), and `filePath` reported only when the app can
read it, so the URI is used otherwise. The queue then **copies** the
`content://` file into its own folder (`adopt`, `uploads.store.ts`), awaited.

The iOS extension is different code and is not affected by this patch; it is
checked on his iPhone (§8).

---

## §4 · The way out

Long-press a file (or the viewer's download glyph) → **Share or save**: the file
is downloaded once per version into the cache (`downloadToCache`,
`src/api/pages.ts`) and handed to the system share sheet (`expo-sharing`). On
iOS that sheet **is** Save to Files, Save Video, AirDrop and every app; on
Android it is the chooser. One door, every destination.

The proxy URLs the server sends are **signed** blob URLs and load without the
Authorization header (measured, §7), so images, video streaming and downloads
take them directly.

---

## §5 · The viewer, by type (`modeFor`)

| What | How |
|---|---|
| page | its `content.html` in a WebView, the app's colours, read-only |
| image | `expo-image` (HEIC decodes on both platforms) |
| video, audio | `expo-video`, native controls, **streamed** (a 2 GB clip is not downloaded to be watched) |
| markdown, text | fetched and shown |
| PDF, Office | iOS: WKWebView renders them. **Android's WebView cannot**, so there the screen says to open it through Share; claiming otherwise would be a blank page |
| anything else | a card with its size and Share or save |

---

## §6 · Parity with the web's drive, phased

The web (`multi_magic/app/javascript/pages/page_app/drive/menus.ts`) offers:
open, download, share with people, copy link, rename, move, make a copy, copy
to, star, show location, replace file, details, trash, restore, delete
forever, new folder, new page, upload files, upload folder, import zip, link
notes, versions, share links, storage, zip export.

| Phase | What | State |
|---|---|---|
| 1 | Share-sheet import, multi-select, destination picker with today's folder, persistent background queue, browse, search, sort, type filter, viewer, trash restore, export via share sheet | **built** |
| 1.1 | **Rule Zero done 2026-11-06:** Google Photos (`mobbin.com/screens/0f6bb976-efc8-4094-9d80-578e456c6f44`) is 3 square columns, 2 dp gaps, duration on the tile; Snapchat's camera roll (`…/0573366a-c36b-485a-9832-567a4f337ac5`) puts it bottom-left on a dark tint; CapCut (`…/43d12104-5be2-4862-b623-862eb5760f1b`) bottom-right. **Decided:** a list/grid toggle in the folder header, the grid 3 columns of square `thumbnail_url` tiles, folders and non-media files as glyph tiles with the name under them. **Durations in the folder grid need the server:** `node_serializer.rb` sends no `duration` (ActiveStorage keeps it in blob metadata only when the video analyzer ran), so that is a `multi_magic` change and his "oui"; the SAVE SHEET can show them, because the picker and the share extension both hand the duration over for local files. From the supervisor's read of the device screenshots (2026-11-06): a **grid view** (2–3 columns) for photo/video folders, Google Photos/Drive style; a **video frame + duration** in the save sheet's strip (today a glyph; images already show); an **edge fade** on the type chips (they clip "Documents" at 411 dp); a **progress pill** on the Pages header while uploads run (today: a count badge on the upload glyph and the banner on home and folder). Rule Zero applies to the grid. | not started |
| 2 | Rename, move, copy, make a copy, star, trash, delete forever (opened and cancelled in flows), replace file, details, versions, multi-select actions | not started |
| 3 | Page editing (TipTap-compatible, `@10play/tentap-editor`), markdown editing | not started |
| 4 | Share with people, share links with expiry, redeem, note links | not started |
| 5 | Zip export / import with live progress (`TransferChannel`), storage view | not started |
| follow-up | **Android uploads that survive the app being swiped away** (WorkManager or a foreground service). Today an Android upload runs while the process lives and is re-queued at the next launch | not started |
| follow-up | Resumable uploads (server side: tus or chunked direct upload). Today a retry restarts the file from zero (`multi_magic` `PAGES_UX_2026.md` §10) | needs a server change, his "oui" |

What a phone cannot do the web's way: **upload a folder** (iOS has no folder
picker; a zip import covers it), keyboard shortcuts, drag and drop.

---

## §7 · Evidence so far (2026-11-06)

**Against the local backend, as the QA account** (`qa/capture_fixtures.py
pages_`, fixtures in `src/api/__tests__/fixtures/pages_*.json`):
- A multipart upload in exactly the `UploadTask` shape: **201**. A 3 MB
  binary and a PNG downloaded back **without auth**: **sha256 identical**.
- `attachment_url` is relative and `file_size` exact; `content` is `{ html }`;
  `ancestors` is the breadcrumb; Recent rows carry `space`; `kind=folder` filters.

**A long upload through production's proxy, measured locally.** Production
runs kamal-proxy with `response_timeout: 300` (`multi_magic`
`config/deploy.yml`) and Kamal 2.11's defaults: requests buffered, no
`max_request_body`. The fear was that a 1–2 GB clip over a phone uplink, more
than 300 s, would be cut. `basecamp/kamal-proxy:v0.9.2` (Kamal 2.11's
minimum) was put in front of the local API with exactly those flags, and a
**400 MB file was sent at 1 MB/s: 407 s, created, and downloaded back
sha256-identical.** The 300 s is the time the APP gets to answer once the proxy
has the whole body, not the time the phone gets to send it. Not measured: a
real 2 GB body (the box has 20 GB of disk free) and the VPS's own disk
headroom under one. `www.multimagics.com`, the release `EXPO_PUBLIC_API_URL`,
resolves straight to the VPS with no CDN headers, so no CDN body cap applies.

**On a device (`qa_phone`, Android 35, dev build, 411 dp):** `23-pages` PASS
(browse, filter, sort, viewer, Recent, Trash; `qa/evidence/23-pages/`), and the
share-in round trip by hand: a 20 MB clip shared from the Files app → Save to
Pages → Today's folder → Upload → **sha256-identical on the server, one copy,
one date folder**; a second share reopened on the last place
(`qa/evidence/24-pages-share-in/`). That run found §3.2's two library crashes
and a queue bug (a `content://` move that copies, then throws), all fixed
before the pass.

**Expo Go:** loads, guarded by `src/lib/shareIntent.tsx` (no share sheet in
Expo Go; foreground uploads). **But his iPhone's Expo Go is SDK 58 and this
app is SDK 57** (measured on his phone, 2026-11-06), so Expo Go waits for the
SDK 58 upgrade.

**Gates:** lint, typecheck, Jest (1351 tests, 99 suites), `npm run bundle`,
`qa/board_check.py`, `qa/flow_lint.py`.

**Planted and seen red, then restored:** an unknown node kind failing a whole
folder (`pages.test.ts`); a relaunch that re-sends blindly
(`uploads.store.test.ts`); an English literal on the uploads screen
(`screens.render.test.tsx`, both sweeps).

---

## §8 · What only his iPhone can check (for the release candidate)

**The short, ordered test for the next TestFlight is `IPHONE_CHECKLIST.md`**
(2026-11-07, after the deep QA in `QA_DEEP.md`). The list below is the
original long form.

No emulator here runs iOS. Each of these is a claim the code makes and
nothing here has seen:

1. **Photos → select 3 clips (one over 1 GB) → Share → MultiMagic.** The app
   opens on "Save to Pages" with the 3 thumbnails; the location is the last
   one used.
2. **"Today's folder"** in Vloging: created once; tapped again on a later
   share, it opens the same folder rather than making a second.
3. **Lock the phone during the 1 GB upload**, wait, unlock: it finished, or it
   is still going. Then **swipe the app away mid-upload** and reopen: the row
   says "Checking whether it arrived…", then Saved, and the folder holds
   **one** copy, not two.
4. **The clip on the laptop** (web Pages): it plays, it is HEVC/original size
   (not a transcoded smaller file), its size matches the phone's.
5. **Airplane mode mid-upload**, then back: "Connection lost. Retrying…",
   then it completes.
6. **A PDF and a Word file** open inline in the viewer.
7. **Share or save** on a clip → Save Video puts it in Photos; on a PDF →
   Save to Files.
8. **A clip optimised to iCloud** (not on the phone) picked from Add → Photos:
   it is fetched and uploads, rather than failing.

And one cost: the share extension is a **second target** with its own bundle id
and App Group, so the iOS build needs a provisioning profile for it
(the `testflight` profile in `eas.json` uses `credentialsSource: remote`; the
App Group `group.com.multimagics.mobile` is registered by hand on
developer.apple.com, because the App Store Connect API cannot register app
groups (as reported by the TestFlight attempt of 2026-11-07, not seen in this session).

## Query keys (React Query audit, 2026-11-13)

Every key comes from `pagesKeys` in `src/api/keys.ts`, never a literal
(`docs/DATA_LAYER.md`; the guard is lint rule `api-in-effect`).

| Factory member | Key |
|---|---|
| `pagesKeys.all` | `["pages"]` |
| `pagesKeys.spaces()` | `["pages", "spaces"]` |
| `pagesKeys.spacesFor()` | `["pages", "spaces", purpose]` |
| `pagesKeys.shared()` | `["pages", "shared"]` |
| `pagesKeys.children()` | `["pages", "children", spaceId, parentId, sortBy, sortDir, type]` |
| `pagesKeys.node()` | `["pages", "node", spaceId, nodeId]` |
| `pagesKeys.drive()` | `["pages", "drive", view, query]` |
| `pagesKeys.driveSearch()` | `["pages", "drive", "search", query, type]` |
| `pagesKeys.folderSearch()` | `["pages", "folder-search", query]` |
| `pagesKeys.folders()` | `["pages", "folders", spaceId, parentId]` |
| `pagesKeys.moveFolders()` | `["pages", "folders", "move", spaceId, parentId]` |
| `pagesKeys.moveStart()` | `["pages", "moveStart", nodeId]` |
| `pagesKeys.gallery()` | `["pages", "gallery", spaceId, parentId]` |
| `pagesKeys.text()` | `["pages", "text", uri]` |

Writes: src/screens/pages/usePageMutations.ts. star, rename, trash (with Undo), restore, delete for ever, empty the trash and move are optimistic in EVERY cached list a node sits in; a new folder is not.

