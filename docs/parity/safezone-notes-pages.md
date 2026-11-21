# Parity re-audit: SafeZone, Notes, Pages (2026-11-20)

Read-only. No code, git writes, servers or emulator.

**Baselines**
- Mobile: `~/Apps/Personal/mm-parity-audit` = origin/main `4dd5e8f` (release 1.3.0). Every mobile file:line below refers to this tree.
- Web and server: **origin/master `f66f85ab`**, read through `git archive` into scratchpad.
  - The local `~/Apps/Personal/multi_magic` checkout is **51 commits behind origin/master** and has local edits. I did not pull.
  - origin/master adds things that matter here: Notes archive (routes, tab and card menu), the lock saved on the note, the card's reminder badge, the `?masked=1` SafeZone list, and the server reading a file's type from its bytes.
  - Web paths below are relative to `app/javascript/pages/`, with line numbers from origin/master.
- No data from the owner's database was read.

**Legend**
- **HAS**: on mobile, with the file:line.
- **PARTIAL**: on mobile, but incomplete.
- **MISSING**: not on mobile.
- **UNMERGED**: on a remote branch that is not in main.
- **DEVIATION**: mobile differs from the web on purpose, and a doc records the decision.
- **N/A**: desktop-only on the web; there is nothing to port.

## Unmerged remote branches (mobile repo)

I compared each branch with `git log origin/main..<branch>` and `git cherry`.

| Branch | Unmerged? | What it holds |
|---|---|---|
| origin/fix/safezone-pin-reach | merged | none |
| origin/fix/safezone-forgot-above-pad | merged | none |
| origin/1.1.1 (Pages multi-download) | merged | `NodeCollection.tsx:268-273` `pages-select-download` is on main |
| origin/chore/react-query-audit | all but `abf3444` are patch-equal on main (`git cherry -`) | nothing user-facing |
| **origin/fix/media-kind-by-content** | **3 commits unmerged** (`4419d12`, `bd207bc`, `ced4168`, dated 2026-11-12) | Pages: decide the media kind from the type and the bytes, never from the name. Share sends the bytes' type and a name that has its extension (`src/lib/mediaKind.ts`, `probeMimeType.ts`, `ItemSheet.tsx`, `downloadMany.ts`, `viewerModes.ts`). **This is the fix for the owner's iOS bug** "a video titled without .mp4 cannot be saved to Photos". On main, `downloadToCache` still names the file `pages-<id>-<stamp>-<title>` with no extension taken from the MIME type (`src/api/pages.ts:417-420`, `safeFileName` at :407-410). |
| origin/feat/safezone-qa-capture(-v2) | 1 commit each (`400e51c` / `a2b18c2`) | QA-only switch that lets screenshots past FLAG_SECURE. Not a user feature, so not a parity item. |

---

# 1. SafeZone

## Summary

| Status | Count |
|---|---|
| HAS | 24 |
| PARTIAL | 3 |
| MISSING | 1 |
| DEVIATION | 1 |
| **Web items** | **29** |

- **Every SafeZone item of the 11-16 audit is FIXED.**
- What is left is list-row detail.
- One hidden-criteria defect: layout animations on recycled list cells.

## Inventory

**Web files** (prefix `safezone/` unless noted): `Layout.tsx`, `passwords/*`, `payment-cards/*`, `identities/*`, `security/Index.tsx`, `components/SafezoneGate.tsx`, `components/PinPad.tsx`, `pinLock.ts`, `profile/components/SafezonePinSettings.tsx`.

**Mobile files**: `app/safezone/{index,item,edit,settings}.tsx` and `src/screens/safezone/*`.

