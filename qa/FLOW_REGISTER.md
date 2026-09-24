# Flow register

Every flow, its verdict, and — the column that earns this file — **what it does
not cover**. A flow is trusted for exactly what it asserts and nothing more, and
the commonest way a rig lies is by being read for more than it claims.

Verdicts are from run 3 (2026-09-18, `qa_phone2`, Expo Go 54.0.8, real backend
at `10.0.2.2:3001`). `NOT MEASURED` is a distinct verdict from `FAIL`: exit 3,
not 1 — a blocked preflight has found nothing, not a bug.

**And a cause written beside a verdict is a hypothesis until something
re-measures it.** Five recorded causes were found wrong in one night; three of
them were in this file, and one of them cost four reverted attempts. So every
cause carries one word — **measured** (somebody drove it and watched, or read
the code that decides it: say which) or **inferred** (the best explanation of a
failure nobody has re-tested). **An unmarked cause reads as inferred**, which
is the safe default and the honest one, because most of them are.
`qa/QA_HANDBOOK.md`, "A recorded cause is a hypothesis", has the five and what
they cost.

| Flow | Covers | Does NOT cover |
|---|---|---|
| `set-language.yaml` | **ROUTE CHANGED 2026-09-21 — the pass below predates it.** Theme, language, profile, privacy and sign out moved out of the conversations sheet and behind the photo in the title bar, so every one of these now enters through `chat-open-profile` instead of `chat-open-sessions`. What each asserts is unchanged; how it gets there is not, and none of the rewritten paths has run. **PASS — 2026-09-20.** Run repeatedly by `qa/screens.sh` for the French sets and by hand to restore English; the switch responds and marks itself selected. **Helper, not a test.** Puts the app into one language — `${LANG_ID}` is `language-en` or `language-fr` — through the switch in the **sessions sheet beside the theme**, under Appearance, and asserts the chosen option carries `selected`. Used by `qa/screens.sh` to shoot the French pictures and to put English back immediately afterwards | **It is not the language test.** It proves the control responds and marks itself selected; it asserts nothing about what any screen then says. The choice persists in AsyncStorage (`mm-language`) **and on the server as `users.lang`**, so it survives a relaunch — which is why the pass sets English back rather than leaving the QA account French for whatever runs next |
| `99-screens.yaml` | **THE PICTURE PASS, not a test.** One visit to each of the nine screens `docs/design/` has a folder for — chat, sessions, people-chat, notifications, calendar, account, profile, upload, sign-in — with a screenshot at each, named by `${SHOT}` so width, mode and language are in every filename. Driven by `qa/screens.sh`, which sets the width (`wm size`/`wm density`), the mode (`cmd uimode night`) and the language, and runs this once per combination. It pays the sign-in ONCE per combination rather than once per screen | **It asserts nothing about behaviour, on purpose** — one arrival handle per screen and nothing else. An assertion failing at 800 dp would stop the pass and cost every width after it, and what this flow is for is pictures. Sign-in is shot LAST because it signs out. Verdicts for behaviour live in the rows above |
| `login.yaml` | Sign in with the QA account; signs out first if a session is already open, so every flow starts the same way | Nothing about sign-up or password reset. Not 2FA — the account has it off, and the 202 branch is API-layer only |
| `01-ask.yaml` | **PASS — 2026-09-24 12:14, run 9, `qa_phone4`, dev build. First run of the rewrite.** Fresh conversation → `chat-empty` → run-stamped question → dots seen → a REAL answer ("No, you don't owe anyone any money…") → row found by its autotitle and deleted, no 500. Branch: not at the cap; the leftover sweep found nothing. **The rewrite, as written 2026-09-24:** Now asks `QA ask <evalScript id>: do I owe anyone money` in a NEW conversation, waits for `assistant-answer` to APPEAR (not for `thinking` to go), then deletes the conversation by its autotitle and sweeps any `QA ask …` row a killed run left. The old flow was hollow on an accumulated conversation: its question matched any earlier run's bubble, and `notVisible: thinking` + an `assistant-answer` from an earlier run could pass with no answer arriving. Needs multi_magic `6923905` running, or the cleanup fails on the usage-event defect. At the cap it is NOT MEASURED and says so. **Was the old flow's PASS hollow? Checked 2026-09-24 against the artifacts: the WEAKNESS is measured, the one checkable pass was GENUINE.** Only one passing run survives on disk, `~/.maestro/tests/2026-09-21_213413` (run 8). Its `02-chat-before-asking` frame already shows an `assistant-answer`, the missing-key reply to an earlier question. So the old last assertion had residue on screen to match before anything was asked; that part is no longer an inference. But in that run the optional `thinking` assert COMPLETED rather than WARNED (the dots rendered during this run, so a turn really was pending), then `notVisible: thinking` completed, and `04-answer-arrived` shows a NEW answer under this run's question. So that pass stands. The 2026-09-19 and 2026-09-20 passes left no `commands.json` and no frames: they cannot be re-graded either way and should be read as "its own assertions could not tell". The same 04 frame is a REAL answer ("You do not have any active loans…"), not the missing-key message. That settles `16`'s question for 2026-09-21: the account got real answers then, and the "does NOT cover" note below is stale. **PASS — 2026-09-20, dev build, tree at `e91d87b`.** Re-run today end to end: a real question through `thinking` to a real `assistant-answer`. The same run established that this account's answers carry **no `source-chips`**. **The product.** Question drawn immediately from the 202's own id, dots where the answer will land, and an answer that actually ARRIVES over ActionCable — the only test that exercises the socket at all | **Not the RAG answer itself.** The QA account has no AI provider key, so every reply is the missing-key message. The transport is proven; the retrieval is not. Not reconnect: forcing a socket drop mid-flow is not scripted yet |
| `02-sign-in.yaml` | **PASS — 2026-09-20, dev build.** Empty-submit validation, a real 401 rendering as *"That email and password do not match."*, and both ways out present. Needs a signed-out start, so it runs after `signed-out.yaml`. Empty-submit validation, a real 401 rendering as "That email and password do not match", and both ways out being present. Screenshots at each step | **Not the 429.** Tripping the login rate limit (10 per 3 min) would lock the QA account out of the rest of the suite. Covered by unit test instead |
| `03-dictation.yaml` | **PASS — 2026-09-20, dev build, and IT HAD NEVER BEEN RUNNABLE.** It died at parse with *"Invalid Command Format: tapOn at 03-dictation.yaml:71:17"* — `tapOn: "Allow"` is Maestro's shorthand and cannot take a sibling `optional:`. Valid YAML, invalid Maestro, so `flow_lint` parsed it happily. The row claimed both `APP_ID` branches while the file could not execute at all. Fixed to the object form; the dev-build branch now runs: the mic is present, tapping it reaches `composer-listening`, and cancel returns. **The manual observation is kept:** Run 7 recorded *"dictation (manual) — PASS"* on 2026-09-19: a human watched the mic appear, the permission dialog fire, and a refusal keep the button. **That is real evidence of a different kind and it is kept** — what went wrong was writing it into a column people read as automated. This flow, rewritten 2026-09-19 to branch on `APP_ID`, has never executed. **REWRITTEN 2026-09-19.** The composer works with or without a recogniser (every binary); then it branches on `APP_ID` — Expo Go: the mic is **absent**; dev build: the mic is **present**, tapping it answers with either `composer-listening` (cancel asserted, and it cancels) or `composer-mic-refused` (the line, and **the button stays**), each branch hard | **Which branch ran is in the `.log`, not in the exit code.** If a future Maestro stops exposing `-e` params to the JS sandbox both branches are skipped and only the composer assertions will have run — a NOT MEASURED, and the header says to read the log. Not the permission dialog itself: Android asks once per install, so the tap is optional and only the OUTCOME is asserted. It used to assert absence unconditionally, which became false the day the rig started driving the dev build |
| `04-delete-conversation.yaml` | **PASS — 2026-09-20, dev build. First run of the rewrite.** The 2026-09-19 rewrite is the version that deletes what it creates — the thing protecting the account from filling to its cap — and it has never run. **REWRITTEN 2026-09-19.** The row menu's order (Clear first) and the clear hint; a rename, so every later step addresses the conversation this flow made; the delete confirm's **wording**, both halves, including the guarantee naming notes, contacts, loans and money; **Keep it**, and the row still there afterwards; then that same conversation **deleted for real**, and the app landing in the fallback the server hands back. Rows are reached by their menu's "Options for …" label, never by a record id | **Only what it created.** It used to press Keep it and stop, so every run left one more conversation behind: at 50 (`MAX_PER_USER`) "New conversation" is disabled and this flow, `15` and anything else that starts one would fail on a full fixture rather than on a bug. Stops as NOT MEASURED if the account is already at the cap. Not Clear, Rename's validation, Search in or How to answer. Not the with-files wording — a new conversation has none; `deleteQuestion()`'s three forms are unit-tested |
| `05-upload.yaml` | **PASS — 2026-09-20, dev build. First verdict this flow has ever carried.** The attach sheet, its three options by handle, and what it says it accepts. The attach sheet: the three ways a person has a file, and that it says which types it takes | **Not an upload.** The system file picker is outside the app; driving it is a separate and flaky problem. The nine-extension rule is covered by unit test |
| `06-people-chat.yaml` | **2026-09-24 16:40–16:50 — FAILS, and the control says the rig, not the app.** Three runs on a freshly rebooted `qa_phone4`, all failing at `thread-list` right after `hideKeyboard`: the frame is the Chats list, so the step went Back. With the last committed `app/chat/[id].tsx` put back, it fails identically. By hand the keyboard is still up after a send (`mInputShown=true` at 0.5 s and 3 s). So `hideKeyboard` is pressing Back once too often on this boot; nothing in the app closes the keyboard. NOT MEASURED for reactions until the step is replaced. **PASS — 2026-09-22, dev build, `qa_phone4`. MEASURED, and it retires both earlier causes.** End to end: message sent and landing on the right, reaction sheet opened, thumbs-up added and its chip asserted, the same emoji taking it back off, and out to the assistant thread. **The cause was the KEYBOARD.** Three runs, one variable, same row, identical bounds `[407,920][1038,1041]`, same selector: no send → long press → sheet OPENS; send, settle, long press → NO SHEET; send, settle, **`hideKeyboard`**, long press → sheet OPENS. With the IME up the long press does not reach the row **and `longPressOn` still reports COMPLETED** — a null instrument, which is why this read as a broken gesture for one night and an ambiguous selector for the next. It was neither: maestro drives this app fine and the selector resolves fine. Three other suspects were excluded by negative control on the way — `id`+`text` compose as an AND; `${output.…}` interpolates inside a selector in all three forms; `output` crosses a nested `runFlow: when: commands:` block. The `hideKeyboard` goes AFTER the send (before it, it hides the send button — `01-ask`), and the Back-pops-the-thread hazard is guarded by a `thread-list` assertion rather than argued with. **The six accumulated identical messages are still a real defect** and are not this one — see `qa/QA_HANDBOOK.md`, "A flow that writes and never cleans up". **2026-09-22 — MEASURED. The cause is a selector, not the gesture, and I had that wrong twice.** Measured on `qa_phone4` before a memory tripwire ended the session: an isolated probe that logs in, opens the thread and does `longPressOn: id: msg-mine-.*` **OPENS THE SHEET**. So maestro CAN drive this gesture, and my earlier conclusion — repeated to the relay as fact — that `longPressOn` does not land was wrong. What is actually wrong is the SELECTOR: the live tree held **7 `msg-*` elements, 6 of them carrying the identical `content-desc` "[qa] automated test message"** — one per previous run of this flow, because it sends the same text every time and never removes it. `msg-mine-.*` therefore matches many elements, maestro picks one, and once enough runs have accumulated the pick is off-screen. The flow breaks itself a little more on every run, which is the same class as `15-sessions-switch`. **A fix was attempted and did NOT work**: a unique `[qa] <timestamp>` per run plus `text:` on the long-press selector — the pressable does carry the body as its accessibility label (`PersonMessageRow`: `accessibilityLabel={message.body}`), so naming one element should be possible, but 06 still failed at `reaction-sheet`. Whether a combined `id` + `text` selector resolves the way I assumed is the open question. The edit was reverted rather than committed, because a flow that still fails is not a fix. **2026-09-21 — NOT MEASURED, and the cause in `CLAUDE.md` was wrong.** The long press does work: driven by hand (`adb input swipe`, same point, 800 ms) it opens `reaction-sheet` with all its emoji. Maestro's `longPressOn` is what does not land — the only interaction proved not to reach this app, and used by this flow alone. The old cause (Android's text-selection ActionMode consuming the gesture) was real and was fixed: `PersonMessageRow` dropped `selectable` and Copy lives in the reaction sheet. I graded this FAIL first and it reached his board as the only known defect in the app; it is not one. The flow now waits for the sheet's fade rather than asserting instantly — that did not fix it, but an instant assertion on an animated `Modal` was wrong regardless. **PASS — 2026-09-19 21:20, dev build, tree at `67f698b`. Third run; the two failures before it were DEFECTS IN THE APP, not debt in this flow.** Now covers the whole thing: the chat list, a thread opened by row, a message **sent** and landing on the RIGHT (`msg-mine-*`), the long press opening `reaction-sheet`, a thumbs-up added and its chip appearing, and **the same emoji taking it back off** — one endpoint, no separate remove. Two defects were found here and both are fixed: (1) the composer went under the keyboard — `Screen`'s `KeyboardAvoidingView` had `behavior={undefined}` on Android, which is nothing under edge-to-edge (`28cf795`); (2) `PersonMessageRow` rendered the body as `<Text selectable>` inside the Pressable carrying `onLongPress`, and on Android the platform's text-selection ActionMode takes the long press and consumes it — **so reacting was impossible on Android for every build up to `67f698b`**. Do not re-run a row like that hoping; it could not have passed. The frames are the diagnosis: `not-met/step-028-*.png` is Copy · Share · Select all where the reaction sheet should be | **Not the other side** — a message from another person rendering LEFT is the half of the `sent_by_me` trap that matters most, and it needs a second signed-in account the rig does not have. **Not the double tick**, **not the unread divider**, same reason. Nothing about groups. And still unasserted: the thread renders EMPTY and fills a moment later, so `thread-list` can pass against a list holding nothing — the arrival assertion is weaker than its name |
| `07-notifications.yaml` | **PASS — 2026-09-19 17:05, dev build, tree `5e37367` + e7's uncommitted i18n. A THIN PASS, and the thinness is the point.** Reached by `chat-open-notifications`; `notifications-list` present; the QA account has no notifications, so it took the **empty branch** and asserted *"You're all caught up."* and nothing else. That is a real pass of reachability and the empty state, and it is all it is | **The whole substantive half was SKIPPED, not passed.** Everything behind `notifications-empty` being absent never ran: the date heading, tapping a `notification-row-*` through to a composed question, the *"What is this about:"* prefill, the row marked read on return, **Mark all as read**, and the **Clear read notifications** confirm with its *"Anything still unread stays where it is."* wording. Six of the flow's eight screenshots were never taken. To measure any of it the QA account needs a notification, and nothing in the rig makes one — a flow cannot create one without a second account or a server-side write, and `RIG_CONTRACT.md` §3 rules the second out. Recorded as UNRUN inside a PASS rather than left to look covered |
| `08-calendar.yaml` | **PASS — 2026-09-19 17:10, dev build, tree `5e37367` + e7's uncommitted i18n. Thin, like 07, and for the same reason.** Reached by `chat-open-calendar`; `calendar-list` present, the *"What's next"* heading, and `calendar-day-today` — the ternary testID that is a fixed handle for today and a date-keyed one for every other day, so today is addressable without a record id. The QA account has no events today, so it took the **`calendar-nothing-today`** branch and asserted *"Nothing today."* | **The branch with events in it never ran.** Everything behind `calendar-nothing-today` being absent is UNRUN, not passed. Same shape as 07: the QA account holds no calendar data and the rig will not create any — nothing in `qa/` writes to that backend, by `RIG_CONTRACT.md` §3, and the database behind it is his real one. A fixture account with a seeded week is what would measure this, and that is a decision about his data rather than a gap in the flow |
| `09-keyboard.yaml` | **PARTLY UNRUN — 2026-09-21.** The composer half below is a real **PASS — 2026-09-19 17:50, dev build, tree `5e37367`+`28cf795`. FIRST RUN EVER; this row said UNRUN until then.** A second half was added on **2026-09-21** — the conversation must still be at the bottom with the keyboard up — and it **has never executed. NOT MEASURED, twice**: both attempts reached `preflight PASSED` on `qa_phone2` and died in the environment rather than the app, first a System UI ANR at 3.0 GB available (under CLAUDE.md's 4 GB floor), then a bundle that never finished loading after Maestro's `openLink` left Expo Go on its own HomeActivity. Device released both times. **Do not read the 2026-09-19 pass as covering the new block.** With the keyboard raised the field, the send button and the attach button are all on screen and hittable; the draft then **survives the keyboard closing**, asserted on the field's own text rather than its presence; and the clear control appears with a draft and clears it. `50-keyboard-up.png` is the evidence and it also **corrects this flow's own header**: Gboard on this AVD is **DOCKED and full-width**, not floating. The header claimed floating — the easy case — which was the reason to doubt the flow instead of the screen | **Not iOS**, which is the platform the assertion exists for. And the honest history: because this flow had never run, it caught nothing when `app/chat.tsx`'s `Screen` container carried `behavior={undefined}` on Android and the assistant composer had the identical defect `06-people-chat` found on the people thread. There was no vacuous green here to explain — there was no green. A flow written and never executed proves exactly as much as no flow. **And the composer is not the whole claim.** He reported 2026-09-21: *"when i go to bottom of session and i open keyboard it hide what it showed."* The composer survived exactly as this flow says while the NEWEST MESSAGE went behind it — a green that was true and much narrower than the screen's actual requirement. A block added tonight asserts the conversation stays at the bottom too, using `scroll-to-bottom`'s ABSENCE as the instrument (it renders only when the reader is away from the newest, so "still at the bottom" and "the button is not offered" are one fact). It first proves the thread is long enough to have a bottom to be away from, so it cannot pass by being unreachable. **That block is UNRUN — 2026-09-21. NOT MEASURED, twice.** Both attempts reached `preflight PASSED` on `qa_phone2` and then died in the environment rather than the app: a System UI ANR while the box was under 4 GB, and on the retry a bundle that never finished loading. The device was released both times |
| `signed-out.yaml` | Helper, like `login.yaml`: ends on the sign-in screen by signing OUT through the sessions sheet's own row — the way a user does — so the auth flows start where a stranger starts | Does not wipe storage. `clearState` would erase the device fingerprint every token is bound to, and under Expo Go it lands on Expo Go's error screen |
| `10-sign-up.yaml` | **2026-09-24 — `${EMAIL}` renamed `${MAESTRO_QA_EMAIL}` (`75de280`), no other step changed; UNRUN since.** Between 2026-09-22 00:44 and that fix this flow typed the literal `undefined` as the address (see "SIGN-IN WAS BROKEN" below), so any result from that window is void. **PASS** — run 7, dev build, 2026-09-19 (see *Run 7 — six verdicts*). Reachable from sign-in's "Create account"; validate-on-press with copy that names name, email and password; a TAKEN address — the QA account's own, the only one the rig may type — refused in the server's own words, "has already been taken", which is the JSON:API `errors[].detail` shape only this screen parses; nothing created and nobody signed in (still on sign-up, no composer); the way back to sign-in | **Does not create an account.** The 201 path — Devise signs the new user in and the app lands on the assistant — is unit-tested only; making users in his real database on every run is not a test. Not the 429: `rack_attack.rb` throttles `/users`, the route is `/users/signup`, so it never fires (backend finding). Walks past two app findings it records in its header: `detail` names no attribute, so the screen says "has already been taken" without saying what; and lastname is required by the server and not by the app |
| `11-forgot-password.yaml` | **2026-09-24 — `${EMAIL}` renamed `${MAESTRO_QA_EMAIL}` (`75de280`), no other step changed; UNRUN since.** Between 2026-09-22 00:44 and that fix this flow typed the literal `undefined` as the address (see "SIGN-IN WAS BROKEN" below), so any result from that window is void. **A CHOSEN SIDE EFFECT, stated so it is not a surprise (2026-09-22, measured — read in the flow).** This submits the real form, so **every run mails a real password-reset link to the QA address**. Bounded (the link expires, the account is the rig's, never his) and it is the only way to prove the 202 branch, so it is kept — but it is a write to the world on every run and it belongs in this column rather than in somebody's inbox unannounced. `qa/QA_HANDBOOK.md`, "A flow that writes and never cleans up". **PASS** — run 7, dev build, 2026-09-19 (see *Run 7 — six verdicts*). Reachable from sign-in's "Forgot password"; validate-on-press with copy naming the email; the error clearing as you type; the QA address submitted with the keyboard's Go key (`returnKeyType="go"`); the server ACCEPTING — `forgot-password-sent` renders on a 2xx and on nothing else — and the copy that does not say whether the address was known; back to sign-in | **Not that mail arrived, and not the link.** The confirmation step is web-only in v1 by design. Not a non-existent address: the server answers 200 either way, so the screen has nothing to branch on, and the rig types no address but the QA account's. **Budget: 5 per 15 minutes per IP** (`rack_attack.rb`); a run past that fails on the sent state with `too_many_requests` on screen, which is the throttle and not the app. Every run puts a real reset token on the QA account and a real mail in its inbox |
| `12-account.yaml` | **ROUTE CHANGED 2026-09-21 — the pass below predates it.** Theme, language, profile, privacy and sign out moved out of the conversations sheet and behind the photo in the title bar, so every one of these now enters through `chat-open-profile` instead of `chat-open-sessions`. What each asserts is unchanged; how it gets there is not, and none of the rewritten paths has run. **PASS** — run 7, dev build, 2026-09-19 (see *Run 7 — six verdicts*). The Appearance control in the sessions sheet; System chosen first so the baseline photograph is honest; Dark chosen, `selected` asserted, and the assistant PHOTOGRAPHED dark (66 vs 68 is the artefact); the choice **surviving a relaunch** — `hydrate()` before first paint — which is the store's reason and the one thing a screenshot cannot show; restored to System; the Account screen with its two rows and the warning caption before the delete tap; Back | **Not that dark is correct** — no assertion reads a colour; a person compares 66 and 68. **Not the language switch: it does not exist** (see Run 7). Not System following the phone: the emulator's own scheme is not toggled. Does not go through the privacy or delete doors — 17 and 18 do |
| `13-profile.yaml` | **IT LEAVES THE QA PROFILE REWRITTEN, ON PURPOSE (2026-09-22, measured — read in the flow).** The first name becomes `QA rig, first pass` and About becomes `QA account. About is written by qa/flows/13-profile.yaml`, and nothing restores either. Same values every run, so nothing accumulates — this is not the growth defect. It is a decision: the About line names the file that wrote it precisely so whoever next opens that account can see why, and restoring at the end of the happy path would be the cleanup that is not cleanup. Stated here so it stops being a surprise. **ROUTE CHANGED 2026-09-21 — the pass below predates it.** Theme, language, profile, privacy and sign out moved out of the conversations sheet and behind the photo in the title bar, so every one of these now enters through `chat-open-profile` instead of `chat-open-sessions`. What each asserts is unchanged; how it gets there is not, and none of the rewritten paths has run. **PASS — 2026-09-19 17:30, dev build, tree `5e37367` + e7's uncommitted i18n. Five runs to get there, and four of them were the flow's fault, not the screen's.** Covers: the photo sheet rather than the picker; first name, last name and About; the email row **locked with its reason**; About edited, saved, `profile-saved` shown; the three rows below (`profile-password`, `profile-keys`, `profile-web`); and then the screen LEFT and RE-ENTERED so the About is read back from the server rather than from component state — which is the only part of this flow that proves anything survived the network | **Four defects in the flow itself, all now fixed and all worth keeping written down.** (1) `profile-web` is the last row and off the fold; a bare `assertVisible` failed on a row that was present. (2) `scrollUntilVisible` reported *"No visible element found"* and `scroll` reported COMPLETED — **both without moving the screen at all**, proven by the failure frame still showing the header and every field. Only an explicit `swipe` moves it. (3) After swiping, the header scrolls too, so `tapOn: "Back"` failed on a control above the viewport — it swipes back up first, and still taps the header's own Back rather than `pressKey`, because a system Back would pass even if the button were missing. (4) The round-trip assertion is **start-anchored, not a full match**: `eraseText` erases backwards from the cursor and `tapOn` puts the cursor where it tapped, so the field came back reading `…13-profile.yaml/13-profile.yaml`. The tail is bounded, not growing without limit, but a full-string match would fail on a save that worked. **Not the disabled Save state** — a disabled Pressable can drop out of the tree. **Not a photo**: the sheet is opened, the picker is not. One environmental note: a run during a sibling's Docker rebuild (load 16) died on an Android ANR dialog, which reads exactly like a failed assertion |
| `14-change-password.yaml` | **ROUTE CHANGED 2026-09-21 — the pass below predates it.** Theme, language, profile, privacy and sign out moved out of the conversations sheet and behind the photo in the title bar, so every one of these now enters through `chat-open-profile` instead of `chat-open-sessions`. What each asserts is unchanged; how it gets there is not, and none of the rewritten paths has run. **PASS — 2026-09-19 17:34, dev build, tree `5e37367` + e7's uncommitted i18n. First run, no flow changes needed.** The assertion this flow exists for HELD: a wrong current password comes back **422 against the field** — `password-wrong-current` and *"That password is not right."* — and **does not sign you out**. `sign-in-email` absent, `password-done` absent, the field still there, and Back lands on the profile and then on the assistant. Also covers the confirmation catching a mismatch (*"These do not match."*), the reveal putting the typed password in the tree, the message clearing when the mismatch is fixed, and the single rule *"At least 6 characters."* rendering from `PASSWORD_MIN_LENGTH` — the one server rule (`devise.rb:185`, 6..128) and no invented ones | **The password is never actually changed, on purpose.** A real change mid-suite would strand every later flow on a stale `.env`, and a failed change-back would lock the rig out until a human intervened — so the current password typed is wrong deliberately and nothing on the server moves. The success path (the confirmation, the fields clearing) is unit-tested only. Not the 401-vs-422 distinction from the client's side beyond the sign-out check, and not rate limiting |
| `15-sessions-switch.yaml` | **2026-09-24 — header comment only, no step changed; STILL UNRUN since the defect below was fixed.** The comment on the chat-empty proof now says the standing conversation's non-emptiness is RESIDUE nothing replenishes, since `01-ask` stopped writing into it. And the defect below, the `ai_usage_events` FK 500, is fixed in multi_magic `6923905` (`dependent: :nullify`), so the next run measures switching rather than that — read from the register and the commit, not from a run. **2026-09-22 — the precondition is now set deliberately, and the flow found a REAL DEFECT. MEASURED.** With the sheet already open at step 2 — nothing to open, nothing to reopen — a bounded `repeat` deletes any stale `QA switch target`/`QA switch other`, and the precondition holds because this flow made it hold rather than because the account happened to be in that state. It then stopped somewhere new: **`DELETE /api/v1/ai/sessions/281` → 500**, `PG::ForeignKeyViolation` on `fk_rails_c4ce20fceb` / `ai_usage_events`, raised at `app/services/ai/sessions.rb:93`. `Conversation` declares no association for `ai_usage_events` and the FK carries no `on_delete:`, so Postgres restricts. **This is not a few unlucky rows: `ai_usage_events` begins 2026-09-18 and `ai/models/base.rb:75` records one on every model call, so it is every conversation touched since that date and every one from now on.** Nothing is special about the affected conversations except when they were used. Backend — reported, not touched; the shape is `dependent: :nullify`, because a usage event is billing history that should outlive its conversation. **The mobile half was ours and is fixed**: the error rendered behind the confirm's own Modal, so the button did nothing forever with the explanation sealed behind it — now `delete-conversation-error`, inside the dialog. **And the first cleanup was wrong in this file's own documented way**: it asserted only `notVisible`, which passed against a covered sheet. Positive assertion first now. **Still NOT MEASURED for what this flow is about** — switching by title is never reached. **2026-09-22 — MEASURED, and it corrects the two learnings below, which were inferred from a failing run and are wrong.** (a) **Deleting does NOT close the sheet.** `SessionsSheet.tsx` `destroy.onSuccess` calls `refresh()`, `setPending(null)` and `onOpenSession(fallback.id)`; `onClose` is called at four sites — create, row tap, Android back, the close button — and none is the delete path, and the component has no `useEffect`. `app/chat.tsx` passes `onClose` and `onOpenSession` as separate props and `chooseSession` only remembers and activates. A recorded run agrees: this flow's own cleanup deletes two conversations back to back with no reopen between them, and that passed on 2026-09-19. Now gated by `SessionsSheet.test.tsx`, "leaves the sheet OPEN afterwards" — planted and watched red. (b) **`chat-open-sessions` being absent while the sheet is open is not a bug**: that is a `Modal` covering the header, behaving correctly. **So the cleanup never needed to open anything** — this flow already has the sheet open at step 2, and a cleanup belongs there, where four attempts instead went looking for a header that was correctly hidden. Still NOT MEASURED: nothing has been run, and the flow is unchanged. **And the underlying defect is a class, not this flow** — a constant name plus cleanup only on success; see `qa/QA_HANDBOOK.md`, "A flow that writes and never cleans up". **2026-09-21 — INFERRED, and two of these are now corrected above. NOT MEASURED, and four attempts at making it idempotent were reverted.** The flow creates a conversation called "QA switch target" and later asserts it is gone; the QA account still holds one from an earlier run, so that assertion fails before the test begins. What was learned trying to add a cleanup, so nobody re-spends it: (1) the flow ALREADY opens the sessions sheet at step 2, so a cleanup that opens its own finds no `chat-open-sessions` — the header is behind the sheet; (2) deleting a conversation CLOSES the sheet, so the flow's next step (`sessions-new`) then has nothing to tap; (3) a conditional reopen after the delete also fails to find `chat-open-sessions`, and that is where I stopped. Each fix exposed the next assumption, which is the shape of a flow that wants its author rather than a patch at midnight. **What would close it:** either a clean QA account, or a cleanup written by somebody holding the whole flow's state in their head. **PASS — 2026-09-19 17:38, dev build, tree `5e37367` + e7's uncommitted i18n. First run, no flow changes.** The fullest pass of the night. A new conversation created and proven to have opened by its EMPTY state (`chat-empty`) rather than by the sheet closing; renamed from its own row menu, the menu's safe order (**Clear** first) asserted on the way past; a second one created and renamed so there is something to switch FROM, and marked `selected` as the active row; then **switched by title** and the sheet marking the chosen row `selected` — which is `activeId` and nothing else. Every row is addressed by its *"Options for …"* label or its title, **never by a record id**: `session-row-<id>` and `session-menu-<id>` are testIDs built on database ids, which is a finding rather than a selector. Then it **deleted both conversations it made**, through the real confirm, asserting the wording and the guarantee naming notes, contacts, loans and money, and landed on the fallback the server hands back | **The at-limit branch never ran** — the QA account is not at 50, so the NOT MEASURED path and its screenshot are untested. Not Clear, not Search-in, not How-to-answer. Not a switch between conversations that both hold messages: both of these were empty by construction, so what is proven is that the sheet changes `activeId` and the screen follows, not that a long thread reloads correctly. The cleanup is asserted (`notVisible` on both titles), so the account does not fill up the way `04` used to |
| `16-ai-keys.yaml` | **ROUTE CHANGED 2026-09-21 — the pass below predates it.** Theme, language, profile, privacy and sign out moved out of the conversations sheet and behind the photo in the title bar, so every one of these now enters through `chat-open-profile` instead of `chat-open-sessions`. What each asserts is unchanged; how it gets there is not, and none of the rewritten paths has run. **PASS — 2026-09-19 17:42, dev build, tree `5e37367` + e7's uncommitted i18n. First run, no flow changes.** Reached from `profile-keys`; the heading, `ai-keys-(list|empty)`, and the whole intro paragraph asserted word for word — *"…the key is checked with the provider before it is saved, and it is never shown again afterwards."* — which is the promise the screen makes and the one worth pinning. **It took the `ai-keys-list` branch: the QA account HAS a key**, so **Replace** and **Remove** are present and asserted | **Nothing is added, replaced or removed.** A real key is a real provider credential and a real bill; the flow photographs the has-a-key state under a filename that says NOT MEASURED and stops. The empty branch never ran this time, so its copy is untested. **And this pass contradicts `01-ask`'s note**, which says the QA account has no provider key and every reply is therefore the missing-key message — that note is now stale, and whether `01`'s answers have been real all along or the key is inactive is unresolved and should be checked before `01`'s "does not cover" is trusted again |
| `17-privacy.yaml` | **ROUTE CHANGED 2026-09-21 — the pass below predates it.** Theme, language, profile, privacy and sign out moved out of the conversations sheet and behind the photo in the title bar, so every one of these now enters through `chat-open-profile` instead of `chat-open-sessions`. What each asserts is unchanged; how it gets there is not, and none of the rewritten paths has run. **PASS — 2026-09-19 17:45, dev build, tree `5e37367` + e7's uncommitted i18n. First run, no flow changes.** Reached from `account-privacy`; the page renders through `Markdown.tsx`'s subset, the headings survive the parse on a real device, and it scrolls to *"What we do not do"* at the end — so the document is whole between the file and the screen, which is the thing the unit tests can only argue about. **The DRAFT BANNER IS ON** and photographed as `89-privacy-DRAFT-BANNER-ON-release-gate`: *"Draft — not yet approved"*, driven by the document's own title line. **That is a release gate, not a detail** — the policy is still awaiting Hamma9900's approval and the app says so honestly on the screen a store reviewer opens | **Not the sha agreement.** The phone bundles the text and the backend serves the same twelve characters at `GET /api/v1/legal/privacy`; this flow reads only the phone's copy, and the agreement between the two is proven in `src/content/__tests__/privacy.test.ts` rather than here. Not the French rendering of the policy. Not the not-a-draft branch, which is SKIPPED until he approves it and will need a run on the day he does |
| `18-delete-account.yaml` | **ROUTE CHANGED 2026-09-21 — the pass below predates it.** Theme, language, profile, privacy and sign out moved out of the conversations sheet and behind the photo in the title bar, so every one of these now enters through `chat-open-profile` instead of `chat-open-sessions`. What each asserts is unchanged; how it gets there is not, and none of the rewritten paths has run. **PASS — 2026-09-19 17:48, dev build, tree `5e37367` + e7's uncommitted i18n. First run, no flow changes.** The warning arrives BEFORE the tap; the disclosure names all six things that go and the one thing that is **kept** with its reason, word for word — *"What the assistant cost — which provider ran, and how many tokens. Your name is removed from those rows, and they hold no part of any question or answer."* The **gate is OPEN** (`ACCOUNT_DELETION_AVAILABLE` true, endpoint landed at `multi_magic@56559c4`): the password field and **Keep my account** are both there, photographed as `92-delete-account-gate-OPEN`. And it is structurally NOT the conversation delete — `delete-conversation-question` is asserted absent, so the sessions dialog's wording is nowhere on this screen | **The password field is never filled and deletion is NEVER confirmed.** The only tap on that screen is the way out. `RIG_CONTRACT.md` §3 is explicit that no test calls account deletion against a real account; when that path is exercised it is against a throwaway user, by hand. So what is proven is the disclosure, the gate and the escape — not that the endpoint deletes anything. The gate-SHUT branch is SKIPPED and untested. Whether it *looks* different enough from the conversation delete is a judgement no assertion makes: `91` here and `04`'s `32-delete-confirm` are the pair a person compares |
| `19-session-options.yaml` | **PASS — 2026-09-20, dev build, tree at `df1a2f9`. Five runs, and four of the failures were real findings rather than flakes.** Exercises the two dialogs behind the row menu that `15` could only assert were present: **Instructions** typed, saved, reopened and still there, then changed, cancelled, reopened and the change gone; **Scope** narrowed, saved, reopened and still narrowed, and cancelled in the same harder direction. Both cancels proved by REOPENING, because a cancel that merely closes the dialog passes a weaker test that reads the same | **Three corrections the device forced, all recorded in the flow.** (1) `scope-all` was asserted from the DEFAULT state and could never have passed — `SessionOptionsDialogs.tsx:244` renders it only when `selected.length > 0`, because it is the *search everything again* escape and with nothing narrowed there is nothing to escape from. It now asserts it is **absent** first and **appears** once Notes is picked, which is the stronger claim. (2) The rename was saved with `pressKey: Enter`, citing `15`. **In this flow it did not save** — after Enter the dialog was still open, and the title assertion passed anyway by matching the text in the dialog's own FIELD rather than a row, so the next step hunted a row menu behind a modal. **But `15` renames twice with Enter and passes end to end, which it could not do if the dialog stayed open there.** So Enter saves in one flow and not in the other and I cannot say why — a timing difference, or a focus one. Recorded as unexplained rather than resolved; what is certain is that the assertion could not tell the two apart, which is the part worth fixing. It taps `rename-save` now, which is also a handle `15` could only assert existed. (3) Every failed run left a `QA options target` behind; nine had accumulated before I noticed, which is `04`'s hazard arriving through a flow that cleans up correctly and simply never reached its cleanup |
| `20-refresh.yaml` | **PASS — 2026-09-20, dev build. THIN, and the thinness is the whole verdict.** `calendar-refresh` and `notifications-refresh` are present, tap, and — the actual assertion — the **list stays on screen while the refresh is in flight**. That is the design rule: the refresh state lives in the control, never a full-screen spinner, and no unit test here can see it because Jest has neither layout nor timing | **Both screens took their EMPTY branch**, as the flow's author predicted: the QA account has no notifications and no events today, so `calendar-nothing-today` fired and its screenshot is filed **NOT MEASURED**. What passed is that the control exists, responds, and does not replace the list. What did not run is the same refresh over a list with rows in it, which is the case the rule is actually about |

## Are any of run-8's passes hollow? — checked 2026-09-21

After `06-people-chat` turned out to be maestro failing rather than the app, the
fair question is how many PASSes rest on an interaction that never landed. A tap
that silently does nothing, followed by an assertion that happens to be true
anyway, is what `flow_lint`'s TOOTHLESS check exists to catch.

**Checked mechanically, and none of them.** Every passing flow asserts at least
one `testID` that cannot exist on the screen it starts from, so no flow could
have reached its assertions with its interactions as no-ops. The three thinnest
still turn on one screen-specific element each: `login` on `sign-in-email`,
`set-language` on `language-row`, and `01-ask` on `thinking`, which only exists
between a question being sent and an answer arriving.

**And the instrument's failure is narrower than it looked.** `longPressOn` is
used by exactly one flow — `06`, already NOT MEASURED. Header taps work, and
`19-session-options` proves it: it taps `chat-open-sessions` and then asserts
`sessions-sheet`, which does not exist until that tap lands. I had told the
relay that header taps "report COMPLETED and navigate nowhere", and that was
wrong — I had already disproved it with a probe that tapped the bell and
asserted the word "Notifications" successfully.

**What this check cannot say:** it reads whether each flow's ASSERTIONS are
screen-specific, not whether every intermediate step landed. A flow could no-op
a middle tap and still arrive by another route. Each of these asserts something
specific at each stage, which makes that unlikely rather than impossible.

## RUN 8 — 2026-09-21, dev build, `qa_phone4`, first verdicts since 19 September

`qa/reports/run-8/results.jsonl`, written one row at a time as each landed.
**5 PASS · 1 PARTIAL · 0 FAIL so far**, and the run is not finished.

| flow | verdict | what it actually proves |
|---|---|---|
| `login` | PASS | fills the form, submits, lands on the composer |
| `01-ask` | PASS | a real question → `thinking` → `assistant-answer` over the socket. **The register's "NOT MEASURED until the send button is found" no longer applies on the dev build** |
| `07-notifications` | PASS | empty-state branch — the screen, the refresh control, the freshness line. NOT a populated list |
| `08-calendar` | PASS | empty-state branch, `calendar-nothing-today` photographed |
| `20-refresh` | PASS | both refreshes, both empty branches. **FAILED on Expo Go in the same session** — harness, not app |
| `09-keyboard` | PARTIAL | composer half PASS with 50/51/52 photographed; bottom half NOT MEASURED |

**Three instrument faults fixed to get here, all of which read as app failures:**

1. **The dev client's menu is not Expo Go's menu.** `login.yaml` guarded only
   *"This is the developer menu"*. A development build shows its own overlay —
   *Element inspector*, *Fast Refresh*, *Connected to: …* — so the guard never
   fired and every dev-build run failed asserting `sign-in-email` **while the
   app was loaded and running underneath it**. A second guard presses Back.
2. **Expo Go is not a substitute.** `20-refresh` fails on Expo Go and passes on
   the dev build, in the same session, on the same device. `QA_HANDBOOK.md`
   already says this and I had to rediscover it.
3. **`09-keyboard` asserted its own premise first and cost the rest.** The new
   block needs a conversation taller than the screen; the QA account's is two
   answers on one screen, so it failed by design and took the composer half —
   which passes — down with it. Reordered: evidence that exists is no longer
   forfeited to prove a second thing.

**And `flow_lint` now runs in `npm test`** as `pretest`. It was in no npm
script and no CI job, so it only ever caught what somebody remembered to run it
against. Planted a flow selecting a testID that does not exist: `npm test` stops
before jest starts.

**What run 8 cannot tell anybody yet**, and it is most of what changed this
week: read-aloud and dictation (native, and this dev build's native side is from
19 September — a two-day-old binary cannot prove a feature built after it),
two-factor and trust-this-phone, sign-up, the profile photo, the tablet, French,
and animations, which do not exist.

## SWEEP ATTEMPTED 2026-09-21 — NOT MEASURED, 0 of 24 executed

His instruction was to re-run everything against the current tree, because the
app has moved a long way since Saturday and a verdict against code that has
changed underneath it is what `docs/TESTING.md` exists to warn about. **Every
dated verdict below therefore still predates** the two-step code screen,
trust-this-phone, the account menu behind the photo, settings leaving the
conversations sheet, dictation in the people composer, four scroll and keyboard
fixes, the signup fix and the avatar-host fix. They are stale rather than
wrong, and nothing in this attempt made them less stale.

**The rig could not reach the app, and the fault is the rig's.** `qa_phone2`
wedges on an `Application Not Responding: com.android.systemui` within minutes
of booting, every time. Four boots: windowed at `-memory 2048` and headless at
`-memory 3072`; host load average 9.5 on the first and 4.6 on the last; free
RAM 2.4 GB at worst and 15 GB at best; `pswpin` flat throughout. It ANR'd in
all four. Preflight itself passed twice — the display, the API alias, the adb
reverse, the backend and Expo Go's version were all `ok` — and the device then
wedged before a flow could assert anything.

Ruled out along the way, so the next session does not re-spend it:

- **Host CPU.** It ANR'd at load 4.6 as readily as at 9.5.
- **Host RAM.** 14.5 GB available at the last attempt, swap-in zero.
- **Orphaned Metro instances.** Two only: his phone's on 8081 from
  `mm-sdk57`, and this sweep's on 3029. Neither was touched.
- **GPU/window cost.** `-no-window` made no difference.
- **Disk**, probably. 97 % full with 17 G free is a standing risk and worth
  saying out loud, but 17 G is enough for a 3.6 G image to write into.

**What the rig did tell us**, and both are instrument findings rather than app
findings:

1. `qa/preflight.sh:82` probes Metro with `curl --max-time 3`. During an AVD
   boot Metro's first `/status` took **3.32 s** and preflight reported "Metro
   not answering" about a Metro that was answering. It passes once settled, so
   the check is not wrong, it is too tight to be trusted while anything else is
   starting.
2. Running a flow by hand needs the deep link that `run.sh:36` issues **with
   the package named** before maestro starts. Maestro's own `openLink` does not
   name a package, so on a cold Expo Go it lands on Expo Go's HomeActivity and
   every flow then fails asserting our sign-in screen — a failure that reads
   exactly like the app being broken.

**What would unblock it:** the AVD looks damaged rather than busy. A
`-wipe-data` would be the obvious next move and is deliberately NOT taken here:
it destroys the installed Expo Go and the rig's state, which is shared, and
that is somebody's decision rather than a session's. Ask before wiping.


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

---

## The TalkBack probe — 2026-09-19, attach sheet, tree at `4359205`

da asked whether the five sheet scrims group their contents: each dismisses
through a full-screen `Pressable` with `accessibilityRole="button"` and
`accessibilityLabel="Close"`, holding the sheet's rows as **children**. If a
named accessibility element groups its children, a screen reader announces one
"Close" button per modal and every row inside is unreachable — five screens a
blind person could not operate, including attaching a file and reacting.

**MEASURED ON THE DEVICE, AGAINST THE REPAIRED BUILD (`d2f9e7d` and later).**
Read from the accessibility tree itself rather than from TalkBack's speech,
because the tree is what TalkBack walks and it is quotable:

| node | content-desc | focusable |
|---|---|---|
| the scrim | `Close` | **true** |
| `attach-photo` | `Photo. From your library` | **true** |
| `attach-camera` | `Camera. Take one now` | **true** |
| `attach-document` | `Document. PDF or CSV` | **true** |

**Four separate stops, each carrying its own hint.** The rows are reachable,
so the change is **not harmful** on the platform we ship to first.

**IT SAYS NOTHING ABOUT WHETHER ANDROID GROUPS, and an earlier version of this
entry claimed it did.** That was wrong and it is da's catch. This ran against
`4359205`, which is after `d2f9e7d` — the scrim was already a SIBLING of the
rows, so nothing was nested. Four focusable stops is what the repaired
structure produces whether Android groups or not; the fix had deleted the very
thing that would have triggered the behaviour under test. A run cannot measure
a condition that no longer exists in the tree it is pointed at.

It also does NOT prove the fix was necessary. da's reading of
`ReactAccessibilityDelegate.java:467` — `hasNonActionableSpeakingDescendants`
skips any child that is itself focusable — predicted exactly this, and the
result is consistent with Android never having been affected. **The defect it
guards against is an iOS one, and iOS has no build, no simulator and no rig
here, so it remains unverified on the platform where it is real.** That
distinction is the finding; "it worked" and "it was needed" are two different
statements and this run only supports the first.

---

## The picture pass — 2026-09-19, where it actually got to

| combination | screens |
|---|---|
| `360-light-en` | **complete, 9 of 9** |
| `360-dark-en` | **complete, 9 of 9** |
| `411-light-en` | **complete, 9 of 9** |
| `411-dark-en` | **complete, 9 of 9** |
| `800-light-en` | **NOT ATTEMPTED** |
| `800-dark-en` | **NOT ATTEMPTED** |
| `360-light-fr` | **NOT ATTEMPTED** |
| `360-dark-fr` | **NOT ATTEMPTED** |

Nine screens per combination: chat, sessions, people-chat, notifications,
calendar, account, profile, upload, sign-in. Device handed to `hatiwal-73` at
this point for two flows on a 1.1.0 build sitting at Apple and Google; the 800
and French sets are **not attempted**, which is a named gap and not a silent
one. Tree at `dc20652`.

### The pass photographed a defect it had manufactured itself

Twice, and the second one reached the owner.

`qa/screens.sh` sets the width by changing the device's density, then the
night mode, then runs the flow. The force-stop originally sat **inside**
`set_width`, ahead of the night-mode change — so the app survived the last
configuration change and rendered at the OLD density inside the NEW window.
The 360 dark set came out with text cut off mid-word at the right edge and the
header missing its fourth icon. **It looks exactly like a real 360 dp overflow
bug**, and it was about to be filed into `ours/`, which is the evidence `DONE`
is defined against.

Moving the force-stop after every configuration change fixed 360. It did
**not** fix 800, and the four-second settle behind it was the reason: 360
changes density alone, 800 changes **size and density together**, and the
display is still reconfiguring when the app comes up. That set was worse —
clipped vertically as well as horizontally — and one of its pictures reached
Hamma9900, who photographed the sign-in screen and sent it up as a product
defect. It is not one: force-stop, relaunch at the same Override, and sign-in
renders perfectly.

**Every 800 picture was deleted rather than captioned.** A picture that looks
like a defect IS a defect report to whoever finds it next.

The fix is an instrument, not a longer timer: the app is launched, and nothing
is shot until its own window bounds **agree** with the width the device was
set to. It belongs in the rig rather than in this pass — the next session to
change a display will hit the same thing and will not know to look.

Beside it, `rc=$?` after a pipe was reading `tail`'s status, which is always
0, so **every combination would have reported complete**, including the ones
that were not. Runs now record `rc` AND how many of the nine screens landed.

### Load is the limiting factor on this box, and it is now measured

At load **15.5** the Pixel Launcher itself ANR'd and a flow died on a system
dialog that reads exactly like a failed assertion. At **7.5**, twelve flows
ran clean. The pass now **refuses to start above 12** and writes the load at
run start into `qa/reports/screens.jsonl` beside the screen count, so the line
can be moved on evidence rather than on taste.

---

## What no flow touches — `python3 qa/flow_lint.py --untouched`

Every other check in the rig runs **forwards**: take what a flow says and ask
whether it resolves. That direction cannot see a handle the app offers and
nothing uses, and both sibling rigs were bitten by exactly that asymmetry on
2026-09-19 — e7 had a key present in both locales, asserted by a locale test
and listed in the docs, **called by nothing**, while the component wrote the
sentence as an English literal two lines below it; Karwan's literal check read
`en.ts` while its rig forced Pashto, so it compared two disjoint sets and
reported clean by construction.

Asked backwards: **153 literal testIDs, 92 reached by a flow, 61 by nothing.**

A list of sixty-one becomes wallpaper, so it is ranked. **Only the first
bucket is a backlog**; the other three are answers, and keeping them in one
list with the real gaps is how the real gaps stop being read.

| bucket | count | what it means |
|---|---|---|
| **BACKLOG** | **20** | reachable on the QA account, and nothing has ever touched it |
| unreachable | 18 | needs a server made to fail, a second signed-in account, or a lost network — states this rig cannot produce **against his real backend**. See the note below: this does not mean *uncovered* |
| unit-only | 17 | counters, captions and containers, not interactive controls; the render tests cover them more cheaply and at three widths |
| forbidden | 1 | `delete-account-confirm` — `RIG_CONTRACT.md` §3 forbids pressing it |

Each entry carries its own reason in `flow_lint.py`, so the next session can
disagree with a judgement rather than with a bucket. **Anything unclassified
defaults to BACKLOG**, deliberately: the failure this check exists to catch is
a gap that looked like coverage, so the default must not be "probably fine".

### "Unreachable by the rig" is not "uncovered", and I had them collapsed

The middle bucket says where a state **cannot be reached from a flow**. It says
nothing about whether the behaviour is tested, and reading it as "nobody covers
this" is wrong in both directions — it would excuse a real gap and it would
claim credit for work living somewhere else.

`msg-retry` is the case that showed it. It sits in that bucket correctly: a
person presses retry when a send has failed, and this rig cannot make his
backend fail. That ruled out a flow and stopped there. What the bucket could
not say is that a **component test** can pass the failure in directly, which is
the better home rather than the consolation one — da took it on 2026-09-19 and
found something no flow would have: a failed message must show **no tick**.
`mine && isLastSent && !pending && !failed` makes the receipt and the failure
mutually exclusive by construction, and if that drifts the row tells somebody
their message arrived when it did not, on the one element they would act on.
Nothing had ever asserted it.

So an entry in that bucket is a question — *where is this covered instead?* —
not an answer.

### The backlog, worked rather than listed

**Started — 28 to 25.** `05-upload` already opened the attach sheet and
asserted its words, so `attach-photo`, `attach-camera` and `attach-document`
were three lines on a flow that exists. Worth noting *why* the words were not
enough: a text assertion passes if the string appears anywhere on screen,
including in a caption, and only the handle says the **control** is there —
and since `049079e` the copy is `t("attach.photo")`, so "Camera" becomes
"Appareil photo" in French and two of the three word assertions would fail on
a French run while the handles hold in both.

**Then five more, 25 to 20, on a menu two flows already open.** `15` opened
the row menu, asserted its ORDER — Clear first, because the order is the
safety mechanism — and walked past the other three entries without naming
them, and it renamed twice without ever naming the rename dialog's own save or
cancel. It saves with Enter, which the field's `onSubmitEditing` performs, so
the BUTTON had never been asserted to exist at all. `session-menu-clear`,
`session-menu-instructions`, `session-menu-scope`, `rename-save` and
`rename-cancel` are now asserted PRESENT.

**Present is not exercised, and the register should not let that blur.** Clear
would empty a conversation; Scope and Instructions open dialogs this flow does
not enter. What the five prove is that the menu a person opens still has all
four entries in a build where any could have been dropped silently — which is
worth having and is less than covering them. **And these assertions are UNRUN**
— written while the device was with another session, so `15`'s PASS above is
the run before they existed.

**`msg-retry` went to a component test rather than a flow**, taken by da on
2026-09-19: the failure can be passed in, where this rig would have to make
his real backend fail. It found what no flow would have — a failed message must
show **no tick**, because `mine && isLastSent && !pending && !failed` makes the
receipt and the failure mutually exclusive by construction, and construction
drifts silently.

**The rest, and the one with his name on it.** `msg-retry` is the
sharpest: a person presses retry when their message has failed, and nothing in
this suite has ever exercised it. `file-preview-*` and `instructions-*` are
whole features with no flow at all. The `answer-read-*` family landed at
`bf0ec10` and has no flow yet.


---

## `ICON` — one handle, two nodes

A lucide icon hands its `testID` to **both its wrapper and the `Svg` inside
it**, so `event-repeats`, `session-scoped-*` and `session-instructed-*` each
resolve to **two nodes** in the rendered tree. Nothing else in `flow_lint.py`
can see that: the source says `testID={...}` exactly once, and every other
check in the file reads source.

da found it walking handles backwards on 2026-09-19. **No flow taps one
today**, which is precisely why the check went in now — the first flow that
does will hear it from the linter rather than from a device at 3am, wondering
why a tap landed oddly.

Detected by SHAPE rather than by an import list: a lucide icon is the element
taking `size` and `color` and rendering no children.

**It was proved by making it fail**, not by reading it. A throwaway flow
tapping `event-repeats` produces the finding; the real suite stays at 0. The
first version of the detector silently missed the two template handles — a
flat brace match stops at the `}` inside `${session.id}` — and it found only
`event-repeats` while claiming to cover all three. That is the same shape as
da's `edited` test, which asserted `getByText("edited")` and passed against
the literal it was written to forbid, because English's value for that key
*is* "edited". A check that has never failed is a hypothesis.

---

## STATE AT 2026-09-19 22:40 — read this first if you are picking this up cold

Battery 26%, no charger, so this was landed rather than finished. Emulator
shut down CLEANLY, display reset (no Override on size or density), claim
released, Metro stopped.

### Pictures

| combination | screens |
|---|---|
| `360-light-en` | **complete, 9 of 9** |
| `360-dark-en` | **complete, 9 of 9** |
| `411-light-en` | **complete, 9 of 9** |
| `411-dark-en` | **complete, 9 of 9** |
| `800-light-en` | **NOT ATTEMPTED — see below** |
| `800-dark-en` | **NOT ATTEMPTED** |
| `360-light-fr` | **NOT ATTEMPTED** |
| `360-dark-fr` | **NOT ATTEMPTED** |

360 and 411 are trustworthy: shot after the force-stop moved to the right side
of the configuration change, and spot-checked against a clean manual relaunch.

### 800 dp is unshot, and the honest reason is that my own check is unproven

The pictures from the FIRST 800 attempt were deleted, not kept — they were the
stale-layout artifact, and one of them reached Hamma9900 as a photograph of a
broken sign-in screen. Everything since has been trying to make the rig
incapable of producing that again, and the instrument itself went wrong three
times in a row:

1. `wait_for_geometry "$1"` — `$1` inside the loop is the SCRIPT'S ARGUMENT,
   not the width, so it asked for a window `800-light` px wide and refused
   every combination with a message that read exactly like the display failing
   to settle. `return` was also used in a `while` body rather than a function.
2. `screens.sh` never set `USE_DEV_BUILD`, so `APP_ID` resolved to **Expo Go**.
   The pass had always worked anyway, because `login.yaml` does `launchApp`
   (Expo Go) then `openLink` with the dev-client URL, which hands over to our
   app. It only mattered once something outside maestro had to launch the right
   binary — the check started Expo Go with Expo Go's link and dumped a window
   that was never ours.
3. The check read the root node of `uiautomator dump`. **That dump describes
   the FOREGROUND WINDOW, not the display.** With an ANR dialog on screen the
   entire dump is the dialog, there is no `[0,0]` root, and the check reported
   "window reports nothing px" while the display had settled perfectly. It now
   asks `dumpsys window displays` for `cur=`, which no dialog can hijack and
   nothing clips — the same trap Karwan hit from the other side, where a
   dumped CHILD's bounds are clipped to the visible region and a 31.6 dp
   button was really 56 dp with a footer over it.

All three are fixed and committed. **None of the three has been proved by a
green run**, because the battery went before one finished. Treat
`wait_for_geometry` as written-not-witnessed, and the first thing to do with a
charged box is run `./qa/screens.sh 800-light` and read the whole output, not
the tail.

The last 800 attempt failed with maestro producing no usable output at all,
after the check passed. That is unexplained and is the next thread to pull.

### What is trustworthy right now

* **Twelve flows with written verdicts, no reds** — 06, 07, 08, 09, 13, 14,
  15, 16, 17, 18, and 12's language step is UNRUN.
* `flow_lint` at **0 findings**, and `--untouched` ranked into four buckets.
* The bundle gate passing at 13.66 MB, run first.
* 36 pictures across four combinations, in both `qa/evidence/` and each
  screen's `ours/`, which is tracked now.

---

## 2026-09-20 — the French sets, and two handles that are unreachable for
## reasons that are not the account's

**The picture pass is closed: eight of eight combinations, 72 shots.** 360, 411
and 800 in English; 360 in French; both modes throughout. French at 360 only,
by Hamma9901's decision — the risk French carries is length, length fails at
the narrowest width first, and 411 and 800 have more room rather than less.

**No French string truncates or wraps a row** on the screens inspected, which
were profile (the longest sentence in the app: *"Changer votre e-mail vous
déconnecte des mises à jour en direct jusqu'à la prochaine connexion ; cela se
fait donc sur le site pour l'instant."* — wraps to three lines, fits), account
in dark, and the sessions sheet's own settings block. **Several screens, not
all eighteen**, and this says which rather than implying the whole set was
read.

### The pass could never have shot French

It navigated by `tapOn: "Back"`, and that control is
`accessibilityLabel={t("common.back")}` — "Retour" in French. Every English run
walked through the same five taps for a day. Now `pressKey: Back`, which is how
those screens are left anyway.

### `source-chips` / `source-sheet*` — the ANSWER does not cite sources

Measured rather than assumed: `01-ask` was run end to end, a real question
through `thinking` to a real `assistant-answer`, and the answer's handles are
`answer-actions`, `answer-copy`, `answer-up`, `answer-down` and **nothing
else**. No `source-chips`.

So those four handles move out of the backlog and into **"the rig cannot
produce this state"** — not because of a flow, but because this account's
assistant returns answers that cite nothing. Writing flows for them would have
been six flows against a screen that never appears.

### `answer-read*` — the BINARY predates the feature

`READ_ALOUD_ENABLED` is `true`, Google TTS **is** installed on the AVD
(`com.google.android.tts`), and `answer-read` is still absent from every answer.
That is the app behaving correctly rather than a defect:
`ReadAloudButtons` returns null when `!supported`, and `supported` comes from
`tryRequire("expo-audio")` / `tryRequire("expo-speech")` — **native** modules.

The installed dev build is `app-debug.apk` from **2026-09-19 01:34**.
Read-aloud landed in `e41be2a` at **09:15** the same day. The JS is current
because Metro serves the working tree; the native side is an eight-hour-old
binary that never contained those modules. *(Timeline evidence and inference
from the render condition — not a dex inspection.)*

**So `answer-read-device-voice` and `answer-read-notice` are unreachable until
the APK is rebuilt**, and that rebuild is already sequenced behind the SDK 57
merge. Nothing to fix and nothing to write until then.

---

## The `activate` write — proved on 2026-09-20, and it works

`docs/SESSION_PARITY.md`'s finding: the phone set the local session key and
never told the server, so `users.data->>'ai_session_id'` only moved when
somebody asked a question. Switch on the phone, open the laptop, get the chat
you left.

**No flow can assert it** — the evidence is not on the device that performs
the act, and the second client would be his laptop and his account. So the
cheap version, and it is conclusive:

| | `users.data->>'ai_session_id'` | conversation |
|---|---|---|
| before the switch | `269` | *New chat* |
| after the switch | `263` | *Do I owe anyone money?* |

The phone switched to *"Do I owe anyone money?"* by title, asked nothing, and
the column moved to **that conversation's id** — not merely changed, which is
the weaker claim. QA account only (`users.id = 494`), one `select`, no write
of any kind, `multi_magic_development` untouched.

### Re-proved 2026-09-21, after an overnight restart, on a different conversation

The box lost power overnight and the emulator was rebooted from cold. The
column still held **263** from the previous proof — so the write is durable
server-side and not a session artefact. Switching to a *different*
conversation moved it again:

| | `users.data->>'ai_session_id'` | conversation |
|---|---|---|
| before | `263` | *Do I owe anyone money?* |
| after | `264` | *When did I last speak to Ahmad?* |

**An independent proof rather than a repeat**, because the target differs from
yesterday's. The device fingerprint is bound to every token and never cleared
on sign-out, so a cold restart was a reasonable thing to suspect; it had no
opinion.

**Two System UI ANRs had to be dismissed first.** The app was loaded and
foregrounded — Metro had served the bundle and i18next had logged — with the
dialog on top, and `login.yaml` failed on *"sign-in-email is not visible"*,
which reads exactly like the app being broken. That is the standing pattern on
this AVD after a cold boot, and it is why `screens.sh` dismisses and **counts**
them rather than only dismissing.

`qa/verify_activate.sh` was written for this and **is interactive** — it stops
at `read -r -p "Press Enter once you have switched…"`, so it cannot run
unattended. It also died silently under `set -euo pipefail` because
`grep '^POSTGRES_USER=' .env` finds nothing (that file sets neither variable;
`database.yml` defaults both), and grep exiting 1 killed the script *before*
the `${VAR:-default}` fallbacks on the next lines. Grep made
failure-tolerant; the interactivity is left as its author's to decide.

**A hazard found while debugging it, worth more than the fix:** `bash -x` on
any rig script prints `QA_PASSWORD` in clear, because `qa.config.sh` sources
`.env`. Do not trace a rig script that way. `set -x` and a secret are the same
mistake as a screenshot and a hierarchy dump.

---

## Looking for a second `activate` — 29 writes audited, none found

The parity bug had a shape worth hunting: **a write whose effect has no
symptom on the device that performs it.** The phone set the local session key
and never told the server, and nothing on the phone could ever show that,
which is why every test and every flow missed it.

So the client's mutating surface was walked backwards — 29 `post`/`put`/
`patch`/`delete` calls in `src/api/` — asking of each one: *if this request
never happened, would anything on this device look different?*

**Result: no second instance.** Every other write either reads its response,
or reverts visibly on failure, or is followed by a refetch that would restore
the truth. `activate` appears to have been unique in this client, which is
worth recording precisely because a negative result usually is not.

**Two hypotheses were wrong on the way, and both were wrong in the app's
favour:**

`ai/feedbacks` looked like the shape — `await http.post(...)`, response
unread, and **no test and no flow asserts it**. It is not: `AnswerActions`
sets the rating optimistically and `setRating(null)` in the `catch`, so a
failed rating un-selects the thumb in front of the person who pressed it. The
comment above it says a failed rating is not worth interrupting somebody to
report, which is a decision rather than an omission.

`notifications/read_all` looked like dead code — `await http.post(...)` with
nothing returned. It is not: `markAllRead` is called from
`app/notifications.tsx:159` through a mutation and covered by
`src/api/__tests__/notifications.test.ts`.

**What the audit did leave behind, both small and both real:**

1. **The feedback revert has nothing holding it.** Optimistic-then-revert is
   considered behaviour with no test and no flow — and it is invisible when it
   works, so a regression would be silent. That is the strongest remaining
   candidate for a component test on the chat screen.
2. **A docstring claims a return the code discards.** `notificationsApi.markAllRead`
   is documented *"Returns the new unread count, which is zero"* and is typed
   `Promise<void>`, discarding the response. Nobody is misled today because
   nobody reads it — but `docs/TESTING.md` is emphatic that a comment is not a
   source, and the next person to want that count will believe this one.

Neither is mine to fix: both are `src/` and belong to whoever holds the code
half. Reported rather than edited.

## SIGN-IN WAS BROKEN FROM 2026-09-22 00:44 TO 2026-09-24 12:10 — read passes from that window as "started signed in"

`71c2e16` moved the QA credentials from `-e` to exported `EMAIL`/`PASSWORD`.
Maestro 2.7.0 reads only `MAESTRO_`-prefixed names from the environment, so
from that commit on, `login.yaml` typed the literal `undefined` into both
fields whenever it had to sign in. Found 2026-09-24 12:08, when `01-ask` failed
at the sign-in form with "That email and password do not match."; fixed the
same hour (`MAESTRO_QA_EMAIL`/`MAESTRO_QA_PASSWORD`). The check that had
blessed the change was a two-armed probe that varied exported against unset
and NOT the prefix, and the prefix was the actual variable. The corrected pair,
exported `MAESTRO_PROBE_PFX` against exported `PROBE_BARE`, is in `run.sh`.

**What that window means for the rows** (inferred from the two measured facts,
not re-run): `login.yaml` only types when `composer-input` is absent, so any
flow that PASSED inside the window started on an already-signed-in device and
never exercised sign-in. `06`'s 2026-09-22 pass is the case in point: its
reaction findings stand, but they are for a signed-in device. `10-sign-up` and
`11-forgot-password` type the address too, so anything they recorded in the
window typed `undefined`. Run 8 (2026-09-21) and `02-sign-in` (2026-09-20)
are before it.

**Run 9, first outing, 2026-09-24 12:10–12:40, `qa_phone4`, dev build: `01`,
`04`, `15`, `19` all PASS.** Branches (`qa/branches.py`): every one took
`notVisible sessions-at-limit`, so the at-limit branch is still unexecuted.
`01`'s leftover sweep and `15`'s stale-row cleanup found nothing to remove.
Five real deletes (01 ×1, 04 ×1, 19 ×1, 15 ×2) and no 500: `6923905` holds,
including for a conversation with a usage event. `01` got a real answer.

## What run 9 would need — written 2026-09-22 23:55, before anybody asks for a sweep

Run 8 was 23 PASS, 1 PARTIAL, 4 NOT MEASURED. Two of those four are now closed
(`06` passes, `15` has a measured cause and a real defect under it). A full
sweep is a different size of ask than two rows and nobody should start one on
their own read of the numbers. What it would need, so the ask is concrete:

**1. The delete defect lands first, or three flows stay blocked.**
`04`, `15` and `19` all create a conversation and delete it. Every one of them
now fails for any conversation that has produced a usage event — which, since
`ai_usage_events` began on 2026-09-18, is every conversation the rig touches.
This is the highest-value item on the list and it is not in this repo: it is
`Conversation` needing `has_many :ai_usage_events, dependent: :nullify`
(**nullify**, not destroy — a usage event is billing history and should outlive
the conversation it came from). Until then those three flows measure the defect
rather than their subject, which is a legitimate result but not a sweep.

**2. The QA account needs a hand-clean first, and by a human.**
Whatever the rig left before the cleanups existed: stale `QA switch target` /
`QA switch other` / `QA options target` / `QA delete target` rows, and the
accumulated `[qa] automated test message` pile in the people thread. `15`'s
cleanup handles its own two now; nothing handles `06`'s messages, because this
app has no delete-message path and inventing one for the rig would be building
product to serve a test.

**3. `01-ask` should be made unique-per-run before a sweep, not after.**
**Written 2026-09-24, not yet run** — see its row. It is unique AND removes
what it made; until it has executed once, this item is desk-closed only.
It is the one remaining flow that writes without bound and it grows the QA
account's standing conversation by a question and a real AI answer every run.
A sweep multiplies that by however many times it runs.

**4. Memory, and it is not ours to clear.** The ceiling on 2026-09-22 was two
booklet stacks at about ten gigabytes, idle since half past four. The emulator
is the smaller tenant. A sweep is ~24 flows rather than 2 and wants headroom
that did not exist that night. **Boot on the symptom, not the gauge**:
`/proc/pressure/memory` `full avg10` above 0.5 held, or `si` non-zero for more
than a moment, aborts — with a hard floor at 2.0 GB available regardless,
because avg10 is by definition ten seconds behind. Disk stays at 8 GB.

**5. And say which case ran.** `qa/branches.py` (2026-09-24) now prints it
for any run, from Maestro's own `commands.json`, and `run.sh` calls it at the
end — checked against the 23 Sept run, where it reports `07` on
`notifications-empty` and the populated branch skipped, as this register does.
It reads conditions, not intent, and cannot see a branch nested in a skipped
one. What remains is for a sweep's report to COPY those lines. `07` and `08` still take empty-state branches
because the QA account has no notifications and no events; `15`'s at-limit
branch has still never executed. A sweep that does not name its branches is a
number, not a result.
