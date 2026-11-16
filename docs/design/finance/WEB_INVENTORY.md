# MultiMagic WEB Finance: feature + API inventory (for RN parity)

Source: multi_magic `origin/master` (0986d1e4) (read with `git show`, nothing modified).
Server: `config/routes.rb` (namespace `my_finance_app`, around lines 87-135), `app/controllers/api/v1/my_finance_app/*.rb`, `app/controllers/concerns/finance_{labelable,period_filterable}.rb`, `app/models/my_finance_app/*.rb`, `app/serializers/my_finance_app/*.rb`, `app/serializers/tag_serializer.rb`, `app/controllers/application_controller.rb` (`paginate_render`, error handlers).
Web: `app/javascript/pages/finance/**`, `app/javascript/types/finance.ts`, `app/javascript/routes/AppRoutes.tsx`, `app/javascript/services/http.service.ts`.

Base path: `/api/v1/my_finance_app`. Every endpoint is scoped to `current_user`; another user's id gives 404.

---

## 0. Cross-cutting conventions (read first)

### Transport
- Web `http.service.ts` **camelizes every JSON response** (`camelizeKeys`) and **decamelizes request bodies**. So the web types (`types/finance.ts`) are camelCase, but **the wire format is snake_case**. Everything below is the wire format.
- Headers the web sends: `Authorization: <token>` (raw token from localStorage), `X-Device-Fingerprint`, `Accept-Language` (app language; it localizes the server's error sentences).
- Request bodies are wrapped in a root key: `expense`, `income`, `loan`, `loan_payment`, `budget`, `recurring_expense`, `recurring_income`, `tag`.
- Binary downloads (exports) are not camelized. The filename comes from `Content-Disposition`.

### Money: amounts are STRINGS in JSON
- The columns are `decimal`, and Rails encodes BigDecimal as a **JSON string**. No Oj and no `encode_big_decimal_as_string` override exist, so you get Rails' default: `"amount": "12.5"`. BigDecimal#to_s drops trailing zeros, so you get `"12.5"`, not `"12.50"`; `"0.0"` for zero.
- That covers record `amount`, loan `remaining_amount`, budget `spent`/`remaining`, all `meta.totals` values, pie `amount`s and `total_spend` values, bar `data[]`, report totals, `by_tag[].amount` and loan payment `amount`.
- **Mixed types happen:** `reports/cash_flow` fills months with no data with the integer `0` and months with data with a string (`"120.0"`). `loan.total_paid` is the integer `0` when there are no payments (a Ruby `[].sum`) and a string otherwise. `net` in reports can be a string or `0`.
- The web parses every amount with `toNumber()` / `parseFloat`. RN must do the same: type money as `number | string`.
- When sending, the web sends numbers (`Number(data.amount)`). An empty amount is sent as `0`.
- Precision / max: expense, income, budget and recurring `decimal(10,2)`, max **99_999_999.99**; loan `decimal(15,2)`, max **9_999_999_999_999.99**; loan_payment `decimal` (no scale).
- `amount_with_currency` is a server string: `"#{amount} #{currency}"`, e.g. `"12.5 eur"` (lowercase code, not formatted). The web never displays it.

### Currency
- **There is no user-level currency setting.** The `users` table has no currency column. Users have `lang` (default `"en"`) but nothing about money. The currency lives **per record**.
- Enum (same on Expense, Income, Loan, Budget, RecurringExpense, RecurringIncome): `eur:0, usd:1, gbp:2, afn:3, pkr:4, inr:5, jpy:6, cny:7`. JSON is the lowercase string. DB default `eur`. Every web form defaults to `'eur'`.
- Web symbols (`types/finance.ts` `CURRENCY_SYMBOLS`): eur `€`, usd `$`, gbp `£`, afn `؋`, pkr `₨`, inr `₹`, jpy `¥`, cny `¥`.
- `formatMoney(amount, currency='eur')` in `pages/finance/utils.ts`: `sign + symbol + abs(n).toLocaleString(i18n.language, {min/max 2 fraction digits})`. The minus goes before the symbol (`-€1.49`). Always 2 decimals, even for JPY. NaN shows `—`. The locale is the app language, not the device locale.
- Currencies are **never summed together**. Every total is a `{ "<currency>": amount }` map. The web shows a multi-currency total as `€12.00 · $5.00` (`TotalsBar`, `formatTotals`) and drops zero entries.
- For the time-series charts, the Dashboard picks a **"dominant currency"**: the key with the largest `total_spend` from `pie_chart_data_by_tag`, falling back to `eur`.
- An unknown enum value (e.g. `currency: "chf"`) raises ArgumentError. The server turns it into **422 `{ "message": ["'chf' is not a valid currency"] }`**.

### Dates
- `spent_at`, `received_at`, `payment_date`, `deleted_at` are `datetime`. They serialize as ISO 8601, e.g. `"2026-07-03T00:00:00.000Z"`. The web sends a plain `"YYYY-MM-DD"`, which becomes UTC midnight because the app has no `config.time_zone`.
- The web shows them with `formatDate`, using `timeZone: 'UTC'` so a day doesn't shift west of Greenwich. To edit, it takes `value.split('T')[0]`.
- `due_date` (loan), `start_date`, `next_occurrence_on`, `last_generated_on` (recurring) are `date`: `"2026-07-03"`.
- `spent_at` and `received_at` are optional. Period filters, reports, budgets and charts use **`COALESCE(spent_at|received_at, created_at)`**. `created_at` and `updated_at` are **not serialized** for expenses, incomes, loans, budgets or recurring rules.

### Pagination (pagy 9, `ApplicationController#paginate_render`)
- Query: `page` (1-based). `per_page` is **fixed per endpoint on the server**, and the client cannot change it.
- A page past the end is clamped to the last page (no error).
- Paginated response shape:
  ```json
  { "<root>": [ ... ],
    "meta": { "totals": {"eur": "123.45"},          // only on expenses/incomes/loans lists
              "pagy": { "page": 1, "pages": 3, "count": 14, "limit": 5, "prev": null, "next": 2,
                        "last": 3, "from": 1, "to": 5, "series": [...], "...url keys": "..." },
              "total_count": 14 } }
  ```
  The `pagy` hash comes from pagy's `metadata` extra with default keys. The web reads only `meta.pagy.page`, `meta.pagy.pages`, `meta.total_count` and `meta.totals`.
- `meta.totals` is a per-currency sum over the **whole filtered set**, not just the current page.

### Errors (shapes differ by endpoint!)
- Model validation failure on create/update (expenses, incomes, loans, budgets, recurring_*): **422 with `record.errors` as a hash**, e.g. `{ "amount": ["must be greater than or equal to 0"] }`. This is NOT the `{message}` shape.
- `render_unprocessable_entity` (destroy/restore failures, enum errors): 422 `{ "message": ["..."] }`.
- Tags create/update failure: 422 `{ "error": "Failed to create tag" }` / `{ "error": "Failed to update tag" }`. This includes a duplicate name; no detail is given.
- Loan payment failure: 422 `{ "status": "error", "errors": ["Amount must be less than or equal to 40.0"] }`.
- Not found: 404 `{ "message": "<localized>" }`. Expenses, loans and tags `set_*` give 404 `{ "error": "Expense not found" | "Loan not found" | "Tag not found" }`.
- Missing required param (e.g. no `expense` root): 422 `{ "message": "<localized missing_param>" }`.
- Pundit forbidden: 403 `{ "message": "...", "code": "forbidden" }`.
- The web shows `common.error` for most failures. The budget drawer shows `message` when it is present.

### Tags vs labels (important model)
- One `tags` table (STI `type = 'MyFinanceApp::Tag'`) with `parent_id`. A top-level tag is a **category**; a child is a **subcategory**. There are two levels (the web only builds depth 0/1).
- Every Expense, Income and Loan has:
  - `tag_id`: the single primary category (`category` = its name),
  - Expense only: `subcategory_id`,
  - many-to-many **labels** through `my_finance_app_taggings` (`label_ids` in, `labels` [{id,name}] + `label_ids` out).
- `label_ids` goes **inside the root object** (`expense[label_ids]`). It is not in `permit`; a separate concern reads it (`FinanceLabelable#apply_labels`). Labels are touched **only if the key is present**. `[]` clears them. Ids that aren't the user's own tags are dropped silently. Ids are coerced with `to_i`, zeros are dropped and duplicates removed.
- The `tag_id` filter on lists matches the primary `tag_id` **OR** any label (a subquery, so totals are not inflated). It does **not** match `subcategory_id`, unless that subcategory is also a label, which the web always makes it.
- How the web builds a submit (`ExpenseDrawer.onSubmit`): the user picks N tags in one multi-select (`TagMultiSelect`). Selecting a sub-tag auto-adds its parent first. Then:
  - Expense: `subTag` = first selected tag with a parent. `tag_id = subTag.parent_id ?? label_ids[0] ?? null`, `subcategory_id = subTag?.id ?? null`, `label_ids` = **all selected ids** (the primary and the sub are included as labels too).
  - Income / Loan: `tag_id = label_ids[0] ?? null`, `label_ids` = all selected.
  - Editing seeds the picker with `tagIdsOf(entity)` = unique `[tag_id, subcategory_id, ...label_ids]`.
  - Display: `collectTags(tag, subcategory, ...labels)` deduped by id. The first is shown as "category"; the rest are chips (`LabelChips`).
- Budgets, recurring rules and the loan/recurring category filters use **only top-level tags** in a plain `<select>` (`financeTagsApi.list()` with no params = parents only).

---

## 1. Endpoints

### 1.1 Expenses (`ExpensesController`)
Model `MyFinanceApp::Expense`. Status enum `trashed:0, published:1` (DB default `trashed`, but create forces `published`). Expenses created by a recurring rule have `recurring_expense_id` set.

**Serializer `MyFinanceApp::ExpenseSerializer`** (every expense response):
```
id, item, description, amount, currency, spent_at, deleted_at, tag_id, subcategory_id, recurring_expense_id,
category        // tag&.name (string|null)
tag             // TagSerializer hash | null
subcategory     // TagSerializer hash | null
amount_with_currency  // "12.5 eur"
labels          // [{id, name}]
label_ids       // [int]
```
No `status`, `created_at` or `updated_at` in the serialized expense.

| Method | Path | Params | Response |
|---|---|---|---|
| GET | `/expenses` | `page`, `search`, `filter=one_time` (only that value; anything else = all), `tag_id`, `year` (1970-2100), `month` (1-12, only with year), `period=month\|year` (relative to today, ignored if `year` given) | `{ expenses: [...], meta: {totals, pagy, total_count} }`, **per_page 5** |
| GET | `/expenses/trashes` | `page`, `search` (no other filters) | same shape, per_page 5, status trashed |
| GET | `/expenses/:id` | | `{ expense: {...} }` |
| POST | `/expenses` | `expense: { item, amount, description, tag_id, currency, subcategory_id, spent_at, label_ids[] }` | 201 `{ expense }`; 422 errors hash |
| PUT | `/expenses/:id` | same permitted keys (partial OK) | `{ expense }` |
| DELETE | `/expenses/:id` | | soft delete: `status: trashed, deleted_at: now`. Returns the **raw model JSON with no root** (`{id, user_id, item, amount, ..., status: "trashed"}`) |
| DELETE | `/expenses/:id/destroy_permanently` | | `{ expense: <raw model> }` (uses `delete`, so callbacks are skipped and taggings are NOT cleaned) |
| PUT | `/expenses/:id/restore` | | raw model JSON, no root (`status: published, deleted_at: nil`) |
| GET | `/expenses/export` | same filters as index + `search` + `file_format=csv\|xlsx\|pdf` (default **xlsx**) | binary file. Rows oldest first (`COALESCE(spent_at, created_at) ASC`), with a totals footer. Title/filename `"Expenses 2026-07"` / `"Expenses 2026"` / `"Expenses"`, parameterized to `expenses-2026-07.xlsx`. Columns: `Item Amount Currency Category Subcategory Labels Description Date` |
| GET | `/expenses/pie_chart_data_by_tag` | `period=month\|year` or `year`/`month` (none = all-time) | `{ chart_data: [{category, currency, amount}], total_spend: {cur: amount} }`. `chart_data` covers only tagged expenses (by primary tag); `total_spend` includes untagged ones. Published only. |
| GET | `/expenses/pie_chart_data_by_subcategories` | `tag_id` (required, the user's tag; else 404 `{error:'Tag not found'}`) + period params | same shape. Grouped by subcategory name + currency, over expenses whose primary `tag_id` = that tag and that have a subcategory |
| GET | `/expenses/total_expenses_last_years_or_months` | `chart_type=years` (else months), `currency` (optional; **if omitted, currencies are summed together**) | `{ labels: ["2025-12","2026-01",...] or ["2017",...], data: [amount,...] }`. Months = last 12 months, years = last 10 years, **only buckets that have data, with no zero fill**, sorted chronologically |

- Validations: `amount` numeric `>= 0` and `<= 99_999_999.99`. `item` is `null: false` in the DB with **no model presence validation**: `""` is accepted, and a missing or null item gives a DB error (500). Send a non-empty item (the web requires it client-side).
- Search (`pg_search` tsearch, prefix): `item`, `description`, tag `name`.
- Side effect: GET `/expenses` and `/expenses/export` first run `RecurringExpense.generate_due_for!(current_user)`, which materializes due recurring occurrences.

### 1.2 Incomes (`IncomesController`)
Status enum `trashed:0, published:1, pending:2`.

**Serializer `IncomeSerializer`**:
```
id, source, description, amount, currency, received_at, deleted_at, tag_id, status, recurring_income_id,
category, tag (TagSerializer|null), amount_with_currency, labels [{id,name}], label_ids
```
(Incomes have no subcategory. Unlike expenses, `status` is included.)

| Method | Path | Params | Response |
|---|---|---|---|
| GET | `/incomes` | `page`, `search`, `tag_id`, `year`, `month`, `period=month\|year` | `{ incomes, meta: {totals, pagy, total_count} }`, **per_page 12**, published only |
| GET | `/incomes/pending` | none | `{ incomes: [...] }` **not paginated**, ordered `received_at ASC` |
| GET | `/incomes/trashes` | `page`, `search` | paginated, per_page 12 |
| GET | `/incomes/:id` | | `{ income }` |
| POST | `/incomes` | `income: { source, amount, description, tag_id, currency, received_at, label_ids[] }` | 201 `{ income }` |
| PUT | `/incomes/:id` | same | `{ income }` |
| PUT | `/incomes/:id/confirm` | `income: { amount, received_at }` (both optional) | sets `status: published`. Returns `{ income }` |
| DELETE | `/incomes/:id` | | soft delete. Raw model, no root |
| DELETE | `/incomes/:id/destroy_permanently` | | `{ income: <raw> }` (uses `destroy`) |
| PUT | `/incomes/:id/restore` | | raw model, no root |

- Validations: `source` presence; `amount` `>= 0`, `<= 99_999_999.99`.
- Search: `source`, `description`, tag `name`.
- Side effect: GET `/incomes` runs `RecurringIncome.generate_due_for!`.
- **Pending is effectively legacy:** current recurring generation creates `published` incomes, never `pending` (see the model comment). Only old rows can be pending. The cron yml description still says "(pending)". The endpoint and the web UI still exist.

### 1.3 Loans (`LoansController`) + loan payments
Enums: `loan_type`: **`given:0` (money lent: they owe me, "To receive"), `taken:1` (money borrowed: I owe, "To pay")**. `status`: `trashed:0, paid:1, unpaid:2`.

**Serializer `LoanSerializer`**:
```
id, description, due_date, amount, contact_name, loan_type, status, currency, tag_id, total_paid, remaining_amount,
category,                 // tag name
loan_payments,            // [{id, loan_id, amount, payment_date, created_at, updated_at}] (raw as_json), sorted by payment_date||created_at ASC
amount_with_currency, labels [{id,name}], label_ids
```
NB: unlike expense and income, there is **no nested `tag` object**, only `tag_id` + `category`. `total_paid` = sum of payments. `remaining_amount` = `amount - total_paid`.

| Method | Path | Params | Response |
|---|---|---|---|
| GET | `/loans` | `page`, `search`, `loan_type=given\|taken`, `tag_id` | **status unpaid only**. `{ loans, meta:{totals, pagy, total_count} }`, **per_page 5**. `totals` = sum of `amount` (the original amount, NOT the remaining amount) per currency |
| GET | `/loans/paid` | same | status paid |
| GET | `/loans/trashes` | same | status trashed |
| GET | `/loans/:id` | | `{ loan }` |
| POST | `/loans` | `loan: { loan_type, amount, currency, due_date, description, tag_id, contact_name, status, label_ids[] }` | 201 `{ loan }` (create forces `status: unpaid`) |
| PUT | `/loans/:id` | same | `{ loan }`. After the update the server **recomputes status**: `remaining_amount <= 0` gives `paid`, else `unpaid` (so a `status` you send is overridden; it would even un-trash a trashed loan) |
| DELETE | `/loans/:id` | | soft delete (`trashed`). Raw model, no root |
| DELETE | `/loans/:id/destroy_permanently` | | `{ loan: <raw> }` (destroys its payments) |
| PUT | `/loans/:id/restore` | | sets **`unpaid`** (even if fully paid, until the next update). Raw model |
| POST | `/loans/:id/create_payment` | `loan_payment: { amount, payment_date }` | 200 `{ status: "success", loan: {...serialized} }`, then the status is recomputed. 422 `{ status:"error", errors:[...] }` |
| GET | `/loans/pie_chart_data_by_contact_name` | `status` (required), `loan_type` (required) | `{ chart_data:[{category: contact_name, currency, amount}], total_spend:{cur: amount} }`. **Not used by the web UI** |
| DELETE | `/loan_payments/:id` | | `{ message: "Payment deleted successfully" }`. Recomputes the loan status (it can go back to unpaid) |

- Validations: loan `amount` `>= 0`, `<= 9_999_999_999_999.99`. `contact_name` has no server validation (the web requires it). Payment `amount > 0` and `<= outstanding` (`loan.amount - other payments`), with a row lock against concurrent overpayment.
- Search: `contact_name`, `description`, `amount`, tag `name`.
- **Contacts linkage:** the DB has `contact_id` and `belongs_to :contact`, but **`contact_id` is not permitted and not serialized**. The link is only the free-text `contact_name`. The web uses a plain text input (no contact picker).
- There is no edit endpoint for a payment (only create and delete).

### 1.4 Budgets (`BudgetsController`)
Enum `period`: `monthly:0, yearly:1`. `tag_id` is nullable: **null = overall budget** (all expenses in that currency).

**Serializer `BudgetSerializer`**: `id, amount, currency, period, tag_id, tag (TagSerializer|null), spent, remaining`.
- `spent` = sum of the user's **published** expenses in the **same currency**, with **primary `tag_id` = budget.tag_id** (labels and subcategory are not counted), and `COALESCE(spent_at, created_at)` in the **current** month (monthly) or year (yearly). It is computed live.
- `remaining` = `amount - spent` (can be negative).

| Method | Path | Params | Response |
|---|---|---|---|
| GET | `/budgets` | none | `{ budgets: [...] }` not paginated, **ordered `created_at ASC`** |
| POST | `/budgets` | `budget: { amount, tag_id, currency, period }` | 201 `{ budget }` |
| PUT | `/budgets/:id` | same | `{ budget }` |
| DELETE | `/budgets/:id` | | `{ budget: <raw model> }` |
| (no GET show) | | | |

- Validations: `amount > 0` (strict; the web allows 0 client-side, so the server rejects it). `tag_id` unique per `[user_id, period, currency]`, plus partial unique DB indexes for both the null and non-null tag cases. So you can't have two "overall monthly EUR" budgets.

### 1.5 Recurring expenses (`RecurringExpensesController`)
Enum `frequency`: **`weekly:0, monthly:1, yearly:2, daily:3`** (note the order: daily is 3). `interval_count` is an integer >= 1 (e.g. monthly + 3 = every 3 months).

**Serializer**: `id, item, description, amount, currency, frequency, interval_count, start_date, next_occurrence_on, last_generated_on, active, tag_id, subcategory_id, tag (TagSerializer|null), subcategory (TagSerializer|null)`.

| Method | Path | Params | Response |
|---|---|---|---|
| GET | `/recurring_expenses` | none | `{ recurring_expenses: [...] }` not paginated, **ordered `next_occurrence_on ASC`**. Generates due occurrences first |
| GET | `/recurring_expenses/:id` | | `{ recurring_expense }` |
| POST | `/recurring_expenses` | `recurring_expense: { item, amount, description, tag_id, subcategory_id, currency, frequency, interval_count, start_date, active }` | 201. **Immediately generates every occurrence from `start_date` up to today** (a past start date backfills expenses) |
| PUT | `/recurring_expenses/:id` | same | changing `start_date` or `frequency` resyncs `next_occurrence_on`: it resumes after `last_generated_on` if the rule has generated before, else picks the first occurrence on or after today (no backfill). Changing only `interval_count` does NOT resync |
| DELETE | `/recurring_expenses/:id` | | `{ recurring_expense: <raw> }`. Past expenses are kept (`recurring_expense_id` set to null) |

- Validations: `item` presence, `amount >= 0` (no max validation in the model, though the column is decimal(10,2)), `start_date` presence, `interval_count` integer `>= 1`. `active` default true.
- Generated expenses: `status: published`, `spent_at = occurrence date at 00:00`, with tag/subcategory/currency/description copied. No labels are copied.
- Generation runs lazily (GET expenses / recurring_expenses / export) and through the Sidekiq cron (`config/sidekiq_cron.yml`).
- There is **no "run now" for recurring expenses** (only incomes have it).

### 1.6 Recurring incomes (`RecurringIncomesController`)
Same frequency enum. **Serializer**: `id, source, description, amount, currency, frequency, interval_count, start_date, next_occurrence_on, last_generated_on, active, tag_id, tag`.

| Method | Path | Params | Response |
|---|---|---|---|
| GET | `/recurring_incomes` | none | `{ recurring_incomes }`, ordered `next_occurrence_on ASC`. Generates due ones first |
| GET | `/recurring_incomes/:id` | | `{ recurring_income }` |
| POST | `/recurring_incomes` | `recurring_income: { source, amount, description, tag_id, currency, frequency, interval_count, start_date, active }` | 201, and generates due occurrences (published incomes) |
| PUT | `/recurring_incomes/:id` | same | |
| POST | `/recurring_incomes/:id/run` | none | 201 `{ income: IncomeSerializer }`. Creates one published income **dated now**, repeatable, and leaves the schedule untouched. Works even if the rule is paused |
| DELETE | `/recurring_incomes/:id` | | `{ recurring_income: <raw> }`. Past incomes are kept |

- Validations: `source` presence, `amount >= 0`, `start_date` presence, `interval_count >= 1`.

### 1.7 Tags (`TagsController`, serializer `TagSerializer`)
**TagSerializer**: `id, name, created_at, parent_id, position, description, color`. `color` is an enum string: `no_color, red, orange, yellow, green, teal, blue, purple, pink, gray` (the finance web never uses `color`, `description` or `position`).

| Method | Path | Params | Response |
|---|---|---|---|
| GET | `/tags` | none = **top-level only**; `parent_id=X` = that parent's children; `all=true` = every tag, **ordered by name**; `search` (tsearch prefix on name); `page` | `{ tags: [...], meta: {pagy, total_count} }`. per_page **50**, or **500** with `all`. Without `all`, no explicit ORDER BY (DB order) |
| POST | `/tags` | `tag: { name, parent_id }` | **200** (not 201) `{ tag }`; 422 `{error:'Failed to create tag'}` |
| PUT | `/tags/:id` | `tag: { name, parent_id }` | `{ tag }`; 422 `{error:'Failed to update tag'}` |
| DELETE | `/tags/:id` | | `{ tag: <raw> }` |

- Validations: `name` presence. Uniqueness is case-insensitive within `[user_id, parent_id, type]`.
- Delete semantics: subcategories are **destroyed** (`Tag has_many :subcategories, dependent: :destroy`). Expenses, incomes, loans and recurring rules are **detached** (nullify). Budgets on that tag are **destroyed**. Taggings (labels) are removed.
- The web's `financeTagsApi.listAll()` loops pages (`all=true&page=n`) until `page >= pages`, with a cap of 50 pages.

### 1.8 Reports (`ReportsController`)
| Method | Path | Params | Response |
|---|---|---|---|
| GET | `/reports/summary` | `year` (default current), `month` (optional 1-12) | `{ year, month (null if absent), totals: { expenses:{cur:amt}, incomes:{cur:amt}, net:{cur:amt} }, by_tag: [{tag, currency, amount}] }`. `by_tag` covers only expenses by primary tag, sorted by amount desc. Published only, `COALESCE` date |
| GET | `/reports/cash_flow` | `currency` (invalid or missing gives `eur`) | `{ currency, labels: ["2025-12",...,"2026-11"] (12 months ending this month), expenses: [...12], incomes: [...12] }`. Single currency; missing months are integer `0` |
| GET | `/reports/export` | `resource=expenses\|incomes\|loans` (required, else 400 `{message}`), `file_format=csv\|xlsx\|pdf` (default **csv**; NOT `format`), `from`, `to` (ISO dates; the range applies only if both parse, and they are swapped if reversed) | binary. Loans ignore the range and include all non-trashed loans. Columns: expenses as in 1.1; incomes `Source Amount Currency Category Description Date`; loans `Type Contact Amount Currency Status "Due date" "Total paid" Description` |

---

## 2. Web screens and features (checklist)

Routes (`routes/AppRoutes.tsx`): `/finance` redirects to `/finance/dashboard`. Children: `dashboard`, `expenses`, `income`, `loans`, `budgets`, `tags`. Legacy redirects: `/finance/recurring` goes to `/finance/expenses?view=recurring`, and `/finance/reports` goes to `/finance/dashboard?view=reports`.

### 2.0 Layout (`pages/finance/Layout.tsx`, `components/HelpDialog.tsx`)
- [ ] Header: "Finance" title with a wallet icon, and a **Help** button that opens `HelpDialog`. The dialog has 8 sections (dashboard, expenses, recurring, income, loans, budgets, reports, tags) plus a multi-currency tip ("never added together").
- [ ] Tab bar (scrolls horizontally): Dashboard, Expenses, Income, Loans, Budgets, Tags.
- Detail drawers are URL-driven (`lib/useDrawerParam`): `?expense=new|<id>`, `?income=...`, `?loan=...`. Opening `<id>` fetches `GET /:resource/:id`. A shared link reopens the drawer. Budgets and recurring rules use local drawer state instead.

### 2.1 Dashboard (`pages/finance/Dashboard.tsx`; components `StatCard`, `BarChart`, `CashFlowChart`, `PieChart`)
- [ ] Sub-tabs **Overview / Reports** (`?view=reports`).
- [ ] Scope toggle **This month / This year** (default month; there is no all-time option). It drives everything below.
- [ ] KPI cards:
  - Total expenses: `formatTotals(pie_chart_data_by_tag(period).total_spend)`, with the hint "all currencies".
  - Total income: `reports/summary(year, month|null).totals.incomes`.
  - Net cash flow: `summary.totals.net`.
  - Expenses count: `GET /expenses?period=<scope>`, `meta.total_count`.
  - To receive: sum of `remaining_amount` of unpaid `given` loans, per currency, with "N active".
  - To pay: the same for `taken` loans.
  - **Web bug:** both loan cards use `GET /loans` (page 1 only, **per_page 5**), so they sum only the 5 most recently updated unpaid loans. For RN, compute over all pages or ask for a server aggregate.
- [ ] Budget progress: the top 4 budgets by spent/amount ratio. Each shows the name (`tag.name` or "Overall budget"), "spent / amount" and a bar coloured green (<80%), amber (>=80%) or red (>=100%), capped at 100% width. Link "Manage budgets" goes to `/finance/budgets`.
- [ ] **Income vs expenses** chart: `reports/cash_flow?currency=<dominant>`. 12 monthly paired bars (income green, expense red), labels via `shortPeriodLabel` ("Jul", plus "Jan 26" at year boundaries).
- [ ] **Totals over time** bar chart: `expenses/total_expenses_last_years_or_months?chart_type=months|years&currency=<dominant>`. Month scope gives the last 12 months; year scope gives the last 10 years. Bar colour is a hash of the label.
- [ ] **By category** donut: `pie_chart_data_by_tag?period=`. Labels get " · USD" only when there are several currencies. Slice and legend show amount + %. NB: the donut formats amounts with `formatMoney(v)`, i.e. **always €** (a web quirk).
- [ ] **By subcategory** donut: a category dropdown (top-level tags) feeds `pie_chart_data_by_subcategories?tag_id&period`. The empty state says "pick a category".
- [ ] **Active loans** list: up to 5 unpaid loans with contact, type label and due date, remaining in green (given) or amber (taken), "of <amount>".
- [ ] If the expense list or summary fails to load, the whole page shows `LoadError` with Retry (rather than misleading zeros).

### 2.2 Reports (sub-tab, `pages/finance/reports/ReportsPanel.tsx`)
- [ ] Year select (current +5 down to -9) and Month select ("Whole year" or month names in the app language). Default is the current year and month.
- [ ] 3 stat cards: total income, total expenses, net (per currency, `·`-joined) from `reports/summary`.
- [ ] Spend by category list: `by_tag` rows (`tag`, amount in its currency).
- [ ] Export: From/To date inputs (default the current month's first and last day). Then, for each of Expenses / Incomes / Loans ("all time" note on loans), buttons **CSV / Excel / PDF** call `GET /reports/export?resource&file_format&from&to` and download.

### 2.3 Expenses (`pages/finance/expenses/Index.tsx`, `components/ExpenseCard.tsx`, `components/ExpenseDrawer.tsx`, `components/FinanceFilters.tsx`, `components/TotalsBar.tsx`)
- [ ] Segments **All / One-time / Recurring** (`?view=one_time|recurring`). One-time sends `filter=one_time`. Recurring shows `RecurringPanel` (2.4).
- [ ] Search box (400 ms debounce), sends `search`.
- [ ] Filters (`FinanceFilters`):
  - Category (all tags, parents with indented `└ child`), sends `tag_id`.
  - Year ("All years", or current+5 down to current-6), sends `year`.
  - Month ("All months" + names; disabled when the year is "All"), sends `month`.
  - **Defaults: current year + current month** ("this month"). Changing any filter resets the page to 1.
- [ ] TotalsBar: per-currency `meta.totals` and "N entries" (`meta.total_count`), shown when the count is above 0.
- [ ] Card grid: item, amount (`formatMoney` in the record currency), first tag name (or `category`), date (`spent_at`), extra tag chips.
- [ ] Pagination: Previous / "Page x of y" / Next (5 per page).
- [ ] **Export to Excel** button: `GET /expenses/export` with the same search/filter/tag/year/month and `file_format=xlsx`. Disabled when the count is 0.
- [ ] Add expense opens the drawer in create mode.
- [ ] Drawer **view mode**: item, big amount, Tags chips, Spent at, Currency (uppercase), Description; buttons Delete (inline confirm: soft delete, `DELETE /expenses/:id`) and Edit.
- [ ] Drawer **form**: Item* (required), Amount* (number, step 0.01, min 0, max 99,999,999.99), Currency select (8 codes), Tags (multi-select with search, **inline "Create '<name>'"** that POSTs a top-level tag, and sub-tag selection that adds its parent), Spent at (date, optional), Description (textarea).
- [ ] Empty state: "Add your first expense". Loading skeletons. Load error with Retry.
- [ ] Not on web: trash list, restore and permanent delete for expenses. The API exists, but **no web screen uses `/expenses/trashes`, `/restore` or `/destroy_permanently`**.

### 2.4 Recurring expenses (Expenses, Recurring segment: `pages/finance/recurring/RecurringPanel.tsx`, `recurring/components/RecurringDrawer.tsx`, `components/FinanceRecurringSummary.tsx`)
- [ ] Hint text ("due occurrences are added to your expenses automatically") and an "Add recurring" button.
- [ ] A category filter (top-level tags) that is **client-side**, and a per-currency total of rule amounts with a count (TotalsBar).
- [ ] Cards: item, amount, tag name, frequency label ("Monthly", or "Every 3 months" when `interval_count > 1`), "Next on <next_occurrence_on>" or "Paused". Paused cards are dimmed.
- [ ] Pause / Resume button: `PUT {active: !active}`.
- [ ] Drawer: Item*, Amount*, Currency, **Repeat every** [interval_count number] [unit select: day(s)/week(s)/month(s)/year(s), order daily, weekly, monthly, yearly], Start date* (default today), Category (top-level select, "No category"), Description. Delete has an inline confirm.
- [ ] The web never sends `subcategory_id` for recurring rules, though the API accepts it.

### 2.5 Income (`pages/finance/income/Index.tsx`, `components/IncomeCard.tsx`, `components/IncomeDrawer.tsx`, `components/PendingIncomeSection.tsx`)
- [ ] Segments **All / Recurring** (`?view=recurring`).
- [ ] **Pending ("To confirm") section** at the top, when `GET /incomes/pending` is non-empty. It shows "N income to confirm" and, per row: source, "Due <received_at>", the currency code, and an editable amount pre-filled from the estimate.
  - **Confirm** calls `PUT /incomes/:id/confirm {income:{amount}}`.
  - **Discard** (X, then an inline confirm) calls `DELETE /incomes/:id/destroy_permanently`.
- [ ] Search, then `FinanceFilters` (category/year/month, **defaults to the current month**), then TotalsBar (success tone), then a card grid (12 per page): source, **`+` amount in green**, tag, `received_at`, chips. Then pagination.
- [ ] Drawer view: source, amount, tags, Received at, currency, description; Delete (soft) / Edit.
- [ ] Drawer form: Source*, Amount*, Currency, Tags multi-select (inline create), Received at (date), Description.
- [ ] Not on web: income trash or restore.

### 2.6 Recurring income (`pages/finance/income/RecurringIncomePanel.tsx`, `components/RecurringIncomeDrawer.tsx`)
- [ ] Hint and "Add recurring income". Client-side category filter and total.
- [ ] Cards: source, **`~` estimated amount**, tag, frequency label, Next on / Paused.
- [ ] **Run now** button: `POST /recurring_incomes/:id/run`, with the toast "income launched". **Pause/Resume**: `PUT {active}`.
- [ ] Drawer: Source*, **Estimated amount***, Currency, Repeat every [n][unit], Start date*, Category (top-level), Description. Delete with confirm.

### 2.7 Loans (`pages/finance/loans/Index.tsx`, `components/LoanCard.tsx`, `components/LoanDrawer.tsx`)
- [ ] Tabs **Active (unpaid)** / **Paid**, which call `GET /loans` or `GET /loans/paid`.
- [ ] Search. Filters: **loan type** (All / Money lent = `given` / Money borrowed = `taken`) sends `loan_type`; category (top-level tags) sends `tag_id`.
- [ ] TotalsBar "Loans total": `meta.totals`, which is the **sum of original amounts**, not the remaining amounts.
- [ ] Cards: direction icon (given: arrow up-right, green; taken: arrow down-left, amber), contact name, type label, **remaining** big with "/ total" below, a progress bar of paid/amount with "N% paid", due date, label chips. Then pagination (5 per page).
- [ ] Drawer **view** (re-fetches `GET /loans/:id` while open):
  - Header: type, remaining big, "of <amount>", a progress bar, "N% paid · <total paid>".
  - Fields: contact name, due date, tags (chips, or `category`), status label (Paid/Unpaid/Trashed), description.
  - **Payments list** ("Payments (n)"): each shows the amount (in the loan currency) and `payment_date`, plus an X button with an inline confirm that calls `DELETE /loan_payments/:id`. Empty state: "No payments".
  - **Add payment** box (hidden when status is paid): amount + date (default today), which calls `POST /loans/:id/create_payment {loan_payment:{amount, payment_date}}`. Overpaying is rejected by the server (the web shows a generic error).
  - Delete (soft, with inline confirm) / Edit.
- [ ] Drawer **form**: Loan type radio (Money lent / Money borrowed), **Contact name*** (free text), Amount* (max 9,999,999,999,999.99), Currency, Due date, Tags multi-select (inline create), Description. Edit also sends the current `status`.
- [ ] Not on web: loans trash, restore, permanent delete, the `pie_chart_data_by_contact_name` chart, and a contact picker or link to the Contacts app.

### 2.8 Budgets (`pages/finance/budgets/Index.tsx`, `components/BudgetDrawer.tsx`)
- [ ] Grid of budget cards (in server order, `created_at ASC`). Each card shows:
  - the name (`tag.name` or "Overall budget"),
  - the period label (Monthly/Yearly),
  - the amount,
  - a progress bar (green / amber at 80% / red at 100%),
  - "Spent <spent> (<pct>%)", in red when at or over 100%,
  - "Remaining <remaining>", in red when negative.
- [ ] Tap a card to edit. "Add budget" creates one. Empty state.
- [ ] Drawer: Category select (top-level tags; empty = "Overall budget", with the hint "leave empty for an overall budget across all categories"), Amount*, Currency, Period (monthly/yearly). Delete with inline confirm. The server's error `message` is shown in the toast.

### 2.9 Tags (`pages/finance/tags/Index.tsx`)
- [ ] Two columns: **Categories** (top-level) and **Subcategories** of the selected category. Data comes from `listAll()` (`all=true`, sorted by name) and is split client-side.
- [ ] Add a category (input + "+" or Enter): `POST {name, parent_id:null}`. Add a subcategory: `POST {name, parent_id}`.
- [ ] Inline rename (pencil; Enter saves, Escape cancels): `PUT /tags/:id {tag:{name}}`.
- [ ] Delete (trash icon, then a `ConfirmDialog`): `DELETE /tags/:id`. This cascades to children and budgets.
- [ ] Empty states: "No categories", "Pick a category to manage its subcategories", "No subcategories".

### 2.10 Shared
- [ ] All writes invalidate every `['finance', ...]` query, so everything refetches.
- [ ] Toasts: saved / deleted / error, and income-specific ones (`incomeConfirmed`, `incomeLaunched`, `paymentAdded`).
- [ ] Locale: month names and number formatting follow the app language (en/fr).

---

## 3. Default ordering of each list (server) and the "newest first" gap

| List | Server ORDER BY | Newest first? |
|---|---|---|
| `GET /expenses`, `/expenses/trashes` | **`updated_at DESC`** (with `search`, pg_search's rank comes first, then updated_at) | No. It is "last edited first", not created-first; editing an old expense moves it to the top, and a back-dated new expense still appears on top |
| `GET /incomes`, `/incomes/trashes` | `updated_at DESC` | same caveat |
| `GET /incomes/pending` | `received_at ASC` | oldest due first |
| `GET /loans`, `/loans/paid`, `/loans/trashes` | `updated_at DESC` | same caveat. Adding a payment updates the loan (status update), so it can jump to the top |
| `GET /budgets` | `created_at ASC` | **oldest first** |
| `GET /recurring_expenses`, `/recurring_incomes` | `next_occurrence_on ASC` | soonest due first |
| `GET /tags` (`all=true`) | `name ASC` | alphabetical |
| `GET /tags` (parents, or `parent_id`) | none (DB order, effectively id/insert order but not guaranteed) | undefined |
| loan `loan_payments` inside a loan | `payment_date \|\| created_at` ASC (Ruby sort) | oldest first |
| exports | oldest first by `COALESCE(date, created_at)`; loans by `created_at ASC` | n/a |

There is **no `sort` / `order` query param** on any finance endpoint, so RN cannot request `created_at desc` from the server. `created_at` isn't serialized either, so the client cannot sort by it. To get true newest-first you would need a server change (e.g. `order(created_at: :desc)` and/or a `sort` param, plus serializing `created_at`). Otherwise accept `updated_at DESC`. A record just created does appear on page 1 under `updated_at DESC` (as long as the active filters include it; note the web defaults to the **current month by `spent_at`**, so a back-dated expense is hidden until you change the month).

The web never re-sorts server lists client-side, except the Dashboard's top-4 budgets (by ratio) and the tag tree (by name, `buildTagOptions`).

---

## 4. Surprises and gotchas

1. **Amounts are JSON strings** (BigDecimal), e.g. `"12.5"` with trailing zeros dropped. Some aggregates return the integer `0` (cash_flow empty months, `total_paid` with no payments). Always parse.
2. **No user currency setting.** The currency is per record, the default is `eur`, and the web hardcodes the `'eur'` default in every form. The Dashboard pie and subcategory pie format with € regardless of the data's currency. The time-series charts use the "dominant currency" heuristic.
3. **`total_expenses_last_years_or_months` without `currency` sums all currencies together**, and it does not zero-fill missing months or years (labels skip empty buckets). `cash_flow` does zero-fill.
4. `format` is reserved by Rails. Exports take **`file_format`**. The default is `xlsx` for `/expenses/export` and `csv` for `/reports/export`.
5. **Soft delete / restore responses are the raw ActiveRecord JSON with no root key** (`render json: @expense`), with fields like `user_id` and `status` that the serializer doesn't emit. `destroy_permanently` and the budget/tag/recurring destroy return `{ <singular>: <raw model> }`.
6. **Validation errors are an errors hash** (`{field: [msgs]}`), not `{message:[...]}`. Tags and payments each have their own shape (see §0).
7. **Loan `tag` object is missing.** Loans have only `tag_id` + `category`, while expenses and incomes have a nested `tag`. Loans have no `subcategory`.
8. **Loans `meta.totals` sums the original `amount`**, not `remaining_amount`. The web's "To receive / To pay" KPIs sum `remaining_amount` client-side, but only over page 1 (5 loans), which is a web bug.
9. Loan `status` is recomputed by the server on every update and payment. `restore` forces `unpaid` even for fully-paid loans. Sending `status: trashed` through update would be overwritten.
10. `contact_id` exists on loans but is neither permitted nor serialized. The contact link is the free-text `contact_name` only.
11. `label_ids` is read outside strong params. It must be inside the root object, and omitting the key leaves the labels untouched. The web sends the primary tag and subcategory ids **inside `label_ids` too**.
12. The `tag_id` list filter matches the primary tag OR a label, but budgets, summary `by_tag` and pie charts use **only the primary `tag_id`**.
13. Expense `item` has no model validation, so a null item gives a 500 (DB not-null). Recurring amounts have no max validation (an overflow gives a 500).
14. Budget `amount` must be `> 0` on the server, while the web form allows 0.
15. **Pending incomes are legacy.** Generation now publishes directly. `/incomes/pending` and `confirm` still work for old rows, and the web still renders the section.
16. Creating a recurring rule with a past `start_date` **backfills** every missed occurrence immediately. Editing the schedule does not backfill if the rule never ran.
17. GET list endpoints have **side effects**: they generate due recurring expenses or incomes before responding.
18. The frequency enum's integer order is `weekly:0, monthly:1, yearly:2, daily:3`. Send strings.
19. `month` without `year` is ignored. `period=all` (or any unknown value) means all-time. `year` takes precedence over `period`.
20. `per_page` is fixed by the server: expenses 5, loans 5, incomes 12, tags 50 (500 with `all`). Budgets, recurring and pending are unpaginated.
21. Trash, restore and permanent delete exist in the API for expenses, incomes and loans, but **the web has no trash UI**. The only use of `destroy_permanently` is discarding a pending income. If RN adds a trash screen, it goes beyond web parity (the endpoints are ready).
22. `POST /tags` returns **200**, not 201. Deleting a category deletes its subcategories and its budgets.
23. `pie_chart_data_by_tag`: `total_spend` includes untagged expenses, but `chart_data` doesn't, so the slices may not add up to the total.
24. Web date display uses `timeZone: 'UTC'` because user-picked dates are stored at UTC midnight. RN should do the same, or render `split('T')[0]`.
