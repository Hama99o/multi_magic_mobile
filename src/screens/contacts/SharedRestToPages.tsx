/**
 * A share that mixed contact cards with other files (contacts SPEC §F.3):
 * the cards opened here, and THIS says what happened to the rest and offers
 * it to Pages, where the person picks a place, as for any share. A banner,
 * not a toast: a toast is gone before the person has decided, and the files
 * would be lost without a word.
 *
 * The files themselves wait in the pending Pages import (`addFiles.ts`);
 * `rest` is how many the bridge left there (`ShareIntentBridge.tsx`).
 */
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { usePendingImport } from "@/screens/pages/addFiles";

export function SharedRestToPages({ rest }: { rest: string | undefined }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const waiting = usePendingImport((s) => s.files.length);
  const count = Number(rest);
  if (!Number.isInteger(count) || count < 1 || waiting < 1) return null;
  return (
    <View
      testID="contacts-shared-rest"
      accessibilityLiveRegion="polite"
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, padding: metrics.space.md, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      <FolderOpen size={22} color={colors.accent} />
      <Text style={{ flex: 1 }}>{t("contacts.share.restBody", { count: waiting })}</Text>
      <Pressable testID="contacts-shared-rest-save" onPress={() => router.push("/pages/save")} accessibilityRole="button" hitSlop={8} style={{ minHeight: metrics.touch, justifyContent: "center" }}>
        <Text tone="accent" variant="label">
          {t("contacts.share.restSave")}
        </Text>
      </Pressable>
    </View>
  );
}
