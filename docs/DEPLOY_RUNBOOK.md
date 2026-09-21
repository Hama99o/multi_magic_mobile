# Shipping MultiMagic — the order, the owner, and the proof

One page. Follow it top to bottom without reading anything else; every step
says **who**, **what proves it worked**, and **when to stop**.

Nothing here is a rewrite of somebody else's document. Where the detail lives
elsewhere it is linked, and where the work is not finished it says so rather
than guessing.

---

## Before anything: three things only Hamma9900 can do

These are not steps, they are **prerequisites that stop the run if they are
missing**, and each has a lead time longer than the rest of this page.

| | What | Why it blocks | Lead time |
|---|---|---|---|
| **A** | **Sign in to Apple** at a terminal, for the bundle id and provisioning. `docs/RELEASE.md` §"iOS, first time on a new bundle id" has the exact commands. | No iOS build of any kind without it — not TestFlight, not a dev build on his own phone. | Minutes, but it must be **him**; nobody else has the account. |
| **B** | **Approve the privacy text.** `docs/PRIVACY.draft.md`, then update the document's title line. | `app/privacy.tsx` renders *"Draft — not yet approved"* until that line changes, and the screen is two taps from anywhere. Both stores have reviewers who open it. `docs/STORE_READINESS.md` §3. | Reading time. It is a legal statement about his users' data, not a formality. |
| **C** | **Deploy the backend.** His server, his credentials. | Everything from step 2 down is against a host that must already be answering. | Whatever his deploy takes. |

**If any of the three is not done, stop here.** The rest of the run produces
artefacts that expire or get rebuilt.

---

## 1 · Decide the three open product questions — Hamma9900

They are in `docs/STORE_READINESS.md` with costs, and **none of them has a
right answer somebody else can pick**:

- **The microphone sentence** (§4). The app tells a user speech becomes text
  *"on this device"*, and the code does not request on-device recognition, so
  on iOS the audio may go to Apple. Make the sentence true — worse recognition,
  older hardware falls back — or change the sentence. **This one should be
  decided even if shipping slips.**
- **iPad** (§1). `requireFullScreen: true` keeps portrait and is honest about
  what has been tested; `supportsTablet: false` ships phone-only.
- **Read-aloud's voice.** It is live and defaults to the server's voice with
  the phone's as a fallback that says so. He has not chosen the voice; it is
  one setting, not a rebuild.

**Proof:** answers written down. The config edits that follow from them are
step 4's, not his.

---

## 2 · Verify the backend on the real host — da

The local backend is not the one his phone talks to. The endpoints that are
**new or known-absent in production** must be checked against the deployed
host before anything mobile happens:

- `DELETE /api/v1/users/me` — account deletion. Store requirement.
  `docs/API_ASKS.md` §1.
- `GET /api/v1/ai/messages/:id/speech` — read-aloud. **Known missing in
  production** as of 2026-09-19; the app falls back to the phone's voice and
  says so, so this is a downgrade rather than a break.
- `GET /api/v1/users/connected_user` — the cold-start user fetch.
- `PUT /api/v1/users/reset_password` — the forgot-password link.

> **da owns the exact list and the verification.** If a fourth or fifth
> endpoint has landed since, it belongs here — this is a pointer, not a census.

**Proof:** each answers on the production host with a real session, not a
local one. **Stop if deletion is missing** — it is a store requirement, not a
feature.

---

## 3a · Can steps 3–6 be done in one sitting on THIS box? — e0's judgement

**Yes, and only in one ordering.** Asked for on 2026-09-21 by the session that
has watched this emulator fail in every way it fails. Everything below is a
measured number or a failure that actually happened; where it is a prediction
it says so.

### Build the APK BEFORE the merge, not after

This is the whole answer and the rest is detail.

Step 3 breaks the rig **immediately and on purpose** — an SDK 54 binary refuses
an SDK 57 bundle. Step 5 fixes it. **Between them there is no working device**,
and `adb install -r` overwrites the only known-good binary on the way past. So
if the build fails, or produces an APK that will not launch, there is no
fallback: the device cannot run a flow, cannot shoot a picture, and cannot tell
you whether the app works — and getting back means a full SDK 54 rebuild.