| # | Web feature (file:line) | Mobile |
|---|---|---|
| 1 | Tabs: Passwords, Cards, IDs (`Layout.tsx:9-14`) | HAS `app/safezone/index.tsx:121-141` |
| 2 | Security tab: totals, weak list, reused groups (`security/Index.tsx:86-178`) | HAS `index.tsx:142-154`, `HealthPanel.tsx:68-110`. A tap on an entry opens it (`HealthPanel.tsx:25`), which the web does not do. |
| 3 | Search per kind, debounced 400 ms (`passwords/Index.tsx:58-64`, `payment-cards/Index.tsx:58-64`, `identities/Index.tsx:58-64`) | HAS `index.tsx:91-94,166-185` |
| 4 | Add button (`passwords/Index.tsx:51-54`) | HAS: FAB `index.tsx:203-211` |
| 5 | Loading skeleton, LoadError with retry, empty state (`passwords/Index.tsx:67-79`) | HAS `index.tsx:186-195,224-245` |
| 6 | Password row: site initial, never a remote favicon (`PasswordCard.tsx:147-155`) | HAS `Tile.tsx`, `display.ts:51-59` |
| 7 | Password strength badge weak, fair or strong (`PasswordCard.tsx:111-117,162-168`) | **PARTIAL**: only "weak", from the server's `password_weak` (`index.tsx:290-294`). No fair or strong. |
| 8 | Password row shows the updated date (`PasswordCard.tsx:179-182`) | **PARTIAL**: shown on the item screen only (`item.tsx:245-248`), not on the row |
| 9 | Card row: masked number (`PaymentCardItem.tsx:38`) | HAS `display.ts:22-25` |
| 10 | Card row: credit or debit, expiry, and an "Expired" or "Expires soon" badge (`PaymentCardItem.tsx:15-25,60-69`) | **MISSING** on the row. `cardType` and `expiry` are parsed (`src/api/safezone.ts:257`) but `rowSubtitle` shows only `•••• 1234` (`display.ts:22-25`). |
| 11 | Identity row: type label and expiry month (`IdentityItem.tsx:35-50`) | **PARTIAL**: the type label and an "Expired" badge are there (`index.tsx:221,285-289`). The expiry date is not. The number is masked on purpose (SECURITY.md §0). |
| 12 | View a password: copy username, email or password; reveal the password (`PasswordDrawer.tsx:249-283`) | HAS `item.tsx:143-176,383-389`. Stricter than the web: a reveal hides itself after 20 s, and a copied secret is cleared after 30 s. |
| 13 | Open the site link (`PasswordDrawer.tsx:285-298`) | HAS `item.tsx:378` |
| 14 | Note and Updated date (`PasswordDrawer.tsx:300-304`) | HAS `item.tsx:245-248`, plus the generic fields |
| 15 | Card view: copy number, CVV, code; reveal CVV; expiry (`PaymentCardDrawer.tsx:241-284`) | HAS (generic fields in `item.tsx`) |
| 16 | Identity view: copy the number; issued and expiry dates (`IdentityDrawer.tsx:237-266`) | HAS |
| 17 | Password form: title*, username, email, password, Generate, reveal, link, note (`PasswordDrawer.tsx:331-400`, generator at :17-35) | HAS `forms.ts:39-44`, `edit.tsx:163-167` |
| 18 | Card form: name*, credit/debit select, number, CVV, expiry, code, note (`PaymentCardDrawer.tsx:325-400`) | HAS `forms.ts:47-53`. The expiry placeholder is translated (`edit.tsx:243`). |
| 19 | Identity form: type select, document number*, issued and expires date inputs, note (`IdentityDrawer.tsx:301-355`) | HAS `forms.ts:56-60`, picked on the date wheels (`edit.tsx:284`) |
| 20 | Delete, with a confirm (`PasswordDrawer.tsx:188-192,306-320`, the same in the other drawers) | HAS `item.tsx:180-205` (`Alert`, names the item, no undo) |
| 21 | PIN gate: pad, wrong PIN with attempts left, lockout, "server-enforced" line (`SafezoneGate.tsx:251-310`) | HAS `SafeZoneGate.tsx:169-330` |
| 22 | PIN status fails closed, with a retry (`SafezoneGate.tsx:286`) | HAS `SafeZoneGate.tsx:158-164` |
| 23 | Sliding unlock: renew at once, then every 60 s; relock on a 403 (`SafezoneGate.tsx:221-249`) | HAS `SafeZoneGate.tsx` (header :6-20) |
| 24 | No PIN set: the vault opens directly (`SafezoneGate.tsx:287`) | **DEVIATION**: the phone requires a PIN (`docs/design/safezone/SECURITY.md:63`) |
| 25 | Turn the PIN on: account password, PIN, confirm (`SafezonePinSettings.tsx:213-218`) | HAS `SetUpPin`, `SafeZoneGate.tsx:336-392` |
| 26 | Change the PIN: password, emailed code, new PIN (`SafezonePinSettings.tsx:227-262`, `pin.api.ts:401-412`) | HAS `app/safezone/settings.tsx:333-352`, `PinForms.tsx:68-147` |
| 27 | Turn the PIN off: password (`SafezonePinSettings.tsx:220-225`) | HAS `PinForms.tsx:151-200` |
| 28 | Error mapping: invalid password, format, mismatch, code (`SafezonePinSettings.tsx:43-48`) | HAS `PinForms.tsx` `refusalText`, `SafeZoneGate.tsx:363-366` |
| 29 | Forgot PIN (on the web, the same change flow from the profile) | HAS from the lock screen, `SafeZoneGate.tsx:179-236` |

**Mobile only**: "Lock now" (`index.tsx:68-79`), FLAG_SECURE with a no-capture warning, the app-switcher cover, and clipboard expiry.

## 11-16 audit items (SafeZone)

