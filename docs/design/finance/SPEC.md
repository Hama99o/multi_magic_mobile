# Finance — SPEC

**Status: SPECIFIED** (2026-11-16). Nothing is built yet; Todo goes first. The
owner (via Hello, 2026-11-16): *"finance app also go on"*, *"check well what
they want and we should add these apps also very well"*, *"make sure we work
well on design"*.

The bar: everything the web's Finance does (`pages/finance/**`), plus what
people expect from Spendee, Wallet, YNAB and Splitwise. It belongs to the same
family as Notes, Contacts, SafeZone and Todo, and there is no "on the web"
escape hatch.

Sources:
- [`WEB_INVENTORY.md`](WEB_INVENTORY.md): the full API and web inventory, read at multi_magic `0986d1e4`: every endpoint, param, response field, ordering and the 24 gotchas. Its key facts are quoted below.
- [`REFERENCES.md`](REFERENCES.md): 32 Mobbin screens across 8 flows, each saying what we take and why.

## Facts that shape the client (from the server, not guessed)

- **Money arrives as strings** (`"12.5"`), sometimes as the integer `0`. It is parsed once, in `src/api/finance.ts`, into numbers, and the amount we send is a number.
- **Currency belongs to each record.** There are 8 currencies (eur usd gbp afn pkr inr jpy cny), the default is `eur`, and the user has no currency setting. **Totals are maps per currency and are never added across currencies.** We show `€12.00 · $5.00` as the web does. Charts use the dominant currency (the one spent most), as the web does.
- **Dates:** `spent_at` and `received_at` are UTC midnight. They are shown as the day (`split("T")[0]`), never shifted by the time zone.
- **Order:** expenses, incomes and loans come `updated_at desc`, so a record just made is on top of page 1. Budgets come `created_at asc`, recurring rules by next date, tags by name.
- **Pages are tiny:** 5 expenses, 5 loans and 12 incomes per page, fixed by the server. See §E.
- **Labels vs category:** a record has one category (`tag_id`), expenses also a `subcategory_id`, plus any number of labels (`label_ids`, inside the record). We build the submit exactly as `ExpenseDrawer.onSubmit` does.
- **Loans:** `loan_type` is `given` (they owe me) or `taken` (I owe). The server recomputes `status` (paid/unpaid) after every change and payment, and refuses an overpayment.
- **Delete is soft:** `restore` exists for expenses, incomes and loans, so **Undo is a real restore**.

---

## A · Web parity

