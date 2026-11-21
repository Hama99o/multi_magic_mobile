/**
 * One loan (`docs/design/finance/SPEC.md` §D.7, F19; REFERENCES flow 6: the
 * YNAB header, the Afterpay timeline).
 *
 * What is left, big, with "of €200" and a bar of the share paid; the fields
 * (person, due date, category, status, note); the payments as a timeline,
 * each deletable after a confirm; and Add payment (hidden once paid), a sheet
 * with the keypad, a "Pay the rest" chip and the day. The server decides the
 * new status and refuses an overpayment: its sentence is shown as it is.
 * Edit opens the form; Delete sends it to the trash, goes back, offers Undo.
 */
import { useState } from "react";
import { Alert, Modal, Pressable, RefreshControl, ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useNav, useNavParams } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { financeKeys } from "@/api/keys";
import { CURRENCY_SYMBOLS, financeApi, formatMoney, type Loan } from "@/api/finance";
import { apiErrorMessage } from "@/api/http";
import { Pencil, Plus, Trash2, X } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { FILL } from "@/theme/fill";
import { formatDay, todayKey } from "@/screens/calendar/dates";
import { AmountPad, DayChooser, FChip, FINANCE, HeroAmount, ShareBar, typedAmount } from "@/screens/finance/parts";
import { LoanAvatar, loanTone, PaidBadge, paidShare, useDueLabel } from "@/screens/finance/tabs/Loans";
import { useAddPayment, useDeleteEntry, useDeletePayment, useRestoreEntry } from "@/screens/finance/useFinanceMutations";
import { useFinanceUndo } from "@/stores/financeUndo.store";