Two ways to close that, and either is enough:

1. **Build from the `sdk-57` worktree first**, install it, watch it reach
   sign-in, and only then merge. Main never has a dead-device window.
2. **Or keep the current APK.** `cp android/app/build/outputs/apk/debug/app-debug.apk
   ~/app-debug-sdk54.apk` before anything. 209 MB, and it turns a rollback from
   a rebuild into an `adb install -r`.

**Do one of them.** The runbook's "If it goes wrong" currently says step 6 stops
the run, which is right, and then there is nothing to stop *to*.

### Shut the emulator down for the build

Not an optimisation. This box **hard-rebooted from memory exhaustion on
2026-09-15** (`CLAUDE.md`), and a gradle build with parallel workers, plus a
2 GB AVD, plus Metro, plus another session's Jest is exactly that shape. The
emulator is useless during the build anyway.

Measured now, for the next person to compare against: **31 GB total, 15 GB
available, and `pswpout` is 1 since boot** — this box has essentially not
swapped. That is the number to re-read before starting, not free RAM: swapping
is what preceded the reboot.

### Disk is the constraint that will actually bite

**24 GB free at 95%.** The `android/` tree is 3.0 GB and `~/.gradle` is 5.3 GB
— 8.3 GB already spent on the SDK 54 build, and `QA_HANDBOOK.md` records ~8 GB
for a build. An SDK bump invalidates much of that cache rather than reusing it,
so budget a second 8 GB, not a delta.

**Delete `android/` before the prebuild.** It is generated, gitignored build
output, `expo prebuild` regenerates it, and it reclaims 3 GB — and it removes
the risk of SDK 54 artifacts confusing an SDK 57 prebuild, which is a
reasonable worry rather than an observed one. **Do not clear `~/.gradle`**
wholesale; that is a long rebuild of things the bump does not invalidate.

If free space drops under ~10 GB mid-build, stop rather than continue. A
build that fills the disk leaves both trees broken.

### Wait for a quiet box

`qa/screens.sh` refuses above load 12, on two measurements: at **15.5** the
Pixel Launcher itself ANR'd and a flow died on a dialog indistinguishable from
a failed assertion; at **7.5** twelve flows ran clean. A gradle build under
another session's full suite is slow and is where an OOM would come from.
`uptime` first, and ask the other sessions to hold.

### `nvm use` first, as its own command

The box default is **v18.18.0**; `.nvmrc` pins **22.19.0**. Expo's metro-config
calls `Array.prototype.toReversed`, so on the default node the bundle gate dies
with `configs.toReversed is not a function` — an error naming neither Node nor
a version. And `nvm use` inside a pipeline is a no-op: the subshell takes the
PATH with it.

### What actually proves it worked

"The build succeeded" proves the build succeeded. In order, cheapest first —
this is `docs/TESTING.md` §12 applied to a rebuild:

1. `npm run bundle` on the merged tree. One minute, and it is the only gate
   that runs the real bundler.
2. The APK installs and the app reaches sign-in. **Two minutes, and if this
   fails nothing after it means anything.**
3. `01-ask` — the socket and a real answer end to end.
4. `09-keyboard` — edge-to-edge is unconditional in SDK 57, so this is the
   flow most likely to move, and it is the one that had never been run until
   somebody checked.
5. Then the rest of step 6.

### Two costs to name rather than discover

**The 72 design screenshots become evidence for a binary that no longer
exists.** If SDK 57 moves any layout, `ours/` is stale and `DONE` is stale with
it. Re-shooting is about forty minutes with `qa/screens.sh`, and it is not
optional if anything moved — but nothing can tell you whether anything moved
except looking.

**And expect two system ANRs per display change.** Normal on this AVD, dismissed
and counted by `screens.sh`, and they read exactly like the app failing.

