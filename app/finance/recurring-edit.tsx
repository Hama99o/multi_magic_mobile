/**
 * A recurring expense or income, new or edited (the web's `RecurringDrawer`
 * and `RecurringIncomeDrawer`; `docs/design/finance/SPEC.md` §A F14 F17). A
 * modal, like `contacts/edit` and `todos/template`.
 *
 * Name, amount (an income's is an estimate), currency, repeat every N days,
 * weeks, months or years, the start date, a category, a note. `?kind=` is
 * `expense` or `income`; `?id=` edits that rule, read from the list's query.
 *
 * The server backfills: a NEW rule whose start date is in the past adds every
 * entry it missed at once, so the form says so under the date.
 */
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { financeKeys } from "@/api/keys";
import { apiErrorMessage } from "@/api/http";
import { CURRENCIES, CURRENCY_SYMBOLS, FREQUENCIES, financeApi, type Currency, type Frequency, type Recurring } from "@/api/finance";
import { ChevronDown, Minus, Plus, Tag as TagIcon, X } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { todayKey } from "@/screens/calendar/dates";
import { ChoiceSheet } from "@/screens/calendar/ChoiceSheet";
import { DayChooser, Field, TagPicker } from "@/screens/finance/parts";
import { useDeleteRecurring, useSaveRecurring } from "@/screens/finance/useFinanceMutations";
import { AmountBlock, repeatLabel, unitLabel } from "@/screens/finance/manage/common";
import { APP_CURRENCY, useLastCurrency } from "@/screens/finance/lastCurrency";

type Kind = "expense" | "income";

export default function RecurringEdit() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ kind?: string; id?: string }>();
  const kind: Kind = params.kind === "income" ? "income" : "expense";
  const id = params.id ? Number(params.id) : null;
  const rules = useQuery({ queryKey: financeKeys.recurring(kind), queryFn: () => financeApi.recurring.list(kind), enabled: id != null });
  const existing = id == null ? null : rules.data?.find((r) => r.id === id);
  if (id != null && !existing) {
    return (
      <Screen measure>
        <LoadFailure error={rules.error} loadFailed={t("finance.manage.recurring.loadFailed")} hasData={false} updatedAt={rules.dataUpdatedAt} onRetry={() => void rules.refetch()} testID="finance-recurring-edit-load-failed" />
      </Screen>
    );
  }
  return <Form key={existing?.id ?? "new"} kind={kind} existing={existing ?? null} />;
}