export default function LoanScreen() {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const params = useNavParams<{ id?: string }>();
  const loanId = Number(params.id);
  const [paying, setPaying] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const offerUndo = useFinanceUndo((s) => s.offerUndo);

  const query = useQuery({ queryKey: financeKeys.loan(loanId), queryFn: () => financeApi.loans.show(loanId), enabled: Number.isFinite(loanId) });
  const loan = query.data;
  const onError = () => setFailure(t("finance.loans.failed"));
  const removePayment = useDeletePayment(loanId, { onError });
  const restore = useRestoreEntry("loan", { onError: () => offerUndo(t("finance.loans.failed")) });
  const remove = useDeleteEntry("loan", { onError: () => offerUndo(t("finance.loans.failed")) });
  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: "/finance", params: { tab: "loans" } }));

  const money = (n: number) => (loan ? formatMoney(n, loan.currency, i18n.language) : "");
  const dayOf = (day: string | null) => (day ? formatDay(day, i18n.language, true) : "");

  const confirmDelete = () => {
    if (!loan) return;
    Alert.alert(t("finance.loans.deleteQuestion"), t("finance.loans.deleteBody", { name: loan.contactName }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          remove.mutate({ id: loan.id });
          offerUndo(t("finance.loans.deleted"), () => restore.mutate(loan.id));
          back();
        },
      },
    ]);
  };
  const confirmDeletePayment = (p: Loan["payments"][number]) => {
    Alert.alert(t("finance.loans.deletePaymentQuestion"), t("finance.loans.deletePaymentBody", { amount: money(p.amount), day: dayOf(p.day) }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => removePayment.mutate(p.id) },
    ]);
  };

  return (
    <Screen measure header={<AppHeader app="finance" title={loan?.contactName ?? t("finance.tabs.loans")} back onBack={back} />}>
      {/* The loan's own row, under the shared header: edit and delete. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: metrics.space.sm, paddingVertical: metrics.space.xs }}>
        <Pressable
          testID="finance-loan-edit"
          disabled={!loan}
          onPress={() => router.push({ pathname: "/finance/loan-edit", params: { id: String(loanId) } })}
          accessibilityRole="button"
          accessibilityLabel={t("finance.loans.edit")}
          style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
        >
          <Pencil size={22} color={colors.ink} />
        </Pressable>
        <Pressable testID="finance-loan-delete" disabled={!loan} onPress={confirmDelete} accessibilityRole="button" accessibilityLabel={t("finance.loans.delete")} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
          <Trash2 size={22} color={colors.danger} />
        </Pressable>
      </View>

      <LoadFailure error={query.error} loadFailed={t("finance.loans.form.loadFailed")} hasData={Boolean(loan)} updatedAt={query.dataUpdatedAt} onRetry={() => void query.refetch()} testID="finance-loan-load-failed" />
      {query.isPending && !query.error ? <RowsSkeleton rows={5} testID="finance-loan-loading" /> : null}
      {failure ? (
        <Pressable testID="finance-loan-failure" onPress={() => setFailure(null)} accessibilityRole="button" accessibilityLabel={failure} accessibilityLiveRegion="polite">
          <Text tone="danger">{failure}</Text>
        </Pressable>
      ) : null}

      {loan ? (
        <ScrollView
          testID="finance-loan"
          contentContainerStyle={{ gap: metrics.space.lg, paddingBottom: metrics.space.xl }}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.inkMuted} />}
        >
          <Header loan={loan} />
          <View style={{ gap: metrics.space.xs }}>
            <FieldRow label={t("finance.loans.fields.contact")} value={loan.contactName} />
            <FieldRow label={t("finance.loans.fields.due")} value={loan.dueDate ? dayOf(loan.dueDate) : t("finance.loans.noDueDate")} />
            <FieldRow label={t("finance.loans.fields.category")} value={tagNames(loan) || t("finance.loans.noCategory")} />
            <FieldRow
              label={t("finance.loans.fields.status")}
              value={loan.status === "paid" ? t("finance.loans.status.paid") : loan.status === "trashed" ? t("finance.loans.status.trashed") : t("finance.loans.status.unpaid")}
            />
            {loan.description ? <FieldRow label={t("finance.loans.fields.description")} value={loan.description} /> : null}
          </View>

          <View style={{ gap: metrics.space.sm }}>
            <Text variant="label" tone="muted" accessibilityRole="header">
              {t("finance.loans.paymentsTitle", { count: loan.payments.length })}
            </Text>
            {loan.payments.length === 0 ? (
              <Text tone="muted" testID="finance-loan-no-payments">
                {t("finance.loans.noPayments")}
              </Text>
            ) : (
              loan.payments.map((p, i) => (
                <Animated.View key={p.id} entering={FadeInDown.delay(Math.min(i, 10) * 35).duration(220)} testID={`finance-loan-payment-${p.id}`} style={{ flexDirection: "row", alignItems: "stretch", gap: metrics.space.md, minHeight: 56 }}>
                  {/* The Afterpay timeline: a filled dot per payment, joined by a line. */}
                  <View style={{ width: 16, alignItems: "center" }}>
                    <View style={{ width: 2, flex: 1, backgroundColor: i === 0 ? "transparent" : colors.border }} />
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: loanTone(loan.type) }} />
                    <View style={{ width: 2, flex: 1, backgroundColor: i === loan.payments.length - 1 ? "transparent" : colors.border }} />
                  </View>
                  <View style={{ flex: 1, justifyContent: "center" }}>
                    <Text style={{ fontWeight: "600", fontVariant: ["tabular-nums"] }}>{money(p.amount)}</Text>
                    <Text variant="caption" tone="muted">
                      {dayOf(p.day)}
                    </Text>
                  </View>
                  <Pressable
                    testID={`finance-loan-payment-delete-${p.id}`}
                    onPress={() => confirmDeletePayment(p)}
                    accessibilityRole="button"
                    accessibilityLabel={t("finance.loans.deletePayment", { amount: money(p.amount) })}
                    style={{ width: metrics.touch, height: metrics.touch, alignSelf: "center", alignItems: "center", justifyContent: "center" }}
                  >
                    <X size={20} color={colors.inkMuted} />
                  </Pressable>
                </Animated.View>
              ))
            )}
          </View>

          {loan.status !== "paid" ? (
            <Pressable
              testID="finance-loan-add-payment"
              onPress={() => setPaying(true)}
              accessibilityRole="button"
              accessibilityLabel={t("finance.loans.addPayment")}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: metrics.space.sm, minHeight: 52, borderRadius: metrics.radius.md, backgroundColor: FINANCE }}
            >
              <Plus size={20} color="#04161a" />
              <Text variant="label" style={{ color: "#04161a", fontSize: 16 }}>
                {t("finance.loans.addPayment")}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : null}

      {paying && loan ? <PaymentSheet loan={loan} onClose={() => setPaying(false)} /> : null}
    </Screen>
  );
}

const tagNames = (loan: Loan) => [...new Set([loan.category, ...loan.labels.map((l) => l.name)].filter((x): x is string => Boolean(x)))].join(", ");

