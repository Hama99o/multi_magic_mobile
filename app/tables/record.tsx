/**
 * TABLES: one row as a page (SPEC C4; Notion's item page, Beli's detail).
 *
 * The title, then every column the table has, label beside value, through the
 * shared `FieldRow` (Flow's, SPEC C9). Increment 1 reads; increment 2 turns on
 * `editable`. Under the fields, what a value can DO: call or WhatsApp a phone,
 * write an email, open a link, open a file, open a linked row.
 *
 * Previous / next walk the rows the table screen has loaded, in its order
 * (`q` is that screen's query key): "3 / 25", as the web's sheet does, by
 * the chevrons or a sideways swipe.
 *
 * Increment 2: an owner or editor edits every field in place (the shared
 * editors, sent through `records#update` / `#link`, `useRowWrites.ts`); a
 * one-link column already full offers "Replace"; ⋯ copies the row's link,
 * duplicates it, or deletes it to the trash with Undo. A viewer reads.
 */
import { useMemo, useRef, useState } from "react";
import { Alert, Image, Linking, PanResponder, Pressable, ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { tablesApi, type RecordRow, type RecordsPage, type RelationGroup } from "@/api/tables";
import { absoluteUrl } from "@/api/conversations";
import { failureMessage } from "@/api/failure";
import type { FieldDefinition, RecordOption } from "@/api/fields";
import { ChevronLeft, ChevronRight, Copy, CopyPlus, Ellipsis, ExternalLink, FileText, Mail, MessageCircle, Phone, Sparkles, Trash2 } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { FieldRow } from "@/components/fields/FieldRow";
import { displayValue, linkedRecords, scalar } from "@/components/fields/display";
import { useFieldWrites } from "@/components/fields/useFieldWrites";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useAsk } from "@/screens/flow/useAsk";
import { useMe } from "@/hooks/useMe";
import { orderedFields } from "@/screens/tables/personalView";
import { usePersonalLayer } from "@/screens/tables/usePersonalLayer";
import { ActionSheet, type SheetAction } from "@/screens/contacts/ActionSheet";
import { canEditRows } from "@/screens/tables/logic";
import { RowLinkConflict, restoreRows, rowFieldTarget, useDeleteRow, useDuplicateRow } from "@/screens/tables/useRowWrites";
import { useTablesUndo } from "@/stores/tablesUndo.store";
import { mergePages, positionOf, titleField } from "@/screens/tables/logic";
import { phoneActions } from "@/screens/tables/recordActions";

