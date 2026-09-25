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

**What the pictures show: ONE approval, not a choice.**

- **Ruled out: a demo account in his database.** It conflicts with his
  standing instruction never to seed or reset `multi_magic_development`
  (CLAUDE.md, "Never seed"; `qa/RIG_CONTRACT.md` §3). A volume on this
  machine is the only copy of his data. Do not re-propose it.
- **Rejected: content-free screens.** An app whose whole claim is answering
  from your own things, shown with nothing in it, tells a reader nothing.
- **Built: the fault proxy serving invented data.** Nothing is written
  anywhere and it is fully reversible (`qa/fault_proxy.py`, serve mode).
  In serve mode it answers only the demo's routes and REFUSES everything
  else, the socket included, never forwarding. So a picture cannot show one
  real row, not the QA account's and not his. The test proves the real
  upstream is never contacted.

**The one thing asked of him: the words, in `DEMO_CONTENT.md`.** Every name,
amount, place and date is invented (Maya Brooks, Sam Carter, Nora Lind, a book
club), in English and French. Edit `qa/demo/content.py`, then run
`python3 qa/demo/build_demo.py`; never edit the rendered files.
`src/api/__tests__/demo.test.ts` runs the app's real parsers over every
rendered file, and fails on one unreadable row or on any QA leftover.

**The moment he says yes** (about three minutes a language):
1. `FAULT_PROXY_SERVE=qa/demo/en python3 qa/fault_proxy.py` (French:
   `qa/demo/fr`).
2. Start Metro baked to it, then STOP it afterwards (the value is inlined):
   `EXPO_PUBLIC_API_URL=http://10.0.2.2:3031 npx expo start --port 3029`
   (`ensure_node` picks the right Node).
3. `./qa/screens.sh` store combos: 1080x1920, with the demo status bar.
   **For the French set the APP's language must be French**: the device's
   stored choice wins over the served user's `lang` (seen 2026-09-25, when the
   French demo showed an English interface). The `fr` combos set it through
   `set-language.yaml`.
4. Keep at most 8 per device type, then `python3 qa/store_check.py` and a
   human look at every picture.

**Also his:** the feature graphic (1024x500, a design asset), the Play
console forms (age rating, data safety), and Apple's screenshots, which need
a Mac or an iOS simulator this Linux box does not have. The app declares iPad
support, so Apple also requires the 13" iPad set.
