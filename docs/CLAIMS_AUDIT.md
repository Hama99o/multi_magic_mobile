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

- **Empty branches**: chats-empty, notifications-empty, calendar
  "nothing today", the assistant's empty state with NO suggestions. They
  use keys, but no sweep renders them.
- **Sheets never opened in a sweep**: attach (upload), photo, reactions.
- **Form error states**: sign-up, forgot-password (its "sent" state too),
  change-password, delete-account, profile validation. These show SERVER
  sentences, which the backend now localises (backend session, 2026-09-24).
- **Two-factor's "trust this phone" pane.**
- **The two unread badges** show nothing when their count fails to load: a
  silent 0. Low cost, conventional, and left as it is on purpose.
- **Server-side findings, routed and not fixed here**: "Online" reads a field
  that moves only on people-thread events and lags one (`user_serializer.rb`);
  the web's French `rememberHint` quotes the English note name; Pundit's
  default English refusal is filtered on mobile by its TEXT (`isPolicyText`),
  so it needs a code if the backend localises it.
- **Everything on a device**: the rebuilt opening, the Android keyboard lift,
  drag-to-dismiss, run 9 (`qa/FLOW_REGISTER.md` has the running order).

## What I would do next, in order

1. **Run 9 on a device, the moment the disk frees.** More changed today than
   any desk check can vouch for, and the running order is ready.
2. **The empty branches and the three unopened sheets into the sweep
   tables.** Cheap: the machinery exists, and each is a row.
3. **Form error states**, once the backend's localisation is deployed, so
   the sweep checks the text people will actually get.

## The instruments' own failures, for whoever extends them

`docs/TESTING.md` §19 has each in full. Four of the evening's best
findings came from plants that stayed green:
- a sweep of a half-loaded screen (twice);
- an exemption fed by the file's own comments;
- a regex whose quote-pairing slipped;
- a stripper that excused the strings a test asserts;
- a wait satisfied by the previous render's mock calls.