export default function RecordScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const ask = useAsk();
  const client = useQueryClient();
  const params = useLocalSearchParams<{ table: string; id: string; q?: string; view?: string }>();
  const tableId = Number(params.table);
  const recordId = Number(params.id);

  const table = useQuery({ queryKey: tablesKeys.table(tableId), queryFn: () => tablesApi.table(tableId), enabled: Number.isFinite(tableId) });
  const record = useQuery({ queryKey: [...tablesKeys.rows(tableId), "record", recordId], queryFn: () => tablesApi.record(recordId), enabled: Number.isFinite(recordId) });

  // The rows the table screen loaded, for previous / next.
  const loaded: RecordRow[] = useMemo(() => {
    if (!params.q) return [];
    const data = client.getQueryData<InfiniteData<RecordsPage>>(tablesKeys.records(tableId, params.q));
    return mergePages(data?.pages ?? []);
  }, [client, tableId, params.q]);
  const at = positionOf(loaded, recordId);
  const go = (offset: number) => {
    if (!at) return;
    const next = loaded[at.index + offset];
    if (next) router.setParams({ id: String(next.id) });
  };

  // A row from the list is on screen at once; the fresh copy replaces it when it lands.
  const row = record.data ?? loaded.find((r) => r.id === recordId);
  const known = useMemo(() => {
    const labels: RecordOption[] = Object.entries(row?.linkLabels ?? {}).map(([rid, label]) => ({ id: Number(rid), label, color: null }));
    return () => labels;
  }, [row]);
  const bases = useQuery({ queryKey: tablesKeys.bases("created_at_desc"), queryFn: () => tablesApi.bases(), enabled: Boolean(table.data) });
  const base = bases.data?.find((b) => b.id === table.data?.baseId);
  const editable = canEditRows(base?.role);
  const [failure, setFailure] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const offerUndo = useTablesUndo((s) => s.offerUndo);

  const target = useMemo(() => rowFieldTarget(tableId, recordId), [tableId, recordId]);
  const writes = useFieldWrites(target, (error) => {
    if (error instanceof RowLinkConflict) {
      // The web's answer to a full one-link column: replace what is there.
      Alert.alert(t("tables.replaceTitle"), t("tables.replaceBody", { row: error.cardinality.label ?? `#${error.cardinality.id}` }), [
        { text: t("fields.cancel"), style: "cancel" },
        {
          text: t("tables.replace"),
          onPress: () =>
            void tablesApi
              .link(recordId, error.field.id, error.linkedId, { replace: true })
              .then(() => client.invalidateQueries({ queryKey: tablesKeys.rows(tableId) }))
              .catch((e: unknown) => setFailure(failureMessage(e, t("fields.failed")))),
        },
      ]);
      return;
    }
    setFailure(failureMessage(error, t("fields.failed")));
  });
  const duplicate = useDuplicateRow(tableId, {
    onCreated: (copy) => router.setParams({ id: String(copy.id) }),
    onError: (e) => setFailure(failureMessage(e, t("tables.duplicateFailed"))),
  });
  const remove = useDeleteRow(tableId, {
    onDeleted: (id) => {
      offerUndo(t("tables.rowDeleted"), () => void restoreRows(client, tableId, [id]));
      router.back();
    },
    onError: (e) => setFailure(failureMessage(e, t("tables.deleteFailed"))),
  });

  const swipe = useRef(
    PanResponder.create({
      // Only a clearly sideways drag: a vertical scroll stays the ScrollView's.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -60) goRef.current(1);
        else if (g.dx > 60) goRef.current(-1);
      },
    }),
  ).current;
  const goRef = useRef(go);
  goRef.current = go;

  const rowLink = table.data ? absoluteUrl(`/tables/${table.data.baseId}/${tableId}?record=${recordId}`) : null;
  const confirmDelete = () =>
    Alert.alert(t("tables.deleteTitle"), t("tables.deleteBody"), [
      { text: t("fields.cancel"), style: "cancel" },
      { text: t("tables.delete"), style: "destructive", onPress: () => remove.mutate(recordId) },
    ]);
  const actions: SheetAction[] = [
    ...(rowLink ? [{ key: "copy", label: t("tables.copyLink"), icon: Copy, onPress: () => void Clipboard.setStringAsync(rowLink).then(() => offerUndo(t("tables.linkCopied"))) }] : []),
    ...(editable
      ? [
          { key: "duplicate", label: t("tables.duplicate"), icon: CopyPlus, disabled: duplicate.isPending, onPress: () => duplicate.mutate(recordId) },
          { key: "delete", label: t("tables.deleteRow"), icon: Trash2, danger: true, disabled: remove.isPending, onPress: confirmDelete },
        ]
      : []),
  ];

  // The fields in the order the person sees them on the table (their own, else the view's).
  const me = useMe();
  const view = table.data ? (table.data.views.find((v) => String(v.id) === params.view) ?? table.data.view) : undefined;
  const { layer } = usePersonalLayer(me?.id, view);
  const fields = table.data && view ? orderedFields(table.data.fields, view, layer) : (table.data?.fields ?? []);
  // Every linked row, not only the first 12 a page carries (the web's Relations section).
  const hasLinks = fields.some((f) => f.fieldType === "single_record" || f.fieldType === "multi_record");
  const relations = useQuery({ queryKey: [...tablesKeys.rows(tableId), "relations", recordId], queryFn: () => tablesApi.relations(recordId), enabled: hasLinks && Number.isFinite(recordId) });
  const title = table.data ? titleField(table.data) : null;
  const titleText = (row && title && displayValue(title, row.values[title.id], known, i18n.language)) || t("tables.untitled");

  return (
    <Screen measure>
      <AppHeader app="tables" back title={table.data?.name ?? t("tables.title")} />
      <LoadFailure error={table.error ?? (row ? null : record.error)} loadFailed={t("tables.rowLoadFailed")} hasData={Boolean(row)} updatedAt={record.dataUpdatedAt} onRetry={() => void Promise.all([table.refetch(), record.refetch()])} testID="tables-record-failed" />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: metrics.space.xs }}>
        {at ? (
          <>
            <Text tone="muted" variant="caption" testID="tables-record-position">
              {t("tables.position", { n: at.index + 1, total: at.total })}
            </Text>
            <NavButton testID="tables-record-prev" label={t("tables.previous")} disabled={at.index === 0} onPress={() => go(-1)} icon="prev" />
            <NavButton testID="tables-record-next" label={t("tables.next")} disabled={at.index >= at.total - 1} onPress={() => go(1)} icon="next" />
          </>
        ) : null}
        {row && actions.length ? (
          <Pressable testID="tables-record-menu" onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel={t("tables.rowMenu")} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
            <Ellipsis size={22} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>
      {failure ? (
        <Pressable testID="tables-record-failure" onPress={() => setFailure(null)} accessibilityRole="button" accessibilityLabel={failure} accessibilityLiveRegion="polite">
          <Text tone="danger">{failure}</Text>
        </Pressable>
      ) : null}

      {!row || !table.data ? (
        !table.error && !record.error ? <RowsSkeleton rows={6} testID="tables-record-loading" /> : null
      ) : (
        <ScrollView testID="tables-record" {...(at ? swipe.panHandlers : {})} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: metrics.space.xl, gap: metrics.space.xs }}>
          <Text variant="title" testID="tables-record-title" style={{ marginVertical: metrics.space.sm }}>
            {titleText}
          </Text>
          {fields.map((f) => (
            <View key={f.id}>
              <FieldRow field={f} value={row.values[f.id]} editable={editable} writes={writes} known={known} testID={`tables-field-${f.id}`} onError={setFailure} />
              <ValueActions field={f} row={row} known={known} group={relations.data?.find((g) => g.fieldId === f.id)} />
            </View>
          ))}
          <Pressable
            testID="tables-record-ask"
            onPress={() => ask(t("tables.askRowQuestion", { row: titleText, table: table.data?.name ?? "" }))}
            accessibilityRole="button"
            accessibilityLabel={t("tables.askRow")}
            style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch, marginTop: metrics.space.md }}
          >
            <Sparkles size={18} color={colors.accent} />
            <Text tone="accent" variant="label">
              {t("tables.askRow")}
            </Text>
          </Pressable>
        </ScrollView>
      )}
      <ActionSheet open={menu} title={titleText} actions={actions} onClose={() => setMenu(false)} testID="tables-record-options" />
    </Screen>
  );
}

