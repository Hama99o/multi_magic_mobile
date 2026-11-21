/**
 * DELETE A TABLE OR A BASE, by typing its name (the owner, 2026-11-20: "he
 * can't delete a table once created").
 *
 * The delete stays disabled until the text typed is the name EXACTLY: case,
 * spaces and accents count, nothing is trimmed or folded (`nameMatches`). The
 * name is shown to copy, with a Copy button, and the sheet says in words what
 * goes with it (the server's impact for a table). The field never corrects:
 * no autocapitalise, no autocorrect, no suggestions.
 */
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/BottomSheet";
import { SheetButton } from "@/components/fields/FieldRow";
import { Copy } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { nameMatches } from "./logic";

export function DeleteByNameSheet({
  kind,
  name,
  consequence,
  busy,
  error,
  onDelete,
  onClose,
}: {
  kind: "table" | "base";
  name: string;
  /** What goes with it, in words. */
  consequence: string | null;
  busy: boolean;
  error: string | null;
  onDelete: (typed: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const ok = nameMatches(typed, name);
  return (
    <BottomSheet
      open
      title={t(kind === "table" ? "tables.remove.tableTitle" : "tables.remove.baseTitle")}
      onClose={onClose}
      testID={`tables-delete-${kind}`}
      footer={
        <View style={{ paddingHorizontal: metrics.space.lg }}>
          <SheetButton testID={`tables-delete-${kind}-confirm`} tone="danger" label={t(kind === "table" ? "tables.remove.deleteTable" : "tables.remove.deleteBase")} disabled={!ok || busy} busy={busy} onPress={() => onDelete(typed)} />
        </View>
      }
    >
      <View style={{ gap: metrics.space.sm, paddingHorizontal: metrics.space.lg }}>
        {consequence ? (
          <Text testID={`tables-delete-${kind}-impact`} tone="danger">
            {consequence}
          </Text>
        ) : null}
        <Text tone="danger" variant="label">
          {t("tables.remove.noUndo")}
        </Text>
        <Text>{t("tables.remove.typeTheName")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, padding: metrics.space.sm, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <Text testID={`tables-delete-${kind}-name`} selectable variant="label" style={{ flex: 1 }}>
            {name}
          </Text>
          <Pressable testID={`tables-delete-${kind}-copy`} onPress={() => void Clipboard.setStringAsync(name)} accessibilityRole="button" accessibilityLabel={t("tables.remove.copyName")} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
            <Copy size={18} color={colors.accent} />
          </Pressable>
        </View>
        <TextInput
          testID={`tables-delete-${kind}-input`}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          importantForAutofill="no"
          placeholder={name}
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={t("tables.remove.inputLabel", { name })}
          style={{ minHeight: 44, borderWidth: 1, borderColor: ok ? colors.danger : colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface }}
        />
        {typed.length > 0 && !ok ? (
          <Text tone="muted" variant="caption" testID={`tables-delete-${kind}-mismatch`} accessibilityLiveRegion="polite">
            {t("tables.remove.notYet")}
          </Text>
        ) : null}
        {error ? (
          <Text tone="danger" testID={`tables-delete-${kind}-error`} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}
