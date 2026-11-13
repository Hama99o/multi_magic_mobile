/**
 * A note, read-only, rendered natively from the document the codec built
 * (SPEC §C, phase 2). Every node type of the web schema has a renderer; what
 * the phone cannot show as the web does (tables, code for now, legacy
 * elements, unknown types) becomes a RawBlockCard. Nothing is ever dropped.
 *
 * Props only (SPEC §E): the screen passes the document, colours, strings and
 * callbacks.
 */
import React, { useState } from "react";
import { Text, View, type TextStyle } from "react-native";
import { Image } from "expo-image";

import { dirOf, textOf } from "./dir";
import { InlineRun } from "./InlineRun";
import { bulletMarker, orderedMarker, rawInfo, tableRows, tableSize } from "./preview";
import { RawBlockCard } from "./RawBlockCard";
import type { Align, Dir, DocNode, EditorColors, EditorLabels } from "./types";

export interface NoteDocumentProps {
  doc: DocNode;
  colors: EditorColors;
  labels: EditorLabels;
  /** The note's direction when a block has no strong character. */
  dir?: Dir;
  onLinkPress(href: string): void;
  /** "View on web" on a read-only block; `url` when the block itself points somewhere (a video). */
  onViewOnWeb(url?: string): void;
}

const TEXT: Record<"body" | "h1" | "h2" | "h3", TextStyle> = {
  body: { fontSize: 16, lineHeight: 24 },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: "700" },
  h2: { fontSize: 21, lineHeight: 28, fontWeight: "700" },
  h3: { fontSize: 18, lineHeight: 25, fontWeight: "600" },
};

function textAlign(align: Align, dir: Dir): TextStyle["textAlign"] {
  if (align === "center" || align === "justify") return align;
  if (align === "left" || align === "right") return align;
  return dir === "rtl" ? "right" : "left";
}

