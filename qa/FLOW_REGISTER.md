# Flow register

Every flow, its verdict, and — the column that earns this file — **what it does
not cover**. A flow is trusted for exactly what it asserts and nothing more, and
the commonest way a rig lies is by being read for more than it claims.

Verdicts are from run 3 (2026-09-18, `qa_phone2`, Expo Go 54.0.8, real backend
at `10.0.2.2:3001`). `NOT MEASURED` is a distinct verdict from `FAIL`: exit 3,
not 1 — a blocked preflight has found nothing, not a bug.

| Flow | Covers | Does NOT cover |
|---|---|---|
| `login.yaml` | Sign in with the QA account; signs out first if a session is already open, so every flow starts the same way | Nothing about sign-up or password reset. Not 2FA — the account has it off, and the 202 branch is API-layer only |
| `01-ask.yaml` | **The product.** Question drawn immediately from the 202's own id, dots where the answer will land, and an answer that actually ARRIVES over ActionCable — the only test that exercises the socket at all | **Not the RAG answer itself.** The QA account has no AI provider key, so every reply is the missing-key message. The transport is proven; the retrieval is not. Not reconnect: forcing a socket drop mid-flow is not scripted yet |
| `02-sign-in.yaml` | Empty-submit validation, a real 401 rendering as "That email and password do not match", and both ways out being present. Screenshots at each step | **Not the 429.** Tripping the login rate limit (10 per 3 min) would lock the QA account out of the rest of the suite. Covered by unit test instead |
| `03-dictation.yaml` | **REWRITTEN 2026-09-19.** The composer works with or without a recogniser (every binary); then it branches on `APP_ID` — Expo Go: the mic is **absent**; dev build: the mic is **present**, tapping it answers with either `composer-listening` (cancel asserted, and it cancels) or `composer-mic-refused` (the line, and **the button stays**), each branch hard | **Which branch ran is in the `.log`, not in the exit code.** If a future Maestro stops exposing `-e` params to the JS sandbox both branches are skipped and only the composer assertions will have run — a NOT MEASURED, and the header says to read the log. Not the permission dialog itself: Android asks once per install, so the tap is optional and only the OUTCOME is asserted. It used to assert absence unconditionally, which became false the day the rig started driving the dev build |
| `04-delete-conversation.yaml` | **REWRITTEN 2026-09-19.** The row menu's order (Clear first) and the clear hint; a rename, so every later step addresses the conversation this flow made; the delete confirm's **wording**, both halves, including the guarantee naming notes, contacts, loans and money; **Keep it**, and the row still there afterwards; then that same conversation **deleted for real**, and the app landing in the fallback the server hands back. Rows are reached by their menu's "Options for …" label, never by a record id | **Only what it created.** It used to press Keep it and stop, so every run left one more conversation behind: at 50 (`MAX_PER_USER`) "New conversation" is disabled and this flow, `15` and anything else that starts one would fail on a full fixture rather than on a bug. Stops as NOT MEASURED if the account is already at the cap. Not Clear, Rename's validation, Search in or How to answer. Not the with-files wording — a new conversation has none; `deleteQuestion()`'s three forms are unit-tested |
| `05-upload.yaml` | The attach sheet: the three ways a person has a file, and that it says which types it takes | **Not an upload.** The system file picker is outside the app; driving it is a separate and flaky problem. The nine-extension rule is covered by unit test |
| `06-people-chat.yaml` | **FAIL — 2026-09-19 17:00, dev build `co.byseven.multimagic`, tree at `5e37367` + e7's uncommitted i18n.** Reached by `chat-open-chats`; `chats-list`, a thread opened by row, `thread-list` and `thread-title` present, the composer present and typed into. It fails at `people-composer-send`, and the failure is the screen's, not the flow's: **with the keyboard up the composer is off screen.** Frames side by side in `qa/evidence/06-people-chat/` — `07-thread-open.png` has the field and the send arrow at the bottom with the keyboard down; `not-met/step-024-*.png` has the same thread with the keyboard up, three messages, and no composer at all. A person typing here cannot see the words or reach send. `09-keyboard` asserts exactly this for the assistant's composer; the people thread has no such cover. **Reported to the owner, not fixed here.** | **Not the other side.** Whether a message from another person renders LEFT — the half of the `sent_by_me` trap that matters most — needs a second signed-in account and the rig has none. **Not the double tick**, **not the unread divider**, same reason. Nothing about groups. And nothing past the send: the reaction chip and the long-press sheet were never reached, so they are UNRUN rather than passed. One more thing seen and not asserted: at `07-thread-open` the thread renders EMPTY and fills in a moment later, so `thread-list` can pass against a list with nothing in it |
| `07-notifications.yaml` | **PASS — 2026-09-19 17:05, dev build, tree `5e37367` + e7's uncommitted i18n. A THIN PASS, and the thinness is the point.** Reached by `chat-open-notifications`; `notifications-list` present; the QA account has no notifications, so it took the **empty branch** and asserted *"You're all caught up."* and nothing else. That is a real pass of reachability and the empty state, and it is all it is | **The whole substantive half was SKIPPED, not passed.** Everything behind `notifications-empty` being absent never ran: the date heading, tapping a `notification-row-*` through to a composed question, the *"What is this about:"* prefill, the row marked read on return, **Mark all as read**, and the **Clear read notifications** confirm with its *"Anything still unread stays where it is."* wording. Six of the flow's eight screenshots were never taken. To measure any of it the QA account needs a notification, and nothing in the rig makes one — a flow cannot create one without a second account or a server-side write, and `RIG_CONTRACT.md` §3 rules the second out. Recorded as UNRUN inside a PASS rather than left to look covered |
| `08-calendar.yaml` | **PASS — 2026-09-19 17:10, dev build, tree `5e37367` + e7's uncommitted i18n. Thin, like 07, and for the same reason.** Reached by `chat-open-calendar`; `calendar-list` present, the *"What's next"* heading, and `calendar-day-today` — the ternary testID that is a fixed handle for today and a date-keyed one for every other day, so today is addressable without a record id. The QA account has no events today, so it took the **`calendar-nothing-today`** branch and asserted *"Nothing today."* | **The branch with events in it never ran.** Everything behind `calendar-nothing-today` being absent is UNRUN, not passed. Same shape as 07: the QA account holds no calendar data and the rig will not create any — nothing in `qa/` writes to that backend, by `RIG_CONTRACT.md` §3, and the database behind it is his real one. A fixture account with a seeded week is what would measure this, and that is a decision about his data rather than a gap in the flow |
| `09-keyboard.yaml` | **UNRUN.** With the keyboard raised, the field, the send button and the attach button are all on screen and hittable — the iOS mistake Android's resize hides; then the draft **survives the keyboard closing** (asserted on the field's own text, not just its presence), and the clear control appears with a draft and clears it | **Not iOS, which is the platform the assertion exists for** — an Android emulator cannot show whether `KeyboardAvoidingView` is doing the work or the window resize is. Not a FLOATING keyboard (Gboard's mode on this AVD), which produces no inset at all and is the easy case. The `hideKeyboard` here is a deliberate Back press with an IME provably up; see the flow's comment |
| `signed-out.yaml` | Helper, like `login.yaml`: ends on the sign-in screen by signing OUT through the sessions sheet's own row — the way a user does — so the auth flows start where a stranger starts | Does not wipe storage. `clearState` would erase the device fingerprint every token is bound to, and under Expo Go it lands on Expo Go's error screen |
| `10-sign-up.yaml` | **PASS** — run 7, dev build, 2026-09-19 (see *Run 7 — six verdicts*). Reachable from sign-in's "Create account"; validate-on-press with copy that names name, email and password; a TAKEN address — the QA account's own, the only one the rig may type — refused in the server's own words, "has already been taken", which is the JSON:API `errors[].detail` shape only this screen parses; nothing created and nobody signed in (still on sign-up, no composer); the way back to sign-in | **Does not create an account.** The 201 path — Devise signs the new user in and the app lands on the assistant — is unit-tested only; making users in his real database on every run is not a test. Not the 429: `rack_attack.rb` throttles `/users`, the route is `/users/signup`, so it never fires (backend finding). Walks past two app findings it records in its header: `detail` names no attribute, so the screen says "has already been taken" without saying what; and lastname is required by the server and not by the app |
| `11-forgot-password.yaml` | **PASS** — run 7, dev build, 2026-09-19 (see *Run 7 — six verdicts*). Reachable from sign-in's "Forgot password"; validate-on-press with copy naming the email; the error clearing as you type; the QA address submitted with the keyboard's Go key (`returnKeyType="go"`); the server ACCEPTING — `forgot-password-sent` renders on a 2xx and on nothing else — and the copy that does not say whether the address was known; back to sign-in | **Not that mail arrived, and not the link.** The confirmation step is web-only in v1 by design. Not a non-existent address: the server answers 200 either way, so the screen has nothing to branch on, and the rig types no address but the QA account's. **Budget: 5 per 15 minutes per IP** (`rack_attack.rb`); a run past that fails on the sent state with `too_many_requests` on screen, which is the throttle and not the app. Every run puts a real reset token on the QA account and a real mail in its inbox |
| `12-account.yaml` | **PASS** — run 7, dev build, 2026-09-19 (see *Run 7 — six verdicts*). The Appearance control in the sessions sheet; System chosen first so the baseline photograph is honest; Dark chosen, `selected` asserted, and the assistant PHOTOGRAPHED dark (66 vs 68 is the artefact); the choice **surviving a relaunch** — `hydrate()` before first paint — which is the store's reason and the one thing a screenshot cannot show; restored to System; the Account screen with its two rows and the warning caption before the delete tap; Back | **Not that dark is correct** — no assertion reads a colour; a person compares 66 and 68. **Not the language switch: it does not exist** (see Run 7). Not System following the phone: the emulator's own scheme is not toggled. Does not go through the privacy or delete doors — 17 and 18 do |
| `13-profile.yaml` | **PASS — 2026-09-19 17:30, dev build, tree `5e37367` + e7's uncommitted i18n. Five runs to get there, and four of them were the flow's fault, not the screen's.** Covers: the photo sheet rather than the picker; first name, last name and About; the email row **locked with its reason**; About edited, saved, `profile-saved` shown; the three rows below (`profile-password`, `profile-keys`, `profile-web`); and then the screen LEFT and RE-ENTERED so the About is read back from the server rather than from component state — which is the only part of this flow that proves anything survived the network | **Four defects in the flow itself, all now fixed and all worth keeping written down.** (1) `profile-web` is the last row and off the fold; a bare `assertVisible` failed on a row that was present. (2) `scrollUntilVisible` reported *"No visible element found"* and `scroll` reported COMPLETED — **both without moving the screen at all**, proven by the failure frame still showing the header and every field. Only an explicit `swipe` moves it. (3) After swiping, the header scrolls too, so `tapOn: "Back"` failed on a control above the viewport — it swipes back up first, and still taps the header's own Back rather than `pressKey`, because a system Back would pass even if the button were missing. (4) The round-trip assertion is **start-anchored, not a full match**: `eraseText` erases backwards from the cursor and `tapOn` puts the cursor where it tapped, so the field came back reading `…13-profile.yaml/13-profile.yaml`. The tail is bounded, not growing without limit, but a full-string match would fail on a save that worked. **Not the disabled Save state** — a disabled Pressable can drop out of the tree. **Not a photo**: the sheet is opened, the picker is not. One environmental note: a run during a sibling's Docker rebuild (load 16) died on an Android ANR dialog, which reads exactly like a failed assertion |
| `14-change-password.yaml` | **PASS — 2026-09-19 17:34, dev build, tree `5e37367` + e7's uncommitted i18n. First run, no flow changes needed.** The assertion this flow exists for HELD: a wrong current password comes back **422 against the field** — `password-wrong-current` and *"That password is not right."* — and **does not sign you out**. `sign-in-email` absent, `password-done` absent, the field still there, and Back lands on the profile and then on the assistant. Also covers the confirmation catching a mismatch (*"These do not match."*), the reveal putting the typed password in the tree, the message clearing when the mismatch is fixed, and the single rule *"At least 6 characters."* rendering from `PASSWORD_MIN_LENGTH` — the one server rule (`devise.rb:185`, 6..128) and no invented ones | **The password is never actually changed, on purpose.** A real change mid-suite would strand every later flow on a stale `.env`, and a failed change-back would lock the rig out until a human intervened — so the current password typed is wrong deliberately and nothing on the server moves. The success path (the confirmation, the fields clearing) is unit-tested only. Not the 401-vs-422 distinction from the client's side beyond the sign-out check, and not rate limiting |
| `15-sessions-switch.yaml` | **PASS — 2026-09-19 17:38, dev build, tree `5e37367` + e7's uncommitted i18n. First run, no flow changes.** The fullest pass of the night. A new conversation created and proven to have opened by its EMPTY state (`chat-empty`) rather than by the sheet closing; renamed from its own row menu, the menu's safe order (**Clear** first) asserted on the way past; a second one created and renamed so there is something to switch FROM, and marked `selected` as the active row; then **switched by title** and the sheet marking the chosen row `selected` — which is `activeId` and nothing else. Every row is addressed by its *"Options for …"* label or its title, **never by a record id**: `session-row-<id>` and `session-menu-<id>` are testIDs built on database ids, which is a finding rather than a selector. Then it **deleted both conversations it made**, through the real confirm, asserting the wording and the guarantee naming notes, contacts, loans and money, and landed on the fallback the server hands back | **The at-limit branch never ran** — the QA account is not at 50, so the NOT MEASURED path and its screenshot are untested. Not Clear, not Search-in, not How-to-answer. Not a switch between conversations that both hold messages: both of these were empty by construction, so what is proven is that the sheet changes `activeId` and the screen follows, not that a long thread reloads correctly. The cleanup is asserted (`notVisible` on both titles), so the account does not fill up the way `04` used to |
| `16-ai-keys.yaml` | **UNRUN.** Reachable from profile's "Your AI provider key"; the explanation; the empty line when the account has no key; the `gemini` chip (from the server's list; a provider slug, not an id); a key that is not a key pasted and "Check and save" pressed; **the refusal arriving in the provider's words** (`ai-key-refused`) **and nothing stored** — still empty, no list, nothing "In use" | **Never adds a real key.** If the account holds one the flow photographs the row and is NOT MEASURED past it, rather than removing somebody's key. Not Replace, Use this one, Remove, or a lent key — needs a key to exist. Not the transport-failure branch (`ai-keys-error`): a refusal and an unreachable provider are told apart by the server and the rig cannot make Google unreachable. One verify call to Google per run, with an invalid key, at no cost |
| `17-privacy.yaml` | **UNRUN.** Reachable from Account; the title; the first heading of the document as a node in OUR tree, which a web view could not give; scrolled to the LAST heading, so the whole text rendered; the draft banner **photographed in whichever state it is in, under a filename that says which** — a release gate, recorded and not asserted; Back | **Does not assert the banner either way**, deliberately: asserting it on fails the day he approves the text, asserting it off fails today. Not the stripping of the reviewer notes — a viewport negative proves nothing; `scripts/build-privacy.mjs`'s test does. Not the words between the two headings |
| `18-delete-account.yaml` | **UNRUN.** Reachable from Account, warning caption before the tap; the disclosure — six lines of what goes, what is kept and why; the sessions confirm's question NOT on this screen; **the gate in whichever state it is** — shut: the apology and no password field; open: the field, "Keep my account", and the way out tapped — photographed under a filename that says which; back on Account, account intact | **Never deletes and never types a password.** The confirm button cannot enable with the field empty, and `RIG_CONTRACT.md` §3 forbids account deletion against a real account; the endpoint is exercised by hand against a throwaway user, not by this rig. Not the wrong-password 401 or the network branch. Not resemblance to the conversation delete — 91 and `04`'s 32 are the pair a person compares |

