# Asks for `multi_magic` — the backend this app has no session on

The `multi_magic` session that took these closed on the evening of 2026-09-18.

**BOTH ARE BUILT — 2026-09-19.** They were picked up from this file, in this
order, by the mobile session. The asks are kept rather than deleted: what was
asked for and what arrived are two facts, and a file that erases the first
cannot be checked against the second.

## 1 · Account deletion — `DELETE /api/v1/users/me` (store requirement)

> **ANSWERED 2026-09-19 — `multi_magic@56559c4`, mobile `f761470`.** `destroy`,
> self-scoped, no id in the route, password re-asked and a wrong one answered
> 422 rather than 401. Verified in both directions: 8 of 8 pass, and swapping
> in `delete` fails 4 including the ActiveStorage join.
>
> **The plant found one orphan nobody had asked about.** `contacts.user_id` was
> indexed and `Contact` declared `belongs_to :user`, but nothing on `User`
> pointed at it — `has_many :contacts` is remapped to `ContactApp::Contact`, a
> different class — so every loan counterparty was surviving deletion with a
> dangling owner. `User#loan_contacts` closes it.
>
> `ACCOUNT_DELETION_AVAILABLE` is now `true`; the mobile render table caught
> the flip by itself before the screen was touched.

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

> **ANSWERED 2026-09-19 — `multi_magic@39ec585`, mobile `ec6f09e`.** Nine apps,
> one COUNT each, keys matching `Ai::AppCatalog::APPS`. **Soft deletes are
> excluded**, so nobody is offered a question about notes they threw away.
> Integers only and the spec asserts the shape, so a `?include=titles` would
> fail it.
>
> **Zero and "not enabled" are the same thing, because the concept does not
> exist**: `users.applications` is a jsonb column nothing in `app/` reads.
> Written down so the next person does not go looking.
>
> Wired into `useStarterPrompts.ts`, ranked BELOW the two sources that carry a
> concrete noun — a count can name an app but never a record.

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
