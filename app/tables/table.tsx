/**
 * TABLES: one table (`docs/design/tables/SPEC.md` C2, C6, C7, C10).
 *
 * The web's own phone mode: the base's tables as a chip strip, the view's
 * toolbar row, and the rows as fixed-height cards. A tap opens the row.
 *
 * What the person changes here (search, newest first or the table's order)
 * is theirs alone: it shapes the query and is never written to the shared
 * view (the owner's rule, SPEC C1; `personalView.ts`). Switching the view
 * picks another SHARED view; it changes nothing for anybody.
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, TextInput, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { tablesApi, type RecordRow } from "@/api/tables";
import type { RecordOption } from "@/api/fields";
import { ArrowUpDown, ChevronDown, ChevronRight, Columns3, Ellipsis, LayoutGrid, Plus, RotateCcw, Save, Search, SlidersHorizontal, Sparkles, Table2, X } from "@/components/icons";
import { UndoToast } from "@/components/UndoToast";
import { failureMessage } from "@/api/failure";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { UnreadableNotice } from "@/components/UnreadableNotice";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useMe } from "@/hooks/useMe";
import { ActionSheet, type SheetAction } from "@/screens/contacts/ActionSheet";
import { EmptyState } from "@/screens/flow/parts";
import { useAsk } from "@/screens/flow/useAsk";
import { cardLayout, RecordCard } from "@/screens/tables/RecordCard";
import { CARD_LINES, canEditRows, countLine, mergePages, newestProven, TABLES_COLOR, titleField } from "@/screens/tables/logic";
import { useCreateRow, useMoveRow } from "@/screens/tables/useRowWrites";
import { KanbanView } from "@/screens/tables/KanbanView";
import { CalendarView } from "@/screens/tables/CalendarView";
import { calendarable, columnValue, kanbanable, kanbanColumns, monthFilters, moveWithin, rowsByDay, toggleFolded, type KanbanColumn, type MoveWithin } from "@/screens/tables/boardViews";
import { scalar } from "@/components/fields/display";
import { todayKey } from "@/screens/calendar/dates";
import type { FieldDefinition } from "@/api/fields";
import { ArrowDown, ArrowRightLeft, ArrowUp, CalendarDays, Kanban, MessageSquareText, Trash2, Users } from "@/components/icons";
import type { ViewType } from "@/api/tables";
import type { LucideIcon } from "lucide-react-native";
import { FilterSortSheet } from "@/screens/tables/FilterSortSheet";
import { FieldsSheet } from "@/screens/tables/FieldsSheet";
import { SaveViewSheet } from "@/screens/tables/SaveViewSheet";
import { ViewsSheet } from "@/screens/tables/ViewsSheet";
import { useTableAdmin } from "@/screens/tables/useTableAdmin";
import { useTableExport } from "@/screens/tables/useTableExport";
import { DeleteByNameSheet } from "@/screens/tables/DeleteByNameSheet";
import { BulkEditSheet } from "@/screens/tables/BulkEditSheet";
import { ShareSheet } from "@/screens/tables/ShareSheet";
import { dropRows } from "@/screens/tables/useRowWrites";
import { Alert } from "react-native";
import { GROUP_HEADER, layoutOf, listItems, type ListItem } from "@/screens/tables/grouping";
import { colorHex } from "@/screens/flow/logic";
import { useTablesUndo } from "@/stores/tablesUndo.store";
import { cardFields, CARD_FIELDS, differsFromShared, effectiveQuery, orderedFields, visibleFields } from "@/screens/tables/personalView";
import { usePersonalLayer } from "@/screens/tables/usePersonalLayer";

const SEARCH_DELAY_MS = 400;

/** Each view type its own icon, in the switcher and on the pill (seen on a device: every type showed the table icon). */
const VIEW_ICONS: Record<ViewType, LucideIcon> = { grid: Table2, gallery: LayoutGrid, kanban: Kanban, calendar: CalendarDays };

