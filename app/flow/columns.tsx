/**
 * MANAGE COLUMNS — the web's `ProjectColumns.tsx`, for an owner or admin.
 *
 * Each column: its colour (ten swatches, or none), its name (tap to rename),
 * "Final" (cards here count as finished), and Delete. Delete is confirmed
 * and says where the cards go: the server moves them to the first other
 * column, and refuses for the last column that still holds cards — its
 * sentence is shown as it comes (`column.rb#relocate_cards_before_destroy`).
 * The order is changed in Reorder mode (drag, or ▲ ▼), sent once.
 */
import { useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { flowKeys } from "@/api/keys";
import { flowApi, type Column } from "@/api/flow";
import { failureMessage } from "@/api/failure";
import { BottomSheet } from "@/components/BottomSheet";
import { DragReorder } from "@/components/DragReorder";
import { SheetButton } from "@/components/fields/FieldRow";
import { Columns3, GripVertical, Plus, Trash2 } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useMe } from "@/hooks/useMe";
import { COLUMN_COLORS, colorHex, powersOf, roleIn } from "@/screens/flow/logic";
import { EmptyState, Swatches } from "@/screens/flow/parts";
import { useCreateColumn, useDeleteColumn, useReorderColumns, useUpdateColumn } from "@/screens/flow/useFlowMutations";

