/**
 * Finance › Loans (`docs/design/finance/SPEC.md` §D.6, F18, B5 B10 B11;
 * REFERENCES flow 6: Splitwise, YNAB).
 *
 * On top, what is still owed both ways as two cards: To receive in green,
 * To pay in orange (colour is the sign), each per currency, never added
 * across currencies, summed over EVERY unpaid loan (the web sums its first
 * page only). Then Active / Paid, a lent / borrowed / category filter, a
 * search, and one row per loan: the person, which way the money went, what
 * is left big with "of €200" small, a bar with the share paid, and the due
 * day (red once it has passed). Newest first, as the server sends them.
 *
 * Swipe a row left to delete it (to the trash; Undo restores it). The swipe
 * is React Native's own `PanResponder`, as Todo's `TaskRow`: the app has no
 * `GestureHandlerRootView`. Delete is also the row's accessibility action.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, FlatList, PanResponder, Pressable, RefreshControl, TextInput, View } from "react-native";
import Reanimated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { financeKeys } from "@/api/keys";
import { financeApi, formatMoney, formatTotals, type Loan, type LoanType, type Totals } from "@/api/finance";
import { CircleCheck, HandCoins, Plus, Search, Trash2, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { UnreadableNotice } from "@/components/UnreadableNotice";
import { UndoToast } from "@/components/UndoToast";
import { useColors, useMetrics } from "@/hooks/useColors";
import { ContactAvatar } from "@/screens/contacts/ContactAvatar";
import { formatDay, todayKey } from "@/screens/calendar/dates";
import { FChip, FINANCE, MONEY_IN, MONEY_OWED, ShareBar, TagPicker } from "@/screens/finance/parts";
import { useDeleteEntry, useRestoreEntry } from "@/screens/finance/useFinanceMutations";
import { useFinanceUndo } from "@/stores/financeUndo.store";

const SEARCH_DELAY_MS = 300;
/** Swipe distance that deletes, and where the haptic says so. */
const ACT_AT = 96;

// ── shared with the loan detail ──────────────────────────────────────────

/** The share paid, 0..1 (a loan of 0 that is paid counts as all paid). */
export function paidShare(loan: Pick<Loan, "amount" | "totalPaid" | "status">): number {
  if (loan.amount > 0) return Math.max(0, Math.min(1, loan.totalPaid / loan.amount));
  return loan.status === "paid" ? 1 : 0;
}

/** Colour is the sign: owed to you in green, owed by you in orange. */
export const loanTone = (type: LoanType) => (type === "given" ? MONEY_IN : MONEY_OWED);

function nameHash(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) | 0;
  return Math.abs(h);
}

/** Contacts' initials avatar, its colour fixed by the name, so a person keeps it across loans. */
export function LoanAvatar({ name, size = 44 }: { name: string; size?: number }) {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  return <ContactAvatar contact={{ id: nameHash(name), firstname: first, lastname: rest.join(" "), nickname: null, company: null, photoUrl: null }} size={size} />;
}

/** "Due Thu 3 Dec", or "Overdue · …" in red once the day has passed and money is still owed. */
export function useDueLabel() {
  const { t, i18n } = useTranslation();
  const today = todayKey();
  return (loan: Pick<Loan, "dueDate" | "status">): { text: string; late: boolean } | null => {
    if (!loan.dueDate) return null;
    const day = formatDay(loan.dueDate, i18n.language, loan.dueDate.slice(0, 4) !== today.slice(0, 4));
    const late = loan.status !== "paid" && loan.dueDate < today;
    return { text: late ? t("finance.loans.overdue", { day }) : t("finance.loans.due", { day }), late };
  };
}

export function PaidBadge({ testID }: { testID: string }) {
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <View testID={testID} style={{ paddingHorizontal: metrics.space.sm, paddingVertical: 2, borderRadius: metrics.radius.pill, backgroundColor: `${MONEY_IN}33` }}>
      <Text variant="caption" style={{ fontWeight: "600" }}>
        {t("finance.loans.paid")}
      </Text>
    </View>
  );
}

// ── the tab ──────────────────────────────────────────────────────────────

