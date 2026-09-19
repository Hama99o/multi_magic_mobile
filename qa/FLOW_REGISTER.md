# Flow register

Every flow, its verdict, and — the column that earns this file — **what it does
not cover**. A flow is trusted for exactly what it asserts and nothing more, and
the commonest way a rig lies is by being read for more than it claims.

Verdicts are from run 3 (2026-09-18, `qa_phone2`, Expo Go 54.0.8, real backend
at `10.0.2.2:3001`). `NOT MEASURED` is a distinct verdict from `FAIL`: exit 3,
not 1 — a blocked preflight has found nothing, not a bug.

| Flow | Covers | Does NOT cover |
|---|---|---|
| `set-language.yaml` | **Helper, not a test.** Puts the app into one language — `${LANG_ID}` is `language-en` or `language-fr` — through the switch in the **sessions sheet beside the theme**, under Appearance, and asserts the chosen option carries `selected`. Used by `qa/screens.sh` to shoot the French pictures and to put English back immediately afterwards | **It is not the language test.** It proves the control responds and marks itself selected; it asserts nothing about what any screen then says. The choice persists in AsyncStorage (`mm-language`) **and on the server as `users.lang`**, so it survives a relaunch — which is why the pass sets English back rather than leaving the QA account French for whatever runs next |
| `99-screens.yaml` | **THE PICTURE PASS, not a test.** One visit to each of the nine screens `docs/design/` has a folder for — chat, sessions, people-chat, notifications, calendar, account, profile, upload, sign-in — with a screenshot at each, named by `${SHOT}` so width, mode and language are in every filename. Driven by `qa/screens.sh`, which sets the width (`wm size`/`wm density`), the mode (`cmd uimode night`) and the language, and runs this once per combination. It pays the sign-in ONCE per combination rather than once per screen | **It asserts nothing about behaviour, on purpose** — one arrival handle per screen and nothing else. An assertion failing at 800 dp would stop the pass and cost every width after it, and what this flow is for is pictures. Sign-in is shot LAST because it signs out. Verdicts for behaviour live in the rows above |
| `login.yaml` | Sign in with the QA account; signs out first if a session is already open, so every flow starts the same way | Nothing about sign-up or password reset. Not 2FA — the account has it off, and the 202 branch is API-layer only |
| `01-ask.yaml` | **The product.** Question drawn immediately from the 202's own id, dots where the answer will land, and an answer that actually ARRIVES over ActionCable — the only test that exercises the socket at all | **Not the RAG answer itself.** The QA account has no AI provider key, so every reply is the missing-key message. The transport is proven; the retrieval is not. Not reconnect: forcing a socket drop mid-flow is not scripted yet |
| `02-sign-in.yaml` | Empty-submit validation, a real 401 rendering as "That email and password do not match", and both ways out being present. Screenshots at each step | **Not the 429.** Tripping the login rate limit (10 per 3 min) would lock the QA account out of the rest of the suite. Covered by unit test instead |
| `03-dictation.yaml` | **REWRITTEN 2026-09-19.** The composer works with or without a recogniser (every binary); then it branches on `APP_ID` — Expo Go: the mic is **absent**; dev build: the mic is **present**, tapping it answers with either `composer-listening` (cancel asserted, and it cancels) or `composer-mic-refused` (the line, and **the button stays**), each branch hard | **Which branch ran is in the `.log`, not in the exit code.** If a future Maestro stops exposing `-e` params to the JS sandbox both branches are skipped and only the composer assertions will have run — a NOT MEASURED, and the header says to read the log. Not the permission dialog itself: Android asks once per install, so the tap is optional and only the OUTCOME is asserted. It used to assert absence unconditionally, which became false the day the rig started driving the dev build |
| `04-delete-conversation.yaml` | **REWRITTEN 2026-09-19.** The row menu's order (Clear first) and the clear hint; a rename, so every later step addresses the conversation this flow made; the delete confirm's **wording**, both halves, including the guarantee naming notes, contacts, loans and money; **Keep it**, and the row still there afterwards; then that same conversation **deleted for real**, and the app landing in the fallback the server hands back. Rows are reached by their menu's "Options for …" label, never by a record id | **Only what it created.** It used to press Keep it and stop, so every run left one more conversation behind: at 50 (`MAX_PER_USER`) "New conversation" is disabled and this flow, `15` and anything else that starts one would fail on a full fixture rather than on a bug. Stops as NOT MEASURED if the account is already at the cap. Not Clear, Rename's validation, Search in or How to answer. Not the with-files wording — a new conversation has none; `deleteQuestion()`'s three forms are unit-tested |
| `05-upload.yaml` | The attach sheet: the three ways a person has a file, and that it says which types it takes | **Not an upload.** The system file picker is outside the app; driving it is a separate and flaky problem. The nine-extension rule is covered by unit test |
| `06-people-chat.yaml` | **FAIL — re-run 2026-09-19 17:51 on `5e37367`+`28cf795`. The first defect is FIXED and a second one was behind it.** The keyboard fix is **verified on device**: `08-thread-sent-right-side.png` shows the composer sitting above a DOCKED full-width Gboard, and the message *"[qa] automated test message"* sent at 5:52 PM with its tick, on the right. That is everything the earlier run could not reach. It now fails one step later, at `reaction-sheet` after `longPressOn: msg-mine-.*` — and the frame (`not-met/step-028-*.png`) shows **Android's own text-selection menu open instead**: Copy · Share · Select all, with selection handles on the bubble. The long press landed on the right message; the system's text selection took the gesture and the app's `onLongPress` never ran. So **the reaction gesture is unreachable on this build**, and a person long-pressing to react gets Copy/Share/Select all. Reported; not fixed here | **Not the other side** — a message from another person rendering LEFT needs a second signed-in account and the rig has none. **Not the double tick**, **not the unread divider**, same reason. Nothing about groups. Everything past the long press — the thumbs-up chip, the same emoji toggling it back off — is UNRUN, not passed. Still true from the first run and still unasserted: `thread-list` can pass against a thread that renders EMPTY and fills a moment later, so the arrival assertion is weaker than its name |
| `07-notifications.yaml` | **PASS — 2026-09-19 17:05, dev build, tree `5e37367` + e7's uncommitted i18n. A THIN PASS, and the thinness is the point.** Reached by `chat-open-notifications`; `notifications-list` present; the QA account has no notifications, so it took the **empty branch** and asserted *"You're all caught up."* and nothing else. That is a real pass of reachability and the empty state, and it is all it is | **The whole substantive half was SKIPPED, not passed.** Everything behind `notifications-empty` being absent never ran: the date heading, tapping a `notification-row-*` through to a composed question, the *"What is this about:"* prefill, the row marked read on return, **Mark all as read**, and the **Clear read notifications** confirm with its *"Anything still unread stays where it is."* wording. Six of the flow's eight screenshots were never taken. To measure any of it the QA account needs a notification, and nothing in the rig makes one — a flow cannot create one without a second account or a server-side write, and `RIG_CONTRACT.md` §3 rules the second out. Recorded as UNRUN inside a PASS rather than left to look covered |
| `08-calendar.yaml` | **PASS — 2026-09-19 17:10, dev build, tree `5e37367` + e7's uncommitted i18n. Thin, like 07, and for the same reason.** Reached by `chat-open-calendar`; `calendar-list` present, the *"What's next"* heading, and `calendar-day-today` — the ternary testID that is a fixed handle for today and a date-keyed one for every other day, so today is addressable without a record id. The QA account has no events today, so it took the **`calendar-nothing-today`** branch and asserted *"Nothing today."* | **The branch with events in it never ran.** Everything behind `calendar-nothing-today` being absent is UNRUN, not passed. Same shape as 07: the QA account holds no calendar data and the rig will not create any — nothing in `qa/` writes to that backend, by `RIG_CONTRACT.md` §3, and the database behind it is his real one. A fixture account with a seeded week is what would measure this, and that is a decision about his data rather than a gap in the flow |
| `09-keyboard.yaml` | **PASS — 2026-09-19 17:50, dev build, tree `5e37367`+`28cf795`. FIRST RUN EVER; this row said UNRUN until tonight.** With the keyboard raised the field, the send button and the attach button are all on screen and hittable; the draft then **survives the keyboard closing**, asserted on the field's own text rather than its presence; and the clear control appears with a draft and clears it. `50-keyboard-up.png` is the evidence and it also **corrects this flow's own header**: Gboard on this AVD is **DOCKED and full-width**, not floating. The header claimed floating — the easy case — which was the reason to doubt the flow instead of the screen | **Not iOS**, which is the platform the assertion exists for. And the honest history: because this flow had never run, it caught nothing when `app/chat.tsx`'s `Screen` container carried `behavior={undefined}` on Android and the assistant composer had the identical defect `06-people-chat` found on the people thread. There was no vacuous green here to explain — there was no green. A flow written and never executed proves exactly as much as no flow |
| `signed-out.yaml` | Helper, like `login.yaml`: ends on the sign-in screen by signing OUT through the sessions sheet's own row — the way a user does — so the auth flows start where a stranger starts | Does not wipe storage. `clearState` would erase the device fingerprint every token is bound to, and under Expo Go it lands on Expo Go's error screen |
| `10-sign-up.yaml` | **PASS** — run 7, dev build, 2026-09-19 (see *Run 7 — six verdicts*). Reachable from sign-in's "Create account"; validate-on-press with copy that names name, email and password; a TAKEN address — the QA account's own, the only one the rig may type — refused in the server's own words, "has already been taken", which is the JSON:API `errors[].detail` shape only this screen parses; nothing created and nobody signed in (still on sign-up, no composer); the way back to sign-in | **Does not create an account.** The 201 path — Devise signs the new user in and the app lands on the assistant — is unit-tested only; making users in his real database on every run is not a test. Not the 429: `rack_attack.rb` throttles `/users`, the route is `/users/signup`, so it never fires (backend finding). Walks past two app findings it records in its header: `detail` names no attribute, so the screen says "has already been taken" without saying what; and lastname is required by the server and not by the app |
| `11-forgot-password.yaml` | **PASS** — run 7, dev build, 2026-09-19 (see *Run 7 — six verdicts*). Reachable from sign-in's "Forgot password"; validate-on-press with copy naming the email; the error clearing as you type; the QA address submitted with the keyboard's Go key (`returnKeyType="go"`); the server ACCEPTING — `forgot-password-sent` renders on a 2xx and on nothing else — and the copy that does not say whether the address was known; back to sign-in | **Not that mail arrived, and not the link.** The confirmation step is web-only in v1 by design. Not a non-existent address: the server answers 200 either way, so the screen has nothing to branch on, and the rig types no address but the QA account's. **Budget: 5 per 15 minutes per IP** (`rack_attack.rb`); a run past that fails on the sent state with `too_many_requests` on screen, which is the throttle and not the app. Every run puts a real reset token on the QA account and a real mail in its inbox |
| `12-account.yaml` | **PASS** — run 7, dev build, 2026-09-19 (see *Run 7 — six verdicts*). The Appearance control in the sessions sheet; System chosen first so the baseline photograph is honest; Dark chosen, `selected` asserted, and the assistant PHOTOGRAPHED dark (66 vs 68 is the artefact); the choice **surviving a relaunch** — `hydrate()` before first paint — which is the store's reason and the one thing a screenshot cannot show; restored to System; the Account screen with its two rows and the warning caption before the delete tap; Back | **Not that dark is correct** — no assertion reads a colour; a person compares 66 and 68. **Not the language switch: it does not exist** (see Run 7). Not System following the phone: the emulator's own scheme is not toggled. Does not go through the privacy or delete doors — 17 and 18 do |
| `13-profile.yaml` | **PASS — 2026-09-19 17:30, dev build, tree `5e37367` + e7's uncommitted i18n. Five runs to get there, and four of them were the flow's fault, not the screen's.** Covers: the photo sheet rather than the picker; first name, last name and About; the email row **locked with its reason**; About edited, saved, `profile-saved` shown; the three rows below (`profile-password`, `profile-keys`, `profile-web`); and then the screen LEFT and RE-ENTERED so the About is read back from the server rather than from component state — which is the only part of this flow that proves anything survived the network | **Four defects in the flow itself, all now fixed and all worth keeping written down.** (1) `profile-web` is the last row and off the fold; a bare `assertVisible` failed on a row that was present. (2) `scrollUntilVisible` reported *"No visible element found"* and `scroll` reported COMPLETED — **both without moving the screen at all**, proven by the failure frame still showing the header and every field. Only an explicit `swipe` moves it. (3) After swiping, the header scrolls too, so `tapOn: "Back"` failed on a control above the viewport — it swipes back up first, and still taps the header's own Back rather than `pressKey`, because a system Back would pass even if the button were missing. (4) The round-trip assertion is **start-anchored, not a full match**: `eraseText` erases backwards from the cursor and `tapOn` puts the cursor where it tapped, so the field came back reading `…13-profile.yaml/13-profile.yaml`. The tail is bounded, not growing without limit, but a full-string match would fail on a save that worked. **Not the disabled Save state** — a disabled Pressable can drop out of the tree. **Not a photo**: the sheet is opened, the picker is not. One environmental note: a run during a sibling's Docker rebuild (load 16) died on an Android ANR dialog, which reads exactly like a failed assertion |
| `14-change-password.yaml` | **PASS — 2026-09-19 17:34, dev build, tree `5e37367` + e7's uncommitted i18n. First run, no flow changes needed.** The assertion this flow exists for HELD: a wrong current password comes back **422 against the field** — `password-wrong-current` and *"That password is not right."* — and **does not sign you out**. `sign-in-email` absent, `password-done` absent, the field still there, and Back lands on the profile and then on the assistant. Also covers the confirmation catching a mismatch (*"These do not match."*), the reveal putting the typed password in the tree, the message clearing when the mismatch is fixed, and the single rule *"At least 6 characters."* rendering from `PASSWORD_MIN_LENGTH` — the one server rule (`devise.rb:185`, 6..128) and no invented ones | **The password is never actually changed, on purpose.** A real change mid-suite would strand every later flow on a stale `.env`, and a failed change-back would lock the rig out until a human intervened — so the current password typed is wrong deliberately and nothing on the server moves. The success path (the confirmation, the fields clearing) is unit-tested only. Not the 401-vs-422 distinction from the client's side beyond the sign-out check, and not rate limiting |
| `15-sessions-switch.yaml` | **PASS — 2026-09-19 17:38, dev build, tree `5e37367` + e7's uncommitted i18n. First run, no flow changes.** The fullest pass of the night. A new conversation created and proven to have opened by its EMPTY state (`chat-empty`) rather than by the sheet closing; renamed from its own row menu, the menu's safe order (**Clear** first) asserted on the way past; a second one created and renamed so there is something to switch FROM, and marked `selected` as the active row; then **switched by title** and the sheet marking the chosen row `selected` — which is `activeId` and nothing else. Every row is addressed by its *"Options for …"* label or its title, **never by a record id**: `session-row-<id>` and `session-menu-<id>` are testIDs built on database ids, which is a finding rather than a selector. Then it **deleted both conversations it made**, through the real confirm, asserting the wording and the guarantee naming notes, contacts, loans and money, and landed on the fallback the server hands back | **The at-limit branch never ran** — the QA account is not at 50, so the NOT MEASURED path and its screenshot are untested. Not Clear, not Search-in, not How-to-answer. Not a switch between conversations that both hold messages: both of these were empty by construction, so what is proven is that the sheet changes `activeId` and the screen follows, not that a long thread reloads correctly. The cleanup is asserted (`notVisible` on both titles), so the account does not fill up the way `04` used to |
| `16-ai-keys.yaml` | **PASS — 2026-09-19 17:42, dev build, tree `5e37367` + e7's uncommitted i18n. First run, no flow changes.** Reached from `profile-keys`; the heading, `ai-keys-(list|empty)`, and the whole intro paragraph asserted word for word — *"…the key is checked with the provider before it is saved, and it is never shown again afterwards."* — which is the promise the screen makes and the one worth pinning. **It took the `ai-keys-list` branch: the QA account HAS a key**, so **Replace** and **Remove** are present and asserted | **Nothing is added, replaced or removed.** A real key is a real provider credential and a real bill; the flow photographs the has-a-key state under a filename that says NOT MEASURED and stops. The empty branch never ran this time, so its copy is untested. **And this pass contradicts `01-ask`'s note**, which says the QA account has no provider key and every reply is therefore the missing-key message — that note is now stale, and whether `01`'s answers have been real all along or the key is inactive is unresolved and should be checked before `01`'s "does not cover" is trusted again |
| `17-privacy.yaml` | **PASS — 2026-09-19 17:45, dev build, tree `5e37367` + e7's uncommitted i18n. First run, no flow changes.** Reached from `account-privacy`; the page renders through `Markdown.tsx`'s subset, the headings survive the parse on a real device, and it scrolls to *"What we do not do"* at the end — so the document is whole between the file and the screen, which is the thing the unit tests can only argue about. **The DRAFT BANNER IS ON** and photographed as `89-privacy-DRAFT-BANNER-ON-release-gate`: *"Draft — not yet approved"*, driven by the document's own title line. **That is a release gate, not a detail** — the policy is still awaiting Hamma9900's approval and the app says so honestly on the screen a store reviewer opens | **Not the sha agreement.** The phone bundles the text and the backend serves the same twelve characters at `GET /api/v1/legal/privacy`; this flow reads only the phone's copy, and the agreement between the two is proven in `src/content/__tests__/privacy.test.ts` rather than here. Not the French rendering of the policy. Not the not-a-draft branch, which is SKIPPED until he approves it and will need a run on the day he does |
| `18-delete-account.yaml` | **PASS — 2026-09-19 17:48, dev build, tree `5e37367` + e7's uncommitted i18n. First run, no flow changes.** The warning arrives BEFORE the tap; the disclosure names all six things that go and the one thing that is **kept** with its reason, word for word — *"What the assistant cost — which provider ran, and how many tokens. Your name is removed from those rows, and they hold no part of any question or answer."* The **gate is OPEN** (`ACCOUNT_DELETION_AVAILABLE` true, endpoint landed at `multi_magic@56559c4`): the password field and **Keep my account** are both there, photographed as `92-delete-account-gate-OPEN`. And it is structurally NOT the conversation delete — `delete-conversation-question` is asserted absent, so the sessions dialog's wording is nowhere on this screen | **The password field is never filled and deletion is NEVER confirmed.** The only tap on that screen is the way out. `RIG_CONTRACT.md` §3 is explicit that no test calls account deletion against a real account; when that path is exercised it is against a throwaway user, by hand. So what is proven is the disclosure, the gate and the escape — not that the endpoint deletes anything. The gate-SHUT branch is SKIPPED and untested. Whether it *looks* different enough from the conversation delete is a judgement no assertion makes: `91` here and `04`'s `32-delete-confirm` are the pair a person compares |

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
