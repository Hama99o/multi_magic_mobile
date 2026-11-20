/**
 * PROJECT FIELDS — the web's `ProjectFields.tsx`, for an owner or admin
 * (`FieldDefinitionPolicy` → the project's `update?`).
 *
 * Every field with its type IN WORDS (the web prints English literals), and
 * an editor per field: name, type (the 13), what a record field links to
 * (people, labels, cards, sprints), required; a select's options with their
 * colours; a labels field's labels. A labels field gets its own label
 * category, made when first saved, as the web does. Every delete is
 * confirmed (the web deletes a field and a label on one click).
 */
import { useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSubmitText } from "@/lib/useSubmitText";
import { useQuery } from "@tanstack/react-query";
import { fieldKeys, flowKeys } from "@/api/keys";
import { flowApi, PROJECT_OWNER_TYPE } from "@/api/flow";
import { EDITABLE_FIELD_TYPES, fieldsApi, isRecordType, isSelectType, optionKey, type FieldDefinition, type FieldType, type RecordClass, type SelectOption, type TagCategory } from "@/api/fields";
import { failureMessage } from "@/api/failure";
import { BottomSheet } from "@/components/BottomSheet";
import { ChoiceRow, FieldIcon, SheetButton } from "@/components/fields/FieldRow";
import { ChevronDown, ChevronRight, Plus, SlidersHorizontal, Trash2, X } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useMe } from "@/hooks/useMe";
import { COLUMN_COLORS, powersOf, roleIn } from "@/screens/flow/logic";
import { EmptyState, Swatches } from "@/screens/flow/parts";
import { useDeleteDefinition, useSaveDefinition, useTagWrites } from "@/screens/flow/useFlowMutations";

/** What a record field may link to on a board (the web's choices; `TableApp::Record` is Tables' own). */
const FLOW_RECORD_CLASSES: RecordClass[] = ["User", "Core::Tag", "FlowApp::Card", "FlowApp::Sprint"];
const RECORD_CLASS_KEY: Record<string, string> = { User: "user", "Core::Tag": "tag", "FlowApp::Card": "card", "FlowApp::Sprint": "sprint", "TableApp::Record": "record" };