## Run 5 — where the harness actually stands

**The product is proven; the harness for `01-ask` is not green.** Those are
different facts and collapsing them is what this register exists to prevent.

Proved BY HAND on a device, against the real backend, all photographed:

- a real question answered by Gemini over ActionCable;
- **the PDF join** — a file uploaded through the app's own picker, then a
  question only that file could answer, returning `QA-ZEPHYR-7741` and
  `1,284.50 EUR`, facts that exist nowhere else;
- the delete confirm with its guarantee, the sessions sheet, the attach sheet,
  the composer with the keyboard raised, 360 / 411 / 800 dp, light and dark.

`01-ask` as a FLOW reaches the composer, types the question, and fails to find
the send button. Three harness faults were found and fixed getting that far —
`adb reverse`, the dev menu, and a restored route — and the remaining ones are
all **Expo Go's navigation model rather than the app**: Back exits from the root
route, and `openLink … /--/chat` leaves the experience entirely.

**The fix for all of it is a development build**, which has its own package, no
deep links and no Expo Go home screen — and which is also the only way dictation
can ever be witnessed. Until then `01-ask` is **NOT MEASURED**, which is exit 3
and not a failure: it has found no bug, it has found nothing.

## Run 6 — the three people-chat flows, and why they are UNRUN

`06`, `07` and `08` have **never executed**. They are in the register as
`UNRUN` rather than absent, because a flow nobody has run is a different fact
from a flow that passed and a different fact again from one that failed, and
only one of those three is invisible when the row is missing.

