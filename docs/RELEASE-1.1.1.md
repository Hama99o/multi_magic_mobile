# MultiMagic mobile 1.1.1 — for the morning of 2026-11-10

Branch **`1.1.1`** (not pushed). `app.json` version **1.1.1**. The build
number is EAS's (`appVersionSource: remote`, `autoIncrement` on
production/testflight): the next iOS build after 1.1.0's build 8 becomes **9**
by itself.
`app.json` keeps `owner` and `extra.eas.projectId`. The temporary edit that
removes them lives only in `~/Apps/Personal/mm-sdk57` (uncommitted), so leave
that worktree alone.

## What changed (since 1.1.0, `main` b6e4866)

| Commit | What the owner will see |
|---|---|
| `6bd5622` | Pages: select several files → **Download** (Android asks for a folder; iOS opens Files) |
| `d1cacde` | …and when every selected file is a photo or video, they go to **Photos/Gallery** instead |
| `432a2e7` | **Fix found on the device:** Download to a folder saved nothing (3 empty files, "could not be saved"); gallery copies had cache names (`pages-3392-…-IMG_2041.jpg`) |
| `a5fab27` | **Empty trash** no longer errors when a folder and its own child are both in the trash (the web bug of 2026-11-09, mobile side) |
| `58558d4` | A **play badge** on a video's thumbnail (list, grid, sheets), once the server makes thumbnails |
| `bdb521d` | Tests for F2 (Conversations tile opens history) and F3 (Pages links open in the app) |
| `ef41162` | **Fix found on the device:** "Copy answer" pasted `**markdown**` and a `/rails/active_storage/…` path; now plain text |
| `60f5037` | **Fix found on the device:** an attached file said "Reading…" for minutes after the server had read it |
| `2218191` | **Fix found on the device:** every one-off calendar event showed the "repeats" icon |
| `87bb042` | **Fix found on the device:** AI keys → Remove deleted the key in one tap; it now asks first |
| `eb996ec` | Tests: about 300 tests were silently not loading after the gallery change; all suites load again |
| (this commit) | version 1.1.1, QA_FULL verdicts, this file |

## QA results

Device: `qa_phone` (Android emulator, emulator-5556), the 1.1.1 dev build,
QA account only. Verdicts and evidence for every row are in
`docs/QA_FULL.md`. The contact sheet is `~/mm-qa-1.1.1/contact-sheet-1.1.1.png`
and the single shots are `~/mm-qa-1.1.1/NN-*.png` (QA account only; not
committed, the repo is public).

- **Pass:** sign in / wrong password, sign out → sign in (Home and assistant
  sheets), forgot password, ask, history (list, switch, new, delete
  open + cancel), attach, answer actions, keyboard, chats list, thread (send,
  reaction, offline retry), calendar (empty, filled, tap composes), profile
  (name, avatar), change password, privacy, AI answer links, F2, F3,
  Download → Files, Download → Gallery (incl. a video), Empty trash with a
  folder and its child.
- **Found and fixed on 1.1.1, with tests (red first) and re-checked on the
  device:** the 5 "Fix found on the device" rows above.
  The AI-keys confirmation is checked in Jest only. The tap that found the bug
  removed the QA account's own gemini key, so there was no key left to try it
  on.
- **NOT MEASURED, with the reason:**
  - two-factor (the QA account has none);
  - sign-up submit (it would create a real user in the dev DB);
  - dictation text arriving (the emulator has no speech);
  - gallery permission refused (Android 14 asks none to add photos; that
    path is iOS);
  - play badge (needs ffmpeg on the server, so check it after the deploy);
  - page_space links;
  - AI keys add/replace;
  - chats empty state.
- **Not in the app:** Sessions (devices) is a web-only screen.
- **Gates on the final tree:** lint ✓, typecheck ✓, Jest 117 suites /
  1530 tests ✓, bundle ✓.
- **iOS can't be QA'd on this box.**

## Needs the owner

1. **"Oui" for the server deploy and for the builds.**
2. **QA account's AI key:** the gemini key was removed during the QA (the bug
   above). The assistant keeps working on MultiMagic's own key. To restore it:
   AI keys → Add a key (needs a real gemini key; I did not read one from any
   `.env`).
3. **Possible improvements, not bugs:**
   - with a photo attached, the assistant searched Pages instead of reading
     the photo (server/AI side);
   - a file link written inside an answer opens the "opens outside
     MultiMagic" sheet, where it could open the Pages viewer;
   - sign-up errors are the server's English sentences.
4. 1.1.0 (TestFlight build 8) is still waiting for its App Store "oui". 1.1.1
   is the next build on top of it.

## Commands

### Server (Hello runs these after the owner's "oui")

```sh
cd ~/Apps/Personal/multi_magic
bin/kamal/migrate db:migrate:status      # read-only; master adds NO migration file
ssh <MM VPS> df -h                       # read-only
git push origin master                   # a587ee72 + 3b823940 (4 commits); may trigger CI deploy
bin/kamal/deploy                         # if CI does not deploy
```

Optional, its own decision: video thumbnails, branch `video-previews`
(`e5a5a083`: ffmpeg in `Dockerfile.prod`, +387 MB image). Merge it into master
before the deploy if the play badges should show.

The app and the server can ship in either order. Uploads fall back to one
request when the server has no resumable endpoint (404), so nothing breaks.

### Mobile builds (after the owner's "oui"; the EAS quota is small, so iOS first)

```sh
cd ~/Apps/Personal/multi_magic_mobile
git checkout 1.1.1 && nvm use
npm run lint && npm run typecheck && npm test && npm run bundle
./scripts/eas-build.sh -p ios --profile testflight      # build 9, auto-increment
./scripts/submit-ios.sh --latest                        # to TestFlight
./scripts/eas-build.sh -p android --profile production  # Play (when wanted)
```

Merge `1.1.1` into `main` once 1.1.0 is accepted. The push of this branch is
also Hello's call.

## State when MM was stopped (2026-11-10, ~11:05)

- `npm test` is RED at its `pretest` gate. Jest itself (1530/1530), lint,
  typecheck and bundle are green. Cause: `qa/flow_lint.py` reports 5 VERDICT
  findings. Flows 07-notifications, 08-calendar, 13-profile, 20-refresh and
  23-pages were changed in `b6e4866` (the 1.1.0 commit: Home-tile doors, a
  360 dp swipe, the new Pages flow), and their `qa/FLOW_REGISTER.md` rows
  still carry 2026-09/2026-11-06 dates.
- The fix is to RE-RUN those 5 flows on one emulator
  (`AVD=qa_phone USE_DEV_BUILD=1 ./qa/qa.sh flow <name>.yaml`) and write the
  measured verdict with today's date. Never bump a date. Not done: stopped
  before the emulator finished booting.
- Earlier passes used `npx jest` directly, which skips `pretest`; that is how
  this was missed. Build 11 went to App Store review without this gate.