| # | Web feature (file) | Mobile |
|---|---|---|
| F1 | Dashboard KPIs for This month / This year: spent, income, net, number of expenses, To receive, To pay (`Dashboard.tsx`) | Overview: a month and year switcher, hero numbers per currency. To receive and To pay sum **every** unpaid loan (the web sums only page 1: a web bug, not copied) |
| F2 | Budget progress, the top 4 by ratio, green / amber ≥80% / red ≥100% | Overview: a Budgets card with the same 4 and colours |
| F3 | Income vs expenses, 12 months (`reports/cash_flow`) | Overview: paired bars, SVG |
| F4 | Totals over time, 12 months or 10 years (`total_expenses_last_years_or_months`) | Overview: bars, SVG |
| F5 | By category donut (`pie_chart_data_by_tag`) | Overview: donut and a legend with amount and %, in the right currency (the web always shows €: a web quirk, not copied) |
| F6 | By subcategory donut for a chosen category | Tap a category slice or row to open its subcategories |
| F7 | Active loans, 5 on the dashboard | Overview: a Loans card with the 3 nearest due, then See all |
| F8 | Reports: year and month, income / expenses / net, spend by category (`ReportsPanel.tsx`) | Reports screen |
| F9 | Export expenses, incomes and loans as CSV, Excel or PDF for a date range (`reports/export`, `file_format`) | Reports › Export: the file is downloaded and handed to the share sheet (expo-sharing, as Pages does) |
| F10 | Expenses: All / One-time / Recurring segments, search, filters (category, year, month; default this month), totals bar and count, paging | Expenses tab: month switcher, search, filter sheet (category, one-time), totals, infinite list grouped by day |
| F11 | Export the expense list to Excel with its filters | Expenses ⋯ › Export |
| F12 | Expense view: item, amount, tags, date, currency, description; Edit; Delete | Expense detail sheet |
| F13 | Expense form: item*, amount*, currency, tags (multi, sub adds parent, **create inline**), date, description | Entry sheet (§D) |
| F14 | Recurring expenses: list with total, category filter, Pause/Resume, form (item, amount, currency, repeat every N day/week/month/year, start date, category, description), delete | Recurring screen (expenses / incomes segment) |
| F15 | Income: All / Recurring, **pending "To confirm" section** (edit amount, Confirm, Discard), search, filters, totals, list | Income tab: Pending pinned on top (Quicken / Upside), then the list by day |
| F16 | Income view and form: source*, amount*, currency, tags, received date, description | Same sheets as expenses, in green |
| F17 | Recurring income: list, **Run now**, Pause/Resume, form with estimated amount | Recurring screen, incomes segment |
| F18 | Loans: Active / Paid, search, filter by type and category, totals; cards with remaining, "/ total", % paid bar, due date | Loans tab: To receive / To pay summary, Active / Paid, rows with a progress bar |
| F19 | Loan view: header, fields, **payments list** (delete with confirm), **add payment** (amount and date; hidden when paid), Edit, Delete | Loan detail screen: % paid, a payment timeline, Add payment sheet with "Pay the rest" |
| F20 | Loan form: lent / borrowed, contact name*, amount, currency, due date, tags, description | Loan form; the contact name can also be picked from Contacts (B8) |
| F21 | Budgets: cards (name or "Overall", period, amount, bar, spent %, remaining, red when over), form (category or overall, amount, currency, monthly/yearly), delete | Budgets tab |
| F22 | Categories: two columns (categories, subcategories), add, rename, delete with confirm (cascades) | Categories screen, a drill-down list |
| F23 | Help dialog with 8 sections and the multi-currency tip | Help sheet, ⋯ › Help |
| F24 | Loading, empty, load error with Retry, toasts | Skeletons, empty states, `LoadFailure`, a toast bar |

## B · What people expect from the best apps

| # | Expectation | Server today | Decision |
|---|---|---|---|
| B1 | Fast entry: a big amount with its own keypad, Expense / Income switch, category chips, date chips (Today / Yesterday / pick), note (GoPay, Buddy, Copilot) | ✅ | **MUST** |
| B2 | Monthly totals with ‹ month › in place | ✅ `year`/`month` | **MUST** |
| B3 | Category breakdown chart | ✅ | **MUST** |
| B4 | Budgets with progress, "X of Y", state colour | ✅ | **MUST** |
| B5 | Loans owed to me and by me, with payments (Splitwise) | ✅ | **MUST** |
| B6 | Recurring entries (subscriptions) | ✅ | **MUST** |
| B7 | Currency on every entry, remembered: the last currency used is the default for the next entry on this phone | per record ✅ | **MUST** (an AsyncStorage convenience; no server setting exists) |
| B8 | Pick the loan's person from Contacts | `contact_name` only ✅ | **MUST** (it fills `contact_name`; no server link) |
| B9 | Search and filter | ✅ | **MUST** |
| B10 | Undo after delete | ✅ `restore` | **MUST** |
| B11 | Swipe a row to delete (with Undo) or edit | ✅ | **MUST** |
| B12 | Haptics, pull to refresh, works offline on what was loaded | — | **MUST** |
| B13 | Trash: see deleted entries, restore, delete forever (the web has no screen; the API is there) | ✅ | **SHOULD** |
| B14 | A Home tile line with this month's spend | ✅ | **SHOULD** |
| B15 | Receipt photo on an expense | ❌ | **LATER** (server) |
| B16 | Split an expense with people (Splitwise groups) | ❌ | **LATER** |
| B17 | Accounts / wallets and transfers between them, balance | ❌ | **LATER** |
| B18 | Bank sync | ❌ | **LATER** |
| B19 | Budget rollover, savings goals | ❌ | **LATER** |
| B20 | Converting currencies for one total | ❌ (no rates) | **LATER** |

