/**
 * Finance strings, English. Split by area so each part of the app owns one
 * file: this one (the shell, overview, expenses, income, the entry sheet),
 * `loans.en.ts`, and `manage.en.ts` (budgets, recurring, categories, reports,
 * trash). `en.ts` composes them under `finance`; `fr` mirrors each file.
 */
export const financeEn = {
  title: "Finance",
  done: "Done",
  clearSearch: "Clear search",
  more: "More",
  menu: { recurring: "Recurring", categories: "Categories", reports: "Reports and export", trash: "Trash", help: "Help" },
  help: {
    title: "How Finance works",
    overview: { title: "Overview", body: "This month or this year at a glance: spent, received, what is left, what people owe you and what you owe." },
    expenses: { title: "Expenses", body: "Everything you spend, by day. Search, filter by category, and swipe a row to delete it (Undo brings it back)." },
    recurring: { title: "Recurring", body: "Rent, subscriptions, salary: set them once and they are added on their day, every time." },
    income: { title: "Income", body: "What comes in. An expected income waits under To confirm until you confirm or discard it." },
    loans: { title: "Loans", body: "Money you lent and money you borrowed, with every payment, until it is paid back." },
    budgets: { title: "Budgets", body: "A limit per month or per year, overall or for a category. The bar turns orange at 80% and red when you go over." },
    reports: { title: "Reports", body: "Totals for any month or year, spend by category, and exports as CSV, Excel or PDF." },
    categories: { title: "Categories", body: "Categories and their subcategories. Deleting one removes its subcategories and its budgets." },
    currencies: { title: "Several currencies", body: "Each entry keeps its own currency. Totals are shown per currency and never added together." },
  },
  tabs: { overview: "Overview", expenses: "Expenses", income: "Income", loans: "Loans", budgets: "Budgets" },
  period: { previous: "Previous", next: "Next", showYear: "Show the whole year", showMonth: "Show one month", year: "Year", month: "Month" },
  day: { today: "Today", yesterday: "Yesterday", pick: "Pick a day" },
  entry: { deleteDigit: "Delete a digit", decimal: "Decimal point", currency: "Currency: {{code}}. Tap to change" },
  tags: {
    pick: "Categories and labels",
    pickOne: "Category",
    search: "Search or make a category",
    none: "No category",
    create: "Make “{{name}}”",
    empty: "No categories yet. Type a name to make one.",
  },
};
