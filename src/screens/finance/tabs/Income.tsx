/**
 * Finance › Income (SPEC F15-F16; Quicken, Upside): the shared ledger for
 * incomes, with the incomes still To confirm pinned above it. A pending
 * income is an estimate: its amount can be corrected before Confirm, and
 * Discard deletes it for good (the web's `PendingIncomeSection`). Pending
 * incomes are legacy (recurring incomes are now recorded at once), so the
 * section shows only when the server has some.
 */
import { useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { financeKeys } from "@/api/keys";
import { financeApi, type Income } from "@/api/finance";
import { Check, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { parseDay } from "@/screens/calendar/dates";
import { Ledger } from "../Ledger";
import { FINANCE, MONEY_IN } from "../parts";
import { useConfirmIncome, useDiscardIncome } from "../useFinanceMutations";

export function IncomeTab({ openId }: { openId?: number } = {}) {
  return <Ledger kind="income" header={<PendingSection />} openId={openId} />;
}

function PendingSection() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const pending = useQuery({ queryKey: financeKeys.pendingIncomes(), queryFn: financeApi.incomes.pending });
  const [failure, setFailure] = useState<string | null>(null);
  const rows = pending.data ?? [];
  if (!rows.length) return null;
  return (
    <View testID="finance-pending" style={{ gap: metrics.space.sm, padding: metrics.space.md, borderRadius: metrics.radius.lg, backgroundColor: `${MONEY_IN}1f`, borderWidth: 1, borderColor: `${MONEY_IN}55` }}>
      <Text variant="label" accessibilityRole="header">
        {t("finance.pending.title", { count: rows.length })}
      </Text>
      {failure ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {failure}
        </Text>
      ) : null}
      {rows.map((income) => (
        <PendingRow key={income.id} income={income} onFailed={() => setFailure(t("finance.ledger.failed"))} />
      ))}
    </View>
  );
}

function PendingRow({ income, onFailed }: { income: Income; onFailed: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [amount, setAmount] = useState(String(income.amount));
  const confirm = useConfirmIncome({ onError: onFailed });
  const discard = useDiscardIncome({ onError: onFailed });
  const value = Number(amount.replace(",", "."));
  // An emptied field is not 0: Number("") is, and confirmed the income at 0 (ee's review).
  const valid = amount.trim() !== "" && Number.isFinite(value) && value >= 0;
  return (
    <View testID={`finance-pending-${income.id}`} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 56 }}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontWeight: "600" }}>
          {income.source}
        </Text>
        <Text variant="caption" tone="muted">
          {income.day ? t("finance.pending.due", { day: parseDay(income.day).toLocaleDateString(i18n.language, { day: "numeric", month: "short" }) }) : income.currency.toUpperCase()}
        </Text>
      </View>
      <TextInput
        testID={`finance-pending-amount-${income.id}`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        accessibilityLabel={t("finance.pending.amount", { source: income.source })}
        style={{ width: 96, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.sm, color: colors.ink, backgroundColor: colors.surface, textAlign: "right", fontVariant: ["tabular-nums"] }}
      />
      <Pressable
        testID={`finance-pending-confirm-${income.id}`}
        onPress={() => confirm.mutate({ income, amount: value })}
        disabled={!valid}
        accessibilityRole="button"
        accessibilityLabel={t("finance.pending.confirm", { source: income.source })}
        style={{ width: metrics.touch, height: metrics.touch, borderRadius: metrics.touch / 2, backgroundColor: FINANCE, alignItems: "center", justifyContent: "center", opacity: valid ? 1 : 0.4 }}
      >
        <Check size={20} color="#04161a" />
      </Pressable>
      <Pressable
        testID={`finance-pending-discard-${income.id}`}
        onPress={() =>
          Alert.alert(t("finance.pending.discardQuestion", { source: income.source }), t("finance.pending.discardBody"), [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("finance.pending.discard"), style: "destructive", onPress: () => discard.mutate(income) },
          ])
        }
        accessibilityRole="button"
        accessibilityLabel={t("finance.pending.discardLabel", { source: income.source })}
        style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
      >
        <X size={20} color={colors.inkMuted} />
      </Pressable>
    </View>
  );
}
