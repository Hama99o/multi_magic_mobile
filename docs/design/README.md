# `docs/design` — multimagic-mobile

Same system as `Karwan/karwan-mobile/docs/design`, and the same rule behind it.
One folder per screen: the references we are stealing from, and a `SPEC.md`
saying **where each idea came from, what we changed, and how we will code it.**
Status on every screen, so this doubles as the board.

## RULE ZERO — Hamma9900, standing

**No design goes to production out of anyone's head. Search Mobbin first, then
check it.** We still decide — the reference is the check, not the authority; a
screen may land where none of the references went. **Deciding without looking is
what is forbidden**, and the `SPEC.md` is where the decision carries its
receipt.

This app is four screens, so the rule costs about an hour in total and it has
already changed two decisions: the assistant's reply is **not** in a bubble, and
the delete confirm's job is to name what is **safe** — both taken from apps that
ship, not from taste.

## Four rules that keep it from rotting

1. **Download the images; never link them.** Mobbin's image URLs **expire after
   30 days**. The `mobbin.com/screens/<id>` link stays in the SPEC as the
   citation; that one does not expire.
2. **This repo is PUBLIC**, so the reference images are **gitignored** rather
   than committed — they are other companies' app screenshots under Mobbin's
   terms, fine as internal reference and not ours to publish.
   `docs/design/**/references/` is in `.gitignore` and `git ls-files` confirms
   no `.webp` is tracked. Each SPEC cites its sources by
   `mobbin.com/screens/<id>`, which does not expire, so the receipts survive in
   the text.
   *(This rule said "stays private" until 2026-09-18. It was written before he
   created the repo, and it was wrong for most of the day — the setup was
   correct throughout and only the sentence was stale. A rule file with an
   expired rule in it is the same shape as the tsconfig exclusion whose reason
   had expired: caught by a session reading it, not by me.)*
3. **Every "how we code it" names real identifiers** — a token, a component, a
   file and a line. A spec that names no identifier is a wish.
4. **`DONE` needs three things**: `ours/` holding a device screenshot at **360,
   411 and 800 dp**, the flows for that screen run, and the SPEC updated in the
   same commit.

## Status vocabulary

`RESEARCHING` · `SPECIFIED` · `IN PROGRESS` · `BLOCKED` · `NEEDS HAMMA9900` ·
`DONE`

---

## The board — every screen, 0 → 100

**It is no longer as small as the first brief said, and that is worth stating
plainly:** it began as *"login only, ai chat, that's it"* and it is now thirteen
rows — sign-up, password reset, source previews, notifications, a calendar view
and people chat all arrived on 18 September. Nothing here is padding; each row
is a sentence he wrote. But the honest description has changed from *"a login
and a conversation"* to **a small MultiMagic client whose single destination is
the assistant.**

**The finding that makes row 12 affordable, and it had to reach the session
during Phase 1 rather than after:** `conversation.rb:19` is
`scope :ai_sessions, -> { where(is_ai: true) }`. **The assistant's session and a
human conversation are the same model, separated by one flag**, and they share
the same transcript endpoint. So the message list, the bubble and the
reconnect-resync must be built knowing only a `conversationId` — the assistant
being the first consumer, not the shape. Built AI-shaped, people chat later is a
rewrite.

**The architectural decision that ties rows 10 and 11 together:** this app has
no note screen, no loan screen, no contact screen and no event screen. So
wherever something would "open a record", **it composes a question instead**.
That is his own instruction for notifications, and it generalises: the assistant
is the single destination, which is what keeps four screens from becoming
forty.

