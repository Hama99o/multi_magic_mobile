/**
 * SafeZone's settings: the PIN (audit 2026-11-16, #27). The web keeps these
 * on the profile (`SafezonePinSettings.tsx`): change the PIN (the account
 * password, then a code sent by email) and turn it off (the account
 * password). Here they are one tap from the open vault's header, behind the
 * same gate as every SafeZone screen. The forms are `PinForms.tsx`.
 */
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useNav } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { KeyRound, Lock } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { SafeZoneGate } from "@/screens/safezone/SafeZoneGate";
import { ChangePinForm, TurnOffPinForm } from "@/screens/safezone/PinForms";

export default function SafeZoneSettingsScreen() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <Screen avoidKeyboard header={<AppHeader app="safezone" title={t("safezone.settings.title")} back />}>
      <View style={{ height: metrics.space.md }} />
      <SafeZoneGate>
        <Settings />
      </SafeZoneGate>
    </Screen>
  );
}

function Settings() {
  const router = useNav();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [mode, setMode] = useState<"idle" | "change" | "disable">("idle");
  return (
    <ScrollView testID="safezone-settings-screen" contentContainerStyle={{ gap: metrics.space.md, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {mode === "change" ? (
        <ChangePinForm intro={t("safezone.change.intro")} onDone={() => router.back()} onCancel={() => setMode("idle")} />
      ) : mode === "disable" ? (
        <TurnOffPinForm onDone={() => router.back()} onCancel={() => setMode("idle")} />
      ) : (
        <>
          <Text tone="muted">{t("safezone.settings.pinOn")}</Text>
          <SettingRow testID="safezone-settings-change" icon="change" label={t("safezone.settings.change")} onPress={() => setMode("change")} />
          <SettingRow testID="safezone-settings-disable" icon="disable" label={t("safezone.settings.disable")} onPress={() => setMode("disable")} />
        </>
      )}
    </ScrollView>
  );
}

function SettingRow({ testID, icon, label, onPress }: { testID: string; icon: "change" | "disable"; label: string; onPress: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const [pressed, setPressed] = useState(false);
  const Icon = icon === "change" ? KeyRound : Lock;
  const tint = icon === "disable" ? colors.danger : colors.accent;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: metrics.space.md,
        minHeight: 56,
        paddingHorizontal: metrics.space.md,
        borderRadius: metrics.radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.7 : 1,
      }}
    >
      <Icon size={20} color={tint} />
      <Text style={{ flex: 1, color: tint }}>{label}</Text>
    </Pressable>
  );
}
