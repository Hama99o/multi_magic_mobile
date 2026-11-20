/**
 * Finance › Recurring (`docs/design/finance/SPEC.md` §A F14 F17, §D.9; the
 * web's `RecurringPanel.tsx` and `RecurringIncomePanel.tsx`). Expenses or
 * incomes that come back on their own: rent, subscriptions, a salary.
 *
 * Rows come in the server's order, the soonest due first. Each says how often
 * ("Every 3 months") and when next ("Next on 2 Dec"), or Paused, dimmed. Pause
 * / Resume shows at once (`useToggleRecurring`); an income can be Run now,
 * which adds one income dated today and leaves the schedule alone.
 *
 * The category filter is the web's: client side, top-level categories, and
 * the total of the shown rules per currency with their count.
 */
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { financeKeys } from "@/api/keys";
import { financeApi, formatTotals, type Recurring } from "@/api/finance";
import { Filter, Pause, Play, Repeat } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { UndoToast } from "@/components/UndoToast";
import { useColors, useMetrics } from "@/hooks/useColors";
import { parseDay } from "@/screens/calendar/dates";
import { ChoiceSheet } from "@/screens/calendar/ChoiceSheet";
import { FChip, MONEY_IN, useMoney } from "@/screens/finance/parts";
import { useRunRecurringIncome, useToggleRecurring } from "@/screens/finance/useFinanceMutations";
import { EmptyState, Fab, PillButton, repeatLabel, Segmented, sumByCurrency } from "@/screens/finance/manage/common";
import { useFinanceUndo } from "@/stores/financeUndo.store";

type Kind = "expense" | "income";

export default function RecurringScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<Kind>(params.kind === "income" ? "income" : "expense");
  const [tagId, setTagId] = useState<number | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const offer = useFinanceUndo((s) => s.offer);
  const offerUndo = useFinanceUndo((s) => s.offerUndo);
  const clearOffer = useFinanceUndo((s) => s.clear);
  const rules = useQuery({ queryKey: financeKeys.recurring(kind), queryFn: () => financeApi.recurring.list(kind) });
  const tags = useQuery({ queryKey: financeKeys.tags(), queryFn: financeApi.tags.all });
  const failed = () => setFailure(t("finance.manage.failed"));
  const toggle = useToggleRecurring(kind, { onError: failed });
  const run = useRunRecurringIncome({ onDone: () => offerUndo(t("finance.manage.recurring.ran")), onError: failed });

  const categories = (tags.data ?? []).filter((x) => x.parentId == null);
  const shown = (rules.data ?? []).filter((r) => tagId == null || r.tag?.id === tagId);
  const totals = formatTotals(sumByCurrency(shown), i18n.language);
  const filterName = tagId == null ? t("finance.manage.recurring.allCategories") : (categories.find((c) => c.id === tagId)?.name ?? t("finance.manage.recurring.allCategories"));
  const pick = (k: Kind) => {
    setKind(k);
    setTagId(null);
    setFailure(null);
  };
  const open = (r: Recurring | null) => router.push({ pathname: "/finance/recurring-edit", params: r ? { kind, id: String(r.id) } : { kind } });

  return (
    <Screen measure>
      <AppHeader app="finance" title={t("finance.manage.recurring.title")} back />
      <View style={{ height: metrics.space.md }} />
      <Segmented
        testID="finance-recurring-kind"
        value={kind}
        onChange={pick}
        options={[
          { value: "expense", label: t("finance.manage.recurring.expenses") },
          { value: "income", label: t("finance.manage.recurring.incomes") },
        ]}
      />
      <Text tone="muted" variant="caption" style={{ paddingBottom: metrics.space.sm }}>
        {kind === "income" ? t("finance.manage.recurring.hintIncome") : t("finance.manage.recurring.hintExpense")}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingBottom: metrics.space.md }}>
        <FChip testID="finance-recurring-filter" label={filterName} selected={tagId != null} onPress={() => setChoosing(true)} a11yLabel={t("finance.manage.recurring.filterA11y", { name: filterName })} />
        <View style={{ flex: 1 }} />
        {rules.data ? (
          <View style={{ alignItems: "flex-end" }}>
            {totals ? (
              <Text testID="finance-recurring-total" variant="label" style={{ fontVariant: ["tabular-nums"] }}>
                {totals}
              </Text>
            ) : null}
            <Text testID="finance-recurring-count" variant="caption" tone="muted">
              {t("finance.manage.recurring.count", { count: shown.length })}
            </Text>
          </View>
        ) : null}
      </View>
      <LoadFailure error={rules.error} loadFailed={t("finance.manage.recurring.loadFailed")} hasData={Boolean(rules.data)} updatedAt={rules.dataUpdatedAt} onRetry={() => void rules.refetch()} testID="finance-recurring-load-failed" />
      {failure ? (
        <Pressable testID="finance-recurring-failure" onPress={() => setFailure(null)} accessibilityRole="button" accessibilityLabel={failure} accessibilityLiveRegion="polite">
          <Text tone="danger">{failure}</Text>
        </Pressable>
      ) : null}
      {rules.isPending && !rules.error ? <RowsSkeleton rows={4} testID="finance-recurring-loading" /> : null}

      <FlatList
        testID="finance-recurring-list"
        data={shown}
        keyExtractor={(r) => String(r.id)}
        ItemSeparatorComponent={() => <View style={{ height: metrics.space.sm }} />}
        refreshControl={<RefreshControl refreshing={rules.isRefetching} onRefresh={() => void rules.refetch()} tintColor={colors.inkMuted} />}
        contentContainerStyle={{ paddingBottom: 96 }}
        ListEmptyComponent={
          rules.data ? (
            tagId != null ? (
              <EmptyState testID="finance-recurring-empty" icon={Filter} title={t("finance.manage.recurring.emptyFiltered")} />
            ) : (
              <EmptyState
                testID="finance-recurring-empty"
                icon={Repeat}
                title={kind === "income" ? t("finance.manage.recurring.emptyIncome") : t("finance.manage.recurring.emptyExpense")}
                body={t("finance.manage.recurring.emptyBody")}
              />
            )
          ) : null
        }
        renderItem={({ item, index }) => (
          <View>
            <RuleRow rule={item} onOpen={() => open(item)} onToggle={() => toggle.mutate(item)} onRun={kind === "income" ? () => run.mutate(item.id) : undefined} />
          </View>
        )}
      />

      <Fab testID="finance-recurring-new" label={kind === "income" ? t("finance.manage.recurring.newIncome") : t("finance.manage.recurring.newExpense")} onPress={() => open(null)} />
      <ChoiceSheet
        open={choosing}
        title={t("finance.manage.recurring.category")}
        testID="finance-recurring-categories"
        value={tagId == null ? "all" : String(tagId)}
        choices={[{ value: "all", label: t("finance.manage.recurring.allCategories") }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]}
        onPick={(v) => setTagId(v === "all" ? null : Number(v))}
        onClose={() => setChoosing(false)}
      />
      <UndoToast offer={offer} onDone={clearOffer} testID="finance-recurring-toast" />
    </Screen>
  );
}

