/**
 * The parts every Finance screen shares (`docs/design/finance/SPEC.md` §D,
 * REFERENCES.md "patterns that recur"): the hero amount with smaller cents,
 * the month switched in place, the entry keypad, the day chooser, the
 * category picker, the progress bar, and two small SVG charts. Tokens only.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { CURRENCY_SYMBOLS, formatMoney, type Currency, type Tag } from "@/api/finance";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Delete, Plus, Search, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { KeyboardPadding } from "@/components/KeyboardPadding";
import { useColors, useMetrics } from "@/hooks/useColors";
import { GOLD } from "@/theme/appColors";
import { CATEGORY_COLORS } from "@/theme/tokens";
import { FILL } from "@/theme/fill";
import { MonthGrid } from "@/screens/calendar/MonthGrid";
import { addDays, parseDay, startOfMonth, todayKey } from "@/screens/calendar/dates";

export const FINANCE = GOLD;
const [, GREEN, ORANGE] = CATEGORY_COLORS;
/** Colour is the sign (REFERENCES pattern 4): money in / owed to you. */
export const MONEY_IN = GREEN;
/** "You owe" and a budget at 80%. Red is kept for over budget and overdue. */
export const MONEY_OWED = ORANGE;
/** A category's colour in a chart, by its rank: the icon's palette in order. */
export const chartColor = (i: number) => CATEGORY_COLORS[i % CATEGORY_COLORS.length];

/** "€1,234" big with ".50" smaller (Revolut, Cleo). */
export function HeroAmount({ amount, currency, tone, testID, size = 34 }: { amount: number; currency: Currency; tone?: string; testID?: string; size?: number }) {
  const colors = useColors();
  const { i18n } = useTranslation();
  const text = formatMoney(amount, currency, i18n.language);
  const sep = (1.5).toLocaleString(i18n.language).charAt(1);
  const cut = text.lastIndexOf(sep);
  const whole = cut > 0 ? text.slice(0, cut) : text;
  const cents = cut > 0 ? text.slice(cut) : "";
  return (
    <Text testID={testID} accessibilityLabel={text} style={{ fontSize: size, lineHeight: size * 1.18, fontWeight: "700", color: tone ?? colors.ink, fontVariant: ["tabular-nums"] }}>
      {whole}
      <Text style={{ fontSize: size * 0.6, fontWeight: "700", color: tone ?? colors.ink }}>{cents}</Text>
    </Text>
  );
}

export function useMoney() {
  const { i18n } = useTranslation();
  return (amount: number, currency: Currency) => formatMoney(amount, currency, i18n.language);
}

/** ‹ November 2026 › with a Month / Year toggle (Monarch, Copilot). `month` 0 = the whole year. */
/** How far ahead a period may go: the web's YEARS_AHEAD, so a post-dated entry stays reachable (`FinanceFilters.tsx:16`). */
export const YEARS_AHEAD = 5;

/**
 * A month, a whole year, or (with `allowAll`) all time, which is `year` 0:
 * `listParams` then sends no year and no month, and the server lists every
 * date (the web's "All years", parity F-E5). The arrows go back without end
 * and forward to the end of `YEARS_AHEAD` years (parity F-E6). The mode
 * button cycles month → year → all time → month.
 */