/** YNAB: what is left big, "of €200", the bar and "40% paid · €80.00". */
function Header({ loan }: { loan: Loan }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const dueLabel = useDueLabel();
  const tone = loanTone(loan.type);
  const share = paidShare(loan);
  const due = dueLabel(loan);
  const isPaid = loan.status === "paid";
  return (
    <View style={{ gap: metrics.space.sm, padding: metrics.space.lg, borderRadius: metrics.radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md }}>
        <LoanAvatar name={loan.contactName} size={40} />
        <Text variant="label" style={{ flex: 1, color: tone }}>
          {loan.type === "given" ? t("finance.loans.youLent") : t("finance.loans.youBorrowed")}
        </Text>
        {isPaid ? <PaidBadge testID="finance-loan-paid-badge" /> : null}
      </View>
      <Text variant="caption" tone="muted">
        {t("finance.loans.remaining")}
      </Text>
      <HeroAmount testID="finance-loan-remaining" amount={loan.remaining} currency={loan.currency} tone={isPaid ? colors.inkMuted : tone} />
      <Text tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
        {t("finance.loans.ofTotal", { amount: formatMoney(loan.amount, loan.currency, i18n.language) })}
      </Text>
      <ShareBar share={share} color={tone} testID="finance-loan-bar" />
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: metrics.space.sm }}>
        <Text testID="finance-loan-progress" variant="caption" tone="muted" style={{ flex: 1 }}>
          {t("finance.loans.percentPaidAmount", { percent: Math.round(share * 100), amount: formatMoney(loan.totalPaid, loan.currency, i18n.language) })}
        </Text>
        {due && !isPaid ? (
          <Text variant="caption" style={{ color: due.late ? colors.danger : colors.inkMuted, fontWeight: due.late ? "600" : "400" }}>
            {due.text}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View accessible style={{ flexDirection: "row", gap: metrics.space.md, minHeight: 48, alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text tone="muted" style={{ width: 110 }}>
        {label}
      </Text>
      <Text style={{ flex: 1, paddingVertical: metrics.space.sm }}>{value}</Text>
    </View>
  );
}

/** Add payment: the keypad, "Pay the rest", the day. The server says no to more than what is left. */
function PaymentSheet({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const [value, setValue] = useState("");
  const [day, setDay] = useState(todayKey());
  const [error, setError] = useState<string | null>(null);
  const add = useAddPayment(loan.id, { onDone: onClose, onError: (e) => setError(apiErrorMessage(e) ?? t("finance.loans.payment.failed")) });
  const amount = Number(value || "0");
  const shown = `${CURRENCY_SYMBOLS[loan.currency]}${typedAmount(value, i18n.language)}`;
  const rest = Math.round(loan.remaining * 100) / 100;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.5)" }} />
        <View
          testID="finance-payment-sheet"
          style={{ backgroundColor: colors.ground, borderTopLeftRadius: metrics.radius.lg, borderTopRightRadius: metrics.radius.lg, padding: metrics.space.lg, paddingBottom: metrics.space.lg + insets.bottom, width: "100%", maxWidth: metrics.maxMeasure, alignSelf: "center", maxHeight: "92%" }}
        >
          <ScrollView contentContainerStyle={{ gap: metrics.space.md }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text variant="title" accessibilityRole="header" style={{ flex: 1, fontSize: 20 }}>
                {t("finance.loans.payment.title")}
              </Text>
              <Pressable testID="finance-payment-close" onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8} style={{ width: metrics.touch, height: metrics.touch, alignItems: "flex-end", justifyContent: "center" }}>
                <X size={22} color={colors.ink} />
              </Pressable>
            </View>
            <Text
              testID="finance-payment-amount"
              accessibilityLabel={t("finance.loans.payment.amount", { amount: shown })}
              accessibilityLiveRegion="polite"
              style={{ fontSize: 40, lineHeight: 48, fontWeight: "700", textAlign: "center", color: amount > 0 ? colors.ink : colors.inkMuted, fontVariant: ["tabular-nums"] }}
            >
              {shown}
            </Text>
            {rest > 0 ? (
              <View style={{ alignItems: "center" }}>
                <FChip testID="finance-payment-rest" label={t("finance.loans.payment.payRest", { amount: formatMoney(rest, loan.currency, i18n.language) })} selected={amount === rest} onPress={() => setValue(String(rest))} />
              </View>
            ) : null}
            <AmountPad value={value} onChange={setValue} testID="finance-payment-pad" />
            <Text variant="label" tone="muted">
              {t("finance.loans.payment.day")}
            </Text>
            <DayChooser value={day} onChange={setDay} testID="finance-payment-day" />
            {error ? (
              <Text testID="finance-payment-error" tone="danger" accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
            <Button
              testID="finance-payment-save"
              label={t("finance.loans.payment.save")}
              busy={add.isPending}
              disabled={!(amount > 0)}
              onPress={() => {
                setError(null);
                add.mutate({ amount, day });
              }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
