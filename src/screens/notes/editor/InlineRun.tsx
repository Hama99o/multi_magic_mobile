/**
 * The inline content of one text block (paragraph, heading, list item text),
 * read-only: text with its marks, hard breaks, emoji and the raw inline
 * elements the web cannot show either (a legacy inline <img>).
 *
 * Marks map to nested <Text> styles. Colours are the ones stored by the web
 * (`textStyle.color`, `highlight.color`) and stay as written in dark mode too
 * (SPEC §C, dark mode rule): changing them would change the note.
 */
import React from "react";
import { Text, type TextStyle } from "react-native";

import { EMOJI } from "@/vendor/tiptop-schema/emoji";

import type { DocMark, DocNode, EditorColors } from "./types";

/** tiptop's default <mark> background when a highlight has no colour. */
export const DEFAULT_HIGHLIGHT = "#fef08a";
const MONO = "monospace";

export function markStyle(mark: DocMark, colors: EditorColors): TextStyle {
  const attrs = mark.attrs ?? {};
  switch (mark.type) {
    case "bold":
      return { fontWeight: "700" };
    case "italic":
      return { fontStyle: "italic" };
    case "underline":
      return { textDecorationLine: "underline" };
    case "strike":
      return { textDecorationLine: "line-through" };
    case "code":
      return { fontFamily: MONO, backgroundColor: colors.surface };
    case "link":
      return { color: colors.accent, textDecorationLine: "underline" };
    case "textStyle":
      return typeof attrs.color === "string" && attrs.color ? { color: attrs.color } : {};
    case "highlight":
      return { backgroundColor: typeof attrs.color === "string" && attrs.color ? attrs.color : DEFAULT_HIGHLIGHT };
    case "subscript":
      return { fontSize: 11, lineHeight: 16 };
    case "superscript":
      return { fontSize: 11, lineHeight: 12 };
    default:
      return {};
  }
}

/** Underline and strike both live in textDecorationLine: combine them. */
function mergeStyles(styles: TextStyle[]): TextStyle {
  const out: TextStyle = {};
  const decorations = new Set<string>();
  for (const s of styles) {
    const { textDecorationLine, ...rest } = s;
    Object.assign(out, rest);
    if (textDecorationLine) textDecorationLine.split(" ").forEach((d) => decorations.add(d));
  }
  if (decorations.size) {
    out.textDecorationLine = (decorations.has("underline") && decorations.has("line-through")
      ? "underline line-through"
      : [...decorations][0]) as TextStyle["textDecorationLine"];
  }
  return out;
}

export interface InlineRunProps {
  content: DocNode[];
  colors: EditorColors;
  onLinkPress(href: string): void;
  onRawPress(html: string): void;
  rawLabel: string;
}

/** One <Text> child per inline node; the caller wraps them in its block <Text>. */
export function InlineRun({ content, colors, onLinkPress, onRawPress, rawLabel }: InlineRunProps) {
  return (
    <>
      {content.map((node, i) => {
        const marks = node.marks ?? [];
        const style = mergeStyles(marks.map((m) => markStyle(m, colors)));
        const link = marks.find((m) => m.type === "link")?.attrs?.href;
        const onPress = typeof link === "string" && link ? () => onLinkPress(link) : undefined;
        const sub = marks.some((m) => m.type === "subscript");
        const sup = marks.some((m) => m.type === "superscript");
        let text: string;
        switch (node.type) {
          case "text":
            text = node.text ?? "";
            break;
          case "hardBreak":
            text = "\n";
            break;
          case "emoji": {
            const name = typeof node.attrs?.name === "string" ? node.attrs.name : "";
            text = EMOJI[name] ?? `:${name}:`;
            break;
          }
          case "rawInline":
            return (
              <Text
                key={i}
                accessibilityRole="button"
                onPress={() => onRawPress(String(node.attrs?.html ?? ""))}
                style={{ color: colors.inkMuted, fontStyle: "italic" }}
              >
                {` [${rawLabel}] `}
              </Text>
            );
          default:
            // An inline node this app does not know: keep its text visible.
            text = (node.content ?? []).map((c) => c.text ?? "").join("");
        }
        return (
          <Text
            key={i}
            style={style}
            onPress={onPress}
            accessibilityRole={onPress ? "link" : undefined}
            // RN has no baseline shift for Text inside Text: sub/sup are smaller and
            // raised/lowered with a line height trick, close to the web's look.
            textBreakStrategy={sub || sup ? "simple" : undefined}
          >
            {text}
          </Text>
        );
      })}
    </>
  );
}