export default function ColumnsScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const projectId = Number(params.id);
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const me = useMe();
  const [reordering, setReordering] = useState(false);
  const [colorFor, setColorFor] = useState<Column | null>(null);
  const [renaming, setRenaming] = useState<Column | null>(null);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fail = (e: unknown) => setNote(failureMessage(e, t("flow.columns.failed")));

  const project = useQuery({ queryKey: flowKeys.project(projectId), queryFn: () => flowApi.project(projectId), enabled: projectId > 0 });
  const columns = useQuery({ queryKey: flowKeys.columns(projectId), queryFn: () => flowApi.columns(projectId), enabled: projectId > 0 });
  const update = useUpdateColumn(projectId, { onError: fail });
  const remove = useDeleteColumn(projectId, { onError: fail });
  const reorder = useReorderColumns(projectId, { onError: fail });
  const manage = project.data ? powersOf(roleIn(project.data, me?.id)).manage : false;
  const rows = [...(columns.data ?? [])].sort((a, b) => a.position - b.position);

  const confirmDelete = (col: Column) => {
    const others = rows.filter((c) => c.id !== col.id);
    Alert.alert(t("flow.columns.deleteTitle", { title: col.title }), others.length ? t("flow.columns.deleteBody", { target: others[0].title }) : t("flow.columns.deleteLast"), [
      { text: t("fields.cancel"), style: "cancel" },
      { text: t("flow.delete"), style: "destructive", onPress: () => remove.mutate(col.id) },
    ]);
  };

  return (
    <Screen measure>
      <AppHeader app="flow" back title={t("flow.columns.title")} />
      {project.data ? (
        <Text tone="muted" variant="caption" numberOfLines={1} style={{ marginBottom: metrics.space.xs }}>
          {project.data.title}
        </Text>
      ) : null}
      <Text tone="muted" variant="caption" style={{ marginBottom: metrics.space.md }}>
        {t("flow.columns.hint")}
      </Text>
      <LoadFailure error={columns.error} loadFailed={t("flow.columns.loadFailed")} hasData={Boolean(columns.data)} updatedAt={columns.dataUpdatedAt} onRetry={() => void columns.refetch()} testID="flow-columns-failed" />
      {note ? (
        <Pressable testID="flow-columns-note" onPress={() => setNote(null)} accessibilityRole="button" accessibilityLiveRegion="polite" style={{ marginBottom: metrics.space.sm }}>
          <Text tone="danger">{note}</Text>
        </Pressable>
      ) : null}
      {project.data && !manage ? (
        <Text tone="muted" testID="flow-columns-readonly" style={{ marginBottom: metrics.space.sm }}>
          {t("flow.columns.readOnly")}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {columns.isPending ? <RowsSkeleton rows={6} testID="flow-columns-loading" /> : null}
        {columns.data && rows.length === 0 ? <EmptyState testID="flow-columns-empty" icon={Columns3} title={t("flow.columns.none")} /> : null}
        {reordering ? (
          <DragReorder
            testID="flow-columns-reorder"
            items={rows.map((c) => ({ id: c.id, label: c.title, lead: <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colorHex(c.color) ?? colors.border }} /> }))}
            onReorder={(ids) => reorder.mutate(ids)}
          />
        ) : (
          rows.map((col) => (
            <View key={col.id} testID="flow-column-row" style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 64, paddingHorizontal: metrics.space.sm, marginBottom: 6, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
              <Pressable testID="flow-column-color" disabled={!manage} onPress={() => setColorFor(col)} accessibilityRole="button" accessibilityLabel={t("flow.columns.colorOf", { title: col.title })} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colorHex(col.color) ?? "transparent", borderWidth: col.color ? 0 : 2, borderColor: colors.border }} />
              </Pressable>
              <Pressable testID="flow-column-name" disabled={!manage} onPress={() => setRenaming(col)} accessibilityRole="button" accessibilityLabel={t("flow.columns.rename", { title: col.title })} style={{ flex: 1, minHeight: 44, justifyContent: "center" }}>
                <Text numberOfLines={2} style={{ fontWeight: "600" }}>
                  {col.title}
                </Text>
              </Pressable>
              <View style={{ alignItems: "center" }}>
                <Switch testID="flow-column-final" value={col.isFinal} disabled={!manage} onValueChange={(isFinal) => update.mutate({ columnId: col.id, input: { isFinal } })} accessibilityLabel={t("flow.columns.finalOf", { title: col.title })} trackColor={{ true: colors.accent, false: colors.border }} />
                <Text variant="caption" tone="muted" style={{ fontSize: 11 }}>
                  {t("flow.columns.final")}
                </Text>
              </View>
              {manage ? (
                <Pressable testID="flow-column-delete" onPress={() => confirmDelete(col)} accessibilityRole="button" accessibilityLabel={t("flow.columns.delete", { title: col.title })} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                  <Trash2 size={18} color={colors.inkMuted} />
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      {manage && rows.length ? (
        <View style={{ position: "absolute", left: metrics.space.lg, right: metrics.space.lg, bottom: metrics.space.lg, flexDirection: "row", gap: metrics.space.sm }}>
          <Pressable testID="flow-columns-reorder-toggle" onPress={() => setReordering((r) => !r)} accessibilityRole="button" accessibilityLabel={reordering ? t("flow.reorder.done") : t("flow.columns.reorder")} style={{ flex: 1, flexDirection: "row", gap: 6, minHeight: metrics.touch, borderRadius: metrics.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <GripVertical size={18} color={colors.ink} />
            <Text variant="label">{reordering ? t("flow.reorder.done") : t("flow.columns.reorder")}</Text>
          </Pressable>
          {!reordering ? (
            <Pressable testID="flow-columns-add" onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel={t("flow.columns.add")} style={{ flex: 1, flexDirection: "row", gap: 6, minHeight: metrics.touch, borderRadius: metrics.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent }}>
              <Plus size={18} color={colors.onAccent} />
              <Text variant="label" tone="onAccent">
                {t("flow.columns.add")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {colorFor ? (
        <BottomSheet open title={t("flow.columns.color")} subtitle={colorFor.title} onClose={() => setColorFor(null)} testID="flow-columns-color">
          <Swatches
            testID="flow-columns-swatch"
            none
            colors={COLUMN_COLORS.map((hex) => ({ key: hex, hex }))}
            value={colorFor.color}
            labelOf={(hex) => t("flow.color.swatch", { n: COLUMN_COLORS.indexOf(hex as (typeof COLUMN_COLORS)[number]) + 1 })}
            onPick={(color) => {
              update.mutate({ columnId: colorFor.id, input: { color } });
              setColorFor(null);
            }}
          />
        </BottomSheet>
      ) : null}
      {renaming ? (
        <ColumnForm
          title={t("flow.columns.renameTitle")}
          initial={renaming.title}
          withColor={false}
          onClose={() => setRenaming(null)}
          onSave={(name) => {
            if (name !== renaming.title) update.mutate({ columnId: renaming.id, input: { title: name } });
            setRenaming(null);
          }}
        />
      ) : null}
      {adding ? <AddColumn projectId={projectId} position={rows.length} onClose={() => setAdding(false)} onError={fail} /> : null}
    </Screen>
  );
}

function ColumnForm({ title, initial, withColor, onSave, onClose, busy = false, color, onColor }: { title: string; initial: string; withColor: boolean; onSave: (name: string) => void; onClose: () => void; busy?: boolean; color?: string | null; onColor?: (c: string | null) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const firstInput = useRef<TextInput>(null);
  const [name, setName] = useState(initial);
  // One save per Enter: Android can deliver it twice in one tick (`useSubmitText`).
  const sent = useRef(false);
  const save = () => {
    const v = name.trim();
    if (!v || sent.current) return;
    sent.current = true;
    // Long enough to swallow the duplicate, short enough that a refused save can be retried.
    setTimeout(() => (sent.current = false), 500);
    onSave(v);
  };
  const edit = (v: string) => {
    sent.current = false;
    setName(v);
  };
  return (
    <BottomSheet focusRef={firstInput} open title={title} onClose={onClose} testID="flow-column-form" footer={<SheetButton testID="flow-column-form-save" label={t("fields.save")} busy={busy} disabled={!name.trim()} onPress={save} />}>
      <View style={{ gap: metrics.space.md }}>
        <TextInput
          testID="flow-column-form-name"
          value={name}
          onChangeText={edit}
          ref={firstInput}
          returnKeyType="done"
          onSubmitEditing={save}
          placeholder={t("flow.columns.namePlaceholder")}
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={t("flow.columns.name")}
          style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface }}
        />
        {withColor && onColor ? <Swatches testID="flow-column-form-color" none colors={COLUMN_COLORS.map((hex) => ({ key: hex, hex }))} value={color ?? null} onPick={onColor} labelOf={(hex) => t("flow.color.swatch", { n: COLUMN_COLORS.indexOf(hex as (typeof COLUMN_COLORS)[number]) + 1 })} /> : null}
      </View>
    </BottomSheet>
  );
}

function AddColumn({ projectId, position, onClose, onError }: { projectId: number; position: number; onClose: () => void; onError: (e: unknown) => void }) {
  const { t } = useTranslation();
  const [color, setColor] = useState<string | null>(COLUMN_COLORS[0]);
  const create = useCreateColumn(projectId, { onError });
  return (
    <ColumnForm
      title={t("flow.columns.add")}
      initial=""
      withColor
      color={color}
      onColor={setColor}
      busy={create.isPending}
      onClose={onClose}
      onSave={(title) => {
        create.mutate({ title, color, position });
        onClose();
      }}
    />
  );
}
