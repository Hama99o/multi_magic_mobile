# The claims and French audit — what is done, what is not, 2026-09-24

Two questions asked of every surface: **what does it claim, and what does it
say when it cannot?**; and **does it read French, all of it?** Everything
below was found by READING and by Jest. **Nothing in this file was measured
on a device**: the emulator was blocked on disk for the whole audit.

## DONE — and what "done" means for each

Re-auditing these without new evidence repeats this evening. Each "done" is
exactly as wide as its sentence, and no wider.

**French, two checks** (`src/__tests__/i18nSweep.ts`): no English-only word
on screen, AND nothing byte-identical between the English and French
renders beyond a short allowlist whose every entry names its key in
`locales.test.ts`. Both read what RENDERED, including accessibility labels,
hints and placeholders, so strings built in code are seen.

| Surface | States swept | File |
|---|---|---|
| every screen in `SCREENS` (15, incl. the assistant and two-factor) | the fixtures' success state | `screens.render.test.tsx` |
| chats, notifications, calendar, AI keys, profile | load FAILED: server error and no network | same |
| the people thread | does not load; send refused; send with no network | same |
| the assistant | transcript failed, answer never came, thinking, send failed ×2, rate limit, all 8 `key_problem` notices | `app/__tests__/chat.test.tsx` |
| conversations sheet, its row menu, profile menu + 3 panes, a source | open; the sheet's list FAILED ×2 | `sheets.i18n.test.tsx` |
| rename, instructions, scope, delete confirm, thumbs-down reason | open | same |
| attach, profile photo, reactions (on your own message) | open | same |
| chats, notifications, calendar, AI keys; the assistant with nothing to suggest | EMPTY | `screens.render.test.tsx` |
| day labels, file sizes | both languages, pinned | `dayLabel.test.ts`, `useAttachments.test.ts` |

"Done" means: in those states, those surfaces show no untranslated text.
It does NOT mean the French fits a 360 dp row, reads well, or that text
the SERVER sends is in the reader's language.

**Claims, fixed and pinned:**
- A failed load never renders as empty: every list screen, the conversations
  sheet (`316b98c`), and the document chips (`7e2af98`: a file the server
  could not read no longer looks like one it can).
- Nothing spins for ever: plain requests time out at 15 s (`http.ts`); the
  assistant's reply at 180 s; the documents poll at 180 s (`docPoll`).
- Dates and times follow the app's LANGUAGE, one rule (`DayDivider.tsx`
  holds the reason). A lent key's reset is the server's UTC month.
- Delivery in the people thread claims only what the app knows: "Sent" is
  server-saved, "Read" is the server's `readAt`, and nothing claims "delivered".

## NOT DONE — neither pass, or only one

- **Form error states**: sign-up, forgot-password (its "sent" state too),
  change-password, delete-account, profile validation. These show SERVER
  sentences, which the backend now localises (backend session, 2026-09-24).
- **Two-factor's "trust this phone" pane.**
- **The two unread badges** show nothing when their count fails to load: a
  silent 0. Low cost, conventional, and left as it is on purpose.
