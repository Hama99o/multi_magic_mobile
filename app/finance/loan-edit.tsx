/**
 * A loan, new or edited (`docs/design/finance/SPEC.md` §D.7, F20, B7 B8; the
 * web's `LoanDrawer` form). A modal, like `contacts/edit`.
 *
 * Lent / Borrowed, the person (typed, or picked from Contacts: the server
 * keeps only the name), the amount on the Finance keypad with its currency,
 * the due day (or none), the category and labels (made on the spot if
 * missing), and a note. A new loan starts in the currency this user used
 * last (`useLastCurrency`, shared with the entry sheet; there is no server
 * setting). Tags are sent as the web sends them: the first picked is
 * the category, every picked one a label.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useNav, useNavParams } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { contactsKeys, financeKeys } from "@/api/keys";
import { contactsApi, displayName, type Contact } from "@/api/contacts";
import { CURRENCIES, CURRENCY_SYMBOLS, financeApi, type Currency, type Loan, type LoanType, type Tag } from "@/api/finance";
import { apiErrorMessage } from "@/api/http";
import { BookUser, Plus, Search, X } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { KeyboardPadding } from "@/components/KeyboardPadding";
import { useColors, useMetrics } from "@/hooks/useColors";
import { FILL } from "@/theme/fill";
import { ChoiceSheet } from "@/screens/calendar/ChoiceSheet";
import { MonthGrid } from "@/screens/calendar/MonthGrid";
import { addDays, addMonths, formatDay, startOfMonth, todayKey } from "@/screens/calendar/dates";
import { ContactAvatar } from "@/screens/contacts/ContactAvatar";
import { AmountPad, CurrencyChip, FChip, Field, MONEY_IN, MONEY_OWED, TagPicker, typedAmount } from "@/screens/finance/parts";
import { useCreateTag, useSaveLoan } from "@/screens/finance/useFinanceMutations";
import { APP_CURRENCY, useLastCurrency } from "@/screens/finance/lastCurrency";


export default function LoanEditScreen() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const params = useNavParams<{ id?: string }>();
  const loanId = params.id ? Number(params.id) : null;
  const query = useQuery({ queryKey: financeKeys.loan(loanId ?? 0), queryFn: () => financeApi.loans.show(loanId ?? 0), enabled: loanId != null });
  if (loanId != null && !query.data) {
    return (
      <Screen measure>
        <View style={{ paddingTop: metrics.space.xl }}>
          <LoadFailure error={query.error} loadFailed={t("finance.loans.form.loadFailed")} hasData={false} updatedAt={query.dataUpdatedAt} onRetry={() => void query.refetch()} testID="finance-loan-form-load-failed" />
          {query.error ? null : <RowsSkeleton rows={5} testID="finance-loan-form-loading" />}
        </View>
      </Screen>
    );
  }
  return <Form key={query.data?.id ?? "new"} existing={loanId != null ? (query.data ?? null) : null} />;
}

function Form({ existing }: { existing: Loan | null }) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const today = todayKey();
  const [type, setType] = useState<LoanType>(existing?.type ?? "given");
  const [name, setName] = useState(existing?.contactName ?? "");
  const [value, setValue] = useState(existing ? String(existing.amount) : "");
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? APP_CURRENCY);
  const [dueDate, setDueDate] = useState<string | null>(existing?.dueDate ?? null);
  const [tagIds, setTagIds] = useState<number[]>(() => (existing ? [...new Set([existing.tagId, ...existing.labelIds].filter((x): x is number => x != null))] : []));
  const [description, setDescription] = useState(existing?.description ?? "");
  const [choosingCurrency, setChoosingCurrency] = useState(false);
  const [pickingTags, setPickingTags] = useState(false);
  const [pickingContact, setPickingContact] = useState(false);
  const [pickingDay, setPickingDay] = useState(false);
  const [month, setMonth] = useState(startOfMonth(existing?.dueDate ?? today));
  const [error, setError] = useState<string | null>(null);
  const touchedCurrency = useRef(existing != null);

  // A new loan starts in the currency this user used last (lastCurrency.ts).
  const last = useLastCurrency();
  useEffect(() => {
    if (touchedCurrency.current || !last.ready) return;
    touchedCurrency.current = true;
    setCurrency(last.currency);
  }, [last.ready, last.currency]);

  const tags = useQuery({ queryKey: financeKeys.tags(), queryFn: financeApi.tags.all });
  const createTag = useCreateTag({ onDone: (tag) => setTagIds((ids) => (ids.includes(tag.id) ? ids : [...ids, tag.id])), onError: () => setError(t("finance.loans.failed")) });
  const save = useSaveLoan({
    onDone: () => {
      last.remember(currency);
      router.back();
    },
    onError: (e) => setError(apiErrorMessage(e) ?? t("finance.loans.failed")),
  });

  const picked: Tag[] = tagIds.map((id) => tags.data?.find((x) => x.id === id) ?? { id, name: "", parentId: null });
  const pickedNames = picked.map((x) => x.name).filter(Boolean);
  const amount = Number(value || "0");
  const shown = `${CURRENCY_SYMBOLS[currency]}${typedAmount(value, i18n.language)}`;
  const canSave = Boolean(name.trim()) && amount > 0;
  const field = { borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, backgroundColor: colors.surface, fontSize: 16 } as const;
  const weekOn = addDays(today, 7);
  const monthOn = addMonths(today, 1);
  const customDue = dueDate != null && dueDate !== weekOn && dueDate !== monthOn;

  const submit = () => {
    setError(null);
    save.mutate({
      id: existing?.id ?? null,
      input: { type, contactName: name.trim(), amount, currency, dueDate, description: description.trim() || null, tags: picked },
    });
  };

  return (
    <Screen measure avoidKeyboard>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
        <Pressable testID="finance-loan-form-close" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8} style={{ width: 32, height: 32, justifyContent: "center" }}>
          <X size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          {existing ? t("finance.loans.form.editTitle") : t("finance.loans.form.newTitle")}
        </Text>
      </View>

      <ScrollView testID="finance-loan-edit" keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: metrics.space.lg, paddingBottom: metrics.space.xl }}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t("finance.loans.form.type")} style={{ flexDirection: "row", gap: metrics.space.xs, padding: metrics.space.xs, borderRadius: metrics.radius.md, backgroundColor: colors.surface }}>
          {(["given", "taken"] as const).map((k) => {
            const on = type === k;
            const tone = k === "given" ? MONEY_IN : MONEY_OWED;
            const label = k === "given" ? t("finance.loans.form.lent") : t("finance.loans.form.borrowed");
            return (
              <Pressable
                key={k}
                testID={`finance-loan-form-type-${k}`}
                onPress={() => setType(k)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={label}
                style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: metrics.radius.sm, backgroundColor: on ? tone : "transparent" }}
              >
                <Text variant="label" style={{ color: on ? "#04161a" : colors.ink }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Field label={t("finance.loans.form.contact")}>
          <View style={{ flexDirection: "row", gap: metrics.space.sm, alignItems: "center" }}>
            <TextInput
              testID="finance-loan-form-name"
              value={name}
              onChangeText={setName}
              placeholder={t("finance.loans.form.contactPlaceholder")}
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel={t("finance.loans.form.contact")}
              autoCapitalize="words"
              style={{ ...field, flex: 1, minHeight: 48 }}
            />
            <Pressable
              testID="finance-loan-form-from-contacts"
              onPress={() => setPickingContact(true)}
              accessibilityRole="button"
              accessibilityLabel={t("finance.loans.form.fromContacts")}
              style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs, minHeight: 48, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border }}
            >
              <BookUser size={18} color={colors.ink} />
              <Text variant="label">{t("finance.loans.form.fromContacts")}</Text>
            </Pressable>
          </View>
        </Field>

        <Field label={t("finance.loans.form.amount")}>
          <View style={{ alignItems: "center", gap: metrics.space.sm }}>
            <Text
              testID="finance-loan-form-amount"
              accessibilityLabel={t("finance.loans.form.amountValue", { amount: shown })}
              accessibilityLiveRegion="polite"
              style={{ fontSize: 40, lineHeight: 48, fontWeight: "700", color: amount > 0 ? colors.ink : colors.inkMuted, fontVariant: ["tabular-nums"] }}
            >
              {shown}
            </Text>
            <CurrencyChip testID="finance-loan-form-currency" value={currency} onPress={() => setChoosingCurrency(true)} />
          </View>
          <AmountPad value={value} onChange={setValue} testID="finance-loan-form-pad" />
        </Field>

        <Field label={t("finance.loans.form.due")}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
            <FChip testID="finance-loan-form-due-none" label={t("finance.loans.noDueDate")} selected={dueDate == null} onPress={() => { setDueDate(null); setPickingDay(false); }} />
            <FChip testID="finance-loan-form-due-week" label={t("finance.loans.form.inWeek")} selected={dueDate === weekOn} onPress={() => { setDueDate(weekOn); setPickingDay(false); }} />
            <FChip testID="finance-loan-form-due-month" label={t("finance.loans.form.inMonth")} selected={dueDate === monthOn} onPress={() => { setDueDate(monthOn); setPickingDay(false); }} />
            <FChip
              testID="finance-loan-form-due-pick"
              label={customDue && dueDate ? formatDay(dueDate, i18n.language, true) : t("finance.loans.form.pick")}
              selected={customDue || pickingDay}
              onPress={() => setPickingDay((p) => !p)}
            />
          </View>
          {pickingDay ? (
            <MonthGrid
              testID="finance-loan-form-due-month-grid"
              month={month}
              selected={dueDate}
              today={today}
              onMonthChange={setMonth}
              onSelect={(d) => {
                setDueDate(d);
                setPickingDay(false);
              }}
            />
          ) : null}
        </Field>

        <Field label={t("finance.loans.form.tags")}>
          <Pressable
            testID="finance-loan-form-tags"
            onPress={() => setPickingTags(true)}
            accessibilityRole="button"
            accessibilityLabel={pickedNames.length ? `${t("finance.loans.form.tags")}: ${pickedNames.join(", ")}` : t("finance.loans.form.addTags")}
            style={{ ...field, minHeight: 48, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: metrics.space.xs, paddingVertical: metrics.space.xs }}
          >
            {pickedNames.length ? (
              pickedNames.map((n, i) => (
                <View key={`${n}-${i}`} style={{ paddingHorizontal: metrics.space.sm, paddingVertical: 2, borderRadius: metrics.radius.pill, backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.border }}>
                  <Text variant="caption">{n}</Text>
                </View>
              ))
            ) : (
              <>
                <Plus size={18} color={colors.inkMuted} />
                <Text tone="muted">{t("finance.loans.form.addTags")}</Text>
              </>
            )}
          </Pressable>
        </Field>

        <Field label={t("finance.loans.form.description")}>
          <TextInput
            testID="finance-loan-form-description"
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder={t("finance.loans.form.descriptionPlaceholder")}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t("finance.loans.form.description")}
            style={{ ...field, minHeight: 88, paddingTop: metrics.space.sm, textAlignVertical: "top" }}
          />
        </Field>

        {error ? (
          <Text testID="finance-loan-form-error" tone="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </ScrollView>
      {/* Pinned, as in the entry sheet: Save never hides below the keypad (device QA F8). */}
      <View style={{ paddingVertical: metrics.space.sm }}>
        <Button testID="finance-loan-form-save" label={t("finance.loans.form.save")} busy={save.isPending} disabled={!canSave} onPress={submit} />
      </View>

      <ChoiceSheet
        open={choosingCurrency}
        title={t("finance.loans.form.currency")}
        testID="finance-loan-form-currencies"
        value={currency}
        choices={CURRENCIES.map((c) => ({ value: c, label: `${CURRENCY_SYMBOLS[c]} ${c.toUpperCase()}` }))}
        onPick={(c) => {
          touchedCurrency.current = true;
          setCurrency(c);
        }}
        onClose={() => setChoosingCurrency(false)}
      />
      <TagPicker
        open={pickingTags}
        tags={tags.data ?? []}
        selected={tagIds}
        onChange={setTagIds}
        onCreate={(n) => createTag.mutate({ name: n, parentId: null })}
        onClose={() => setPickingTags(false)}
        testID="finance-loan-form-tagpicker"
      />
      <ContactPicker
        open={pickingContact}
        onPick={(c) => {
          setName(displayName(c));
          setPickingContact(false);
        }}
        onClose={() => setPickingContact(false)}
      />
    </Screen>
  );
}

