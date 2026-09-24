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
