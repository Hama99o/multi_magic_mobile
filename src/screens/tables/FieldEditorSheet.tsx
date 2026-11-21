/**
 * ADD OR EDIT A COLUMN (increment 6c; the web's `FieldEditor.tsx`): name,
 * description, type, a select's options (colour, order), a default, a link's
 * table and relation, a lookup's or rollup's link, target and function.
 * The rules are `fieldEditor.ts`'s, tested there; this draws them.
 *
 * The schema is everyone's, so the sheet says so; changing an existing
 * column's type says the cells will be converted before anything is sent.
 */
import { useState } from "react";
import { Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FieldDefinition } from "@/api/fields";
import { tablesKeys } from "@/api/keys";
import { tablesApi, type Table, type TableSummary } from "@/api/tables";
import { failureMessage } from "@/api/failure";
import { BottomSheet } from "@/components/BottomSheet";
import { SheetButton } from "@/components/fields/FieldRow";
import { ArrowDown, ArrowUp, Plus, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { DateValue } from "./FilterSortSheet";
import {
  blockedBy,
  canHaveDefault,
  cycleColor,
  draftFrom,
  emptyDefault,
  fieldBody,
  isComputed,
  moveOption,
  needsTarget,
  newOption,
  RELATIONS,
  ROLLUP_FUNCTIONS,
  targetsFor,
  typesFor,
  type FieldDraft,
  type TableFieldType,
} from "./fieldEditor";

export function FieldEditorSheet({ table, tables, field, onDone, onClose }: { table: Table; tables: TableSummary[]; field: FieldDefinition | null; onDone: (saved: FieldDefinition) => void; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const currentRelation = field ? (table.relations[field.id] ?? null) : null;
  const [draft, setDraft] = useState<FieldDraft>(() => draftFrom(field, currentRelation));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<FieldDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const isPrimary = field !== null && field.id === table.primaryFieldId;
  const linkColumns = table.fields.filter((f) => f.fieldType === "multi_record" && f.id !== field?.id);
  const types = typesFor({ isPrimary, hasLinkColumn: linkColumns.length > 0, current: field ? draft.type : null });
  const linkedTableId = (() => {
    const link = linkColumns.find((f) => f.id === draft.linkFieldId);
    const id = link?.config.raw.table_id;
    return typeof id === "number" ? id : null;
  })();
  const linked = useQuery({ queryKey: tablesKeys.table(linkedTableId ?? 0), queryFn: () => tablesApi.table(linkedTableId!), enabled: linkedTableId !== null && isComputed(draft.type) });
  const targets = targetsFor(draft.type, linked.data?.fields ?? []);
  const blocked = blockedBy(draft, targets);
  const typeChanges = field !== null && (field.fieldType as string) !== draft.type;

  const save = async () => {
    if (blocked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = fieldBody(draft, field ? { type: field.fieldType as TableFieldType, relation: currentRelation } : null);
      const saved = field ? await tablesApi.updateField(field.id, body) : await tablesApi.createField(table.id, body);
      await Promise.all([client.invalidateQueries({ queryKey: tablesKeys.table(table.id) }), client.invalidateQueries({ queryKey: tablesKeys.rows(table.id) })]);
      onDone(saved);
    } catch (e) {
      setError(failureMessage(e, t("tables.fieldEditor.failed")));
    } finally {
      setBusy(false);
    }
  };

  const input = { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface };
  return (
    <BottomSheet
      open
      tall
      title={field ? t("tables.fieldEditor.editTitle", { column: field.name }) : t("tables.fieldEditor.newTitle")}
      subtitle={t("tables.columns.shared")}
      onClose={onClose}
      testID="tables-field-editor"
      footer={
        <View style={{ paddingHorizontal: metrics.space.lg, gap: metrics.space.xs }}>
          {blocked ? (
            <Text tone="muted" variant="caption" testID="tables-field-editor-blocked">
              {t(`tables.fieldEditor.blocked.${blocked}`)}
            </Text>
          ) : null}
          <SheetButton testID="tables-field-editor-save" label={field ? t("tables.fieldEditor.save") : t("tables.fieldEditor.create")} disabled={Boolean(blocked) || busy} busy={busy} onPress={() => void save()} />
        </View>
      }
    >
      <View style={{ gap: metrics.space.xs, paddingHorizontal: metrics.space.lg }}>
        <Label>{t("tables.fieldEditor.name")}</Label>
        <TextInput testID="tables-field-editor-name" value={draft.name} onChangeText={(name) => set({ name })} autoFocus={!field} maxLength={80} accessibilityLabel={t("tables.fieldEditor.name")} placeholderTextColor={colors.inkMuted} style={input} />
        <Label>{t("tables.fieldEditor.description")}</Label>
        <TextInput testID="tables-field-editor-description" value={draft.description} onChangeText={(description) => set({ description })} multiline maxLength={500} placeholder={t("tables.fieldEditor.descriptionPlaceholder")} accessibilityLabel={t("tables.fieldEditor.description")} placeholderTextColor={colors.inkMuted} style={[input, { minHeight: 64, paddingVertical: metrics.space.sm, textAlignVertical: "top" }]} />

        <Label>{t("tables.fieldEditor.type")}</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
          {types.map((type) => (
            <Chip key={type} testID={`tables-field-editor-type-${type}`} on={draft.type === type} label={t(`fields.types.${type}`)} onPress={() => set({ type, defaultValue: field?.fieldType === type ? draftFrom(field, currentRelation).defaultValue : emptyDefault(type) })} />
          ))}
        </View>
        {typeChanges ? (
          <Text tone="danger" variant="caption" testID="tables-field-editor-type-warning">
            {t("tables.fieldEditor.typeWarning")}
          </Text>
        ) : null}

        {draft.type === "single_select" || draft.type === "multi_select" ? (
          <>
            <Label>{t("tables.fieldEditor.options")}</Label>
            {draft.options.map((o, i) => (
              <View key={o.key} testID={`tables-field-editor-option-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
                <Pressable testID={`tables-field-editor-option-${i}-color`} onPress={() => set({ options: draft.options.map((x, j) => (j === i ? { ...x, color: cycleColor(x.color) } : x)) })} accessibilityRole="button" accessibilityLabel={t("tables.fieldEditor.optionColor", { option: o.label || String(i + 1) })} hitSlop={6} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: o.color }} />
                <TextInput testID={`tables-field-editor-option-${i}-label`} value={o.label} onChangeText={(label) => set({ options: draft.options.map((x, j) => (j === i ? { ...x, label } : x)) })} placeholder={t("tables.fieldEditor.optionPlaceholder")} accessibilityLabel={t("tables.fieldEditor.optionLabel", { n: i + 1 })} placeholderTextColor={colors.inkMuted} style={[input, { flex: 1 }]} />
                <Pressable testID={`tables-field-editor-option-${i}-up`} disabled={i === 0} onPress={() => set({ options: moveOption(draft.options, i, -1) })} accessibilityRole="button" accessibilityLabel={t("tables.fieldEditor.optionUp", { option: o.label || String(i + 1) })} style={{ width: 32, height: 44, alignItems: "center", justifyContent: "center", opacity: i === 0 ? 0.3 : 1 }}>
                  <ArrowUp size={16} color={colors.ink} />
                </Pressable>
                <Pressable testID={`tables-field-editor-option-${i}-down`} disabled={i === draft.options.length - 1} onPress={() => set({ options: moveOption(draft.options, i, 1) })} accessibilityRole="button" accessibilityLabel={t("tables.fieldEditor.optionDown", { option: o.label || String(i + 1) })} style={{ width: 32, height: 44, alignItems: "center", justifyContent: "center", opacity: i === draft.options.length - 1 ? 0.3 : 1 }}>
                  <ArrowDown size={16} color={colors.ink} />
                </Pressable>
                <Pressable testID={`tables-field-editor-option-${i}-remove`} onPress={() => set({ options: draft.options.filter((_, j) => j !== i) })} accessibilityRole="button" accessibilityLabel={t("tables.fieldEditor.optionRemove", { option: o.label || String(i + 1) })} style={{ width: 32, height: 44, alignItems: "center", justifyContent: "center" }}>
                  <X size={16} color={colors.inkMuted} />
                </Pressable>
              </View>
            ))}
            <Pressable testID="tables-field-editor-option-add" onPress={() => set({ options: [...draft.options, newOption(draft.options)] })} accessibilityRole="button" accessibilityLabel={t("tables.fieldEditor.optionAdd")} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs, minHeight: metrics.touch }}>
              <Plus size={18} color={colors.accent} />
              <Text tone="accent" variant="label">
                {t("tables.fieldEditor.optionAdd")}
              </Text>
            </Pressable>
          </>
        ) : null}

        {draft.type === "multi_record" ? (
          <>
            <Label>{t("tables.fieldEditor.linkTable")}</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
              {tables.map((tb) => (
                <Chip key={tb.id} testID={`tables-field-editor-link-table-${tb.id}`} on={draft.linkTableId === tb.id} label={tb.name} onPress={() => set({ linkTableId: tb.id })} />
              ))}
            </View>
            {draft.linkTableId ? (
              <>
                <Label>{t("tables.fieldEditor.relation")}</Label>
                {RELATIONS.map((r) => {
                  const on = draft.relation === r;
                  const target = tables.find((tb) => tb.id === draft.linkTableId)?.name ?? "";
                  return (
                    <Pressable key={r} testID={`tables-field-editor-relation-${r}`} onPress={() => set({ relation: r })} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${t(`tables.fieldEditor.relations.${r}.label`)}. ${t(`tables.fieldEditor.relations.${r}.sentence`, { a: table.name, b: target })}`} style={{ padding: metrics.space.sm, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? `${colors.accent}14` : colors.surface }}>
                      <Text variant="label" tone={on ? "accent" : "default"}>
                        {t(`tables.fieldEditor.relations.${r}.label`)}
                      </Text>
                      <Text tone="muted" variant="caption">
                        {t(`tables.fieldEditor.relations.${r}.sentence`, { a: table.name, b: target })}
                      </Text>
                    </Pressable>
                  );
                })}
              </>
            ) : null}
          </>
        ) : null}

        {isComputed(draft.type) ? (
          <>
            <Label>{t("tables.fieldEditor.through")}</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
              {linkColumns.map((f) => (
                <Chip key={f.id} testID={`tables-field-editor-link-column-${f.id}`} on={draft.linkFieldId === f.id} label={f.name} onPress={() => set({ linkFieldId: f.id, targetFieldId: null })} />
              ))}
            </View>
            {draft.type === "rollup" ? (
              <>
                <Label>{t("tables.fieldEditor.function")}</Label>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
                  {ROLLUP_FUNCTIONS.map((fn) => (
                    <Chip key={fn} testID={`tables-field-editor-function-${fn}`} on={draft.rollup === fn} label={t(`tables.fieldEditor.functions.${fn}`)} onPress={() => set({ rollup: fn })} />
                  ))}
                </View>
              </>
            ) : null}
            {draft.linkFieldId && needsTarget(draft.type, draft.rollup) ? (
              <>
                <Label>{draft.type === "rollup" ? t("tables.fieldEditor.targetNumber") : t("tables.fieldEditor.target")}</Label>
                {targets.length ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
                    {targets.map((f) => (
                      <Chip key={f.id} testID={`tables-field-editor-target-${f.id}`} on={draft.targetFieldId === f.id} label={f.name} onPress={() => set({ targetFieldId: f.id })} />
                    ))}
                  </View>
                ) : linked.isPending ? null : (
                  <Text tone="muted" variant="caption" testID="tables-field-editor-no-target">
                    {t("tables.fieldEditor.noTarget")}
                  </Text>
                )}
              </>
            ) : null}
          </>
        ) : null}

        {canHaveDefault(draft.type) ? (
          <>
            <Label>{t("tables.fieldEditor.default")}</Label>
            {draft.type === "boolean" ? (
              <Switch testID="tables-field-editor-default" value={draft.defaultValue === true} onValueChange={(on) => set({ defaultValue: on })} accessibilityLabel={t("tables.fieldEditor.default")} trackColor={{ true: colors.accent, false: colors.border }} />
            ) : draft.type === "date" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs, alignItems: "center" }}>
                <Chip testID="tables-field-editor-default-none" on={draft.defaultValue === ""} label={t("tables.fieldEditor.noDefault")} onPress={() => set({ defaultValue: "" })} />
                <Chip testID="tables-field-editor-default-today" on={draft.defaultValue === "today"} label={t("tables.fieldEditor.today")} hint={t("tables.fieldEditor.todayHint")} onPress={() => set({ defaultValue: "today" })} />
                <DateValue value={typeof draft.defaultValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(draft.defaultValue) ? draft.defaultValue : null} onChange={(v) => set({ defaultValue: v ?? "" })} testID="tables-field-editor-default-date" label={t("tables.fieldEditor.default")} />
              </View>
            ) : draft.type === "single_select" || draft.type === "multi_select" ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: metrics.space.xs }}>
                {draft.options
                  .filter((o) => o.label.trim())
                  .map((o) => {
                    const multi = draft.type === "multi_select";
                    const picked = multi ? (Array.isArray(draft.defaultValue) ? draft.defaultValue : []) : draft.defaultValue === o.key ? [o.key] : [];
                    const on = picked.includes(o.key);
                    return <Chip key={o.key} testID={`tables-field-editor-default-${o.key}`} on={on} label={o.label} onPress={() => set({ defaultValue: multi ? (on ? picked.filter((k) => k !== o.key) : [...picked, o.key]) : on ? "" : o.key })} />;
                  })}
              </ScrollView>
            ) : (
              <TextInput testID="tables-field-editor-default" value={typeof draft.defaultValue === "string" ? draft.defaultValue : ""} onChangeText={(v) => set({ defaultValue: v })} placeholder={t("tables.fieldEditor.noDefault")} keyboardType={draft.type === "decimal" ? "decimal-pad" : draft.type === "phone" ? "phone-pad" : draft.type === "email" ? "email-address" : draft.type === "url" ? "url" : "default"} autoCapitalize={draft.type === "email" || draft.type === "url" ? "none" : "sentences"} accessibilityLabel={t("tables.fieldEditor.default")} placeholderTextColor={colors.inkMuted} style={input} />
            )}
          </>
        ) : null}

        {error ? (
          <Text tone="danger" testID="tables-field-editor-error" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

function Chip({ testID, on, label, onPress, hint }: { testID: string; on: boolean; label: string; onPress: () => void; hint?: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label} accessibilityHint={hint} style={{ minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center", borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.surface }}>
      <Text variant="label" tone={on ? "onAccent" : "default"}>
        {label}
      </Text>
    </Pressable>
  );
}

function Label({ children }: { children: string }) {
  const metrics = useMetrics();
  return (
    <Text variant="label" style={{ marginTop: metrics.space.sm }}>
      {children}
    </Text>
  );
}
