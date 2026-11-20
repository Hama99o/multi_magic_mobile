/**
 * "Save as a new view…" (SPEC C1): the person's search, filters, sort, group,
 * hidden fields and colour become a NEW shared view, named, that everyone on
 * the base sees. The sheet says so in words before anything is sent. The view
 * on screen is never changed.
 */
import { useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/BottomSheet";
import { SheetButton } from "@/components/fields/FieldRow";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

export function SaveViewSheet({ open, suggested, busy, error, onSave, onClose }: { open: boolean; suggested: string; busy: boolean; error: string | null; onSave: (name: string) => void; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [name, setName] = useState(suggested);
  const trimmed = name.trim();
  return (
    <BottomSheet
      open={open}
      title={t("tables.saveView.title")}
      onClose={onClose}
      testID="tables-save-view"
      footer={
        <View style={{ paddingHorizontal: metrics.space.lg }}>
          <SheetButton testID="tables-save-view-save" label={t("tables.saveView.save")} disabled={!trimmed || busy} busy={busy} onPress={() => onSave(trimmed)} />
        </View>
      }
    >
      <View style={{ gap: metrics.space.sm, paddingHorizontal: metrics.space.lg }}>
        <Text tone="muted">{t("tables.saveView.body")}</Text>
        <TextInput
          testID="tables-save-view-name"
          value={name}
          onChangeText={setName}
          autoFocus
          maxLength={80}
          placeholder={t("tables.saveView.placeholder")}
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={t("tables.saveView.name")}
          style={{ minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface }}
        />
        {error ? (
          <Text tone="danger" testID="tables-save-view-error" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}