function Form({ kind, existing }: { kind: Kind; existing: Recurring | null }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const tags = useQuery({ queryKey: financeKeys.tags(), queryFn: financeApi.tags.all });
  const [name, setName] = useState(existing?.name ?? "");
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? APP_CURRENCY);
  // A new one starts in the currency this user used last (lastCurrency.ts), never a hard-coded one.
  const last = useLastCurrency();
  const currencySet = useRef(existing != null);
  useEffect(() => {
    if (currencySet.current || !last.ready) return;
    currencySet.current = true;
    setCurrency(last.currency);
  }, [last.ready, last.currency]);
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? "monthly");
  const [interval, setInterval] = useState(existing?.intervalCount ?? 1);
  const [startDate, setStartDate] = useState(existing?.startDate || todayKey());
  const [tagId, setTagId] = useState<number | null>(existing?.tag?.id ?? null);
  const [description, setDescription] = useState(existing?.description ?? "");
  const [sheet, setSheet] = useState<"currency" | "unit" | "tags" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const failed = (e: unknown) => setError(apiErrorMessage(e) ?? t("finance.manage.failed"));
  const save = useSaveRecurring(kind, { onDone: () => router.back(), onError: failed });
  const remove = useDeleteRecurring(kind, { onError: failed });
  const field = { borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, backgroundColor: colors.surface, fontSize: 16 } as const;
  const value = Number(amount || "0");
  const ready = Boolean(name.trim()) && amount !== "" && value >= 0 && Boolean(startDate);
  const tagName = tagId == null ? null : (tags.data?.find((x) => x.id === tagId)?.name ?? existing?.tag?.name ?? null);
  const income = kind === "income";
  const nameLabel = income ? t("finance.manage.recurring.source") : t("finance.manage.recurring.item");

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert(t("finance.manage.recurring.deleteQuestion", { name: existing.name }), income ? t("finance.manage.recurring.deleteBodyIncome") : t("finance.manage.recurring.deleteBodyExpense"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => remove.mutate(existing.id, { onSuccess: () => router.back() }) },
    ]);
  };

  return (
    <Screen measure avoidKeyboard>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
        <Pressable testID="finance-recurring-edit-close" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8} style={{ width: 32, height: 32, justifyContent: "center" }}>
          <X size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1}>
          {existing ? (income ? t("finance.manage.recurring.editIncome") : t("finance.manage.recurring.editExpense")) : income ? t("finance.manage.recurring.newIncome") : t("finance.manage.recurring.newExpense")}
        </Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: metrics.space.lg, paddingBottom: metrics.space.xl }}>
        <Field label={nameLabel}>
          <TextInput
            testID="finance-recurring-edit-name"
            value={name}
            onChangeText={setName}
            placeholder={income ? t("finance.manage.recurring.sourcePlaceholder") : t("finance.manage.recurring.itemPlaceholder")}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={nameLabel}
            style={{ ...field, minHeight: 48 }}
          />
        </Field>
        <Field label={income ? t("finance.manage.recurring.estimatedAmount") : t("finance.manage.recurring.amount")}>
          <AmountBlock testID="finance-recurring-edit-amount" value={amount} onChange={setAmount} currency={currency} onCurrency={() => setSheet("currency")} />
        </Field>
        <Field label={t("finance.manage.recurring.repeatEvery")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
            <Stepper testID="finance-recurring-edit-interval-minus" icon={Minus} label={t("finance.manage.recurring.less")} disabled={interval <= 1} onPress={() => setInterval((n) => Math.max(1, n - 1))} />
            <Text testID="finance-recurring-edit-interval-count" style={{ minWidth: 32, textAlign: "center", fontSize: 18, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
              {String(interval)}
            </Text>
            <Stepper testID="finance-recurring-edit-interval-plus" icon={Plus} label={t("finance.manage.recurring.more")} disabled={interval >= 99} onPress={() => setInterval((n) => Math.min(99, n + 1))} />
            <Pressable
              testID="finance-recurring-edit-unit"
              onPress={() => setSheet("unit")}
              accessibilityRole="button"
              accessibilityLabel={t("finance.manage.recurring.unitA11y", { repeat: repeatLabel(frequency, interval, t) })}
              style={{ ...field, flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}
            >
              <Text style={{ flex: 1 }}>{unitLabel(frequency, interval, t)}</Text>
              <ChevronDown size={18} color={colors.inkMuted} />
            </Pressable>
          </View>
          <Text testID="finance-recurring-edit-repeat" variant="caption" tone="muted">
            {repeatLabel(frequency, interval, t)}
          </Text>
        </Field>
        <Field label={t("finance.manage.recurring.startDate")}>
          <DayChooser testID="finance-recurring-edit-start" value={startDate} onChange={setStartDate} />
          {/* Only a NEW rule backfills; an edited one picks up from its next date. */}
          {existing ? null : (
            <Text testID="finance-recurring-edit-backfill" variant="caption" tone="muted">
              {income ? t("finance.manage.recurring.backfillIncome") : t("finance.manage.recurring.backfillExpense")}
            </Text>
          )}
        </Field>
        <Field label={t("finance.manage.recurring.category")}>
          <Pressable
            testID="finance-recurring-edit-category"
            onPress={() => setSheet("tags")}
            accessibilityRole="button"
            accessibilityLabel={t("finance.manage.recurring.categoryA11y", { name: tagName ?? t("finance.manage.recurring.noCategory") })}
            style={{ ...field, minHeight: 48, flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}
          >
            <TagIcon size={18} color={colors.inkMuted} />
            <Text style={{ flex: 1 }} tone={tagName ? "default" : "muted"} numberOfLines={1}>
              {tagName ?? t("finance.manage.recurring.noCategory")}
            </Text>
            <ChevronDown size={18} color={colors.inkMuted} />
          </Pressable>
        </Field>
        <Field label={t("finance.manage.recurring.description")}>
          <TextInput
            testID="finance-recurring-edit-description"
            value={description}
            onChangeText={setDescription}
            multiline
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t("finance.manage.recurring.description")}
            style={{ ...field, minHeight: 88, paddingTop: metrics.space.sm, textAlignVertical: "top" }}
          />
        </Field>
        {error ? (
          <Text testID="finance-recurring-edit-error" tone="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        {existing ? <Button testID="finance-recurring-edit-delete" label={t("common.delete")} tone="danger" onPress={confirmDelete} /> : null}
      </ScrollView>
      {/* Pinned, as in the entry sheet: Save never hides below the fold (device QA F8). */}
      <View style={{ paddingVertical: metrics.space.sm }}>
        <Button
          testID="finance-recurring-edit-save"
          label={t("common.save")}
          busy={save.isPending}
          disabled={!ready}
          onPress={() =>
            save.mutate({
              id: existing?.id ?? null,
              input: { name: name.trim(), amount: value, currency, frequency, intervalCount: interval, startDate, description: description.trim() || null, tagId },
            })
          }
        />
      </View>
      <ChoiceSheet
        open={sheet === "currency"}
        title={t("finance.manage.recurring.currency")}
        testID="finance-recurring-edit-currencies"
        value={currency}
        choices={CURRENCIES.map((c) => ({ value: c, label: `${CURRENCY_SYMBOLS[c]} ${c.toUpperCase()}` }))}
        onPick={setCurrency}
        onClose={() => setSheet(null)}
      />
      <ChoiceSheet
        open={sheet === "unit"}
        title={t("finance.manage.recurring.repeatEvery")}
        testID="finance-recurring-edit-units"
        value={frequency}
        choices={FREQUENCIES.map((f) => ({ value: f, label: unitLabel(f, interval, t) }))}
        onPick={setFrequency}
        onClose={() => setSheet(null)}
      />
      <TagPicker open={sheet === "tags"} tags={tags.data ?? []} selected={tagId == null ? [] : [tagId]} onChange={(ids) => setTagId(ids[0] ?? null)} onClose={() => setSheet(null)} single categoriesOnly testID="finance-recurring-edit-tags" />
    </Screen>
  );
}

function Stepper({ icon: Icon, label, onPress, disabled, testID }: { icon: typeof Plus; label: string; onPress: () => void; disabled: boolean; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} style={{ width: metrics.touch, height: metrics.touch, borderRadius: metrics.touch / 2, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}>
      <Icon size={18} color={colors.ink} />
    </Pressable>
  );
}
