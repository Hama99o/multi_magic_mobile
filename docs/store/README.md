# Store listing assets — and why they are not the design screenshots

> **2026-09-25: DO NOT UPLOAD anything in `play-phone/`.** Read against the
> stores' current rules and this repo's own, all 18 fail:
> - **QA account content in a published picture**, which this repo forbids:
>   "[qa] automated test message", a profile About reading "written by
>   qa/flows/13-profile.yaml", the QA address, a mangled test question.
> - **Mixed languages**: files named `-en-` show a half-French interface.
> - **Five-day-old UI**: the settings still live in the sessions sheet.
> - **Status-bar notifications**, which Play forbids.
> - **18 in one folder**, where Play takes at most 8 per device type.
>
> `python3 qa/store_check.py` is now the gate for everything checkable (sizes,
> ratio, alpha, counts, icon, feature graphic). It cannot check content;
> a human looks at every shot. Re-shooting needs the owner's choice of what
> the pictures show; see "What only he can decide" below.

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

## 2026-09-25: what exists now, and what only he can decide

**Produced:**
- `play-icon-512.png`: the approved `assets/icon-1024.png` resized to 512x512,
  32-bit PNG, 33 KB, which is Play's exact spec.
- `qa/store_check.py`: every checkable rule, quoted from the stores' pages with
  the date read. Planted with a design-size shot (ratio 2.22), an alpha
  channel, an Apple folder at an Android size, and an RGB icon: each one
  BROKEN, by name.
- **A clean status bar for store shots** (`qa/screens.sh`, store mode):
  SystemUI demo mode shows 12:00, full Wi-Fi, full battery and no
  notification icons, restored by the trap. Verified on `qa_phone4`. The
  first attempt drew Wi-Fi with a "!" and a stray "3G", and was corrected.

**What only he can decide: what the pictures show.** The QA account cannot
supply it, and his own account must never be driven. Three ways, each
needing his word:
1. **A demo account**, signed up in his local database, holding a few notes,
   an event and a conversation written for the listing. This writes new rows
   to the only copy of his data, which is why it is his decision.
2. **The fault proxy serving a curated demo set** (`qa/fault_proxy.py` gains
   a "serve these files" mode). Nothing is written anywhere. The content is
   sample data written for the listing, so its words need his approval.
3. **Content-free screens only**: sign-in, the empty calendar, privacy.
   Nothing to approve, and weak as a listing.

**Also his:** the feature graphic (1024x500, a design asset), the Play
console forms (age rating, data safety), and Apple's screenshots, which need
a Mac or an iOS simulator this Linux box does not have. The app declares iPad
support, so Apple also requires the 13" iPad set.