export default function FieldsScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const projectId = Number(params.id);
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const me = useMe();
  const [editing, setEditing] = useState<FieldDefinition | "new" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const project = useQuery({ queryKey: flowKeys.project(projectId), queryFn: () => flowApi.project(projectId), enabled: projectId > 0 });
  const definitions = useQuery({ queryKey: fieldKeys.definitions(PROJECT_OWNER_TYPE, projectId), queryFn: () => fieldsApi.definitions(PROJECT_OWNER_TYPE, projectId), enabled: projectId > 0 });
  const categories = useQuery({ queryKey: fieldKeys.tagCategories(PROJECT_OWNER_TYPE, projectId), queryFn: () => fieldsApi.tagCategories(PROJECT_OWNER_TYPE, projectId), enabled: projectId > 0 });
  const remove = useDeleteDefinition(projectId, { onError: (e) => setNote(failureMessage(e, t("flow.fields.failed"))) });
  const manage = project.data ? powersOf(roleIn(project.data, me?.id)).manage : false;

  const confirmDelete = (d: FieldDefinition) =>
    Alert.alert(t("flow.fields.deleteTitle", { name: d.name }), t("flow.fields.deleteBody"), [
      { text: t("fields.cancel"), style: "cancel" },
      { text: t("flow.delete"), style: "destructive", onPress: () => remove.mutate(d.id) },
    ]);

  return (
    <Screen measure>
      <AppHeader app="flow" back title={t("flow.fields.title")} />
      {project.data ? (
        <Text tone="muted" variant="caption" numberOfLines={1} style={{ marginBottom: metrics.space.md }}>
          {project.data.title}
        </Text>
      ) : null}
      <LoadFailure error={definitions.error} loadFailed={t("flow.fields.loadFailed")} hasData={Boolean(definitions.data)} updatedAt={definitions.dataUpdatedAt} onRetry={() => void definitions.refetch()} testID="flow-fields-failed" />
      {note ? (
        <Pressable onPress={() => setNote(null)} accessibilityRole="button" accessibilityLiveRegion="polite" testID="flow-fields-note">
          <Text tone="danger">{note}</Text>
        </Pressable>
      ) : null}
      <ScrollView contentContainerStyle={{ paddingBottom: 120, gap: metrics.space.sm }}>
        {definitions.isPending ? <RowsSkeleton rows={6} testID="flow-fields-loading" /> : null}
        {definitions.data && definitions.data.length === 0 ? <EmptyState testID="flow-fields-empty" icon={SlidersHorizontal} title={t("flow.fields.none")} /> : null}
        {(definitions.data ?? []).map((d) => {
          return (
            <View key={d.id} testID="flow-field-row" style={{ flexDirection: "row", alignItems: "center", borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
              <Pressable
                testID="flow-field-open"
                disabled={!manage}
                onPress={() => setEditing(d)}
                accessibilityRole="button"
                accessibilityLabel={`${d.name}, ${typeLabel(d, t)}${d.required ? `, ${t("fields.required")}` : ""}`}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 60, paddingHorizontal: metrics.space.md }}
              >
                <FieldIcon field={d} size={20} color={colors.inkMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600" }} numberOfLines={1}>
                    {d.name}
                    {d.required ? <Text tone="danger"> *</Text> : null}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {typeLabel(d, t)}
                  </Text>
                </View>
                {manage ? <ChevronRight size={18} color={colors.inkMuted} /> : null}
              </Pressable>
              {manage ? (
                <Pressable testID="flow-field-delete" onPress={() => confirmDelete(d)} accessibilityRole="button" accessibilityLabel={t("flow.fields.delete", { name: d.name })} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
                  <Trash2 size={18} color={colors.inkMuted} />
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      {manage ? (
        <Pressable testID="flow-fields-add" onPress={() => setEditing("new")} accessibilityRole="button" accessibilityLabel={t("flow.fields.add")} style={{ position: "absolute", left: metrics.space.lg, right: metrics.space.lg, bottom: metrics.space.lg, flexDirection: "row", gap: 6, minHeight: metrics.touch, borderRadius: metrics.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent }}>
          <Plus size={18} color={colors.onAccent} />
          <Text variant="label" tone="onAccent">
            {t("flow.fields.add")}
          </Text>
        </Pressable>
      ) : null}
      {editing ? <FieldEditor projectId={projectId} definition={editing === "new" ? null : editing} categories={categories.data ?? []} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}

export function typeLabel(d: Pick<FieldDefinition, "fieldType" | "recordClass">, t: (k: string) => string): string {
  const type = t(`fields.types.${d.fieldType}`);
  return isRecordType(d.fieldType) && d.recordClass ? `${type} · ${t(`fields.recordClasses.${RECORD_CLASS_KEY[d.recordClass] ?? "record"}`)}` : type;
}

function FieldEditor({ projectId, definition, categories, onClose }: { projectId: number; definition: FieldDefinition | null; categories: TagCategory[]; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const firstInput = useRef<TextInput>(null);
  const [name, setName] = useState(definition?.name ?? "");
  const [type, setType] = useState<FieldType>(definition?.fieldType ?? "text");
  const [recordClass, setRecordClass] = useState<RecordClass>(definition?.recordClass ?? "User");
  const [required, setRequired] = useState(definition?.required ?? false);
  const [options, setOptions] = useState<SelectOption[]>(definition?.config.options ?? []);
  const [picking, setPicking] = useState<"type" | "class" | null>(null);
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const save = useSaveDefinition(projectId, { onDone: onClose, onError: (e) => setFailure(failureMessage(e, t("flow.fields.failed"))) });
  const record = isRecordType(type);
  const select = isSelectType(type);
  const tagField = record && recordClass === "Core::Tag";
  const category = tagField ? categories.find((c) => c.id === definition?.tagCategoryId) : undefined;

  const problem = !name.trim() ? t("flow.fields.nameRequired") : select && options.length === 0 ? t("flow.fields.needsOption") : null;

  const submit = async () => {
    setTried(true);
    setFailure(null);
    if (problem) return;
    let tagCategoryId = tagField ? (definition?.tagCategoryId ?? null) : null;
    if (tagField && tagCategoryId == null) {
      // A labels field needs a category: reuse one named like the field, else make it (the web's `ProjectFields.tsx`).
      const same = categories.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (same) tagCategoryId = same.id;
      else {
        setPreparing(true);
        try {
          tagCategoryId = (await fieldsApi.createTagCategory(PROJECT_OWNER_TYPE, projectId, name.trim())).id;
        } catch (e) {
          setFailure(failureMessage(e, t("flow.fields.failed")));
          return;
        } finally {
          setPreparing(false);
        }
      }
    }
    const config: Record<string, unknown> = { ...(definition?.config.raw ?? {}) };
    if (select) config.options = options.map((o) => ({ value: o.value, label: o.label, color: o.color }));
    else delete config.options;
    if (tagField && config.allow_create === undefined) config.allow_create = true;
    if (record && recordClass === "User" && config.scope === undefined) config.scope = "project_members";
    save.mutate({
      definitionId: definition?.id ?? null,
      input: { name: name.trim(), fieldType: type, recordClass: record ? recordClass : null, tagCategoryId, required, config },
    });
  };

  return (
    <BottomSheet focusRef={definition ? undefined : firstInput}
      open
      title={definition ? t("flow.fields.edit") : t("flow.fields.add")}
      onClose={onClose}
      testID="flow-field-editor"
      footer={<SheetButton testID="flow-field-save" label={definition ? t("fields.save") : t("flow.fields.create")} busy={save.isPending || preparing} onPress={() => void submit()} />}
    >
      <View style={{ gap: metrics.space.md }}>
        <View style={{ gap: metrics.space.xs }}>
          <Text variant="label">{t("flow.fields.name")}</Text>
          <TextInput testID="flow-field-name" value={name} onChangeText={setName} ref={firstInput} placeholder={t("flow.fields.namePlaceholder")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("flow.fields.name")} style={{ minHeight: 48, borderWidth: 1, borderColor: tried && !name.trim() ? colors.danger : colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface }} />
        </View>
        <Picker testID="flow-field-type" label={t("flow.fields.type")} value={t(`fields.types.${type}`)} onPress={() => setPicking("type")} />
        {record ? <Picker testID="flow-field-class" label={t("flow.fields.linksTo")} value={t(`fields.recordClasses.${RECORD_CLASS_KEY[recordClass]}`)} onPress={() => setPicking("class")} /> : null}
        <View style={{ flexDirection: "row", alignItems: "center", minHeight: 48 }}>
          <Text style={{ flex: 1 }}>{t("fields.required")}</Text>
          <Switch testID="flow-field-required" value={required} onValueChange={setRequired} accessibilityLabel={t("fields.required")} trackColor={{ true: colors.accent, false: colors.border }} />
        </View>
        {select ? <OptionsEditor options={options} onChange={setOptions} /> : null}
        {tagField && category ? <LabelsEditor projectId={projectId} category={category} /> : null}
        {tagField && !category ? (
          <Text variant="caption" tone="muted">
            {t("flow.fields.labelsAfterSave")}
          </Text>
        ) : null}
        {tried && problem ? (
          <Text tone="danger" accessibilityLiveRegion="polite" testID="flow-field-problem">
            {problem}
          </Text>
        ) : null}
        {failure ? (
          <Text tone="danger" accessibilityLiveRegion="polite" testID="flow-field-failure">
            {failure}
          </Text>
        ) : null}
      </View>
      {picking === "type" ? (
        <BottomSheet open title={t("flow.fields.type")} onClose={() => setPicking(null)} testID="flow-field-type-sheet">
          {EDITABLE_FIELD_TYPES.map((ft) => (
            <ChoiceRow
              key={ft}
              testID={`flow-field-type-${ft}`}
              label={t(`fields.types.${ft}`)}
              selected={ft === type}
              multi={false}
              onPress={() => {
                setType(ft);
                setPicking(null);
              }}
            />
          ))}
        </BottomSheet>
      ) : null}
      {picking === "class" ? (
        <BottomSheet open title={t("flow.fields.linksTo")} onClose={() => setPicking(null)} testID="flow-field-class-sheet">
          {FLOW_RECORD_CLASSES.map((rc) => (
            <ChoiceRow
              key={rc}
              testID={`flow-field-class-${RECORD_CLASS_KEY[rc]}`}
              label={t(`fields.recordClasses.${RECORD_CLASS_KEY[rc]}`)}
              selected={rc === recordClass}
              multi={false}
              onPress={() => {
                setRecordClass(rc);
                setPicking(null);
              }}
            />
          ))}
        </BottomSheet>
      ) : null}
    </BottomSheet>
  );
}

function Picker({ label, value, onPress, testID }: { label: string; value: string; onPress: () => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View style={{ gap: metrics.space.xs }}>
      <Text variant="label">{label}</Text>
      <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={{ flexDirection: "row", alignItems: "center", minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, backgroundColor: colors.surface }}>
        <Text style={{ flex: 1 }}>{value}</Text>
        <ChevronDown size={18} color={colors.inkMuted} />
      </Pressable>
    </View>
  );
}

const SWATCHES = COLUMN_COLORS.map((hex) => ({ key: hex, hex }));

/** A select's options: label and colour each; the key is made from the label, and a duplicate is refused. */
export function OptionsEditor({ options, onChange }: { options: SelectOption[]; onChange: (o: SelectOption[]) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<string>(COLUMN_COLORS[0]);
  const [colorFor, setColorFor] = useState<number | null>(null);
  const key = optionKey(label);
  const taken = useMemo(() => new Set(options.map((o) => o.value)), [options]);
  const problem = label.trim() && !key ? t("flow.fields.optionNeedsLetters") : key && taken.has(key) ? t("flow.fields.optionTaken") : null;

  const add = () => {
    if (!key || problem) return;
    onChange([...options, { value: key, label: label.trim(), color }]);
    setLabel("");
    setColor(COLUMN_COLORS[(options.length + 1) % COLUMN_COLORS.length]);
  };

  return (
    <View style={{ gap: metrics.space.sm }} testID="flow-options">
      <Text variant="label">{t("flow.fields.options")}</Text>
      {options.map((o, i) => (
        <View key={o.value} testID="flow-option" style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
          <Pressable onPress={() => setColorFor(i)} accessibilityRole="button" accessibilityLabel={t("flow.fields.optionColor", { label: o.label })} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: o.color ?? colors.border }} />
          </Pressable>
          <TextInput value={o.label} onChangeText={(v) => onChange(options.map((x, j) => (j === i ? { ...x, label: v } : x)))} accessibilityLabel={t("flow.fields.optionLabel")} style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16, borderBottomWidth: 1, borderBottomColor: colors.border }} />
          <Pressable testID="flow-option-remove" onPress={() => onChange(options.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={t("flow.fields.optionRemove", { label: o.label })} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <X size={18} color={colors.inkMuted} />
          </Pressable>
        </View>
      ))}
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
        <View style={{ width: 44, alignItems: "center" }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: color }} />
        </View>
        <TextInput testID="flow-option-new" value={label} onChangeText={setLabel} placeholder={t("flow.fields.optionPlaceholder")} placeholderTextColor={colors.inkMuted} returnKeyType="done" submitBehavior="submit" onSubmitEditing={add} accessibilityLabel={t("flow.fields.optionPlaceholder")} style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16, borderBottomWidth: 1, borderBottomColor: problem ? colors.danger : colors.border }} />
        <Pressable testID="flow-option-add" onPress={add} disabled={!key || Boolean(problem)} accessibilityRole="button" accessibilityLabel={t("flow.fields.optionAdd")} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: key && !problem ? 1 : 0.4 }}>
          <Plus size={20} color={colors.accent} />
        </Pressable>
      </View>
      {problem ? (
        <Text tone="danger" variant="caption" accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}
      {colorFor != null && options[colorFor] ? (
        <BottomSheet open title={t("flow.fields.optionColor", { label: options[colorFor].label })} onClose={() => setColorFor(null)} testID="flow-option-color">
          <Swatches
            testID="flow-option-swatch"
            colors={SWATCHES}
            value={options[colorFor].color}
            labelOf={(hex) => t("flow.color.swatch", { n: COLUMN_COLORS.indexOf(hex as (typeof COLUMN_COLORS)[number]) + 1 })}
            onPick={(c) => {
              onChange(options.map((x, j) => (j === colorFor ? { ...x, color: c } : x)));
              setColorFor(null);
            }}
          />
        </BottomSheet>
      ) : null}
      {!label ? null : (
        <Swatches testID="flow-option-new-color" colors={SWATCHES} value={color} labelOf={(hex) => t("flow.color.swatch", { n: COLUMN_COLORS.indexOf(hex as (typeof COLUMN_COLORS)[number]) + 1 })} onPick={(c) => c && setColor(c)} />
      )}
    </View>
  );
}

/** A labels field's labels: saved one by one, at once; a removal is confirmed (cards lose that label). */
function LabelsEditor({ projectId, category }: { projectId: number; category: TagCategory }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const label = useSubmitText();
  const [color, setColor] = useState<string>(COLUMN_COLORS[0]);
  const [failure, setFailure] = useState<string | null>(null);
  const tags = useTagWrites(projectId, { onError: (e) => setFailure(failureMessage(e, t("flow.fields.failed"))) });
  const add = () => {
    const v = label.take();
    if (v) tags.add.mutate({ categoryId: category.id, label: v, color });
  };
  return (
    <View style={{ gap: metrics.space.sm }} testID="flow-labels">
      <Text variant="label">{t("flow.fields.labels")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
        {category.tags.map((tag) => (
          <View key={tag.id} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 10, borderRadius: metrics.radius.pill, backgroundColor: `${tag.color ?? colors.inkMuted}26`, borderWidth: 1, borderColor: `${tag.color ?? colors.inkMuted}66` }}>
            <Text variant="caption" style={{ fontWeight: "600" }}>
              {tag.label}
            </Text>
            <Pressable
              testID="flow-label-remove"
              onPress={() =>
                Alert.alert(t("flow.fields.labelRemoveTitle", { label: tag.label }), t("flow.fields.labelRemoveBody"), [
                  { text: t("fields.cancel"), style: "cancel" },
                  { text: t("fields.remove"), style: "destructive", onPress: () => tags.remove.mutate({ categoryId: category.id, tagId: tag.id }) },
                ])
              }
              accessibilityRole="button"
              accessibilityLabel={t("flow.fields.labelRemove", { label: tag.label })}
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
            >
              <X size={14} color={colors.ink} />
            </Pressable>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
        <TextInput testID="flow-label-new" value={label.value} onChangeText={label.onChangeText} placeholder={t("flow.fields.labelPlaceholder")} placeholderTextColor={colors.inkMuted} returnKeyType="done" submitBehavior="submit" onSubmitEditing={add} accessibilityLabel={t("flow.fields.labelPlaceholder")} style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16, borderBottomWidth: 1, borderBottomColor: colors.border }} />
        <Pressable testID="flow-label-add" onPress={add} disabled={!label.value.trim()} accessibilityRole="button" accessibilityLabel={t("flow.fields.labelAdd")} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: label.value.trim() ? 1 : 0.4 }}>
          <Plus size={20} color={colors.accent} />
        </Pressable>
      </View>
      {label.value.trim() ? <Swatches testID="flow-label-color" colors={SWATCHES} value={color} labelOf={(hex) => t("flow.color.swatch", { n: COLUMN_COLORS.indexOf(hex as (typeof COLUMN_COLORS)[number]) + 1 })} onPick={(c) => c && setColor(c)} /> : null}
      {failure ? (
        <Text tone="danger" variant="caption" accessibilityLiveRegion="polite">
          {failure}
        </Text>
      ) : null}
    </View>
  );
}
