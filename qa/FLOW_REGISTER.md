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

## Rules this register enforces

- **An empty list is a legitimate state, not a pass.** A flow that reaches an
  empty screen screenshots and stops rather than asserting into it.
- **Destructive paths are opened and cancelled**, and assert the *wording*.
- **Arrive the way a user arrives.** A flow that deep-links past the navigation
  proves the screen works, not that anybody can reach it.
