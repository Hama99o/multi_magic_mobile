/** The Finance tabs, in the web's order. */
export const FINANCE_TABS = ["overview", "expenses", "income", "loans", "budgets"] as const;
export type FinanceTab = (typeof FINANCE_TABS)[number];