function NavButton({ testID, label, disabled, onPress, icon }: { testID: string; label: string; disabled: boolean; onPress: () => void; icon: "prev" | "next" }) {
  const colors = useColors();
  const metrics = useMetrics();
  const Icon = icon === "prev" ? ChevronLeft : ChevronRight;
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}>
      <Icon size={22} color={colors.ink} />
    </Pressable>
  );
}

/** What a value can do, under its row: the read-only page's actions (R2). */
function ValueActions({ field, row, known, group }: { field: FieldDefinition; row: RecordRow; known: () => RecordOption[]; group?: RelationGroup }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const value = row.values[field.id];
  const text = typeof scalar(value) === "string" ? (scalar(value) as string).trim() : "";

  const buttons: { key: string; label: string; icon: typeof Phone; onPress: () => void }[] = [];
  if (field.fieldType === "phone" && text) {
    for (const a of phoneActions(text)) buttons.push({ key: a.kind, label: t(a.kind === "call" ? "fields.call" : "tables.whatsapp"), icon: a.kind === "call" ? Phone : MessageCircle, onPress: () => void Linking.openURL(a.url) });
  }
  if (field.fieldType === "email" && text) buttons.push({ key: "mail", label: t("fields.writeEmail"), icon: Mail, onPress: () => void Linking.openURL(`mailto:${text}`) });
  if (field.fieldType === "url" && text) buttons.push({ key: "open", label: t("fields.openLink"), icon: ExternalLink, onPress: () => void Linking.openURL(/^https?:\/\//i.test(text) ? text : `https://${text}`) });

  const linkedTable = group?.table?.id ?? Number(field.config.raw.table_id);
  const isTableLink = (field.fieldType === "single_record" || field.fieldType === "multi_record") && field.recordClass === "TableApp::Record";
  // The whole list once the relations call answers; the page's first 12 until then.
  const links = !isTableLink ? [] : group ? group.rows.map((r) => ({ id: r.id, label: r.title ?? t("tables.untitled"), color: null })) : linkedRecords(field, value, known);
  const files = value?.kind === "files" ? value.files : [];

  if (!buttons.length && !links.length && !files.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs, paddingLeft: 30, paddingBottom: metrics.space.xs }}>
      {buttons.map((b) => (
        <Pressable key={b.key} testID={`tables-field-${field.id}-${b.key}`} onPress={b.onPress} accessibilityRole="button" accessibilityLabel={b.label} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: colors.border }}>
          <b.icon size={16} color={colors.accent} />
          <Text variant="label" tone="accent">
            {b.label}
          </Text>
        </Pressable>
      ))}
      {links.map((l, i) => (
        <Pressable
          key={l.id}
          testID={`tables-field-${field.id}-link-${i}`}
          disabled={!Number.isFinite(linkedTable) || linkedTable <= 0}
          onPress={() => router.push({ pathname: "/tables/record", params: { table: String(linkedTable), id: String(l.id) } })}
          accessibilityRole="link"
          accessibilityLabel={t("tables.openLinked", { row: l.label })}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: colors.border, maxWidth: "100%" }}
        >
          <Text variant="label" tone="accent" numberOfLines={1} style={{ flexShrink: 1 }}>
            {l.label}
          </Text>
          <ChevronRight size={14} color={colors.accent} />
        </Pressable>
      ))}
      {files.map((f, i) => (
        <Pressable key={f.id} testID={`tables-field-${field.id}-file-${i}`} disabled={!f.url} onPress={() => f.url && void Linking.openURL(f.url)} accessibilityRole="link" accessibilityLabel={t("fields.openFile", { name: f.filename })} style={{ alignItems: "center", gap: 2, width: 72 }}>
          {f.contentType?.startsWith("image/") && f.url ? (
            <Image source={{ uri: f.url }} fadeDuration={150} style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: colors.border }} accessibilityIgnoresInvertColors />
          ) : (
            <View style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
              <FileText size={24} color={colors.inkMuted} />
            </View>
          )}
          <Text variant="caption" numberOfLines={1} style={{ width: 72, textAlign: "center" }}>
            {f.filename}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
