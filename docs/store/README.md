# Store listing assets — and why they are not the design screenshots

`docs/design/**/ours/` holds **design evidence**: a screen at 360, 411 and
800 dp, light and dark, French at 360. Those prove the layout. They are the
wrong shape for a store listing, and this folder exists because that is not
obvious.

## The finding: every design screenshot would be REJECTED by Google Play

Play's rule, from the Play Console help: **"the maximum dimension of your
screenshot can't be more than twice as long as the minimum dimension."**

`qa_phone2` is **1080 × 2400** natively — a ratio of **2.22**. So every
picture in `ours/`, all 72 of them, is outside the rule. They are correct
evidence and unusable as listing assets, and nothing about looking at one
tells you that.

## What is here

`play-phone/` — 18 shots, nine screens in light and dark, at **1080 × 1920**
(ratio 1.78). Taken by `./qa/screens.sh store-light` and `store-dark`, which
sets `wm size 1080x1920` and keeps density at 420 so the layout is the same
411 dp one the design pictures already prove.

Shot on 2026-09-20 against the dev build on `qa_phone2`, signed in as the QA
account. **The account holds three conversations and no notifications, no
calendar events and no AI key in use**, so the notification and calendar shots
show empty states. For a listing those are weak and a human should choose
which of the nine to use — `chat`, `sessions` and `people-chat` are the three
that show the product doing its job.

## What is NOT here, and whose it is

- **iOS screenshots.** No iOS build has ever run. Apple requires its own sizes
  (6.9" and 6.5" iPhone, 13" iPad); none can be produced from this box.
- **The feature graphic** (1024 × 500) and the **512 × 512 icon**. Design
  assets rather than screenshots; `assets/icon.svg` is the source for the
  icon.
- **Age rating and data-safety declarations.** Console forms, and his alone.
- **Whether the current Play rules match the ones quoted above.** Checked on
  2026-09-20 against Play Console Help, not from memory — but store rules
  change, and the console is the authority. Re-read it before uploading.
