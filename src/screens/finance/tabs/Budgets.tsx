/**
 * Finance › Budgets (`docs/design/finance/SPEC.md` §A F21, §D.8; the web's
 * `pages/finance/budgets/Index.tsx`). One card per budget, newest first (the
 * owner's rule; the server sends `created_at asc`, so "Oldest first" is that
 * order, one tap away): the category or "Overall budget", the period,
 * "€120 of €300", a bar coloured by its state (green, orange from 80%, red
 * from 100%: colour is the sign) and what is left, or how much over in red.
 * A tap edits it, the FAB makes one (`BudgetSheet`).
 *
 * `spent` is the server's: the month's (or year's) published expenses in the
 * budget's currency whose primary category is the budget's.
 */
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { financeKeys } from "@/api/keys";
import { financeApi, type Budget } from "@/api/finance";
import { PiggyBank } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { budgetColor, newestFirst, ShareBar, SortChip, useMoney } from "@/screens/finance/parts";
import { EmptyState, Fab } from "@/screens/finance/manage/common";
import { BudgetSheet } from "@/screens/finance/manage/BudgetSheet";

export function BudgetsTab() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const budgets = useQuery({ queryKey: financeKeys.budgets(), queryFn: financeApi.budgets.list });
  /** undefined: closed; null: a new budget; a budget: editing it. */
  const [editing, setEditing] = useState<Budget | null | undefined>(undefined);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const rows = budgets.data ? (sort === "oldest" ? budgets.data : newestFirst(budgets.data)) : [];

  return (
    <View testID="finance-tab-budgets" style={{ flex: 1 }}>
      <LoadFailure error={budgets.error} loadFailed={t("finance.manage.budgets.loadFailed")} hasData={Boolean(budgets.data)} updatedAt={budgets.dataUpdatedAt} onRetry={() => void budgets.refetch()} testID="finance-budgets-load-failed" />
      {budgets.isPending && !budgets.error ? <RowsSkeleton rows={3} testID="finance-budgets-loading" /> : null}
      {budgets.data?.length ? (
        <View style={{ flexDirection: "row", paddingBottom: metrics.space.sm }}>
          <SortChip
            testID="finance-budgets-sort"
            value={sort}
            onChange={setSort}
            options={[
              { key: "newest", label: t("finance.sort.newest") },
              { key: "oldest", label: t("finance.sort.oldest") },
            ]}
          />
        </View>
      ) : null}
      <FlatList
        testID="finance-budgets-list"
        data={rows}
        keyExtractor={(b) => String(b.id)}
        ItemSeparatorComponent={() => <View style={{ height: metrics.space.sm }} />}
        refreshControl={<RefreshControl refreshing={budgets.isRefetching} onRefresh={() => void budgets.refetch()} tintColor={colors.inkMuted} />}
        contentContainerStyle={{ paddingBottom: 96 }}
        ListEmptyComponent={budgets.data ? <EmptyState testID="finance-budgets-empty" icon={PiggyBank} title={t("finance.manage.budgets.empty")} body={t("finance.manage.budgets.emptyBody")} /> : null}
        renderItem={({ item, index }) => (
          <View>
            <BudgetCard budget={item} onPress={() => setEditing(item)} />
          </View>
        )}
      />
      <Fab testID="finance-budgets-new" label={t("finance.manage.budgets.new")} onPress={() => setEditing(null)} />
      {editing !== undefined ? <BudgetSheet key={editing?.id ?? "new"} budget={editing} onClose={() => setEditing(undefined)} /> : null}
    </View>
  );
}

function BudgetCard({ budget, onPress }: { budget: Budget; onPress: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const money = useMoney();
  const name = budget.tag?.name ?? t("finance.manage.budgets.overall");
  const period = budget.period === "yearly" ? t("finance.manage.budgets.yearly") : t("finance.manage.budgets.monthly");
  const tone = budgetColor(budget.spent, budget.amount, colors.danger);
  const percent = budget.amount > 0 ? Math.round((budget.spent / budget.amount) * 100) : 0;
  const over = budget.remaining < 0;
  const of = t("finance.manage.budgets.ofAmount", { spent: money(budget.spent, budget.currency), amount: money(budget.amount, budget.currency) });
  const rest = over ? t("finance.manage.budgets.over", { amount: money(-budget.remaining, budget.currency) }) : t("finance.manage.budgets.left", { amount: money(budget.remaining, budget.currency) });
  return (
    <Pressable
      testID={`finance-budget-${budget.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("finance.manage.budgets.a11yCard", { name, period, of, rest })}
      style={{ padding: metrics.space.md, gap: metrics.space.sm, borderRadius: metrics.radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, minHeight: 56 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
        <Text style={{ flex: 1, fontWeight: "600" }} numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" tone="muted">
          {period}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: metrics.space.sm }}>
        <Text testID={`finance-budget-of-${budget.id}`} style={{ flex: 1, fontVariant: ["tabular-nums"] }}>
          {of}
        </Text>
        <Text testID={`finance-budget-percent-${budget.id}`} variant="label" style={{ color: tone, fontVariant: ["tabular-nums"] }}>
          {t("finance.manage.budgets.percent", { percent })}
        </Text>
      </View>
      <ShareBar testID={`finance-budget-bar-${budget.id}`} share={budget.amount > 0 ? budget.spent / budget.amount : 0} color={tone} />
      <Text testID={`finance-budget-rest-${budget.id}`} variant="caption" tone={over ? "danger" : "muted"}>
        {rest}
      </Text>
    </Pressable>
  );
}