### Time, honestly

Off-device: prebuild 2–4 min, gradle **15–25 min** on a cold SDK 57 cache (the
only duration recorded on this box is `BUILD SUCCESSFUL in 3m 21s`, and that
was warm). On-device: install 2–3 min, smoke 3–4 min. **Under 10 minutes of
device time; the rest is waiting.** Step 6 in full is 45–60 minutes, and a
re-shoot another 40.

So: one sitting, yes — roughly two hours with the re-shoot, and the only part
that cannot be interrupted safely is between the merge and a working installed
binary. Close that window first and everything else can stop and resume.

---

## 3 · Merge SDK 57 — e7, with e0 told first

Branch `sdk-57`, worktree `../mm-sdk57`, currently green on all four gates and
tracking `main`. `SDK57_BASELINE.md` on that branch has what changed and why.

**This step breaks e0's rig, on purpose and immediately.** The installed dev
build is SDK 54 and will refuse an SDK 57 bundle — the same refusal that
started all this, seen from the other side. So it must not happen while a
picture set or a flow run is outstanding.

**Proof:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run bundle` on
`main` after the merge. All four, not three.

---

## 4 · The config edits — e7

Held deliberately until now because they conflict with a live branch.
`docs/STORE_READINESS.md` has each with its fix: the iPad declaration (from
step 1), `NSAllowsLocalNetworking` scoped to the development profile only,
`RECORD_AUDIO` declared once, and the empty `extra.apiUrl` / `extra.wsUrl`
removed so a missing variable fails loudly instead of handing
`"[object Object]"` to a URL.

**Proof:** `npx expo-doctor` at 21/21, and `npm run bundle` exit 0.

---

## 5 · Rebuild the dev build — e0

`docs/RELEASE.md` §Profiles. Mandatory, not an optimisation: five React Native
minors, six new config plugins, the new architecture now unconditional, and
`expo-speech-recognition` across a major.

**Proof:** the app launches on the emulator and reaches sign-in.

---

## 6 · Re-run the flows against the new binary — e0

All eighteen in `qa/flows/`, plus `99-screens`. `qa/FLOW_REGISTER.md` is the
record and `qa/QA_HANDBOOK.md` the method.

Two that matter more than the rest after this particular rebuild:

- **`09-keyboard`** — edge-to-edge is now unconditional in SDK 57, so
  `behavior="padding"` is load-bearing rather than defensive.
  `ScreenContainer.tsx`'s header says why.
- **`06-people-chat`** — passed at `67f698b`, and the reaction gesture is the
  one thing in the app that Android's own text selection can take away again.

**Proof:** the register updated with which case actually ran, not only that it
passed. **Stop on any fail** — a rebuilt binary failing a flow that passed
before is a regression, not flakiness.

---

## 7 · The store half — e0, then Hamma9900

Icons, listing screenshots, the data-safety and privacy declarations in both
consoles. **e0 owns the device half of this and it is not written up here**
— when it is, this step should point at it rather than describe it.

`eas.json`'s `submit.production` is `{}`: no App Store Connect or Play
credentials are wired yet. That is the next thing after prerequisite **A**,
and it is his account.

---

## 8 · Submit — Hamma9900

His account, his declarations, his name on the review reply.

**Proof:** a build in review, and the privacy policy URL resolving to the
approved text rather than the draft.

---

## If it goes wrong

- **A flow fails after the rebuild** → step 6 stops the run. Do not re-run
  hoping; `docs/TESTING.md` §6 is about exactly that.
- **The bundle fails after a config edit** → step 4's proof caught it, which
  is what it is for. `docs/TESTING.md` §1 is why that gate is in the list.
- **The app cannot reach the backend on a dev build over LAN** → almost
  certainly ATS, not the backend. `docs/STORE_READINESS.md` §2.
- **Read-aloud is silent** → expected if step 2 found the speech endpoint
  missing. It should fall back to the phone's voice with a line saying so; if
  it is silent *with no line*, that is a real bug and not this.
