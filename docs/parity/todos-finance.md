# Parity audit: Todos and Finance (web vs mobile 1.3.0)

Read-only audit, 2026-11-20.

- **Web:** `~/Apps/Personal/multi_magic`, `app/javascript/pages/{todos,finance}/**`. The local checkout is `master` e9adf512 (10 Nov), which is stale. `origin/master` f66f85ab (18 Nov) changes **no web UI file** in these two apps since the inventory commit 0986d1e4. It changes only the API: `77ff7aa3` adds `remind_at` to todos, and `9de42498` (PR #28) adds an opt-in `per_page` to the finance lists. So the web line numbers below hold for `origin/master`.
- **Mobile:** `~/Apps/Personal/mm-parity-audit` at 4dd5e8f (`release(1.3.0)`).
- **Status keys:** "HAS" means the mobile app has the feature. "PARTIAL" means some of it is missing. "MISSING" means mobile has no equivalent.
- Paths are relative to `pages/` on the web side and to the repo root on the mobile side.

---

## 1. Todos

### Summary

| HAS | PARTIAL | MISSING |
|---|---|---|
| 33 | 1 | 0 |

Mobile covers every web Todos feature. The one PARTIAL is cosmetic: the "All done" badge on a list card.

Mobile goes well beyond the web here. It has the Today, Upcoming and Overdue views, task search, swipe actions with Undo, quick-add chips and reminders.

Owner-rule findings (see §3) are separate from parity:
- Reanimated `entering` animations on FlatList cells in 4 places.
- Lists are newest first. Lists are ordered `updated_at desc` and templates `created_at desc`, so a new list is on top. Tasks keep the user's own order, which is the point of drag-to-reorder.

### Table

| # | Feature | Web file:line | Mobile | Note |
|---|---|---|---|---|
| T1 | Lists as cards: name, done/total, progress bar | todos/components/GroupCard.tsx:76-106 | HAS app/todos/index.tsx:231-258 | Row with a ProgressRing and "3 of 5" |
| T2 | Overdue badge on the card | GroupCard.tsx:84-88 | HAS index.tsx:259-265 | |
| T3 | "All done" badge when done === total | GroupCard.tsx:89-97 | PARTIAL index.tsx:250-256 | The ring is full and the row reads "5 of 5", but there is no explicit "All done" label or check |
| T4 | Preview of 3 tasks with "+N more" | GroupCard.tsx:108-145 | HAS index.tsx:268-280 | |
| T5 | Tick a task from the card preview (optimistic) | GroupCard.tsx:23-63 | HAS index.tsx:270, src/screens/todos/useTodoMutations.ts | |
| T6 | Empty-list hint on the card | GroupCard.tsx:146 | HAS index.tsx:256 (`noTasksYet`) | |
| T7 | Search list names (400 ms debounce) | todos/Index.tsx:71-85 | HAS index.tsx:116-131 | Mobile also searches tasks (300 ms) |
| T8 | Header buttons: Templates and New list | Index.tsx:58-67 | HAS index.tsx:111 (templates), :168 (FAB) | |
| T9 | Loading skeleton, LoadError with Retry, empty state with a CTA | Index.tsx:88-104 | HAS index.tsx:134, :147, :324-350 | |
| T10 | New list (name required, Enter submits) | components/CreateGroupDrawer.tsx:27-78 | HAS index.tsx:178-189 (NameDialog) | Mobile then opens the new list |
| T11 | Global-search hit opens the list on that task (`?task=`) | Index.tsx:27-29; GroupDrawer.tsx:72-78, :344-347 | HAS app/todos/list.tsx:106-111, :235; src/lib/inAppRoute.ts:127-133 | |
| T12 | Rename the list inline | GroupDrawer.tsx:230-284 | HAS list.tsx:268, :278-290 | Via ⋯ › Rename |
| T13 | done/total and a progress bar in the list | GroupDrawer.tsx:285-289 | HAS list.tsx:172-178, :302-313 | |
| T14 | Clear completed (shown when done > 0) | GroupDrawer.tsx:292-297 | HAS list.tsx:271, :138-143 | Mobile asks for confirmation; the web does not |
| T15 | Reset the list (uncheck all) | GroupDrawer.tsx:298-303 | HAS list.tsx:270 | |
| T16 | Duplicate the list | GroupDrawer.tsx:304-307 | HAS list.tsx:272 | Mobile opens the copy |
| T17 | Save as template | GroupDrawer.tsx:308-311 | HAS list.tsx:273 | |
| T18 | Add a task (Enter adds, the field stays) | GroupDrawer.tsx:316-325 | HAS list.tsx:246; src/screens/todos/QuickAdd.tsx:58-127 | Mobile adds Today, Tomorrow, date and priority chips |
| T19 | Task loading and empty states | GroupDrawer.tsx:328-336 | HAS list.tsx:187, :316-333 | |
| T20 | Tick / untick | GroupDrawer.tsx:352-358 | HAS src/screens/todos/TaskRow.tsx:198; list.tsx:118-124 | Mobile adds a 600 ms linger and swipe right |
| T21 | Edit a task title inline | GroupDrawer.tsx:360-368 | HAS src/screens/todos/TaskSheet.tsx:145-156 | In the task sheet |
| T22 | Priority dot on the row | GroupDrawer.tsx:372-374 | HAS TaskRow.tsx:223 | Shown as a flag |
| T23 | Due chip: red when overdue, amber within 2 days | GroupDrawer.tsx:34-43, :376-382 | HAS TaskRow.tsx:215; src/screens/todos/due.ts:16-21 | |
| T24 | Detail: priority chips none/low/medium/high | GroupDrawer.tsx:402-414 | HAS TaskSheet.tsx:185-197 | |
| T25 | Detail: due date with a clear button | GroupDrawer.tsx:415-424 | HAS TaskSheet.tsx:175-176 (DueChooser) | |
| T26 | Detail: notes (saved on blur) | GroupDrawer.tsx:425-427 | HAS TaskSheet.tsx:161-170 | |
| T27 | Delete a task | GroupDrawer.tsx:391-394 | HAS list.tsx:125-130; TaskSheet.tsx:209 | Mobile adds swipe and Undo |
| T28 | Drag to reorder (SortableJS) | GroupDrawer.tsx:193-215 | HAS list.tsx:189-195, :269; src/screens/todos/DragList.tsx | A reorder mode, plus Move up/down in the sheet |
| T29 | Delete the list with an inline confirm | GroupDrawer.tsx:249, :436-446 | HAS list.tsx:131-137, :274 | Alert naming the list and its count |
| T30 | Templates: hint, list, empty state, loading | components/TemplatesDrawer.tsx:138-155 | HAS app/todos/templates.tsx:50, :58, :69-77 | |
| T31 | Template row: repeat badge, item count, first items, next run | TemplatesDrawer.tsx:164-185 | HAS templates.tsx:86-105 | |
| T32 | Template form: name, one task per line, repeat (none/daily/weekly/monthly) × interval, recurrence hint | TemplatesDrawer.tsx:88-132 | HAS app/todos/template.tsx:199-270 | A stepper instead of a number field |
| T33 | Use / Edit / Delete a template | TemplatesDrawer.tsx:186-197 | HAS templates.tsx:110-112, :34-44 | Mobile opens the new list and confirms Delete |
| T34 | Recurring templates make lists on their own | server `generate_due_for!` (todo_groups#index) | HAS (server side) | |

### Mobile has, the web lacks

- **Today / Upcoming / Overdue:** cards on the home screen and a grouped view (app/todos/due.tsx, src/screens/todos/due.ts).
- **Task search:** it searches tasks as well as list names (index.tsx:66, :286-322).
- **Swipe actions:** swipe right completes and swipe left deletes, with Undo (TaskRow.tsx, src/stores/todoUndo.store.ts).
- **Done (n) fold:** finished tasks fold away under "Done (n)" (list.tsx:213-228).
- **Quick-add chips:** Today, Tomorrow, a date and priority (QuickAdd.tsx:76-90).
- **Reminders:** `remind_at` with local notifications (TaskSheet.tsx:180-181, src/screens/todos/reminders.ts, useReminderSync.ts). The API is on `origin/master` (77ff7aa3), but the web has no UI for it.
- **Infinite paging of lists:** the web shows only page 1 (20 lists, Index.tsx:34-40).
- **Small extras:** haptics, and confirmation before Clear completed and before deleting a template.

### Deferred in the mobile SPEC (docs/design/todos/SPEC.md §B)

None of these is a web feature. The SPEC gives the reason as "Each needs new server work, and the web has none of them."

| Item | SPEC status |
|---|---|
| B13 Subtasks | LATER |
| B14 Per-task repeat | LATER |
| B15 Move a task to another list | LATER: "refused on purpose (`todo_params`, the IDOR note) … needs its own endpoint checking both lists" |
| B16 Labels | LATER |
| B17 Widget / Siri | LATER |
| B18 Quick add from Today | SHOULD, **not built** |
| B19 Sort a list by date or priority | SHOULD, **not built** |
| B20 Natural-language dates | SHOULD, **not built** |

### Missing items and endpoints

- **T3 "All done" badge.** Client only; no endpoint needed (it uses `completed_count` and `todos_count` from `GET /todo_app/todo_groups`).
- **API gap: none for parity.** The SPEC's "PR #27 not merged" note is out of date: `remind_at` is on `origin/master` (77ff7aa3). Whether it is deployed to production was NOT MEASURED.

### Size

| Work | Dev-days |
|---|---|
| T3 | 0.1 |
| Owner list-animation rule (§3) on the 4 Todos lists | ~0.3 |
| Device QA | 0.25 |
| **Total** | **~0.5–0.75** |

---

## 2. Finance

### Summary

| HAS | PARTIAL | MISSING |
|---|---|---|
| 62 | 5 | 2 |

The two MISSING items:
- **F-D10:** the Overview's "Active loans" list. The web Dashboard shows up to 5 unpaid loans. SPEC F7 promised "a Loans card with the 3 nearest due", and it was not built.
- **F-X3:** links from the assistant or global search to a specific expense, income or loan. `src/lib/inAppRoute.ts` has no mapping for `/finance/...`.

The five PARTIAL items:
- **F-E5:** no "All years" (all-time) filter.
- **F-E6:** you cannot step to a future month or year.
- **F-E13:** an entry's date cannot be left empty.
- **F-L4:** "Loans total" (the sum of the original amounts) is replaced by To receive / To pay.
- **F-B1:** budgets list oldest first, which breaks the owner's newest-first rule.

### Table

**Layout and help**

| # | Feature | Web file:line | Mobile | Note |
|---|---|---|---|---|
| F-A1 | Title, and tabs Dashboard / Expenses / Income / Loans / Budgets / Tags | finance/Layout.tsx:31-91 | HAS app/finance/index.tsx:45-83 | Five tabs; Categories moves to ⋯ |
| F-A2 | Help dialog with 8 sections and the multi-currency tip | Layout.tsx:44-54; components/HelpDialog.tsx:112-122 | HAS src/screens/finance/HelpSheet.tsx:13, :35 | Opened from ⋯ › Help |
| F-A3 | Legacy routes `/finance/recurring` and `/finance/reports` | routes/AppRoutes.tsx:157-159 | HAS app/finance/recurring.tsx, reports.tsx | Separate screens |

**Dashboard**

| # | Feature | Web file:line | Mobile | Note |
|---|---|---|---|---|
| F-D1 | Sub-tabs Overview / Reports | Dashboard.tsx:67-88, :178-190 | HAS index.tsx:93 (Reports in ⋯) | |
| F-D2 | Scope: This month / This year | Dashboard.tsx:69-76, :194-210 | HAS src/screens/finance/tabs/Overview.tsx:75 (PeriodSwitcher) | Mobile also reaches past months |
| F-D3 | KPI: total expenses (all currencies) | Dashboard.tsx:217-223 | HAS Overview.tsx:77-86 | Dominant currency large, the rest beneath |
| F-D4 | KPI: income and net | Dashboard.tsx:224-237 | HAS Overview.tsx:94-95 | |
| F-D5 | KPI: number of expenses | Dashboard.tsx:238-243 | HAS Overview.tsx:88-89 | |
| F-D6 | KPI: To receive / To pay with "N active" | Dashboard.tsx:244-258 | HAS Overview.tsx:101-102 | Sums every unpaid loan; the web sums only page 1 (a web bug, not copied) |
| F-D7 | Top 4 budgets with green/amber/red bars, and "Manage budgets" | Dashboard.tsx:262-305 | HAS Overview.tsx:105-128 | |
| F-D8 | Income vs expenses chart (12 months, dominant currency) | Dashboard.tsx:309-330 | HAS Overview.tsx:131-145 | |
| F-D9 | Totals over time (12 months or 10 years) | Dashboard.tsx:333-356 | HAS Overview.tsx:147-158 | |
| F-D10 | **Active loans list** (5 unpaid: contact, type, due date, remaining "of" amount) | Dashboard.tsx:444-475 | **MISSING** | The Overview has only the two total cards and a "Recent" card of expenses (Overview.tsx:161-172) |
| F-D11 | By-category donut with amount and % legend | Dashboard.tsx:358-370; components/PieChart.tsx | HAS Overview.tsx:266-320 | Uses each row's currency (the web always shows €) |
| F-D12 | By-subcategory donut from a category picker | Dashboard.tsx:372-420 | HAS Overview.tsx:270-288 | Tap a slice to drill down |
| F-D13 | Whole-page LoadError when the summary fails | Dashboard.tsx:166-168 | HAS Overview.tsx:355-365 | One retry per card |

**Reports**

| # | Feature | Web file:line | Mobile | Note |
|---|---|---|---|---|
| F-R1 | Year select (current +5 to −9), and month or "Whole year" | reports/ReportsPanel.tsx | HAS app/finance/reports.tsx:45-46, :72 | PeriodSwitcher; no future years (see F-E6) |
| F-R2 | Three stat cards: income, expenses, net | ReportsPanel.tsx (StatCard) | HAS reports.tsx:84-86 | |
| F-R3 | Spend by category (`by_tag`) | ReportsPanel.tsx | HAS reports.tsx:90-110 | |
| F-R4 | Export: from/to, then Expenses / Incomes / Loans × CSV / Excel / PDF | ReportsPanel.tsx:24, :63 | HAS reports.tsx:48-56, :120-139 | Shared through expo-sharing |

**Expenses**

| # | Feature | Web file:line | Mobile | Note |
|---|---|---|---|---|
| F-E1 | Segments All / One-time / Recurring | expenses/Index.tsx:25-30, :137-148 | HAS src/screens/finance/Ledger.tsx:157 (One-time chip); Recurring at app/finance/recurring.tsx | Recurring moves to ⋯ |
| F-E2 | Search (400 ms) | expenses/Index.tsx | HAS Ledger.tsx:73-76, :146-154 | |
| F-E3 | Category filter (tree) | components/FinanceFilters.tsx:25-35 | HAS Ledger.tsx:156, :215 (TagPicker single) | |
| F-E4 | Year / month filter, defaulting to this month | FinanceFilters.tsx:36-60 | HAS Ledger.tsx:60-61, :145 | |
| F-E5 | **"All years" / all-time list** | FinanceFilters.tsx:39 (`allYears`), :47 (`allMonths`) | **PARTIAL** Ledger.tsx:78 always sends `year` | Mobile reaches a whole year but never all-time |
| F-E6 | Future periods (years up to current +5) | FinanceFilters.tsx:36-45 | **PARTIAL** src/screens/finance/parts.tsx:68-77 | "Next" is disabled at the current month, so a future-dated expense cannot be listed by period (search still finds it) |
| F-E7 | Totals bar: per-currency totals and "N entries" | components/TotalsBar.tsx; expenses/Index.tsx:184 | HAS Ledger.tsx:165-174 | |
| F-E8 | Cards: item, amount, tags, date, label chips | expenses/components/ExpenseCard.tsx:12-44 | HAS Ledger.tsx:223-287 | Day-grouped, with day totals |
| F-E9 | Paging (Prev / Next, 5 a page) | expenses/Index.tsx:219 | HAS Ledger.tsx:138-140 | Infinite scroll with `per_page` |
| F-E10 | Export to Excel with the current filters, disabled at 0 | expenses/Index.tsx:77-125 | HAS Ledger.tsx:107-114, :159-163; src/api/finance.ts:466 | |
| F-E11 | View: item, amount, tags, date, currency, description; Edit; Delete (inline confirm) | expenses/components/ExpenseDrawer.tsx:200-240 | HAS Ledger.tsx:290-345 | Delete is immediate, with Undo through `restore` |
| F-E12 | Form: item\*, amount\* (≤ 99,999,999.99), currency (8), tags (multi, search, create inline, a sub adds its parent), description | ExpenseDrawer.tsx:250-328; components/TagMultiSelect.tsx | HAS app/finance/entry.tsx:89-210; parts.tsx:306-411 | Mobile adds a keypad and remembers the last currency |
| F-E13 | Date is optional (`spent_at` may be empty) | ExpenseDrawer.tsx:69, :317-318 | **PARTIAL** entry.tsx:58, :174 | Always a day; it cannot be left empty or cleared |
| F-E14 | Empty / loading / error states | expenses/Index.tsx | HAS Ledger.tsx:175-182, :347-367 | |

**Recurring expenses**

| # | Feature | Web file:line | Mobile | Note |
|---|---|---|---|---|
| F-RE1 | Hint and "Add recurring" | recurring/RecurringPanel.tsx | HAS recurring.tsx:136 | |
| F-RE2 | Client-side category filter, per-currency total and count | components/FinanceRecurringSummary.tsx:25-72 | HAS recurring.tsx:85-95 | |
| F-RE3 | Rows: item, amount, tag, "Every N months", "Next on" or Paused (dimmed) | RecurringPanel.tsx:78-142 | HAS recurring.tsx:152-200 | |
| F-RE4 | Pause / Resume (`active`) | RecurringPanel.tsx:30-34, :133 | HAS recurring.tsx:54, :131, :191 | |
| F-RE5 | Form: item, amount, currency, every N + unit, start date, category, description; delete with confirm | recurring/components/RecurringDrawer.tsx | HAS app/finance/recurring-edit.tsx:58-170, :88 | Mobile adds a backfill warning |

**Income**

| # | Feature | Web file:line | Mobile | Note |
|---|---|---|---|---|
| F-I1 | Segments All / Recurring | income/Index.tsx:126 | HAS (Recurring screen, incomes segment) recurring.tsx:73 | |
| F-I2 | Pending "To confirm": editable amount, Confirm, Discard with confirm | income/components/PendingIncomeSection.tsx:11-127; income/Index.tsx:130 | HAS src/screens/finance/tabs/Income.tsx:30-97 | |
| F-I3 | Search, filters, totals, cards with "+" in green, paging | income/Index.tsx:150-198; components/IncomeCard.tsx | HAS Ledger.tsx (kind=income) | The same F-E5 and F-E6 PARTIALs apply; they are counted once |
| F-I4 | View and form: source\*, amount\*, currency, tags, received date, description | income/components/IncomeDrawer.tsx | HAS entry.tsx (kind toggle :102), Ledger.tsx:290 | The same F-E13 PARTIAL applies |
| F-I5 | Recurring income: "~" estimate, Run now, Pause / Resume, form | income/RecurringIncomePanel.tsx:26-163; components/RecurringIncomeDrawer.tsx | HAS recurring.tsx:55, :131; recurring-edit.tsx | |

**Loans**

| # | Feature | Web file:line | Mobile | Note |
|---|---|---|---|---|
| F-L1 | Active / Paid tabs | loans/Index.tsx:87 | HAS src/screens/finance/tabs/Loans.tsx:141-142 | |
| F-L2 | Search | loans/Index.tsx | HAS Loans.tsx:151-163 | |
| F-L3 | Filters: type (lent / borrowed) and category | loans/Index.tsx:33, :126-131 | HAS Loans.tsx:144-146 | |
| F-L4 | **"Loans total" bar** (sum of the original amounts) | loans/Index.tsx:151 | **PARTIAL** Loans.tsx:137-138 | Replaced on purpose by To receive / To pay (remaining amounts), so the original-amount total is not shown |
| F-L5 | Cards: direction, contact, type, remaining with "/ total", % paid bar, due date, label chips | loans/components/LoanCard.tsx:1-80 | HAS Loans.tsx:300-370 | Overdue in danger; initials avatar |
| F-L6 | Paging | loans/Index.tsx:186 | HAS (infinite) Loans.tsx:180-200 | |
| F-L7 | Loan view header: type, remaining, "of", bar, % · total paid | loans/components/LoanDrawer.tsx | HAS app/finance/loan.tsx:190-220 | |
| F-L8 | Loan view fields: contact, due date, tags, status, description | LoanDrawer.tsx:260-290 | HAS loan.tsx:115-123 | |
| F-L9 | Payments list with delete (confirm) | LoanDrawer.tsx:143, :300-335 | HAS loan.tsx:125-160, :74 | |
| F-L10 | Add payment (hidden when paid): amount and date | LoanDrawer.tsx:131, :344 | HAS loan.tsx:165, :255-300 | "Pay the rest" chip; the overpay error is shown |
| F-L11 | Loan Edit / Delete (soft, confirm) | LoanDrawer.tsx:378 | HAS loan.tsx:60, :86-95 | Undo through `restore` |
| F-L12 | Form: lent / borrowed, contact name\*, amount, currency, due date, tags (create inline), description | LoanDrawer.tsx (form) | HAS app/finance/loan-edit.tsx:65-262, :282 | Plus a Contacts picker |

**Budgets**

| # | Feature | Web file:line | Mobile | Note |
|---|---|---|---|---|
| F-B1 | Budget cards in server order (`created_at ASC`) | budgets/Index.tsx:66-120 | **PARTIAL (owner rule)** src/screens/finance/tabs/Budgets.tsx:32-49 | Same order as the web, but a new budget lands at the **bottom**, which breaks "newest first" |
| F-B2 | Card: name or "Overall", period, amount, bar, spent %, remaining in red | budgets/Index.tsx:72-113 | HAS Budgets.tsx:60-100 | |
| F-B3 | Tap to edit, Add, empty state | budgets/Index.tsx:63 | HAS Budgets.tsx:47, :54 | |
| F-B4 | Form: category or overall, amount, currency, period; delete with confirm; server error shown | budgets/components/BudgetDrawer.tsx | HAS src/screens/finance/manage/BudgetSheet.tsx:56-138 | Save is disabled at 0 (the server needs > 0); the web allows 0 |

**Categories (tags)**

| # | Feature | Web file:line | Mobile | Note |
|---|---|---|---|---|
| F-T1 | Categories and their subcategories | tags/Index.tsx:160-260 | HAS app/finance/categories.tsx:52, :92-140 | Drill-down with a subcategory count |
| F-T2 | Add a category or subcategory | tags/Index.tsx | HAS categories.tsx:46, :145 | |
| F-T3 | Rename inline | tags/Index.tsx | HAS categories.tsx:47, :133 | |
| F-T4 | Delete with a confirm (cascades) | tags/Index.tsx:307 | HAS categories.tsx:63 | The Alert names what is lost |
| F-T5 | Empty states (no categories / pick a category / no subcategories) | tags/Index.tsx:171, :235, :260 | HAS categories.tsx:101-103 | |

**Cross-cutting**

| # | Feature | Web file:line | Mobile | Note |
|---|---|---|---|---|
| F-X1 | Toasts: saved, deleted, error, confirmed, launched, payment added | throughout | HAS (UndoToast and failure text) | |
| F-X2 | Locale-aware months and money (en/fr) | utils.ts | HAS parts.tsx:51 (`useMoney`) | |
| F-X3 | **A link opens a record**: `?expense=<id>`, `?income=<id>`, `?loan=<id>` | Layout.tsx:66 (`useDrawerParam`); server app/services/frontend_routes.rb:34-38, search/sources.rb:115-135 | **MISSING** src/lib/inAppRoute.ts:52-133 has no finance keys or paths | A search hit or assistant link to an expense, income or loan returns null, i.e. "only on the web" |
| F-X4 | All writes refetch every finance query | throughout | HAS src/screens/finance/useFinanceMutations.ts | |

### Mobile has, the web lacks

- **Trash:** expenses, incomes and loans can be restored or deleted forever (app/finance/trash.tsx). The API exists, but the web has no screen.
- **Undo after delete:** through `restore`, plus swipe-to-delete.
- **Faster entry and browsing:**
  - an amount keypad (parts.tsx:116), with the last currency remembered (lastCurrency.ts);
  - date chips (Today / Yesterday);
  - the most-used categories as chips.
- **Loan extras:** a Contacts picker for the loan's person (loan-edit.tsx:298-380), and "Pay the rest".
- **Day-grouped lists with day totals.**
- **Any past month on the Overview:** the web shows only "this" month or year.
- **To receive / To pay over all loans:** the web sums page 1 only.
- **Correct chart currency:** charts in each row's own currency (the web always shows €).

### Deferred in the mobile SPEC (docs/design/finance/SPEC.md §B)

| Item | SPEC status |
|---|---|
| B15 Receipt photo | LATER |
| B16 Split with people | LATER |
| B17 Accounts / transfers | LATER |
| B18 Bank sync | LATER |
| B19 Rollover / goals | LATER |
| B20 Currency conversion | LATER |

Reason given: "Each needs server work, and the web has none of them." None is a web feature.

Two items in the SPEC disagree with the code:
- **SPEC F7** says "Overview: a Loans card with the 3 nearest due, then See all". It was **not built** (F-D10).
- **SPEC §E** says the server PR is "never merged". `per_page` is on `origin/master` (9de42498, PR #28). Whether it is deployed is NOT MEASURED.

### Missing items and the endpoints they need

| Item | What to build | Endpoints | API gap? |
|---|---|---|---|
| F-D10 Active loans on the Overview | A card with up to 5 unpaid loans (or the 3 nearest due, per the SPEC): contact, type, due date, remaining "of" amount; tap opens `/finance/loan?id=` | `GET /api/v1/my_finance_app/loans` (unpaid, `per_page`). `financeApi.loans.outstanding` (finance.ts:513) already walks every unpaid loan and could return the rows | None |
| F-X3 Links to expense / income / loan | Map `/finance/expenses?expense=`, `/finance/income?income=`, `/finance/loans?loan=` and the keys `expense`, `income`, `loan`, `expenses`, `incomes` in inAppRoute.ts. Open the entry sheet by id (it now needs the row object), or route to `/finance/loan?id=` | `GET /expenses/:id`, `GET /incomes/:id`, `GET /loans/:id` (already in finance.ts:444, :473, :496) | None |
| F-E5 All-time list | An "All" mode in PeriodSwitcher that sends no `year`/`month` (the server then lists every date) | `GET /expenses`, `GET /incomes` (`year` optional) | None |
| F-E6 Future periods | Allow "next" up to current +5 years, as the web does | — | None |
| F-E13 Optional date | A "No date" chip, sending `spent_at: null` / `received_at: null`; the Ledger already groups undated rows (Ledger.tsx:44-48) | `POST`/`PUT /expenses`, `/incomes` | None |
| F-L4 Original-amount total | Optional: show `meta.totals` (`Page.totals`) under the list | `GET /loans` meta | None |
| F-B1 Newest first | Sort budgets by `id desc` on the client (the list is not paged; `created_at` is not serialized) | — | Optional server change: `order(created_at: :desc)` and serialize `created_at` |

**API gaps.** Nothing blocks parity. The owner's newest-first rule would want two server changes:
- `created_at desc` for expenses, incomes and loans. They are now `updated_at desc`: editing an old record moves it to the top.
- `created_at` in the serializers, so a client can sort by it.

There is no `sort` parameter on any finance endpoint (WEB_INVENTORY.md §3).

### Size

| Work | Dev-days |
|---|---|
| F-D10 | 0.5 |
| F-X3 | 0.75 |
| F-E5 + F-E6 | 0.5 |
| F-E13 | 0.25 |
| F-L4 | 0.1 |
| F-B1 | 0.1 |
| Owner list-animation rule (§3) on 6 Finance lists, including the swipe transforms | ~0.75 |
| Device QA at 360/411/800, light and dark | 1 |
| **Total** | **~4** |

---

## 3. Owner-rule findings (not parity, but he would reject them)

1. **Reanimated `entering` animations on cells of FlatList / SectionList.** The owner's 2026-11-17 rule ("Mobile lists") forbids them. 10 places:
   - Todos: app/todos/index.tsx:239, list.tsx:231, due.tsx:117, templates.tsx:85.
   - Finance: Ledger.tsx:196, tabs/Loans.tsx:192, tabs/Budgets.tsx:49, app/finance/categories.tsx:111, recurring.tsx:130, trash.tsx:114.

   Ledger.tsx:228-257 also puts a `translateX` transform on the swipe of a list cell; Loans.tsx probably does the same, which was inferred and not checked.

   1.3.0 was written on 2026-11-16, one day before the rule. The list.tsx comment (lines 199-203) already records a device bug from layout animations, and `entering` stayed in.
2. **Newest first.**
   - **Budgets:** `created_at ASC`, oldest first. This breaks the rule (F-B1).
   - **Expenses / income:** `updated_at desc` from the server, then re-grouped by spent day on the phone. A back-dated new expense sits in its own day's group, not on top. Grouping by day while paging by `updated_at` can also move sections as more pages load. This is inferred from the code and NOT MEASURED on a device.
   - **Recurring rules:** soonest next date. **Categories:** A–Z.
   - These are deliberate orders. The rule says such an order should be a sort option, not the default, so this needs the owner's call.
   - **Todos lists and templates** comply. **Tasks** keep the user's own order.
