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
