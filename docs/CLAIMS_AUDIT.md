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
