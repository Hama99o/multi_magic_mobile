/**
 * A bottom sheet with a title, for anything longer than a row of choices:
 * the field pickers, Flow's move, sprint and member sheets.
 *
 * The chrome is the one `ChoiceSheet` and `ActionSheet` already draw (a scrim
 * that is a SIBLING of the panel, docs/ACCESSIBILITY.md N1; the safe area at
 * the bottom; a measure on a tablet), plus `KeyboardPadding`, because these
 * sheets hold inputs and an edge-to-edge Android window is not resized for
 * the keyboard (docs/TESTING.md §5, MembersSheet QA rc16).
 */
import type { ReactNode, RefObject } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "@/components/icons";
import { KeyboardPadding } from "@/components/KeyboardPadding";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { FILL } from "@/theme/fill";

/**
 * Focus once the modal is shown, and again after its slide-in if nothing took
 * it: a sheet opened as another closes (the sprint list giving way to the
 * sprint form) lost the first focus to the closing one on the device.
 */
export function focusSoon(ref: RefObject<TextInput | null> | undefined) {
  if (!ref) return;
  const go = () => {
    const input = ref.current;
    if (input && !input.isFocused()) input.focus();
  };
  setTimeout(go, 60);
  setTimeout(go, 400);
}

export function BottomSheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  headerRight,
  scroll = true,
  tall = false,
  focusRef,
  testID,
}: {
  open: boolean;
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the content (a Save, a composer), never scrolled away. */
  footer?: ReactNode;
  headerRight?: ReactNode;
  /** false when the body is its own list (a FlatList must not sit in a ScrollView). */
  scroll?: boolean;
  /** A search sheet: the full height, so results do not jump as they load. */
  tall?: boolean;
  /**
   * The input to type into first. `autoFocus` inside a Modal places the
   * cursor and opens NO keyboard on Android (device, 2026-11-20: every sheet
   * with a field needed a second tap), because focus is asked for before the
   * modal's window has it. Focusing once the modal is shown does.
   */
  focusRef?: RefObject<TextInput | null>;
  testID: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} onShow={() => focusSoon(focusRef)}>
      <KeyboardPadding>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.5)" }} />
          <View
            testID={testID}
            style={{
              backgroundColor: colors.ground,
              borderTopLeftRadius: metrics.radius.lg,
              borderTopRightRadius: metrics.radius.lg,
              paddingTop: metrics.space.md,
              paddingBottom: metrics.space.md + insets.bottom,
              width: "100%",
              maxWidth: metrics.maxMeasure,
              alignSelf: "center",
              maxHeight: "88%",
              ...(tall ? { height: "88%" } : {}),
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingHorizontal: metrics.space.lg, paddingBottom: metrics.space.sm }}>
              <View style={{ flex: 1 }}>
                <Text variant="label" accessibilityRole="header" style={{ fontSize: 18, lineHeight: 24 }} numberOfLines={2}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              {headerRight}
              <Pressable
                testID={`${testID}-close`}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                hitSlop={8}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}
              >
                <X size={20} color={colors.ink} />
              </Pressable>
            </View>
            {scroll ? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: metrics.space.lg, paddingBottom: metrics.space.sm }} style={tall ? { flex: 1 } : undefined}>
                {children}
              </ScrollView>
            ) : (
              <View style={{ flex: tall ? 1 : undefined, flexShrink: 1, paddingHorizontal: metrics.space.lg }}>{children}</View>
            )}
            {footer ? <View style={{ paddingHorizontal: metrics.space.lg, paddingTop: metrics.space.sm }}>{footer}</View> : null}
          </View>
        </View>
      </KeyboardPadding>
    </Modal>
  );
}
