/**
 * THE APP SWITCHER — the header's Apps button (the web's apps grid), so any
 * app is one tap from any other without going back to Home (owner,
 * 2026-11-17). docs/design/app-shell/SPEC.md §D.
 *
 * A bottom sheet with a grabber (Notion's accounts sheet, Slack's
 * workspaces); on a tablet, a centred card. In order: "Find an app" (typing
 * turns the grid into a list with each app's line, Deel's hub search), "Ask
 * the assistant" in its gradient, then every app from the registry as a grid,
 * the current one ringed and the two unread counts on their tiles.
 *
 * One Modal, its scrim a sibling of the sheet, not its parent
 * (docs/ACCESSIBILITY.md N1).
 */
import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Search, Sparkles } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { FILL } from "@/theme/fill";
import { ASSISTANT_GRADIENT, tileColors } from "@/theme/appColors";
import { useColors, useMetrics, useScheme } from "@/hooks/useColors";
import { SPLIT_AT } from "@/screens/contacts/split";
import { APP_REGISTRY, type AppEntry, type AppKey } from "@/apps/registry";
import { AppMark } from "./AppMark";

/** Accents and case do not matter: "tâches" finds Tasks typed as "taches". */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function CountBadge({ value, testID }: { value: string; testID: string }) {
  const colors = useColors();
  return (
    <View
      style={{
        position: "absolute",
        top: -6,
        right: -6,
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        paddingHorizontal: 5,
        borderWidth: 2,
        borderColor: colors.surface,
        backgroundColor: colors.danger,
        alignItems: "center",
        justifyContent: "center",
      }}
      testID={testID}
    >
      <Text variant="caption" style={{ color: "#ffffff", fontSize: 10, lineHeight: 12, fontWeight: "700" }}>
        {value}
      </Text>
    </View>
  );
}

export function AppSwitcher({
  visible,
  current,
  badges,
  onOpen,
  onClose,
}: {
  visible: boolean;
  current: AppKey;
  badges: { chats: string | null; notifications: string | null };
  onOpen: (key: AppKey) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  // One navigation per opening: a double tap on a tile must not push twice.
  const chosen = useRef(false);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      chosen.current = false;
      setQuery("");
    }
  }

  if (!visible) return null;

  const tablet = width >= SPLIT_AT;
  const columns = tablet ? 5 : 4;
  const q = fold(query.trim());
  const matches = q ? APP_REGISTRY.filter((a) => fold(t(a.labelKey)).includes(q) || fold(t(a.lineKey)).includes(q)) : APP_REGISTRY;
  const badgeOf = (key: AppKey) => (key === "chats" ? badges.chats : key === "notifications" ? badges.notifications : null);

  const choose = (key: AppKey) => {
    if (chosen.current) return;
    chosen.current = true;
    if (key === current) return onClose();
    onOpen(key);
  };

  const label = (a: AppEntry) => (a.key === "home" ? t("shell.home") : t(a.labelKey));
  const a11y = (a: AppEntry) => {
    const badge = badgeOf(a.key);
    return badge ? `${label(a)}, ${badge}` : label(a);
  };

  const tile = (a: AppEntry) => {
    const selected = a.key === current;
    const ring = a.key === "home" ? colors.accent : tileColors(a.key, scheme).ring;
    const badge = badgeOf(a.key);
    return (
      <Pressable
        key={a.key}
        accessibilityRole="button"
        accessibilityLabel={a11y(a)}
        accessibilityState={{ selected }}
        onPress={() => choose(a.key)}
        style={{ width: `${100 / columns}%`, alignItems: "center", gap: 6, paddingVertical: metrics.space.sm }}
        testID={`switcher-app-${a.key}`}
      >
        <View
          style={{
            padding: 3,
            borderRadius: 20,
            borderWidth: 2,
            borderColor: selected ? ring : "transparent",
          }}
        >
          <AppMark app={a.key} size={52} />
          {badge ? <CountBadge value={badge} testID={`switcher-app-${a.key}-badge`} /> : null}
        </View>
        <Text variant="caption" numberOfLines={1} style={{ fontWeight: "600", textAlign: "center" }}>
          {label(a)}
        </Text>
      </Pressable>
    );
  };

  const row = (a: AppEntry) => (
    <Pressable
      key={a.key}
      accessibilityRole="button"
      accessibilityLabel={a11y(a)}
      accessibilityState={{ selected: a.key === current }}
      onPress={() => choose(a.key)}
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: metrics.touch + 8 }}
      testID={`switcher-app-${a.key}`}
    >
      <AppMark app={a.key} size={36} />
      <View style={{ flex: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {label(a)}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {t(a.lineKey)}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <Modal visible transparent animationType={tablet ? "fade" : "slide"} onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: tablet ? "center" : "flex-end", alignItems: "center" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={onClose}
          style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.5)" }}
          testID="switcher-scrim"
        />
        <View
          style={{
            width: tablet ? 560 : "100%",
            maxHeight: tablet ? "85%" : "80%",
            backgroundColor: colors.surface,
            borderRadius: metrics.radius.lg,
            borderBottomLeftRadius: tablet ? metrics.radius.lg : 0,
            borderBottomRightRadius: tablet ? metrics.radius.lg : 0,
            paddingHorizontal: metrics.space.lg,
            paddingTop: tablet ? metrics.space.lg : metrics.space.sm,
            paddingBottom: (tablet ? metrics.space.lg : metrics.space.xl) + (tablet ? 0 : insets.bottom),
            gap: metrics.space.md,
          }}
          accessibilityViewIsModal
          testID="app-switcher"
        >
          {tablet ? null : <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border }} />}
          <Text variant="label" accessibilityRole="header" style={{ fontSize: 17 }}>
            {t("shell.apps")}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: metrics.space.sm,
              minHeight: 44,
              paddingHorizontal: metrics.space.md,
              borderRadius: metrics.radius.pill,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.ground,
            }}
          >
            <Search size={18} color={colors.inkMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("shell.findApp")}
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel={t("shell.findApp")}
              autoCorrect={false}
              returnKeyType="search"
              style={{ flex: 1, color: colors.ink, fontSize: 16, paddingVertical: metrics.space.sm }}
              testID="switcher-search"
            />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: metrics.space.md }}>
            {q ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("home.askAi")}
                onPress={() => choose("assistant")}
                style={{ height: 52, borderRadius: metrics.radius.md, overflow: "hidden", flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingHorizontal: metrics.space.md }}
                testID="switcher-ask"
              >
                <Svg width="100%" height="100%" style={{ position: "absolute" }} preserveAspectRatio="none">
                  <Defs>
                    <LinearGradient id="switcher-ask" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={ASSISTANT_GRADIENT[0]} />
                      <Stop offset="1" stopColor={ASSISTANT_GRADIENT[1]} />
                    </LinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill="url(#switcher-ask)" />
                </Svg>
                <Sparkles size={20} color={tileColors("assistant", scheme).glyph} />
                <Text variant="label" style={{ color: tileColors("assistant", scheme).glyph, fontSize: 16 }}>
                  {t("home.askAi")}
                </Text>
              </Pressable>
            )}
            {matches.length === 0 ? (
              <Text tone="muted" style={{ textAlign: "center", paddingVertical: metrics.space.lg }}>
                {t("shell.noAppMatch")}
              </Text>
            ) : q ? (
              <View>{matches.map(row)}</View>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{matches.map(tile)}</View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
