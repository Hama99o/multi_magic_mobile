# Step 0 (hygiene): done-manifest

From Hello, 2026-11-20, on the parity audit (`docs/MOBILE_PARITY_2026-11-20.md` §5, step 0). Local only: no push, no device until Hello gives the slot.

This repo is public, so this file stands in for the PR description (`implement-change` §7).

Status per line: ☐ open · ☑ proven (evidence beside it) · ⚠ unproven (said so).

**Goal:**
- Fix the owner-rule breaks in shipped 1.3.0.
- Rebase the iOS video fix onto main.
- Close Tasks, Finance, SafeZone and Contacts to the web, one app per commit series.
- Newest first is the default for every list (Hello's call under the owner's rule), with the other order one tap away.

## MUST

| # | Criterion | Check | Status · evidence |
|---|---|---|---|
| A1 | No Reanimated `entering`/`exiting`/`layout` and no transform on a recycled list cell | eslint `list-cell-animation` (fixture `eslint-fixtures/list-cell-animation.tsx`, 3 shapes); `src/__tests__/eslintRules.test.ts` | ☑ The rule was red on all 11 sites plus `app/home.tsx:66` (a ScrollView `.map`, given a written exemption), then green after `39dc088`. Two press-scales became opacity. |
| A2 | Row height unchanged | The removed wrapper had no style; same `View` tree | ☑ read from the diff · ⚠ device not measured |
| A3 | Swipe-to-delete keeps its `translateX` only if no offset outlives its row (Hello, 2026-11-20): rows keyed by id, reset on scroll, on new rows and on a new record | jest `swipeReset.test.tsx` (4); **device**: delete a row, scroll fast up and down, no row shows a stale offset | ☑ jest red → green, `07b49fc` · ☑ **device, Tasks list** (2026-11-20, `qa_phone3`, Step 0's code as merged in `feat/tables` @ `64bd9b6`): a 40-task throwaway list, swipe-delete one, a half swipe released, then 2 × (3 fast flings down + 3 up); after each round every visible row had the same left edge (42 px) and width (996 px) by `uiautomator` bounds, and the deleted row was gone. Screenshots on the contact sheet. · ☐ Tasks due, Expenses, Loans: the next slot |
| B1 | `fix/media-kind-by-content` rebased onto main, green, not pushed | Branch `fix/media-kind-rebased` (worktree `mm-media-rebase`, 3 commits on `4dd5e8f`) | ☑ 3 conflicts resolved (imports on both sides; `stored` + `pagesKeys`); typecheck and lint clean · ☐ full jest and bundle: see Gates |
| T1 | A finished Tasks list's card says "All done" (web `GroupCard.tsx:89-97`) | jest `todoApp.test.tsx` › "says All done…" | ☑ red → green, `60ad3c1` |
| F1 | Overview lists the active loans, five at most; a tap opens one | jest `financeApp.test.tsx` › "Overview: active loans" (2) | ☑ red → green, `2e1dfb1` |
| F2 | Links to an expense, income or loan open in the app | jest `inAppRoute.test.ts` (2), `financeApp` › "a link to an expense…" | ☑ red → green, `2e1dfb1` |
| F3 | Budgets, recurring rules and categories are newest first; the old order is one tap away | jest `manage.test.tsx` › 3 sort tests | ☑ red → green, `c606c2f` |
| F4 | All time; future periods up to 5 years | jest `financeApp` › "steps into the months ahead…", "All time…" | ☑ red → green, `c606c2f` |
| F5 | An entry may have no date; editing an undated one keeps it undated | jest `financeApp` › 2 no-date tests | ☑ red → green, `c606c2f` (this also fixes a bug: an undated entry used to be saved with today's date) |
| S1 | Card row: credit or debit, expiry, Expired or Expires soon | jest `logic.test.ts` › "a card's expiry", "a row's second line"; `safezoneApp` › unlock test | ☑ red → green, `91b5c22` |
| S2 | Each SafeZone row shows its date (changed; an ID's expiry) | jest `safezoneApp` › "each row carries its date" | ☑ red → green, `91b5c22` |
| C1 | My family (the web's tab) from Contacts ⋮ | jest `contactsApp` › "My family" (4) | ☑ red (the module was missing) → green, `f15800a` |
| C2 | A search in the "who is it?" list | jest `contactsApp` › "the who-is-it list has a search…" | ☑ green, `f15800a` · ⚠ keyboard over the sheet not seen on a device |
| C3 | Search reads every page of matches | jest `contacts.test.ts` › "a search reads every page…" | ☑ red → green, `f15800a` |
| C4 | Family words in the app's language until the server sends keys | jest `familyLabel.test.ts` (3); `keys`, `locales` | ☑ red → green, `92c9d91` |

**Found by the i18n gates after the fact:** `c606c2f` and `f15800a` were committed after their own suites passed, but before `keys.test` and `locales.test` had run. Those caught a plural not registered, "A–Z" identical in both languages, and three French strings over the 1.9× budget, all fixed in `92c9d91`. That is why the full run, below, is a gate and not a formality.

## Gates

Run one at a time (Hello's rule, 2026-11-20). The standing threshold is ≥ 6 GB available, but the first run waited an hour without ever reaching it (an emulator held 3.5 GB) and measured nothing. **For this run only, Hello approved a 5 GB threshold**: full Jest at `--maxWorkers=1`, and any step killed and counted NOT MEASURED if memory fell under 3 GB. Each row gives the lowest memory seen during that step. Single suites were run before this with `--maxWorkers=1` at ≥ 4 GB.

| Gate | Step 0 (`6019e51`) | media-kind rebased (`232275c`) |
|---|---|---|
| typecheck | ☑ clean. It was red at first: `91b5c22` left a test calling `rowSubtitle` with one argument; fixed in `ec70881` | ☑ clean |
| lint | ☑ clean | ☑ clean (lowest 3 GB) |
| jest (full, 1 worker) | ☑ 260 suites, 3384 tests (lowest 3 GB). It was red at first: 2 tests in `openSource.test` used a loan link as the "web only" example, and F2 gave loans a screen; fixed in `6019e51` | ☑ 262 suites, 3418 tests. At first it read "3288 passed" while **8 suites never loaded** (expo-video throws on import in Jest since `7a2fc58`); the stub in `src/__tests__/setup.ts`, `232275c`, fixed it |
| bundle (`expo export`, `--max-workers 1`) | ☑ exported (lowest 4 GB) | ☑ exported (lowest 4 GB) |

The Step 0 bundle ran at `6019e51`. The final typecheck and lint at `6019e51` started at 4 GB free, under the 5 GB threshold; my slip, said here. Both are light and both were clean.

**What these gates taught:** "N passed, N total" is not a green. Read `Test Suites:`, because a suite that cannot load contributes no tests and no failure line.

## Hidden criteria

| | Status |
|---|---|
| Dark and light | ⚠ device. New colours are tokens only (`accent` tints, `danger`, muted). |
| en and fr | ☑ Every new string has a French value (`keys.test`, `locales.test` in the full run) · ⚠ fit at 360 dp not seen |
| 360, 411, 800 dp | ⚠ device |
| Empty, loading and error states | ☑ My family has all three (`LoadFailure`, a spinner, the empty sentence); the active-loans card hides when empty and offers Retry on failure; All time has its own empty sentence |
| Double tap | ☑ "Not me" and "Yes, that is me" are disabled while the request runs |
| Recycled cells | ☑ A1; new lists (My family) have plain rows |
| Newest first | ☑ F3. Exceptions: My family keeps the family order; expense and income stay grouped by day (see Not done) |

## Not done, and why

- **Server gaps**, written up in `docs/API_ASKS.md` §5 with the phone's fallback for each:
  - fair or strong password strength: the phone shows "Weak" only when the server says so;
  - expenses, income and loans newest first by creation: the phone uses the server's `updated_at desc`;
  - family words as keys: the phone maps the server's 55 English words, C4.
- **The Finance "Loans total"**: the SPEC deliberately replaced it with To receive / To pay.

## Device QA

☐ Partly run (pass 1, 2026-11-20 18:10–18:32, on `qa_phone3`, the only one of ours on the box; `qa_phone2` does not exist, the docs' fix is on the owner's list): the swipe proof on Tasks passed (A3). The rest waits for the next slot. Originally planned on (`qa_phone2`, Metro 3029, API 3001, claimed with `./qa/qa.sh claim`). Signed in as the QA account only, never the owner. Before every verdict, check that the served bundle is `ec70881` or later. After every `wm size`/`wm density` change, force-stop and relaunch the app.

**Order (about 40 min):**

1. **The swipe proof (A3), first, because it can remove code.**
   - Lists: Tasks list, Tasks due, Expenses, Loans.
   - In each list, create two throwaway records on the QA account (never delete an existing one), each named `QA swipe <n>`.
   - Swipe the first one open (`todo-row-<id>`, `finance-loan-row-<id>`) and delete it.
   - Fling to the bottom and back three times, fast. Then swipe a second row half open and pull to refresh.
   - **Pass:** no row ever sits shifted, and no gap or overlap appears. Screen-record the flings with `adb screenrecord` and trim the waits.
   - **Fail in any list:** remove the swipe from all of them (delete stays in each row's sheet), re-run the gates, then re-test.
2. **Widths.** For each screen below, shoot 360, 411 and 800 dp (`wm size` 1080x2400 at densities 480/420, then 1600x2560 at 320), in light and dark, en and fr: 12 shots per screen.
   - **Tasks:** a finished list's card with the "All done" pill (T1). Only the QA account's own lists; tick off a throwaway list.
   - **Finance Overview:** the active loans card (F1); hidden when the QA account has no loan, which counts as a shot of the empty case, not a pass.
   - **Finance Manage:** the budget, recurring and category sort chips, each tapped once (F3). Plus a period switcher on All time and on a month 5 years ahead (F4).
   - **Finance entry:** create an expense with "No date", re-open it and check it's still undated (F5). Delete it afterwards.
   - **SafeZone:** a card row with brand, expiry and Expires soon/Expired (S1), and the date on each row (S2). Needs the QA account's PIN, from `.env`. Use a throwaway card with an expiry within 60 days and delete it afterwards.
   - **Contacts → ⋮ → My family** (C1): list, SelfPicker, "Not me" and confirm, cancelled before saving. Then the "who is it?" sheet with its search field and the **keyboard up** (C2, the open ⚠).
3. **Existing flows**, as a regression check on the rows A1 touched:
   - `25-contacts` (the contacts list), `99-screens` (every screen renders), `20-refresh` (lists pull to refresh), `21-faults` (error states).
   - Each verdict goes in `qa/FLOW_REGISTER.md` with which case actually ran.
4. **Row height (A2).** Measure a Tasks row, an expense row and a loan row with `uiautomator dump` bounds, on main `4dd5e8f` and on this branch. **Pass:** same height to the pixel. This needs two installs, so do it last.
5. **Contact sheet** in `~/Downloads/multimagic-qa/2026-11-20-hygiene-step0.jpg`, uploaded with `multimagic_upload.py --space MultiMagic --folder 2026-11-20`. Shots go in `docs/design/hygiene-step0/ours/` (tracked) and the view dumps in `qa/evidence/` (ignored).
6. **Clean up.** Delete every throwaway record (`QA swipe <n>`, the undated expense, the SafeZone card, the ticked-off list). List each deleted id here, under "Records created and deleted". Check with a list call that none is left.
7. **Release** the claim and stop the emulator by its own serial. Send Hello the contact sheet's Pages location.

### Records created and deleted

QA account only (Hello, 2026-11-20).

| Kind | id | Created | Deleted |
|---|---|---|---|
| Tasks list "[qa] Swipe proof" | 220 (and its 40 tasks) | 2026-11-20 18:20 (API, QA account) | 18:32, the list (with its tasks); a list call showed none left |
| Tables bases "[qa] Tables device" | 1, 2, 3, 4 (failed fixture runs), 5 (the run's) | 18:13–18:19 | each deleted the same session; a list call showed none left |
| A row added and deleted through the app in base 5 | (in base 5) | 18:30 | with base 5 |

New flows to write while the device is up, so this run can be repeated without a person:
- `28-tasks-done.yaml` (T1);
- `29-finance-overview.yaml` (F1, F3, F4);
- `30-my-family.yaml` (C1, C2, opening and cancelling only).
Each gets its row and its "does NOT cover" column in the register.

### Pass 3 (2026-11-20 22:19–22:37, `qa_phone3` emulator-5556): Hello's decisions 1, 2 and 5

The bundle was feat/tables @ `5fcd073` (this branch merged at `0b92918`), served by Metro `--clear` against multi-magic-83's :3020 (demo account, its own DB). Grepped first: `ACT_FRACTION` 5, `mm-language-pending` 2, `mm-doc/app` 0. Autofill was off. Free memory at boot was 9.8 GB and the swap-in rate 0/s. Shots and recordings are in `/data/e9-shots/p3`.

| Decision | Result | Evidence |
|---|---|---|
| (5) The language follows `users.lang` | ☑ in 3 cases: a fresh install took the server's `fr`; the server set to `en` → relaunch in English; the server back to `fr` → the phone, whose English was confirmed, followed | `01`–`03`, `61` |
| (2) Swipe: partial reveals, ≥ 60 % deletes | ☑ Tasks and Loans: a partial swipe opens Delete, 176 px = 88 dp, the row's exact height, the content's edge on the button's. A tap on the row closes it. The button deletes with Undo; a ≥ 60 % swipe deletes with Undo. Expenses: the long swipe deletes, total €198 → €176. | `11`–`14`, `30` |
| (2) No stale offset on a recycled list | ☑ Loans (it scrolls): a row left open, 3 flings → the open row closed on the scroll; 8 rows at x = 32, each 196 px | `31`, `32-loans-fling.mp4` |
| (1) Finance Undo restores the row and the total | ☑ recording at 8 fps: Undo tapped ≈ 5.5 s; €155 / 10 entries → €176 / 11 entries with the row back in place by 6.0 s | `25-exp-undo.mp4`, `26-undo-timeline.png` |
| (1) …while the list is flinging | ⚠ NOT MEASURED: 12 expenses fit at density 320, so the flings scrolled nothing. Needs a longer list or density 480. | |
| Newest first | ☑ Expenses (exp 12 on top) | `20` |

Not shot: Expenses partial swipe; dark mode.

| Kind (demo DB on :3020) | ids | Deleted |
|---|---|---|
| Expenses "[qa] p3 exp 1–12" | 1–12 | 22:36, trash then permanently: 12 |
| Loans "[qa] p3 loan 1–8" | 1–8 | 22:36, permanently: 8 |
| Tasks list "[qa] p3 swipe" (12 tasks) | 1 | 22:36 |
| Tables base "[qa] p3 people" (shared with Sam; 2 rows; 1 comment with a file) | 6 | 22:36; a list call showed `bases_left: []` |
| Server `users.lang` | Alex (demo) | set back to `fr`, as found |
