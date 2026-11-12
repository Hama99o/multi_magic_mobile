/**
 * A bottom sheet of actions (WhatsApp's contact-info rows, SPEC §B): one tap
 * acts and closes. Used for the list's More menu, a row's long press, and
 * "which number?" when a contact has several.
 */
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LucideIcon } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { FILL } from "@/theme/fill";

export interface SheetAction {
  key: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export function ActionSheet({
  open,
  title,
  subtitle,
  actions,
  onClose,
  testID,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
  testID: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.5)" }} />
        <View
          testID={testID}
          style={{
            backgroundColor: colors.ground,
            borderTopLeftRadius: metrics.radius.lg,
            borderTopRightRadius: metrics.radius.lg,
            padding: metrics.space.lg,
            paddingBottom: metrics.space.lg + insets.bottom,
            width: "100%",
            maxWidth: metrics.maxMeasure,
            alignSelf: "center",
            maxHeight: "85%",
          }}
        >
          <Text variant="title" accessibilityRole="header" numberOfLines={2} style={{ fontSize: 20, lineHeight: 26 }}>
            {title}
          </Text>
          {subtitle ? (
            <Text tone="muted" variant="caption" style={{ paddingTop: metrics.space.xs }}>
              {subtitle}
            </Text>
          ) : null}
          <ScrollView style={{ marginTop: metrics.space.sm }}>
            {actions.map((action) => {
              const Icon = action.icon;
              const tint = action.disabled ? colors.inkMuted : action.danger ? colors.danger : colors.ink;
              return (
                <Pressable
                  key={action.key}
                  testID={`${testID}-${action.key}`}
                  disabled={action.disabled}
                  onPress={() => {
                    onClose();
                    action.onPress();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  accessibilityHint={action.hint}
                  accessibilityState={{ disabled: Boolean(action.disabled) }}
                  style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: metrics.touch + 4 }}
                >
                  {Icon ? <Icon size={20} color={tint} /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: tint }}>{action.label}</Text>
                    {action.hint ? (
                      <Text variant="caption" tone="muted">
                        {action.hint}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
