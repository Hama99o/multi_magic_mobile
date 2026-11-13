/**
 * The note colour picker: the web's ten colour keys as round swatches, in the
 * web's order, drawn in this theme (noteColors.ts). A bottom sheet over the
 * screen. Used by the grid's selection bar and the note's palette key.
 */
import { Modal, Pressable, View } from "react-native";
import { Check } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { NOTE_COLOR_KEYS, noteColor, type NoteColorKey } from "./editor/noteColors";
import type { EditorColors } from "./editor/types";

export interface NoteColorPickerProps {
  visible: boolean;
  value: NoteColorKey | null;
  mode: "dark" | "light";
  colors: EditorColors;
  title: string;
  labels: Record<NoteColorKey, string>;
  onPick(key: NoteColorKey | null): void;
  onClose(): void;
}

export function NoteColorPicker({ visible, value, mode, colors, title, labels, onPick, onClose }: NoteColorPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} onPress={onClose} accessibilityLabel={title} />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 12 }}>
        <Text style={{ fontWeight: "700", fontSize: 16 }}>{title}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {NOTE_COLOR_KEYS.map((key) => {
            const c = noteColor(key, mode);
            const selected = (value ?? "no_color") === key;
            return (
              <Pressable
                key={key}
                testID={`note-color-${key}`}
                onPress={() => onPick(key === "no_color" ? null : key)}
                accessibilityRole="button"
                accessibilityLabel={labels[key]}
                accessibilityState={{ selected }}
                style={{
                  width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center",
                  backgroundColor: c.fill, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.accent : c.border,
                }}
              >
                {selected ? <Check size={20} color={colors.ink} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}