**They were written to deep-link and were changed to tap** (`70c68b6`) once the
title-bar icons landed. That matters for this file's own closing rule — *arrive
the way a user arrives* — and it means their coverage column now legitimately
claims reachability, which it could not before.

**What I expect when they first run, so the prediction is on record before the
result:** `01-ask` is NOT MEASURED because of Expo Go's navigation model —
Back exits from the root route, and `openLink … /--/chat` leaves the experience.
`06` uses `back` twice to return from the people thread to the assistant for the
separation pair, so **it is likely to hit the same wall**, and `07` uses it once.
If they do, that is the same finding as `01-ask` and the same fix — a
development build — not three new bugs.

## Run 6 — the development build, and DICTATION IS VERIFIED

The dev build (`expo-dev-client` + `expo-speech-recognition`, package
`co.byseven.multimagic`) removed every Expo Go obstacle: `launchApp` launches
our app, `login.yaml` completes for the first time, and the speech module is
present.

**Dictation: VERIFIED, all four states, photographed in
`docs/design/chat/ours/`.**

| | Verdict |
|---|---|
| mic ABSENT when no recogniser exists | PASS (Expo Go, run 3) |
| mic PRESENT when the module is in the binary | PASS (dev build) |
| the permission dialog fires — *"Allow MultiMagic to record audio?"* | PASS |
| refusal keeps the button and explains — *"I can't listen without the microphone. You can still type, or allow it in Settings."* | PASS |