- **Server-side findings, routed to the backend** (status as the backend
  session reported it, 2026-09-24; deploys are Hamma9900's call):
  - "Online" lagged one event: now reads `current_sign_in_at`, fixed LOCALLY
    (`multi_magic` `1dd2379`), not deployed. Counting activity outside people
    threads is Hamma9900's decision about visibility.
  - The web's French `rememberHint` named the English note: fixed LOCALLY
    (`26c57fa`), with a spec that fails if web and server titles diverge.
  - Pundit's developer text is already GONE in production (`4a39266`), so
    mobile's `isPolicyText` (`src/api/http.ts`) is **dead code**: it guards
    against a response that no longer exists. Kept only until every 403
    carries `code: "forbidden"` (`a5f7245`, local). **When that deploys,
    match `isForbidden` on the code and delete `isPolicyText` with its
    test.**
  - The wrong-current-password `code` (`3f7ec45` here) keeps its English
    fallback until the backend says it is live.
- **Everything on a device**: the rebuilt opening, the Android keyboard lift,
  drag-to-dismiss, run 9 (`qa/FLOW_REGISTER.md` has the running order).

## Does French FIT? What the desk can and cannot say (2026-09-24)

**It cannot be measured here.** Jest's test renderer has no layout: no width,
no line breaks, nothing clipped. Nothing below is a measurement. It is what
the CODE says can happen, plus length estimates, and each is labelled.

**What the code settles, read from source:**
- **No button can truncate.** `Button` (`src/components/reusables/button.tsx`)
  has `minHeight: 48`, not a height, and its label (14 px semibold) has no
  `numberOfLines`. A long label wraps and the button grows. The longest
  French block labels are "Faire confiance à ce téléphone" (30 chars,
  two-factor) and "Se connecter avec un e-mail" (27, sign-in). By estimate
  (~7.5 dp a character, ~290 dp of label at 360 dp) both fit one line.
  INFERRED, not measured.
- **Text with a fixed width:** only two boxes hold words.
  - The file chip's status (`maxWidth: 180`, about 28 characters a line).
    FIXED 2026-09-24: its French "slow" string was 63 characters, about six
    lines in a chip meant to sit in a row. Every status is now ≤ 28 in both
    languages, pinned by `PendingFiles.test.tsx` as a length budget, which is
    honest only because the width is fixed.
  - The calendar's time column (`width: 62`, `EventRow.tsx`): "Toute la
    journée" wraps to two lines where "All day" takes one. It wraps and does
    not clip (no `numberOfLines`); the row grows. Left as it is.
- **The 12 `numberOfLines={1}` sites** hold DATA (names, titles, source
  labels, live dictation), where cutting is by design. None holds a
  translated sentence.

**On the device, at 360 dp in French, in order of cost:**
1. **The two longest block buttons** above: one line, or two? Either is
   usable. Confirm, and photograph.
2. **The confirmation sentences** a person must read before tapping:
   delete account's disclosure (`delete-what-goes`) and the delete-conversation
   confirm. Do their buttons stay on screen at 360 × 640?
3. **Labels:** the calendar column's two-line "Toute la journée"; the password
   field labels ("Répéter le nouveau mot de passe", 31 chars); the profile
   menu's "Confidentialité et compte".
4. **`wm size`/`wm density` changes need a force-stop and relaunch** before
   judging anything (`qa/QA_HANDBOOK.md`), or the phantom 360 dp overflow
   is the rig's.

## The backend's 59 commits of 2026-09-24, against the phone

Read from `multi_magic`'s own commits, not a summary. **"Server-only"**
means it reaches the phone through the assistant with no app work.

| Shipped (multi_magic) | Does the phone consume it? | What a phone user misses |
|---|---|---|
| Replies in the reader's language (`4c6b728`, `4a39266`, `1f62871`, `dad9e8b`, `a5f7245`) | Signed in: yes, via `users.lang`. **Before sign-in: NO**, because the phone sent no `Accept-Language` | **FIXED here**: `http.ts` sends the app's language on every request. Sign-in, sign-up, reset and two-factor errors were English for a French reader |
| Morning brief in the bell (`55ca44c`, `3523c7e`) | Shown, but the body was cut to one line | **FIXED here**: `NotificationRow` shows a brief in full. A tap composes a question, so nothing else on the phone showed the rest |
| Morning brief switch (`users.ai_morning_brief`, `55ca44c`, `61442d3`) | **Now, yes**: `MorningBriefRow` on the AI keys screen | **BUILT here**. It appears only once the server sends the field; production does not yet |
| Error codes (`wrong_current_password`; 403 `forbidden`, `a5f7245`) | Password code: yes (`3f7ec45`). `forbidden`: waits for deploy | Nothing today. `isPolicyText` is dead code until then |
| Lent key resets (`resets_at`, `key_resets_at`, `c9a4fca`) | Not yet; the phone infers the UTC month, correct today | Nothing today; read the field once it deploys |
| `key_problem` codes (`6670dcd`) | Yes (`9f320ef`) | Nothing |
| Borrower's monthly limit (`9a5a3cb`) | Yes (`BorrowedKeyRow`) | Nothing |
| LENDING a key and setting its limit (`ba8457c`) | No: the phone lists keys lent TO you only (`app/ai-keys.tsx` says so) | **A decision, confirmed by Hamma9901**: the borrower's side is built because that is what strands someone mid-conversation; the lender's side is post-release |
| Spend others ran on your lent key (`5554524`, `f7e1f8c`) | No: the phone has no usage screen at all | **A decision, confirmed**: usage is a web screen |
| Per-chat memory (`0a96216`) | Yes (`f29cd12`) | Nothing |
| Thumbs and their reason (`357dd7a`, `622c25b`, `e867e38`) | Yes (`d50ac0c`, `27fb70b`) | Nothing |
| "Cancel that" undoes the last write (`578e888`) | Server-only; the phone already has an Undo button | INFERRED: after an undo done by asking, the old reply's Undo button stays until the next reload. Minor and not verified, so left alone on purpose: a fix for something unseen could make it wrong |
| Presence reads the latest activity (`1dd2379`) | Shown as it is | Nothing, once deployed |
| Assistant behaviour: dates, SafeZone PIN, `find_records`, no double booking, family, memory, messaging someone, Flow, keeping a document | Server-only | Nothing |
| Account-deletion fixes (`30dce44`, `3adca92`, `bd19a55`, `1835543`) | The error shapes, yes | Nothing |
| Web and CI only (`f95fcfb`, `f28a945`, schema checks) | Not applicable | Nothing |

## With a lot of data: what breaks under volume (2026-09-24)

Every check before this ran on a handful of rows. His data is months deep.
Found by READING the client against the server's page sizes, and fixed
where it was a fixture question. Nothing measured on his data or a device.

| Surface | What volume does | Status |
|---|---|---|
| **People chats list** | Paged at 15 (`conversations_controller.rb`). The screen read page 1 only, so **a sixteenth conversation could not be reached** | **FIXED**: every page, loaded near the end, de-duplicated by id; `app/__tests__/chats.test.tsx` |
| **Notifications** | Paged at 20. The API file argued paging was unneeded because the scope stops at 90 days, but that bounds TIME, not count, and a daily brief is ninety. **Only the newest 20 could be read** | **FIXED**: every page; the unread count is page one's server total, not a row count; `notifications.test.tsx` |
| A long people thread | 25 a page by cursor (`messages_controller.rb`), older pages on scroll-back only; `merge` is one pass and a sort over what is loaded | Fine by reading. A thousand messages is 40 pages, if scrolled all the way |
| The assistant's thread | The same cursor paging (`loadOlder`) | Fine by reading |
| Conversations sheet | At most 50 (`LIMITS.maxSessions`), one request | Fine by construction |
| A very long answer | `AnswerMarkdown` parses on render; `MessageRow`'s memo stops an unchanged answer re-parsing | Fine by reading. **How a 10,000-character answer scrolls is a device question** |
| What the phone holds | React Query drops unused queries after the 5-minute default; drafts are deleted when empty (`useDraft`) | Nothing grows without bound, by reading |

**On the device, with his real account** (beside run 9): scroll a long
chats list to its end, and the notifications past twenty; scroll a
thousand-message thread back; open the longest answer he has.

## Accessibility, over what rendered (2026-09-24)

`src/__tests__/a11ySweep.ts` runs on every screen in `SCREENS` (in French),
every sheet, pane and dialog in `sheets.i18n.test.tsx`, and every assistant
failure state in `chat.test.tsx`. Beside `a11y.test.tsx`'s static scan of the
source, it asks, of what rendered:
- **every control has a name**: a pressable by its label or the text inside
  it, a `Switch` by its label, a field by its label or placeholder;
- **nothing spoken is a raw key** (`answer.bad`, which i18next returns for a
  key it does not have);
- **every radio or checkbox says selected or checked.**

**Result: nothing found.** Every control in those states is named, and the
choosers, thumbs and switches announce their state. Planted, each red: the
composer's send stripped of its label (it is icon-only), the brief switch
unlabelled, the language radios stripped of `selected`, and a hint built
from a key that does not exist. The instrument's own hole, found by
planting: `Pressable` gives its host an `accessibilityState` object even when
none was written, so "has a state" passed a silent radio. It now asks which
state.

**Not answerable here, on the device with TalkBack on** (beside run 9):
- **touch-target size**, since Jest has no layout;
- **focus order**: whether the composer, the send and the thumbs come in a
  usable order, and D5 (the newest-first thread order,
  `docs/ACCESSIBILITY.md`);
- **what TalkBack actually says**: the sweep proves a name exists, not that
  it is the right one.

## What survives a sign-out (2026-09-25)

Everything the app caches or persists, what is in it, and what clears it.

| Store | Holds | Cleared on sign-out? |
|---|---|---|
| **React Query cache** (memory) | conversations, messages, profile, AI keys, notifications, the current session id | **It was NOT.** A sign-out followed by another account signing in, in the same process, opened every screen on the previous account's data, and pointed the assistant at their conversation. **FIXED** (`forgetSession` in `auth.store.ts`): cleared on sign-out, on a forced sign-out, and again when any account signs in (sign-in, two-factor, sign-up), so a switch starts clean. Planted red. |
| Token (`expo-secure-store`) | the JWT | Yes: `setToken(null)` deletes it; the in-memory cache is reset with it |
| Session email (secure store) | the address | Yes |
| Trusted-device token (secure store) | "this phone is known" | **Kept, by design** (`auth.ts`): bound to the fingerprint, and checked against the owner on every use |
| Device fingerprint (secure store) | an install id | **Kept, by design** (`lib/fingerprint.ts`): clearing it causes a re-auth cycle |
| The socket | an authenticated connection | Yes (`resetCable`) |
| Read-aloud | audio of a message | Now stopped on sign-out |
| Remembered session (`mm:aiSession:v1:<userId>`) | a session NUMBER, per user | Kept, and harmless: keyed by user, no content |
| **Drafts** (`mm-draft:<conversationId>`, AsyncStorage) | half-written assistant questions | **Kept. An open question** for Hamma9901: see below |
| Theme, language, dictation language | device preferences | Kept; no personal content |

**The draft question.** Drafts are kept only for the assistant (the people
thread's composer is in memory). Assistant conversation ids belong to one
account, so another account's screens never reach them: his half-questions
stay on disk, unreachable, not visible. Keeping them across his own re-login
is arguably right. **Recommendation:** key them by user as well
(`mm-draft:<userId>:<conversationId>`), as the remembered session already
is. That keeps his, and guarantees nobody else's screen could ever match
one. Or clear them on sign-out, if a deliberate sign-out should leave
nothing.

## What the app costs in DATA, measured (2026-09-25)

Measured against the LOCAL backend as the QA account, read-only. **These are
dev-server figures, and they carry to production**: responses are
compressed by `Rack::Deflater`, inserted in `config/application.rb` (every
environment, and middleware rather than a proxy, so there is no Thruster
difference to trip on). The app accepts gzip through the platform's
networking.

| What | Measured | Per realistic hour |
|---|---|---|
| **First open** (12 requests: profile, session, sessions, the assistant's last 25 messages, documents, summary, calendar, badges, chats, notifications, keys) | **4.2 KB** on the wire, 24 KB decoded; the message page is 1.9 KB of it (19 KB decoded) | once |
| **Idle socket**, no subscription, 30 s | 1 welcome + 10 pings (every 3 s), **378 B** of payload; no WebSocket compression offered | ≈ **45 KB** of payload; with TCP/IP headers and ACKs per ping, **≈150–180 KB** (INFERRED, not measured) |
| **Asking a question** | the POST, then the latest page every 3 s while the answer is pending (≈1.9 KB each here), then the answer over the socket (uncompressed JSON, a few KB) | at 20 questions answered in ~10 s: **≈100–200 KB** (estimate from the measured page) |
| Upload | the file itself, once (≤10 MB) | inherent |
| File chips | name and size only, no thumbnail fetched (read in `PendingFiles.tsx`) | 0 |

**A realistic hour is well under 1 MB.** The biggest single line is the
idle socket's pings, and those are the server's ActionCable setting, not
the app's. They are also what detects a dead connection in seconds, so
halving them trades one cost for another.

**Not measured:** avatars and images, since the QA account has none;
his real threads, whose pages are larger; the TCP overhead above.

**Proposed: nothing.** No measurement here justifies a change. A smaller or
conditional re-read while waiting would save about 2 KB a poll. If data
ever matters, the one lever worth weighing is the server's ping interval,
and that is a server decision.

## Self-review of the night's work, read cold (2026-09-25)

About forty commits, many after midnight, reviewed as if someone else had
written them.

**Settled in the review:**
- The morning brief switch trusts its save's answer, and would vanish if
  that answer lacked the field. Checked: `PATCH users/:id` renders the
  `:private` view, which carries `ai_morning_brief`. Safe.
- `notOlder` compared edit times as TEXT, which is right only while both
  copies share one offset. Now `Date.parse`. **Its first test was green for
  the wrong reason**: both of its cases sorted the same way as text and as
  time. Planted, it stayed green; rewritten with the two cases where they
  disagree, it goes red. That is §19's shape, in the review itself.
- The reconnect gap fill uses ids that are global across conversations,
  so "the page reaches what is on screen" cannot be read from ids alone.
  Checked: it only fetches back when the newest page holds nothing already
  known, which means more than 25 arrived, and it stops at the first page
  that does. At worst one extra request per reconnect. Correct.

**Solid, and I would defend them as they are:** the sign-out cache clear on
both ends of a session; the per-user drafts with the in-memory tag; the
socket's stale-snapshot guard; `readable`/`readableRows` and the notice;
the renderer's flanking and parentheses rules and their property test; the
paging of chats and notifications; the preflight step 8/9 functions and
their shell tests; `Accept-Language`.

**Where I would want a second opinion, most uncertain first:**
1. **`KeyboardPadding` replaced RN's KAV on EVERY Android screen with a
   field** (`9b56a2e`). The arithmetic is KAV's, and the tests prove the
   spacer arrives where it should, but it runs on the JS thread and nobody
   has watched it on a device. It touches sign-in and every form, not just
   the chat. The dialogs (rename, instructions, feedback) still use KAV, so
   Android now has two lift behaviours. If run 9 shows anything wrong,
   reverting this one commit restores the old behaviour everywhere.
   **Decided (Hamma9901):** kept, because the single-frame jump is KAV's
   designed behaviour on every Android form, so fixing only the chat was
   the narrower change, not the safer one. The two behaviours are a KNOWN
   INCONSISTENCY, to resolve by moving the dialogs over once the device says
   the lift is right. Run 9 watches SIGN-IN specifically.
2. **Pinning every test to Europe/Paris** (`jest.config.js`) made CI see a
   zone bug that only shows east of UTC, and moved the blind spot rather
   than removing it. **CLOSED:** `npm run test:west` runs the six
   date-sensitive suites again in America/New_York, as `posttest`, so
   `npm test` and CI run both zones. Proven to apply: a probe reports offset
   +300 against Paris's −60, and the old phone-calendar `resetDate` is red
   there with New York's own value (04:00Z).
3. **Drafts written before `df9b1f2`** sit under the old key
   (`mm-draft:<id>`) and are not migrated: one half-written question from
   before this build will not come back, and the orphan stays on disk.
   Small, and migrating would assign an unscoped draft to whoever is signed
   in, which is the leak the change exists to prevent. Left as it is on
   purpose.
4. **The paged lists re-read EVERY loaded page on each live event.** Right
   for correctness, and cheap at one or two pages. After a long scroll back
   it is N requests per message. **Recorded, not fixed:** it matters only if
   his lists run past a few pages (chats at 15 a page, notifications at 20).
   Measure how many pages his real account loads before changing it.

**Still INFERRED, not settleable at the desk:** the opening's size and
timing, the keyboard lift's feel, drag-to-dismiss against the lift, the
socket's TCP overhead, and every "fits at 360 dp" estimate.

## What I would do next, in order

1. **Run 9 on a device, the moment the disk frees.** More changed today than
   any desk check can vouch for, and the running order is ready.
2. **Form error states**, once the backend's localisation is deployed, so
   the sweep checks the text people will actually get.

## The instruments' own failures, for whoever extends them

`docs/TESTING.md` §19 has each in full. Four of the evening's best
findings came from plants that stayed green:
- a sweep of a half-loaded screen (twice);
- an exemption fed by the file's own comments;
- a regex whose quote-pairing slipped;
- a stripper that excused the strings a test asserts;
- a wait satisfied by the previous render's mock calls.
