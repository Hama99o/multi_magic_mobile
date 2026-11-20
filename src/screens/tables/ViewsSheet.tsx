/**
 * THE TABLE'S VIEWS (increment 4b; the web's `ViewSwitcher.tsx` and the view
 * mutations in `TableScreen.tsx`): switch to a view; and, for people who edit
 * the table, make a new one of any type with its own column, rename,
 * duplicate or delete one.
 *
 * These are the shared views everyone on the base sees, so every change here
 * is a deliberate act on the sheet, never a side effect of filtering (SPEC
 * C1: the personal layer still never writes a view). A rename sends the name
 * alone. Delete asks first, in words that say it is gone for everyone and
 * the rows stay; the server keeps a table's last view, so the last one
 * offers no delete.
 */
import { useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react-native";
import type { FieldDefinition } from "@/api/fields";
import { tablesKeys } from "@/api/keys";
import { tablesApi, VIEW_TYPES, type View as TableView, type ViewType } from "@/api/tables";
import { failureMessage } from "@/api/failure";
import { BottomSheet } from "@/components/BottomSheet";
import { SheetButton } from "@/components/fields/FieldRow";
import { Check, Copy, Ellipsis, Pencil, Plus, Trash2 } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { newViewReady, viewColumnChoices } from "./boardViews";

type Form = { mode: "new"; name: string; viewType: ViewType; columnId: number | null } | { mode: "rename"; view: TableView; name: string };

export function ViewsSheet({
  tableId,
  views,
  currentId,
  fields,
  editable,
  icons,
  onOpenView,
  onClose,
}: {
  tableId: number;
  views: TableView[];
  currentId: number | null;
  fields: FieldDefinition[];
  editable: boolean;
  icons: Record<ViewType, LucideIcon>;
  onOpenView: (id: number) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [managing, setManaging] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = views.find((v) => v.id === currentId) ?? views[0];

  const run = async (work: () => Promise<TableView | void>, failed: string) => {
    setBusy(true);
    setError(null);
    try {
      const made = await work();
      await client.invalidateQueries({ queryKey: tablesKeys.table(tableId) });
      setForm(null);
      setManaging(null);
      return made;
    } catch (e) {
      setError(failureMessage(e, failed));
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) return;
    if (form.mode === "rename") {
      await run(() => tablesApi.renameView(form.view.id, name), t("tables.viewsSheet.failed"));
      return;
    }
    if (!current || !newViewReady(form.viewType, form.columnId)) return;
    const config = form.viewType === "kanban" ? { kanbanFieldId: form.columnId } : form.viewType === "calendar" ? { calendarFieldId: form.columnId } : form.viewType === "gallery" ? { coverFieldId: form.columnId } : {};
    const made = await run(() => tablesApi.createView(tableId, { name, viewType: form.viewType, fromViewId: current.id, config }), t("tables.viewsSheet.failed"));
    if (made) onOpenView(made.id);
  };

  const duplicate = async (v: TableView) => {
    const made = await run(() => tablesApi.duplicateView(v.id), t("tables.viewsSheet.failed"));
    if (made) onOpenView(made.id);
  };

  const remove = (v: TableView) =>
    Alert.alert(t("tables.viewsSheet.deleteTitle", { name: v.name }), t("tables.viewsSheet.deleteBody"), [
      { text: t("fields.cancel"), style: "cancel" },
      {
        text: t("tables.viewsSheet.delete"),
        style: "destructive",
        onPress: () =>
          void run(() => tablesApi.deleteView(v.id), t("tables.viewsSheet.failed")).then(() => {
            const next = views.find((x) => x.id !== v.id);
            if (v.id === current?.id && next) onOpenView(next.id);
          }),
      },
    ]);

  const pill = (on: boolean) => ({ minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center" as const, borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.surface });
  const choices = form?.mode === "new" ? viewColumnChoices(form.viewType, fields) : [];
  const ready = form ? Boolean(form.name.trim()) && (form.mode === "rename" || newViewReady(form.viewType, form.columnId)) : false;

  return (
    <BottomSheet
      open
      title={form ? (form.mode === "new" ? t("tables.viewsSheet.newTitle") : t("tables.viewsSheet.renameTitle")) : t("tables.views")}
      onClose={form ? () => setForm(null) : onClose}
      testID="tables-views"
      footer={
        form ? (
          <View style={{ paddingHorizontal: metrics.space.lg }}>
            <SheetButton testID="tables-views-save" label={form.mode === "new" ? t("tables.viewsSheet.create") : t("tables.viewsSheet.save")} disabled={!ready || busy} busy={busy} onPress={() => void submit()} />
          </View>
        ) : undefined
      }
    >
      <View style={{ gap: metrics.space.sm, paddingHorizontal: metrics.space.lg }}>
        {form ? (
          <>
            <TextInput
              testID="tables-views-name"
              value={form.name}
              onChangeText={(name) => setForm({ ...form, name })}
              autoFocus
              maxLength={80}
              placeholder={t("tables.viewsSheet.namePlaceholder")}
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel={t("tables.viewsSheet.name")}
              style={{ minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface }}
            />
            {form.mode === "new" ? (
              <>
                <Text variant="label">{t("tables.viewsSheet.type")}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
                  {VIEW_TYPES.map((type) => {
                    const on = form.viewType === type;
                    const Icon = icons[type];
                    const first = viewColumnChoices(type, fields)[0]?.id ?? null;
                    return (
                      <Pressable key={type} testID={`tables-views-type-${type}`} onPress={() => setForm({ ...form, viewType: type, columnId: type === "gallery" ? null : first })} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t(`tables.viewTypes.${type}`)} style={[pill(on), { flexDirection: "row", alignItems: "center", gap: 6 }]}>
                        <Icon size={16} color={on ? colors.onAccent : colors.ink} />
                        <Text variant="label" tone={on ? "onAccent" : "default"}>
                          {t(`tables.viewTypes.${type}`)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {form.viewType !== "grid" ? (
                  <>
                    <Text variant="label">{t(`tables.viewsSheet.column.${form.viewType}`)}</Text>
                    {choices.length ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
                        {choices.map((f) => {
                          const on = form.columnId === f.id;
                          return (
                            <Pressable key={f.id} testID={`tables-views-column-${f.id}`} onPress={() => setForm({ ...form, columnId: on && form.viewType === "gallery" ? null : f.id })} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={f.name} style={pill(on)}>
                              <Text variant="label" tone={on ? "onAccent" : "default"}>
                                {f.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : (
                      <Text tone="muted" testID="tables-views-no-column">
                        {t(`tables.viewsSheet.noColumn.${form.viewType}`)}
                      </Text>
                    )}
                  </>
                ) : null}
                <Text tone="muted" variant="caption">
                  {t("tables.viewsSheet.sharedNote")}
                </Text>
              </>
            ) : null}
          </>
        ) : (
          <>
            {views.map((v) => {
              const on = v.id === current?.id;
              const Icon = icons[v.viewType];
              return (
                <View key={v.id} style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Pressable testID={`tables-views-open-${v.id}`} onPress={() => onOpenView(v.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${v.name}, ${t(`tables.viewTypes.${v.viewType}`)}`} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch }}>
                      <Icon size={18} color={on ? colors.accent : colors.inkMuted} />
                      <View style={{ flex: 1 }}>
                        <Text variant="label" numberOfLines={1}>
                          {v.name}
                        </Text>
                        <Text tone="muted" variant="caption">
                          {t(`tables.viewTypes.${v.viewType}`)}
                        </Text>
                      </View>
                      {on ? <Check size={18} color={colors.accent} /> : null}
                    </Pressable>
                    {editable ? (
                      <Pressable testID={`tables-views-manage-${v.id}`} onPress={() => setManaging(managing === v.id ? null : v.id)} accessibilityRole="button" accessibilityState={{ expanded: managing === v.id }} accessibilityLabel={t("tables.viewsSheet.manage", { name: v.name })} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
                        <Ellipsis size={20} color={colors.inkMuted} />
                      </Pressable>
                    ) : null}
                  </View>
                  {editable && managing === v.id ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs, paddingBottom: metrics.space.sm }}>
                      <ManageButton testID={`tables-views-rename-${v.id}`} icon={Pencil} label={t("tables.viewsSheet.rename")} disabled={busy} onPress={() => setForm({ mode: "rename", view: v, name: v.name })} />
                      <ManageButton testID={`tables-views-duplicate-${v.id}`} icon={Copy} label={t("tables.viewsSheet.duplicate")} disabled={busy} onPress={() => void duplicate(v)} />
                      {views.length > 1 ? <ManageButton testID={`tables-views-delete-${v.id}`} icon={Trash2} label={t("tables.viewsSheet.delete")} danger disabled={busy} onPress={() => remove(v)} /> : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
            {editable ? (
              <Pressable testID="tables-views-new" disabled={busy} onPress={() => setForm({ mode: "new", name: "", viewType: "grid", columnId: null })} accessibilityRole="button" accessibilityLabel={t("tables.viewsSheet.new")} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch }}>
                <Plus size={18} color={colors.accent} />
                <Text tone="accent" variant="label">
                  {t("tables.viewsSheet.new")}
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
        {error ? (
          <Text tone="danger" testID="tables-views-error" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

function ManageButton({ testID, icon: Icon, label, danger, disabled, onPress }: { testID: string; icon: LucideIcon; label: string; danger?: boolean; disabled?: boolean; onPress: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable testID={testID} disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: danger ? colors.danger : colors.border }}>
      <Icon size={16} color={danger ? colors.danger : colors.ink} />
      <Text variant="label" tone={danger ? "danger" : "default"}>
        {label}
      </Text>
    </Pressable>
  );
}
