/**
 * Finance › Overview (`docs/design/finance/SPEC.md` §D.2, F1-F7; Monarch,
 * Revolut, Rocket Money). One month or one year at a glance:
 *   - the hero: spent, in the currency spent most, the others under it; then
 *     income and net (per currency, never added together);
 *   - To receive / To pay over EVERY unpaid loan (the web sums its first
 *     page only, a web bug not copied);
 *   - the active loans, five at most, as the web's dashboard lists them
 *     (`Dashboard.tsx:444-475`; parity F-D10, 2026-11-20); none owed, no card;
 *   - the four budgets nearest their limit;
 *   - spend by category (a donut; a category opens its subcategories);
 *   - income vs expenses over 12 months, and spending over time;
 *   - the latest expenses.
 * Each card has its own query, so one slow answer never blanks the page; a
 * card that fails says so and offers Retry where it stands.
 */
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useNav } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { financeKeys } from "@/api/keys";
import { dominantCurrency, financeApi, formatMoney, formatTotals, type Currency, type Slice, type Totals } from "@/api/finance";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, PiggyBank, Plus } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { UndoToast } from "@/components/UndoToast";
import { useFinanceUndo } from "@/stores/financeUndo.store";
import { useColors, useMetrics } from "@/hooks/useColors";
import { Bars, budgetColor, chartColor, Donut, FINANCE, HeroAmount, MONEY_IN, MONEY_OWED, PeriodSwitcher, ShareBar, shortMonth, useMoney } from "../parts";
import type { FinanceTab } from "./names";
import { loanTone, useDueLabel } from "./Loans";

const period = (year: number, month: number) => (month ? { year, month } : { year });

