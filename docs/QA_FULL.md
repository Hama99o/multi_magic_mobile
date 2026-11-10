# MultiMagic mobile: full-app QA, 2026-11-07

**Why:** the owner asked to "QA test ALL functions of MM", the whole app,
not only Pages. The standard is the one used for Pages
(`docs/design/pages/QA_DEEP.md`): by hand, as a user, on the device. Nothing
is a pass without a device screenshot.

**Rig:** Android emulator `qa_phone`, dev build `com.multimagics.mobile`, Metro
3029, local backend 3001, signed in as the QA account. 360 dp unless a row
says otherwise. Destructive paths are opened and cancelled.

**The biggest risk this pass checks:** the new shell (2026-11-06). The app
used to open on the assistant; it now opens on Home, and the assistant is an
overlay. Anything written against "the assistant is the first screen" may
have broken: deep links, notifications, sign-out/in, and the QA flows
themselves.

## 1 · Inventory and checklist

Status: **✅** passed on the device (shot named) · **❌** defect (see §3) ·
**◐** partly checked (what is missing is said) · **–** not yet run ·
**NM** not measured, with the reason.

UX is judged as a user, out of 5:
- obvious what to do;
- taps for the main task;
- feedback for every action;
- no dead end;
- friendly errors with a next step;
- smooth (no long spinners);
- consistent words and icons;
- thumb reach;
- readable at 360 dp.

"–" means not yet judged.

**1.1.1 device pass:** 2026-11-10, qa_phone (Android, emulator-5556), dev build of 1.1.1 · shots `q11/NN` = ~/mm-qa-1.1.1/NN-*.png (QA account only, not committed).

