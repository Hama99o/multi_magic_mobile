/**
 * A new or edited expense or income (`docs/design/finance/SPEC.md` §D.4;
 * GoPay, Buddy, Copilot): the amount first, big, typed on its own keypad,
 * with its currency beside it; then the name, the categories, the day and a
 * note. Save is pinned at the bottom. A modal, like `contacts/edit`.
 *
 * The keypad shows while the amount is being typed and steps aside for the
 * keyboard when a text field is focused, so the two never stack.
 *
 * The currency last used on this phone is the next entry's (SPEC B7): there
 * is no currency setting on the server, every record carries its own.
 */
import { useState } from "react";
import { Keyboard, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { financeKeys } from "@/api/keys";
import { CURRENCIES, CURRENCY_SYMBOLS, financeApi, type Currency, type Expense, type Income, type Tag } from "@/api/finance";
import { apiErrorMessage } from "@/api/http";
import { Plus, X } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { ChoiceSheet } from "@/screens/calendar/ChoiceSheet";
import { todayKey } from "@/screens/calendar/dates";
import { AmountPad, CurrencyChip, DayChooser, FChip, Field, FINANCE, MONEY_IN, TagPicker, typedAmount } from "@/screens/finance/parts";
import { useLastCurrency } from "@/screens/finance/lastCurrency";
import { useCreateTag, useSaveEntry } from "@/screens/finance/useFinanceMutations";
import { useFinanceUndo } from "@/stores/financeUndo.store";

type Kind = "expense" | "income";

export default function EntryScreen() {
  const params = useLocalSearchParams<{ kind?: string; id?: string }>();
  const kind: Kind = params.kind === "income" ? "income" : "expense";
  const editId = params.id ? Number(params.id) : null;
  const existing = useQuery({
    queryKey: financeKeys.entry(kind, editId ?? 0),
    queryFn: (): Promise<Expense | Income> => (kind === "expense" ? financeApi.expenses.show(editId!) : financeApi.incomes.show(editId!)),
    enabled: editId != null,
  });
  const last = useLastCurrency();
  if (editId != null && !existing.data) return <Screen measure>{null}</Screen>;
  if (editId == null && !last.ready) return <Screen measure>{null}</Screen>;
  return <Form key={editId ?? "new"} initialKind={kind} existing={existing.data ?? null} defaultCurrency={last.currency} remember={last.remember} />;
}

function Form({ initialKind, existing, defaultCurrency, remember }: { initialKind: Kind; existing: Expense | Income | null; defaultCurrency: Currency; remember: (c: Currency) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? defaultCurrency);
  const [name, setName] = useState(existing ? ("item" in existing ? existing.item : existing.source) : "");
  // An undated entry stays undated: `existing.day` is null, never today (parity F-E13).
  const [day, setDay] = useState<string | null>(existing ? existing.day : todayKey());
  const [note, setNote] = useState(existing?.description ?? "");
  const [tagIds, setTagIds] = useState<number[]>(() =>
    existing ? [...new Set([existing.tagId, "subcategoryId" in existing ? existing.subcategoryId : null, ...existing.labelIds].filter((x): x is number => x != null))] : [],
  );
  const [padOpen, setPadOpen] = useState(!existing);
  const [picking, setPicking] = useState(false);
  const [choosingCurrency, setChoosingCurrency] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offer = useFinanceUndo((s) => s.offerUndo);
  const tags = useQuery({ queryKey: financeKeys.tags(), queryFn: financeApi.tags.all });
  const all = tags.data ?? [];
  const picked = tagIds.map((id) => all.find((x) => x.id === id)).filter((x): x is Tag => Boolean(x));
  const quick = all.filter((x) => x.parentId == null && !tagIds.includes(x.id)).slice(0, 6);
  const createTag = useCreateTag({ onDone: (tag) => setTagIds((ids) => [...ids, tag.id]), onError: (e) => setError(apiErrorMessage(e) ?? t("finance.entry.failed")) });
  const save = useSaveEntry(kind, {
    onDone: () => {
      remember(currency);
      offer(kind === "expense" ? t("finance.entry.savedExpense") : t("finance.entry.savedIncome"));
      router.back();
    },
    onError: (e) => setError(apiErrorMessage(e) ?? t("finance.entry.failed")),
  });
  const value = Number(amount || "0");
  const canSave = value > 0 && name.trim().length > 0 && !save.isPending;
  const tint = kind === "income" ? MONEY_IN : colors.ink;
  const field = { borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, backgroundColor: colors.surface, fontSize: 16, minHeight: 48 } as const;

  return (
    <Screen measure avoidKeyboard>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
        <Pressable testID="finance-entry-close" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8} style={{ width: 32, height: 32, justifyContent: "center" }}>
          <X size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1, fontSize: 22 }}>
          {existing ? (kind === "expense" ? t("finance.entry.editExpense") : t("finance.entry.editIncome")) : kind === "expense" ? t("finance.entry.newExpense") : t("finance.entry.newIncome")}
        </Text>
      </View>

      {!existing ? (
        <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: metrics.radius.md, padding: metrics.space.xs, marginBottom: metrics.space.md }}>
          {(["expense", "income"] as const).map((k) => (
            <Pressable
              key={k}
              testID={`finance-entry-kind-${k}`}
              onPress={() => setKind(k)}
              accessibilityRole="tab"
              accessibilityState={{ selected: kind === k }}
              style={{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: metrics.radius.sm, backgroundColor: kind === k ? FINANCE : "transparent" }}
            >
              <Text variant="label" style={{ color: kind === k ? "#04161a" : colors.ink }}>
                {k === "expense" ? t("finance.entry.expense") : t("finance.entry.income")}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: metrics.space.lg, paddingBottom: metrics.space.lg }}>
        <Pressable
          testID="finance-entry-amount"
          onPress={() => {
            Keyboard.dismiss();
            setPadOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t("finance.entry.amount", { amount: typedAmount(amount, i18n.language) })}
          style={{ alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}
        >
          <Text
            style={{ fontSize: 44, lineHeight: 52, fontWeight: "700", color: value > 0 ? tint : colors.inkMuted, fontVariant: ["tabular-nums"] }}
            numberOfLines={1}
            adjustsFontSizeToFit
            testID="finance-entry-amount-text"
          >
            {`${CURRENCY_SYMBOLS[currency]}${typedAmount(amount, i18n.language)}`}
          </Text>
          <CurrencyChip value={currency} onPress={() => setChoosingCurrency(true)} testID="finance-entry-currency" />
        </Pressable>
        {padOpen ? <AmountPad value={amount} onChange={setAmount} testID="finance-entry-pad" /> : null}

        <Field label={kind === "expense" ? t("finance.entry.item") : t("finance.entry.source")}>
          <TextInput
            testID="finance-entry-name"
            value={name}
            onChangeText={setName}
            onFocus={() => setPadOpen(false)}
            placeholder={kind === "expense" ? t("finance.entry.itemPlaceholder") : t("finance.entry.sourcePlaceholder")}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={kind === "expense" ? t("finance.entry.item") : t("finance.entry.source")}
            style={field}
          />
        </Field>

        <Field label={t("finance.entry.categories")}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
            {picked.map((tag) => (
              <FChip key={tag.id} testID={`finance-entry-tag-${tag.id}`} label={`${tag.name}  ×`} a11yLabel={t("finance.entry.removeTag", { name: tag.name })} selected onPress={() => setTagIds((ids) => ids.filter((x) => x !== tag.id))} />
            ))}
            {quick.map((tag) => (
              <FChip key={tag.id} testID={`finance-entry-quick-${tag.id}`} label={tag.name} onPress={() => setTagIds((ids) => [...ids, tag.id])} />
            ))}
            <Pressable
              testID="finance-entry-all-tags"
              onPress={() => setPicking(true)}
              accessibilityRole="button"
              accessibilityLabel={t("finance.entry.allTags")}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border }}
            >
              <Plus size={15} color={colors.inkMuted} />
              <Text variant="label">{t("finance.entry.allTags")}</Text>
            </Pressable>
          </View>
        </Field>

        <Field label={kind === "expense" ? t("finance.entry.spentOn") : t("finance.entry.receivedOn")}>
          <DayChooser value={day} onChange={setDay} onNone={() => setDay(null)} testID="finance-entry-day" />
        </Field>

        <Field label={t("finance.entry.note")}>
          <TextInput
            testID="finance-entry-note"
            value={note}
            onChangeText={setNote}
            onFocus={() => setPadOpen(false)}
            multiline
            placeholder={t("finance.entry.notePlaceholder")}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t("finance.entry.note")}
            style={{ ...field, minHeight: 72, paddingTop: metrics.space.sm, textAlignVertical: "top" }}
          />
        </Field>
        {error ? (
          <Text tone="danger" accessibilityLiveRegion="polite" testID="finance-entry-error">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <View style={{ paddingVertical: metrics.space.sm }}>
        <Button
          testID="finance-entry-save"
          label={t("common.save")}
          busy={save.isPending}
          disabled={!canSave}
          onPress={() => {
            setError(null);
            save.mutate({ id: existing?.id ?? null, input: { name: name.trim(), amount: value, currency, day, description: note.trim() || null, tags: picked } });
          }}
        />
      </View>

      <TagPicker open={picking} tags={all} selected={tagIds} onChange={setTagIds} onCreate={(n) => createTag.mutate({ name: n, parentId: null })} onClose={() => setPicking(false)} testID="finance-entry-tags" />
      <ChoiceSheet
        open={choosingCurrency}
        title={t("finance.entry.currencyTitle")}
        testID="finance-entry-currencies"
        value={currency}
        choices={CURRENCIES.map((c) => ({ value: c, label: `${CURRENCY_SYMBOLS[c]}  ${c.toUpperCase()}` }))}
        onPick={setCurrency}
        onClose={() => setChoosingCurrency(false)}
      />
    </Screen>
  );
}
