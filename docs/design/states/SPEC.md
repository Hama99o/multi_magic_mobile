# Error & empty states: what a screen says when it could not ask

**Status: `IN PROGRESS`** · board row 15 · 2026-09-25

The question for each screen is not "is there an offline banner" but **what
does the screen claim while it cannot know?** A calendar that draws "nothing
today" with no network states a fact it never got. That is the same defect
class as `df9b1f2`.

## Rule Zero: Mobbin first

Searched 2026-09-25, iOS: a chat or list that could not load for lack of a
network. Images are in `references/` (gitignored, Mobbin's terms).

| App | Screen | What it does |
|---|---|---|
| Oura Advisor | `mobbin.com/screens/9dbf6e35-9643-449f-9d0f-c89cc6248a49` | the conversation **replaced** by "Can't load chat", one line of advice, **Try again** |
| Opera | `mobbin.com/screens/af7f57a4-9493-4f22-bb2a-48bc94a93f3e` | body replaced; "Connection error, please check your network", **Retry** |
| Prime Video | `mobbin.com/screens/7f93f562-2680-4876-9cc2-c11898ae4092` | body replaced; "Network Error", **Try again** |
| Perplexity | `mobbin.com/screens/09e365a3-519a-44a7-9c03-c0449fcc16e4` | a thread already on screen stays; an inline notice over the composer |
| Sesame | `mobbin.com/screens/2d85e6ae-5a90-44c0-9ceb-d0cff29fb561` | a toast naming the cause ("appears to be offline") over an idle screen |
| Wysa | `mobbin.com/screens/7d6e310a-f1ca-42cc-8a57-6d87ac5dc6c7` | a modal "Retry?" over the thread |

**What every reference agrees on: none of them shows its empty or welcome
state when it could not load.** The failure replaces the body, or is a notice
over data that stays.

- **TAKE:** the body replaced by one sentence and one **Try again** (Oura,
  Opera, Prime Video). That is the pattern this app already had on every list
  screen, so nothing new is drawn.
- **TAKE:** the sentence names the cause when it is known (Opera, Sesame).
- **REJECT:** Wysa's modal, which blocks the thread for a problem the person
  cannot act on. Also Prime Video's "contact Customer Service" line, which is
  advice for a problem we do not know they have.

## What each mounted route says (checked against `app/`, 2026-09-25)

There are **16 routes**: 15 in `app/*.tsx` plus `app/chat/[id].tsx`, not
counting `_layout.tsx`.

Seven of them load something on mount. For those seven, the four states are
asserted by `src/screens/__tests__/cannotAsk.test.tsx`:

| Route | offline | 5xx | 429 | genuinely empty |
|---|---|---|---|---|
| `chat` (assistant) | `failure.unreachable` | `chat.loadFailed` | `failure.rateLimited` | `EmptyState` (`chat-empty`) |
| `chat/[id]` (person) | `failure.unreachable` | `thread.loadFailed` | `failure.rateLimited` | `thread.noMessages` |
| `chats` | `failure.unreachable` | `chats.loadFailed` | `failure.rateLimited` | `chats-empty` |
| `notifications` | `failure.unreachable` | `notifications.loadFailed` | `failure.rateLimited` | `notifications-empty` |
| `calendar` | `failure.unreachable` | `calendar.loadFailed` | `failure.rateLimited` | `calendar-nothing-today` |
| `ai-keys` | `failure.unreachable` | `aiKeys.loadFailed` | `failure.rateLimited` | `ai-keys-empty` |
| `profile` | `failure.unreachable` | `profile.loadFailed` | `failure.rateLimited` | none (an account always has one) |

Every failure cell also has a **Try again**, and **no failure state renders
the empty sentence**.

The other nine load nothing on mount: `index` (a redirect), `account` (a
menu), `privacy` (static text), `sign-in`, `sign-up`, `forgot-password`,
`two-factor`, `change-password` and `delete-account`. Their failures belong
to a submit, and their own tests own those sentences. The `SessionsSheet` list
already classifies through `failureMessage` (`sessions-load-failed`).

### What was wrong, found by building the table

1. **The assistant, opened offline with no chat remembered on the device,
   showed the skeleton forever**, with no sentence and nothing to tap. The
   session lookup failed and the id stayed null, so `useConversation` never
   loaded and its status stayed `"loading"`. Fixed in `app/chat.tsx`
   (`sessionUnknown`): it shows `chat-load-failed`, and Try again re-asks for
   the session.
2. **Both chat screens said one sentence for every failure.** They used
   `t("chat.loadFailed")` and `t("thread.loadFailed")` directly, while every
   list screen went through `failureMessage`. `useConversation` now returns
   `loadError`, and both screens classify it.
3. **Every loading screen would have shown "Internal Server Error" on a
   production 500.** Rails' `PublicExceptions` renders
   `{ status: 500, error: "Internal Server Error" }` (actionpack 8.1
   `public_exceptions.rb:29`, read in the backend's container), and
   `apiErrorMessage` read `error` as the server's sentence. That was English on
   a French phone, and it named nothing the person could act on. It now
   ignores a body carrying a numeric `status` (`src/api/http.ts`). The
   submit screens' `apiErrorMessage(e) ?? fallback` benefits too. This is
   **from the source, not seen on a device**: nothing here can make
   production fail on purpose.

Each was **planted back and went red on its own rows**:

- the `sessionUnknown` line removed: assistant ×3;
- the `status` check removed: every 5xx row, ×7;
- the thread's `failureMessage` removed: thread offline and 429;
- chats' `error ? null` removed: chats ×3.

### Why the test fails requests, not the reachability store

`reachability.store.ts` starts `reachable: true`, and only the assistant's
composer reads it (`app/chat.tsx`, `offline={!reachable}`). No screen's
**load** reads it.

So setting the store false before mount changes nothing on these screens. A
test asserting "no offline notice" on a fresh mount would pass on a screen
with no offline handling at all, because that is a blind instrument
(`docs/TESTING.md` §19). What a screen really meets offline is its own request
failing with no response, so the test fails every request at the HTTP layer
(`axios-mock-adapter` on the real `http`), through the real parsers and
hooks.

## Not done, and why the status is not DONE

- **No device screenshot of any failure state**, which `DONE` needs at 360,
  411 and 800. They need the emulator with the backend stopped. The backend is
  the owner's real stack, so stopping it is his call.
- **The refetch case: now decided and asserted, see below.**
- **The other row-15 cases** (`aiError` over the socket, no recogniser,
  permission refused) are specified and tested in their own screens' SPECs
  (`chat/`). They are not re-checked here.

## Had content, then the refresh failed (2026-09-25)

This is a different question from "never loaded". Before, the screens did
not agree:

- `chats`, `notifications` and `profile` kept their rows under the error
  line.
- `calendar` cleared its events (`data={isLoading || error ? [] : rows}`) and
  showed only the error line, under an `UpdatedLine` that still said when it
  last succeeded.

**Rule Zero, iOS.** Two searches: a calendar still showing events with a
could-not-refresh notice, and a feed still showing items under an offline
banner.

**The evidence is thin, and I'm saying so.** A still screenshot rarely
catches a refresh failing over content. The references that do show content
surviving a failure all keep it and mark it:

- **Starlink** (`mobbin.com/screens/c3e3361e-aac7-47f4-b287-b6f448dd0333`):
  rows stay, each dimmed with "unreachable".
- **Docusign** (`mobbin.com/screens/5e8c61aa-c77e-4013-8310-5808541018ba`):
  the row stays, marked "Failed to sync".
- **Perplexity** (`mobbin.com/screens/09e365a3-519a-44a7-9c03-c0449fcc16e4`):
  the thread stays, with a notice over the composer.
- **Qantas** (`mobbin.com/screens/18f77caf-19d5-4199-98b4-a36f34096d23`):
  pairs an "Unable to update" toast with its offline screen. That is the
  never-loaded case again.

**None clears content it already had.**

**Decision: keep what it had.** `app/calendar.tsx` now reads
`data={data ? rows : []}`, and every loading screen now agrees. The error
line says it could not refresh, and the `UpdatedLine` says how old the
agenda is.

**The trap, which is why the condition is `data` and not `!isLoading`:**
`rows` always carries today's "Nothing today" row, because today always
appears. So rows rendered without a real answer would put "Nothing today"
under an error, the fact nobody got. Both halves are asserted and were
planted:

- the old clearing condition goes red on the new refresh test;
- the naive `data={rows}` goes red on all three calendar never-loaded
  rows.

**Asserted** by `cannotAsk.test.tsx` "when a refresh fails after a real
answer": calendar, chats and profile. Notifications is **not** asserted,
because the QA account has no notification to capture, and the contract
fixtures exist to replace hand-written bodies.
