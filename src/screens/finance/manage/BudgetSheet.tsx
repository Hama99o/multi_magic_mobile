/**
 * A budget, new or edited (the web's `BudgetDrawer.tsx`): a category or none
 * (an overall budget across every category, in its currency), the amount on
 * the keypad, the currency and Monthly / Yearly. A bottom sheet over the
 * Budgets tab.
 *
 * The server's rules, said before it says them: the amount must be above
 * zero (the web lets 0 through and the server refuses it), and one budget per
 * category, period and currency. Rails answers a refused save with the bare
 * errors hash (`render json: @budget.errors`, `{ tag_id: ["has already been
 * taken"] }`), which `apiErrorMessage` does not read, so `refusal` names the
 * two known causes in the app's language and falls back to the server's words.
 */
import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { financeKeys } from "@/api/keys";
import { apiErrorMessage } from "@/api/http";
import { CURRENCIES, CURRENCY_SYMBOLS, financeApi, type Budget, type BudgetPeriod, type Currency } from "@/api/finance";
import { ChevronDown, Tag as TagIcon, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useOneAtATime } from "@/hooks/useOneAtATime";
import { FILL } from "@/theme/fill";
import { ChoiceSheet } from "@/screens/calendar/ChoiceSheet";
import { FChip, Field, TagPicker } from "@/screens/finance/parts";
import { useDeleteBudget, useSaveBudget } from "@/screens/finance/useFinanceMutations";
import { AmountBlock } from "@/screens/finance/manage/common";

type Tr = (key: string, options?: Record<string, unknown>) => string;

function refusal(error: unknown, t: Tr): string {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    if ("tag_id" in data) return t("finance.manage.budgets.duplicate");
    if ("amount" in data) return t("finance.manage.budgets.amountHint");
  }
  return apiErrorMessage(error) ?? t("finance.manage.failed");
}

export function BudgetSheet({ budget, onClose }: { budget: Budget | null; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const tags = useQuery({ queryKey: financeKeys.tags(), queryFn: financeApi.tags.all });
  const [tagId, setTagId] = useState<number | null>(budget?.tag?.id ?? null);
  const [amount, setAmount] = useState(budget ? String(budget.amount) : "");
  const [currency, setCurrency] = useState<Currency>(budget?.currency ?? "eur");
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? "monthly");
  const [picking, setPicking] = useState(false);
  const [choosingCurrency, setChoosingCurrency] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveBudget({ onDone: onClose, onError: (e) => setError(refusal(e, t)) });
  const once = useOneAtATime(); // a double tap saves once
  const remove = useDeleteBudget({ onError: (e) => setError(apiErrorMessage(e) ?? t("finance.manage.failed")) });
  const value = Number(amount || "0");
  const tagName = tagId == null ? null : (tags.data?.find((x) => x.id === tagId)?.name ?? budget?.tag?.name ?? null);

  const confirmDelete = () => {
    if (!budget) return;
    Alert.alert(t("finance.manage.budgets.deleteQuestion"), t("finance.manage.budgets.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        // Gone from the list at once (optimistic); the sheet stays until the
        // server agrees, so a refusal is read here rather than lost.
        onPress: () => remove.mutate(budget.id, { onSuccess: onClose }),
      },
    ]);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.5)" }} />
        <View
          testID="finance-budget-sheet"
          style={{ backgroundColor: colors.ground, borderTopLeftRadius: metrics.radius.lg, borderTopRightRadius: metrics.radius.lg, paddingTop: metrics.space.lg, paddingHorizontal: metrics.space.lg, paddingBottom: metrics.space.lg + insets.bottom, maxHeight: "92%", width: "100%", maxWidth: metrics.maxMeasure, alignSelf: "center" }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", paddingBottom: metrics.space.sm }}>
            <Text variant="title" accessibilityRole="header" style={{ flex: 1, fontSize: 20 }}>
              {budget ? t("finance.manage.budgets.edit") : t("finance.manage.budgets.new")}
            </Text>
            <Pressable testID="finance-budget-close" onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
              <X size={22} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: metrics.space.lg, paddingBottom: metrics.space.sm }}>
            <Field label={t("finance.manage.budgets.category")}>
              <Pressable
                testID="finance-budget-category"
                onPress={() => setPicking(true)}
                accessibilityRole="button"
                accessibilityLabel={t("finance.manage.budgets.categoryA11y", { name: tagName ?? t("finance.manage.budgets.overall") })}
                style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 48, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
              >
                <TagIcon size={18} color={colors.inkMuted} />
                <Text style={{ flex: 1 }} tone={tagName ? "default" : "muted"} numberOfLines={1}>
                  {tagName ?? t("finance.manage.budgets.overall")}
                </Text>
                <ChevronDown size={18} color={colors.inkMuted} />
              </Pressable>
              <Text variant="caption" tone="muted">
                {t("finance.manage.budgets.overallHint")}
              </Text>
            </Field>
            <Field label={t("finance.manage.budgets.amount")}>
              <AmountBlock testID="finance-budget-amount" value={amount} onChange={setAmount} currency={currency} onCurrency={() => setChoosingCurrency(true)} />
              {amount && value <= 0 ? (
                <Text variant="caption" tone="danger">
                  {t("finance.manage.budgets.amountHint")}
                </Text>
              ) : null}
            </Field>
            <Field label={t("finance.manage.budgets.period")}>
              <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
                <FChip testID="finance-budget-period-monthly" label={t("finance.manage.budgets.monthly")} selected={period === "monthly"} onPress={() => setPeriod("monthly")} />
                <FChip testID="finance-budget-period-yearly" label={t("finance.manage.budgets.yearly")} selected={period === "yearly"} onPress={() => setPeriod("yearly")} />
              </View>
            </Field>
            {error ? (
              <Text testID="finance-budget-error" tone="danger" accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
            <Button testID="finance-budget-save" label={t("common.save")} busy={save.isPending} disabled={value <= 0} onPress={() => once(() => save.mutateAsync({ id: budget?.id ?? null, input: { amount: value, currency, period, tagId } }))} />
            {budget ? <Button testID="finance-budget-delete" label={t("common.delete")} tone="danger" onPress={confirmDelete} /> : null}
          </ScrollView>
        </View>
      </View>
      <TagPicker open={picking} tags={tags.data ?? []} selected={tagId == null ? [] : [tagId]} onChange={(ids) => setTagId(ids[0] ?? null)} onClose={() => setPicking(false)} single categoriesOnly testID="finance-budget-tags" />
      <ChoiceSheet
        open={choosingCurrency}
        title={t("finance.manage.budgets.currency")}
        testID="finance-budget-currencies"
        value={currency}
        choices={CURRENCIES.map((c) => ({ value: c, label: `${CURRENCY_SYMBOLS[c]} ${c.toUpperCase()}` }))}
        onPick={setCurrency}
        onClose={() => setChoosingCurrency(false)}
      />
    </Modal>
  );
}
