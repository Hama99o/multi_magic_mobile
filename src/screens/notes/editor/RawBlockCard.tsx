/**
 * A block the phone shows but does not edit yet (SPEC §C8, §E): a table, a
 * code block, a legacy image or embed the web itself drops, or a node type
 * this app does not know. It shows a static preview and "View on web". Its
 * markup is never touched: the codec writes it back byte for byte.
 */
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";

import type { EditorColors } from "./types";

export type RawBlockPreview =
  | { rows: string[][] }
  | { code: string; language?: string | null }
  | { imageUri: string }
  | { text: string };

export interface RawBlockCardProps {
  kind: "table" | "codeBlock" | "legacyImage" | "embed" | "heading456" | "unknown";
  title: string;
  preview?: RawBlockPreview;
  colors: EditorColors;
  labels: { viewOnWeb: string };
  onViewOnWeb(): void;
  testID?: string;
}

const MONO = "monospace";

export function RawBlockCard({ kind, title, preview, colors, labels, onViewOnWeb, testID }: RawBlockCardProps) {
  return (
    <View
      testID={testID}
      style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, padding: 12, gap: 10 }}
    >
      <Text style={{ color: colors.inkMuted, fontSize: 13, fontWeight: "600" }} accessibilityRole="header">
        {title}
      </Text>
      {preview && "rows" in preview ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {preview.rows.map((row, r) => (
              <View key={r} style={{ flexDirection: "row", borderTopWidth: r ? 1 : 0, borderColor: colors.border }}>
                {row.map((cell, c) => (
                  <Text
                    key={c}
                    numberOfLines={3}
                    style={{ width: 120, padding: 6, color: colors.ink, fontWeight: r === 0 ? "600" : "400", fontSize: 14 }}
                  >
                    {cell}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}
      {preview && "code" in preview ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Text style={{ fontFamily: MONO, color: colors.ink, fontSize: 13 }}>{preview.code}</Text>
        </ScrollView>
      ) : null}
      {preview && "imageUri" in preview ? (
        <Image source={{ uri: preview.imageUri }} style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 8 }} contentFit="contain" />
      ) : null}
      {preview && "text" in preview ? (
        <Text style={{ color: colors.ink, fontSize: kind === "heading456" ? 17 : 15, fontWeight: kind === "heading456" ? "600" : "400" }}>
          {preview.text}
        </Text>
      ) : null}
      <Pressable
        onPress={onViewOnWeb}
        accessibilityRole="link"
        hitSlop={8}
        style={{ alignSelf: "flex-start", backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}
      >
        <Text style={{ color: colors.onAccent, fontWeight: "600", fontSize: 14 }}>{labels.viewOnWeb}</Text>
      </Pressable>
    </View>
  );
}
