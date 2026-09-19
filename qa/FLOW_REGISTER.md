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
| `03-dictation.yaml` | The mic is **absent** when no recogniser exists, and the composer still works completely without it | **Not the present half, and not the permission dialog** — Expo Go carries no custom native modules, so this can only ever prove absence here. Needs a development build |
| `04-delete-conversation.yaml` | The row menu's order (Clear first), the clear hint, and the delete confirm's **wording** — including the guarantee naming notes, contacts, loans and money | **Does not delete.** It opens the confirm and presses "Keep it". Deleting rows from a real account to prove a sentence is not a test, it is a deletion |
| `05-upload.yaml` | The attach sheet: the three ways a person has a file, and that it says which types it takes | **Not an upload.** The system file picker is outside the app; driving it is a separate and flaky problem. The nine-extension rule is covered by unit test |
| `06-people-chat.yaml` | **UNRUN.** The chat list from `GET /conversations` with the name taken from `user.fullname` (a direct chat's `title` is null); `mark_read` on open; a message sent over HTTP landing on the **right** — `msg-mine-*` vs `msg-theirs-*` is the assertion, because the ConversationChannel copy is serialized with `user: nil` and would draw every message left; the long-press sheet; a reaction chip added and the same emoji taking it back. Arrives by **tapping `chat-open-chats`**, so a pass covers reachability | **Not the other side.** Whether a message from another person renders LEFT — the half of the `sent_by_me` trap that matters most — needs a second signed-in account and the rig has none; the left side is asserted only if the fixture happens to contain one, which is luck. **Not the double tick**: `read_at` is nil unless every *other* member has read past it, so one account can never make it non-nil. **Not the unread divider**, same reason. Nothing about groups |
| `07-notifications.yaml` | **UNRUN.** The list grouped `Today`/`Earlier`; an unread row carrying both signals; a tap marking it read; and the one that matters — the tap lands in the assistant's composer with the question present and **no `thinking` and no `assistant-answer`**, which is the proof it was composed and not sent. Arrives by tapping the bell | **Not a live arrival.** `NotificationChannel` needs the backend to generate one for the QA account mid-run and nothing in this rig can cause that, so the socket path is asserted by unit test against a frame shape and by nothing at all against a real socket. **Not `clear`**: it opens the confirm, asserts the wording and cancels, because deleting rows from a real account to prove a negative is a deletion, not a test |
| `08-calendar.yaml` | **UNRUN.** The agenda from `GET /events/upcoming?days=7`; **today always present**, with its events or the single line "Nothing today."; a day heading naming the day and the date; tapping an event composing a question without sending it. Arrives by tapping the calendar icon | **Not the correction it was built on.** Proving a 1990 birthday resolves to this year needs a recurring event whose next occurrence falls inside seven days, and the rig may not write to his real calendar — so `event-repeats` is asserted only if one happens to be there. **The proof lives in `src/api/__tests__/calendar.test.ts`**, and a green run here is not evidence about recurrence. Not the colour bar's provenance: `event.color` and the id fallback both render and no assertion tells them apart |
| `signed-out.yaml` | Helper, like `login.yaml`: ends on the sign-in screen by signing OUT through the sessions sheet's own row — the way a user does — so the auth flows start where a stranger starts | Does not wipe storage. `clearState` would erase the device fingerprint every token is bound to, and under Expo Go it lands on Expo Go's error screen |
| `10-sign-up.yaml` | **UNRUN.** Reachable from sign-in's "Create account"; validate-on-press with copy that names name, email and password; a TAKEN address — the QA account's own, the only one the rig may type — refused in the server's own words, "has already been taken", which is the JSON:API `errors[].detail` shape only this screen parses; nothing created and nobody signed in (still on sign-up, no composer); the way back to sign-in | **Does not create an account.** The 201 path — Devise signs the new user in and the app lands on the assistant — is unit-tested only; making users in his real database on every run is not a test. Not the 429: `rack_attack.rb` throttles `/users`, the route is `/users/signup`, so it never fires (backend finding). Walks past two app findings it records in its header: `detail` names no attribute, so the screen says "has already been taken" without saying what; and lastname is required by the server and not by the app |
| `11-forgot-password.yaml` | **UNRUN.** Reachable from sign-in's "Forgot password"; validate-on-press with copy naming the email; the error clearing as you type; the QA address submitted with the keyboard's Go key (`returnKeyType="go"`); the server ACCEPTING — `forgot-password-sent` renders on a 2xx and on nothing else — and the copy that does not say whether the address was known; back to sign-in | **Not that mail arrived, and not the link.** The confirmation step is web-only in v1 by design. Not a non-existent address: the server answers 200 either way, so the screen has nothing to branch on, and the rig types no address but the QA account's. **Budget: 5 per 15 minutes per IP** (`rack_attack.rb`); a run past that fails on the sent state with `too_many_requests` on screen, which is the throttle and not the app. Every run puts a real reset token on the QA account and a real mail in its inbox |
| `12-account.yaml` | **UNRUN.** The Appearance control in the sessions sheet; System chosen first so the baseline photograph is honest; Dark chosen, `selected` asserted, and the assistant PHOTOGRAPHED dark (66 vs 68 is the artefact); the choice **surviving a relaunch** — `hydrate()` before first paint — which is the store's reason and the one thing a screenshot cannot show; restored to System; the Account screen with its two rows and the warning caption before the delete tap; Back | **Not that dark is correct** — no assertion reads a colour; a person compares 66 and 68. **Not the language switch: it does not exist** (see Run 7). Not System following the phone: the emulator's own scheme is not toggled. Does not go through the privacy or delete doors — 17 and 18 do |

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

**First run of the linter over the ten flows that existed: 16 findings**, all
reported to their owners rather than fixed here: an optional assert in
`01-ask` (justified in prose, unmarked), an optional tap in `04`, three
either-state waits in `login.yaml` that want `optional-ok` markers, eight
database-id selectors in `06` and `07`, three `hideKeyboard`s with no
justification (`03`, `06`, `09`), and `09-keyboard` with no row in this file.