That last one is the decision the design turns on: a refusal is FIXABLE, so the
mic stays for the person who might grant it in Settings. It is now a photograph
rather than an assertion.

**`01-ask`: PASS.** Run 7, dev build, real backend — the question posts, the
answer arrives over ActionCable, and `assistant-answer` renders. The flow that
has been NOT MEASURED since Expo Go now has a verdict.

**The cause was one step, found by bisection and not by guessing: `hideKeyboard`.**
After `inputText`, `composer-send` asserts VISIBLE; after `hideKeyboard`, the
same assertion FAILS. The button is enabled either way — `composer-clear`
renders only when the field has a value and it is present, so React state
updated and `canSend` is true. Dismissing the keyboard relayouts the composer
through KeyboardAvoidingView and Maestro's tree snapshot catches it
mid-transition.

So "Element not found: composer-send" was never about the selector. testID and
label both failed because the node was genuinely absent for that instant, and
the step was not needed at all: a person taps send with the keyboard up.

Two assertions were also made honest rather than lucky. The question is waited
for rather than asserted the same millisecond as the tap — it moves from the
composer to a bubble on the next render. And the thinking indicator is
`optional`: on a fast turn the answer lands before the assertion runs, and
failing then would report a bug for the app being quick. Its behaviour is unit
tested; what this flow exists for is the answer arriving, which cannot be raced.

