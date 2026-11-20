/**
 * FILTER & SORT, one sheet (SPEC C7; Beli's sort-on-top, Insight Timer's
 * "Show 4", Fresha's Clear all + Apply). Increment 3.
 *
 * Everything here is the PERSON's (the owner's rule, SPEC C1): it is applied
 * to the personal layer and sent as the query, never written to the view.
 * The sheet works on a draft; "Show 42" applies it, saying first how many
 * rows it keeps (a one-row request for the count).
 */
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { FieldDefinition } from "@/api/fields";
import { tablesApi, type FilterCondition, type SortRule } from "@/api/tables";
import { BottomSheet } from "@/components/BottomSheet";
import { ArrowUpDown, Plus, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { SheetButton } from "@/components/fields/FieldRow";
import { useColors, useMetrics } from "@/hooks/useColors";
import { colorHex } from "@/screens/flow/logic";
import { addSort, defaultCondition, directionSet, groupable, isComplete, kindOf, OPERATORS, parseNumber, retarget, sortable, takesValue, withOperator } from "./filters";

export interface FindDraft {
  filters: FilterCondition[];
  match: "and" | "or";
  sorts: SortRule[];
  groupBy: number | null;
}

const COUNT_DELAY_MS = 350;

export function FilterSortSheet({
  open,
  tableId,
  fields,
  initial,
  search,
  onApply,
  onClose,
}: {
  open: boolean;
  tableId: number;
  fields: FieldDefinition[];
  initial: FindDraft;
  search: string;
  onApply: (draft: FindDraft) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState<FindDraft>(initial);
  const [adding, setAdding] = useState<"filter" | "sort" | null>(null);
  const [counted, setCounted] = useState<FindDraft>(initial);
  const byId = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);

  useEffect(() => {
    const id = setTimeout(() => setCounted(draft), COUNT_DELAY_MS);
    return () => clearTimeout(id);
  }, [draft]);
  const complete = counted.filters.filter(isComplete);
  const count = useQuery({
    queryKey: ["tables", "count", tableId, JSON.stringify({ ...counted, filters: complete, search })],
    queryFn: () => tablesApi.count(tableId, { search, filters: complete, match: counted.match, sorts: counted.sorts, groupBy: counted.groupBy }),
    enabled: open,
  });

  const setFilter = (i: number, next: FilterCondition) => setDraft((d) => ({ ...d, filters: d.filters.map((c, j) => (j === i ? next : c)) }));
  const showLabel = count.data === undefined ? t("tables.find.show") : t("tables.find.showCount", { count: count.data, formatted: count.data.toLocaleString(i18n.language) });

  return (
    <BottomSheet
      open={open}
      title={t("tables.find.title")}
      subtitle={t("tables.find.personal")}
      onClose={onClose}
      testID="tables-find"
      footer={
        <View style={{ flexDirection: "row", gap: metrics.space.sm, paddingHorizontal: metrics.space.lg }}>
          <View style={{ flex: 1 }}>
            <SheetButton testID="tables-find-clear" tone="neutral" label={t("tables.find.clearAll")} onPress={() => setDraft({ filters: [], match: "and", sorts: [], groupBy: null })} />
          </View>
          <View style={{ flex: 1 }}>
            <SheetButton
              testID="tables-find-apply"
              label={showLabel}
              onPress={() => {
                onApply(draft);
                onClose();
              }}
            />
          </View>
        </View>
      }
    >
      <View style={{ gap: metrics.space.lg, paddingHorizontal: metrics.space.lg }}>
        {/* ── Sort ───────────────────────────────────────── */}
        <View style={{ gap: metrics.space.sm }}>
          <Text variant="label">{t("tables.find.sortBy")}</Text>
          {draft.sorts.map((s, i) => {
            const f = byId.get(s.fieldId);
            const set = directionSet(f);
            return (
              <View key={`${s.fieldId}-${i}`} testID={`tables-sort-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 44 }}>
                <Text numberOfLines={1} style={{ flex: 1 }}>
                  {f?.name ?? `#${s.fieldId}`}
                </Text>
                <Pressable
                  testID={`tables-sort-${i}-direction`}
                  onPress={() => setDraft((d) => ({ ...d, sorts: d.sorts.map((x, j) => (j === i ? { ...x, direction: x.direction === "asc" ? "desc" : "asc" } : x)) }))}
                  accessibilityRole="button"
                  accessibilityLabel={t(`tables.sortDir.${set}.${s.direction}`)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: colors.border }}
                >
                  <ArrowUpDown size={14} color={colors.ink} />
                  <Text variant="label">{t(`tables.sortDir.${set}.${s.direction}`)}</Text>
                </Pressable>
                <RemoveButton testID={`tables-sort-${i}-remove`} label={t("tables.find.removeSort")} onPress={() => setDraft((d) => ({ ...d, sorts: d.sorts.filter((_, j) => j !== i) }))} />
              </View>
            );
          })}
          {draft.sorts.length === 0 ? (
            <Text tone="muted" variant="caption">
              {t("tables.find.noSort")}
            </Text>
          ) : null}
          <AddButton testID="tables-sort-add" label={t("tables.find.addSort")} onPress={() => setAdding(adding === "sort" ? null : "sort")} />
          {adding === "sort" ? (
            <FieldChips
              testID="tables-sort-pick"
              fields={sortable(fields)}
              onPick={(f) => {
                setDraft((d) => ({ ...d, sorts: addSort(d.sorts, f.id) }));
                setAdding(null);
              }}
            />
          ) : null}
        </View>

        {/* ── Filters ────────────────────────────────────── */}
        <View style={{ gap: metrics.space.sm }}>
          <Text variant="label">{t("tables.find.filters")}</Text>
          {draft.filters.length > 1 ? (
            <ChipRow
              testID="tables-match"
              value={draft.match}
              options={[
                { value: "and", label: t("tables.find.matchAll") },
                { value: "or", label: t("tables.find.matchAny") },
              ]}
              onChange={(match) => setDraft((d) => ({ ...d, match }))}
            />
          ) : null}
          {draft.filters.map((c, i) => {
            const f = byId.get(c.fieldId);
            if (!f) return null;
            return (
              <View key={`${c.fieldId}-${i}`} testID={`tables-filter-${i}`} style={{ gap: metrics.space.xs, padding: metrics.space.sm, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: isComplete(c) ? colors.border : colors.accent }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
                  <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
                    {f.name}
                  </Text>
                  <RemoveButton testID={`tables-filter-${i}-remove`} label={t("tables.find.removeFilter")} onPress={() => setDraft((d) => ({ ...d, filters: d.filters.filter((_, j) => j !== i) }))} />
                </View>
                <ChipRow testID={`tables-filter-${i}-op`} value={c.op} options={OPERATORS[kindOf(f)].map((op) => ({ value: op, label: t(`tables.ops.${op}`) }))} onChange={(op) => setFilter(i, withOperator(c, op))} />
                {takesValue(c.op) ? <ValueEditor field={f} condition={c} onChange={(value) => setFilter(i, { ...c, value })} testID={`tables-filter-${i}-value`} /> : null}
              </View>
            );
          })}
          <AddButton testID="tables-filter-add" label={t("tables.find.addFilter")} onPress={() => setAdding(adding === "filter" ? null : "filter")} />
          {adding === "filter" ? (
            <FieldChips
              testID="tables-filter-pick"
              fields={fields}
              onPick={(f) => {
                setDraft((d) => ({ ...d, filters: [...d.filters, retarget(defaultCondition(f), f)] }));
                setAdding(null);
              }}
            />
          ) : null}
        </View>

        {/* ── Group ──────────────────────────────────────── */}
        {groupable(fields).length ? (
          <View style={{ gap: metrics.space.sm }}>
            <Text variant="label">{t("tables.find.groupBy")}</Text>
            <ChipRow
              testID="tables-group"
              value={draft.groupBy === null ? "none" : String(draft.groupBy)}
              options={[{ value: "none", label: t("tables.find.noGroup") }, ...groupable(fields).map((f) => ({ value: String(f.id), label: f.name }))]}
              onChange={(v) => setDraft((d) => ({ ...d, groupBy: v === "none" ? null : Number(v) }))}
            />
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

/** The value of one condition, by the column's kind. */
function ValueEditor({ field, condition, onChange, testID }: { field: FieldDefinition; condition: FilterCondition; onChange: (v: unknown) => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const kind = kindOf(field);
  const [typed, setTyped] = useState(condition.value === null || condition.value === undefined ? "" : String(condition.value));

  if (kind === "boolean") {
    return <Switch testID={testID} value={condition.value === true} onValueChange={onChange} accessibilityLabel={field.name} trackColor={{ true: colors.accent, false: colors.border }} />;
  }
  if (kind === "single_select" || kind === "multi_select") {
    const picked = Array.isArray(condition.value) ? (condition.value as string[]) : [];
    return (
      <View testID={testID} style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
        {field.config.options.map((o) => {
          const on = picked.includes(o.value);
          const hex = colorHex(o.color) ?? colors.inkMuted;
          return (
            <Pressable
              key={o.value}
              testID={`${testID}-${o.value}`}
              onPress={() => onChange(on ? picked.filter((v) => v !== o.value) : [...picked, o.value])}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              style={{ minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center", borderWidth: 1, borderColor: on ? hex : colors.border, backgroundColor: on ? `${hex}33` : colors.surface }}
            >
              <Text variant="label">{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }
  const numeric = kind === "number";
  const dated = kind === "date" || kind === "datetime";
  return (
    <TextInput
      testID={testID}
      value={typed}
      onChangeText={(text) => {
        setTyped(text);
        if (numeric) onChange(parseNumber(text));
        else if (dated) onChange(/^\d{4}-\d{2}-\d{2}$/.test(text.trim()) ? text.trim() : null);
        else onChange(text.trim() ? text : null);
      }}
      placeholder={dated ? t("tables.find.datePlaceholder") : numeric ? t("tables.find.numberPlaceholder") : t("tables.find.textPlaceholder")}
      placeholderTextColor={colors.inkMuted}
      keyboardType={numeric ? "decimal-pad" : dated ? "numbers-and-punctuation" : "default"}
      autoCorrect={false}
      accessibilityLabel={field.name}
      style={{ minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface }}
    />
  );
}

function ChipRow<T extends string>({ value, options, onChange, testID }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID={testID} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: metrics.space.xs }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} testID={`${testID}-${o.value}`} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.label} style={{ minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center", borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.surface }}>
            <Text variant="label" tone={on ? "onAccent" : "default"}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function FieldChips({ fields, onPick, testID }: { fields: FieldDefinition[]; onPick: (f: FieldDefinition) => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View testID={testID} style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
      {fields.map((f) => (
        <Pressable key={f.id} testID={`${testID}-${f.id}`} onPress={() => onPick(f)} accessibilityRole="button" accessibilityLabel={f.name} style={{ minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
          <Text variant="label">{f.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function AddButton({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs, minHeight: 40 }}>
      <Plus size={18} color={colors.accent} />
      <Text tone="accent" variant="label">
        {label}
      </Text>
    </Pressable>
  );
}

function RemoveButton({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
      <X size={18} color={colors.inkMuted} />
    </Pressable>
  );
}