| Item | Verdict |
|---|---|
| Owner #1: back to the app grid (`safezone/index.tsx:33`) | FIXED: `AppHeader app="safezone"` (`index.tsx:32`) |
| P1 #7: forgot PIN said "Change it on the web" | FIXED: in-app emailed-code flow, `SafeZoneGate.tsx:179-236` + `PinForms.tsx:68` |
| P1 #26: no delete | FIXED: `item.tsx:180-205`, `useRemoveItem.ts` |
| P1 #27: no change or turn-off PIN | FIXED: `app/safezone/settings.tsx`, `PinForms.tsx` |
| P1 #28: no password health | FIXED: `HealthPanel.tsx`, `index.tsx:142-154` |
| P2: pull to refresh | FIXED: `index.tsx:199` |
| P2: identity dates typed by hand | FIXED: date wheels (`forms.ts:27`, `edit.tsx:284`) |
| P2: MM/YY and YYYY-MM-DD placeholders untranslated | FIXED: `edit.tsx:243` `safezone.form.expiryPlaceholder` |
| P2: no Updated date | FIXED: `item.tsx:245-248` |
| P2: copying a choice copies its raw value | FIXED: `item.tsx:166` copies the shown words |
| P2: raw i18n key in an identity title | FIXED: `item.tsx:208` `choiceLabel` |
| P2: tile initials in dark mode | UNPROVEN: needs a device |
| MISSING_FEATURES #4: biometric unlock, password autofill, native clipboard expiry | STILL OPEN: there is no `expo-local-authentication` in package.json, and only `modules/sensitive-clipboard` exists. Biometrics needs the owner's decision (it reverses "the PIN is never stored"). |

## Hidden-criteria defect, not parity

`app/safezone/index.tsx:256` wraps every FlatList row in `Animated.View entering={FadeInDown.delay(...)}`, and `:275` adds a pressed `transform: scale`.
- This breaks the owner's 2026-11-17 rule: no Reanimated layout or transform animations on the cells of a recycled list.
- Notes uses a ScrollView and Pages rows have no `entering`, so only SafeZone is affected.

## Missing or partial, with endpoints

The server already sends everything these need, so there are no new endpoints.
- #10 card row type, expiry and badges: `GET /api/v1/safezone_app/payment_cards?masked=1` already returns `card_type` and `expiry_date`. Display only.
- #7 fair/strong strength: the masked list returns only `password_weak`.
  - The web computes the strength from the plaintext, which the phone never holds in a list.
  - Matching the web needs a `password_strength` field in the masked view (server change), or the phone keeps showing weak only.
- #8 and #11 dates on the rows: `updated_at` and `expires_at` are already in the rows.

**Estimate: about 1 dev-day** (rows, removing the cell animation, tests, device shots). Biometrics and autofill are a separate 3-5 days, native build, and the owner's call.

---

# 2. Notes

## Summary

| Status | Count |
|---|---|
| HAS | 28 |
| PARTIAL | 5 |
| MISSING | 6 |
| N/A | 1 (not counted) |
| **Web items** | **39** |

Mobile has more than the web in three places:
- reminders (set, list view, local notification);
- archive from inside the note;
- conflict handling with drafts.

## Inventory

**Web files** (prefix `notes/`): `Index.tsx`, `Show.tsx`, `components/{NoteCard,TagTabs,ManageLabelsModal,NoteTagsModal,InviteUserModal,NoteEditor}.tsx`, `components/window/*`, `api/notes.api.ts`.

**Mobile files**: `app/notes/{index,edit,note}.tsx`, `src/screens/notes/*`, `src/api/notes.ts`, `src/api/noteTags.ts`.

