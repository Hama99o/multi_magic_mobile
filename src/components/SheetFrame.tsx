/**
 * THE SHEET FRAME — one shape for every sheet (Hello for the owner,
 * 2026-11-21: "Notes bottom sheets span the full width at 800 dp").
 *
 * A phone: a bottom sheet the width of the screen, sliding up, rounded on top.
 * A tablet (≥ `SPLIT_AT`): a centred card of `SHEET_CARD_WIDTH`, fading in,
 * rounded all round. That is the Apps sheet's shape
 * (src/components/shell/AppSwitcher.tsx), so the app has one.
 *
 * The scrim is a sibling of the card, not its parent (docs/ACCESSIBILITY.md
 * N1), and a tap on it closes. `keyboard` lifts a sheet with a field above the
 * keyboard (KeyboardPadding: Android does not resize an edge-to-edge window).
 */
import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { SPLIT_AT } from "@/screens/contacts/split";
import { FILL } from "@/theme/fill";
import { KeyboardPadding } from "./KeyboardPadding";

/** The tablet card's width: the Apps sheet's. */
export const SHEET_CARD_WIDTH = 560;
const RADIUS = 20;

export function SheetFrame({
  visible,
  onClose,
  closeLabel,
  testID,
  keyboard = false,
  maxHeight = "85%",
  style,
  onShow,
  children,
}: {
  visible: boolean;
  onClose(): void;
  /** The scrim's spoken name ("Close"). */
  closeLabel: string;
  /** On the card; the frame and scrim get `-frame` and `-scrim`. */
  testID?: string;
  /** The sheet has a text field: keep it above the keyboard. */
  keyboard?: boolean;
  maxHeight?: ViewStyle["maxHeight"];
  /** The card's own padding, gap, height or background. */
  style?: StyleProp<ViewStyle>;
  /** When the modal is on screen (focus a field then: `autoFocus` in a Modal opens no keyboard on Android). */
  onShow?: () => void;
  children: ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tablet = width >= SPLIT_AT;
  const frameID = testID ? `${testID}-frame` : undefined;
  // A phone's sheet sits on the home indicator: the inset is ADDED to the
  // sheet's own bottom padding, so its last row is never under it
  // (src/components/__tests__/sheets.insets.test.tsx).
  const own = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  const ownBottom = Number(own.paddingBottom ?? own.paddingVertical ?? own.padding ?? 0) || 0;

  const body = (
    <View testID={frameID} style={{ flex: 1, justifyContent: tablet ? "center" : "flex-end", alignItems: "center" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
        style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.45)" }}
        testID={testID ? `${testID}-scrim` : undefined}
      />
      <View
        accessibilityViewIsModal
        testID={testID}
        style={[
          {
            width: tablet ? SHEET_CARD_WIDTH : "100%",
            maxWidth: "100%",
            maxHeight,
            backgroundColor: colors.surface,
            borderRadius: RADIUS,
            ...(tablet ? {} : { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }),
          },
          style,
          tablet ? null : { paddingBottom: ownBottom + insets.bottom },
        ]}
      >
        {children}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType={tablet ? "fade" : "slide"} onRequestClose={onClose} onShow={onShow}>
      {keyboard ? <KeyboardPadding>{body}</KeyboardPadding> : body}
    </Modal>
  );
}
