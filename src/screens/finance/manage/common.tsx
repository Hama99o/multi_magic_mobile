/**
 * What the Finance "manage" screens share (budgets, recurring, categories,
 * reports, trash; `docs/design/finance/SPEC.md` §D 8-11): the
 * segmented bar, the empty state, the FAB, a small pill button, the amount
 * block of a form, and the repeat label. Tokens only, the Todo family's sizes.
 */
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { CURRENCY_SYMBOLS, type Currency, type Frequency } from "@/api/finance";
import { Plus, type LucideIcon } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { AmountPad, CurrencyChip, FINANCE, typedAmount } from "@/screens/finance/parts";

type Tr = (key: string, options?: Record<string, unknown>) => string;

/** Text on the Finance colour (the tab bar's). */
export const ON_FINANCE = "#04161a";

export function Segmented<T extends string>({ value, options, onChange, testID }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: metrics.radius.md, padding: metrics.space.xs, marginBottom: metrics.space.md }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`${testID}-${o.value}`}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: metrics.radius.sm, backgroundColor: on ? FINANCE : "transparent" }}
          >
            <Text variant="label" style={{ color: on ? ON_FINANCE : colors.ink }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The SafeZone empty state: an 88 dp tinted circle, a title, a line. */
export function EmptyState({ icon: Icon, title, body, testID }: { icon: LucideIcon; title: string; body?: string; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View testID={testID} style={{ alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.xl, paddingHorizontal: metrics.space.lg }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: `${FINANCE}2e`, alignItems: "center", justifyContent: "center" }}>
        <Icon size={40} color={colors.ink} />
      </View>
      <Text variant="title" style={{ fontSize: 20, textAlign: "center" }}>
        {title}
      </Text>
      {body ? (
        <Text tone="muted" style={{ textAlign: "center" }}>
          {body}
        </Text>
      ) : null}
    </View>
  );
}

export function Fab({ onPress, label, testID }: { onPress: () => void; label: string; testID: string }) {
  const metrics = useMetrics();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ position: "absolute", right: metrics.space.lg, bottom: metrics.space.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: FINANCE, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
    >
      <Plus size={26} color={ON_FINANCE} />
    </Pressable>
  );
}

/** A pill button on a card (Pause, Run now, Restore). */
export function PillButton({ icon: Icon, label, a11yLabel, onPress, testID, primary = false, danger = false, disabled = false }: { icon: LucideIcon; label: string; a11yLabel?: string; onPress: () => void; testID: string; primary?: boolean; danger?: boolean; disabled?: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  const tint = danger ? colors.danger : primary ? ON_FINANCE : colors.ink;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 40,
        paddingHorizontal: metrics.space.md,
        borderRadius: metrics.radius.pill,
        backgroundColor: primary ? FINANCE : "transparent",
        borderWidth: primary ? 0 : 1,
        borderColor: danger ? `${colors.danger}66` : colors.border,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon size={15} color={tint} />
      <Text variant="label" style={{ color: tint }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The amount of a form: the typed value large, the currency chip, the keypad. */
export function AmountBlock({ value, onChange, currency, onCurrency, testID }: { value: string; onChange: (v: string) => void; currency: Currency; onCurrency: () => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { i18n } = useTranslation();
  const shown = `${CURRENCY_SYMBOLS[currency]}${typedAmount(value, i18n.language)}`;
  return (
    <View style={{ gap: metrics.space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: metrics.space.md }}>
        <Text testID={`${testID}-value`} accessibilityLabel={shown} style={{ fontSize: 34, lineHeight: 40, fontWeight: "700", color: value ? colors.ink : colors.inkMuted, fontVariant: ["tabular-nums"] }}>
          {shown}
        </Text>
        <CurrencyChip testID={`${testID}-currency`} value={currency} onPress={onCurrency} />
      </View>
      <AmountPad testID={`${testID}-pad`} value={value} onChange={onChange} />
    </View>
  );
}

/** "Every day" / "Every 3 months", plural-aware. Literal keys only (the key scan reads them). */
export function repeatLabel(frequency: Frequency, count: number, t: Tr): string {
  switch (frequency) {
    case "daily":
      return t("finance.manage.recurring.everyDay", { count });
    case "weekly":
      return t("finance.manage.recurring.everyWeek", { count });
    case "yearly":
      return t("finance.manage.recurring.everyYear", { count });
    default:
      return t("finance.manage.recurring.everyMonth", { count });
  }
}

/** "day" / "days", for the unit next to the stepper. */
export function unitLabel(frequency: Frequency, count: number, t: Tr): string {
  switch (frequency) {
    case "daily":
      return t("finance.manage.recurring.unitDay", { count });
    case "weekly":
      return t("finance.manage.recurring.unitWeek", { count });
    case "yearly":
      return t("finance.manage.recurring.unitYear", { count });
    default:
      return t("finance.manage.recurring.unitMonth", { count });
  }
}

/** Sum amounts per currency, to the cent, never across currencies. */
export function sumByCurrency<R extends { amount: number; currency: Currency }>(rows: R[]): Partial<Record<Currency, number>> {
  return rows.reduce<Partial<Record<Currency, number>>>((t, r) => ({ ...t, [r.currency]: Math.round(((t[r.currency] ?? 0) + r.amount) * 100) / 100 }), {});
}