| # | Web feature (file:line) | Mobile |
|---|---|---|
| 1 | Masonry grid / list toggle (`Index.tsx:322-330,466-500`) | HAS `app/notes/index.tsx:146-160,249` (kept per user) |
| 2 | Search, debounced (`Index.tsx:295`) | HAS `index.tsx:78-94,237-246` |
| 3 | Reload button (`Index.tsx:316`) | HAS: pull to refresh, `index.tsx:288` |
| 4 | Infinite scroll (`Index.tsx:164-186`) | HAS `index.tsx:291-293` |
| 5 | New note, with the current label (`Index.tsx:206-212`) | HAS `index.tsx:139,313-327` (plus "new checklist") |
| 6 | Tab: All notes (`TagTabs.tsx:263-270`) | HAS: drawer, `labels.tsx:73` |
| 7 | Tab: Pinned only (`TagTabs.tsx:283-288`, `?pinned=true`) | **PARTIAL**: pinned notes are a section on top (`index.tsx:106-107,307`), but there is no pinned-only filter |
| 8 | Tab: Archive (`TagTabs.tsx` archive button; `notes.api.ts` `archives`) | HAS `labels.tsx:81`, `src/api/notes.ts:139` |
| 9 | Tab: Trash (`TagTabs.tsx:301-306`) | HAS `labels.tsx:82` |
| 10 | Tab per label (`TagTabs.tsx:316-385`) | HAS `labels.tsx:78`, filter chip `index.tsx:264-270` |
| 11 | Reorder labels by dragging (`TagTabs.tsx:142-211`, `tagsApi.reorder` `notes.api.ts:176`) | **MISSING** |
| 12 | Rename a label (double-click the tab, or the modal) (`TagTabs.tsx:173`, `ManageLabelsModal.tsx:44`) | HAS `labels.tsx:123,160-168` (kept without Return) |
| 13 | Create and delete labels (`ManageLabelsModal.tsx:34,171`) | HAS `labels.tsx:97-170` |
| 14 | Label colour (`ManageLabelsModal.tsx:34-62,152`) | **MISSING**: `noteTags.ts:26-33` sends `name` only |
| 15 | Card: pin toggle (`NoteCard.tsx:113-115`) | HAS: selection bar `index.tsx:206-212`, editor `edit.tsx:639` |
| 16 | Card menu: Duplicate (`NoteCard.tsx:236-241`) | **PARTIAL**: inside the note only (`edit.tsx:554`, "Make a copy"), not from the grid or the selection |
| 17 | Card menu: Manage labels (`NoteCard.tsx:246-251`) | **PARTIAL**: inside the note only (`edit.tsx` `note-more-labels`) |
| 18 | Card menu: Colour (`NoteCard.tsx:255-257`, `Index.tsx:255`) | HAS: selection `index.tsx:214`, `NoteColorPicker.tsx` |
| 19 | Card menu: Invite (owner/admin) (`NoteCard.tsx:274-279`) | HAS inside the note (`edit.tsx:675`, `ShareSheet.tsx`) |
| 20 | Card menu: Archive / Unarchive (owner/admin) (`NoteCard.tsx:285-290`) | HAS: selection `index.tsx:215-219`, editor `edit.tsx:685-701` |
| 21 | Card menu: Delete, with a confirm (`NoteCard.tsx:295`, `Index.tsx:517`) | HAS `index.tsx:226,400-416` |
| 22 | Trash card: Restore, Delete forever (`NoteCard.tsx:183-205`, `Index.tsx:525`) | HAS: selection `index.tsx:221-225,380-394` |
| 23 | Card: reminder badge (`NoteCard.tsx:311`) | HAS `index.tsx:480` (the phone sets reminders) |
| 24 | Card: updated date (`NoteCard.tsx`, bottom) | **PARTIAL**: inside the note only (`edit.tsx` `note-edit-updated`, `note-more-edited`) |
| 25 | Empty states for list, pinned, archive, trash (`Index.tsx:440-445`) | HAS `index.tsx:297-303` |
| 26 | Editor autosave and "Saving…" (`Show.tsx:131-160,253`) | HAS `edit.tsx:594-622`, plus drafts and a 3-way conflict sheet (`edit.tsx:312-324`) |
| 27 | Lock / unlock, saved on the note (`Show.tsx:272-286`) | HAS `edit.tsx:651`, `src/api/notes.ts:183` |
| 28 | Copy the content (`Show.tsx:172,292-298`) | HAS `edit.tsx:561,629` |
| 29 | A trashed note open: Restore and Delete forever in its header (`Show.tsx:313-325`) | **MISSING**: `app/notes/note.tsx` (read view) has neither; only the grid selection does |
| 30 | More menu: labels, invite, delete (`Show.tsx:338-373`) | HAS `edit.tsx` more sheet (`note-more-*`) and the share button |
| 31 | Viewer role is read-only (`Show.tsx:184,398,449`) | HAS `edit.tsx` `note-edit-viewer-chip` |
| 32 | "Shared with" avatars (`Show.tsx:426`) | HAS `edit.tsx` `note-edit-shared` |
| 33 | Note colour as the page background; tag chips with colours (`Show.tsx:229,385,402-409`) | **PARTIAL**: the background is there (`pageFill`); chips have no colours (see #14) |
| 34 | "Linked in Pages", with links to the nodes (`Show.tsx:453-490`, `notes.api.ts:142`) | **MISSING** |
| 35 | Rich editor (tiptop) with image upload (`NoteEditor.tsx:48-88`) | HAS: engine B and Insert > Image (`edit.tsx:444-485`). Notes over 96 KB are read-only (engine limit, `editSession.ts`). |
| 36 | Dictation button in the editor (`NoteEditor.tsx:139` `SpeechButton`) | **MISSING** (the OS keyboard's microphone covers it in part) |
| 37 | Invite by email and role; change role; remove (`InviteUserModal.tsx:23-48,105-160`) | HAS `ShareSheet.tsx:41-151`, `src/api/notes.ts:247-262` |
| 38 | "Send a reminder" to a collaborator (`InviteUserModal.tsx:41-42,148-150`) | **MISSING** |
| 39 | Note labels: toggle a label, create and assign (`NoteTagsModal.tsx`) | HAS `noteTags.ts:41-48` |
| — | Desktop floating note windows and dock (`components/window/*`) | N/A |

## 11-16 audit items (Notes)

| Item | Verdict |
|---|---|
| P0 #5: Insert > Image was a dead button | FIXED: `edit.tsx:444-485` (picker, then `POST /api/v1/images`, then the image node) |
| P1 #9: "edit it on the web" for notes over 96 KB | FIXED: wording is now "too long to edit on the phone" (en.ts `notes.edit.tooLong`) |
| P1 #10: empty state "Notes you write on the web" | FIXED: "No notes yet. Tap + to write your first one." |
| P1 #23: sharing and collaborators | FIXED: `ShareSheet.tsx`. The web's "send reminder" (#38) is still missing. |
| P2: labels have no colour or order | STILL OPEN (#11, #14) |
| P2: label rename lost without Return | FIXED: `labels.tsx:164` |
| P2: a new note doesn't take the current label filter | FIXED: `index.tsx:139` |
| P2: no unarchive in the editor | FIXED: `edit.tsx:685-693` |
| P2: note.tsx lacks copy, restore and delete forever | STILL OPEN for the read view (#29). Copy is in `edit.tsx`. |
| P2: no "Linked in Pages" | STILL OPEN (#34) |
| P2: no word count | STILL OPEN. The web has none either (not in `Show.tsx` or `NoteEditor.tsx`), so it is not a parity gap. |
| P2: raw NE-ENGINE codes shown to users | KEPT ON PURPOSE: `edit.tsx:741-743` comment says "a code the owner can screenshot (2026-11-15)" |
| P2: conflict text says "the web" | FIXED: "edited on another device", "Keep the other" (en.ts conflict keys) |
| MISSING_FEATURES: long notes over 96 KB (engine B), autocorrect inside code, server reminder delivery | STILL OPEN (engine-side or server-side; not web parity) |

## Missing, with endpoints

All of these routes exist on origin/master.

| Gap | Endpoint |
|---|---|
| #11 reorder labels | `PUT /api/v1/note_app/tags/:id` with the ordered ids (see `notes.api.ts:176-180`) |
| #14 label colour | `POST` / `PUT /api/v1/note_app/tags[/:id] {tag:{name,color}}` |
| #34 Linked in Pages | `GET /api/v1/note_app/notes/:id/note_links` |
| #38 send a reminder to a collaborator | `POST /api/v1/note_app/notes/:note_id/send_reminder {user_id}` |
| #29 restore or delete forever from the read view | `PUT .../notes/:id/restore`, `DELETE .../notes/:id/destroy_permanently` (already in `src/api/notes.ts:227-234`) |
| #7 pinned-only filter | `GET .../notes?pinned=true` |
| #16, #17 grid-level duplicate and labels | existing endpoints; UI only |
| #36 dictation | the app's speech API (`src/api/speech.ts` is used by the assistant); check which transcription route that file uses |

**Estimate: about 2.5 dev-days**

| Work | Days |
|---|---|
| Label colour and reorder | 1 |
| Linked in Pages | 0.5 |
| Send reminder | 0.25 |
| Read-view restore and purge, grid duplicate and labels, pinned filter | 0.5 |
| Tests and QA | 0.25 |

Dictation adds 1 day if wanted.

---

# 3. Pages

## Summary

| Status | Count |
|---|---|
| HAS | 35 |
| PARTIAL | 7 |
| MISSING | 15 |
| **Web items** | **57** |

N/A, not counted: drag and drop, keyboard shortcuts, sidebar collapse.

## Inventory

**Web files** (prefix `page_app/`): `drive/Drive.tsx`, `drive/menus.ts`, `drive/lib.ts`, `drive/components/*`, `components/{ShareDialog,SpaceFormPanel,MoveNodeDialog,LinkNotesDialog,NodeViewer,PageEditor,PdfPreview,ExcelPreview,TransferProgressDialog}.tsx`, `api/page_app.api.ts`, `api/storage.api.ts`.

**Mobile files**: `app/pages/{index,folder,drive,view,save,uploads}.tsx`, `src/screens/pages/**`, `src/api/pages.ts`, `src/api/pageShares.ts`.

### Places and spaces

| # | Web feature (file:line) | Mobile |
|---|---|---|
| 1 | Home: spaces and recent files (`HomeView.tsx:31-98`) | HAS: Home and Files tabs, `app/pages/index.tsx:206-260` |
| 2 | Recent (`Sidebar.tsx:41`) | HAS: Home tab = recent files (`index.tsx:211`) |
| 3 | Starred (`Sidebar.tsx:42`) | HAS: tab |
| 4 | Shared with me, at space and node level (`Sidebar.tsx:43`, `Drive.tsx:760`) | HAS `index.tsx:267-275` |
| 5 | Trash (`Sidebar.tsx:44`) | HAS `TrashView.tsx` via the ⋯ menu (`index.tsx:345`) |
| 6 | Storage: used of quota, by app, what the trash holds, largest files (`StorageView.tsx:50-121`, `Sidebar.tsx:106-122`) | **MISSING** |
| 7 | Search across spaces, with a type filter (`Toolbar.tsx:94`, `lib.ts:18-36`) | HAS `SearchView.tsx:145-166`, plus date and owner filters |
| 8 | Breadcrumb path; every crumb taps through (`Toolbar.tsx:148-156`, `Drive.tsx:644`) | **PARTIAL**: the path is plain text (`folder.tsx:126`) |
| 9 | New space: title, icon, colour, description (`SpaceFormPanel.tsx`) | HAS `SpaceForm.tsx`, `index.tsx:255,301`, and from the save picker (`save.tsx:186,358`) |
| 10 | Edit space, owner only (`Drive.tsx:495`) | HAS `index.tsx:46-48,310` |
| 11 | Share space, owner only (`Drive.tsx:496`) | HAS `index.tsx:311`, `ShareSheet.tsx` |
| 12 | Export a space as ZIP (`Drive.tsx:498-503`, `TransferProgressDialog.tsx`) | **MISSING** |
| 13 | Delete space, owner only (`Drive.tsx:513-525`) | HAS `index.tsx:141-147,312` |
| 14 | Sort spaces (newest first by default) | HAS `index.tsx:175,316-340` (`created_at desc`) |

### Folder toolbar and selection

| # | Web feature (file:line) | Mobile |
|---|---|---|
| 15 | Sort by name, modified, created or size, asc/desc, remembered (`Toolbar.tsx:281-311`, `Drive.tsx:110`) | HAS `ui.tsx:164-172,273`, type too (`api/pages.ts:39`) |
| 16 | Grid / list (`Toolbar.tsx:359-368`) | HAS `ui.tsx:140-144,287` |
| 17 | Type filter: All, Folders, Pages, Images, PDFs, Docs, Video, Audio, Archives (`lib.ts:18-29`) | **PARTIAL**: no "Pages" chip (`src/api/pages.ts:42`, `filters.ts`) |
| 18 | Select all (`Toolbar.tsx:431`) | **MISSING** |
| 19 | Selection bar: download, move, trash, star (`Toolbar.tsx:421-472`) | HAS `NodeCollection.tsx:268-287` (multi-download from 1.1.1, merged) |
| 20 | Empty, filtered-empty and no-results states (`States.tsx:50-93`) | HAS `folder.tsx:197` and the other views |

### "New" menu (`menus.ts:131-145`)

| # | Web feature (file:line) | Mobile |
|---|---|---|
| 21 | New folder | HAS `sheets.tsx:131` |
| 22 | New page (rich text) | **MISSING**: `pagesApi` creates only `kind:"folder"` (`src/api/pages.ts:326-327`) |
| 23 | Upload files | HAS `sheets.tsx:132-134` (media, files, plus a camera the web doesn't have) |
| 24 | Upload a folder | **MISSING** (low value on a phone) |
| 25 | Import ZIP | **MISSING** |
| 26 | Link notes (`LinkNotesDialog.tsx:83-257`) | **MISSING** |

### Item menu (`menus.ts:75-127`)

| # | Web feature (file:line) | Mobile |
|---|---|---|
| 27 | Open / preview | HAS |
| 28 | Download a file; download a folder as ZIP (`menus.ts:95-100`) | **PARTIAL**: files yes (`sheets.tsx:181`); folder ZIP missing |
| 29 | Share with people (node level) | HAS `sheets.tsx:183` |
| 30 | Copy link (`menus.ts:104`) | **MISSING**. ShareSheet copies a share link (`ShareSheet.tsx:146-158`), but there is no plain "copy link". |
| 31 | Rename, needs write (`menus.ts:107`) | HAS `sheets.tsx:192`; the extension stays outside the selection (`ItemSheet.tsx:127-170`) |
| 32 | Move to, needs canMove (`menus.ts:108`, `MoveNodeDialog.tsx`) | HAS `sheets.tsx:193,355-423`, paged (`:387-391`) |
| 33 | Make a copy (`menus.ts:109`) | **MISSING** |
| 34 | Copy to another place (`menus.ts:110`) | **MISSING** |
| 35 | Star / unstar (`menus.ts:111-117`) | HAS `sheets.tsx:189` |
| 36 | Show location, in drive-wide views (`menus.ts:120`) | **MISSING** |
| 37 | Replace the file with a new version (`menus.ts:121`) | **MISSING** |
| 38 | Details: type, size, contains, location, owner, modified, created, deleted at, "manage access" (`DetailsPanel.tsx:84-108`) | **PARTIAL**: `sheets.tsx:247` has all but "deleted at" and "manage access" |
| 39 | Versions: list, download, restore, delete (`VersionsSection.tsx:43-121`) | **MISSING** |
| 40 | Move to trash, needs canDelete (`menus.ts:125`) | HAS `sheets.tsx:195` |
| 41 | Trash: restore, delete forever, in bulk (`menus.ts:80-84`) | HAS `TrashView.tsx:116-117,170-177`, plus "Empty trash" |
| 42 | Rights: a viewer sees no write actions; move and trash for owner or admin (`menus.ts:107-125`, `Drive.tsx:294-305`) | HAS `permissions.ts`, `folder.tsx:212-213`, `NodeCollection.tsx:246`, `sheets.tsx:192-195` |

### Viewer

| # | Web feature (file:line) | Mobile |
|---|---|---|
| 43 | Lightbox: previous/next across every file; zoom (`Lightbox.tsx:186-191,372-378`) | **PARTIAL**: swipe and pinch between images only (`ImageGallery.tsx`, `view.tsx:207`) |
| 44 | Viewer header: star, share, download, details, more (`Lightbox.tsx:126-139`) | HAS `view.tsx:264-269,334-346` |
| 45 | PDF preview (`PdfPreview.tsx`) | HAS `PdfView.tsx` |
| 46 | Excel and CSV preview (`ExcelPreview.tsx`) | **PARTIAL**: an Office file goes to the system viewer or share sheet (`viewerModes.ts:17-23`) |
| 47 | Video and audio | HAS `view.tsx:51-140` |
| 48 | Text and Markdown preview | HAS `view.tsx:150-162` |
| 49 | Edit and save a Markdown file (`NodeViewer.tsx:101,221-240`, `updateMarkdown` api :173) | **MISSING** |
| 50 | Rich page: view and edit (`NodeViewer.tsx:388`, `PageEditor.tsx`) | **PARTIAL**: read-only WebView (`view.tsx:291-299`) |
| 51 | Linked notes on a node: list, open, unlink (`NodeViewer.tsx:394-428`) | **MISSING** |

### Sharing (`ShareDialog.tsx`)

| # | Web feature (file:line) | Mobile |
|---|---|---|
| 52 | Invite by email as viewer, editor or admin (`:172-267`) | HAS `ShareSheet.tsx`, `pageShares.ts:100` |
| 53 | Pending invites and resend (`:154,391-401`) | HAS `pageShares.ts:116` |
| 54 | Change role; remove access (`:364-447`) | HAS `pageShares.ts:107-112` |
| 55 | Public link with an expiry; copy; revoke with or without removing the people who joined (`:275-358,474-491`) | HAS `pageShares.ts:123-135`, `ShareSheet.tsx:146-170` |

### Uploads

| # | Web feature (file:line) | Mobile |
|---|---|---|
| 56 | Upload tray: progress, cancel, retry, cancel all (`UploadTray.tsx`) | HAS `app/pages/uploads.tsx:62-140`, `ui.tsx:545` |
| 57 | Resumable uploads | HAS `stores/uploads.store.ts:152` |

**Mobile only**: share into MultiMagic (`ShareIntentBridge.tsx`), the save picker (`save.tsx`), the camera, "Empty trash", and search filters by date and owner.

## 11-16 audit items (Pages)

| Item | Verdict |
|---|---|
| Owner #1: back to the grid (`drive/ui.tsx:171`) | FIXED: `AppHeader app="pages"` (`index.tsx:162,202`) |
| P0 #1: cannot create a space | FIXED: `SpaceForm.tsx`, `index.tsx:255`; the save picker has "New space" (`save.tsx:358`) |
| P0 #2: permissions ignored | FIXED: `permissions.ts`, `folder.tsx:212-213`, `NodeCollection.tsx:246`, `sheets.tsx:192-195` |
| P1 #14: sharing with people | FIXED: `ShareSheet.tsx`, `pageShares.ts` |
| P1 #15: space edit, share, delete | FIXED (`index.tsx:304-313`). **ZIP export STILL OPEN.** |
| P1 #16: rich pages read-only; no "New page" | STILL OPEN (#22, #50) |
| P1 #17: viewer header actions | FIXED: `view.tsx:264-269,334-346` |
| P1 #18: make a copy, copy to, replace and versions, show location, storage, ZIP import/export, link notes | STILL OPEN, all of it (#6, #12, #25, #26, #33, #34, #36, #37, #39) |
| P1 #19: Move sheet showed only 25 folders | FIXED: `sheets.tsx:387-391` |
| P1 #20: spaces oldest-first and capped at 50 | FIXED: `created_at desc` and paging (`api/pages.ts:270-272`, `index.tsx:235`) |
| P1 #21: trash bulk restore and delete forever | FIXED: `TrashView.tsx:116-117` |
| P1 #22: Shared tab blank on error | FIXED: `index.tsx:270` LoadFailure |
| P2: wrong shared-row icons | FIXED as far as I can tell: the space row shows its icon (`index.tsx:68,85`). Not checked on a device. |
| P2: no Pages type filter | FIXED (folder chips `folder.tsx:180-182`), except a "Pages" chip (#17) |
| P2: folder sort not kept | FIXED: `ui.tsx:164-172` (AsyncStorage) |
| P2: no Select all | STILL OPEN (#18) |
| P2: New-folder dialog keeps old text | NOT RE-VERIFIED (needs a device) |
| P2: Rename selects the extension | FIXED: `ItemSheet.tsx:127-170` |
| P2: uncaught picker promises | FIXED: try/catch in `addFiles.ts:91-153` |
| P2: partial, untappable folder path | STILL OPEN (#8) |
| P2: the viewer only swipes between images | STILL OPEN (#43) |
| P2: no note in the trash about storage | STILL OPEN (no storage view at all, #6) |
| P2: unused ItemSheet | RESOLVED: it now hosts the shared `NameDialog` and `shareNode` |
| MISSING_FEATURES #1: multi-download | FIXED and merged (`NodeCollection.tsx:268`) |
| BUG: iOS video titled without ".mp4" cannot be saved | **UNMERGED** on `origin/fix/media-kind-by-content`; main still has the old naming (`api/pages.ts:417-420`) |
| BUG: sharing a space with an email that has no account | Server: origin/master merged `invites-for-new-users` (HEAD `e9adf512` locally), so the 404 path has probably changed. NOT RE-VERIFIED on mobile; check what `ShareSheet` shows for that answer. |
| Owner rule "lists newest first" | The folder default sort is `name asc` (`ui.tsx:164-165`), the same as the web (`Drive.tsx:110`). Owner's call, not a parity gap. |

## Missing, with endpoints

All of these routes exist on origin/master (`config/routes.rb:231-281`).

| Gap | Endpoint | Days |
|---|---|---|
| #6 storage view | `GET /api/v1/storage` (`storage.api.ts:37-40`) | 0.5 |
| #12, #28 export a space or folder as ZIP | `POST /api/v1/page_app/transfers/export`, then poll `GET /transfers/:id` and download; `DELETE /transfers/:id` | 1 |
| #25 import ZIP | `POST /api/v1/page_app/transfers/import` (multipart), then poll | 1 |
| #33, #34 make a copy / copy to | `POST /spaces/:s/nodes/:n/duplicate {target_space_id?, parent_id?}`. It can answer `{transfer}` for large folders (`page_app.api.ts:283-300`). | 0.5 |
| #37, #39 replace file and versions | `PATCH /spaces/:s/nodes/:n` (multipart `node[attachment]`); `GET /nodes/:n/versions`; `POST /versions/:v/restore`; `DELETE /versions/:v` | 1.5 |
| #36 show location | no endpoint (navigate to `parentId`/`spaceId`) | 0.25 |
| #26, #51 link notes and linked notes | `GET`/`POST`/`DELETE /spaces/:s/nodes/:n/note_links` | 1 (with Notes #34) |
| #22, #50 new page and rich page editing | `POST /spaces/:s/nodes {node:{kind:"page",…}}`, `PATCH .../nodes/:n` with the HTML. Reuse Notes' engine B and codec. Same 96 KB limit. | 3-4 |
| #49 Markdown edit | `PATCH .../nodes/:n` with a new `node[attachment]` text blob (`updateMarkdown`) | 0.5 |
| #18 select all; #17 "Pages" chip | UI only | 0.25 |
| #8 tappable breadcrumb; #38 deleted-at and manage-access in details | UI only | 0.5 |
| #43 swipe across every file type | UI only | 1 |
| #46 sheet preview | client parse | 1 |
| #30 copy link | UI only | — |

- Optional item: an Android folder picker for upload folder (#24), 1 day.
- Server routes with no client on either side: `spaces/trashes`, `spaces/:id/restore`, `spaces/:id/destroy_permanently`, `nodes/reorder`, `share_links/redeem`. The web has no UI for them either, so they are not parity gaps.

**Estimate: about 12-14 dev-days for full Pages parity.**
- About 8 days without rich-page editing.
- Merging `fix/media-kind-by-content` is about 0.5 day (rebase, gates, iPhone check).

---

## Totals

| App | Web items | HAS | PARTIAL | MISSING | Days |
|---|---|---|---|---|---|
| SafeZone | 29 | 24 | 3 | 1 (+1 deviation) | ~1 (native biometrics and autofill extra, owner's call) |
| Notes | 39 | 28 | 5 | 6 | ~2.5 (+1 dictation) |
| Pages | 57 | 35 | 7 | 15 | ~12-14 (~8 without rich-page editing) |
