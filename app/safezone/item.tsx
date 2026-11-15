/**
 * One SafeZone item (`SPEC.md` §C.3, `SECURITY.md` §5–§6).
 *
 * The item is fetched once for its NON-secret fields; the secret values are
 * blanked before they reach state (`withoutSecrets`). Reveal and Copy each
 * fetch the record again for that one field, so a secret sits in memory only
 * while it is visible (≤ 20 s) or for the instant of a copy. Locking, hiding
 * and leaving wipe it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import { ChevronLeft, Copy, ExternalLink, Eye, EyeOff, Pencil } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { FONTS } from "@/theme/fonts";
import { SAFEZONE_KINDS, safezoneApi, type SafeZoneItem, type SafeZoneKind, type SecretField } from "@/api/safezone";
import { failureMessage } from "@/api/failure";
import { useSafezoneLock } from "@/stores/safezoneLock.store";
import { SafeZoneGate } from "@/screens/safezone/SafeZoneGate";
import { clipboardGuard } from "@/screens/safezone/clipboardGuard";
import { MASK, siteUrl, withoutSecrets } from "@/screens/safezone/display";
import { createRevealer, REVEAL_MS } from "@/screens/safezone/reveal";
import { Tile } from "@/screens/safezone/Tile";
import { Toast } from "@/screens/safezone/Toast";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";

const COPIED_MS = 2_000;

export default function SafeZoneItemScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <Screen measure>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
        <Pressable testID="safezone-item-back" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={8} style={{ width: 32, height: 32, justifyContent: "center" }}>
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <EditKey />
      </View>
      <SafeZoneGate>
        <Item />
      </SafeZoneGate>
    </Screen>
  );
}

/** Edit opens the same form as Add, prefilled (owner, 2026-11-15). */
function EditKey() {
  const colors = useColors();
  const { t } = useTranslation();
  const params = useParams();
  const unlocked = useSafezoneLock((s) => s.status.kind === "unlocked");
  if (!params || !unlocked) return null;
  return (
    <Pressable
      testID="safezone-item-edit"
      onPress={() => router.push({ pathname: "/safezone/edit", params: { kind: params.kind, id: String(params.id) } })}
      accessibilityRole="button"
      accessibilityLabel={t("safezone.editItem")}
      hitSlop={8}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 40, borderRadius: 999, backgroundColor: `${colors.accent}1f` }}
    >
      <Pencil size={16} color={colors.accent} />
      <Text tone="accent" variant="label">{t("safezone.editItem")}</Text>
    </Pressable>
  );
}

function useParams(): { kind: SafeZoneKind; id: number } | null {
  const params = useLocalSearchParams<{ kind?: string; id?: string }>();
  const kind = SAFEZONE_KINDS.find((k) => k === params.kind);
  const id = Number(params.id);
  return kind && Number.isInteger(id) && id > 0 ? { kind, id } : null;
}

function token(): string {
  const live = useSafezoneLock.getState().liveToken();
  if (!live) {
    useSafezoneLock.getState().lock();
    throw new Error("safezone locked");
  }
  return live;
}