export function LoansTab() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [paid, setPaid] = useState(false);
  const [type, setType] = useState<LoanType | null>(null);
  const [tagId, setTagId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [typed, setTyped] = useState("");
  const [term, setTerm] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const offer = useFinanceUndo((s) => s.offer);
  const offerUndo = useFinanceUndo((s) => s.offerUndo);
  const clearOffer = useFinanceUndo((s) => s.clear);

  useEffect(() => {
    const id = setTimeout(() => setTerm(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [typed]);

  const outstanding = useQuery({ queryKey: financeKeys.outstanding(), queryFn: financeApi.loans.outstanding });
  const tags = useQuery({ queryKey: financeKeys.tags(), queryFn: financeApi.tags.all });
  const list = useInfiniteQuery({
    queryKey: financeKeys.loans(paid, type ?? "all", term, tagId),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => financeApi.loans.list({ page: pageParam, search: term, type, tagId, paid }),
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  const unreadable = list.data?.pages.reduce((n, p) => n + p.unreadable, 0) ?? 0;

  const onError = useCallback(() => setFailure(t("finance.loans.failed")), [t]);
  const remove = useDeleteEntry("loan", { onError });
  const restore = useRestoreEntry("loan", { onError });
  const onDelete = (loan: Loan) => {
    remove.mutate({ id: loan.id });
    offerUndo(t("finance.loans.deleted"), () => restore.mutate(loan.id));
  };

  const category = tagId == null ? null : (tags.data?.find((x) => x.id === tagId) ?? null);
  const filtered = Boolean(term || type || tagId);

  const header = (
    <View style={{ gap: metrics.space.md, paddingBottom: metrics.space.md }}>
      <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
        <SummaryCard kind="receive" totals={outstanding.data?.receive} count={outstanding.data?.receiveCount} loading={outstanding.isPending} />
        <SummaryCard kind="pay" totals={outstanding.data?.pay} count={outstanding.data?.payCount} loading={outstanding.isPending} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
        <FChip testID="finance-loans-active" label={t("finance.loans.active")} selected={!paid} onPress={() => setPaid(false)} />
        <FChip testID="finance-loans-paid" label={t("finance.loans.paid")} selected={paid} onPress={() => setPaid(true)} />
        <View style={{ width: 1, alignSelf: "stretch", backgroundColor: colors.border, marginHorizontal: metrics.space.xs }} />
        <FChip testID="finance-loans-type-given" label={t("finance.loans.lent")} selected={type === "given"} onPress={() => setType((x) => (x === "given" ? null : "given"))} />
        <FChip testID="finance-loans-type-taken" label={t("finance.loans.borrowed")} selected={type === "taken"} onPress={() => setType((x) => (x === "taken" ? null : "taken"))} />
        <FChip testID="finance-loans-category" label={category?.name ?? t("finance.loans.category")} selected={tagId != null} onPress={() => setPicking(true)} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md }}>
        <Search size={18} color={colors.inkMuted} />
        <TextInput
          testID="finance-loans-search"
          value={typed}
          onChangeText={setTyped}
          placeholder={t("finance.loans.search")}
          placeholderTextColor={colors.inkMuted}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel={t("finance.loans.search")}
          style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }}
        />
        {typed ? (
          <Pressable testID="finance-loans-search-clear" onPress={() => setTyped("")} accessibilityRole="button" accessibilityLabel={t("finance.clearSearch")} hitSlop={8}>
            <X size={18} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>
      <LoadFailure error={list.error} loadFailed={t("finance.loans.loadFailed")} hasData={Boolean(list.data)} updatedAt={list.dataUpdatedAt} onRetry={() => void list.refetch()} testID="finance-loans-load-failed" padded={false} />
      {failure ? (
        <Pressable testID="finance-loans-failure" onPress={() => setFailure(null)} accessibilityRole="button" accessibilityLabel={failure} accessibilityLiveRegion="polite">
          <Text tone="danger">{failure}</Text>
        </Pressable>
      ) : null}
      <UnreadableNotice count={unreadable} />
    </View>
  );

  return (
    <View testID="finance-tab-loans" style={{ flex: 1 }}>
      <FlatList
        testID="finance-loans-list"
        // NO layout animation on the rows (Todo QA 2026-11-16: `layout` /
        // `exiting` / `itemLayoutAnimation` overlapped rows on the device).
        data={rows}
        keyExtractor={(l) => String(l.id)}
        ListHeaderComponent={header}
        ListEmptyComponent={list.isPending && !list.error ? <RowsSkeleton rows={4} testID="finance-loans-loading" /> : list.data ? <Empty paid={paid} filtered={filtered} /> : null}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator /> : null}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        renderItem={({ item, index }) => (
          <Reanimated.View entering={FadeInDown.delay(Math.min(index, 10) * 35).duration(220)}>
            <LoanRow loan={item} onDelete={() => onDelete(item)} />
          </Reanimated.View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: metrics.space.xs }} />}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching && !list.isFetchingNextPage}
            onRefresh={() => {
              void list.refetch();
              void outstanding.refetch();
            }}
            tintColor={colors.inkMuted}
          />
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 96 }}
      />

      <Pressable
        testID="finance-loans-new"
        onPress={() => router.push("/finance/loan-edit")}
        accessibilityRole="button"
        accessibilityLabel={t("finance.loans.newLoan")}
        style={{ position: "absolute", right: 0, bottom: metrics.space.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: FINANCE, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
      >
        <Plus size={26} color="#04161a" />
      </Pressable>

      <TagPicker
        open={picking}
        tags={tags.data ?? []}
        selected={tagId == null ? [] : [tagId]}
        onChange={(ids) => setTagId(ids[0] ?? null)}
        onClose={() => setPicking(false)}
        single
        categoriesOnly
        testID="finance-loans-tagpicker"
      />
      <UndoToast offer={offer} onDone={clearOffer} testID="finance-loans-undo" bottom={64} />
    </View>
  );
}