| # | Screen | API | Design | Notes |
|---|---|---|---|---|
| 0 | **Splash / boot** — restore token, learn the session id | `GET /api/v1/ai/conversation` returns `{id}` **only** | `IN PROGRESS` (below): **built** (`app/_layout.tsx:31` holds the splash, `:69` hides it), no device screenshot; corrected 2026-09-25 | the fingerprint is read from SecureStore here, before the first request |
| 1 | **Sign in** — email + password | `POST /users/login` (rate-limited 10 / 3 min) | **`DONE`** → [`sign-in/`](sign-in/SPEC.md) | 2FA is **off** on his account (verified); the 202 branch is handled in the API layer, not built as a screen |
| 2 | **Chat** — the conversation | `POST /api/v1/ai/show` (needs `conversation_id`; 15/min, 200/hr) · reply over **ActionCable** · transcript from `conversations/:id/messages` | **`DONE`** → [`chat/`](chat/SPEC.md) | the reply is asynchronous — the whole app hangs off this |
| 3 | **Dictation** — inside the composer | none (device recogniser) | `DONE` in [`chat/`](chat/SPEC.md) | `expo-speech-recognition@3.1.3` pinned; default `fr-FR` like the web |
| 4 | **Sessions** — list, new, rename, clear, delete | `api/v1/ai/sessions` + `POST :clear` · max **50** per user, title **60** chars | **`DONE`** → [`sessions/`](sessions/SPEC.md) | the delete confirm names what is **safe** |
| 5 | **Upload** — PDF and images into a session | `api/v1/ai/sessions/:id/documents` · **10 MB**, **20 per conversation**, nine extensions | **`DONE`** → [`upload/`](upload/SPEC.md) | the allowed list is `AiDocument::ALLOWED_EXTENSIONS`, **not** the extractor's |
| 6 | Sign out | local | `DONE` in [`sessions/`](sessions/SPEC.md) | **never clears the device fingerprint** — the web's own comment says clearing causes a re-authentication cycle |
| 7 | **Create an account** | `POST /users/signup` | **`DONE`** → [`sign-in/`](sign-in/SPEC.md) | his instruction, 18 Sept; its own screen, not a toggle |
| 8 | **Forgot password** | `resources :passwords` (`routes.rb:16` — confirm the namespace) | **`DONE`** → [`sign-in/`](sign-in/SPEC.md) | the success screen must not reveal whether the address was known |
| 9 | **Source chips + preview** under an answer | **already on the wire** — `message_serializer.rb:55` `field :sources` | **`IN PROGRESS`** → [`chat/`](chat/SPEC.md): **built** (`SourceChips.tsx`, `SourceSheet.tsx`, two rows at `MessageRow.tsx:121-122`), never seen on a device because the QA account's assistant cites no sources (`chat/SPEC.md` Status); corrected 2026-09-25 | the app's whole claim is answering from his data; a claim with no receipt is just a chat app |
| 10 | **Notifications** | `api/v1/notifications` (**six endpoints, not three** — `unread_count`, `read_all`, `clear`) + `notification_channel` | **`DONE`** → [`notifications/`](notifications/SPEC.md) | **a tap composes a question, it does not open a record** — so **no chevron on a row**, which is the rejection that carries the architecture |
| 11 | **Calendar — the important view** | `api/v1/calendar_app/events/**upcoming**` — NOT `/events`, which dates a recurring birthday to 1990 | **`DONE`** → [`calendar/`](calendar/SPEC.md) | agenda, never a month grid; today says so when empty; still the first thing I would cut if time gets tight |
| 12 | **People chat** — threads with humans | `resources :conversations` + `messages` + `reactions` + `mark_read` · messages over **`MessageChannel`**, typing/read over `ConversationChannel` | **`DONE`** → [`people-chat/`](people-chat/SPEC.md) | **the same model as the assistant, separated by one boolean** (`is_ai`) — and the two screens must be **unmistakable** for each other, his instruction: §2.4 |
| 13 | **Privacy policy** — rendered in the app | **none exists** — no route, no page; the text is `docs/PRIVACY.draft.md`, rendered from `src/content/privacy.generated.ts` | **`IN PROGRESS`** → [`account/`](account/SPEC.md) | **a store requirement**, both stores. Renders in-app, never a web view; the internal notes are stripped at build and a test fails if they ever ship. ~~Still says DRAFT until he approves it~~ **approved: the banner came off in `362279c` (2026-09-21, `PRIVACY_IS_DRAFT = false`)**; corrected here 2026-09-25 |
| 14 | **Delete account — everything** | `DELETE /api/v1/users/me` — **landed 2026-09-19** (`multi_magic@56559c4`), with `destroy` so the 57 dependents go with it; the password is re-sent in the body. *(Until then `users_controller.rb:134` was a commented-out attempt using `delete`, which would have orphaned all of them.)* | **`IN PROGRESS`** → [`account/`](account/SPEC.md) | the gate is open (`ACCOUNT_DELETION_AVAILABLE = true`, `f761470`) and the entry point is the sheet's `sessions-account` row; the confirm names what **goes** and what is **kept** (`ai_usage_events` is `:nullify`). To `DONE`: `ours/` at the three widths, and the deletion exercised **against a throwaway user, by hand** — `18-delete-account` asserts both states of the gate and never confirms (`RIG_CONTRACT.md` §3). **It must not look like the conversation delete two rows away**, which is safe by construction |
| 15 | Error & empty states | every load | **`IN PROGRESS`** → [`states/`](states/SPEC.md) | offline, 5xx, 429 and empty are four different sentences on all seven loading routes, and no failure renders the empty state (`cannotAsk.test.tsx`, planted). Offline, 5xx and 429 shot on a device at 360/411/800, plus a partial outage (`states/ours/`, `qa/fault_proxy.py`, 2026-09-25). Not `DONE` for one reason: no flow covers these states. `aiError`, no recogniser and permission refused stay in `chat/` |
| 16 | **Profile** — photo, details, password, your own AI key | `users/connected_user` · `PATCH users/:id` (photo is `user[photo]`) · `PUT :change_password` · `destroy_avatar` · `ai_keys` | **`DONE`** → [`profile/`](profile/SPEC.md) | his instruction, 18 Sept. **The email is shown and LOCKED** — the socket identifies the user by it, so changing it kills the cable silently. A wrong current password is a **422 and must not sign you out**; the server chose that status for this client |
| 17 | **Transitions** between screens | none | `SPECIFIED` → [`transitions/`](transitions/SPEC.md) | **keep the platform defaults**: native on both OSes, Android 13+ gets the system's own 450 ms slide; Mobbin stills show presentation, not motion. Re-opened by a recording that stutters or flashes, or by his word |

**Not in this app, deliberately:** read-aloud, the actions UI (*"create a
note"*), the global minimised window, page context. All exist on the web
(`multi_magic/docs/AI_ASSISTANT.md` §4, §5, §10, §11) and all are why the web
one took months.

## The identity

[`IDENTITY.md`](IDENTITY.md) — chosen, not offered: the palette read off his own
`assets/icon.svg`, two typefaces with the assistant's answers in a **serif**,
the composer as one pill that never changes mode, and what this app does **not**
get.