export default function TableScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const me = useMe();
  const ask = useAsk();
  const params = useLocalSearchParams<{ id: string; base?: string; view?: string }>();
  const tableId = Number(params.id);
  const baseId = params.base ? Number(params.base) : null;

  const table = useQuery({ queryKey: tablesKeys.table(tableId), queryFn: () => tablesApi.table(tableId), enabled: Number.isFinite(tableId) });
  // The base's name and its other tables: the bases list is one answer, usually cached already.
  const bases = useQuery({ queryKey: tablesKeys.bases("created_at_desc"), queryFn: () => tablesApi.bases(), enabled: baseId !== null || Boolean(table.data) });
  const base = bases.data?.find((b) => b.id === (baseId ?? table.data?.baseId));

  const view = table.data ? (table.data.views.find((v) => String(v.id) === params.view) ?? table.data.view) : undefined;
  const { layer, ready, change, reset } = usePersonalLayer(me?.id, view);
  const shared = view ? effectiveQuery(view, layer) : null;
  const allFields = table.data?.fields ?? [];
  // Kanban groups by its column; Calendar asks for the month on screen (the
  // web fetches only the visible weeks). Both are the VIEW's, not the person's.
  const kanbanField = view?.viewType === "kanban" ? (allFields.find((f) => f.id === view.config.kanbanFieldId) ?? kanbanable(allFields)[0] ?? null) : null;
  const calendarField = view?.viewType === "calendar" ? (allFields.find((f) => f.id === view.config.calendarFieldId) ?? calendarable(allFields)[0] ?? null) : null;
  const [month, setMonth] = useState(() => todayKey());
  const [day, setDay] = useState(() => todayKey());
  const [showUndated, setShowUndated] = useState(false);
  const canNarrow = Boolean(shared && (shared.match === "and" || shared.filters.length === 0));
  const query = !shared
    ? null
    : kanbanField
      ? { ...shared, groupBy: kanbanField.id }
      : calendarField && canNarrow
        ? { ...shared, match: "and" as const, filters: [...shared.filters, ...monthFilters(calendarField.id, month)] }
        : shared;
  const queryKey = JSON.stringify(query);

  const [searching, setSearching] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"views" | "menu" | "find" | "fields" | "save" | "deleteTable" | "deleteBase" | "bulkEdit" | "share" | null>(null);
  // Select mode (increment 5): a long press starts it, a tap then toggles, the bar acts on the rows.
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const selecting = selected.size > 0;
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const client = useQueryClient();
  useEffect(() => {
    if (typed === null) return;
    const id = setTimeout(() => change({ search: typed.trim() || undefined }), SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [typed, change]);

  const undated = useQuery({
    queryKey: tablesKeys.undated(tableId, JSON.stringify({ field: calendarField?.id, shared })),
    queryFn: () => tablesApi.records(tableId, { ...shared, match: "and", filters: [...(shared?.filters ?? []), { fieldId: calendarField!.id, op: "empty", value: null }] }, 0),
    enabled: ready && Boolean(calendarField) && showUndated && canNarrow,
  });

  const records = useInfiniteQuery({
    queryKey: tablesKeys.records(tableId, queryKey),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => tablesApi.records(tableId, query ?? {}, pageParam),
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.rows.length : undefined),
    enabled: ready && query !== null,
  });
  const rows = useMemo(() => mergePages(records.data?.pages ?? []), [records.data]);
  const unreadable = records.data?.pages.reduce((n, p) => n + p.unreadable, 0) ?? 0;
  const firstPage = records.data?.pages[0];

  // Titles of linked rows from every loaded page (the server sends the first 12 per cell).
  const labels = useMemo(() => {
    const out = new Map<number, RecordOption>();
    for (const r of rows) for (const [rid, label] of Object.entries(r.linkLabels)) out.set(Number(rid), { id: Number(rid), label, color: null });
    return [...out.values()];
  }, [rows]);
  const known = useMemo(() => () => labels, [labels]);

  const fields = table.data?.fields ?? [];
  const title = table.data ? titleField(table.data) : null;
  const shownFields = view && table.data ? cardFields(fields, table.data.primaryFieldId, view, layer).slice(0, Math.min(CARD_FIELDS, CARD_LINES[view.config.rowHeight])) : [];
  const gallery = view?.viewType === "gallery";
  const coverField = gallery ? (fields.find((f) => f.id === view?.config.coverFieldId) ?? fields.find((f) => f.fieldType === "attachments" || f.fieldType === "attachment") ?? null) : null;
  const colorFieldId = layer.rowColorFieldId === undefined ? (view?.config.rowColorFieldId ?? null) : layer.rowColorFieldId;
  const colorField = fields.find((f) => f.id === colorFieldId) ?? null;
  const groupField = fields.find((f) => f.id === query?.groupBy) ?? null;
  const itemHeight = cardLayout(shownFields.length, Boolean(coverField));
  const items = useMemo(() => listItems(rows, groupField, firstPage?.groups ?? null, folded), [rows, groupField, firstPage?.groups, folded]);
  const layout = useMemo(() => layoutOf(items, itemHeight), [items, itemHeight]);
  const finding = Boolean(shared && (shared.filters.length || shared.groupBy || layer.sorts !== undefined));
  const columns = useMemo(() => (kanbanField ? kanbanColumns(kanbanField, rows, firstPage?.groups ?? null) : []), [kanbanField, rows, firstPage?.groups]);
  const byDay = useMemo(() => (calendarField ? rowsByDay(rows, calendarField) : new Map<string, RecordRow[]>()), [calendarField, rows]);
  const [moving, setMoving] = useState<{ row: RecordRow; column: KanbanColumn } | null>(null);
  const personal = view ? differsFromShared(view, layer) : false;
  // Say "Newest first" only when the first page proves it: an older server
  // ignores `sort=-created_at` and sends the table's order (seen on a device,
  // 2026-11-20). Unproven, the screen shows the order and claims nothing.
  const newestShown = Boolean(query?.newestFirst && firstPage && newestProven(firstPage.rows));
  const showOrderChip = newestShown || layer.newestFirst === false;
  // On a phone narrower than this the order chip is an icon, so the view's
  // NAME keeps its room (at 360 dp it shrank to an icon, at 411 to "G…").
  const { width: screenWidth } = useWindowDimensions();
  const compactToolbar = screenWidth < 420;
  const count = countLine(firstPage, t, i18n.language);

  const editable = canEditRows(base?.role);
  const offer = useTablesUndo((s) => s.offer);
  const clearOffer = useTablesUndo((s) => s.clear);
  const [failure, setFailure] = useState<string | null>(null);
  // A new row opens at once, as the web's "reveal" does (SPEC C3): newest
  // first puts it on top of the list too, and it is there after Back.
  const create = useCreateRow(tableId, {
    onCreated: (row) => router.push({ pathname: "/tables/record", params: { table: String(tableId), id: String(row.id) } }),
    onError: (e) => setFailure(failureMessage(e, t("tables.addFailed"))),
  });

  const move = useMoveRow(tableId, {
    onMoved: (row, before) => {
      const field = kanbanField;
      if (!field) return;
      offerUndo(t("tables.kanban.moved"), () => move.mutate({ row, field, value: before, before: null }));
    },
    onError: (e) => setFailure(failureMessage(e, t("tables.kanban.moveFailed"))),
  });
  const offerUndo = useTablesUndo((s) => s.offerUndo);
  const moveTo = (row: RecordRow, field: FieldDefinition, key: string) => move.mutate({ row, field, value: columnValue(key), before: scalar(row.values[field.id]) ?? null });
  // Within a column (4b): only in the table's own order, as the web reorders only a board with no sort;
  // the column keeps its positions and they are re-dealt (`records#reorder`).
  const inTableOrder = Boolean(query && query.sorts.length === 0 && !query.newestFirst);
  const reorder = (column: KanbanColumn, row: RecordRow, to: MoveWithin) => {
    const ids = moveWithin(column.rows.map((r) => r.id), row.id, to);
    if (!ids) return;
    void tablesApi
      .reorderRecords(tableId, ids)
      .then(() => client.invalidateQueries({ queryKey: tablesKeys.records(tableId, queryKey) }))
      .catch((e: unknown) => Alert.alert(failureMessage(e, t("tables.kanban.reorderFailed"))));
  };

  const toggleSelect = (row: RecordRow) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  /** Many rows to the trash; one Undo brings them all back (`records#restore`). */
  const bulkDelete = () => {
    const ids = [...selected];
    Alert.alert(t("tables.bulk.deleteTitle", { count: ids.length }), t("tables.bulk.deleteBody", { count: ids.length }), [
      { text: t("fields.cancel"), style: "cancel" },
      {
        text: t("tables.delete"),
        style: "destructive",
        onPress: () =>
          void tablesApi
            .bulkDestroy(tableId, ids)
            .then((gone) => {
              dropRows(client, tableId, gone);
              clearSelection();
              void client.invalidateQueries({ queryKey: tablesKeys.rows(tableId) });
              offerUndo(t("tables.bulk.deleted", { count: gone.length }), () => void tablesApi.restore(tableId, gone).then(() => client.invalidateQueries({ queryKey: tablesKeys.rows(tableId) })));
            })
            .catch((e: unknown) => setFailure(failureMessage(e, t("tables.deleteFailed")))),
      },
    ]);
  };

  /** One column, one value, every selected row; Undo writes each row's old value back. */
  const bulkApply = async (field: FieldDefinition, value: unknown) => {
    const ids = [...selected];
    const before = ids.map((id) => ({ id, values: { [field.id]: scalar(rows.find((r) => r.id === id)?.values[field.id]) ?? null } }));
    setBulkBusy(true);
    setBulkError(null);
    try {
      await tablesApi.bulkSet(tableId, ids, field.id, value);
      setSheet(null);
      clearSelection();
      void client.invalidateQueries({ queryKey: tablesKeys.rows(tableId) });
      offerUndo(t("tables.bulk.edited", { count: ids.length }), () => void tablesApi.bulkWrite(tableId, before).then(() => client.invalidateQueries({ queryKey: tablesKeys.rows(tableId) })));
    } catch (e) {
      setBulkError(failureMessage(e, t("tables.bulk.failed")));
    } finally {
      setBulkBusy(false);
    }
  };

  const openRow = (row: RecordRow) =>
    router.push({ pathname: "/tables/record", params: { table: String(tableId), id: String(row.id), q: queryKey, ...(view ? { view: String(view.id) } : {}) } });

  const switchTable = (id: number) => router.setParams({ id: String(id), view: undefined });
  const admin = useTableAdmin({ table: table.data, base, editable, onOpenTable: switchTable });
  // Increment 7: the view as this person sees it, as Excel or CSV (everyone who can open the table).
  const exporter = useTableExport({ tableId, query: shared, fieldIds: view ? visibleFields(fields, view, layer).map((f) => f.id) : [] });

  const menu: SheetAction[] = [
    { key: "ask", label: t("tables.ask"), icon: Sparkles, onPress: () => ask(t("tables.askQuestion", { table: table.data?.name ?? "", base: base?.name ?? "" })) },
    { key: "fields", label: t("tables.fieldsSheet.title"), icon: Columns3, onPress: () => setTimeout(() => setSheet("fields"), 320) },
    ...(base ? [{ key: "share", label: base.role === "owner" ? t("tables.share.title") : t("tables.share.people"), icon: Users, onPress: () => setTimeout(() => setSheet("share"), 320) }] : []),
    { key: "activity", label: t("tables.activity.open"), icon: MessageSquareText, onPress: () => router.push({ pathname: "/tables/activity", params: { table: String(tableId) } }) },
    ...(personal && editable ? [{ key: "save", label: t("tables.saveView.title"), hint: t("tables.saveView.hint"), icon: Save, onPress: () => setTimeout(() => setSheet("save"), 320) }] : []),
    ...(personal ? [{ key: "reset", label: t("tables.backToShared"), hint: t("tables.backToSharedHint"), icon: RotateCcw, onPress: reset }] : []),
    ...(exporter.action ? [exporter.action] : []),
    ...admin.actions,
    // The owner, 2026-11-20: a table and a base can be deleted from the phone, by typing the name.
    ...(editable ? [{ key: "deleteTable", label: t("tables.remove.tableAction"), icon: Trash2, danger: true, onPress: () => setTimeout(() => setSheet("deleteTable"), 320) }] : []),
    ...(base?.role === "owner" ? [{ key: "deleteBase", label: t("tables.remove.baseAction"), icon: Trash2, danger: true, onPress: () => setTimeout(() => setSheet("deleteBase"), 320) }] : []),
  ];

  const impact = useQuery({ queryKey: tablesKeys.impact(tableId), queryFn: () => tablesApi.tableImpact(tableId), enabled: sheet === "deleteTable" });
  const impactLine = impact.data
    ? [
        t("tables.remove.tableImpact", { rows: t("tables.remove.rowsN", { count: impact.data.rows }), fields: t("tables.remove.columnsN", { count: impact.data.fields }) }),
        ...impact.data.linksFrom.map((l) => t("tables.remove.linksFrom", { field: l.field, table: l.table, count: l.links })),
      ].join(" ")
    : null;
  const removeTable = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await tablesApi.deleteTable(tableId);
      setSheet(null);
      offerUndo(t("tables.remove.tableDone", { name: table.data?.name ?? "" }));
      await client.invalidateQueries({ queryKey: tablesKeys.baseLists() });
      client.removeQueries({ queryKey: tablesKeys.table(tableId) });
      client.removeQueries({ queryKey: tablesKeys.rows(tableId) });
      // Stay in the base on its next table; none left, back to the bases.
      const next = base?.tables.find((tb) => tb.id !== tableId);
      if (next) router.setParams({ id: String(next.id), view: undefined });
      else router.back();
    } catch (e) {
      setDeleteError(failureMessage(e, t("tables.remove.failed")));
    } finally {
      setDeleting(false);
    }
  };
  const removeBase = async (typed: string) => {
    if (!base) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await tablesApi.deleteBase(base.id, typed);
      setSheet(null);
      offerUndo(t("tables.remove.baseDone", { name: base.name }));
      await client.invalidateQueries({ queryKey: tablesKeys.baseLists() });
      router.back();
    } catch (e) {
      setDeleteError(failureMessage(e, t("tables.remove.failed")));
    } finally {
      setDeleting(false);
    }
  };

  const saveView = async (name: string) => {
    if (!view || !query) return;
    setSaving(true);
    setSaveError(null);
    try {
      const made = await tablesApi.createView(tableId, {
        name,
        viewType: view.viewType,
        fromViewId: view.id,
        config: { search: query.search, match: query.match, filters: query.filters, sorts: query.sorts, groupByFieldId: query.groupBy, hiddenFieldIds: layer.hiddenFieldIds ?? view.config.hiddenFieldIds, fieldOrder: layer.fieldOrder ?? view.config.fieldOrder, rowColorFieldId: colorFieldId },
      });
      await client.invalidateQueries({ queryKey: tablesKeys.table(tableId) });
      // The person's choices are now that view's own; the view they came from goes back to shared.
      reset();
      setSheet(null);
      router.setParams({ view: String(made.id) });
    } catch (e) {
      setSaveError(failureMessage(e, t("tables.saveView.failed")));
    } finally {
      setSaving(false);
    }
  };

  const toggleFold = (key: string) =>
    setFolded((f) => {
      const next = new Set(f);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Screen measure>
      <AppHeader app="tables" back title={base?.name ?? table.data?.name ?? t("tables.title")} />

      {base && base.tables.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="tables-table-strip" contentContainerStyle={{ gap: metrics.space.xs, paddingVertical: metrics.space.xs }} style={{ flexGrow: 0 }}>
          {base.tables.map((tb) => {
            const on = tb.id === tableId;
            return (
              <Pressable
                key={tb.id}
                testID={`tables-tab-${tb.position}`}
                onPress={() => switchTable(tb.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={tb.name}
                style={{ minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center", borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.surface }}
              >
                <Text variant="label" tone={on ? "onAccent" : "default"} numberOfLines={1}>
                  {tb.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {table.data?.description ? (
        <Text tone="muted" variant="caption" numberOfLines={2} testID="tables-description">
          {table.data.description}
        </Text>
      ) : null}

      {view ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs, paddingVertical: metrics.space.xs }}>
          <Pressable
            testID="tables-view-switch"
            onPress={() => setSheet("views")}
            accessibilityRole="button"
            accessibilityLabel={t("tables.viewSwitch", { view: view.name })}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, minWidth: 96, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexShrink: 1 }}
          >
            {(() => {
              const Icon = VIEW_ICONS[view.viewType];
              return <Icon size={16} color={colors.ink} />;
            })()}
            <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
              {view.name}
            </Text>
            <ChevronDown size={16} color={colors.inkMuted} />
          </Pressable>
          {showOrderChip ? (
            <Pressable
              testID="tables-order"
              onPress={() => change({ newestFirst: query?.newestFirst ? false : undefined })}
              accessibilityRole="button"
              accessibilityLabel={query?.newestFirst ? t("tables.order.newest") : t("tables.order.table")}
              accessibilityHint={t("tables.order.hint")}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: layer.newestFirst === false ? colors.accent : colors.border, backgroundColor: layer.newestFirst === false ? `${colors.accent}22` : colors.surface }}
            >
              <ArrowUpDown size={16} color={colors.ink} />
              {compactToolbar ? null : (
                <Text variant="label" numberOfLines={1}>
                  {query?.newestFirst ? t("tables.order.newest") : t("tables.order.table")}
                </Text>
              )}
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }} />
          <Pressable
            testID="tables-find-open"
            onPress={() => setSheet("find")}
            accessibilityRole="button"
            accessibilityLabel={finding ? t("tables.find.openActive") : t("tables.find.open")}
            style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
          >
            <SlidersHorizontal size={22} color={finding ? colors.accent : colors.ink} />
          </Pressable>
          <Pressable
            testID="tables-search-toggle"
            onPress={() => {
              if (searching) {
                setTyped(null);
                change({ search: undefined });
              }
              setSearching((s) => !s);
            }}
            accessibilityRole="button"
            accessibilityLabel={searching ? t("tables.closeSearch") : t("tables.searchRows")}
            style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
          >
            {searching ? <X size={22} color={colors.ink} /> : <Search size={22} color={layer.search ? colors.accent : colors.ink} />}
          </Pressable>
          <Pressable
            testID="tables-menu"
            onPress={() => setSheet("menu")}
            accessibilityRole="button"
            accessibilityLabel={t("tables.more")}
            style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
          >
            <Ellipsis size={22} color={colors.ink} />
            {personal ? <View testID="tables-personal-dot" style={{ position: "absolute", top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} /> : null}
          </Pressable>
        </View>
      ) : null}

      {searching ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, marginBottom: metrics.space.sm, backgroundColor: colors.surface }}>
          <Search size={18} color={colors.inkMuted} />
          <TextInput
            testID="tables-row-search"
            value={typed ?? layer.search ?? ""}
            onChangeText={setTyped}
            autoFocus
            placeholder={t("tables.searchRowsPlaceholder")}
            placeholderTextColor={colors.inkMuted}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t("tables.searchRows")}
            style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }}
          />
        </View>
      ) : null}

      {personal ? (
        <Text tone="muted" variant="caption" testID="tables-personal-note">
          {t("tables.personalNote")}
        </Text>
      ) : null}
      {count ? (
        <Text tone="muted" variant="caption" testID="tables-count">
          {count}
        </Text>
      ) : null}

      {failure ? (
        <Pressable testID="tables-failure" onPress={() => setFailure(null)} accessibilityRole="button" accessibilityLabel={failure} accessibilityLiveRegion="polite">
          <Text tone="danger">{failure}</Text>
        </Pressable>
      ) : null}
      <LoadFailure error={table.error ?? (records.data ? null : records.error)} loadFailed={t("tables.tableLoadFailed")} hasData={Boolean(records.data)} updatedAt={records.dataUpdatedAt} onRetry={() => void (table.error ? table.refetch() : records.refetch())} testID="tables-table-failed" />
      <UnreadableNotice count={unreadable} />

      {kanbanField ? (
        <KanbanView
          columns={columns}
          title={title}
          fields={shownFields}
          colorField={colorField}
          known={known}
          cardHeight={itemHeight}
          editable={editable}
          onOpen={openRow}
          onMenu={(row, column) => setMoving({ row, column })}
          onAdd={(column) => create.mutate({ [kanbanField.id]: columnValue(column.key) })}
          onEndReached={() => {
            if (records.hasNextPage && !records.isFetchingNextPage && !records.error) void records.fetchNextPage();
          }}
          folded={layer.foldedColumns}
          onToggleFold={(key) => change({ foldedColumns: toggleFolded(layer.foldedColumns, key) })}
        />
      ) : calendarField ? (
        <CalendarView
          month={month}
          day={day}
          byDay={byDay}
          undated={undated.data?.rows ?? null}
          showUndated={showUndated}
          title={title}
          fields={shownFields}
          colorField={colorField}
          known={known}
          cardHeight={itemHeight}
          editable={editable}
          onMonthChange={setMonth}
          onDayChange={(d) => {
            setDay(d);
            setShowUndated(false);
          }}
          onToggleUndated={() => setShowUndated((u) => !u)}
          onOpen={openRow}
          onAdd={(d) => create.mutate({ [calendarField.id]: d })}
        />
      ) : (
        <FlatList
        testID="tables-rows"
        data={items}
        keyExtractor={(item) => (item.kind === "header" ? `h:${item.key}` : String(item.row.id))}
        getItemLayout={(_, index) => ({ ...(layout[index] ?? { length: itemHeight, offset: itemHeight * index }), index })}
        renderItem={({ item }) =>
          item.kind === "header" ? (
            <GroupHeader item={item} onPress={() => toggleFold(item.key)} />
          ) : (
            <RecordCard
              row={item.row}
              index={item.index}
              title={title}
              fields={shownFields}
              colorField={colorField}
              coverField={coverField}
              known={known}
              height={itemHeight}
              onPress={() => (selecting ? toggleSelect(item.row) : openRow(item.row))}
              onLongPress={editable ? () => toggleSelect(item.row) : undefined}
              selected={selecting ? selected.has(item.row.id) : undefined}
            />
          )
        }
        ListEmptyComponent={
          (table.isPending || records.isPending) && !table.error && !records.error ? (
            <RowsSkeleton rows={5} testID="tables-rows-loading" />
          ) : records.data ? (
            query?.search || query?.filters.length ? (
              <EmptyState
                testID="tables-rows-no-match"
                icon={Search}
                title={t("tables.rowsNoMatch")}
                action={
                  <Pressable testID="tables-clear-filters" onPress={() => change({ filters: [], search: undefined })} accessibilityRole="button" accessibilityLabel={t("tables.clearFilters")} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: metrics.space.md }}>
                    <Text tone="accent" variant="label">
                      {t("tables.clearFilters")}
                    </Text>
                  </Pressable>
                }
              />
            ) : (
              <EmptyState testID="tables-rows-empty" icon={Table2} title={t("tables.rowsEmptyTitle")} body={t("tables.rowsEmptyBody", { fields: fields.map((f) => f.name).slice(0, 4).join(", ") })} />
            )
          ) : null
        }
        ListFooterComponent={
          records.isFetchingNextPage ? (
            <View testID="tables-loading-more" style={{ flexDirection: "row", gap: metrics.space.sm, alignItems: "center", justifyContent: "center", padding: metrics.space.md }}>
              <ActivityIndicator color={colors.inkMuted} />
              <Text tone="muted">{t("tables.loadingMore")}</Text>
            </View>
          ) : records.error && records.data ? (
            <Pressable testID="tables-page-retry" onPress={() => void records.fetchNextPage()} accessibilityRole="button" accessibilityLabel={t("tables.pageFailedRetry")} style={{ padding: metrics.space.md, alignItems: "center" }}>
              <Text tone="danger">{t("tables.pageFailed")}</Text>
              <Text tone="accent" variant="label">
                {t("fields.retry")}
              </Text>
            </Pressable>
          ) : null
        }
        onEndReached={() => {
          if (records.hasNextPage && !records.isFetchingNextPage && !records.error) void records.fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={records.isRefetching && !records.isFetchingNextPage} onRefresh={() => void Promise.all([table.refetch(), records.refetch()])} tintColor={colors.inkMuted} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: editable ? 96 : metrics.space.xl }}
      />
      )}

      {selecting ? (
        <View testID="tables-bulk-bar" style={{ position: "absolute", left: metrics.space.lg, right: metrics.space.lg, bottom: metrics.space.lg, flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 56, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.lg, backgroundColor: colors.ink }}>
          <Pressable testID="tables-bulk-clear" onPress={clearSelection} accessibilityRole="button" accessibilityLabel={t("tables.bulk.clear")} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
            <X size={20} color={colors.ground} />
          </Pressable>
          <Text testID="tables-bulk-count" style={{ flex: 1, color: colors.ground }} numberOfLines={1}>
            {t("tables.bulk.selected", { count: selected.size })}
          </Text>
          <Pressable testID="tables-bulk-edit-open" onPress={() => setSheet("bulkEdit")} accessibilityRole="button" accessibilityLabel={t("tables.bulk.edit")} style={{ minHeight: 40, paddingHorizontal: metrics.space.md, justifyContent: "center" }}>
            <Text variant="label" style={{ color: colors.ground }}>
              {t("tables.bulk.edit")}
            </Text>
          </Pressable>
          <Pressable testID="tables-bulk-delete" onPress={bulkDelete} accessibilityRole="button" accessibilityLabel={t("tables.bulk.delete")} style={{ minHeight: 40, paddingHorizontal: metrics.space.md, justifyContent: "center" }}>
            <Text variant="label" style={{ color: colors.danger }}>
              {t("tables.bulk.delete")}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {sheet === "share" && base ? <ShareSheet baseId={base.id} baseName={base.name} isOwner={base.role === "owner"} onClose={() => setSheet(null)} /> : null}
      {sheet === "bulkEdit" ? <BulkEditSheet count={selected.size} fields={fields} busy={bulkBusy} error={bulkError} onApply={(f, v) => void bulkApply(f, v)} onClose={() => setSheet(null)} /> : null}
      {editable && table.data && !kanbanField && !calendarField && !selecting ? (
        <Pressable
          testID="tables-add-row"
          onPress={() => create.mutate(undefined)}
          disabled={create.isPending}
          accessibilityRole="button"
          accessibilityLabel={t("tables.addRow")}
          accessibilityState={{ disabled: create.isPending, busy: create.isPending }}
          style={{ position: "absolute", right: metrics.space.lg, bottom: metrics.space.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: TABLES_COLOR, alignItems: "center", justifyContent: "center", opacity: create.isPending ? 0.6 : 1, elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
        >
          <Plus size={26} color={colors.onAccent} />
        </Pressable>
      ) : null}
      <UndoToast offer={offer} onDone={clearOffer} testID="tables-toast" bottom={editable ? 72 : 0} />

      {view && table.data ? (
        <>
          <FilterSortSheet
            open={sheet === "find"}
            tableId={tableId}
            fields={fields}
            search={query?.search ?? ""}
            initial={{ filters: layer.filters ?? view.config.filters, match: query?.match ?? "and", sorts: query?.sorts ?? [], groupBy: query?.groupBy ?? null }}
            onApply={(d) => change({ filters: d.filters, match: d.match, sorts: d.sorts, groupBy: d.groupBy })}
            onClose={() => setSheet(null)}
          />
          <FieldsSheet
            open={sheet === "fields"}
            fields={orderedFields(fields, view, layer)}
            primaryFieldId={table.data.primaryFieldId}
            hidden={layer.hiddenFieldIds ?? view.config.hiddenFieldIds}
            onCards={shownFields.map((f) => f.id)}
            colorFieldId={colorFieldId}
            onChange={change}
            onClose={() => setSheet(null)}
          />
          {sheet === "save" ? <SaveViewSheet open suggested={t("tables.saveView.suggested", { view: view.name })} busy={saving} error={saveError} onSave={(name) => void saveView(name)} onClose={() => setSheet(null)} /> : null}
        </>
      ) : null}
      <ActionSheet
        open={moving !== null}
        title={t("tables.kanban.moveTo")}
        subtitle={moving ? t("tables.kanban.moving", { column: moving.column.label ?? t("tables.kanban.empty") }) : undefined}
        actions={[
          ...(moving && inTableOrder
            ? (["top", "up", "down"] as const)
                .filter((to) => moveWithin(moving.column.rows.map((r) => r.id), moving.row.id, to) !== null)
                .map((to) => ({ key: `within-${to}`, label: t(`tables.kanban.within.${to}`), icon: to === "down" ? ArrowDown : ArrowUp, onPress: () => reorder(moving.column, moving.row, to) }))
            : []),
          ...columns
            .filter((c) => c.key !== moving?.column.key)
            .map((c) => ({ key: c.key || "empty", label: c.label ?? t("tables.kanban.empty"), icon: ArrowRightLeft, onPress: () => moving && kanbanField && moveTo(moving.row, kanbanField, c.key) })),
        ]}
        onClose={() => setMoving(null)}
        testID="tables-kanban-move"
      />
      {sheet === "deleteTable" && table.data ? (
        <DeleteByNameSheet kind="table" name={table.data.name} consequence={impactLine} busy={deleting} error={deleteError} onDelete={() => void removeTable()} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "deleteBase" && base ? (
        <DeleteByNameSheet kind="base" name={base.name} consequence={t("tables.remove.baseImpact", { count: base.tables.length, rows: base.rowCount })} busy={deleting} error={deleteError} onDelete={(typed) => void removeBase(typed)} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "views" && table.data ? (
        <ViewsSheet
          tableId={tableId}
          views={table.data.views}
          currentId={view?.id ?? null}
          fields={fields}
          editable={editable}
          icons={VIEW_ICONS}
          onOpenView={(id) => {
            setSheet(null);
            router.setParams({ view: String(id) });
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      <ActionSheet open={sheet === "menu"} title={table.data?.name ?? ""} actions={menu} onClose={() => setSheet(null)} testID="tables-options" />
      {admin.sheets}
      {exporter.sheet}
    </Screen>
  );
}

function GroupHeader({ item, onPress }: { item: Extract<ListItem, { kind: "header" }>; onPress: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const hex = colorHex(item.color) ?? colors.inkMuted;
  const label = item.label ?? t("tables.noValue");
  return (
    <Pressable
      testID={`tables-group-${item.key || "none"}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: !item.folded }}
      accessibilityLabel={item.count === null ? label : t("tables.groupLabel", { group: label, count: item.count })}
      style={{ height: GROUP_HEADER, flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}
    >
      {item.folded ? <ChevronRight size={18} color={colors.inkMuted} /> : <ChevronDown size={18} color={colors.inkMuted} />}
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: hex }} />
      <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </Text>
      {item.count !== null ? (
        <Text tone="muted" variant="caption">
          {item.count.toLocaleString()}
        </Text>
      ) : null}
    </Pressable>
  );
}