export function PeriodSwitcher({ year, month, onChange, allowYear = true, allowAll = false, testID = "finance-period" }: { year: number; month: number; onChange: (year: number, month: number) => void; allowYear?: boolean; allowAll?: boolean; testID?: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const now = new Date();
  const all = allowAll && year === 0;
  const label = all ? t("finance.period.allTime") : month ? new Date(year, month - 1, 1).toLocaleDateString(i18n.language, { month: "long", year: "numeric" }) : String(year);
  const step = (by: number) => {
    if (!month) return onChange(year + by, 0);
    const d = new Date(year, month - 1 + by, 1);
    onChange(d.getFullYear(), d.getMonth() + 1);
  };
  const lastYear = now.getFullYear() + YEARS_AHEAD;
  const atEnd = month ? year > lastYear || (year === lastYear && month === 12) : year >= lastYear;
  const nextMode = () => {
    if (month) return onChange(year, 0);
    if (allowAll && !all) return onChange(0, 0);
    const y = all ? now.getFullYear() : year;
    return onChange(y, y === now.getFullYear() ? now.getMonth() + 1 : 12);
  };
  const modeA11y = month ? t("finance.period.showYear") : allowAll && !all ? t("finance.period.showAll") : t("finance.period.showMonth");
  const modeText = month ? t("finance.period.year") : allowAll && !all ? t("finance.period.all") : t("finance.period.month");
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
      {all ? null : (
        <Pressable testID={`${testID}-prev`} onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel={t("finance.period.previous")} hitSlop={8} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
          <ChevronLeft size={22} color={colors.ink} />
        </Pressable>
      )}
      <Text testID={`${testID}-label`} variant="label" style={{ flex: 1, textAlign: "center", fontSize: 17, textTransform: "capitalize", minHeight: all ? metrics.touch : undefined, lineHeight: all ? metrics.touch : undefined }} accessibilityRole="header">
        {label}
      </Text>
      {all ? null : (
        <Pressable testID={`${testID}-next`} onPress={() => step(1)} disabled={atEnd} accessibilityRole="button" accessibilityLabel={t("finance.period.next")} accessibilityState={{ disabled: atEnd }} hitSlop={8} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center", opacity: atEnd ? 0.3 : 1 }}>
          <ChevronRight size={22} color={colors.ink} />
        </Pressable>
      )}
      {allowYear ? (
        <Pressable
          testID={`${testID}-mode`}
          onPress={nextMode}
          accessibilityRole="button"
          accessibilityLabel={modeA11y}
          style={{ minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: colors.border, justifyContent: "center" }}
        >
          <Text variant="caption">{modeText}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Newest first, the owner's default for every list (2026-11-09; Hello's
 * call for Finance, 2026-11-20). The finance serializers send no
 * `created_at`, and ids only grow, so the newest record has the largest id.
 */
export function newestFirst<T extends { id: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.id - a.id);
}

/** One chip that switches a list between Newest first and its other order; the label says the order in force. */
export function SortChip<K extends string>({ value, options, onChange, testID }: { value: K; options: readonly { key: K; label: string }[]; onChange: (key: K) => void; testID: string }) {
  const { t } = useTranslation();
  const at = Math.max(0, options.findIndex((o) => o.key === value));
  const current = options[at]!;
  const next = options[(at + 1) % options.length]!;
  return <FChip testID={testID} label={current.label} onPress={() => onChange(next.key)} a11yLabel={t("finance.sort.a11y", { order: current.label, next: next.label })} />;
}

/** One small chip (the Todo chip's twin, in the Finance colour). */
export function FChip({ label, selected = false, onPress, testID, a11yLabel }: { label: string; selected?: boolean; onPress: () => void; testID: string; a11yLabel?: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={a11yLabel ?? label}
      style={{ minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: selected ? FINANCE : colors.border, backgroundColor: selected ? `${FINANCE}33` : colors.surface, justifyContent: "center" }}
    >
      <Text variant="label" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The entry keypad (GoPay, Buddy): digits, the decimal mark, delete. The value is a plain "12.5" string. */
export function AmountPad({ value, onChange, testID = "finance-pad" }: { value: string; onChange: (v: string) => void; testID?: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const mark = (1.5).toLocaleString(i18n.language).charAt(1);
  const press = (k: string) => {
    void Haptics.selectionAsync().catch(() => undefined);
    if (k === "del") return onChange(value.slice(0, -1));
    if (k === ".") return value.includes(".") ? undefined : onChange(value ? `${value}.` : "0.");
    const [, dec] = value.split(".");
    if (dec !== undefined && dec.length >= 2) return;
    if (value.replace(".", "").length >= 11) return;
    onChange(value === "0" ? k : value + k);
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];
  return (
    <View testID={testID} style={{ flexDirection: "row", flexWrap: "wrap", rowGap: metrics.space.sm }}>
      {keys.map((k) => (
        <Pressable
          key={k}
          testID={`${testID}-${k === "." ? "dot" : k}`}
          onPress={() => press(k)}
          accessibilityRole="button"
          accessibilityLabel={k === "del" ? t("finance.entry.deleteDigit") : k === "." ? t("finance.entry.decimal") : k}
          android_ripple={{ color: colors.surface, borderless: false }}
          style={{ width: "33.33%", height: 56, alignItems: "center", justifyContent: "center", borderRadius: metrics.radius.md }}
        >
          {k === "del" ? <Delete size={24} color={colors.ink} /> : <Text style={{ fontSize: 26, fontWeight: "500" }}>{k === "." ? mark : k}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

/** The typed "12.5" shown in the app's language ("12,5" in French), as it is typed. */
export function typedAmount(value: string, language: string): string {
  if (!value) return "0";
  const [whole, dec] = value.split(".");
  const w = Number(whole || "0").toLocaleString(language);
  return dec === undefined ? w : `${w}${(1.5).toLocaleString(language).charAt(1)}${dec}`;
}

/** Today / Yesterday / a day from the month grid (Copilot's date row). */
/**
 * Today, yesterday, or a picked day. `onNone` adds "No date": an expense or
 * an income may have none, as on the web (parity F-E13); `value` is then
 * null. Without it a caller always has a day.
 */
export function DayChooser({ value, onChange, onNone, testID }: { value: string | null; onChange: (day: string) => void; onNone?: () => void; testID: string }) {
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const today = todayKey();
  const [picking, setPicking] = useState(false);
  const [month, setMonth] = useState(startOfMonth(value || today));
  const custom = value != null && value !== today && value !== addDays(today, -1);
  return (
    <View style={{ gap: metrics.space.sm }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
        <FChip testID={`${testID}-today`} label={t("finance.day.today")} selected={value === today} onPress={() => onChange(today)} />
        <FChip testID={`${testID}-yesterday`} label={t("finance.day.yesterday")} selected={value === addDays(today, -1)} onPress={() => onChange(addDays(today, -1))} />
        {onNone ? <FChip testID={`${testID}-none`} label={t("finance.day.none")} selected={value == null} onPress={onNone} /> : null}
        <FChip
          testID={`${testID}-pick`}
          label={custom && value ? parseDay(value).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" }) : t("finance.day.pick")}
          selected={custom || picking}
          onPress={() => setPicking((p) => !p)}
        />
      </View>
      {picking ? (
        <MonthGrid
          testID={`${testID}-month`}
          month={month}
          selected={value ?? ""}
          today={today}
          onMonthChange={setMonth}
          onSelect={(d) => {
            onChange(d);
            setPicking(false);
          }}
        />
      ) : null}
    </View>
  );
}

/** A labelled section of a form. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const metrics = useMetrics();
  return (
    <View style={{ gap: metrics.space.xs }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      {children}
    </View>
  );
}

/** A thin bar that grows to its share on first show; `color` carries the state (budget green / orange / red). */
export function ShareBar({ share, color, testID }: { share: number; color: string; testID?: string }) {
  const colors = useColors();
  const w = useSharedValue(0);
  const target = Math.max(0, Math.min(1, share));
  // From 0 to the share on first show, and to each new share (400 ms).
  useEffect(() => {
    w.value = withTiming(target, { duration: 400 });
  }, [target, w]);
  const style = useAnimatedStyle(() => ({ width: `${Math.round(w.value * 100)}%` }));
  return (
    <View testID={testID} style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
      <Animated.View style={[{ height: "100%", borderRadius: 4, backgroundColor: color }, style]} />
    </View>
  );
}

/** Budget colour: under 80% green, from 80% orange, from 100% red (the web's thresholds). */
export function budgetColor(spent: number, amount: number, danger: string): string {
  const r = amount > 0 ? spent / amount : 0;
  return r >= 1 ? danger : r >= 0.8 ? MONEY_OWED : MONEY_IN;
}

/** A donut of shares (Origin, Revolut). */
export function Donut({ values, size = 160, testID }: { values: number[]; size?: number; testID?: string }) {
  const colors = useColors();
  const total = values.reduce((a, b) => a + b, 0);
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <Animated.View entering={FadeIn.duration(400)} testID={testID}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surface} strokeWidth={22} fill="none" />
          {total > 0
            ? values.map((v, i) => {
                const len = (v / total) * c;
                const el = <Circle key={i} cx={size / 2} cy={size / 2} r={r} stroke={chartColor(i)} strokeWidth={22} fill="none" strokeDasharray={`${Math.max(len - 2, 0.1)} ${c}`} strokeDashoffset={-offset} />;
                offset += len;
                return el;
              })
            : null}
        </G>
      </Svg>
    </Animated.View>
  );
}

/** Paired (or single) bars over months (the web's cash-flow chart). */
export function Bars({ series, labels, height = 140, testID }: { series: { values: number[]; color: string }[]; labels: string[]; height?: number; testID?: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const n = labels.length || 1;
  const slot = width / n;
  const bw = Math.max(3, (slot - 6) / series.length);
  return (
    <View testID={testID} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: metrics.space.xs }}>
      {width ? (
        <Svg width={width} height={height}>
          <Path d={`M0 ${height - 0.5} H${width}`} stroke={colors.border} strokeWidth={1} />
          {series.map((s, si) =>
            s.values.map((v, i) => {
              const h = (v / max) * (height - 6);
              return <Rect key={`${si}-${i}`} x={i * slot + 3 + si * bw} y={height - h} width={bw - 1} height={Math.max(h, v > 0 ? 2 : 0)} rx={2} fill={s.color} />;
            }),
          )}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
      <View style={{ flexDirection: "row" }}>
        {labels.map((l, i) => (
          <Text key={i} variant="caption" tone="muted" style={{ width: slot, textAlign: "center", fontSize: 10 }} numberOfLines={1}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** "Nov", with the year on January ("Jan 26"), the web's `shortPeriodLabel`. */
export function shortMonth(label: string, language: string): string {
  const [y, m] = label.split("-").map(Number);
  if (!m) return label;
  const d = new Date(y, m - 1, 1);
  const name = d.toLocaleDateString(language, { month: "short" }).replace(".", "");
  return m === 1 ? `${name} ${String(y).slice(2)}` : name;
}

/**
 * Pick categories, subcategories and labels (the web's one multi-select,
 * `TagMultiSelect`): picking a subcategory picks its category first, search
 * narrows, and a name nothing matches can be made on the spot.
 */
export function TagPicker({
  open,
  tags,
  selected,
  onChange,
  onCreate,
  onClose,
  single = false,
  categoriesOnly = false,
  testID = "finance-tags",
}: {
  open: boolean;
  tags: Tag[];
  selected: number[];
  onChange: (ids: number[]) => void;
  onCreate?: (name: string) => void;
  onClose: () => void;
  /** Budgets and recurring entries take ONE category (a plain select on the web). */
  single?: boolean;
  categoriesOnly?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [term, setTerm] = useState("");
  const tree = useMemo(() => {
    const cats = tags.filter((x) => x.parentId == null).sort((a, b) => a.name.localeCompare(b.name));
    return cats.map((c) => ({ cat: c, subs: categoriesOnly ? [] : tags.filter((x) => x.parentId === c.id).sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [tags, categoriesOnly]);
  const q = term.trim().toLowerCase();
  const visible = tree
    .map(({ cat, subs }) => ({ cat, subs: subs.filter((s) => !q || s.name.toLowerCase().includes(q) || cat.name.toLowerCase().includes(q)), show: !q || cat.name.toLowerCase().includes(q) || subs.some((s) => s.name.toLowerCase().includes(q)) }))
    .filter((x) => x.show);
  const exact = tags.some((x) => x.name.toLowerCase() === q);
  const toggle = (tag: Tag) => {
    if (single) {
      onChange(selected.includes(tag.id) ? [] : [tag.id]);
      onClose();
      return;
    }
    if (selected.includes(tag.id)) return onChange(selected.filter((x) => x !== tag.id));
    const withParent = tag.parentId != null && !selected.includes(tag.parentId) ? [...selected, tag.parentId, tag.id] : [...selected, tag.id];
    onChange(withParent);
  };
  if (!open) return null;
  const row = (tag: Tag, indent: boolean) => {
    const on = selected.includes(tag.id);
    return (
      <Pressable
        key={tag.id}
        testID={`${testID}-tag-${tag.id}`}
        onPress={() => toggle(tag)}
        accessibilityRole={single ? "radio" : "checkbox"}
        accessibilityState={single ? { checked: on } : { checked: on }}
        accessibilityLabel={tag.name}
        style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 48, paddingLeft: indent ? metrics.space.xl : 0 }}
      >
        <Text style={{ flex: 1, fontWeight: indent ? "400" : "600" }}>{tag.name}</Text>
        {on ? <Check size={20} color={FINANCE} /> : null}
      </Pressable>
    );
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardPadding>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.5)" }} />
          <View testID={testID} style={{ backgroundColor: colors.ground, borderTopLeftRadius: metrics.radius.lg, borderTopRightRadius: metrics.radius.lg, padding: metrics.space.lg, paddingBottom: metrics.space.lg + insets.bottom, maxHeight: "85%", width: "100%", maxWidth: metrics.maxMeasure, alignSelf: "center", gap: metrics.space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text variant="title" accessibilityRole="header" style={{ flex: 1, fontSize: 20 }}>
                {single ? t("finance.tags.pickOne") : t("finance.tags.pick")}
              </Text>
              <Pressable testID={`${testID}-done`} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("finance.done")} hitSlop={8} style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.sm }}>
                <Text variant="label" style={{ color: colors.accent }}>
                  {t("finance.done")}
                </Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md }}>
              <Search size={18} color={colors.inkMuted} />
              <TextInput testID={`${testID}-search`} value={term} onChangeText={setTerm} placeholder={t("finance.tags.search")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("finance.tags.search")} style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }} />
              {term ? (
                <Pressable onPress={() => setTerm("")} accessibilityRole="button" accessibilityLabel={t("finance.clearSearch")} hitSlop={8}>
                  <X size={18} color={colors.inkMuted} />
                </Pressable>
              ) : null}
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {single ? (
                <Pressable testID={`${testID}-none`} onPress={() => { onChange([]); onClose(); }} accessibilityRole="radio" accessibilityState={{ checked: selected.length === 0 }} accessibilityLabel={t("finance.tags.none")} style={{ flexDirection: "row", alignItems: "center", minHeight: 48 }}>
                  <Text style={{ flex: 1 }} tone="muted">
                    {t("finance.tags.none")}
                  </Text>
                  {selected.length === 0 ? <Check size={20} color={FINANCE} /> : null}
                </Pressable>
              ) : null}
              {visible.map(({ cat, subs }) => (
                <View key={cat.id}>
                  {row(cat, false)}
                  {subs.map((s) => row(s, true))}
                </View>
              ))}
              {q && !exact && onCreate ? (
                <Pressable testID={`${testID}-create`} onPress={() => { onCreate(term.trim()); setTerm(""); }} accessibilityRole="button" accessibilityLabel={t("finance.tags.create", { name: term.trim() })} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 48 }}>
                  <Plus size={18} color={FINANCE} />
                  <Text style={{ color: colors.ink }}>{t("finance.tags.create", { name: term.trim() })}</Text>
                </Pressable>
              ) : null}
              {!visible.length && !q ? (
                <Text tone="muted" style={{ paddingVertical: metrics.space.lg }}>
                  {t("finance.tags.empty")}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </KeyboardPadding>
    </Modal>
  );
}

/** The currency chip beside an amount: a sheet of the 8, with their symbols. */
export function CurrencyChip({ value, onPress, testID }: { value: Currency; onPress: () => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={t("finance.entry.currency", { code: value.toUpperCase() })} style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <Text variant="label">{`${CURRENCY_SYMBOLS[value]} ${value.toUpperCase()}`}</Text>
      <ChevronDown size={16} color={colors.inkMuted} />
    </Pressable>
  );
}