export function NoteDocument({ doc, colors, labels, dir = "ltr", onLinkPress, onViewOnWeb }: NoteDocumentProps) {
  const rawPress = (html: string) => {
    const m = /^<(\w+)/.exec(html);
    onViewOnWeb(rawInfo(m ? m[1].toLowerCase() : "", html).url);
  };

  const textBlock = (node: DocNode, variant: keyof typeof TEXT, key: React.Key, extra?: TextStyle) => {
    const blockDir = dirOf(textOf(node), dir);
    const align = (node.attrs?.textAlign ?? null) as Align;
    return (
      <Text
        key={key}
        style={[TEXT[variant], { color: colors.ink, textAlign: textAlign(align, blockDir), writingDirection: blockDir }, extra]}
        accessibilityRole={variant === "body" ? undefined : "header"}
      >
        <InlineRun content={node.content ?? []} colors={colors} onLinkPress={onLinkPress} onRawPress={rawPress} rawLabel={labels.legacyImage} />
      </Text>
    );
  };

  const blocks = (nodes: DocNode[], depth: number): React.ReactNode[] => nodes.map((n, i) => block(n, depth, i))

  // A row's marker sits on the side its text starts from: each item takes its
  // direction from its first strong character, like the web's dir="auto".
  const rowDirection = (node: DocNode) => (dirOf(textOf(node), dir) === "rtl" ? "row-reverse" : "row");

  function listItem(item: DocNode, marker: React.ReactNode, depth: number, key: React.Key) {
    const rtl = rowDirection(item) === "row-reverse";
    return (
      <View key={key} testID="note-list-item" style={{ flexDirection: rowDirection(item), gap: 8 }}>
        <View style={{ minWidth: 22, alignItems: rtl ? "flex-start" : "flex-end" }}>{marker}</View>
        <View style={{ flex: 1, gap: 6 }}>{blocks(item.content ?? [], depth + 1)}</View>
      </View>
    );
  }

  function block(node: DocNode, depth: number, key: React.Key): React.ReactNode {
    const attrs = node.attrs ?? {};
    switch (node.type) {
      case "paragraph":
        return textBlock(node, "body", key);
      case "heading": {
        const level = attrs.level === 2 ? "h2" : attrs.level === 3 ? "h3" : "h1";
        return textBlock(node, level, key, { marginTop: 6 });
      }
      case "blockquote": {
        // Physical sides: the bar goes where the quote's text starts.
        const rtl = rowDirection(node) === "row-reverse";
        return (
          <View
            key={key}
            testID="note-quote"
            style={[
              { borderColor: colors.border, gap: 6 },
              rtl ? { borderRightWidth: 3, paddingRight: 12 } : { borderLeftWidth: 3, paddingLeft: 12 },
            ]}
          >
            {blocks(node.content ?? [], depth)}
          </View>
        );
      }
      case "bulletList":
        return (
          <View key={key} style={{ gap: 6 }}>
            {(node.content ?? []).map((item, i) =>
              listItem(item, <Text style={[TEXT.body, { color: colors.ink }]}>{bulletMarker(depth)}</Text>, depth, i))}
          </View>
        );
      case "orderedList": {
        const start = typeof attrs.start === "number" ? attrs.start : 1;
        const type = typeof attrs.type === "string" ? attrs.type : null;
        return (
          <View key={key} style={{ gap: 6 }}>
            {(node.content ?? []).map((item, i) =>
              listItem(item, <Text style={[TEXT.body, { color: colors.ink }]}>{orderedMarker(i, start, type)}</Text>, depth, i))}
          </View>
        );
      }
      case "taskList":
        return (
          <View key={key} style={{ gap: 6 }}>
            {(node.content ?? []).map((item, i) => {
              const checked = item.attrs?.checked === true;
              const box = (
                <View
                  accessible
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={checked ? labels.checked : labels.unchecked}
                  style={{
                    width: 20, height: 20, marginTop: 2, borderRadius: 6, borderWidth: 2,
                    borderColor: checked ? colors.accent : colors.inkMuted,
                    backgroundColor: checked ? colors.accent : "transparent",
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  {checked ? <Text style={{ color: colors.onAccent, fontSize: 13, fontWeight: "700", lineHeight: 16 }}>✓</Text> : null}
                </View>
              );
              return (
                <View key={i} testID="note-task-item" style={{ flexDirection: rowDirection(item), gap: 10, opacity: checked ? 0.6 : 1 }}>
                  {box}
                  <View style={{ flex: 1, gap: 6 }}>{blocks(item.content ?? [], depth + 1)}</View>
                </View>
              );
            })}
          </View>
        );
      case "listItem":
      case "taskItem":
        // Only reachable for a malformed list; show the content rather than nothing.
        return <View key={key} style={{ gap: 6 }}>{blocks(node.content ?? [], depth)}</View>;
      case "horizontalRule":
        return <View key={key} accessibilityRole="none" style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />;
      case "codeBlock": {
        const language = typeof attrs.language === "string" ? attrs.language : null;
        return (
          <RawBlockCard
            key={key}
            kind="codeBlock"
            title={labels.code(language)}
            preview={{ code: textOf(node), language }}
            colors={colors}
            labels={labels}
            onViewOnWeb={() => onViewOnWeb()}
          />
        );
      }
      case "table": {
        const [rows, cols] = tableSize(node);
        return (
          <RawBlockCard
            key={key}
            kind="table"
            title={labels.table(rows, cols)}
            preview={{ rows: tableRows(node) }}
            colors={colors}
            labels={labels}
            onViewOnWeb={() => onViewOnWeb()}
          />
        );
      }
      case "imageUploader": {
        const src = typeof attrs.src === "string" && /^https?:\/\//i.test(attrs.src) ? attrs.src : null;
        if (!src) {
          return (
            <View key={key} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
              <Text style={{ color: colors.inkMuted }}>{labels.imageUnavailable}</Text>
            </View>
          );
        }
        return <NoteImage key={key} src={src} colors={colors} unavailable={labels.imageUnavailable} />;
      }
      case "rawBlock": {
        const html = String(attrs.html ?? "");
        const info = rawInfo(String(attrs.tag ?? ""), html);
        return (
          <RawBlockCard
            key={key}
            kind={info.kind}
            title={info.kind === "legacyImage" ? labels.legacyImage : info.kind === "embed" ? labels.embed : labels.unknown(String(attrs.tag ?? ""))}
            preview={info.imageUri ? { imageUri: info.imageUri } : info.url ? { text: info.url } : undefined}
            colors={colors}
            labels={labels}
            onViewOnWeb={() => onViewOnWeb(info.url)}
          />
        );
      }
      default:
        // A node type the web schema does not have (a newer web editor): its
        // text, if any, and the way to see it on the web.
        return (
          <RawBlockCard
            key={key}
            kind="unknown"
            title={labels.unknown(node.type)}
            preview={textOf(node) ? { text: textOf(node) } : undefined}
            colors={colors}
            labels={labels}
            onViewOnWeb={() => onViewOnWeb()}
          />
        );
    }
  }

  return <View style={{ gap: 12 }}>{blocks(doc.content ?? [], 0)}</View>;
}

/** An uploaded picture; a load failure (server copy gone) says so instead of a blank box. */
function NoteImage({ src, colors, unavailable }: { src: string; colors: EditorColors; unavailable: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
        <Text style={{ color: colors.inkMuted }}>{unavailable}</Text>
      </View>
    );
  }
  return (
    <Image
      testID="note-image"
      source={{ uri: src }}
      accessibilityIgnoresInvertColors
      style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: colors.surface }}
      contentFit="contain"
      onError={() => setFailed(true)}
    />
  );
}
