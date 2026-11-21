/**
 * ADD OR EDIT a SafeZone item (owner, 2026-11-15: "everything doable on
 * mobile, finish 100%"). The web's drawers' fields, required ones and payload
 * (`src/screens/safezone/forms.ts`); POST to add, PUT to save an edit.
 *
 * The values live in this screen's state only, never in a cache or on disk
 * (SECURITY.md §8). Behind the same gate as every SafeZone screen (PIN window,
 * capture blocked); a lock wipes the form. Secret fields are typed hidden,
 * with an eye; the password field has the web's generator.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { useNav, useNavParams } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ChevronLeft, Eye, EyeOff, Wand, X } from "@/components/icons";
import { DateWheels } from "@/screens/calendar/pickers";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { FONTS } from "@/theme/fonts";
import { SAFEZONE_KINDS, SafeZoneError, safezoneApi, safezoneKeys, type SafeZoneKind } from "@/api/safezone";
import { failureMessage } from "@/api/failure";
import { useSafezoneLock } from "@/stores/safezoneLock.store";
import { SafeZoneGate } from "@/screens/safezone/SafeZoneGate";
import { FORM_FIELDS, emptyForm, formFromItem, generatePassword, toPayload, validateForm, type FormField, type FormValues } from "@/screens/safezone/forms";

function useParams(): { kind: SafeZoneKind; id: number | null } | null {
  const params = useNavParams<{ kind?: string; id?: string }>();
  const kind = SAFEZONE_KINDS.find((k) => k === params.kind);
  if (!kind) return null;
  const id = params.id ? Number(params.id) : null;
  return id === null || (Number.isInteger(id) && id > 0) ? { kind, id } : null;
}

export default function SafeZoneEditScreen() {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const params = useParams();
  const heading = params ? t(params.id ? `safezone.form.edit.${params.kind}` : `safezone.form.add.${params.kind}`) : "";
  return (
    <Screen avoidKeyboard>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
        <Pressable testID="safezone-form-cancel" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t("common.cancel")} hitSlop={8} style={{ width: 32, height: 32, justifyContent: "center" }}>
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1}>
          {heading}
        </Text>
      </View>
      <SafeZoneGate>{params ? <Form kind={params.kind} id={params.id} /> : <Text tone="danger">{t("safezone.itemFailed")}</Text>}</SafeZoneGate>
    </Screen>
  );
}

function token(): string {
  const live = useSafezoneLock.getState().liveToken();
  if (!live) {
    useSafezoneLock.getState().lock();
    throw new Error("safezone locked");
  }
  return live;
}

function Form({ kind, id }: { kind: SafeZoneKind; id: number | null }) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const lockEpoch = useSafezoneLock((s) => s.lockEpoch);
  const [values, setValues] = useState<FormValues | null>(id === null ? emptyForm(kind) : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // A lock wipes what was typed or loaded.
  const firstEpoch = useRef(lockEpoch);
  useEffect(() => {
    if (lockEpoch === firstEpoch.current) return;
    setValues(id === null ? emptyForm(kind) : null);
    setShown({});
  }, [lockEpoch, id, kind]);

  const load = useCallback(() => {
    if (id === null) return;
    setFailure(null);
    try {
      safezoneApi
        .show(kind, id, token())
        .then((item) => setValues(formFromItem(item)))
        .catch((e: unknown) => setFailure(failureMessage(e, t("safezone.itemFailed"))));
    } catch (e) {
      setFailure(failureMessage(e, t("safezone.itemFailed")));
    }
  }, [kind, id, t]);
  useEffect(() => {
    if (values === null) load();
  }, [values, load]);

  if (failure && values === null) {
    return (
      <View style={{ gap: metrics.space.md }}>
        <Text testID="safezone-form-failed" tone="danger">{failure}</Text>
        <Button label={t("common.tryAgain")} block={false} onPress={load} />
      </View>
    );
  }
  if (values === null) return <ActivityIndicator testID="safezone-form-loading" style={{ marginTop: metrics.space.xl }} />;

  const set = (key: string, value: string) => {
    setValues((v) => (v ? { ...v, [key]: value } : v));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const save = async () => {
    const found = validateForm(kind, values);
    if (Object.keys(found).length) {
      setErrors(Object.fromEntries(Object.entries(found).map(([k, why]) => [k, t(`safezone.form.errors.${why}`)])));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const payload = toPayload(kind, values);
      const saved = id === null ? await safezoneApi.create(kind, payload, token()) : await safezoneApi.update(kind, id, payload, token());
      void queryClient.invalidateQueries({ queryKey: safezoneKeys.lists() });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setValues(null); // nothing typed stays in memory
      if (id === null) router.replace({ pathname: "/safezone/item", params: { kind, id: String(saved.id) } });
      else router.back();
    } catch (e) {
      if (e instanceof SafeZoneError && e.kind === "invalid" && Object.keys(e.fields).length) {
        setErrors(Object.fromEntries(Object.entries(e.fields).map(([k, msgs]) => [k, msgs.join(" ")])));
      } else {
        setFailure(failureMessage(e, t("safezone.form.saveFailed")));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView testID="safezone-form" contentContainerStyle={{ gap: metrics.space.md, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {FORM_FIELDS[kind].map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={values[field.key] ?? ""}
          error={errors[field.key]}
          shown={Boolean(shown[field.key])}
          onToggle={() => setShown((s) => ({ ...s, [field.key]: !s[field.key] }))}
          onChange={(v) => set(field.key, v)}
          onGenerate={
            kind === "passwords" && field.key === "password"
              ? () => {
                  set("password", generatePassword());
                  void Haptics.selectionAsync().catch(() => undefined);
                }
              : undefined
          }
        />
      ))}
      {failure ? (
        <Text testID="safezone-form-failure" tone="danger" accessibilityLiveRegion="polite">
          {failure}
        </Text>
      ) : null}
      <Button testID="safezone-form-save" label={t("safezone.form.save")} busy={busy} onPress={() => void save()} />
      <Text tone="muted" variant="caption" style={{ textAlign: "center", color: colors.inkMuted }}>
        {t("safezone.form.hint")}
      </Text>
    </ScrollView>
  );
}

function FieldInput({
  field, value, error, shown, onToggle, onChange, onGenerate,
}: {
  field: FormField;
  value: string;
  error?: string;
  shown: boolean;
  onToggle: () => void;
  onChange: (v: string) => void;
  onGenerate?: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const label = t(`safezone.field.${field.key}`);

  if (field.options) {
    const optionLabel = (v: string) => t(field.key === "card_type" ? `safezone.cardTypes.${v}` : `safezone.identityTypes.${v}`);
    return (
      <View style={{ gap: metrics.space.xs }}>
        <Text variant="label">{label}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }} accessibilityRole="radiogroup">
          {field.options.map((v) => {
            const on = value === v;
            return (
              <Pressable
                key={v}
                testID={`safezone-form-option-${field.key}-${v}`}
                onPress={() => onChange(v)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={{ paddingHorizontal: metrics.space.md, minHeight: 40, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : "transparent" }}
              >
                <Text variant="label" tone={on ? "onAccent" : "default"}>{optionLabel(v)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  if (field.date) return <DateField field={field} value={value} label={label} error={error} onChange={onChange} />;

  const hidden = Boolean(field.secret) && !shown;
  return (
    <View style={{ gap: metrics.space.xs }}>
      <Text variant="label">
        {label}
        {field.required ? <Text tone="danger"> *</Text> : null}
      </Text>
      <View style={{ flexDirection: "row", alignItems: field.multiline ? "flex-start" : "center", gap: metrics.space.xs, borderWidth: 1, borderColor: error ? colors.danger : colors.border, borderRadius: metrics.radius.md, backgroundColor: colors.surface, paddingLeft: metrics.space.md }}>
        <TextInput
          testID={`safezone-form-field-${field.key}`}
          value={value}
          onChangeText={onChange}
          // The card's expiry, as the web's drawer asks for it, in the reader's language.
          placeholder={field.key === "expiry_date" ? t("safezone.form.expiryPlaceholder") : undefined}
          placeholderTextColor={colors.inkMuted}
          secureTextEntry={field.secret ? hidden : undefined}
          maxLength={field.maxLength}
          multiline={field.multiline}
          keyboardType={field.keyboard ?? "default"}
          autoCapitalize={field.keyboard || field.secret ? "none" : "sentences"}
          autoCorrect={!field.secret && !field.keyboard}
          // No keyboard learning, no autofill suggestions for a secret.
          autoComplete={field.secret ? "off" : undefined}
          importantForAutofill={field.secret ? "no" : undefined}
          accessibilityLabel={label}
          style={{ flex: 1, minHeight: field.multiline ? 96 : 48, paddingVertical: metrics.space.sm, color: colors.ink, fontSize: 16, fontFamily: field.mono && !hidden ? FONTS.mono : undefined, textAlignVertical: field.multiline ? "top" : "center" }}
        />
        {onGenerate ? (
          <Pressable testID="safezone-form-generate" onPress={onGenerate} accessibilityRole="button" accessibilityLabel={t("safezone.form.generate")} style={{ width: 44, height: 48, alignItems: "center", justifyContent: "center" }}>
            <Wand size={20} color={colors.accent} />
          </Pressable>
        ) : null}
        {field.secret ? (
          <Pressable testID={`safezone-form-reveal-${field.key}`} onPress={onToggle} accessibilityRole="button" accessibilityLabel={shown ? t("safezone.hide", { field: label }) : t("safezone.reveal", { field: label })} style={{ width: 44, height: 48, alignItems: "center", justifyContent: "center" }}>
            {shown ? <EyeOff size={20} color={colors.accent} /> : <Eye size={20} color={colors.accent} />}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text testID={`safezone-form-error-${field.key}`} tone="danger" variant="caption" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * An identity's date on the Calendar's date wheels (`DateWheels`, as the
 * contact's birthday), not typed as YYYY-MM-DD (audit 2026-11-16, P2). Empty
 * until tapped; a tap opens the wheels on today; × clears it.
 */
