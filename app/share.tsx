/**
 * Where a share from another app lands on a cold start
 * (`app/+native-intent.tsx`): a moment of "Opening…" while
 * `ShareIntentBridge` reads what arrived and sends it on — to Contacts or to
 * Pages. If nothing arrives (a stale link), it goes home rather than wait.
 */
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";

const GIVE_UP_MS = 4000;

export default function ShareLanding() {
  const { t } = useTranslation();
  useEffect(() => {
    const timer = setTimeout(() => router.replace("/"), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Screen>
      <View testID="share-landing" style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <ActivityIndicator />
        <Text tone="muted">{t("common.shareOpening")}</Text>
      </View>
    </Screen>
  );
}
