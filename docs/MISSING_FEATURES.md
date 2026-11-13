# Missing features (owner's list)

Things the owner noticed are missing while using MultiMagic. They are not bugs: the app works, but a feature isn't there yet.
Build them when MultiMagic work resumes. Newest at the bottom. Mark an item done with the commit that adds it.

| # | Date | Where | Missing | Notes for the build | Status |
|---|---|---|---|---|---|
| 1 | 2026-11-09 | Pages → Home, multi-select (Android, emulator qa_phone) | **Download several files at once.** With 2+ items selected, the top bar has only star / move / delete. | Add a Download action to the multi-select bar. Real files only (photo, PDF, mp3…); pages and folders are skipped, with a short note saying how many were skipped. Save each file one after another, with progress. Check iOS too. | **Built** on branch 1.1.1 (`downloadMany.ts`, the selection bar's Download): the system asks once for a folder, files go there one by one. Files/Downloads, not the Photos gallery (that needs a new native module; asked of the owner). Jest red first; device QA pending; iOS in `IPHONE_CHECKLIST.md` §7. |
| 3 | 2026-11-12 | Contacts, tablet (≥ 800 dp) | **Contacts tablet split.** On an 800 dp tablet the list is one phone-width column with small text and a lot of dead space (device shot `docs/design/contacts/ours/800-dark-fr-list.png`, sheet tile 18). | List on the left and the contact card on the right at ≥ 800 dp, as the owner chose for Notes. Check the font is not scaled down on the tablet. Test-first (layout split by width), then a new 800 dp device shot. Supervisor review of the Contacts sheet, 2026-11-12. | **To build** (after SafeZone's desk work, at the next emulator slot) |
| 4 | 2026-11-13 | SafeZone (native) | **Biometric unlock, password autofill, native clipboard expiry.** (a) Face ID / fingerprint via `expo-local-authentication` means keeping the PIN in SecureStore behind `requireAuthentication`, which reverses SafeZone's "the PIN is never stored" rule: the owner's call. (b) Password autofill at sign-in needs an iOS credential-provider extension and an Android Autofill service. (c) `expo-clipboard` exposes neither iOS `UIPasteboard` expiry/local-only nor Android 13's sensitive-clip flag (the flag is now set by the local module `modules/sensitive-clipboard`, 2026-11-13; device check D10 pending), so a killed app leaves a copy behind until MultiMagic is opened again (measured on Android, device pass D12, 2026-11-13; the next open now clears it through a keyed marker, `SECURITY.md` §6) | `docs/design/safezone/SECURITY.md` §9, `SPEC.md` §F. All three need a native build | OPEN |

## BUG (owner, 2026-11-10, iPhone): a video titled without ".mp4" cannot be saved to Photos
- Seen: the Pages file "Hatiwal 1.2.1 promo (ps) v1" (video/mp4, 52.6 MB) → Download → the iOS share sheet shows a blank "File" with no "Save Video".
- Cause (read in code): `downloadToCache` (src/api/pages.ts) names the cache file `pages-<id>-<stamp>-<title>`. When the title has no extension, iOS cannot tell that it is a video. The multi-download in 1.1.1 has the same root (downloadMany.ts).
- Fix: when the title has no extension, append one from `mimeType` (video/mp4 → .mp4, image/jpeg → .jpg, …), and drop the `pages-<id>-<stamp>-` prefix from the name the user sees (keep it as a cache sub-folder instead). Test-first; target 1.1.2.
- Workaround today: the same video was re-uploaded titled `promo-1-2-1-ps-v1.mp4`.

## BUG (owner, 2026-11-10, web): sharing a space with an email that has no account shows "Something went wrong"
- The server answers 404 {"message": "User not found with that email"} (Api::V1::PageApp::SharesController#find_share_recipient), but the web share dialog only shows the generic toast.
- Fix: show the server's message ("No MultiMagic account uses this email yet"), and ideally offer "Send an invitation to sign up" (an email with a sign-up link that applies the share once the account exists). Server + web; check mobile too.