/** B8: a searchable sheet of the address book; the pick fills the name (the server keeps only the name). */
function ContactPicker({ open, onPick, onClose }: { open: boolean; onPick: (c: Contact) => void; onClose: () => void }) {
  if (!open) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <ContactPickerBody onPick={onPick} onClose={onClose} />
    </Modal>
  );
}

function ContactPickerBody({ onPick, onClose }: { onPick: (c: Contact) => void; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [term, setTerm] = useState("");
  const contacts = useQuery({ queryKey: contactsKeys.list(), queryFn: contactsApi.list });
  const q = term.trim().toLocaleLowerCase();
  const shown = useMemo(
    () =>
      (contacts.data ?? [])
        .filter((c) => displayName(c))
        .filter((c) => !q || displayName(c).toLocaleLowerCase().includes(q) || (c.nickname ?? "").toLocaleLowerCase().includes(q))
        .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [contacts.data, q],
  );

  return (
    <KeyboardPadding>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.5)" }} />
        <View
          testID="finance-loan-contacts"
          style={{ backgroundColor: colors.ground, borderTopLeftRadius: metrics.radius.lg, borderTopRightRadius: metrics.radius.lg, padding: metrics.space.lg, paddingBottom: metrics.space.lg + insets.bottom, height: "80%", width: "100%", maxWidth: metrics.maxMeasure, alignSelf: "center", gap: metrics.space.sm }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text variant="title" accessibilityRole="header" style={{ flex: 1, fontSize: 20 }}>
              {t("finance.loans.contacts.title")}
            </Text>
            <Pressable testID="finance-loan-contacts-close" onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8} style={{ width: metrics.touch, height: metrics.touch, alignItems: "flex-end", justifyContent: "center" }}>
              <X size={22} color={colors.ink} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md }}>
            <Search size={18} color={colors.inkMuted} />
            <TextInput
              testID="finance-loan-contacts-search"
              value={term}
              onChangeText={setTerm}
              placeholder={t("finance.loans.contacts.search")}
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel={t("finance.loans.contacts.search")}
              autoCorrect={false}
              style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }}
            />
          </View>
          <LoadFailure error={contacts.error} loadFailed={t("finance.loans.contacts.loadFailed")} hasData={Boolean(contacts.data)} updatedAt={contacts.dataUpdatedAt} onRetry={() => void contacts.refetch()} testID="finance-loan-contacts-load-failed" padded={false} />
          <FlatList
            data={shown}
            keyExtractor={(c) => String(c.id)}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              contacts.isPending && !contacts.error ? (
                <RowsSkeleton rows={5} testID="finance-loan-contacts-loading" />
              ) : contacts.data ? (
                <Text tone="muted" style={{ paddingVertical: metrics.space.lg }}>
                  {t("finance.loans.contacts.empty")}
                </Text>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable
                testID={`finance-loan-contact-${item.id}`}
                onPress={() => onPick(item)}
                accessibilityRole="button"
                accessibilityLabel={displayName(item)}
                style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 56 }}
              >
                <ContactAvatar contact={item} size={36} />
                <Text style={{ flex: 1 }} numberOfLines={1}>
                  {displayName(item)}
                </Text>
              </Pressable>
            )}
          />
        </View>
      </View>
    </KeyboardPadding>
  );
}
