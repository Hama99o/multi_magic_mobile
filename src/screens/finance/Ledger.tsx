/**
 * The Expenses and Income tabs (`docs/design/finance/SPEC.md` §D.3, F10-F17;
 * Copilot, Monzo): the month switched in place, search, a category filter
 * (and One-time for expenses), the totals per currency with the count, then
 * every entry grouped by day with the day's total. Swipe left deletes, with
 * Undo (the server's restore). A tap opens the entry; the + adds one.
 *
 * Defaults to the current month, like the web (`FinanceFilters`), and the
 * switcher reaches any month or a whole year. Rows come newest-touched first
 * (the server's `updated_at desc`) and are grouped by their day, latest day
 * first.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Animated as RNAnimated, Modal, PanResponder, Pressable, RefreshControl, SectionList, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, type InfiniteData, type UseInfiniteQueryResult } from "@tanstack/react-query";
import { financeKeys } from "@/api/keys";
import { financeApi, formatTotals, type Currency, type Expense, type Income, type Page, type Tag, type Totals } from "@/api/finance";
import { Download, Filter, Pencil, Plus, Receipt, Search, Trash2, Wallet, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { UnreadableNotice } from "@/components/UnreadableNotice";
import { UndoToast } from "@/components/UndoToast";
import { useColors, useMetrics } from "@/hooks/useColors";
import { FILL } from "@/theme/fill";
import { parseDay, todayKey, addDays } from "@/screens/calendar/dates";
import { useFinanceUndo } from "@/stores/financeUndo.store";
import { chartColor, FChip, FINANCE, HeroAmount, MONEY_IN, PeriodSwitcher, TagPicker, useMoney } from "./parts";
import { useDeleteEntry, useRestoreEntry } from "./useFinanceMutations";

type Kind = "expense" | "income";
type Entry = Expense | Income;
const SEARCH_DELAY_MS = 300;

const nameOf = (e: Entry) => ("item" in e ? e.item : e.source);

/** Rows grouped by their day, latest day first; undated last. */
export function byDay<T extends { day: string | null }>(rows: T[]): { key: string; data: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) groups.set(r.day ?? "", [...(groups.get(r.day ?? "") ?? []), r]);
  return [...groups.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : b.localeCompare(a))).map(([key, data]) => ({ key, data }));
}

/** The day total, per currency. */
export function totalOf(rows: { amount: number; currency: Currency }[]): Totals {
  return rows.reduce<Totals>((t, r) => ({ ...t, [r.currency]: Math.round(((t[r.currency] ?? 0) + r.amount) * 100) / 100 }), {});
}

