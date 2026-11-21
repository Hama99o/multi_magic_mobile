/**
 * Finance › Trash (`docs/design/finance/SPEC.md` §B B13: beyond the web, which
 * has no trash screen; the API is there). Deleted expenses, incomes and loans
 * wait here: Restore puts one back where it was, Delete forever asks first.
 *
 * The server pages its trash (`updated_at desc`, the last deleted first);
 * the list loads more as it scrolls.
 */
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import { financeKeys } from "@/api/keys";
import { financeApi, type Currency, type Expense, type Income, type Loan, type Page } from "@/api/finance";
import { RotateCcw, Trash2 } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { UndoToast } from "@/components/UndoToast";
import { useColors, useMetrics } from "@/hooks/useColors";
import { formatDay } from "@/screens/calendar/dates";
import { MONEY_IN, useMoney } from "@/screens/finance/parts";
import { useDestroyForever, useRestoreEntry } from "@/screens/finance/useFinanceMutations";
import { EmptyState, PillButton, Segmented } from "@/screens/finance/manage/common";
import { useFinanceUndo } from "@/stores/financeUndo.store";

type Kind = "expenses" | "incomes" | "loans";
type Row = Expense | Income | Loan;
const ENTRY = { expenses: "expense", incomes: "income", loans: "loan" } as const;

interface Shown {
  id: number;
  name: string;
  amount: number;
  currency: Currency;
  day: string | null;
  detail: string | null;
  incoming: boolean;
}

export default function TrashScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [kind, setKind] = useState<Kind>("expenses");
  const [failure, setFailure] = useState<string | null>(null);
  const offer = useFinanceUndo((s) => s.offer);
  const offerUndo = useFinanceUndo((s) => s.offerUndo);
  const clearOffer = useFinanceUndo((s) => s.clear);
  const trash = useInfiniteQuery({
    queryKey: financeKeys.trash(kind),
    queryFn: ({ pageParam }): Promise<Page<Row>> => (kind === "expenses" ? financeApi.expenses.trash(pageParam) : kind === "incomes" ? financeApi.incomes.trash(pageParam) : financeApi.loans.trash(pageParam)),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
  const failed = () => setFailure(t("finance.manage.failed"));
  const restore = useRestoreEntry(ENTRY[kind], { onDone: () => offerUndo(t("finance.manage.trash.restored")), onError: failed });
  const destroy = useDestroyForever(ENTRY[kind], { onError: failed });

  const shown = (r: Row): Shown => {
    if ("item" in r) return { id: r.id, name: r.item, amount: r.amount, currency: r.currency, day: r.day, detail: r.tag?.name ?? null, incoming: false };
    if ("source" in r) return { id: r.id, name: r.source, amount: r.amount, currency: r.currency, day: r.day, detail: r.tag?.name ?? null, incoming: true };
    return { id: r.id, name: r.contactName, amount: r.amount, currency: r.currency, day: r.dueDate, detail: r.type === "given" ? t("finance.manage.trash.lent") : t("finance.manage.trash.borrowed"), incoming: r.type === "given" };
  };
  const rows = (trash.data?.pages ?? []).flatMap((p) => p.rows).map(shown);

  const confirmDestroy = (row: Shown) =>
    Alert.alert(t("finance.manage.trash.deleteQuestion", { name: row.name }), t("finance.manage.trash.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("finance.manage.trash.deleteForever"), style: "destructive", onPress: () => destroy.mutate(row.id) },
    ]);

  return (
    <Screen measure header={<AppHeader app="finance" title={t("finance.manage.trash.title")} back />}>
      <View style={{ height: metrics.space.md }} />
      <Segmented
        testID="finance-trash-kind"
        value={kind}
        onChange={(k) => {
          setKind(k);
          setFailure(null);
        }}
        options={[
          { value: "expenses", label: t("finance.manage.trash.expenses") },
          { value: "incomes", label: t("finance.manage.trash.incomes") },
          { value: "loans", label: t("finance.manage.trash.loans") },
        ]}
      />
      <LoadFailure error={trash.error} loadFailed={t("finance.manage.trash.loadFailed")} hasData={Boolean(trash.data)} updatedAt={trash.dataUpdatedAt} onRetry={() => void trash.refetch()} testID="finance-trash-load-failed" />
      {failure ? (
        <Pressable testID="finance-trash-failure" onPress={() => setFailure(null)} accessibilityRole="button" accessibilityLabel={failure} accessibilityLiveRegion="polite">
          <Text tone="danger">{failure}</Text>
        </Pressable>
      ) : null}
      {trash.isPending && !trash.error ? <RowsSkeleton rows={4} testID="finance-trash-loading" /> : null}
      <FlatList
        testID="finance-trash-list"
        data={rows}
        keyExtractor={(r) => String(r.id)}
        ItemSeparatorComponent={() => <View style={{ height: metrics.space.sm }} />}
        refreshControl={<RefreshControl refreshing={trash.isRefetching && !trash.isFetchingNextPage} onRefresh={() => void trash.refetch()} tintColor={colors.inkMuted} />}
        onEndReached={() => {
          if (trash.hasNextPage && !trash.isFetchingNextPage) void trash.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingBottom: 96 }}
        ListFooterComponent={trash.isFetchingNextPage ? <ActivityIndicator color={colors.inkMuted} style={{ padding: metrics.space.md }} /> : null}
        ListEmptyComponent={trash.data ? <EmptyState testID="finance-trash-empty" icon={Trash2} title={t("finance.manage.trash.empty")} body={t("finance.manage.trash.emptyBody")} /> : null}
        renderItem={({ item, index }) => (
          <View>
            <TrashRow row={item} onRestore={() => restore.mutate(item.id)} onDestroy={() => confirmDestroy(item)} />
          </View>
        )}
      />
      <UndoToast offer={offer} onDone={clearOffer} testID="finance-trash-toast" />
    </Screen>
  );
}

function TrashRow({ row, onRestore, onDestroy }: { row: Shown; onRestore: () => void; onDestroy: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const money = useMoney();
  const meta = [row.detail, row.day ? formatDay(row.day, i18n.language, true) : null].filter(Boolean).join(" · ");
  return (
    <View testID={`finance-trash-row-${row.id}`} style={{ padding: metrics.space.md, gap: metrics.space.sm, borderRadius: metrics.radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, minHeight: 56 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "600" }} numberOfLines={1}>
            {row.name}
          </Text>
          {meta ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        <Text style={{ fontWeight: "600", fontVariant: ["tabular-nums"], color: row.incoming ? MONEY_IN : colors.ink }}>{money(row.amount, row.currency)}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
        <PillButton testID={`finance-trash-restore-${row.id}`} icon={RotateCcw} label={t("finance.manage.trash.restore")} a11yLabel={t("finance.manage.trash.restoreA11y", { name: row.name })} onPress={onRestore} />
        <PillButton testID={`finance-trash-destroy-${row.id}`} icon={Trash2} danger label={t("finance.manage.trash.deleteForever")} a11yLabel={t("finance.manage.trash.deleteA11y", { name: row.name })} onPress={onDestroy} />
      </View>
    </View>
  );
}
