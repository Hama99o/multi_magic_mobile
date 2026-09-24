# MultiMagic mobile, as of 2026-09-22

Written to answer one question — *is it ready?* — without making anybody read a
register. Everything here was measured on a device tonight unless it says
otherwise.

## What it does

You can sign in, including with two-step verification, and tell it to trust the
phone so it stops emailing you a code. You can ask the assistant a question and
get a real answer back over the socket, have it read aloud in the good voice,
dictate instead of typing, and undo something it did. You can keep several
conversations, rename them, narrow what they search, clear them and delete
them. You can message people, see notifications and your calendar, attach a
file, edit your profile and photo, change your password, read the privacy
policy and delete your account. All of it in English or French, light or dark,
on a phone or a tablet.

## What was wrong two days ago and is not now

Creating an account said it had failed while succeeding — so the second attempt
was told the address was taken, by the account the first had made. A profile
photo could never load on a phone, because the server handed out a URL naming
the laptop. The assistant read French answers in an English voice. A
conversation would not scroll to its newest message, in four separate ways. The
link the assistant sends when it has no API key opened a browser instead of the
screen that fixes it. And an account with two-step verification could not sign
in on the phone at all — there was no screen to type the code into.

## What is known and not done

**Sheets have no grab handle.** Every comparable app has one; ours dismiss by
tapping outside or the ✕. Adding the handle alone would promise a drag that
does nothing, so it waits for drag-to-dismiss, which has to be arbitrated
against the scrolling inside each sheet. Specified in `docs/design/chat/SPEC.md`.

**There is one animation, not a motion language.** A message fades in as it
arrives, 180 ms, and Reduce Motion turns it off. The sheets already slide;
nothing else moves.

**A conversation created but never used sits in the list.** Pressing New chat
now reuses it rather than adding another, but it is still there until you
delete it. Whether a conversation should exist before its first question is
your call — `docs/SESSION_FEEL.md` §2.

**After release: the lender's side of a shared AI key.** Since multi_magic
`9a5a3cb` a key can be shared with a monthly credit limit per borrower. The
phone shows the BORROWER's half (`ade727d`: spend against the limit, and the
date a used-up key works again). It has no LENDER's half at all: no share, no
unshare, no per-borrower limit. The contract is there when it is wanted:
`POST /api/v1/ai_keys/:id/share` (`email`, optional `monthly_credit_limit`),
`PATCH /api/v1/ai_keys/:id/share` (the same two; blank limit removes it), and
each key's `shared_with` list in `GET /api/v1/ai_keys` (address, limit,
`spent_this_month`). Deferred on 2026-09-24 as a new surface before release;
the web has it (`KeySharing.tsx`).

## What nobody has measured

**Dictation.** The mic renders and the emulator has no voice to hear, so
tapping it produces nothing there. It needs one tap on a real phone to know
whether that is the emulator or the app.

**Read-aloud in French.** The fix is on the server and has tests; proving it
needs a French answer and an ear, and no gate here can hear.

**How any of it feels.** Nothing in this repository measures a pixel or a
frame. Every layout claim comes from a screenshot somebody looked at.

## What is waiting on you

- **The Android package name.** `main` still says `co.byseven.multimagic` and
  `sdk-57` says `com.multimagics.mobile`. It is permanent from the first Play
  upload, and the docs already name `sdk-57` as the branch a build comes from.
- **The signing key**, which only your account can create.
- **The backend deploy — and this is the one that blocks a store.** Account
  deletion is written AND pushed (`56559c4`, 19 September, on `origin/master`),
  but pushing is not deploying: until the deploy runs, the live API still
  cannot pass a store review however finished the phone is. Separately and much
  smaller, three commits are unpushed on `master` — the signup fix, a RuboCop
  rename, and trust-this-phone. `docs/DEPLOY_READINESS.md` in the backend has
  the ordered list; its first step is `bin/kamal/migrate db:migrate:status`,
  which only reads `schema_migrations` and changes nothing.

  *(This bullet said "nine commits sit unpushed, including account deletion".
  Both halves were wrong: the count came from a deploy document describing
  SEVEN commits as of 20 September, which have since been pushed, and account
  deletion was never among them. Corrected 2026-09-22 after measuring
  `git log origin/master..master` and `git branch -r --contains 56559c4`.)*
- **One tap on the mic**, which closes the last open question above.

## Is it ready?

For you to use: yes, and it has been all evening. For a store: not until the
four things above are yours to do and done — none of them is code.