export function OverviewTab({ onOpen }: { onOpen: (tab: FinanceTab) => void }) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [refreshing, setRefreshing] = useState(false);
  // "Expense saved" after an entry added from here lands on this tab.
  const offer = useFinanceUndo((s) => s.offer);
  const clearOffer = useFinanceUndo((s) => s.clear);

  const pie = useQuery({ queryKey: financeKeys.byCategory(year, month), queryFn: () => financeApi.expenses.byCategory(period(year, month)) });
  const summary = useQuery({ queryKey: financeKeys.summary(year, month), queryFn: () => financeApi.reports.summary(year, month || null) });
  const glance = useQuery({ queryKey: financeKeys.expenseGlance(year, month), queryFn: () => financeApi.expenses.list({ page: 1, ...period(year, month) }) });
  const owed = useQuery({ queryKey: financeKeys.outstanding(), queryFn: financeApi.loans.outstanding });
  const budgets = useQuery({ queryKey: financeKeys.budgets(), queryFn: financeApi.budgets.list });
  const cur: Currency = dominantCurrency(pie.data?.total ?? {});
  const flow = useQuery({ queryKey: financeKeys.cashFlow(cur), queryFn: () => financeApi.reports.cashFlow(cur) });
  const over = useQuery({ queryKey: financeKeys.overTime(month ? "months" : "years", cur), queryFn: () => financeApi.expenses.overTime(month ? "months" : "years", cur) });

  const spent = pie.data?.total ?? {};
  const otherSpent = Object.fromEntries(Object.entries(spent).filter(([c]) => c !== cur)) as Totals;
  const topBudgets = [...(budgets.data ?? [])].sort((a, b) => b.spent / b.amount - a.spent / a.amount).slice(0, 4);

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      testID="finance-tab-overview"
      contentContainerStyle={{ gap: metrics.space.lg, paddingBottom: 96 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void client.invalidateQueries({ queryKey: financeKeys.all }).finally(() => setRefreshing(false));
          }}
          tintColor={colors.inkMuted}
        />
      }
    >
      <PeriodSwitcher year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} testID="finance-overview-period" />

      <Card testID="finance-overview-spent">
        <Text variant="label" tone="muted">
          {month ? t("finance.overview.spentMonth") : t("finance.overview.spentYear")}
        </Text>
        {pie.isPending ? <ActivityIndicator style={{ alignSelf: "flex-start" }} /> : <HeroAmount amount={spent[cur] ?? 0} currency={cur} testID="finance-overview-spent-amount" />}
        {formatTotals(otherSpent, i18n.language) ? (
          <Text tone="muted" testID="finance-overview-spent-other">
            {t("finance.overview.andOther", { other: formatTotals(otherSpent, i18n.language) })}
          </Text>
        ) : null}
        {glance.data ? (
          <Text variant="caption" tone="muted" testID="finance-overview-count">
            {t("finance.overview.expenseCount", { count: glance.data.count })}
          </Text>
        ) : null}
        <Retry failed={Boolean(pie.error)} onRetry={() => void pie.refetch()} />
        <View style={{ flexDirection: "row", gap: metrics.space.md, paddingTop: metrics.space.sm }}>
          <Stat label={t("finance.overview.income")} value={summary.data ? formatTotals(summary.data.incomes, i18n.language) || "—" : "…"} tone={MONEY_IN} testID="finance-overview-income" />
          <Stat label={t("finance.overview.net")} value={summary.data ? formatTotals(summary.data.net, i18n.language) || "—" : "…"} testID="finance-overview-net" />
        </View>
        <Retry failed={Boolean(summary.error)} onRetry={() => void summary.refetch()} />
      </Card>

      <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
        <OwedCard testID="finance-overview-receive" icon="in" title={t("finance.overview.toReceive")} totals={owed.data?.receive} count={owed.data?.receiveCount} failed={Boolean(owed.error)} onPress={() => onOpen("loans")} />
        <OwedCard testID="finance-overview-pay" icon="out" title={t("finance.overview.toPay")} totals={owed.data?.pay} count={owed.data?.payCount} failed={Boolean(owed.error)} onPress={() => onOpen("loans")} />
      </View>

      <ActiveLoans onAll={() => onOpen("loans")} />

      <Card testID="finance-overview-budgets">
        <CardHead title={t("finance.overview.budgets")} action={t("finance.overview.manage")} onAction={() => onOpen("budgets")} testID="finance-overview-budgets-all" />
        {budgets.data && !topBudgets.length ? (
          <Pressable testID="finance-overview-budgets-empty" onPress={() => onOpen("budgets")} accessibilityRole="button" accessibilityLabel={t("finance.overview.noBudgets")} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 44 }}>
            <PiggyBank size={20} color={colors.inkMuted} />
            <Text tone="muted" style={{ flex: 1 }}>
              {t("finance.overview.noBudgets")}
            </Text>
          </Pressable>
        ) : null}
        {topBudgets.map((b) => (
          <View key={b.id} style={{ gap: metrics.space.xs }} testID={`finance-overview-budget-${b.id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text numberOfLines={1} style={{ flex: 1 }}>
                {b.tag?.name ?? t("finance.overview.overall")}
              </Text>
              <BudgetLine spent={b.spent} amount={b.amount} currency={b.currency} />
            </View>
            <ShareBar share={b.amount ? b.spent / b.amount : 0} color={budgetColor(b.spent, b.amount, colors.danger)} />
          </View>
        ))}
        <Retry failed={Boolean(budgets.error)} onRetry={() => void budgets.refetch()} />
      </Card>

      <CategoryCard slices={pie.data?.slices ?? []} year={year} month={month} loading={pie.isPending} />

      <Card testID="finance-overview-flow">
        <CardHead title={t("finance.overview.inVsOut", { code: cur.toUpperCase() })} />
        {flow.data ? (
          <>
            <Bars labels={flow.data.map((p) => shortMonth(p.label, i18n.language))} series={[{ values: flow.data.map((p) => p.incomes), color: MONEY_IN }, { values: flow.data.map((p) => p.expenses), color: MONEY_OWED }]} testID="finance-overview-flow-bars" />
            <View style={{ flexDirection: "row", gap: metrics.space.lg }}>
              <Legend color={MONEY_IN} label={t("finance.overview.income")} />
              <Legend color={MONEY_OWED} label={t("finance.overview.expenses")} />
            </View>
          </>
        ) : (
          <ActivityIndicator />
        )}
        <Retry failed={Boolean(flow.error)} onRetry={() => void flow.refetch()} />
      </Card>

      <Card testID="finance-overview-over-time">
        <CardHead title={month ? t("finance.overview.lastMonths", { code: cur.toUpperCase() }) : t("finance.overview.lastYears", { code: cur.toUpperCase() })} />
        {over.data ? (
          over.data.length ? (
            <Bars labels={over.data.map((p) => (month ? shortMonth(p.label, i18n.language) : p.label.slice(2)))} series={[{ values: over.data.map((p) => p.amount), color: FINANCE }]} testID="finance-overview-over-time-bars" />
          ) : (
            <Text tone="muted">{t("finance.overview.nothingYet")}</Text>
          )
        ) : (
          <ActivityIndicator />
        )}
        <Retry failed={Boolean(over.error)} onRetry={() => void over.refetch()} />
      </Card>

      <Card testID="finance-overview-recent">
        <CardHead title={t("finance.overview.recent")} action={t("finance.overview.seeAll")} onAction={() => onOpen("expenses")} testID="finance-overview-recent-all" />
        {glance.data && !glance.data.rows.length ? (
          <Pressable testID="finance-overview-add-first" onPress={() => router.push({ pathname: "/finance/entry", params: { kind: "expense" } })} accessibilityRole="button" accessibilityLabel={t("finance.ledger.addExpense")} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 44 }}>
            <Plus size={20} color={colors.inkMuted} />
            <Text tone="muted">{t("finance.ledger.addExpense")}</Text>
          </Pressable>
        ) : null}
        {(glance.data?.rows ?? []).slice(0, 5).map((e) => (
          <RecentRow key={e.id} name={e.item} meta={e.tag?.name ?? ""} amount={e.amount} currency={e.currency} />
        ))}
        <Retry failed={Boolean(glance.error)} onRetry={() => void glance.refetch()} />
      </Card>
    </ScrollView>
    <UndoToast offer={offer} onDone={clearOffer} testID="finance-overview-toast" />
    </View>
  );
}

/** The web's "Active loans": the first five unpaid, who, which way, what is left of what. Tap opens the loan. */
function ActiveLoans({ onAll }: { onAll: () => void }) {
  const router = useNav();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const dueLabel = useDueLabel();
  const loans = useQuery({ queryKey: financeKeys.activeLoans(), queryFn: () => financeApi.loans.list({ page: 1 }) });
  const rows = (loans.data?.rows ?? []).filter((l) => l.status !== "paid").slice(0, 5);
  if (!rows.length && !loans.error) return null;
  return (
    <Card testID="finance-overview-loans">
      <CardHead title={t("finance.overview.activeLoans")} action={t("finance.overview.seeAll")} onAction={onAll} testID="finance-overview-loans-all" />
      {rows.map((loan) => {
        const money = (n: number) => formatMoney(n, loan.currency, i18n.language);
        const kind = loan.type === "given" ? t("finance.loans.lent") : t("finance.loans.borrowed");
        const due = dueLabel(loan);
        return (
          <Pressable
            key={loan.id}
            testID={`finance-overview-loan-${loan.id}`}
            onPress={() => router.push({ pathname: "/finance/loan", params: { id: String(loan.id) } })}
            accessibilityRole="button"
            accessibilityLabel={t("finance.loans.rowLabel", { name: loan.contactName, kind, remaining: money(loan.remaining), total: money(loan.amount) })}
            style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 48 }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1}>{loan.contactName || "—"}</Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {due ? `${kind} · ${due.text}` : kind}
              </Text>
            </View>
            <Text variant="label" style={{ color: loanTone(loan.type), fontVariant: ["tabular-nums"] }}>
              {t("finance.overview.ofBudget", { spent: money(loan.remaining), amount: money(loan.amount) })}
            </Text>
          </Pressable>
        );
      })}
      <Retry failed={Boolean(loans.error)} onRetry={() => void loans.refetch()} />
    </Card>
  );
}

function Card({ children, testID }: { children: ReactNode; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Animated.View entering={FadeInDown.duration(260)} testID={testID} style={{ gap: metrics.space.sm, padding: metrics.space.md, borderRadius: metrics.radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      {children}
    </Animated.View>
  );
}

function CardHead({ title, action, onAction, testID }: { title: string; action?: string; onAction?: () => void; testID?: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Text variant="label" accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </Text>
      {action && onAction ? (
        <Pressable testID={testID} onPress={onAction} accessibilityRole="button" accessibilityLabel={action} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", minHeight: metrics.touch }}>
          <Text variant="caption" style={{ color: colors.accent }}>
            {action}
          </Text>
          <ChevronRight size={16} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Stat({ label, value, tone, testID }: { label: string; value: string; tone?: string; testID: string }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1 }} testID={testID}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text style={{ fontWeight: "700", color: tone ?? colors.ink, fontVariant: ["tabular-nums"] }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function OwedCard({ icon, title, totals, count, failed, onPress, testID }: { icon: "in" | "out"; title: string; totals?: Totals; count?: number; failed: boolean; onPress: () => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const tone = icon === "in" ? MONEY_IN : MONEY_OWED;
  const text = totals ? formatTotals(totals, i18n.language) : "";
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}: ${text || "0"}`} style={{ flex: 1, gap: metrics.space.xs, padding: metrics.space.md, borderRadius: metrics.radius.lg, backgroundColor: `${tone}1f`, borderWidth: 1, borderColor: `${tone}55` }}>
      {icon === "in" ? <ArrowUpRight size={20} color={tone} /> : <ArrowDownLeft size={20} color={tone} />}
      <Text variant="caption" tone="muted">
        {title}
      </Text>
      <Text style={{ fontWeight: "700", fontSize: 18, color: colors.ink, fontVariant: ["tabular-nums"] }} numberOfLines={2} testID={`${testID}-amount`}>
        {failed ? "—" : totals ? text || formatTotals({ eur: 0 }, i18n.language) || "0" : "…"}
      </Text>
      {count != null ? (
        <Text variant="caption" tone="muted">
          {t("finance.overview.active", { count })}
        </Text>
      ) : null}
    </Pressable>
  );
}

function BudgetLine({ spent, amount, currency }: { spent: number; amount: number; currency: Currency }) {
  const colors = useColors();
  const { t } = useTranslation();
  const money = useMoney();
  const over = spent > amount;
  return (
    <Text variant="caption" style={{ color: over ? colors.danger : colors.inkMuted, fontVariant: ["tabular-nums"] }}>
      {t("finance.overview.ofBudget", { spent: money(spent, currency), amount: money(amount, currency) })}
    </Text>
  );
}

function CategoryCard({ slices, year, month, loading }: { slices: Slice[]; year: number; month: number; loading: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const money = useMoney();
  const [openCat, setOpenCat] = useState<string | null>(null);
  const tags = useQuery({ queryKey: financeKeys.tags(), queryFn: financeApi.tags.all });
  const many = new Set(slices.map((s) => s.currency)).size > 1;
  const total = slices.reduce((a, s) => a + s.amount, 0);
  const catId = openCat ? (tags.data?.find((x) => x.parentId == null && x.name === openCat)?.id ?? null) : null;
  const subs = useQuery({ queryKey: financeKeys.bySubcategory(catId ?? 0, year, month), queryFn: () => financeApi.expenses.bySubcategory(catId!, period(year, month)), enabled: catId != null });
  const shown = openCat ? (subs.data?.slices ?? []) : slices;
  const shownTotal = shown.reduce((a, s) => a + s.amount, 0);
  return (
    <Card testID="finance-overview-categories">
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text variant="label" accessibilityRole="header" style={{ flex: 1 }}>
          {openCat ? t("finance.overview.inCategory", { name: openCat }) : t("finance.overview.byCategory")}
        </Text>
        {openCat ? (
          <Pressable testID="finance-overview-categories-back" onPress={() => setOpenCat(null)} accessibilityRole="button" accessibilityLabel={t("finance.overview.allCategories")} hitSlop={8} style={{ minHeight: metrics.touch, justifyContent: "center" }}>
            <Text variant="caption" style={{ color: colors.accent }}>
              {t("finance.overview.allCategories")}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {loading || (openCat && subs.isPending) ? <ActivityIndicator /> : null}
      {!loading && !shown.length ? <Text tone="muted">{openCat ? t("finance.overview.noSubcategories") : t("finance.overview.noCategories")}</Text> : null}
      {shown.length ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, flexWrap: "wrap" }}>
          <Donut values={shown.map((s) => s.amount)} size={140} testID="finance-overview-donut" />
          <View style={{ flex: 1, minWidth: 150, gap: metrics.space.xs }}>
            {shown.map((s, i) => {
              const pct = (openCat ? shownTotal : total) ? Math.round((s.amount / (openCat ? shownTotal : total)) * 100) : 0;
              const label = many ? `${s.label} · ${s.currency.toUpperCase()}` : s.label;
              return (
                <Pressable
                  key={`${s.label}-${s.currency}`}
                  testID={`finance-overview-slice-${i}`}
                  disabled={Boolean(openCat)}
                  onPress={() => setOpenCat(s.label)}
                  accessibilityRole={openCat ? "text" : "button"}
                  accessibilityLabel={`${label}, ${money(s.amount, s.currency)}, ${pct}%`}
                  style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 32 }}
                >
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: chartColor(i) }} />
                  <Text style={{ flex: 1 }} numberOfLines={1} variant="caption">
                    {label}
                  </Text>
                  <Text variant="caption" style={{ fontVariant: ["tabular-nums"] }}>{`${money(s.amount, s.currency)} · ${pct}%`}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      {!openCat && shown.length ? (
        <Text variant="caption" tone="muted">
          {t("finance.overview.tapCategory")}
        </Text>
      ) : null}
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const metrics = useMetrics();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

function RecentRow({ name, meta, amount, currency }: { name: string; meta: string; amount: number; currency: Currency }) {
  const metrics = useMetrics();
  const money = useMoney();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 44 }}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1}>{name}</Text>
        {meta ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Text style={{ fontWeight: "600", fontVariant: ["tabular-nums"] }}>{money(amount, currency)}</Text>
    </View>
  );
}

function Retry({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const colors = useColors();
  const { t } = useTranslation();
  if (!failed) return null;
  return (
    <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel={t("finance.overview.retry")} style={{ minHeight: 44, justifyContent: "center" }}>
      <Text variant="caption" style={{ color: colors.danger }}>
        {t("finance.overview.couldNotLoad")}
      </Text>
    </Pressable>
  );
}
