# Missing features (owner's list)

Things the owner noticed are missing while using MultiMagic. They are not bugs: the app works, but a feature isn't there yet.
Build them when MultiMagic work resumes. Newest at the bottom. Mark an item done with the commit that adds it.

| # | Date | Where | Missing | Notes for the build | Status |
|---|---|---|---|---|---|
| 1 | 2026-11-09 | Pages → Home, multi-select (Android, emulator qa_phone) | **Download several files at once.** With 2+ items selected, the top bar has only star / move / delete. | Add a Download action to the multi-select bar. Real files only (photo, PDF, mp3…); pages and folders are skipped, with a short note saying how many were skipped. Save each file one after another, with progress. Check iOS too. | **Built** on branch 1.1.1 (`downloadMany.ts`, the selection bar's Download): the system asks once for a folder, files go there one by one. Files/Downloads, not the Photos gallery (that needs a new native module; asked of the owner). Jest red first; device QA pending; iOS in `IPHONE_CHECKLIST.md` §7. |

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
- **Editing a very long note on the phone** (measured 2026-11-13). Engine B refuses a 900 KB invented note: `POSITION_EPOCH_LIMIT_EXCEEDED`, a limit inside its compiled Rust core that JS cannot configure. The note opens in the read view with "cannot open", and nothing is sent (the guard in `engineHolds.ts` plus B's error listener). The exact threshold is not measured yet: `qa/scripts/epoch_probe.py` measures it in the next device slot (deep link, no app navigation). Fix paths: ask upstream for a configurable `maxPositionEpochRetainedBytes` (draft in `docs/design/notes/ENGINE-B-ISSUE-position-epoch.md`, not filed: it waits for the owner's yes), or edit long notes section by section.
- **Reminder delivery from the server: email + in-app notification** (owner, 2026-11-13: deferred, "we note it, we'll do it later"). Today reminders are local notifications on each phone (multi_magic PR #22 stores them). A phone that has not opened the app since the reminder was set does not ring. Design, ready to pick up:
  - **Scheduler** (multi_magic branch on top of PR #22; no merge, no deploy). The app's existing job system runs a periodic sweep, e.g. every minute: reminders that are due and not yet sent for this occurrence. It delivers at `launch_time`, then re-arms per `repeat_frequency` (daily/weekly/monthly). It is idempotent: a `last_sent_at` or occurrence key prevents double sends. The timezone is the user's.
  - **Email:** the existing mailer and layout, localized (en/fr), with the note title, a snippet and a link that opens the note.
  - **In-app notification:** a record in the existing notifications model, the one the mobile Notifications screen and the web bell read. Tapping it opens the note, on mobile and on the web.
  - **Cancel or skip** when the note is archived, trashed or deleted, or the reminder is removed.
  - **Specs first** (request + job, red→green): due → 1 email + 1 notification; repeat re-arms; no duplicate on a second sweep; trashed → nothing.
  - **Mobile:** keep the local notification as the offline fallback, without double notifications. Once the server has delivered, the next sync cancels the local one for that occurrence (or dedupes by occurrence id). The notification row deep-links to the note.
