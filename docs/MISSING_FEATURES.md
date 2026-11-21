# Missing features (owner's list)

Things the owner noticed are missing while using MultiMagic. They are not bugs: the app works, but a feature isn't there yet.
Build them when MultiMagic work resumes. Newest at the bottom. Mark an item done with the commit that adds it.

| # | Date | Where | Missing | Notes for the build | Status |
|---|---|---|---|---|---|
| 1 | 2026-11-09 | Pages → Home, multi-select (Android, emulator qa_phone) | **Download several files at once.** With 2+ items selected, the top bar has only star / move / delete. | Add a Download action to the multi-select bar. Real files only (photo, PDF, mp3…); pages and folders are skipped, with a short note saying how many were skipped. Save each file one after another, with progress. Check iOS too. | **Built** on branch 1.1.1 (`downloadMany.ts`, the selection bar's Download): the system asks once for a folder, files go there one by one. Files/Downloads, not the Photos gallery (that needs a new native module; asked of the owner). Jest red first; device QA pending; iOS in `IPHONE_CHECKLIST.md` §7. |
| 3 | 2026-11-12 | Contacts, tablet (≥ 800 dp) | **Contacts tablet split.** On an 800 dp tablet the list is one phone-width column with small text and a lot of dead space (device shot `docs/design/contacts/ours/800-dark-fr-list.png`, sheet tile 18). | List on the left and the contact card on the right at ≥ 800 dp, as the owner chose for Notes. Check the font is not scaled down on the tablet. Test-first (layout split by width), then a new 800 dp device shot. Supervisor review of the Contacts sheet, 2026-11-12. | **To build** (after SafeZone's desk work, at the next emulator slot) |
| 4 | 2026-11-13 | SafeZone (native) | **Biometric unlock, password autofill, native clipboard expiry.** (a) Face ID / fingerprint via `expo-local-authentication` means keeping the PIN in SecureStore behind `requireAuthentication`, which reverses SafeZone's "the PIN is never stored" rule: the owner's call. (b) Password autofill at sign-in needs an iOS credential-provider extension and an Android Autofill service. (c) `expo-clipboard` exposes neither iOS `UIPasteboard` expiry/local-only nor Android 13's sensitive-clip flag (the flag is now set by the local module `modules/sensitive-clipboard`, 2026-11-13; device check D10 pending), so a killed app leaves a copy behind until MultiMagic is opened again (measured on Android, device pass D12, 2026-11-13; the next open now clears it through a keyed marker, `SECURITY.md` §6) | `docs/design/safezone/SECURITY.md` §9, `SPEC.md` §F. All three need a native build | OPEN |
| 5 | 2026-11-20 | Doc Tools (native) | **Document scanner.** Edge detection, perspective correction and several pages in one go (iOS VisionKit, Android ML Kit, e.g. `react-native-document-scanner-plugin`). The phone does this better than the web, which has none. It feeds Sign, Merge, Convert and Compress. Designed (`docs/design/doc/SPEC.md`, Scanner) and wired as the first row of the "Add from" sheet behind `DOC_SCANNER_ENABLED` (`src/screens/doc/io.ts`), off until a build carries the module | A new native dependency, so a new native build; no EAS build was spent on it (brief, 2026-11-20). Turn the flag on and route the row to the scanner in the same build | OPEN |

## BUG (owner, 2026-11-10, iPhone): a video titled without ".mp4" cannot be saved to Photos
- Seen: the Pages file "Hatiwal 1.2.1 promo (ps) v1" (video/mp4, 52.6 MB) → Download → the iOS share sheet shows a blank "File" with no "Save Video".
- Cause (read in code): `downloadToCache` (src/api/pages.ts) names the cache file `pages-<id>-<stamp>-<title>`. When the title has no extension, iOS cannot tell that it is a video. The multi-download in 1.1.1 has the same root (downloadMany.ts).
- Fix: when the title has no extension, append one from `mimeType` (video/mp4 → .mp4, image/jpeg → .jpg, …), and drop the `pages-<id>-<stamp>-` prefix from the name the user sees (keep it as a cache sub-folder instead). Test-first; target 1.1.2.
- Workaround today: the same video was re-uploaded titled `promo-1-2-1-ps-v1.mp4`.

## BUG (owner, 2026-11-10, web): sharing a space with an email that has no account shows "Something went wrong"
- The server answers 404 {"message": "User not found with that email"} (Api::V1::PageApp::SharesController#find_share_recipient), but the web share dialog only shows the generic toast.
- Fix: show the server's message ("No MultiMagic account uses this email yet"), and ideally offer "Send an invitation to sign up" (an email with a sign-up link that applies the share once the account exists). Server + web; check mobile too.

## Notes, Keep-style (owner, 2026-11-13): what Google Keep has and MultiMagic does not

Rule: the phone does what the web does, with no invented fields. These Keep features have nothing behind them on the web or server, so they are not built:

- **Voice notes**: no audio-note type on the web.
- **Drawing notes**: no drawing type on the web.
- **Sort options in the grid**: the server orders `pinned desc, updated_at desc` and takes no sort parameter.
- **Archive**: added in multi_magic PR #21 (not merged). On the phone, behind the dev flag.
- **Typing code without autocorrect on the phone** (found 2026-11-14). The spec (EDIT_EVERYTHING.md §1) wants code typed with no autocorrect or capitalisation. With engine B 2.2.3, switching `autoCorrect`/`autoCapitalize` while a note is open restarts the keyboard, and B's input loses sync: the caret stops moving, the next letters come out reversed and are not saved. Until B handles the switch, the props stay constant (autocorrect on, sentence capitals), so the keyboard may suggest or capitalise inside code. Fix paths: an upstream B fix (issue not filed: needs the owner's yes), or a code sheet with its own plain text input.
- **Editing a very long note on the phone** (measured 2026-11-13). Engine B refuses a 900 KB invented note: `POSITION_EPOCH_LIMIT_EXCEEDED`, a limit inside its compiled Rust core that JS cannot configure. The note opens in the read view with "cannot open", and nothing is sent (the guard in `engineHolds.ts` plus B's error listener). Measured 2026-11-14 (`qa/scripts/epoch_probe.py`, emulator): 100 KB edits and saves (opens in 8 s); from 200 KB a note opens in 22 s or more and a typed edit is not saved within 45 s; 800 KB is refused by B (between 600 and 800 KB). An instant burst of keys into a 100 KB note keeps only the first few; typing at a person's pace keeps them all. **Measured again 2026-11-14 (ANR):** in a 200 KB or larger note, the first key blocks the UI thread for more than 5 s and Android kills the app (logcat `ANR … Input dispatching timed out`), so the unsaved key is lost; 100 KB is fine. We believe the cause is engine B's native key handling (inferred: our export takes ~170 ms at 200 KB, on the JS thread). **Guard (2026-11-14):** notes above 96 KB (`EDIT_SIZE_LIMIT`; measured: 50/75/100/112 KB edit and save with 20 keys at a person's pace, 125 KB is an ANR) open in the read view with "This note is too long to edit on the phone yet", and engine B is never created. **The real fix still to build: edit very long notes on the phone** (section-by-section editing, or a fix in engine B). Fix paths: ask upstream for a configurable `maxPositionEpochRetainedBytes` (draft in `docs/design/notes/ENGINE-B-ISSUE-position-epoch.md`, not filed: it waits for the owner's yes), or edit long notes section by section.
- **Reminder delivery from the server: email + in-app notification** (owner, 2026-11-13: deferred, "we note it, we'll do it later"). Today reminders are local notifications on each phone (multi_magic PR #22 stores them). A phone that has not opened the app since the reminder was set does not ring. Design, ready to pick up:
  - **Scheduler** (multi_magic branch on top of PR #22; no merge, no deploy). The app's existing job system runs a periodic sweep, e.g. every minute: reminders that are due and not yet sent for this occurrence. It delivers at `launch_time`, then re-arms per `repeat_frequency` (daily/weekly/monthly). It is idempotent: a `last_sent_at` or occurrence key prevents double sends. The timezone is the user's.
  - **Email:** the existing mailer and layout, localized (en/fr), with the note title, a snippet and a link that opens the note.
  - **In-app notification:** a record in the existing notifications model, the one the mobile Notifications screen and the web bell read. Tapping it opens the note, on mobile and on the web.
  - **Cancel or skip** when the note is archived, trashed or deleted, or the reminder is removed.
  - **Specs first** (request + job, red→green): due → 1 email + 1 notification; repeat re-arms; no duplicate on a second sweep; trashed → nothing.
  - **Mobile:** keep the local notification as the offline fallback, without double notifications. Once the server has delivered, the next sync cancels the local one for that occurrence (or dedupes by occurrence id). The notification row deep-links to the note.

## Next train after rc16 (parity audit 2026-11-16, supervisor's cut)
rc16 closed every P0, every "on the web" escape hatch and the cheap P2s. What follows is NOT in rc16; numbers are those of the audit (`mm-audit/PARITY_AUDIT_2026-11-16.md`, file:line evidence there).

| Audit # | Where | Missing | Notes for the build |
|---|---|---|---|
| 14 | Pages | Sharing with people: invite by email and role, pending invites, public link with expiry, revoke, copy link | Web `ShareDialog.tsx`; server `shares` and `share_links` routes exist. Today only the OS share sheet |
| 15 | Pages | Edit a space (title, icon, colour, description), share it, zip export, delete | SpaceRow has no menu. The create form from rc16 (`SpaceForm.tsx`) can be reused for edit |
| 16 | Pages | Rich-text pages are read-only; no "New page" | Same engine and codec as Notes (engine B) |
| 17 | Pages | File viewer header: star, rename, move, trash, details, share | Web `Lightbox.tsx:126-145` |
| 18 | Pages | Make a copy / copy to, replace + version history, show location, storage quota, import/export ZIP, link notes | |
| 21 | Pages | Trash: multi-select bulk restore and delete forever | `TrashView.tsx:110` |
| 23 | Notes | Sharing and collaborators: invite, role, remove | Web `notes.api.ts:124-166` |
| 24 | Contacts | Fields: social links, tags, gender, closeness | `src/api/contacts.ts:87-100`, `draft.ts` |
| 25 | Contacts | Family tree, is_self, gendered roles, step/half/in-law, updateRelation; gendered labels overwritten by neutral ones | `ContactCard.tsx:344` |
| 28 | SafeZone | Password health tab | `/passwords/health` |
| 29 | Chats | Search across conversations and inside a thread | Web `Index.tsx:197`, `ThreadSearch.tsx` |
| 30 | Chats | Group members panel: add, remove, admin | Web `MembersPanel.tsx` |
| — | Contacts → Chats | "Message" on a contact | Needs a contact ↔ MultiMagic account link server-side: a contact's `user_id` is its owner, nothing links it to an account, and the web has no such action (supervisor, 2026-11-16) |
| 33 | Assistant | "Clear messages" leaves the transcript cache | `SessionsSheet.tsx:187-195`, device |
| 34 | Assistant | Memory review card | Web `MemoryReviewCard.tsx` |
| 35 | Assistant | No `context` is sent | `src/api/ai.ts:356-363` vs web `AiChat.tsx:359` |
| 38 | Profile | 2FA, devices and sessions, login history, username, birth date, cover photo, AI usage, key lending, MCP/Connect Claude, follow/followers | |
| 40 | Auth | Google sign-in | If added, Sign in with Apple is mandatory (App Store rule 4.8) |
| 41 | Home | Todos, Finance, Flow, Tables, Doc have no mobile tile | Owner's scope call |
| 42 | Everywhere | Remote push, on both sides | |
| 12 | Auth | In-app password reset (the email link opens the web's reset page) | Needs deep-link handling of the reset token plus a reset form |
| 39 | Auth | A Terms document to link from the sign-up checkbox | The web has none; the box links the privacy policy only. Owner asked (supervisor, 2026-11-16) |
| P2 | Pages | Type filter, Select all, tappable folder path, swipe between every file type in the viewer, storage note in the trash, remove the unused ItemSheet | Each over ~30 min |
| P2 | Notes | Label colour and order, "Linked in Pages", word count, note.tsx copy/restore/delete forever | |
| P2 | Home | Unread badge on Chats, "Conversations" vs "Chats" naming, closing history leaves you in the assistant, pull-to-refresh | |
| F1 | Pages, Contacts | The rename dialog needs two taps on Rename right after typing with the keyboard open (rc16 QA, seen with adb typing) | Check on a real phone first |

## Missing apps and the full parity audit (owner, 2026-11-20)
Owner: "Flow, Docs, Tables… these apps are still missing [on mobile], and we check other things that are missing." The full audit with every web action, endpoint and size is `docs/MOBILE_PARITY_2026-11-20.md`, and the per-app inventories are in `docs/parity/`. It supersedes rows 41 and 42 above, and the 11-16 rows it re-verified as fixed.

| Where | Missing | Size | Status |
|---|---|---|---|
| Flow | The whole app (projects, board, cards with 13 field types, sprints, backlog, members, columns, fields) | 28–32 d | Waiting on the owner's order |
| Tables | The whole app (4 views, 16 field types, filters and views, forms, import and export), in 8 increments | 66–86 d | Waiting on the owner's order |
| Doc | The PDF toolkit (Sign, Merge, Pages, Text, Convert, Compress). Needs 8 server endpoints; the phone adds a scanner | 30–37 d | Waiting on the owner's order |
| Tasks, Finance, SafeZone (1.3.0) | **Owner-rule defect:** Reanimated `entering` and transforms on recycled list rows (11 sites, parity doc §4) | 0.75 d + device | To fix before the next release |
| Finance | Active loans on the Overview; links to expense, income and loan; all-years and future periods; budgets newest first | ~4 d | Open |
| Pages | Storage, ZIP, copy, versions, link notes, rich-page editing; merge `fix/media-kind-by-content` (the iOS video bug) | 12–14 d | Open |
| Cross-cutting | Global search, remote push, universal links with in-app reset, shared text/URL → note | 8–11 d | Open |