/** `openId`: a link to one entry (`app/finance/index.tsx` `?entry=`) opens its sheet once it has loaded. */
export function Ledger({ kind, header, openId }: { kind: Kind; header?: ReactNode; openId?: number }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [tagId, setTagId] = useState<number | null>(null);
  const [oneTime, setOneTime] = useState(false);
  const [picking, setPicking] = useState(false);
  const [openRow, setOpenRow] = useState<Entry | null>(null);
  const [linkClosed, setLinkClosed] = useState(false);
  const linked = useQuery({
    queryKey: financeKeys.entry(kind, openId ?? 0),
    queryFn: (): Promise<Entry> => (kind === "expense" ? financeApi.expenses.show(openId!) : financeApi.incomes.show(openId!)),
    enabled: openId != null,
  });
  const sheetRow = openRow ?? (!linkClosed && openId != null ? (linked.data ?? null) : null);
  const [failure, setFailure] = useState<string | null>(null);
  const offer = useFinanceUndo((s) => s.offer);
  const offerUndo = useFinanceUndo((s) => s.offerUndo);
  const clearOffer = useFinanceUndo((s) => s.clear);

  useEffect(() => {
    const id = setTimeout(() => setSearch(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [typed]);

  const filters = { search, tagId, year, month: month || undefined };
  // Two queries, one enabled: each key is written out as its factory call, so
  // the key-shape gate (queryKeys.test.ts) can read it; a conditional key it cannot.
  const paging = {
    initialPageParam: 1,
    getNextPageParam: (last: Page<Entry>) => (last.page < last.pages ? last.page + 1 : undefined),
    // Keep what is on screen while the next search, filter or month loads
    // (the web's `keepRows`), instead of blanking the list to a skeleton.
    placeholderData: keepPreviousData,
  };
  const expenses = useInfiniteQuery({
    ...paging,
    queryKey: financeKeys.expenses(search, tagId, year, month, oneTime),
    queryFn: ({ pageParam }) => financeApi.expenses.list({ ...filters, page: pageParam, oneTime }),
    enabled: kind === "expense",
  });
  const incomes = useInfiniteQuery({
    ...paging,
    queryKey: financeKeys.incomes(search, tagId, year, month),
    queryFn: ({ pageParam }) => financeApi.incomes.list({ ...filters, page: pageParam }),
    enabled: kind === "income",
  });
  const list = (kind === "expense" ? expenses : incomes) as UseInfiniteQueryResult<InfiniteData<Page<Entry>>>;
  const tags = useQuery({ queryKey: financeKeys.tags(), queryFn: financeApi.tags.all });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.rows) ?? [], [list.data]);
  const first = list.data?.pages[0];
  const sections = useMemo(() => byDay(rows), [rows]);
  const remove = useDeleteEntry(kind, { onError: () => setFailure(t("finance.ledger.failed")) });
  const restore = useRestoreEntry(kind, { onError: () => setFailure(t("finance.ledger.failed")) });
  const exportX = useMutation({
    mutationFn: async () => {
      const label = month ? `${year}-${String(month).padStart(2, "0")}` : String(year);
      const uri = await financeApi.expenses.export({ page: 1, ...filters }, `expenses-${label}`);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
    },
    onError: () => setFailure(t("finance.ledger.exportFailed")),
  });
  const tagName = tags.data?.find((x) => x.id === tagId)?.name;
  const del = (row: Entry) => {
    setOpenRow(null);
    setLinkClosed(true);
    remove.mutate(row);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    offerUndo(kind === "expense" ? t("finance.ledger.expenseDeleted") : t("finance.ledger.incomeDeleted"), () => restore.mutate(row.id));
  };
  const dayTitle = (key: string) => {
    if (!key) return t("finance.ledger.noDate");
    const today = todayKey();
    if (key === today) return t("finance.day.today");
    if (key === addDays(today, -1)) return t("finance.day.yesterday");
    return parseDay(key).toLocaleDateString(i18n.language, { weekday: "short", day: "numeric", month: "short", ...(key.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }) });
  };

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        testID={`finance-${kind}-list`}
        sections={list.data ? sections : []}
        keyExtractor={(r) => String(r.id)}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} tintColor={colors.inkMuted} />}
        ListHeaderComponent={
          <View style={{ gap: metrics.space.md, paddingBottom: metrics.space.sm }}>
            {header}
            <PeriodSwitcher year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} testID={`finance-${kind}-period`} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md }}>
              <Search size={18} color={colors.inkMuted} />
              <TextInput testID={`finance-${kind}-search`} value={typed} onChangeText={setTyped} placeholder={t("finance.ledger.search")} placeholderTextColor={colors.inkMuted} returnKeyType="search" accessibilityLabel={t("finance.ledger.search")} style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }} />
              {typed ? (
                <Pressable onPress={() => setTyped("")} accessibilityRole="button" accessibilityLabel={t("finance.clearSearch")} hitSlop={8}>
                  <X size={18} color={colors.inkMuted} />
                </Pressable>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm, alignItems: "center" }}>
              <FChip testID={`finance-${kind}-filter-tag`} label={tagName ? `${tagName}  ×` : t("finance.ledger.allCategories")} selected={tagId != null} onPress={() => (tagId != null ? setTagId(null) : setPicking(true))} a11yLabel={tagName ? t("finance.ledger.clearCategory", { name: tagName }) : t("finance.ledger.pickCategory")} />
              {kind === "expense" ? <FChip testID="finance-expense-filter-onetime" label={t("finance.ledger.oneTime")} selected={oneTime} onPress={() => setOneTime((x) => !x)} /> : null}
              <View style={{ flex: 1 }} />
              {kind === "expense" ? (
                <Pressable testID="finance-expense-export" onPress={() => exportX.mutate()} disabled={exportX.isPending || !first?.count} accessibilityRole="button" accessibilityLabel={t("finance.ledger.export")} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center", opacity: first?.count ? 1 : 0.4 }}>
                  {exportX.isPending ? <ActivityIndicator /> : <Download size={20} color={colors.ink} />}
                </Pressable>
              ) : null}
            </View>
            {first && first.count > 0 ? (
              <View testID={`finance-${kind}-totals`} style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                <Text variant="label" style={{ color: kind === "income" ? MONEY_IN : colors.ink, flexShrink: 1 }} numberOfLines={2}>
                  {formatTotals(first.totals, i18n.language)}
                </Text>
                <Text variant="caption" tone="muted">
                  {t("finance.ledger.entries", { count: first.count })}
                </Text>
              </View>
            ) : null}
            <LoadFailure error={list.error} loadFailed={t("finance.ledger.loadFailed")} hasData={Boolean(list.data)} updatedAt={list.dataUpdatedAt} onRetry={() => void list.refetch()} testID={`finance-${kind}-load-failed`} />
            {failure ? (
              <Pressable testID="finance-ledger-failure" onPress={() => setFailure(null)} accessibilityRole="button" accessibilityLabel={failure} accessibilityLiveRegion="polite">
                <Text tone="danger">{failure}</Text>
              </Pressable>
            ) : null}
            <UnreadableNotice count={first?.unreadable ?? 0} />
            {list.isPending && !list.error ? <RowsSkeleton rows={6} testID={`finance-${kind}-loading`} /> : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: metrics.space.md, paddingBottom: metrics.space.xs }} testID={`finance-${kind}-day-${section.key || "none"}`}>
            <Text variant="label" tone="muted" accessibilityRole="header">
              {dayTitle(section.key).toLocaleUpperCase(i18n.language)}
            </Text>
            <Text variant="label" tone="muted">
              {formatTotals(totalOf(section.data), i18n.language)}
            </Text>
          </View>
        )}
        renderItem={({ item, index }) => (
          <View>
            <EntryRow entry={item} kind={kind} tags={tags.data ?? []} onOpen={() => setOpenRow(item)} onDelete={() => del(item)} />
          </View>
        )}
        ListEmptyComponent={list.data && !list.error ? <Empty kind={kind} filtered={Boolean(search || tagId || oneTime)} year={year} month={month} /> : null}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: metrics.space.md }} /> : null}
        contentContainerStyle={{ paddingBottom: 96 }}
      />

      <Pressable
        testID={`finance-${kind}-add`}
        onPress={() => router.push({ pathname: "/finance/entry", params: { kind } })}
        accessibilityRole="button"
        accessibilityLabel={kind === "expense" ? t("finance.ledger.addExpense") : t("finance.ledger.addIncome")}
        style={{ position: "absolute", right: 0, bottom: metrics.space.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: FINANCE, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
      >
        <Plus size={26} color="#04161a" />
      </Pressable>

      <TagPicker open={picking} tags={tags.data ?? []} selected={tagId ? [tagId] : []} single onChange={(ids) => setTagId(ids[0] ?? null)} onClose={() => setPicking(false)} testID={`finance-${kind}-filter-picker`} />
      <EntrySheet
        entry={sheetRow}
        kind={kind}
        onClose={() => {
          setOpenRow(null);
          setLinkClosed(true);
        }}
        onDelete={del}
      />
      <UndoToast offer={offer} onDone={clearOffer} testID="finance-undo" bottom={64} />
    </View>
  );
}

