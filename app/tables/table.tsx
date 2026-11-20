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
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { tablesApi, type RecordRow } from "@/api/tables";
import type { RecordOption } from "@/api/fields";
import { ArrowUpDown, ChevronDown, Ellipsis, LayoutGrid, Plus, RotateCcw, Search, Sparkles, Table2, X } from "@/components/icons";
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
import { CARD_LINES, canEditRows, countLine, mergePages, TABLES_COLOR, titleField } from "@/screens/tables/logic";
import { useCreateRow } from "@/screens/tables/useRowWrites";
import { useTablesUndo } from "@/stores/tablesUndo.store";
import { cardFields, CARD_FIELDS, differsFromShared, effectiveQuery } from "@/screens/tables/personalView";
import { usePersonalLayer } from "@/screens/tables/usePersonalLayer";

const SEARCH_DELAY_MS = 400;

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
  const query = view ? effectiveQuery(view, layer) : null;
  const queryKey = JSON.stringify(query);

  const [searching, setSearching] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"views" | "menu" | null>(null);
  useEffect(() => {
    if (typed === null) return;
    const id = setTimeout(() => change({ search: typed.trim() || undefined }), SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [typed, change]);

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
  const colorField = fields.find((f) => f.id === view?.config.rowColorFieldId) ?? null;
  const itemHeight = cardLayout(shownFields.length, Boolean(coverField));
  const personal = view ? differsFromShared(view, layer) : false;
  const unsorted = query ? query.sorts.length === 0 : false;
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

  const openRow = (row: RecordRow) =>
    router.push({ pathname: "/tables/record", params: { table: String(tableId), id: String(row.id), q: queryKey } });

  const switchTable = (id: number) => router.setParams({ id: String(id), view: undefined });

  const viewActions: SheetAction[] = (table.data?.views ?? []).map((v) => ({
    key: String(v.id),
    label: v.name,
    hint: t(`tables.viewTypes.${v.viewType}`),
    icon: v.viewType === "gallery" ? LayoutGrid : Table2,
    onPress: () => router.setParams({ view: String(v.id) }),
  }));
  const menu: SheetAction[] = [
    { key: "ask", label: t("tables.ask"), icon: Sparkles, onPress: () => ask(t("tables.askQuestion", { table: table.data?.name ?? "", base: base?.name ?? "" })) },
    ...(personal ? [{ key: "reset", label: t("tables.backToShared"), hint: t("tables.backToSharedHint"), icon: RotateCcw, onPress: reset }] : []),
  ];

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
            style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexShrink: 1 }}
          >
            {gallery ? <LayoutGrid size={16} color={colors.ink} /> : <Table2 size={16} color={colors.ink} />}
            <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
              {view.name}
            </Text>
            <ChevronDown size={16} color={colors.inkMuted} />
          </Pressable>
          {unsorted || layer.newestFirst === false ? (
            <Pressable
              testID="tables-order"
              onPress={() => change({ newestFirst: query?.newestFirst ? false : undefined })}
              accessibilityRole="button"
              accessibilityLabel={query?.newestFirst ? t("tables.order.newest") : t("tables.order.table")}
              accessibilityHint={t("tables.order.hint")}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: layer.newestFirst === false ? colors.accent : colors.border, backgroundColor: layer.newestFirst === false ? `${colors.accent}22` : colors.surface }}
            >
              <ArrowUpDown size={16} color={colors.ink} />
              <Text variant="label" numberOfLines={1}>
                {query?.newestFirst ? t("tables.order.newest") : t("tables.order.table")}
              </Text>
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }} />
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

      <FlatList
        testID="tables-rows"
        data={rows}
        keyExtractor={(r) => String(r.id)}
        getItemLayout={(_, index) => ({ length: itemHeight, offset: itemHeight * index, index })}
        renderItem={({ item, index }) => <RecordCard row={item} index={index} title={title} fields={shownFields} colorField={colorField} coverField={coverField} known={known} height={itemHeight} onPress={() => openRow(item)} />}
        ListEmptyComponent={
          (table.isPending || records.isPending) && !table.error && !records.error ? (
            <RowsSkeleton rows={5} testID="tables-rows-loading" />
          ) : records.data ? (
            query?.search || query?.filters.length ? (
              <EmptyState testID="tables-rows-no-match" icon={Search} title={t("tables.rowsNoMatch")} />
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

      {editable && table.data ? (
        <Pressable
          testID="tables-add-row"
          onPress={() => create.mutate()}
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

      <ActionSheet open={sheet === "views"} title={t("tables.views")} actions={viewActions} onClose={() => setSheet(null)} testID="tables-views" />
      <ActionSheet open={sheet === "menu"} title={table.data?.name ?? ""} actions={menu} onClose={() => setSheet(null)} testID="tables-options" />
    </Screen>
  );
}
