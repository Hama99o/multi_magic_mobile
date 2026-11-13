/**
 * THE EDITOR TOOLBAR, drawn (SPEC §C3). It sits on the keyboard's top edge
 * (the screen wraps it in KeyboardPadding) and scrolls sideways when the keys
 * do not fit. Which keys, and what they do, is toolbarModel.ts; this draws
 * them: 48 dp keys, a translated label, `selected` when active, colour
 * swatches with the web's colours.
 *
 * Props only (SPEC §E): no store, API, router or i18n import. In RTL the
 * ScrollView's row direction follows the app's layout direction.
 */
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import AlignCenter from "lucide-react-native/dist/esm/icons/align-center";
import AlignJustify from "lucide-react-native/dist/esm/icons/align-justify";
import AlignLeft from "lucide-react-native/dist/esm/icons/align-left";
import AlignRight from "lucide-react-native/dist/esm/icons/align-right";
import Baseline from "lucide-react-native/dist/esm/icons/baseline";
import Bold from "lucide-react-native/dist/esm/icons/bold";
import Code from "lucide-react-native/dist/esm/icons/code";
import Heading1 from "lucide-react-native/dist/esm/icons/heading-1";
import Heading2 from "lucide-react-native/dist/esm/icons/heading-2";
import Heading3 from "lucide-react-native/dist/esm/icons/heading-3";
import Highlighter from "lucide-react-native/dist/esm/icons/highlighter";
import ImageIcon from "lucide-react-native/dist/esm/icons/image";
import IndentDecrease from "lucide-react-native/dist/esm/icons/indent-decrease";
import IndentIncrease from "lucide-react-native/dist/esm/icons/indent-increase";
import Italic from "lucide-react-native/dist/esm/icons/italic";
import KeyboardOff from "lucide-react-native/dist/esm/icons/keyboard-off";
import LinkIcon from "lucide-react-native/dist/esm/icons/link";
import List from "lucide-react-native/dist/esm/icons/list";
import ListChecks from "lucide-react-native/dist/esm/icons/list-checks";
import ListOrdered from "lucide-react-native/dist/esm/icons/list-ordered";
import Minus from "lucide-react-native/dist/esm/icons/minus";
import Pilcrow from "lucide-react-native/dist/esm/icons/pilcrow";
import Plus from "lucide-react-native/dist/esm/icons/plus";
import Quote from "lucide-react-native/dist/esm/icons/quote";
import Redo2 from "lucide-react-native/dist/esm/icons/redo-2";
import SquareCode from "lucide-react-native/dist/esm/icons/square-code";
import Strikethrough from "lucide-react-native/dist/esm/icons/strikethrough";
import Subscript from "lucide-react-native/dist/esm/icons/subscript";
import Superscript from "lucide-react-native/dist/esm/icons/superscript";
import Table from "lucide-react-native/dist/esm/icons/table";
import Type from "lucide-react-native/dist/esm/icons/type";
import Underline from "lucide-react-native/dist/esm/icons/underline";
import Undo2 from "lucide-react-native/dist/esm/icons/undo-2";

import { CODE_LANGUAGES } from "./blockEdits";
import { HIGHLIGHT_COLORS, TEXT_COLORS, type Command, type ToolbarKey } from "./toolbarModel";
import type { EditorColors } from "./types";

type Icon = React.ComponentType<{ color?: string; size?: number }>;

const ICONS: Record<string, Icon> = {
  undo: Undo2, redo: Redo2, insert: Plus, format: Type, hideKeyboard: KeyboardOff,
  bold: Bold, italic: Italic, underline: Underline, strike: Strikethrough, code: Code,
  subscript: Subscript, superscript: Superscript, link: LinkIcon, textColor: Baseline, highlight: Highlighter,
  taskList: ListChecks, bulletList: List, orderedList: ListOrdered, indent: IndentIncrease, outdent: IndentDecrease,
  "align:left": AlignLeft, "align:center": AlignCenter, "align:right": AlignRight, "align:justify": AlignJustify,
  "block:paragraph": Pilcrow, "block:h1": Heading1, "block:h2": Heading2, "block:h3": Heading3,
  "block:blockquote": Quote, "block:codeBlock": SquareCode,
  "insert:horizontalRule": Minus, "insert:image": ImageIcon, "insert:table": Table,
};

/** Short text for the block-type key. */
const BLOCK_TEXT: Record<string, string> = { paragraph: "¶", h1: "H1", h2: "H2", h3: "H3", blockquote: "❝", codeBlock: "</>" };

/** Accessibility labels, already translated, by key id (colour keys: `textColor:blue`…). */
export type ToolbarLabels = Record<string, string>;

export interface EditorToolbarProps {
  keys: ToolbarKey[];
  labels: ToolbarLabels;
  colors: EditorColors;
  onCommand(command: Command): void;
}

const swatch = (id: string): string | null | undefined => {
  const [group, name] = id.split(":");
  const list = group === "textColor" ? TEXT_COLORS : group === "highlight" ? HIGHLIGHT_COLORS : null;
  return list?.find((c) => c.key === name)?.value;
};

export function EditorToolbar({ keys, labels, colors, onCommand }: EditorToolbarProps) {
  return (
    <View testID="note-toolbar" style={{ borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4 }}>
        {keys.map((k) => {
          const Glyph = ICONS[k.id];
          const fill = k.id.includes(":") ? swatch(k.id) : undefined;
          const tint = k.disabled ? colors.border : k.active ? colors.onAccent : colors.ink;
          return (
            <Pressable
              key={k.id}
              testID={`tb-${k.id}`}
              onPress={k.disabled ? undefined : () => onCommand(k.command)}
              disabled={k.disabled}
              accessibilityRole="button"
              accessibilityLabel={labels[k.id] ?? k.id}
              accessibilityState={{ selected: k.active, disabled: k.disabled }}
              style={{
                minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", marginVertical: 2,
                borderRadius: 10, paddingHorizontal: 6, backgroundColor: k.active ? colors.accent : "transparent",
              }}
            >
              {fill !== undefined ? (
                <View
                  testID={`tb-${k.id}-swatch`}
                  style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: fill ?? "transparent" }}
                />
              ) : k.id === "codeLanguage" ? (
                <Text style={{ color: tint, fontWeight: "600", fontSize: 13, fontFamily: "monospace" }}>
                  {k.value === "plain" ? labels["codeLanguage:plain"] ?? "Plain text" : CODE_LANGUAGES.find((l) => l.id === k.value)?.name ?? k.value}
                </Text>
              ) : k.id === "blockType" ? (
                <Text style={{ color: tint, fontWeight: "700", fontSize: 15 }}>{BLOCK_TEXT[k.value ?? "paragraph"]}</Text>
              ) : Glyph ? (
                <Glyph color={tint} size={22} />
              ) : (
                <Text style={{ color: tint }}>{labels[k.id] ?? k.id}</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