/** One entry: a dot in its category's colour, the name, its category and labels, the amount. Swipe left deletes. */
function EntryRow({ entry, kind, tags, onOpen, onDelete }: { entry: Entry; kind: Kind; tags: Tag[]; onOpen: () => void; onDelete: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const money = useMoney();
  const dx = useRef(new RNAnimated.Value(0)).current;
  const [swiping, setSwiping] = useState(false);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => setSwiping(true),
      onPanResponderMove: (_e, g) => dx.setValue(Math.min(0, g.dx)),
      onPanResponderRelease: (_e, g) => {
        RNAnimated.spring(dx, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start(() => setSwiping(false));
        if (g.dx <= -96) onDeleteRef.current();
      },
      onPanResponderTerminate: () => RNAnimated.spring(dx, { toValue: 0, useNativeDriver: true }).start(() => setSwiping(false)),
    }),
  ).current;
  const catIndex = Math.max(0, tags.filter((x) => x.parentId == null).findIndex((x) => x.id === entry.tagId));
  const category = entry.tag?.name ?? null;
  const extra = entry.labels.filter((l) => l.id !== entry.tagId && l.id !== ("subcategoryId" in entry ? entry.subcategoryId : null)).map((l) => l.name);
  const sub = "subcategory" in entry ? entry.subcategory?.name : null;
  const meta = [category && sub ? `${category} › ${sub}` : category, ...extra].filter(Boolean).join(" · ");
  const pending = "status" in entry && entry.status === "pending";
  return (
    <View style={{ borderRadius: metrics.radius.md, overflow: "hidden" }}>
      {swiping ? (
        <View style={{ ...FILL, backgroundColor: colors.danger, alignItems: "flex-end", justifyContent: "center", paddingHorizontal: metrics.space.xl }}>
          <Trash2 size={22} color="#ffffff" />
        </View>
      ) : null}
      <RNAnimated.View {...pan.panHandlers} style={{ transform: [{ translateX: dx }] }}>
        <Pressable
          testID={`finance-${kind}-row-${entry.id}`}
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={t("finance.ledger.openEntry", { name: nameOf(entry), amount: money(entry.amount, entry.currency) })}
          accessibilityActions={[{ name: "activate" }, { name: "delete", label: t("common.delete") }]}
          onAccessibilityAction={(e) => (e.nativeEvent.actionName === "delete" ? onDelete() : onOpen())}
          style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 60, paddingVertical: metrics.space.sm, backgroundColor: colors.ground }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: entry.tagId ? `${chartColor(catIndex)}33` : colors.surface }}>
            {kind === "expense" ? <Receipt size={18} color={entry.tagId ? chartColor(catIndex) : colors.inkMuted} /> : <Wallet size={18} color={MONEY_IN} />}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={{ fontWeight: "600" }}>
              {nameOf(entry) || t("finance.ledger.untitled")}
            </Text>
            {meta ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
          <Text style={{ fontWeight: "600", fontVariant: ["tabular-nums"], color: kind === "income" ? MONEY_IN : colors.ink, opacity: pending ? 0.6 : 1 }}>
            {`${kind === "income" ? "+" : ""}${money(entry.amount, entry.currency)}`}
          </Text>
        </Pressable>
      </RNAnimated.View>
    </View>
  );
}