function SummaryCard({ kind, totals, count, loading }: { kind: "receive" | "pay"; totals: Totals | undefined; count: number | undefined; loading: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const tone = kind === "receive" ? MONEY_IN : MONEY_OWED;
  const title = kind === "receive" ? t("finance.loans.toReceive") : t("finance.loans.toPay");
  const amount = loading ? "–" : formatTotals(totals ?? {}, i18n.language) || formatMoney(0, "eur", i18n.language);
  const active = t("finance.loans.activeCount", { count: count ?? 0 });
  return (
    <View
      testID={`finance-loans-${kind}`}
      accessible
      accessibilityLabel={t("finance.loans.summary", { title, amount, active })}
      style={{ flex: 1, minHeight: 88, padding: metrics.space.md, gap: 2, borderRadius: metrics.radius.lg, backgroundColor: `${tone}1f`, borderWidth: 1, borderColor: `${tone}66` }}
    >
      <Text variant="label" tone="muted">
        {title}
      </Text>
      <Text testID={`finance-loans-${kind}-amount`} numberOfLines={2} adjustsFontSizeToFit style={{ fontSize: 20, lineHeight: 26, fontWeight: "700", color: colors.ink, fontVariant: ["tabular-nums"] }}>
        {amount}
      </Text>
      <Text testID={`finance-loans-${kind}-count`} variant="caption" tone="muted">
        {loading ? " " : active}
      </Text>
    </View>
  );
}

function LoanRow({ loan, onDelete }: { loan: Loan; onDelete: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const dueLabel = useDueLabel();
  const dx = useRef(new Animated.Value(0)).current;
  const [swiping, setSwiping] = useState(false);
  const passed = useRef(false);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  const pan = useRef(
    PanResponder.create({
      // Only a drag that is clearly sideways and leftwards: the list still scrolls.
      onMoveShouldSetPanResponder: (_e, g) => g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        passed.current = false;
        setSwiping(true);
      },
      onPanResponderMove: (_e, g) => {
        dx.setValue(Math.min(0, g.dx));
        const over = g.dx <= -ACT_AT;
        if (over !== passed.current) {
          passed.current = over;
          if (over) void Haptics.selectionAsync().catch(() => undefined);
        }
      },
      onPanResponderRelease: (_e, g) => {
        Animated.spring(dx, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start(() => setSwiping(false));
        if (g.dx <= -ACT_AT) onDeleteRef.current();
      },
      onPanResponderTerminate: () => {
        Animated.spring(dx, { toValue: 0, useNativeDriver: true }).start(() => setSwiping(false));
      },
    }),
  ).current;

  const money = (n: number) => formatMoney(n, loan.currency, i18n.language);
  const share = paidShare(loan);
  const pct = Math.round(share * 100);
  const due = dueLabel(loan);
  const isPaid = loan.status === "paid";
  const kind = loan.type === "given" ? t("finance.loans.youLent") : t("finance.loans.youBorrowed");
  const tone = loanTone(loan.type);
  const open = () => router.push({ pathname: "/finance/loan", params: { id: String(loan.id) } });

  return (
    <View style={{ borderRadius: metrics.radius.md, overflow: "hidden" }}>
      {swiping ? (
        <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: metrics.space.xl, backgroundColor: colors.danger }}>
          <Trash2 size={22} color="#ffffff" />
        </View>
      ) : null}
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: dx }] }}>
        <Pressable
          testID={`finance-loan-row-${loan.id}`}
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={t("finance.loans.rowLabel", { name: loan.contactName, kind, remaining: money(loan.remaining), total: money(loan.amount) })}
          accessibilityActions={[{ name: "activate" }, { name: "delete", label: t("common.delete") }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "delete") onDelete();
            else open();
          }}
          style={{ flexDirection: "row", gap: metrics.space.md, minHeight: 72, paddingVertical: metrics.space.md, paddingHorizontal: metrics.space.sm, backgroundColor: colors.ground }}
        >
          <LoanAvatar name={loan.contactName} />
          <View style={{ flex: 1, gap: metrics.space.xs }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: metrics.space.sm }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontWeight: "600" }}>
                  {loan.contactName}
                </Text>
                <Text variant="caption" style={{ color: tone, fontWeight: "600" }}>
                  {kind}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text testID={`finance-loan-remaining-${loan.id}`} style={{ fontSize: 18, lineHeight: 22, fontWeight: "700", color: isPaid ? colors.inkMuted : tone, fontVariant: ["tabular-nums"] }}>
                  {money(loan.remaining)}
                </Text>
                <Text variant="caption" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
                  {t("finance.loans.ofTotal", { amount: money(loan.amount) })}
                </Text>
              </View>
            </View>
            <ShareBar share={share} color={tone} />
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: metrics.space.sm }}>
              <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                {t("finance.loans.percentPaid", { percent: pct })}
              </Text>
              {isPaid ? <PaidBadge testID={`finance-loan-paid-badge-${loan.id}`} /> : null}
              {due && !isPaid ? (
                <Text testID={`finance-loan-due-${loan.id}`} variant="caption" style={{ color: due.late ? colors.danger : colors.inkMuted, fontWeight: due.late ? "600" : "400" }}>
                  {due.text}
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function Empty({ paid, filtered }: { paid: boolean; filtered: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const title = filtered ? t("finance.loans.noMatchTitle") : paid ? t("finance.loans.emptyPaidTitle") : t("finance.loans.emptyTitle");
  const body = filtered ? t("finance.loans.noMatchBody") : paid ? t("finance.loans.emptyPaidBody") : t("finance.loans.emptyBody");
  const Icon = filtered ? Search : paid ? CircleCheck : HandCoins;
  return (
    <Reanimated.View entering={FadeIn.duration(260)} testID="finance-loans-empty" style={{ alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.xl * 1.5 }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: `${FINANCE}2e`, alignItems: "center", justifyContent: "center" }}>
        <Icon size={40} color={colors.ink} />
      </View>
      <Text variant="title" style={{ fontSize: 20, textAlign: "center" }}>
        {title}
      </Text>
      <Text tone="muted" style={{ textAlign: "center" }}>
        {body}
      </Text>
      {!filtered && !paid ? (
        <Pressable testID="finance-loans-empty-new" onPress={() => router.push("/finance/loan-edit")} accessibilityRole="button" accessibilityLabel={t("finance.loans.newLoan")} style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.lg, marginTop: metrics.space.sm, borderRadius: metrics.radius.pill, backgroundColor: FINANCE }}>
          <Text variant="label" style={{ color: "#04161a" }}>
            {t("finance.loans.newLoan")}
          </Text>
        </Pressable>
      ) : null}
    </Reanimated.View>
  );
}
