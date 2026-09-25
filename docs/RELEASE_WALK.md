# The release runbooks, walked — an inventory, 2026-09-25

`DEPLOY_RUNBOOK.md`, `RELEASE.md` and `APP_STORE_CONNECT.md`, every step,
checked against the tree on this date. **First pass: inventory, no fixes.**
Each step gets one mark:

- **VERIFIED**: done here, now, and it worked (the command and its result
  are given);
- **DONE**: the step's own condition is already met in the tree, with the
  evidence;
- **BLOCKED ON HIM**: needs a credential, a console, a Mac or his word
  (named exactly);
- **WRONG**: the document does not match the tree (the command, path,
  number or order);
- **STALE**: true when written, overtaken since. The fix is to the document,
  not the tree.

**Premise corrected.** "Nobody has ever walked them" is true of the Android
release path, which has never produced a `preview` or `production` artefact.
It is **not** true of iOS. `APP_STORE_CONNECT.md` §2 records a production
build going out non-interactively on 2026-09-21, and build 3 submitted and
then swapped in review on 2026-09-24.

---

## The four findings to read first

1. **The release worktree is in a temporary state for his phone, and a
   build takes the working tree.** `../mm-sdk57` (the branch `RELEASE.md`
   says to build from) has two uncommitted edits:
   - `app.json` with `expo.owner` removed so Expo Go can open it by scanning,
     per `OWNER_REMOVED_FOR_PHONE.md`. The edit also removed
     `extra.eas.projectId`, which that note does not mention.
   - `app/_layout.tsx` with a `TEMPORARY PROBE` that logs at every launch.

   `APP_STORE_CONNECT.md` §2: *"EAS uploads the working tree, not HEAD."* A
   build from that worktree today would carry both edits. Without the owner
   and project id, EAS most likely fails to resolve the project (inferred
   from the note's own warning, not run), which is the loud case. The probe
   would ship silently. **The note names a backup,
   `/tmp/app.json.owner-backup`, and it does not exist.** The committed
   `app.json` still has both values, so nothing is lost yet: `git checkout --
   app.json` in that worktree restores it. That worktree is another
   session's and his phone depends on the edit, so it is flagged here, not
   touched.
2. **`sdk-57`'s `app.json` fails the SDK 57 schema.** `expo-doctor` there:
   *"should NOT have additional property 'splash'"*, at the top level, in
   `ios` and in `android`. The `e085289` merge brought `main`'s splash keys
   into a branch where SDK 57 accepts the splash only through the
   `expo-splash-screen` plugin, which the branch already carries with the
   right light and dark colours. So those keys are now duplicates the schema
   rejects. Doctor is 19/21 there, where `DEPLOY_RUNBOOK` step 4 asks for
   21/21.
3. **The on-device speech claim is false in the code.**
   `APP_STORE_CONNECT.md` §1 says `requiresOnDeviceRecognition: true` is set,
   so the speech string "becomes true rather than being reworded". It is not
   set on `main` or on `sdk-57` (0 matches). The string was reworded instead,
   and `app.json` now says Apple may process the audio, which matches the
   code. The App Privacy row "Audio: NO, dictation is on-device" leans on the
   false half. Its answer (MultiMagic's server never receives audio) may
   still be right, but its reason is not. **His to re-read before the next
   App Privacy entry.**
4. **`main` is missing a peer dependency for a release build.**
   `expo-doctor` on `main`: *"Missing peer dependency: expo-asset, required
   by expo-audio. Your app may crash outside of Expo Go."* `sdk-57` has it
   (`expo-asset ~57.0.18`). Another reason the build must come from
   `sdk-57`, or from `main` after the merge, and never from `main` as it
   stands.

---

## DEPLOY_RUNBOOK.md

| Step | Mark | Evidence |
|---|---|---|
| **A** Sign in to Apple at a terminal | **STALE** | Superseded for builds by the API-key path, `APP_STORE_CONNECT.md` §2 (`RELEASE.md` strikes the same sentence). Still his for everything in `APP_STORE_CONNECT.md` §3 |
| **B** Approve the privacy text | **DONE** | Approved; the banner came off in `362279c` (2026-09-21), `PRIVACY_IS_DRAFT = false` |
| **C** Deploy the backend | **BLOCKED ON HIM** | His server and credentials. Still pending tonight |
| 1 Mic sentence | **DONE** | Decided by rewording: `app.json`'s string now says Apple may process the audio (see finding 3) |
| 1 iPad | **DONE** | `requireFullScreen: true` in `app.json` |
| 1 Read-aloud's voice | **BLOCKED ON HIM** | No record of a choice found |
| 2 Verify the backend on the real host | **BLOCKED ON HIM** | Needs the deployed host (C). Its owner "da" is another session; the endpoint list may have grown |
| 3a One-sitting judgement | **STALE, partly** | Its numbers are 2026-09-21's (24 GB free; now 16 GB, 97%). The kept SDK 54 APK is at `~/qa-apk-keep/app-debug-sdk54-known-good.apk`, still not re-checked |
| 3 Merge SDK 57 | **NOT DONE** | `main` is still `expo 54.0.35`. `sdk-57` is 48 commits ahead and `main` 54 ahead of it (2026-09-25). Blocked by finding 2 and by the worktree's temporary edits |
| 3 Proof: four gates on `main` | **VERIFIED (pre-merge)** | `npm run bundle` exit 0 on `main` now; lint, typecheck and tests green all night. After the merge: not run, there being no merge |
| 4 Config edits | **PARTLY DONE** | iPad: done. `NSAllowsLocalNetworking`: **not done**. `RECORD_AUDIO` twice: **not done**, on both branches. `extra.apiUrl/wsUrl` `{}`: **not done**, on both |
| 4 Proof "expo-doctor 21/21" | **WRONG** | `main` has 18 checks (16 pass); `sdk-57` has 21 (19 pass). The number depends on the SDK, and neither passes |
| 5 Rebuild the dev build | **BLOCKED** | Needs step 3, then about 8 GB (16 GB free at 97%); owner "e0" is closed |
| 6 Re-run the flows | **BLOCKED** | Needs step 5. "All eighteen" is **WRONG**: 24 flow files plus 2 helpers on disk now |
| 7 Store half: "e0 owns it, not written up" | **STALE** | e0 is closed; written up in `docs/store/README.md` (2026-09-25). "`submit.production` is `{}`" is **WRONG**: iOS is wired (`ascAppId`, `appleTeamId`), Android is not |
| 8 Submit | **BLOCKED ON HIM** | His name on the submission |

## RELEASE.md

| Step | Mark | Evidence |
|---|---|---|
| Profiles table | **DONE** | `eas.json` matches, and is identical on both branches |
| "production: store builds" | **STALE** | Production now has `credentialsSource: "local"` (the iOS path). Android has no local keystore, so a local-credentials Android production build has nothing to sign with. Whether EAS may generate one then is his call and his account |
| iOS first time, interactive | **DONE / STALE** | Struck in the file itself; the API-key path replaced it |
| `eas build -p android --profile preview` | **BLOCKED ON HIM** | An Expo session for his account `hama990` is live on this machine (`eas whoami`), but running a build is his to authorise, and it would carry the `sdk-57` working tree (finding 1) |
| Package-name decision | **BLOCKED ON HIM** | Still split: `main` `co.byseven.multimagic`, `sdk-57` `com.multimagics.mobile`. Permanent after the first Play upload |
| Release keystore | **BLOCKED ON HIM** | Only `android/app/debug.keystore`; EAS-generated means his account |
| Splash in a build: "UNCOMMITTED, commit the plugin block" | **STALE** | Committed on `sdk-57`: `expo-splash-screen` light `#F7F9F9`, dark `#102125`. Its merge caused finding 2 |
| Plugin entries only `sdk-57` has | **DONE on the branch** | `expo-asset` present there, missing on `main` (finding 4) |
| `edgeToEdgeEnabled` removed | **DONE on the branch** | Absent from `sdk-57`'s android config |
| `extra.apiUrl/wsUrl`, `RECORD_AUDIO` | **NOT DONE** | Both branches, as in DEPLOY step 4 |
| The merged manifest's permissions | **BLOCKED** | Needs a built manifest |
| `expo-dev-client` excluded from release | **UNVERIFIED** | Needs a release APK |

## APP_STORE_CONNECT.md

| Step | Mark | Evidence |
|---|---|---|
| §0 The API key | **DONE, as far as a file shows** | `~/.appstoreconnect/` holds one `AuthKey_*.p8` and a `multimagic/` directory. `ASC_KEY_ID` and `ASC_ISSUER_ID` are **not exported** in this environment, so `scripts/asc.py` would stop. Values not read |
| §1 Version `1.0.0` | **DONE** | `app.json` `1.0.0` on both branches |
| §1 The icon: square and opaque | **DONE** | `assets/icon-1024.png` is RGB, no transparent pixels |
| §1 On-device speech | **WRONG** | Finding 3 |
| §1 SafeZone in the assistant's scope | **BLOCKED ON HIM** | A product decision (declare Payment Info, or exclude SafeZone) |
| §2 `scripts/asc.py`, `shots.py`, `submit-ios.sh` | **PRESENT** | All three exist; none run (no exported key, and each sends to Apple) |
| §2 `credentials.json` gitignored | **VERIFIED** | `.gitignore:108`, untracked. It exists in this worktree, not in `../mm-sdk57`. Contents not read |
| §2 Build provenance | **VERIFIED as a method** | Finding 1 is exactly what it guards against |
| §3 His boundary | **BLOCKED ON HIM** | By definition |
| §4 False greens | **DONE** | Both are carried into `docs/TESTING.md` and this repo's gates |

---

## What only he can unblock, in the order it unblocks the most

1. **The `sdk-57` worktree's temporary edits.** Does he still need Expo Go
   scanning? If not, `git checkout -- app.json app/_layout.tsx` there, since
   the backup is gone and the committed file is the good copy. If he does,
   no EAS build may run from that worktree until they are restored.
2. **The Android package name**, before the first Play upload.
3. **The Android signing key**, under his account.
4. **Backend deploy (C)**, then da's step 2.
5. **Read-aloud's voice; SafeZone and App Privacy (finding 3).**

## What engineering can fix next, without him

These were not done on this pass, by instruction:
- the `sdk-57` schema (drop the three `splash` keys that duplicate the plugin);
- `main`'s missing `expo-asset`, or leave it for the merge;
- `RECORD_AUDIO` once, and `extra` without the `{}` fallbacks;
- the runbooks' stale lines: the "21/21", "eighteen flows",
  "`submit.production` is `{}`", "e0 owns", the splash row, and §1's
  on-device claim.

---

## Second pass, 2026-09-25: what was fixed, and how

Authorised by Hamma9901, with one hard constraint: **never `git checkout --
app.json` in `mm-sdk57`**, since it carries his phone's owner/projectId
removal and its backup is gone.

- **Finding 1, the probe:** removed by Hamma9901, whose probe it was.
  The owner/projectId removal is **untouched and still uncommitted**, as
  required.
- **Finding 2, fixed on `sdk-57` in `79000c0`, committed FROM THE INDEX.** The
  three `splash` blocks, `RECORD_AUDIO` once, and the `{}` fallbacks were
  applied to HEAD's `app.json` and written into the index with
  `git update-index`, so the commit carries only those edits. The same edits
  were applied to the working copy, which still differs from the commit by
  exactly the owner and projectId lines (`git diff app.json` checked before
  and after). `expo-doctor` 19/21 → 20/21; the one left is four patch
  bumps, not taken, because changing dependencies on the release branch
  was not in the brief. `npm run bundle` exit 0.
- **Finding 3:** the §1 claim is struck and corrected in
  `APP_STORE_CONNECT.md`, and the App Privacy "Audio" row is marked for him
  to re-read. His to resolve, not ours.
- **Finding 4:** `expo-asset` was NOT added to `main`, deliberately. An EAS
  build from `main` now refuses by name in `eas-build-pre-install`
  (`scripts/release_guard.js`): exit 1 on `main` naming SDK 54 and the
  missing package, exit 0 on `sdk-57`'s `package.json`. **Unverified:** that
  EAS fails the build on that exit (Expo's page says when the hook runs, not
  what a failure does).
- **`main`'s `app.json`:** `RECORD_AUDIO` once and the `{}` fallbacks
  removed. The splash stays, because on SDK 54 it IS the splash. This makes
  the rig's preflight ask for a rebuild (`app.json` is native config), which
  run 9 needed anyway.
- **Stale lines corrected in place, dated, the old claim struck:**
  - DEPLOY_RUNBOOK: A, B, step 1 (mic and iPad), 3a (disk), step 4 (the
    "21/21" proof and what is done), step 6 ("eighteen"), step 7 (e0, and
    `submit.production`, plus the Android keystore);
  - RELEASE.md: the Android-only "never run", the splash row, the extra and
    RECORD_AUDIO rows, and the guard;
  - STORE_READINESS §5 and §8, where §8 "never bit".

**Still his, named:** Expo Go scanning (whether `mm-sdk57`'s `app.json` can
go back to its committed state), the Android package name, the Android
signing key (`credentialsSource: "local"` has nothing to sign Android with),
exporting `ASC_KEY_ID` / `ASC_ISSUER_ID`, the backend deploy, read-aloud's
voice, SafeZone and App Privacy.