/** An entry, opened (the web's drawer view): the amount, its tags, day, currency and note; Edit, Delete. */
function EntrySheet({ entry, kind, onClose, onDelete }: { entry: Entry | null; kind: Kind; onClose: () => void; onDelete: (e: Entry) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  if (!entry) return null;
  const chips = [...new Map([entry.tag, "subcategory" in entry ? entry.subcategory : null, ...entry.labels].filter((x): x is { id: number; name: string } => Boolean(x)).map((x) => [x.id, x.name])).values()];
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.5)" }} />
        <View testID="finance-entry-sheet" style={{ backgroundColor: colors.ground, borderTopLeftRadius: metrics.radius.lg, borderTopRightRadius: metrics.radius.lg, padding: metrics.space.lg, paddingBottom: metrics.space.lg + insets.bottom, gap: metrics.space.md, width: "100%", maxWidth: metrics.maxMeasure, alignSelf: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text variant="label" tone="muted" style={{ flex: 1 }}>
              {kind === "expense" ? t("finance.entry.expense") : t("finance.entry.income")}
            </Text>
            <Pressable testID="finance-entry-sheet-close" onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8}>
              <X size={22} color={colors.ink} />
            </Pressable>
          </View>
          <Text variant="title" style={{ fontSize: 22 }} numberOfLines={2}>
            {nameOf(entry) || t("finance.ledger.untitled")}
          </Text>
          <HeroAmount amount={entry.amount} currency={entry.currency} tone={kind === "income" ? MONEY_IN : undefined} testID="finance-entry-sheet-amount" />
          {chips.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
              {chips.map((name) => (
                <View key={name} style={{ paddingHorizontal: metrics.space.sm, paddingVertical: 2, borderRadius: metrics.radius.pill, backgroundColor: colors.surface }}>
                  <Text variant="caption">{name}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text tone="muted">
            {[entry.day ? parseDay(entry.day).toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : null, entry.currency.toUpperCase()].filter(Boolean).join(" · ")}
          </Text>
          {entry.description ? <Text>{entry.description}</Text> : null}
          <View style={{ flexDirection: "row", gap: metrics.space.sm, paddingTop: metrics.space.sm }}>
            <Pressable testID="finance-entry-sheet-edit" onPress={() => { onClose(); router.push({ pathname: "/finance/entry", params: { kind, id: String(entry.id) } }); }} accessibilityRole="button" accessibilityLabel={t("finance.ledger.edit")} style={{ flex: 1, minHeight: 48, borderRadius: metrics.radius.md, backgroundColor: FINANCE, flexDirection: "row", gap: metrics.space.sm, alignItems: "center", justifyContent: "center" }}>
              <Pencil size={18} color="#04161a" />
              <Text variant="label" style={{ color: "#04161a" }}>
                {t("finance.ledger.edit")}
              </Text>
            </Pressable>
            <Pressable testID="finance-entry-sheet-delete" onPress={() => onDelete(entry)} accessibilityRole="button" accessibilityLabel={t("common.delete")} style={{ flex: 1, minHeight: 48, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: `${colors.danger}66`, flexDirection: "row", gap: metrics.space.sm, alignItems: "center", justifyContent: "center" }}>
              <Trash2 size={18} color={colors.danger} />
              <Text variant="label" tone="danger">
                {t("common.delete")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Empty({ kind, filtered, year, month }: { kind: Kind; filtered: boolean; year: number; month: number }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const when = month ? new Date(year, month - 1, 1).toLocaleDateString(i18n.language, { month: "long" }) : String(year);
  return (
    <Animated.View entering={FadeInDown.duration(260)} testID={`finance-${kind}-empty`} style={{ alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.xl }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: `${FINANCE}2e`, alignItems: "center", justifyContent: "center" }}>
        {filtered ? <Filter size={36} color={colors.ink} /> : kind === "expense" ? <Receipt size={36} color={colors.ink} /> : <Wallet size={36} color={colors.ink} />}
      </View>
      <Text variant="title" style={{ fontSize: 20, textAlign: "center" }}>
        {filtered ? t("finance.ledger.noMatch") : kind === "expense" ? t("finance.ledger.noExpenses", { when }) : t("finance.ledger.noIncome", { when })}
      </Text>
      {filtered ? null : (
        <Text tone="muted" style={{ textAlign: "center" }}>
          {kind === "expense" ? t("finance.ledger.noExpensesBody") : t("finance.ledger.noIncomeBody")}
        </Text>
      )}
    </Animated.View>
  );
}