function Item() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const params = useParams();
  const lockEpoch = useSafezoneLock((s) => s.lockEpoch);
  const [item, setItem] = useState<SafeZoneItem | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revealed, setRevealed] = useState<{ key: string; value: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const revealer = useMemo(() => createRevealer({ onChange: (key) => key === null && setRevealed(null) }), []);
  useEffect(() => () => revealer.dispose(), [revealer]);

  // A lock wipes what is on screen.
  const firstEpoch = useRef(lockEpoch);
  useEffect(() => {
    if (lockEpoch === firstEpoch.current) return;
    revealer.hide();
    setRevealed(null);
  }, [lockEpoch, revealer]);

  const load = () => {
    if (!params) return;
    setError(null);
    try {
      safezoneApi
        .show(params.kind, params.id, token())
        .then((full) => setItem(withoutSecrets(full)))
        .catch((e: unknown) => setError(e));
    } catch (e) {
      setError(e);
    }
  };
  // On opening, and again on coming back from Edit (the saved values).
  useFocusEffect(useCallback(() => load(), [params?.kind, params?.id])); // eslint-disable-line react-hooks/exhaustive-deps

  /** One field's secret value, fetched for this moment only. */
  const fetchSecret = async (key: string): Promise<string> => {
    if (!params) throw new Error("no item");
    const full = await safezoneApi.show(params.kind, params.id, token());
    return full.fields.find((f) => f.key === key)?.value ?? "";
  };

  const reveal = async (field: SecretField) => {
    if (revealed?.key === field.key) {
      revealer.hide();
      return;
    }
    setActionError(null);
    setBusyKey(field.key);
    try {
      const value = await fetchSecret(field.key);
      setRevealed({ key: field.key, value });
      revealer.show(field.key);
    } catch (e) {
      setActionError(failureMessage(e, t("safezone.revealFailed")));
    } finally {
      setBusyKey(null);
    }
  };

  const copy = async (field: SecretField) => {
    setActionError(null);
    setBusyKey(field.key);
    try {
      if (field.secret) await clipboardGuard.copy(revealed?.key === field.key ? revealed.value : await fetchSecret(field.key));
      else await Clipboard.setStringAsync(field.value);
      setCopied(field.key);
      setTimeout(() => setCopied((k) => (k === field.key ? null : k)), COPIED_MS);
      // The answer to a copy (Mobbin: 1Password): a success haptic and a toast.
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setToast(field.secret ? t("safezone.toast.copiedSecret", { seconds: 30 }) : t("safezone.toast.copied"));
    } catch (e) {
      setActionError(failureMessage(e, t("safezone.copyFailed")));
    } finally {
      setBusyKey(null);
    }
  };

  if (!params) return <Text tone="danger">{t("safezone.itemFailed")}</Text>;
  if (error) {
    return (
      <View style={{ gap: metrics.space.md }}>
        <Text testID="safezone-item-failed" tone="danger">
          {failureMessage(error, t("safezone.itemFailed"))}
        </Text>
        <Button label={t("common.tryAgain")} block={false} onPress={load} />
      </View>
    );
  }
  if (!item) return <ActivityIndicator testID="safezone-item-loading" style={{ marginTop: metrics.space.xl }} />;

  const title = item.kind === "identities" ? t(`safezone.identityTypes.${item.title}`) : item.title || t("safezone.noTitle");
  const site = item.fields.find((f) => f.key === "link")?.value || item.title || "";
  const who = item.fields.find((f) => !f.secret && (f.key === "username" || f.key === "email"))?.value ?? "";
  return (
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={{ gap: metrics.space.lg, paddingBottom: 96 }}>
      <Animated.View entering={FadeInUp.duration(240)} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, paddingTop: metrics.space.sm }}>
        <Tile kind={item.kind} site={site} size={64} testID="safezone-item-tile" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" accessibilityRole="header" testID="safezone-item-title" numberOfLines={2}>
            {title}
          </Text>
          {who ? (
            <Text tone="muted" numberOfLines={1}>
              {who}
            </Text>
          ) : null}
        </View>
      </Animated.View>
      {actionError ? (
        <Text testID="safezone-item-error" tone="danger" accessibilityLiveRegion="polite">
          {actionError}
        </Text>
      ) : null}
      <View style={{ borderRadius: metrics.radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      {item.fields.map((field, i) => (
        <FieldRow
          key={field.key}
          last={i === item.fields.length - 1}
          field={field}
          kind={item.kind}
          revealed={revealed?.key === field.key ? revealed.value : null}
          revealer={revealer}
          copied={copied === field.key}
          busy={busyKey === field.key}
          onReveal={() => void reveal(field)}
          onCopy={() => void copy(field)}
        />
      ))}
      </View>
    </ScrollView>
    {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </View>
  );
}

function shown(field: SecretField, kind: SafeZoneKind, t: (key: string) => string, lang: string): string {
  if (field.key === "card_type") return t(`safezone.cardTypes.${field.value}`);
  if (field.key === "type" && kind === "identities") return t(`safezone.identityTypes.${field.value}`);
  if (/^\d{4}-\d{2}-\d{2}/.test(field.value) && (field.key === "issued_at" || field.key === "expires_at")) {
    const d = new Date(`${field.value.slice(0, 10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? field.value : d.toLocaleDateString(lang);
  }
  return field.value;
}

function FieldRow({
  field, kind, revealed, revealer, copied, busy, onReveal, onCopy, last = false,
}: {
  last?: boolean;
  field: SecretField;
  kind: SafeZoneKind;
  revealed: string | null;
  revealer: ReturnType<typeof createRevealer>;
  copied: boolean;
  busy: boolean;
  onReveal: () => void;
  onCopy: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const label = t(`safezone.field.${field.key}`);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (revealed === null) return;
    setLeft(Math.ceil(revealer.leftMs() / 1000));
    const id = setInterval(() => setLeft(Math.ceil(revealer.leftMs() / 1000)), 1000);
    return () => clearInterval(id);
  }, [revealed, revealer]);

  const value = field.secret ? (revealed ?? MASK) : shown(field, kind, t, i18n.language);
  const icon = { width: metrics.touch, height: metrics.touch, alignItems: "center" as const, justifyContent: "center" as const };

  return (
    <View
      testID={`safezone-field-${field.key}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: metrics.space.sm,
        paddingLeft: metrics.space.md,
        paddingRight: metrics.space.xs,
        paddingVertical: metrics.space.sm,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
        backgroundColor: copied ? `${colors.accent}1f` : "transparent",
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Animated.View key={revealed === null ? "masked" : "shown"} entering={FadeIn.duration(180)}>
        <Text
          testID={`safezone-field-${field.key}-value`}
          selectable={false}
          style={field.secret && revealed !== null ? { fontFamily: FONTS.mono, letterSpacing: 1 } : undefined}
          tone={copied ? "accent" : "default"}
        >
          {copied ? (field.secret ? t("safezone.copiedClears", { seconds: 30 }) : t("safezone.copied")) : value}
        </Text>
        </Animated.View>
        {field.secret && revealed !== null ? (
          <View testID={`safezone-field-${field.key}-timer`} style={{ height: 3, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden" }} accessibilityLabel={t("safezone.hidesIn", { seconds: left })}>
            <View style={{ height: 3, width: `${Math.min(100, (left * 1000 * 100) / REVEAL_MS)}%`, backgroundColor: colors.accent }} />
          </View>
        ) : null}
      </View>
      {busy ? <ActivityIndicator style={icon} /> : null}
      {field.link && !busy ? (
        <Pressable testID={`safezone-field-${field.key}-open`} onPress={() => void Linking.openURL(siteUrl(field.value)).catch(() => {})} accessibilityRole="link" accessibilityLabel={t("safezone.openSite")} style={icon}>
          <ExternalLink size={20} color={colors.accent} />
        </Pressable>
      ) : null}
      {field.secret && !busy ? (
        <Pressable testID={`safezone-field-${field.key}-reveal`} onPress={onReveal} accessibilityRole="button" accessibilityLabel={revealed !== null ? t("safezone.hide", { field: label }) : t("safezone.reveal", { field: label })} style={icon}>
          {revealed !== null ? <EyeOff size={20} color={colors.accent} /> : <Eye size={20} color={colors.accent} />}
        </Pressable>
      ) : null}
      {!busy ? (
        <Pressable testID={`safezone-field-${field.key}-copy`} onPress={onCopy} accessibilityRole="button" accessibilityLabel={t("safezone.copy", { field: label })} style={icon}>
          <Copy size={20} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}