**Superseded, kept for the record:** The
flow now launches, signs in, types the question — and cannot find the send
button, by `testID` or by its label. A disabled `Pressable` drops out of the
accessibility tree, which Maestro reads, so "Element not found" means "not in
the tree at this instant" rather than "missing from the app". Whether the
button is disabled at that moment — i.e. whether Maestro's `inputText` fires
`onChangeText` — is the open question, and it is one experiment rather than a
wall.

**The exchange itself is proven and photographed** (run 4): a real question, a
real Gemini answer over ActionCable, and the PDF join returning facts that
exist nowhere but the uploaded file. The flow would automate a thing already
known to work; its absence costs repeatability, not confidence.

## Run 7 — six verdicts on the development build

All against the real backend on `qa_phone2`, dev build (`co.byseven.multimagic`).

| Flow | Verdict | What it establishes |
|---|---|---|
| `login` | **PASS** | signs in only if not already; waits on either end state |
| `01-ask` | **PASS** | a real question, a real Gemini answer over ActionCable |
| dictation (manual) | **PASS** | mic present; permission dialog fires; refusal keeps the button |
| `10-sign-up` | **PASS** | the server's own "has already been taken"; nothing created |
| `11-forgot-password` | **PASS** | accepted on 2xx; the copy that reveals nothing is pinned |
| `12-account` | **PASS** | dark selected and surviving a real relaunch; account rows |

**`12-account` found a bug in `login.yaml` that the others could not.** It
relaunches deliberately, to prove the theme survives — and a cold relaunch has
a window where NEITHER the composer nor the sign-in field is on screen. The
conditional fired during it and then demanded a sign-in field from an app that
was already signed in. It now settles that window before deciding which state
it is in. Deciding early was the bug.

