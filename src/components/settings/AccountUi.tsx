/**
 * The pieces every account screen repeats: the back-and-title row the
 * existing account screens draw (`app/account.tsx`, `app/profile.tsx`), a
 * grouped card, a section title, a plain row, and the destructive confirm.
 *
 * The confirm is `Alert.alert` with a destructive button, as on the AI keys
 * screen (`ai-keys.tsx`): one shape for "sign this device out", "clear
 * history", "delete this key", "disconnect", "stop sharing", so a person
 * learns it once.
 */
import type { ReactNode } from "react";
import { Alert, I18nManager, Pressable, View } from "react-native";
import { useNav } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { t as translate } from "@/i18n";

export function AccountHeader({ title }: { title: string }) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
        hitSlop={8}
        style={{ width: 32, height: 32, justifyContent: "center" }}
      >
        {/* Lucide does not mirror itself: flipped by hand in RTL, as the
            shell's AppHeader does (AppHeader.tsx, header-back-icon). */}
        <View testID="account-back-icon" style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
          <ChevronLeft size={24} color={colors.ink} />
        </View>
      </Pressable>
      <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </Text>
    </View>
  );
}

export function SectionTitle({ children, hint }: { children: string; hint?: string }) {
  const metrics = useMetrics();
  return (
    <View style={{ marginTop: metrics.space.xl, marginBottom: metrics.space.sm, gap: metrics.space.xs }}>
      <Text variant="label" accessibilityRole="header">
        {children}
      </Text>
      {hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Card({ children, testID }: { children: ReactNode; testID?: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View testID={testID} style={{ backgroundColor: colors.surface, borderRadius: metrics.radius.md, overflow: "hidden" }}>
      {children}
    </View>
  );
}

/** A row inside a Card: a title, an optional detail line, and whatever goes at the end. */
export function CardRow({
  title,
  detail,
  end,
  first,
  testID,
}: {
  title: string;
  detail?: string | null;
  end?: ReactNode;
  first?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View
      testID={testID}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: metrics.space.md,
        paddingHorizontal: metrics.space.lg,
        paddingVertical: metrics.space.sm,
        minHeight: metrics.touch,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2}>{title}</Text>
        {detail ? (
          // Three, not two: device QA 2026-11-17 found an API key's expiry
          // year cut off at 360 dp in French ("Expire le 17 déc.…").
          <Text variant="caption" tone="muted" numberOfLines={3}>
            {detail}
          </Text>
        ) : null}
      </View>
      {end}
    </View>
  );
}

/** A row that leads to another screen. */
export function LinkRow({ label, onPress, first, testID }: { label: string; onPress: () => void; first?: boolean; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      android_ripple={{ color: colors.border }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: metrics.space.lg,
        minHeight: metrics.touch,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <Text style={{ flex: 1 }}>{label}</Text>
      <View style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
        <ChevronRight size={18} color={colors.inkMuted} />
      </View>
    </Pressable>
  );
}

/** A small text button at the end of a row. */
export function RowAction({
  label,
  onPress,
  tone = "accent",
  disabled,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  tone?: "accent" | "danger";
  disabled?: boolean;
  testID: string;
  accessibilityLabel?: string;
}) {
  const metrics = useMetrics();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.sm }}
    >
      <Text variant="label" tone={disabled ? "muted" : tone}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Ask before anything destructive. Nothing happens unless the red button is pressed. */
export function confirmDestructive(title: string, body: string, action: string, onConfirm: () => void): void {
  Alert.alert(title, body, [
    { text: translate("common.cancel"), style: "cancel" },
    { text: action, style: "destructive", onPress: onConfirm },
  ]);
}
