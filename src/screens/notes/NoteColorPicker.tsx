/**
 * The note colour picker: the web's ten colour keys as round swatches, in the
 * web's order, drawn in this theme (noteColors.ts). A bottom sheet over the
 * screen. Used by the grid's selection bar and the note's palette key.
 */
import { Pressable, View } from "react-native";
import { SheetFrame } from "@/components/SheetFrame";
import { useTranslation } from "react-i18next";
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
    <SheetFrame visible={visible} onClose={onClose} closeLabel={title} style={{ padding: 16, gap: 12 }}>
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
    </SheetFrame>
  );
}

/** Each colour key's name, read aloud on its swatch. */
export function useNoteColorLabels(): Record<NoteColorKey, string> {
  const { t } = useTranslation();
  return {
    no_color: t("notes.grid.colors.no_color"), red: t("notes.grid.colors.red"), orange: t("notes.grid.colors.orange"),
    yellow: t("notes.grid.colors.yellow"), green: t("notes.grid.colors.green"), teal: t("notes.grid.colors.teal"),
    blue: t("notes.grid.colors.blue"), purple: t("notes.grid.colors.purple"), pink: t("notes.grid.colors.pink"),
    gray: t("notes.grid.colors.gray"),
  };
}