function DateField({ field, value, label, error, onChange }: { field: FormField; value: string; label: string; error?: string; onChange: (v: string) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const shownDate = valid ? new Date(`${value}T12:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" }) : value;
  const maxYear = new Date().getFullYear() + (field.futureYears ?? 0);
  return (
    <View style={{ gap: metrics.space.xs }}>
      <Text variant="label">{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: error ? colors.danger : colors.border, borderRadius: metrics.radius.md, backgroundColor: colors.surface, paddingLeft: metrics.space.md }}>
        <Pressable
          testID={`safezone-form-date-${field.key}`}
          onPress={() => {
            if (!valid) onChange(today());
            setOpen((o) => !o || !valid);
          }}
          accessibilityRole="button"
          accessibilityLabel={value ? `${label}: ${shownDate}` : t("safezone.form.pickDate", { field: label })}
          accessibilityState={{ expanded: open }}
          style={{ flex: 1, minHeight: 48, justifyContent: "center" }}
        >
          <Text tone={value ? "default" : "accent"}>{value ? shownDate : t("safezone.form.pickDate", { field: label })}</Text>
        </Pressable>
        {value ? (
          <Pressable
            testID={`safezone-form-date-${field.key}-clear`}
            onPress={() => {
              setOpen(false);
              onChange("");
            }}
            accessibilityRole="button"
            accessibilityLabel={t("safezone.form.clearDate", { field: label })}
            style={{ width: 44, height: 48, alignItems: "center", justifyContent: "center" }}
          >
            <X size={18} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>
      {open && valid ? (
        <View style={{ paddingVertical: metrics.space.sm }}>
          <DateWheels testID={`safezone-form-wheels-${field.key}`} value={value} onChange={onChange} label={label} maxYear={maxYear} />
        </View>
      ) : null}
      {error ? (
        <Text testID={`safezone-form-error-${field.key}`} tone="danger" variant="caption" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
