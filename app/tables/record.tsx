/**
 * TABLES: one row as a page (SPEC C4; Notion's item page, Beli's detail).
 *
 * The title, then every column the table has, label beside value, through the
 * shared `FieldRow` (Flow's, SPEC C9). Increment 1 reads; increment 2 turns on
 * `editable`. Under the fields, what a value can DO: call or WhatsApp a phone,
 * write an email, open a link, open a file, open a linked row.
 *
 * Previous / next walk the rows the table screen has loaded, in its order
 * (`q` is that screen's query key): "3 / 25", as the web's sheet does.
 */
import { useMemo } from "react";
import { Image, Linking, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { RECORD_TYPE, tablesApi, type RecordRow, type RecordsPage } from "@/api/tables";
import type { FieldDefinition, RecordOption } from "@/api/fields";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Mail, MessageCircle, Phone, Sparkles } from "@/components/icons";
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
import { mergePages, positionOf, titleField } from "@/screens/tables/logic";
import { phoneActions } from "@/screens/tables/recordActions";

export default function RecordScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const ask = useAsk();
  const client = useQueryClient();
  const params = useLocalSearchParams<{ table: string; id: string; q?: string }>();
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
  const writes = useFieldWrites({ record: { type: RECORD_TYPE, id: recordId }, touched: [tablesKeys.rows(tableId)], edit: () => undefined });

  const fields = table.data?.fields ?? [];
  const title = table.data ? titleField(table.data) : null;
  const titleText = (row && title && displayValue(title, row.values[title.id], known, i18n.language)) || t("tables.untitled");

  return (
    <Screen measure>
      <AppHeader app="tables" back title={table.data?.name ?? t("tables.title")} />
      <LoadFailure error={table.error ?? (row ? null : record.error)} loadFailed={t("tables.rowLoadFailed")} hasData={Boolean(row)} updatedAt={record.dataUpdatedAt} onRetry={() => void Promise.all([table.refetch(), record.refetch()])} testID="tables-record-failed" />

      {at ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: metrics.space.xs }}>
          <Text tone="muted" variant="caption" testID="tables-record-position">
            {t("tables.position", { n: at.index + 1, total: at.total })}
          </Text>
          <NavButton testID="tables-record-prev" label={t("tables.previous")} disabled={at.index === 0} onPress={() => go(-1)} icon="prev" />
          <NavButton testID="tables-record-next" label={t("tables.next")} disabled={at.index >= at.total - 1} onPress={() => go(1)} icon="next" />
        </View>
      ) : null}

      {!row || !table.data ? (
        !table.error && !record.error ? <RowsSkeleton rows={6} testID="tables-record-loading" /> : null
      ) : (
        <ScrollView testID="tables-record" contentContainerStyle={{ paddingBottom: metrics.space.xl, gap: metrics.space.xs }}>
          <Text variant="title" testID="tables-record-title" style={{ marginVertical: metrics.space.sm }}>
            {titleText}
          </Text>
          {fields.map((f) => (
            <View key={f.id}>
              <FieldRow field={f} value={row.values[f.id]} editable={false} writes={writes} known={known} testID={`tables-field-${f.id}`} />
              <ValueActions field={f} row={row} known={known} />
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
function ValueActions({ field, row, known }: { field: FieldDefinition; row: RecordRow; known: () => RecordOption[] }) {
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

  const linkedTable = Number(field.config.raw.table_id);
  const links = (field.fieldType === "single_record" || field.fieldType === "multi_record") && field.recordClass === "TableApp::Record" ? linkedRecords(field, value, known) : [];
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
