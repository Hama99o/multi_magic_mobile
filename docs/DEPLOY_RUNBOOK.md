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
