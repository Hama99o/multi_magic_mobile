# Finance app: design references (Mobbin, iOS)

Reference screens for the Finance section of MultiMagic mobile (expenses, incomes, loans, budgets).
Images live in `references/` (gitignored, downloaded 2026-11-16). The Mobbin links are canonical and do not expire.
Picked by looking at the screens themselves, not their metadata.

---

## 1. Finance home / monthly overview

- **Monarch**: [mobbin](https://mobbin.com/screens/b00a6ecc-5e8e-4d63-968e-279012067c1c), `01-overview-monarch.jpg`
  - Take: the horizontal month strip (MAY JUN **JUL** AUG SEP, with the year under each, current month as a filled pill) as the month switcher. You can swipe across months and always see where you are. Below it, a Summary card with two rows (Income, Expenses), each with a thin bar and "earned / remaining" under it.
  - Not taken: the full-width red "Left to budget" alarm banner. Too loud for a home screen. We show the balance as a number, not as an alert.
- **Revolut**: [mobbin](https://mobbin.com/screens/b578103d-3eca-4520-b50f-1698113428d7), `01-overview-revolut.jpg`
  - Take: one hero number ("Left to spend $90.01", with the cents smaller), inside an open arc gauge, plus a status pill ("On track · This month"). Under it, a grouped list card with icon rows: Budget, Spent this month (with the transaction count), Upcoming, Left to spend (with "$3.91 / day").
  - Not taken: the all-black theme and the gauge as the only visual. Our home needs income vs spent side by side, not only one budget.
- **Rocket Money**: [mobbin](https://mobbin.com/screens/64db6b84-7887-41a3-a137-4a2df6d811bb), `01-overview-rocketmoney.jpg`
  - Take: a "This Month" selector with prev/next chevrons, then a big Spending card ("$91 over spending budget", a bar, "$262 spent / $171 budgeted") above two half-width cards (Bills, Earnings). This hierarchy (one main card, two small ones) suits a phone well.
  - Not taken: the "$0/day for 25d" warning chip with its exclamation badge. It is extra noise on day one.
- **Cleo**: [mobbin](https://mobbin.com/screens/a252fcfd-1c89-43d2-a090-7c70d5af3c5c), `01-overview-cleo.jpg`
  - Take: **In** and **Out** shown side by side as the two main figures, with the period ("February 1 to February 29") and "11 days left" under the title. Arrow buttons on the edges change the month. Large amounts with the cents in a smaller size.
  - Not taken: the 3D coin stacks, the mascot hand and the playful dark-blue theme. They do not fit a calm personal-data app.

## 2. Fast expense entry

- **GoPay**: [mobbin](https://mobbin.com/screens/48c5268d-ec50-4d7a-9c14-111ecc2e45ab), `02-entry-gopay.jpg`
  - Take: a custom in-app keypad (no system keyboard), with the date as a tappable chip in the header ("Thu, 13 Mar 2025 ▾"), a row of 3 frequent category icons plus "More", an optional "Add more details" note field, and one full-width primary button. Everything fits on one screen, so an expense takes three taps.
  - Not taken: the calculator operator column (÷ × − +) and the "000" key. Too much for personal spending.
- **Buddy**: [mobbin](https://mobbin.com/screens/c46ddd33-e05a-47be-a6de-ca10db402224), `02-entry-buddy.jpg`
  - Take: a bottom sheet with the amount centred at the top, an **Expense / Income / Transfer** segment under it, then rows for Category, Account, Note and Date (with ‹ › to step the day), and the keypad docked at the bottom. A single form for every kind of entry.
  - Not taken: the "From: Spending" wallet row with a swap button. We have no multi-account model.
- **Copilot**: [mobbin](https://mobbin.com/screens/73ba8b2d-9fd8-439b-b41f-35c62765e697), `02-entry-copilot.jpg`
  - Take: the date shown small above the title, the title as large text, the amount in green right below, and the category as a single small chip ("OTHER") you tap to change. A clear order: when, what, how much, which category.
  - Not taken: the coloured account card and the Expense/Refund toggle below Save. They add a second decision after the main button.
- **Splitwise**: [mobbin](https://mobbin.com/screens/639effbe-e37d-4613-bac3-3f34605e04ad), `02-entry-splitwise.jpg`
  - Take: the toolbar pinned above the keyboard ("Today", group, camera, note), so the secondary fields stay reachable without closing the keypad. A good pattern for date and note on our entry screen.
  - Not taken: the "Paid by you and split unequally" split logic on a plain expense. Splitting belongs to loans, not to expense entry.

## 3. Expense list grouped by day, with search and filter

- **Copilot**: [mobbin](https://mobbin.com/screens/39d3efee-7a8a-4fa5-ae15-1065a33dfae1), `03-list-copilot.jpg`
  - Take: dense single-line rows (name on the left, a coloured category chip with emoji, amount on the right) under uppercase day headers (TODAY, YESTERDAY, TUE, AUGUST 18). A rounded search field with a filter icon inside it, and a floating "+" button. Income rows show the amount in green.
  - Not taken: the gradient blue header and the top tab strip. Our app already has its own navigation.
- **Monzo**: [mobbin](https://mobbin.com/screens/2c2b2c81-2083-425b-aea7-aa3ea8bd861f), `03-list-monzo.jpg`
  - Take: the search results state: scope chips under the search field (Activity, Payees, Money), a "Filters" button with a count badge, and a summary at the top of the results ("Total spent £406.20, £25.38 on average"). Amounts use smaller cents.
  - Not taken: the merchant logos. We have no merchant data, so the row icon is the category icon.
- **Careem**: [mobbin](https://mobbin.com/screens/d5637068-8346-4354-9334-430e0f15df8f), `03-list-careem.jpg`
  - Take: the quick filter chips **All / Money In / Money Out** under the balance, grey day header bands with the day's net total on the right, and signed amounts ("+ 50", "- 36.26") coloured green or neutral.
  - Not taken: the "Benefit" cashback badges. They have no meaning for us.
- **Starling**: [mobbin](https://mobbin.com/screens/5f00713b-a76e-45eb-8ca6-694eb41fd744), `03-list-starling.jpg`
  - Take: each day as its own card, with the date on the left of the header and the day total on the right. The second line of a row shows "time · category". This makes the day an easy unit to scan.
  - Not taken: one card per single transaction. It wastes height when a day has many entries; we group all of a day's rows in one card.

## 4. Category breakdown chart for a month

- **Origin**: [mobbin](https://mobbin.com/screens/2d9ad60d-fc72-4c9c-a0d5-ac5c18ff4bc4), `04-breakdown-origin.jpg`
  - Take: a donut with rounded segments and gaps between them, the total in the middle ("$760, Spent this month"), and an **Expenses / Budget / Income** tab above it. The legend is a list of rows: a coloured round icon, the name, "% of expenses" under it, the amount on the right, then "See more".
  - Not taken: the monospaced uppercase headings. That is Origin's brand, not ours.
- **Buddy**: [mobbin](https://mobbin.com/screens/78cebd3c-0057-4ffd-8de6-ec9f8534515e), `04-breakdown-buddy.jpg`
  - Take: a compact card with a small donut on the left and the big total plus "$555 left to budget" on the right. Under it, a dotted-leader legend (Housing 40% ........ $2,450). A good compact version for the home screen.
  - Not taken: the single-hue teal palette. Categories need distinct colours to be told apart.
- **Revolut**: [mobbin](https://mobbin.com/screens/56d80261-ebab-49c4-aa2c-de9e23c41abb), `04-breakdown-revolut.jpg`
  - Take: the period segment under the ring (1W, 1M, 6M, 1Y), a chart-type switch at the top right (line, bars, ring), and "By Category ▾" rows showing the transaction count and the percentage under the amount.
  - Not taken: the 6-month default. Our breakdown is per month, with the month switcher.
- **Plum**: [mobbin](https://mobbin.com/screens/1676c328-6b4a-45f6-bae7-06c3ec1ed157), `04-breakdown-plum.jpg`
  - Take: a two-pill month toggle (Apr / **May**), then a ring with "Total spending £1,406.16, Since 1 May". Each category row has a full-width bar under it in the category colour, so the list doubles as a bar chart.
  - Not taken: the large empty space below a short list. We fill it with an empty-state hint or the category list.

## 5. Budgets with progress bars (over / under)

- **Copilot**: [mobbin](https://mobbin.com/screens/8fcfa6a7-f247-4a53-ab29-bab4255199bd), `05-budgets-copilot.jpg`
  - Take: a table-like layout with SPENT on the left, a bar in the middle and BUDGET on the right. The bar colour shows the state: green when under, orange when close, red when over. Categories without a budget sit under an "EXCLUDED" heading.
  - Not taken: tiny type and very tight rows. Our rows must stay readable at a glance with a thumb-size tap target.
- **YNAB**: [mobbin](https://mobbin.com/screens/08f77ff0-b724-48a8-8986-0a9da5143d00), `05-budgets-ynab.jpg`
  - Take: the amount left as a coloured pill on the right of each row (green when funded, grey at $0), with a full-width bar under the name and a status word ("Funded"). Swipe a row to reveal an action (here "Snooze Target"): our "Edit / Delete budget".
  - Not taken: the envelope "Ready to Assign" model. We track spending against a limit; we do not assign every unit of money.
- **Origin**: [mobbin](https://mobbin.com/screens/413f86df-ddd9-4956-8dfa-515256bd949d), `05-budgets-origin.jpg`
  - Take: an overall half-gauge on top ("25.3%, $760, of $3,000 budget") with "Edit budget". Then one card per category: icon and name, a thin bar, the percentage on the left and "$7 of $200" on the right. The "X of Y" wording is the clearest we found.
  - Not taken: the "View by" dropdown. One budget view is enough.
- **Starling**: [mobbin](https://mobbin.com/screens/58fe677d-26a9-4cc3-921e-0768225c9552), `05-budgets-starling.jpg`
  - Take: "Resetting in 12 days, on 27 Jul" at the top. Each tracker card leads with the **remaining** amount ("£50.00 remaining"), with "spent" and "budget" in small text at the two ends of the bar. A dashed "+ Create new tracker" card ends the list and doubles as the empty state.
  - Not taken: the cyan bar on every card whatever the state. We colour by state as Copilot does.

## 6. Loans / IOUs (lent vs borrowed, per person, detail with payments)

- **Splitwise, friends list**: [mobbin](https://mobbin.com/screens/b458ec73-3848-4060-b5c4-158e960dd49b), `06-loans-splitwise-friends.jpg`
  - Take: the one-line total at the top ("Overall, you owe **$180.00**"). One row per person with the status label above the amount on the right ("you owe" in orange, "owes you" in green), the reason in grey sub-lines under the name, and grey "settled up" or "no expenses" for people at zero.
  - Not taken: the group and "Add more friends" social features. Our loans are personal records and the other person is a contact, not a user.
- **Splitwise, person detail**: [mobbin](https://mobbin.com/screens/497254f8-4a8f-448a-bc3b-0d279d7979eb), `06-loans-splitwise-person.jpg`
  - Take: the person header with the net balance in colour, an action row (**Settle up** as the orange primary button, then Remind), and the history by month with a date column ("Nov 14"). Each row says "you lent" or "you borrowed" above the amount, and payments appear as their own thin rows ("You paid John D. $180.00"). A note marks where older settled entries are hidden.
  - Not taken: the email and "Resend invite" block, and the paid features (Charts, Convert). No account invitations in our app.
- **YNAB, loan detail**: [mobbin](https://mobbin.com/screens/f82cde3f-c4d8-4688-94ba-4f16096e79ef), `06-loans-ynab-loan.jpg`
  - Take: Overview / Activity tabs, a ring with "% Paid Off" in the centre, the balance next to Paid, then plain key/value rows (Monthly target, Due every, Debt free date). This is the right detail layout for one loan with a progress figure.
  - Not taken: the payoff projection ("pay off in 1 month"). Personal IOUs rarely have a fixed schedule.
- **Afterpay, payment schedule**: [mobbin](https://mobbin.com/screens/896a8f02-33b2-45e2-8d85-2d30cba028b8), `06-loans-afterpay-schedule.jpg`
  - Take: the vertical timeline for payment history. A filled dot for paid, a hollow dot for the next one, faded for cancelled, with "2 of 4 · Paid" under each date and the amount on the right. A full-width "Make a payment" button at the bottom becomes our "Add payment".
  - Not taken: the card or payment-method block. We record payments; we do not move money.

## 7. Recurring entries (subscriptions)

- **Origin**: [mobbin](https://mobbin.com/screens/3441dd7a-d41e-4406-950a-299684f6dc02), `07-recurring-origin.jpg`
  - Take: the list grouped by frequency (Biweekly, Monthly, Annual). Each row shows the name, the frequency and "Due on May 20", with "Due in 2 days" highlighted in amber when it is close. An **Inactive** section at the bottom is greyed out, and there is a ⋮ menu per row.
  - Not taken: the account filter pill. We do not have one.
- **Rocket Money**: [mobbin](https://mobbin.com/screens/c0278332-1359-4d05-bacc-d84692fc14f1), `07-recurring-rocketmoney.jpg`
  - Take: Upcoming / All tabs, and upcoming items as cards with relative dates ("in 18 days", "in 25 days"). A "Recent charges" section explains the last 7 days in one sentence. A confirmation toast ("Manual Bill Added") after saving.
  - Not taken: the red gradient header behind the list. It hurts contrast.
- **Copilot, recurring detail**: [mobbin](https://mobbin.com/screens/430efb0a-7ac5-42e1-a8e3-a3e7c46e3abe), `07-recurring-copilot.jpg`
  - Take: the rule written as a sentence with tappable values ("from $2 to $7 on any day of the month every month"), the next payment as a hero ("$9.00, expected around Sep 18th"), a small trend line for past months, and the matched past entries below. A bottom action bar: Rename / Edit / Delete.
  - Not taken: the fuzzy amount range and the name-matching rules. Our recurring entries have one fixed amount we set ourselves.
- **Monzo, scheduled**: [mobbin](https://mobbin.com/screens/3feb7d59-56c4-4d9a-a24e-372d32ae64e8), `07-recurring-monzo.jpg`
  - Take: Payments / **Scheduled** segment, a "Subscriptions & Direct Debits" card with "Monthly on 20th" under each name, the converted amount large and the original currency small under it, and a full-width "Add scheduled payment" button.
  - Not taken: the brand logos and the feedback banner.

## 8. Income list with pending / confirm

- **Quicken, income detail**: [mobbin](https://mobbin.com/screens/e910de78-f7e3-4415-b952-953709791f02), `08-income-quicken.jpg`
  - Take: the **Next** / **Past** split. The next expected income is a highlighted card ("+$5,000.00, In 4 days", with a ⋮ menu to confirm or edit). Past entries carry a small "Paid" badge. A 6-month bar row on top with an average line.
  - Not taken: the negative-axis bars (income drawn downward). That is confusing.
- **Upside**: [mobbin](https://mobbin.com/screens/a47af43f-7974-416a-b1bc-309b7fb22bfd), `08-income-upside.jpg`
  - Take: a month section header with the total on the right ("March 2025 earnings, $5.26 total"). Rows carry a status badge before the amount ("Processing" in grey, "Issues found" in amber), and a pending row shows no amount until it is confirmed. A good model for "pending" vs "received".
  - Not taken: the gamified bonus card with a flame progress bar.
- **Lightyear**: [mobbin](https://mobbin.com/screens/402552aa-1295-465c-b24c-280430475fae), `08-income-lightyear.jpg`
  - Take: a **Pending** section pinned above Today / This week, with a clock badge on the row icon and the expected time as the sub-line ("Arrives today by 19:00"). Signed amounts ("+£4.28") with the original amount small under it. Cancelled items are struck through.
  - Not taken: the floating search/menu pill at the bottom. It hides the last row.
- **Shopee**: [mobbin](https://mobbin.com/screens/be030dd2-dd8f-49ed-8323-8ab1276176d2), `08-income-shopee.jpg`
  - Take: top tabs **All / Pending** for quick triage, with "Est." in front of an amount that is not yet final and an orange "Processing" label under it. This is how we mark an income as expected but not confirmed.
  - Not taken: the second row of type tabs (Buy / Sell / Dividend). Too many filters for a personal income list.

---

## Patterns that recur across apps

- **One hero number, cents smaller.** Every overview leads with one large amount (left, spent or balance), with the decimals in a smaller size (Revolut, Cleo, Monzo). Supporting figures sit in a grouped list or card under it.
- **Month as the unit, switched in place.** A month strip, a pill toggle or ‹ › chevrons sit at the top of the overview, breakdown and budget screens, and the period text ("Since 1 May", "11 days left") sits next to the total.
- **Day-grouped lists with day totals.** Uppercase or banded day headers ("TODAY", "YESTERDAY", then the date), with the day's total right-aligned. Rows show the name, then "time · category", then a signed amount.
- **Colour is the sign.** Green for money in or "owes you"; neutral or dark for money out; orange or red only for over budget and "you owe". Most apps never colour plain expenses red.
- **Chips for quick filters, a sheet for the rest.** All / In / Out or All / Pending chips stay visible. Everything else goes behind a "Filters" button with a count badge.
- **Progress = bar + "X of Y" + state colour.** Budgets and loans both use a thin bar or ring, the phrase "$7 of $200" or "% paid off", and a green, amber or red state. Leading with the *remaining* amount reads better than leading with the spent amount.
- **Entry is one sheet with its own keypad.** The amount is centred at the top, a type segment (Expense / Income) and a category chip or icon row sit under it, date and note go in a strip above the keypad, and one primary button saves.
- **Pending is a section, not a filter.** Expected incomes and upcoming recurring items are pinned above confirmed history, with relative dates ("in 4 days") and a muted status badge.
- **Person-centric loans.** Net per person, with "you lent" or "you borrowed" written above each amount, payments shown as their own rows in the history, and one primary "Settle up / Add payment" action.
- **Toasts confirm saves.** A short bottom toast ("Expense saved", "Transaction added") instead of a modal, so the user stays in the flow.
