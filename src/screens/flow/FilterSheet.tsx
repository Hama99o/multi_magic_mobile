/**
 * Filter the board: priority (the web's chips, "None" included), assignee and
 * label (which the web does not have; a phone shows one column at a time, so
 * narrowing the cards matters more there). Every choice applies at once and
 * the board's Filter chip counts them.
 */
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Person } from "@/api/flow";
import type { FieldDefinition, Tag } from "@/api/fields";
import { BottomSheet } from "@/components/BottomSheet";
import { ChoiceRow, SheetButton } from "@/components/fields/FieldRow";
import { Text } from "@/components/reusables/text";
import { useMetrics } from "@/hooks/useColors";
import { activeFilters, fieldByKey, initials, NO_FILTER, type BoardFilter, type BoardSort } from "./logic";
import { Segmented } from "./parts";

export function FilterSheet({
  filter,
  sort,
  fields,
  people,
  tagsByCategory,
  meId,
  onChange,
  onSort,
  onClose,
}: {
  filter: BoardFilter;
  sort: BoardSort;
  fields: FieldDefinition[];
  people: Person[];
  tagsByCategory: Record<number, Tag[]>;
  meId: number | undefined;
  onChange: (f: BoardFilter) => void;
  onSort: (s: BoardSort) => void;
  onClose: () => void;
}) {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const priority = fieldByKey(fields, "priority");
  const labelsField = fieldByKey(fields, "labels");
  const tags = labelsField?.tagCategoryId ? (tagsByCategory[labelsField.tagCategoryId] ?? []) : [];
  const toggle = <K extends "priorities" | "assigneeIds" | "labelIds">(key: K, v: BoardFilter[K][number]) => {
    const list = filter[key] as (typeof v)[];
    onChange({ ...filter, [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] });
  };
  const ordered = [...people].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.name.localeCompare(b.name)));

  const heading = (text: string) => (
    <Text variant="label" tone="muted" accessibilityRole="header" style={{ marginTop: metrics.space.md, marginBottom: metrics.space.xs }}>
      {text}
    </Text>
  );

  return (
    <BottomSheet
      open
      title={t("flow.filter.title")}
      onClose={onClose}
      testID="flow-filter"
      headerRight={
        activeFilters(filter) ? (
          <Pressable testID="flow-filter-clear" onPress={() => onChange({ ...NO_FILTER, q: filter.q })} accessibilityRole="button" accessibilityLabel={t("flow.filter.clear")} style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: metrics.space.sm }}>
            <Text tone="accent" variant="label">
              {t("flow.filter.clear")}
            </Text>
          </Pressable>
        ) : null
      }
      footer={<SheetButton testID="flow-filter-done" label={t("flow.filter.show")} onPress={onClose} />}
    >
      {heading(t("flow.filter.sort"))}
      <Segmented
        testID="flow-sort"
        value={sort}
        onChange={onSort}
        options={[
          { value: "manual", label: t("flow.filter.manual") },
          { value: "priority", label: t("flow.filter.byPriority") },
        ]}
      />
      {priority ? (
        <>
          {heading(priority.name)}
          <View>
            {priority.config.options.map((o) => (
              <ChoiceRow key={o.value} testID={`flow-filter-priority-${o.value}`} label={o.label} color={o.color} selected={filter.priorities.includes(o.value)} multi onPress={() => toggle("priorities", o.value)} />
            ))}
          </View>
        </>
      ) : null}
      {ordered.length ? (
        <>
          {heading(t("flow.filter.assignee"))}
          {ordered.map((p) => (
            <ChoiceRow key={p.id} testID="flow-filter-person" label={p.id === meId ? t("flow.filter.me", { name: p.name }) : p.name} avatar={initials(p.name)} selected={filter.assigneeIds.includes(p.id)} multi onPress={() => toggle("assigneeIds", p.id)} />
          ))}
        </>
      ) : null}
      {tags.length ? (
        <>
          {heading(labelsField?.name ?? t("flow.filter.labels"))}
          {tags.map((tag) => (
            <ChoiceRow key={tag.id} testID="flow-filter-label" label={tag.label} color={tag.color} selected={filter.labelIds.includes(tag.id)} multi onPress={() => toggle("labelIds", tag.id)} />
          ))}
        </>
      ) : null}
    </BottomSheet>
  );
}
