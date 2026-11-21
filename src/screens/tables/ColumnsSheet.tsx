/**
 * THE TABLE'S COLUMNS, for the people who edit it (increment 6b; the web's
 * `ColumnHeader.tsx` menu and the column trash in `FieldsPanel.tsx`).
 *
 * This is the SHARED schema, so it is a sheet of its own, apart from the
 * personal Fields sheet (SPEC C1): there, hiding and ordering are the
 * person's; here, every change is everyone's and the sheet says so.
 *
 * Per column: duplicate (with or without its values), use as title (saying
 * where the row titles show), delete (saying how many rows hold a value, and
 * a link's other side, before anything goes; it goes to the trash). The
 * trash lists deleted columns with Restore. Editing a column and adding one
 * are increment 6c's editor, reached from here (`onEdit`, `onAdd`).
 */
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FieldDefinition } from "@/api/fields";
import { tablesKeys } from "@/api/keys";
import { tablesApi } from "@/api/tables";
import { failureMessage } from "@/api/failure";
import { BottomSheet } from "@/components/BottomSheet";
import { Copy, Ellipsis, Pencil, Plus, RotateCcw, Star, Trash2 } from "@/components/icons";
import type { LucideIcon } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { relativeTime } from "@/lib/relativeTime";

export function ColumnsSheet({ tableId, fields, primaryFieldId, onEdit, onAdd, onClose }: { tableId: number; fields: FieldDefinition[]; primaryFieldId: number | null; onEdit?: (field: FieldDefinition) => void; onAdd?: () => void; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "muted"; text: string } | null>(null);
  const trash = useQuery({ queryKey: tablesKeys.trashedFields(tableId), queryFn: () => tablesApi.trashedFields(tableId) });

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      await Promise.all([client.invalidateQueries({ queryKey: tablesKeys.table(tableId) }), client.invalidateQueries({ queryKey: tablesKeys.trashedFields(tableId) }), client.invalidateQueries({ queryKey: tablesKeys.rows(tableId) })]);
      setOpen(null);
      setMessage({ tone: "muted", text: done });
    } catch (e) {
      setMessage({ tone: "danger", text: failureMessage(e, t("tables.columns.failed")) });
    } finally {
      setBusy(false);
    }
  };

  const duplicate = (f: FieldDefinition) =>
    Alert.alert(t("tables.columns.duplicateTitle", { column: f.name }), undefined, [
      { text: t("fields.cancel"), style: "cancel" },
      { text: t("tables.columns.columnOnly"), onPress: () => void run(() => tablesApi.duplicateField(f.id, false), t("tables.columns.duplicated", { column: f.name })) },
      { text: t("tables.columns.withValues"), onPress: () => void run(() => tablesApi.duplicateField(f.id, true), t("tables.columns.duplicated", { column: f.name })) },
    ]);

  const makeTitle = async (f: FieldDefinition) => {
    setBusy(true);
    try {
      const usage = await tablesApi.fieldUsage(f.id);
      const where = usage.titleShownIn.map((x) => t("tables.columns.inTable", { column: x.column, table: x.table })).join("\n");
      Alert.alert(t("tables.columns.titleTitle", { column: f.name }), [t("tables.columns.titleBody"), where].filter(Boolean).join("\n\n"), [
        { text: t("fields.cancel"), style: "cancel" },
        { text: t("tables.columns.useAsTitle"), onPress: () => void run(() => tablesApi.setPrimaryField(f.id), t("tables.columns.titled", { column: f.name })) },
      ]);
    } catch (e) {
      setMessage({ tone: "danger", text: failureMessage(e, t("tables.columns.failed")) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f: FieldDefinition) => {
    setBusy(true);
    try {
      const usage = await tablesApi.fieldUsage(f.id);
      const lines = [t("tables.columns.deleteFilled", { count: usage.filledCount, rows: usage.rowCount })];
      if (usage.inverse) lines.push(t("tables.columns.deleteInverse", { column: usage.inverse.name, table: usage.inverse.tableName }));
      lines.push(t("tables.columns.deleteTrash"));
      Alert.alert(t("tables.columns.deleteTitle", { column: f.name }), lines.join("\n\n"), [
        { text: t("fields.cancel"), style: "cancel" },
        { text: t("tables.columns.delete"), style: "destructive", onPress: () => void run(() => tablesApi.deleteField(f.id), t("tables.columns.deleted", { column: f.name })) },
      ]);
    } catch (e) {
      setMessage({ tone: "danger", text: failureMessage(e, t("tables.columns.failed")) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open title={t("tables.columns.title")} subtitle={t("tables.columns.shared")} onClose={onClose} testID="tables-columns" tall>
      <View style={{ paddingHorizontal: metrics.space.lg, gap: metrics.space.xs }}>
        {fields.map((f) => {
          const primary = f.id === primaryFieldId;
          return (
            <View key={f.id} style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", minHeight: metrics.touch, gap: metrics.space.sm }}>
                <View style={{ flex: 1 }}>
                  <Text variant="label" numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Text tone="muted" variant="caption">
                    {primary ? t("tables.columns.isTitle") : t(`fields.types.${f.fieldType}`, { defaultValue: f.fieldType })}
                  </Text>
                </View>
                <Pressable testID={`tables-columns-${f.id}-menu`} onPress={() => setOpen(open === f.id ? null : f.id)} accessibilityRole="button" accessibilityState={{ expanded: open === f.id }} accessibilityLabel={t("tables.columns.manage", { column: f.name })} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
                  <Ellipsis size={20} color={colors.inkMuted} />
                </Pressable>
              </View>
              {open === f.id ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs, paddingBottom: metrics.space.sm }}>
                  {onEdit ? <Chip testID={`tables-columns-${f.id}-edit`} icon={Pencil} label={t("tables.columns.edit")} disabled={busy} onPress={() => onEdit(f)} /> : null}
                  <Chip testID={`tables-columns-${f.id}-duplicate`} icon={Copy} label={t("tables.columns.duplicate")} disabled={busy} onPress={() => duplicate(f)} />
                  {primary ? null : <Chip testID={`tables-columns-${f.id}-title`} icon={Star} label={t("tables.columns.useAsTitle")} disabled={busy} onPress={() => void makeTitle(f)} />}
                  {/* The title column cannot go: a row always has a title (the web offers no delete on it either). */}
                  {primary ? null : <Chip testID={`tables-columns-${f.id}-delete`} icon={Trash2} label={t("tables.columns.delete")} danger disabled={busy} onPress={() => void remove(f)} />}
                </View>
              ) : null}
            </View>
          );
        })}
        {onAdd ? (
          <Pressable testID="tables-columns-add" onPress={onAdd} accessibilityRole="button" accessibilityLabel={t("tables.columns.add")} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch }}>
            <Plus size={18} color={colors.accent} />
            <Text tone="accent" variant="label">
              {t("tables.columns.add")}
            </Text>
          </Pressable>
        ) : null}

        <Text variant="label" style={{ marginTop: metrics.space.md }}>
          {t("tables.columns.trash")}
        </Text>
        {trash.data?.length === 0 ? (
          <Text tone="muted" variant="caption" testID="tables-columns-trash-empty">
            {t("tables.columns.trashEmpty")}
          </Text>
        ) : null}
        {trash.error ? <Text tone="danger">{failureMessage(trash.error, t("tables.columns.failed"))}</Text> : null}
        {(trash.data ?? []).map((f) => (
          <View key={f.id} testID={`tables-columns-trashed-${f.id}`} style={{ flexDirection: "row", alignItems: "center", minHeight: metrics.touch, gap: metrics.space.sm }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1}>{f.name}</Text>
              <Text tone="muted" variant="caption">
                {t("tables.columns.trashedLine", { when: relativeTime(f.deletedAt), count: f.filledCount })}
              </Text>
            </View>
            <Chip testID={`tables-columns-restore-${f.id}`} icon={RotateCcw} label={t("tables.columns.restore")} disabled={busy} onPress={() => void run(() => tablesApi.restoreField(f.id), t("tables.columns.restored", { column: f.name }))} />
          </View>
        ))}
        {message ? (
          <Text tone={message.tone} testID="tables-columns-message" accessibilityLiveRegion="polite">
            {message.text}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

function Chip({ testID, icon: Icon, label, danger, disabled, onPress }: { testID: string; icon: LucideIcon; label: string; danger?: boolean; disabled?: boolean; onPress: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable testID={testID} disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: danger ? colors.danger : colors.border, opacity: disabled ? 0.5 : 1 }}>
      <Icon size={16} color={danger ? colors.danger : colors.ink} />
      <Text variant="label" tone={danger ? "danger" : "default"}>
        {label}
      </Text>
    </Pressable>
  );
}
