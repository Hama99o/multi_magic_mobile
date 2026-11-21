/**
 * BULK EDIT (increment 5; the web's `BulkEditPanel.tsx:21-26`): one column
 * set to one value on every selected row, then one Undo. Links are left out,
 * as on the web (a link is a picker per row, not one value).
 */
import { useState } from "react";
import { Pressable, Switch, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { FieldDefinition } from "@/api/fields";
import { BottomSheet } from "@/components/BottomSheet";
import { SheetButton } from "@/components/fields/FieldRow";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { colorHex } from "@/screens/flow/logic";
import { DateValue } from "./FilterSortSheet";
import { parseNumber } from "./filters";

/** The column types one value can be set on (no links, no files, nothing the server computes). */
export const BULK_TYPES = ["text", "long_text", "phone", "email", "url", "integer", "decimal", "single_select", "multi_select", "boolean", "date", "datetime"] as const;
export const bulkEditable = (fields: FieldDefinition[]) => fields.filter((f) => (BULK_TYPES as readonly string[]).includes(f.fieldType));

export function BulkEditSheet({ count, fields, busy, error, onApply, onClose }: { count: number; fields: FieldDefinition[]; busy: boolean; error: string | null; onApply: (field: FieldDefinition, value: unknown) => void; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const choices = bulkEditable(fields);
  const [field, setField] = useState<FieldDefinition | null>(choices[0] ?? null);
  const [value, setValue] = useState<unknown>(null);
  const [typed, setTyped] = useState("");

  const pick = (f: FieldDefinition) => {
    setField(f);
    setTyped("");
    setValue(f.fieldType === "boolean" ? true : f.fieldType === "multi_select" ? [] : null);
  };
  const numeric = field?.fieldType === "integer" || field?.fieldType === "decimal";
  // Typed but unreadable ("1,250.50", "12 AFN") parses to null, and null is "clear": refuse it
  // rather than empty the column on every selected row (review T3, ee). Empty still clears.
  const unreadable = numeric && typed.trim() !== "" && value === null;

  return (
    <BottomSheet
      open
      title={t("tables.bulk.editTitle", { count })}
      onClose={onClose}
      testID="tables-bulk-edit"
      footer={
        <View style={{ paddingHorizontal: metrics.space.lg }}>
          <SheetButton testID="tables-bulk-edit-apply" label={t("tables.bulk.apply", { count })} disabled={!field || busy || unreadable} busy={busy} onPress={() => field && !unreadable && onApply(field, value)} />
        </View>
      }
    >
      <View style={{ gap: metrics.space.sm, paddingHorizontal: metrics.space.lg }}>
        <Text variant="label">{t("tables.bulk.column")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
          {choices.map((f) => {
            const on = f.id === field?.id;
            return (
              <Pressable key={f.id} testID={`tables-bulk-field-${f.id}`} onPress={() => pick(f)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={f.name} style={{ minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center", borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.surface }}>
                <Text variant="label" tone={on ? "onAccent" : "default"}>
                  {f.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {field ? (
          <>
            <Text variant="label">{t("tables.bulk.value")}</Text>
            {field.fieldType === "boolean" ? (
              <Switch testID="tables-bulk-value" value={value === true} onValueChange={setValue} accessibilityLabel={field.name} trackColor={{ true: colors.accent, false: colors.border }} />
            ) : field.fieldType === "single_select" || field.fieldType === "multi_select" ? (
              <View testID="tables-bulk-value" style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
                {field.config.options.map((o) => {
                  const multi = field.fieldType === "multi_select";
                  const picked = multi ? (Array.isArray(value) ? (value as string[]) : []) : value === o.value ? [o.value] : [];
                  const on = picked.includes(o.value);
                  const hex = colorHex(o.color) ?? colors.inkMuted;
                  return (
                    <Pressable
                      key={o.value}
                      testID={`tables-bulk-value-${o.value}`}
                      onPress={() => setValue(multi ? (on ? picked.filter((v) => v !== o.value) : [...picked, o.value]) : on ? null : o.value)}
                      accessibilityRole={multi ? "checkbox" : "radio"}
                      accessibilityState={multi ? { checked: on } : { selected: on }}
                      accessibilityLabel={o.label}
                      style={{ minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center", borderWidth: 1, borderColor: on ? hex : colors.border, backgroundColor: on ? `${hex}33` : colors.surface }}
                    >
                      <Text variant="label">{o.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : field.fieldType === "date" || field.fieldType === "datetime" ? (
              <DateValue value={typeof value === "string" ? value : null} onChange={setValue} testID="tables-bulk-value" label={field.name} />
            ) : (
              <TextInput
                testID="tables-bulk-value"
                value={typed}
                onChangeText={(text) => {
                  setTyped(text);
                  setValue(numeric ? parseNumber(text) : text);
                }}
                placeholder={t("tables.bulk.emptyHint")}
                placeholderTextColor={colors.inkMuted}
                keyboardType={numeric ? "decimal-pad" : field.fieldType === "phone" ? "phone-pad" : field.fieldType === "email" ? "email-address" : field.fieldType === "url" ? "url" : "default"}
                autoCapitalize={field.fieldType === "email" || field.fieldType === "url" ? "none" : "sentences"}
                multiline={field.fieldType === "long_text"}
                accessibilityLabel={field.name}
                style={{ minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface }}
              />
            )}
            {unreadable ? (
              <Text tone="danger" variant="caption" testID="tables-bulk-not-number" accessibilityLiveRegion="polite">
                {t("tables.bulk.notANumber")}
              </Text>
            ) : null}
            <Text tone="muted" variant="caption">
              {t("tables.bulk.hint", { count })}
            </Text>
          </>
        ) : (
          <Text tone="muted">{t("tables.bulk.noColumn")}</Text>
        )}
        {error ? (
          <Text tone="danger" testID="tables-bulk-error" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}
