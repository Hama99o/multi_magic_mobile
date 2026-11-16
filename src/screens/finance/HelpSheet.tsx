/**
 * Finance › Help: the web's `HelpDialog`, its eight sections and the tip that
 * currencies are never added together. A sheet, read and closed.
 */
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { FILL } from "@/theme/fill";

export const HELP_SECTIONS = ["overview", "expenses", "recurring", "income", "loans", "budgets", "reports", "categories"] as const;

export function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.5)" }} />
        <View testID="finance-help" style={{ backgroundColor: colors.ground, borderTopLeftRadius: metrics.radius.lg, borderTopRightRadius: metrics.radius.lg, padding: metrics.space.lg, paddingBottom: metrics.space.lg + insets.bottom, maxHeight: "85%", width: "100%", maxWidth: metrics.maxMeasure, alignSelf: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingBottom: metrics.space.sm }}>
            <Text variant="title" accessibilityRole="header" style={{ flex: 1, fontSize: 20 }}>
              {t("finance.help.title")}
            </Text>
            <Pressable testID="finance-help-close" onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8}>
              <X size={22} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: metrics.space.md }}>
            {HELP_SECTIONS.map((k) => (
              <View key={k} style={{ gap: 2 }}>
                <Text variant="label">{t(`finance.help.${k}.title`)}</Text>
                <Text tone="muted">{t(`finance.help.${k}.body`)}</Text>
              </View>
            ))}
            <View style={{ padding: metrics.space.md, borderRadius: metrics.radius.md, backgroundColor: colors.surface }}>
              <Text variant="label">{t("finance.help.currencies.title")}</Text>
              <Text tone="muted">{t("finance.help.currencies.body")}</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
