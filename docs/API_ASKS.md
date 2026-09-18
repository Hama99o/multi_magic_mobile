# Asks for `multi_magic` — the backend this app has no session on

The `multi_magic` session that took these closed on the evening of 2026-09-18.
Nothing here is built. **Whoever next opens a session in `multi_magic` starts
from this file**, in this order.

## 1 · Account deletion — `DELETE /api/v1/users/me` (store requirement)

No endpoint exists. `config/routes.rb:265` is `resources :users, only:
%i[index show update]`. `app/controllers/api/v1/users_controller.rb:134` holds a
commented-out attempt that used **`@user.delete`** — and `User` has 57
associations, nearly all `dependent: :destroy`. **`delete` skips every one**: it
would answer 200 and leave the person's loans, contacts, notes and documents in
the database with a dangling `user_id`.

- **`destroy`**, scoped to `current_user`, **never by id**.
- **Plant the red that distinguishes them**: a user owning a loan, a contact, a
  note and a conversation with an attached file; assert those rows are gone, not
  only the user row. Fails under `delete`, passes under `destroy`.
- **ActiveStorage blobs too** — a conversation with a file is where "row gone,
  bytes still billed" hides; `StorageQuota::Usage` knows the per-app routes.
- `ai_usage_events` is `dependent: :nullify` on purpose: the billing ledger is
  kept without the person attached. The privacy page says so.

Apple and Google both require in-app deletion before a listing is approved. The
mobile screen is built and gated on `ACCOUNT_DELETION_AVAILABLE = false`; one
constant flips when the route lands.

## 2 · Per-app record counts — `GET /api/v1/me/summary`

For the assistant's empty state. Hamma9900: *"the three prompts which show for
first conversation should be linked to its data — it should not be a random
thing."* The app derives starter prompts from what the user actually has and
**offers no question for an app that holds nothing**; today it can only derive
from a file in the conversation or a named event, because nothing serves counts
— `storage` counts bytes, `search` needs a query.

- One `COUNT` per table for `current_user` — notes, contacts, expenses, incomes,
  loans, events, documents, pages. Numbers only; no content leaves.
- Optionally the most recent item's title per app, so a prompt can carry a
  concrete noun. A count alone is defensible to start.
- Make **zero** distinguishable from **app not enabled**, if that concept exists.

## 3 · Two facts already established, so nobody re-derives them

- **The provider is Google (Gemini), not DeepSeek.** `Ai::Config.default_provider`
  tests Gemini first; `.env.production` sets both keys with `AI_CHAT_PROVIDER`
  unset. The privacy draft and `BRIEF.md` were both corrected for this.
- **`Ai::Config.api_key` resolves the USER's key or nil — no fall-through to the
  environment.** A signed-in request with no `UserAiKey` gets the missing-key
  reply however the container is configured. The QA account (id 494) was given
  one from the container's env; it is the reason the assistant answers in QA.

## 4 · Open with Hamma9900, not with the backend

- Whether the website's device identifier moves from canvas fingerprinting to a
  random value (the app already uses one).
- Whether the usage ledger is deleted outright on account deletion rather than
  detached.