## C · References

[`REFERENCES.md`](REFERENCES.md) has 32 screens: overview (Monarch, Revolut,
Rocket Money, Cleo), entry (GoPay, Buddy, Copilot, Splitwise), day-grouped
list (Copilot, Monzo, Careem, Starling), breakdown (Origin, Buddy, Revolut,
Plum), budgets (Copilot, YNAB, Origin, Starling), loans (Splitwise ×2, YNAB,
Afterpay), recurring (Origin, Rocket Money, Copilot, Monzo) and income with
pending (Quicken, Upside, Lightyear, Shopee). The ten patterns at the end of
that file are the design's spine:
- one hero number with smaller cents;
- the month switched in place;
- day groups with day totals;
- colour is the sign;
- chips plus a filter sheet;
- bar + "X of Y" + state colour;
- one entry sheet with its own keypad;
- pending as a section;
- loans per person;
- a toast to confirm.

## D · The design

**One family.** The same header as SafeZone and Todo (‹, title, icons), the
same `Screen`, `Text` variants, `ActionSheet`, `ChoiceSheet`, `MonthGrid`,
`LoadFailure`, `UnreadableNotice`, `KeyboardPadding` and FAB.

**Colour: tokens only.**
- The app colour is GREEN `#77b87d` (owner's call pending; shared with Contacts).
- **Colour is the sign** (REFERENCES pattern 4): money in, and "owes you", in GREEN; money out in `ink` (never red; spending is not an error); "you owe" in ORANGE `#e9ab4c`; red (`colors.danger`) only for over budget and overdue.
- Budget bars: GREEN under 80%, ORANGE from 80%, `danger` from 100%.
- Category colours in charts: `CATEGORY_COLORS` in order, by the category's rank (`categoryColor` in `tokens.ts` exists for ids).

**Numbers:** the hero amount is 34/40 bold with the cents at 60% size
(Revolut). Rows show the amount right-aligned at `body` 16, weight 600, with
tabular figures (`fontVariant: ["tabular-nums"]`). The format is the web's
`formatMoney`: symbol, `toLocaleString(app language)`, 2 decimals, the minus
before the symbol.

**Space and type:** the same scale as Todo: `metrics.space`, rows ≥ 56 dp, touch ≥ 44, `title` 26 for screens, `label` 14 muted for day headers ("TODAY · −€24.50").

**Screens**
1. **Finance home** (`app/finance/index.tsx`). A segmented bar under the header: Overview · Expenses · Income · Loans · Budgets (scrolls on a narrow phone, as the web's tabs do). ⋯ opens Recurring, Categories, Reports and export, Trash (B13) and Help.
2. **Overview:**
   - ‹ November 2026 › and a Month / Year toggle;
   - the hero: Spent this month (dominant currency large, the others as a line under it), then Income and Net;
   - To receive / To pay as two cards (Splitwise colours);
   - Budgets (top 4, bars), By category (donut and legend; a tap opens its subcategories), Income vs expenses (12 bars), Totals over time;
   - Recent: the 5 latest expenses.
3. **Expenses / Income lists:** month switcher, search, filter chip (category; One-time for expenses), the totals line ("€320.00 · 14 entries"), then rows grouped by day with each day's total (Copilot, Monzo). Income has its Pending section pinned on top: amount editable, Confirm, Discard (Upside).
4. **Entry sheet** (`app/finance/entry.tsx`, a modal like `contacts/edit`):
   - Expense / Income segment on top (Loan has its own form);
   - the amount in the hero style, centred, with an on-screen keypad (0–9, `.`, ⌫; the system keyboard is never needed for it);
   - the currency chip beside the amount (ChoiceSheet of 8);
   - then rows: Name (item or source), Category (chips of the most used categories, then "All…" as a sheet with subcategories and **New category** inline), Date (Today / Yesterday / pick with `MonthGrid`), Labels, Note;
   - Save is pinned at the bottom, full width, in the app colour. A toast "Expense saved" follows.
5. **Expense or income detail** (sheet): the hero amount, name, category and label chips, date, currency, note; Edit, Delete (with Undo).
6. **Loans:**
   - the two summary cards on top (To receive in green, To pay in orange, each per currency, with "N active");
   - Active / Paid chips, plus a filter for lent / borrowed and category;
   - rows: the person's initials avatar (Contacts' `ContactAvatar`), the name, "you lent" / "you borrowed", the remaining amount large with "of €200" small, a thin bar with "40% paid", the due date in `danger` when past (Splitwise, YNAB).
7. **Loan detail** (`app/finance/loan.tsx?id=`):
   - the header from YNAB: remaining big, "of €200", a ring or bar with % paid;
   - the fields; the payment timeline (Afterpay), each payment deletable;
   - **Add payment** sheet: amount with the keypad, "Pay the rest" chip, date;
   - Edit, Delete. "Paid" shows as a green badge.
8. **Budgets:** cards with the category (or "Overall"), Monthly / Yearly, "€120 of €300" and a bar, "€180 left" or "€20 over" in `danger` (Copilot, YNAB). Tap opens the form: category or overall, amount (keypad), currency, period.
9. **Recurring** (`app/finance/recurring.tsx`): Expenses / Incomes segment; rows with name, amount, "Every 3 months", "Next on 2 Dec" or Paused (dimmed); Pause/Resume, Run now (incomes); a form with repeat every N + unit and the start date (Origin, Rocket Money).
10. **Categories:** a list of categories with their subcategory count; tap opens its subcategories; add, rename and delete (the Alert names what is lost: its subcategories and budgets).
11. **Reports:** year and month (whole year allowed), three stat cards, spend by category, then Export: a date range and Expenses / Incomes / Loans × CSV / Excel / PDF, downloaded and shared.

**Empty states** (the SafeZone pattern): no expenses this month ("Nothing
spent in November", with Add expense), no income, no loans ("No one owes you,
and you owe no one"), no budgets ("Set a monthly limit"), no recurring entries.

**Motion:**
- rows `FadeInDown` staggered;
- the entry sheet slides up;
- keypad keys scale 0.94 on press, with a selection haptic;
- Save gives a success haptic and the toast;
- budget bars and the loan ring animate from 0 to their value over 400 ms on first show (Reanimated `withTiming`);
- the donut grows from 0;
- the swipe reveals delete in `danger`.

**Light and dark** come from the tokens, and each screen is checked in both.

## E · Server PR needed for a MUST (never merged; the owner decides)

**Page size.** Expenses and loans come 5 a page and incomes 12. A phone list
of 50 expenses would take 10 requests, and To receive / To pay must sum every
unpaid loan. The PR adds an **opt-in `per_page`** (capped at 100) to the
expenses, incomes and loans lists, with request specs. **Without the param,
nothing changes**, so the web is untouched. Until it is deployed, the phone
pages through what the server gives (infinite scroll still works, only
slower), and the loan totals walk every page.

Not needed: newest-first already holds for a new record (`updated_at desc`).
The contact link stays the name (B8 fills it from Contacts).

## F · How it is checked

The same bar as Todo:
- API and parser tests first, from the server's real shapes (money as strings, `0`, per-currency maps);
- every optimistic write tested both ways;
- screen tests, the i18n key tests and a11y;
- the full gates;
- every flow run on the emulator against the QA server with invented data;
- screenshots in light and dark at 360, 411 and 800 dp, beside the references, in one contact sheet.

## Summary: MUST / SHOULD / LATER

- **MUST:** F1–F24 (full web parity, two web bugs not copied), B1–B12 (keypad entry, month in place, charts, budgets, loans with payments, recurring, remembered currency, a person from Contacts, search and filter, Undo, swipe, haptics and offline). The server PR adds an opt-in `per_page`, never merged.
- **SHOULD:** B13 (trash screen), B14 (spend on the Home tile).
- **LATER:** B15 (receipts), B16 (splitting), B17 (accounts and transfers), B18 (bank sync), B19 (rollover and goals), B20 (currency conversion).
  - Each needs server work, and the web has none of them.