| Area | Screen / feature | What is checked | Status | UX /5 · notes |
|------|------------------|-----------------|--------|---------------|
| Auth | Sign in (`app/sign-in.tsx`) | email+password, wrong password message, lands on **Home** | ✅ empty → "Enter your email and password."; wrong → "That email and password do not match."; right → Home (q11/96, 97, 105) | 4 |
| Auth | Sign up | fields, validation, lands on Home | ◐ empty → "Fill in your name, email and a password"; bad email → "Email is invalid"; short password → "too short (minimum is 6…)" (q11/103, 104). Submitting a VALID form was not done: it creates a real user in the owner's dev DB. "Lands on Home" NM | 3.5 · the email/password errors are the server's English sentences (Rails), not ours |
| Auth | Two-factor | code entry, back, lands on Home | NM: the QA account has no 2FA | – |
| Auth | Forgot password | email, "sent" state | ✅ empty → "Enter the email you signed up with."; QA email → "Check your email" + Back to sign in (q11/100, 101). Dev mail goes to a file, nothing sent | 4 |
| Auth | Sign out → sign in | from Home's avatar sheet and from the assistant's; returns to Home | ✅ both sheets sign out to Sign in; signing in lands on Home (q11/95, 98, 105) | 4 · no "are you sure"; fine for a reversible action |
| Shell | Home (`app/home.tsx`) | 6 tiles, greeting, unread badge, avatar sheet, AI button | ✅ en/fr, light/dark, 360 dp | 4 · clear; FR had two "Discussions" tiles (F5, fixed); FR Assistant tile text is cut at two lines (low) |
| Shell | AI overlay | opens over any screen, X returns exactly there | ✅ Home, Pages, Chats (X back to Chats), Notifications, Calendar, a folder (`qa_sheets/2026-11-07_shell-assistant.png`) | 4 · one tap from everywhere now (F4); offline band on return to the app (top-10 #8) |
| Assistant | Ask a question | question shows, thinking, answer arrives (socket) | ✅ new conversation, "Find Itinerary.pdf in my Pages" → answer + source chip (q11/42) | 4 |
| Assistant | Conversation history (sessions) | list, switch, new, delete (open + cancel) | ✅ list, switch, New conversation, Delete opened → "Keep it"/Back keeps it (q11/36–41) | 4 |
| Assistant | Attach a file / photo | the attach sheet, upload, chip | ✅ after fix: sheet → library → chip → ready in seconds (q11/56–62). **BUG found and fixed** (`60f5037`): the chip said "Reading…" for minutes after the server had read the file | 3.5 · the answer then searched Pages instead of reading the attached photo (server/AI side, not fixed here) |
| Assistant | Answer actions | copy, feedback, read aloud, sources | ✅ thumbs-up stored (ai_feedbacks positive), read aloud goes busy, sources open (q11/47, 49). **BUG found and fixed** (`ef41162`): Copy pasted raw markdown and a `/rails/active_storage/…` path; now the text as it reads (q11/52, host clipboard checked) | 4 |
| Assistant | Dictation | mic, permission, text arrives | ◐ mic → "Listening…" with stop and cancel (q11/53); permission already granted. "Text arrives" NM: the emulator has no speech input | – |
| Assistant | Keyboard | the composer stays above the keyboard | ✅ keyboard up (mInputShown=true), composer and Send above it (q11/55) | 4 |
| People | Chats list | list, empty state, open a thread | ✅ list (one QA thread) opens the thread (q11/65). Empty state NM: the QA account has a thread | 4 |
| People | Thread | send, reactions (long press), retry on failure | ✅ sent ✓; long press → reaction sheet → 👍 shown; offline → "Not sent. Tap to retry." → online → Sent (q11/67–71) | 4 |
| Notifications | List | empty / filled, mark read, tap opens the right place | ◐ empty state en/fr light/dark; the QA account has no notifications, so "filled" and "tap opens" are NOT MEASURED on the device (Jest covers them) | 4 · the bin showed on an empty list (F6, fixed) |
| Calendar | Upcoming | empty / filled, tap composes a question | ✅ empty "Nothing today." (q11/72); filled after the assistant added "QA dentist"; tap → "Tell me about \"QA dentist\" (Tomorrow · Wed, Nov 11)." in the composer (q11/76). **BUG found and fixed** (`2218191`): every one-off event showed the repeat icon (server sends "none") (q11/77) | 4 |
| Account | Profile sheet | rows: Pages, profile, privacy and account, language, appearance, dictation language, sign out | ✅ 411 dp, Home avatar and the assistant | 4 |
| Account | Profile | edit name, avatar, save | ✅ last name → Saved. (server checked, then put back); avatar from library → crop → "Change photo" (q11/79–83) | 4 |
| Account | Change password | validation, wrong current password | ✅ "These do not match."; wrong current → "That password is not right." (q11/85, 86) | 4 |
| Account | Sessions (devices) | list, sign out other (open + cancel) | N/A: the app has no devices screen (`app/` has none, nothing routes to one); it is a web feature | – |
| Account | AI keys | add / replace / remove (open + cancel) | ◐ list with "In use" key (q11/91). **BUG found and fixed** (`87bb042`): Remove deleted the key in ONE tap, no question; it now confirms (Jest 3 red first). On the device the QA account's gemini key was lost by that tap, so add/replace and the new confirm are NM until a key is re-added (needs a real key) | 3 · was a one-tap loss |
| Account | Privacy | text, back | ✅ text, Back (q11/89) | 4 |
| Account | Delete account | disclosure and gate, open + cancel only | ✅ 411 dp, opened then "Keep my account"; Maestro 18 | 4 · clear what goes and what stays |
| Settings | Language en/fr | switches live, survives restart, reaches the server | ✅ switched live several times today; survives relaunch (measured) | 4 · F5 fixed the one French clash |
| Settings | Appearance light/dark/system | live, survives restart | ✅ pane at 411 dp; dark used throughout batch 3 | 4 |
| Pages | everything | `docs/design/pages/QA_DEEP.md` (21 rows) | ✅ see that file | – |
| Pages | Share-in from another app | Save to Pages | ✅ 2026-11-06/07 | – |
| Pages | Uploads | queue, background, kill, airplane | ✅ 2026-11-06 (SPEC §7); 2026-11-07: 107 MB clip, airplane cut mid-way → "Waiting for a connection" → resumed → ONE copy, sha256 identical, delete forever frees the server disk (`qa_sheets/2026-11-07_uploads.png`) | 3.5 · works and recovers; progress jumped 0 % → 99 % (U3); no sign anything happened while a big file is copied (U4) |
| Links | AI answer links | open the in-app screen when there is one | ✅ calendar_event chip → Calendar; page_node chip → the in-app viewer (q11/45, 74). A file link written INSIDE the answer text (`/rails/active_storage/…`) opens the "opens outside MultiMagic" sheet, by design | 4 · the inline file link could open the in-app viewer (improvement) |
| Links | Deep links / push | open the right screen with Home underneath | ✅ warm: chats, notifications, calendar, pages each open, Back → Home. Cold: Back CLOSED the app (F7, fixed, device-verified) | 4 |

### 1.1.1 additions to check on the device

| Area | Feature | What is checked | Status | Notes |
|------|---------|-----------------|--------|-------|
| Pages | Multi-select **Download**, mixed → Files | 2+ files (at least one not a photo/video) and a folder selected → Download → the system folder picker → "Downloading n of total…" → one message (saved / skipped); the files are in the chosen folder with their own names and open; Cancel in the picker says nothing | ✅ after fix: "4 files saved", names and sizes match the server (q11/09–10); picker Back says nothing (q11/11). **BUG found and fixed** (`432a2e7`): first run "3 files could not be saved" and three EMPTY files (q11/08) | First device check: copying into an Android SAF folder (`File.copy` into `Directory.createFile`) is proven only on a device |
| Pages | **Empty trash** with a folder and its own child | trash a file, then its folder; Empty trash → everything goes, "emptied" message, no error | ✅ TrashQA + its Budget.xlsx + 4 older → "6 items deleted forever.", 5 DELETE calls (the child went with its folder), "The trash is empty." (q11/30–33) | The 2026-11-09 web bug in its mobile shape; Jest red first (`a5fab27`) |
| Pages | **Play badge** over a video's frame | list, grid, item sheet; light and dark | NM on the local server | Badges appear only where the server sends a video frame, i.e. once ffmpeg is in the server image (multi_magic branch `video-previews`). The local dev server has no ffmpeg, so on the emulator videos keep their red icon and no badge: NOT MEASURED there, covered by `playBadge.test.tsx` (18 tests, red first). Check on the phone after the deploy. |
| Pages | Video **playback** ("can't play video in Pages") | a Pages video plays | ✅ owner: resolved on device 2026-11-09 (iPhone 15 Pro Max) | closed, no work needed |
| Pages | Download, all photos/videos → **Gallery** | only photos/videos selected → Download → permission asked once → "n files saved to your photos" → they are in Photos/Gallery; refused → the message offers "Save to Files" | ✅ 2 photos → "2 files saved to your photos"; video+photo+page → "2 files saved… 1 page or folder skipped", clip in DCIM at 3.8 MB (q11/12, 16). **BUG found and fixed** (`432a2e7`): names were the cache's (`pages-3392-…-IMG_2041.jpg`), now `IMG_2041.jpg`. Android 14 asks no permission to ADD to the gallery, so "refused" is NM here (iOS; Jest covers) | needs the NEW dev build (expo-media-library is a native module) |
| Home | F2 Conversations tile | opens on the history | ✅ opens the Conversations sheet (q11/34) | fixed in code, Jest both halves |
| Links | F3 Pages links in answers | a page_node / page_space link opens in the app | ✅ page_node chip → Itinerary.pdf in the in-app viewer (q11/45). page_space NM (no answer produced one) | fixed in code, Jest |

## 1b · Top 10 UX improvements, ranked by impact

Filled in from the manual pass, each with a before/after shot or mockup in
`docs/design/pages/qa_sheets/`.

| Rank | Improvement | Where | Impact | Evidence |
|------|-------------|-------|--------|----------|
| 1 | **Uploads that survive a weak connection**: send in 8 MB pieces and resume from the last confirmed piece (Photos, Drive and WhatsApp do this). His 543 MB clip over 2-bar 5G restarted from zero at every drop and never finished. | Uploads | Highest: the owner's daily use, and his words "why can other apps do it fast" | Phone side built and tested; server branch `resumable-uploads` written, specs NOT run, deploy needs his OK |
| 2 | **No duplicates**: check the server before any retry, stop a failed transfer before retrying, plus a server guard. IMG_8520 and IMG_8511 each arrived twice. | Uploads | High: trust in the folder | Phone fixed and tested (25 store tests); server guard written; emulator: network cut → ONE copy |
| 3 | **Share from Photos/Files straight into a folder** (the iOS share extension). | Share-in | High: his main way in | Waiting on the App Group step and build 8; Android measured |
| 4 | **Say what is happening at every moment of an upload**: "Preparing…" at once, never "0 %" while nothing is known, "Waiting for a connection" offline. | Uploads | High: on his phone a still 0 % reads as broken | Fixed (U3, U4); `ours/qa/360-u20-upload-progress-honest.png` |
| 5 | **"Keep MultiMagic open to finish uploading"** while iOS would pause it in the background. | Uploads (iOS) | High for big clips on iPhone | Open: comes with the resumable path |
| 6 | **Never a silent failure**: a file the phone cannot read, a refused permission. | + New | Medium-high | Fixed (U1, U2); `qa_sheets/2026-11-07_uploads.png` |
| 7 | **Undo instead of "are you sure"** for Move to trash: a "Moved to trash · Undo" bar, as Drive does. One tap less, and a mistake costs nothing. | Pages ⋯, multi-select | Medium | **Done.** Trash goes at once; a bar says "“name” moved to the trash" with Undo for 6 s, placed ABOVE the "+" (at the bottom the "+" covered Undo: found on the device). Undo restores exactly what went. Device: trash → Undo → back (`ours/qa/360-g1-undo-bar.png`, `360-g2-after-undo.png`). Tests red first |
| 8 | **Show "Offline" as soon as the phone knows**, not only after a send fails. | Assistant, Pages | Medium | Fixed: the app asks MultiMagic each time it comes back to the foreground (`stores/reachability.store.ts`), and a one-line band sits ABOVE every screen while it cannot answer (`components/OfflineBanner.tsx`). The first version was an overlay that covered the Home title and the Pages search pill on the device, so the screens now move down instead. Back online, the lists that failed reload by themselves (before, Pages kept "Could not reach MultiMagic" until Try again). `qa_sheets/2026-11-07_offline-banner.png` (qa_phone, 360 dp, light, English). NOT MEASURED: dark, French, iPhone with the Dynamic Island |
| 9 | **The assistant from every screen** (done), and **Back after a notification goes Home** (done). | Shell | Medium | Fixed (F4, F7); `qa_sheets/2026-11-07_shell-assistant.png`, `…_account-settings-deeplinks.png` |
| 10 | **Video frames as thumbnails** in Pages lists and grids (today a red play icon). | Pages | Medium: telling clips apart | Open: needs the server's video previews; the local server makes none |

## 2 · The Maestro suite (`qa/flows`)

Verdicts go to `qa/FLOW_REGISTER.md`. NOT MEASURED stays exit 3.

**Found before the run:**
- **Every flow failed at sign-in under the new shell.** `login.yaml` waited
  for the assistant's composer as proof of being signed in. With Home first,
  a signed-in app showed no composer, the flow waited for a sign-in screen
  that never came, and every flow stopped there. Measured: the old
  `login.yaml` on the current app.
  - **Fixed:** Home (`home-tile-pages`) now counts as signed in, and the
    flow opens the assistant from the Home tile.
  - Five flows (06, 07, 08, 20, 99) used the assistant's header doors to
    Chats, Notifications and Calendar, which the overlay hides. They now use
    the Home tiles.
  - `23-pages.yaml` was written for the old Pages screen and is rewritten
    for the Drive layout.
  - 07-notifications passes with the new path (measured).

**Result, 2026-11-07:** every flow passes after the flow fixes. The table and
every cause are in `qa/FLOW_REGISTER.md` ("RUN 2026-11-07").
- **24 passed.**
- **`set-language` is a helper, not a test.**
- **21-faults and 22-drive are excluded by tag.**
- **The app itself needed no change** for the suite. What the new shell broke
  was the flows' idea of "the first screen".

## 2b · Performance baseline (2026-11-07). Indicative, not a verdict

**Conditions:**
- the DEBUG dev build: unminified JS from Metro, dev checks on;
- the `qa_phone` emulator: GLES through a translator to the host's Mesa Intel Iris Xe;
- the QA space's folder (10 rows), 360 dp.

A release build on a phone will do better. These numbers are a baseline to
compare against after changes, NOT the phone's smoothness.

| Measure | Result | How |
|---------|--------|-----|
| Folder list scroll | 185 frames, **19 % janky**, p50 32 ms, p90 48 ms, p99 69 ms | `dumpsys gfxinfo` reset, 10 swipes |
| Folder grid scroll | 175 frames, **34 % janky**, p50 36 ms, p90 53 ms, p99 109 ms | same |
| Memory, Pages home → grid | 428 MB → 497 MB PSS | `dumpsys meminfo` |
| Cold start | NOT MEASURED meaningfully | a dev build's cold start is Metro serving the bundle |
| 120+ items | NOT MEASURED | needs the seed (his OK) |

**What it suggests, to test on a release build:**
- the grid is heavier than the list: its thumbnails and card layout;
- candidates: FlashList instead of FlatList, memoised rows, thumbnails at card size;
- re-measure on a release APK before changing anything.

## 3 · Defects

| # | Sev | Where | What | Cause | Status |
|---|-----|-------|------|-------|--------|
| F1 | High | QA flows | Every Maestro flow failed at sign-in after the Home shell (§2). | `login.yaml` took the composer as "signed in". | **Fixed**; 07 passes. |
| F2 | Medium | Home | The **Conversations** tile ("Your past questions") opens the plain assistant, the same as the Assistant tile, not the history. | `router.push("/chat")` for both. | **Fixed in code** (in 1.1.0, `b6e4866`): the tile pushes `/chat?sessions=1`, which opens on the history. Jest: `app/__tests__/home.test.tsx` (sending half, planted red 2026-11-09) and `chat.session.test.tsx` (receiving half). Device: pending. |
| F3 | Medium | AI answers | A link to a **Page or a Pages file** (`page_space`, `page_node` keys) opens the browser, though the app now has Pages. | `inAppRoute` predates Pages. | **Fixed in code** (in 1.1.0, `b6e4866`): `inAppRoute` maps `page_space` → `/pages/folder`, `page_node` → `/pages/view`. Jest: `inAppRoute.test.ts` and `openSource.test.tsx` "a link to Pages" (the chip press stays in the app; planted red 2026-11-09). Device: pending. |
| U1 | High | + New → photos/videos, camera | A file the system could not read (a damaged or unusual video) made the picker throw: nothing uploaded, NOTHING said (only a developer error). | `launchImageLibraryAsync` rejected, uncaught. | **Fixed.** `pickMedia`/`takePhotoOrVideo` answer `{ failed: true }`; `explainPick` says "Could not open that file. Your phone could not read it. Try another one, or use Upload files." Device-verified; tests red first. |
| U2 | Medium | Pages home → + New | A refused photo/camera permission was ignored in silence (the folder screen explained it). | `index.tsx` returned on `denied`. | **Fixed** (Jest; same `explainPick`). Not re-shot. |
| U3 | Medium | Upload bar | Progress sat at **0 %** for ~19 s, then jumped to **99 %** (107 MB, LAN, single-request path). | Not found: the native progress events arrive late or the copy before sending is counted as 0 %. INFERRED. | **Fixed.** While no byte count is known the bar says "Uploading…", never "0 %"; the resumable path moves per confirmed 8 MB piece. Device: "Uploading · 50 %" with the bar moving a few seconds in (`ours/qa/360-u20-upload-progress-honest.png`). Tests red first. |
| U4 | Medium | After picking a big file | ~5 s with no sign anything happened while the file is copied into the app. | `enqueue` copies before the row appears. | **Fixed.** Rows appear at once as "Preparing…"; each file starts sending as soon as its own copy is done; a row a killed app left preparing comes back failed ("add it again"), not stuck. Jest red first; the state lasts too short for the device sampler (NOT MEASURED on screen). |
| U5 | Low | Code | The old Add sheet (`AddSheet.tsx`) and seven strings were dead code since the redesign. | — | **Removed** (copy kept in the scratchpad). |
| F4 | Medium | Chats, Notifications, Calendar, a Pages folder | The AI button, asked for "on any screen", was only on Home and the Pages home. | Added only there by the new shell. | **Fixed.** Compact AI button rightmost in each header; it opens over the screen and X returns to it (device: Chats). Render sweep red first. |
| F4b | Low | Notifications | Adding it wrapped the title to "Notificatio / ns" at 360 dp. | Four controls in the header. | **Fixed.** Titles one line (shrink to 80 % if needed) on Notifications, Chats, Calendar. Device re-shot. |
| F5 | Medium | Home (French) | Two tiles both called "Discussions" (Chats, and the assistant's history). | `chat.chats` and `chat.conversations` were the same French word. | **Fixed.** French history is "Historique" (tile, sheet title, icon label). A locale test fails if the two names match again. Device re-shot. |
| F6 | Low | Notifications | The "Clear read" bin was offered on an empty list. | Always rendered. | **Fixed.** Offered only when there are notifications. Test red-planted. |
| F7 | Medium | Deep links (a tapped notification) | A COLD deep link opened its screen with nothing underneath: Back CLOSED the app. | No initial route for the root stack. | **Fixed.** `unstable_settings.initialRouteName = "home"` (`app/_layout.tsx`): Home is put under any deep-linked screen. Device: cold `multimagic://notifications` → Notifications → Back → Home. Layout test planted red. |
| F8 | Low (UX) | Account | The Account screen holds only "Privacy policy" and, at the foot, "Delete account": a near-empty page one tap deep. | — | **Not changed: his earlier decision.** `app/account.tsx` records that deletion sits alone on its own screen as a small row, so it can never be mistaken for deleting a conversation. Folding it into the sheet would reverse that, so it is his call. |
