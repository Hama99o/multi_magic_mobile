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

## Rules this register enforces

- **An empty list is a legitimate state, not a pass.** A flow that reaches an
  empty screen screenshots and stops rather than asserting into it.
- **Destructive paths are opened and cancelled**, and assert the *wording*.
- **Arrive the way a user arrives.** A flow that deep-links past the navigation
  proves the screen works, not that anybody can reach it.
