/**
 * ADMIN SHEETS (increment 6a; the web's `BaseForm.tsx`, `TableTabs.tsx` and
 * `TableMenuPanels.tsx`):
 *   - `NameSheet`: a name, an optional description and an optional colour.
 *     Used for a new base, editing a base, a new table, and renaming or
 *     describing a table.
 *   - `ManageTablesSheet`: the base's tables in order, moved up and down,
 *     saved in one call (the web drags its tabs; a phone moves a row).
 * The screens own the calls; these only collect what the person chose.
 */
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/BottomSheet";
import { SheetButton } from "@/components/fields/FieldRow";
import { ArrowDown, ArrowUp, Check } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { OPTION_PALETTE } from "./palette";

export type NameSheetValue = { name: string; description: string | null; color: string | null };

export function NameSheet({
  title,
  initial,
  withDescription = false,
  withColor = false,
  saveLabel,
  note,
  busy,
  error,
  onSave,
  onClose,
  testID,
}: {
  title: string;
  initial: { name: string; description?: string | null; color?: string | null };
  withDescription?: boolean;
  withColor?: boolean;
  saveLabel: string;
  note?: string;
  busy: boolean;
  error: string | null;
  onSave: (value: NameSheetValue) => void;
  onClose: () => void;
  testID: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [color, setColor] = useState<string | null>(initial.color ?? null);
  const trimmed = name.trim();
  const input = { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface };

  return (
    <BottomSheet
      open
      title={title}
      onClose={onClose}
      testID={testID}
      footer={
        <View style={{ paddingHorizontal: metrics.space.lg }}>
          <SheetButton testID={`${testID}-save`} label={saveLabel} disabled={!trimmed || busy} busy={busy} onPress={() => onSave({ name: trimmed, description: withDescription ? description.trim() || null : null, color: withColor ? color : null })} />
        </View>
      }
    >
      <View style={{ gap: metrics.space.sm, paddingHorizontal: metrics.space.lg }}>
        <Text variant="label">{t("tables.admin.name")}</Text>
        <TextInput testID={`${testID}-name`} value={name} onChangeText={setName} autoFocus maxLength={80} accessibilityLabel={t("tables.admin.name")} placeholderTextColor={colors.inkMuted} style={input} />
        {withDescription ? (
          <>
            <Text variant="label">{t("tables.admin.description")}</Text>
            <TextInput testID={`${testID}-description`} value={description} onChangeText={setDescription} multiline maxLength={500} placeholder={t("tables.admin.descriptionPlaceholder")} accessibilityLabel={t("tables.admin.description")} placeholderTextColor={colors.inkMuted} style={[input, { minHeight: 88, paddingVertical: metrics.space.sm, textAlignVertical: "top" }]} />
          </>
        ) : null}
        {withColor ? (
          <>
            <Text variant="label">{t("tables.admin.color")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
              {OPTION_PALETTE.map((hex, i) => {
                const on = color === hex;
                return (
                  <Pressable key={hex} testID={`${testID}-color-${i}`} onPress={() => setColor(hex)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t("tables.admin.colorN", { n: i + 1 })} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: hex, alignItems: "center", justifyContent: "center", borderWidth: on ? 3 : 0, borderColor: colors.ink }}>
                    {on ? <Check size={18} color={colors.onAccent} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
        {note ? (
          <Text tone="muted" variant="caption">
            {note}
          </Text>
        ) : null}
        {error ? (
          <Text tone="danger" testID={`${testID}-error`} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

/** One table moved one place, the rest kept in order. Pure, tested. */
export function moveTable(ids: number[], id: number, by: -1 | 1): number[] {
  const from = ids.indexOf(id);
  const to = from + by;
  if (from === -1 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export function ManageTablesSheet({ tables, busy, error, onSave, onClose }: { tables: { id: number; name: string }[]; busy: boolean; error: string | null; onSave: (ids: number[]) => void; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [order, setOrder] = useState(() => tables.map((x) => x.id));
  const name = (id: number) => tables.find((x) => x.id === id)?.name ?? "";
  const changed = order.some((id, i) => id !== tables[i]?.id);

  return (
    <BottomSheet
      open
      title={t("tables.admin.manageTables")}
      onClose={onClose}
      testID="tables-manage"
      footer={
        <View style={{ paddingHorizontal: metrics.space.lg }}>
          <SheetButton testID="tables-manage-save" label={t("tables.admin.saveOrder")} disabled={!changed || busy} busy={busy} onPress={() => onSave(order)} />
        </View>
      }
    >
      <View style={{ paddingHorizontal: metrics.space.lg }}>
        {order.map((id, i) => (
          <View key={id} testID={`tables-manage-row-${i}`} style={{ flexDirection: "row", alignItems: "center", minHeight: metrics.touch, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
              {name(id)}
            </Text>
            <Pressable testID={`tables-manage-up-${id}`} disabled={i === 0} onPress={() => setOrder((o) => moveTable(o, id, -1))} accessibilityRole="button" accessibilityState={{ disabled: i === 0 }} accessibilityLabel={t("tables.admin.moveLeft", { name: name(id) })} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center", opacity: i === 0 ? 0.3 : 1 }}>
              <ArrowUp size={18} color={colors.ink} />
            </Pressable>
            <Pressable testID={`tables-manage-down-${id}`} disabled={i === order.length - 1} onPress={() => setOrder((o) => moveTable(o, id, 1))} accessibilityRole="button" accessibilityState={{ disabled: i === order.length - 1 }} accessibilityLabel={t("tables.admin.moveRight", { name: name(id) })} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center", opacity: i === order.length - 1 ? 0.3 : 1 }}>
              <ArrowDown size={18} color={colors.ink} />
            </Pressable>
          </View>
        ))}
        {error ? (
          <Text tone="danger" testID="tables-manage-error" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}