**A finding with no flow: there is no language switch in the app.** The theme
chooser was asked for "like the theme system — same thing language and theme",
and only half of that exists. Recorded here rather than silently passing.

## Rules this register enforces

- **An empty list is a legitimate state, not a pass.** A flow that reaches an
  empty screen screenshots and stops rather than asserting into it.
- **Destructive paths are opened and cancelled**, and assert the *wording*.
- **Arrive the way a user arrives.** A flow that deep-links past the navigation
  proves the screen works, not that anybody can reach it.

## Run 7 — flows for the screens that had none, written off-box

Hamma9901's queue for the fourth session, 2026-09-19: every screen with no flow
gets one, in the order a store reviewer meets them — sign-up, forgot-password,
account, profile, change-password, sessions switch, ai-keys, privacy,
delete-account. Each is **UNRUN** until `multimagic-mobile-79` runs it on the
device in the gaps between its own steps; this session stays off the device.

**The bar every one of them was written to**, and `qa/flow_lint.py` now checks
what it can of it:

- **Stable selectors only.** Every `id:` resolves to a `testID` in the code
  (`TESTID`), and a testID built on a database id is reported as a finding, not
  used as a selector (`DBID`) — the flow taps the row by its label instead.
- **Never `optional: true` on the step that is the point.** Karwan's F-64:
  optional turns "did not work" into "did not happen". Every optional needs a
  written reason on its own command (`OPTIONAL`, `TOOTHLESS`).
- **A whole text node, or a `.*`.** Maestro matches the full node, so a flow
  asserting the first line of a two-line caption can never pass (`ANCHORED`).
- **Real accounts are the QA account's, never his.** Sign-up types the QA
  address and is refused; forgot-password asks for the QA address and asserts
  the request was ACCEPTED, not that mail arrived. Nothing here deletes.

**Finding, not a flow — the language switch.** The queue names "account
(theme switch with dark actually visible, language switch)". There is no
language switch in this app: `theme.store.ts`'s header says *"System / Light /
Dark — his instruction, alongside language"*, and nothing under `app/` or
`src/` reads a locale, calls i18next or offers a language row. A flow cannot
cover a screen that does not exist, so it is recorded here as the gap it is.

**Two more findings from writing 15 and 18, reported and not fixed:**

- **The two deletes that must not look alike shared a testID — FIXED 2026-09-19.**
  `delete-confirm` was both the sessions dialog (`DeleteConfirm.tsx`) and the
  account screen's button (`app/delete-account.tsx`). Now `delete-conversation-
  confirm` / `-question` / `-safe` / `-yes` / `-cancel` and `delete-account-confirm`;
  `04`, `15`, `18`, the unit tests and the render table moved with them.
- **`04-delete-conversation` creates a conversation on every run and deletes
  none.** At 50 the account is full and every flow that presses "New
  conversation" fails on a full fixture. `15-sessions-switch` deletes what it
  makes; `04` should either do the same or stop creating.

**First run of the linter over the ten flows that existed: 16 findings.** Three
were fixed by their owner (`login.yaml`'s either-state waits). The remaining
thirteen lost their owner when the box rebooted at 08:52 on 2026-09-19 and were
fixed here:

- **`01-ask`'s optional `thinking` assert** carries its marker now. It is a
  race and not a weak assertion — on a fast turn the answer can land first —
  and the step that IS the point of that flow, the answer arriving, is hard.
- **`03-dictation` asserted the mic was ABSENT, unconditionally.** True under
  Expo Go on 18 September, false from the moment the rig started driving the
  development build. It branches on the binary now and asserts hard on both
  sides, including the refusal keeping the button.
- **Three `hideKeyboard`s.** Removed from `03` and `06`, where it sat between
  typing and a send button — the exact pattern `01-ask` measured as making
  `composer-send` drop out of the tree — and in `06` on a PUSHED screen, where
  a Back that reaches the app pops the thread. Kept in `09`, where closing the
  keyboard IS the event being measured, with the reasoning written above it.
- **Eight database-id selectors** in `06` and `07`. Every one is a case where
  *any* row genuinely is the subject — any thread, any notification, any
  message on the right — so each site says so in a `dbid-ok` marker naming what
  IS being asserted. **The finding stands and is not closed by the markers:**
  `chat-row-<id>`, `notification-row-<id>` and `msg-<side>-<id>` are the only
  handles those rows carry, and a flow that needed a PARTICULAR row could not
  name one. A stable per-row handle would need a slug, and no serializer sends
  one.
- **`09-keyboard` has a row in this file**, above.
