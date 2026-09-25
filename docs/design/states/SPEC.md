# Error & empty states: what a screen says when it could not ask

**Status: `DONE`** · board row 15 · 2026-09-25 · every state shot on a device at three widths, and `21-faults` PASSES through `qa/faults.sh`

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

- **Offline: shot on a device, 2026-09-25**, on `qa_phone4`. `ours/`
  holds `{360,411,800}-offline-{assistant,chats,notifications,calendar,profile}.png`.
  - How: Metro on 3029 was started with
    `EXPO_PUBLIC_API_URL=http://10.0.2.2:3999`, a host port nothing listens
    on (checked with `ss`). Every request got a real connection refusal, and
    the owner's backend was never touched.
  - What they show: all 15 carry "Could not reach MultiMagic." and Try
    again, and none shows an empty state. The assistant also shows the
    composer's own offline line, which is the reachability store working.
  - Which branch ran on the assistant screen, a failed session lookup or a
    remembered chat that failed to load, **cannot be told from the
    screenshot**. Both say the same sentence, and the unit test covers the
    former.
  - Cleanup: Metro was stopped after the shots, because it had the bad URL
    baked in (`src/config/env.ts`). A leftover would have broken the next
    session's run.
- **5xx and 429: shot on a device, 2026-09-25**, through
  `qa/fault_proxy.py` (`759baaf`). The proxy sat on 127.0.0.1:3031 in front
  of the local backend, Metro was baked to `http://10.0.2.2:3031`, and the
  fault was switched from 500 to 429 on the control route, with no Metro
  restart. `ours/{360,411,800}-{5xx,429}-{assistant,chats,notifications,calendar,profile}.png`:
  - **5xx:** each screen says its own "Could not load …", and **"Internal
    Server Error" appears nowhere**. That is finding 3 above, confirmed on a
    device, with the proxy serving Rails' real `PublicExceptions` body.
  - **429:** every screen says "Too many requests just now. Give it a
    minute."
  - Two 360 dp 5xx frames were first captured mid-load, came out blank, and
    were reshot.
- **One endpoint failing while the rest works**, the case a dead port cannot
  make: `ours/411-partial-{assistant,calendar,chats}.png`, with only
  `/api/v1/calendar_app` answering 500. The assistant and chats load the QA
  account's real data, and the calendar alone says "Could not load your
  calendar." with Try again.
- **The flow: `qa/flows/21-faults.yaml`, run by `qa/faults.sh`, PASS on
  2026-09-25** (exit 0, 41 steps, 168 s). It covers a partial outage, a 429
  and a 500 in one boot, switched live on the proxy. The runner's teardown
  is a trap on EXIT, INT and TERM that selects by process group and port,
  never by command line. It was proved by five failed runs and a TERM mid-run,
  each followed by a clean ordinary bundle. The register row has the plants
  and which case each screen took.
- **A crash the flow found that Jest could not: fixed.** `df9b1f2` made the
  calendar screen store a page under the key the assistant's suggestions
  read as an array. Opening the calendar and going back crashed the
  assistant (`useStarterPrompts.ts`). Both now read the page, and
  `cannotAsk.test.tsx` "one cache, two screens" mounts both on one client.
- **Decided (Hamma9901's ruling), built and asserted:** "Updated just now"
  above "Could not load your calendar." read as a contradiction. Both were
  true, and nothing related them. Now **one statement owns both facts**
  wherever a failed refresh stands over kept data (calendar, notifications,
  chats, profile, AI keys; `src/components/LoadFailure.tsx`):
  - the cause, else "Could not refresh.";
  - then "Showing what we had a moment ago." or "… from 5 min ago.";
  - the "Updated …" line stands down while it shows.

  A first-load failure still says the screen's own "Could not load …".

  **Rule Zero: no reference words this sentence.** Starlink marks kept rows
  "unreachable" and Docusign "Failed to sync", and a third search found only
  offline libraries and timestamps. The words are the ruling's, recorded as
  such. Planted: the "Updated" line put back beside the statement fails;
  the component ignoring kept data fails three screens. `21-faults` re-ran
  green on it (193 s).
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