function RuleRow({ rule, onOpen, onToggle, onRun }: { rule: Recurring; onOpen: () => void; onToggle: () => void; onRun?: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const money = useMoney();
  const amount = money(rule.amount, rule.currency);
  const shownAmount = rule.kind === "income" ? `≈ ${amount}` : amount;
  const every = repeatLabel(rule.frequency, rule.intervalCount, t);
  const when = !rule.active
    ? t("finance.manage.recurring.paused")
    : rule.nextOn
      ? t("finance.manage.recurring.next", { day: parseDay(rule.nextOn).toLocaleDateString(i18n.language, { day: "numeric", month: "short" }) })
      : null;
  return (
    <View testID={`finance-recurring-${rule.id}`} style={{ borderRadius: metrics.radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: metrics.space.md, gap: metrics.space.sm }}>
      <Pressable
        testID={`finance-recurring-open-${rule.id}`}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={[rule.name, shownAmount, every, when].filter(Boolean).join(", ")}
        style={{ gap: 2, minHeight: 44, opacity: rule.active ? 1 : 0.55 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
          <Text style={{ flex: 1, fontWeight: "600" }} numberOfLines={1}>
            {rule.name}
          </Text>
          <Text style={{ fontWeight: "600", fontVariant: ["tabular-nums"], color: rule.kind === "income" ? MONEY_IN : colors.ink }}>{shownAmount}</Text>
        </View>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {rule.tag ? `${every} · ${rule.tag.name}` : every}
        </Text>
        {when ? (
          <Text testID={`finance-recurring-when-${rule.id}`} variant="caption" tone="muted">
            {when}
          </Text>
        ) : null}
      </Pressable>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
        <PillButton
          testID={`finance-recurring-toggle-${rule.id}`}
          icon={rule.active ? Pause : Play}
          label={rule.active ? t("finance.manage.recurring.pause") : t("finance.manage.recurring.resume")}
          a11yLabel={rule.active ? t("finance.manage.recurring.pauseA11y", { name: rule.name }) : t("finance.manage.recurring.resumeA11y", { name: rule.name })}
          onPress={onToggle}
        />
        {onRun ? <PillButton testID={`finance-recurring-run-${rule.id}`} icon={Play} primary label={t("finance.manage.recurring.runNow")} a11yLabel={t("finance.manage.recurring.runA11y", { name: rule.name })} onPress={onRun} /> : null}
      </View>
    </View>
  );
}
