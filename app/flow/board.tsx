/**
 * A PROJECT'S BOARD (`docs/design/flow/SPEC.md` §C).
 *
 * On a phone, one column per page with the next one peeking (Jira Cloud,
 * Mobbin `6a847e41`), and a strip of column chips with their counts above it
 * that jumps to a column. On a tablet the same pager shows the columns side by
 * side (300 dp each), as the web does.
 *
 * Above the strip: the sprint chip (what the board holds), search, the filter
 * chip (priority, assignee, label, and the order). A card opens on tap; a
 * long press offers Open, Move to…, the next column, Reorder and Delete, each
 * only to a role that may (`logic.ts` `powersOf`). A viewer sees the board
 * and nothing to change it with.
 *
 * DATA: one infinite query per sprint scope, full cards, 100 a page; the
 * next page is fetched as soon as one lands, so a board of a few hundred cards
 * is whole after a few requests. A server without paging answers the whole
 * board at once, read as one page (`flowApi.board`).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import { flowKeys } from "@/api/keys";
import { flowApi, type Card, type Column, type Project, type SprintScope } from "@/api/flow";
import { failureMessage } from "@/api/failure";
import { ArrowRightLeft, ChevronDown, Columns3, Ellipsis, Filter, GripVertical, Kanban, ArrowRight, Palette, Pencil, Search, SlidersHorizontal, Sparkles, Trash2, Users, X } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { LoadFailure } from "@/components/LoadFailure";
import { UnreadableNotice } from "@/components/UnreadableNotice";
import { BottomSheet } from "@/components/BottomSheet";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useMe } from "@/hooks/useMe";
import { todayKey } from "@/screens/calendar/dates";
import { ActionSheet, type SheetAction } from "@/screens/contacts/ActionSheet";
import { BoardColumn } from "@/screens/flow/BoardColumn";
import { FilterSheet } from "@/screens/flow/FilterSheet";
import { MembersSheet } from "@/screens/flow/MembersSheet";
import { MoveSheet } from "@/screens/flow/MoveSheet";
import { ProjectSheet } from "@/screens/flow/ProjectSheet";
import { SprintsSheet, sprintLabel } from "@/screens/flow/SprintsSheet";
import { activeFilters, canDeleteCard, COLUMN_COLORS, colorHex, columnCards, matches, NO_FILTER, powersOf, roleIn, type BoardFilter, type BoardSort } from "@/screens/flow/logic";
import { EmptyState, FilterChip, FLOW_COLOR, Swatches } from "@/screens/flow/parts";
import { useAsk } from "@/screens/flow/useAsk";
import { useCreateCard, useDeleteCard, useMoveCard, useReorderCards, useUpdateColumn } from "@/screens/flow/useFlowMutations";

/** At this width and above, columns stand side by side (a tablet, a phone in landscape). */
const SIDE_BY_SIDE = 700;
const TABLET_COLUMN = 300;
const COLUMN_GAP = 10;

export default function BoardScreen() {
  const params = useLocalSearchParams<{ id?: string; sprint?: string }>();
  const projectId = Number(params.id);
  if (!Number.isInteger(projectId) || projectId <= 0) return <BadLink />;
  return <Board projectId={projectId} initialScope={scopeFromParam(params.sprint)} />;
}

function scopeFromParam(v: string | undefined): SprintScope {
  if (v && /^\d+$/.test(v)) return Number(v);
  return v === "backlog" ? "backlog" : "all";
}

function BadLink() {
  const { t } = useTranslation();
  return (
    <Screen measure header={<AppHeader app="flow" back />}>
      <EmptyState testID="flow-board-bad-link" icon={Kanban} title={t("flow.board.notFound")} />
    </Screen>
  );
}

function Board({ projectId, initialScope }: { projectId: number; initialScope: SprintScope }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const me = useMe();
  const { width } = useWindowDimensions();
  const today = todayKey();
  const [scope, setScope] = useState<SprintScope>(initialScope);
  const [filter, setFilter] = useState<BoardFilter>(NO_FILTER);
  const [sort, setSort] = useState<BoardSort>("manual");
  const [searching, setSearching] = useState(false);
  const [sheet, setSheet] = useState<"sprints" | "filter" | "members" | "edit" | "menu" | null>(null);
  const [cardMenu, setCardMenu] = useState<Card | null>(null);
  const [moving, setMoving] = useState<Card | null>(null);
  const [columnMenu, setColumnMenu] = useState<Column | null>(null);
  const [coloring, setColoring] = useState<Column | null>(null);
  const [reorderingColumn, setReorderingColumn] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pager = useRef<FlatList<Column>>(null);
  const fail = (fallback: string) => (e: unknown) => setFailure(failureMessage(e, fallback));
  const ask = useAsk();

  const board = useInfiniteQuery({
    queryKey: flowKeys.board(projectId, scope),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => flowApi.board(projectId, scope, pageParam),
    getNextPageParam: (last) => last.paging.nextPage ?? undefined,
  });
  // The rest of the board, page after page, as soon as each lands.
  useEffect(() => {
    if (board.hasNextPage && !board.isFetchingNextPage && !board.error) void board.fetchNextPage();
  }, [board.hasNextPage, board.isFetchingNextPage, board.error, board]);

  const first = board.data?.pages[0];
  const project: Project | undefined = first?.project;
  const columns = useMemo(() => [...(first?.columns ?? [])].sort((a, b) => a.position - b.position), [first?.columns]);
  const fields = first?.fields ?? [];
  const people = first?.people ?? [];
  const tagsByCategory = first?.tagsByCategory ?? {};
  const sprints = first?.sprints ?? [];
  const cards = useMemo(() => board.data?.pages.flatMap((p) => p.cards) ?? [], [board.data]);
  const unreadable = board.data?.pages.reduce((n, p) => n + p.unreadable, 0) ?? 0;
  const paged = first?.paging.paged ?? true;
  // An older server does not know "all" and answers the backlog: say so.
  const shownScope: SprintScope = scope === "all" && !paged ? "backlog" : scope;
  const role = project ? roleIn(project, me?.id) : "viewer";
  const powers = powersOf(role);
  const filtering = activeFilters(filter) > 0;
  // Reorder mode writes the column's MANUAL order: a sort or a filter turned on
  // while it is open would send the sorted order, or a subset, as the manual
  // one (review FL2). It closes, and is never drawn open, while either is on.
  const canReorder = sort === "manual" && !filtering;
  useEffect(() => {
    if (!canReorder) setReorderingColumn(null);
  }, [canReorder]);
  const tint = colorHex(project?.color) ?? FLOW_COLOR;

  const createCard = useCreateCard(projectId, { onError: (e) => fail(t("flow.board.addFailed"))(e) });
  const move = useMoveCard(projectId, { onError: fail(t("flow.board.moveFailed")) });
  const reorder = useReorderCards(projectId, { onError: fail(t("flow.board.moveFailed")) });
  const removeCard = useDeleteCard(projectId, { onError: fail(t("flow.card.deleteFailed")) });
  const updateColumn = useUpdateColumn(projectId, { onError: fail(t("flow.columns.failed")) });

  const side = width >= SIDE_BY_SIDE;
  const columnWidth = side ? TABLET_COLUMN : Math.min(width - metrics.space.lg * 2 - 28, 520);
  const step = columnWidth + COLUMN_GAP;

  const shown = (column: Column) => columnCards(cards, column.id, fields, sort).filter((c) => matches(c, filter, fields));
  const allIn = (column: Column) => cards.filter((c) => c.columnId === column.id);

  const jump = (index: number) => {
    setPage(index);
    pager.current?.scrollToOffset({ offset: index * step, animated: true });
  };

  const openCard = (card: Card) => router.push({ pathname: "/flow/card", params: { projectId: String(projectId), id: String(card.id) } });

  const moveTo = (card: Card, columnId: number, where: "top" | "bottom", sprintId?: number | null) => {
    const count = cards.filter((c) => c.columnId === columnId && c.id !== card.id).length;
    move.mutate({ card, toColumn: columnId, index: where === "top" ? 0 : count, sprintId, scope: shownScope });
    // The card goes where the board is not looking: follow it, as Jira does.
    const target = columns.findIndex((c) => c.id === columnId);
    if (target >= 0 && !side) jump(target);
  };

  const confirmDelete = (card: Card) =>
    Alert.alert(t("flow.card.deleteTitle", { title: card.title }), t("flow.card.deleteBody"), [
      { text: t("fields.cancel"), style: "cancel" },
      { text: t("flow.delete"), style: "destructive", onPress: () => removeCard.mutate(card) },
    ]);

  const cardActions = (card: Card): SheetAction[] => {
    const at = columns.findIndex((c) => c.id === card.columnId);
    const next = columns[at + 1];
    return [
      { key: "open", label: t("flow.card.open"), icon: Kanban, onPress: () => openCard(card) },
      ...(powers.editCards
        ? [
            { key: "move", label: t("flow.move.title"), icon: ArrowRightLeft, onPress: () => setTimeout(() => setMoving(card), 320) },
            ...(next ? [{ key: "next", label: t("flow.move.toNext", { column: next.title }), icon: ArrowRight, onPress: () => moveTo(card, next.id, "top") }] : []),
            ...(sort === "manual" && !filtering ? [{ key: "reorder", label: t("flow.reorder.column"), icon: GripVertical, onPress: () => setReorderingColumn(card.columnId) }] : []),
          ]
        : []),
      ...(canDeleteCard(role, me?.id, card) ? [{ key: "delete", label: t("flow.card.delete"), icon: Trash2, danger: true, onPress: () => confirmDelete(card) }] : []),
    ];
  };

  const columnActions = (column: Column): SheetAction[] => [
    ...(powers.editCards && sort === "manual" && !filtering ? [{ key: "reorder", label: t("flow.reorder.column"), icon: GripVertical, onPress: () => setReorderingColumn(column.id) }] : []),
    ...(powers.manage
      ? [
          { key: "color", label: t("flow.columns.color"), icon: Palette, onPress: () => setTimeout(() => setColoring(column), 320) },
          { key: "columns", label: t("flow.columns.title"), icon: Columns3, onPress: () => router.push({ pathname: "/flow/columns", params: { id: String(projectId) } }) },
        ]
      : []),
  ];

  const boardMenu: SheetAction[] = [
    { key: "members", label: powers.manage ? t("flow.members.manage") : t("flow.members.title"), icon: Users, onPress: () => setTimeout(() => setSheet("members"), 320) },
    ...(powers.manage
      ? [
          { key: "edit", label: t("flow.project.edit"), icon: Pencil, onPress: () => setTimeout(() => setSheet("edit"), 320) },
          { key: "fields", label: t("flow.fields.title"), icon: SlidersHorizontal, onPress: () => router.push({ pathname: "/flow/fields", params: { id: String(projectId) } }) },
          { key: "columns", label: t("flow.columns.title"), icon: Columns3, onPress: () => router.push({ pathname: "/flow/columns", params: { id: String(projectId) } }) },
        ]
      : []),
    // The app's rule: no screen opens a record it does not have; it asks the assistant instead.
    { key: "ask", label: t("flow.board.ask"), icon: Sparkles, onPress: () => ask(t("flow.board.askPrompt", { title: project?.title ?? "" })) },
  ];

  return (
    <Screen measure={false} header={<AppHeader app="flow" back title={project?.title ?? t("flow.title")} />}>
      {/* Edge to edge: `Screen` adds a 16 dp gutter and every row below adds
          its own, so without this the board had two (device, 2026-11-20): the
          next column's peek was gone, since `columnWidth` is measured from the
          whole window. The header is in `Screen`'s slot, full width. */}
      <View style={{ flex: 1, marginHorizontal: -metrics.space.lg }}>

      {/* The board's own row: sprint, search, filter, ⋯ */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingHorizontal: metrics.space.lg, paddingBottom: metrics.space.sm }}>
        <Pressable
          testID="flow-sprint-chip"
          onPress={() => setSheet("sprints")}
          disabled={!project}
          accessibilityRole="button"
          accessibilityLabel={t("flow.board.showing", { what: sprintLabel(shownScope, sprints, t) })}
          style={{ flexGrow: 1, flexShrink: 1, maxWidth: 360, marginRight: "auto", flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
        >
          <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
            {sprintLabel(shownScope, sprints, t)}
          </Text>
          <ChevronDown size={16} color={colors.inkMuted} />
        </Pressable>
        <IconButton testID="flow-board-search-toggle" label={searching ? t("flow.closeSearch") : t("flow.board.search")} onPress={() => {
            if (searching) setFilter({ ...filter, q: "" });
            setSearching(!searching);
          }}>
          {searching ? <X size={22} color={colors.ink} /> : <Search size={22} color={colors.ink} />}
        </IconButton>
        <View>
          <IconButton testID="flow-filter-button" label={t("flow.filter.button", { count: activeFilters(filter) - (filter.q.trim() ? 1 : 0) })} onPress={() => setSheet("filter")} disabled={!project}>
            <Filter size={21} color={filtering || sort !== "manual" ? colors.accent : colors.ink} />
          </IconButton>
          {activeFilters(filter) - (filter.q.trim() ? 1 : 0) > 0 ? (
            <View pointerEvents="none" style={{ position: "absolute", right: 4, top: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 10, lineHeight: 12, fontWeight: "700", color: colors.onAccent }}>{String(activeFilters(filter) - (filter.q.trim() ? 1 : 0))}</Text>
            </View>
          ) : null}
        </View>
        <IconButton testID="flow-board-menu" label={t("flow.board.options")} onPress={() => setSheet("menu")} disabled={!project}>
          <Ellipsis size={22} color={colors.ink} />
        </IconButton>
      </View>

      {searching ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, marginHorizontal: metrics.space.lg, marginBottom: metrics.space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, backgroundColor: colors.surface }}>
          <Search size={18} color={colors.inkMuted} />
          <TextInput
            testID="flow-board-search"
            value={filter.q}
            onChangeText={(q) => setFilter({ ...filter, q })}
            autoFocus
            placeholder={t("flow.board.searchPlaceholder")}
            placeholderTextColor={colors.inkMuted}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t("flow.board.search")}
            style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }}
          />
        </View>
      ) : null}

      <View style={{ paddingHorizontal: metrics.space.lg }}>
        <LoadFailure error={board.error} loadFailed={t("flow.board.loadFailed")} hasData={Boolean(board.data)} updatedAt={board.dataUpdatedAt} onRetry={() => void board.refetch()} testID="flow-board-failed" />
        {failure ? (
          <Pressable testID="flow-board-failure" onPress={() => setFailure(null)} accessibilityRole="button" accessibilityLabel={failure} accessibilityLiveRegion="polite" style={{ paddingBottom: metrics.space.sm }}>
            <Text tone="danger">{failure}</Text>
          </Pressable>
        ) : null}
        <UnreadableNotice count={unreadable} />
      </View>

      {/* Column chips: where each column is, and how many cards it holds. */}
      {columns.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: metrics.space.sm, paddingHorizontal: metrics.space.lg, paddingBottom: metrics.space.sm }} style={{ flexGrow: 0 }} testID="flow-column-chips">
          {columns.map((c, i) => (
            <FilterChip
              key={c.id}
              testID={`flow-chip-${c.position}`}
              label={`${c.title} ${filtering ? shown(c).length : allIn(c).length}`}
              dot={colorHex(c.color) ?? tint}
              active={!side && i === page}
              onPress={() => jump(i)}
            />
          ))}
        </ScrollView>
      ) : null}

      {board.isPending ? (
        <BoardSkeleton width={columnWidth} count={side ? Math.max(1, Math.floor(width / step)) : 1} />
      ) : first && columns.length === 0 ? (
        <EmptyState testID="flow-board-no-columns" icon={Columns3} title={t("flow.board.noColumns")} body={powers.manage ? t("flow.board.noColumnsBody") : undefined} />
      ) : (
        <FlatList
          ref={pager}
          testID="flow-board-pager"
          horizontal
          // Taps reach the quick add's "Add" with the keyboard up. Without
          // this the outer list took the first tap to close the keyboard and
          // the card was never sent (28-flow on qa_phone3, 2026-11-20).
          keyboardShouldPersistTaps="handled"
          data={columns}
          keyExtractor={(c) => String(c.id)}
          showsHorizontalScrollIndicator={false}
          snapToInterval={side ? undefined : step}
          decelerationRate="fast"
          disableIntervalMomentum
          getItemLayout={(_d, index) => ({ length: step, offset: step * index, index })}
          contentContainerStyle={{ paddingHorizontal: metrics.space.lg, paddingBottom: metrics.space.md }}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / step))}
          ItemSeparatorComponent={() => <View style={{ width: COLUMN_GAP }} />}
          renderItem={({ item }) => (
            <BoardColumn
              column={item}
              cards={shown(item)}
              total={allIn(item).length}
              filtered={filtering}
              width={columnWidth}
              tint={tint}
              fields={fields}
              tagsByCategory={tagsByCategory}
              people={people}
              today={today}
              canEdit={powers.editCards}
              canManage={powers.manage}
              reordering={canReorder && reorderingColumn === item.id}
              refreshing={board.isRefetching && !board.isFetchingNextPage}
              onRefresh={() => void board.refetch()}
              onOpen={openCard}
              onCardMenu={setCardMenu}
              onColumnMenu={() => setColumnMenu(item)}
              onAdd={(title) => createCard.mutate({ title, columnId: item.id, sprintId: typeof shownScope === "number" ? shownScope : null })}
              onReorder={(ids) => reorder.mutate({ columnId: item.id, ids })}
              onDoneReordering={() => setReorderingColumn(null)}
            />
          )}
        />
      )}
      {board.isFetchingNextPage ? (
        <View style={{ position: "absolute", bottom: metrics.space.lg, alignSelf: "center", flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: metrics.space.md, paddingVertical: 6, borderRadius: metrics.radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.inkMuted} />
          <Text variant="caption" tone="muted">
            {t("flow.board.loadingMore", { loaded: cards.length, total: board.data?.pages[board.data.pages.length - 1]?.paging.total ?? cards.length })}
          </Text>
        </View>
      ) : null}

      {sheet === "sprints" && project ? <SprintsSheet projectId={projectId} sprints={sprints} scope={shownScope} canAll={paged} manage={powers.manage} onScope={setScope} onClose={() => setSheet(null)} /> : null}
      {sheet === "filter" ? <FilterSheet filter={filter} sort={sort} fields={fields} people={people} tagsByCategory={tagsByCategory} meId={me?.id} onChange={setFilter} onSort={setSort} onClose={() => setSheet(null)} /> : null}
      {sheet === "members" && project ? <MembersSheet project={project} onClose={() => setSheet(null)} /> : null}
      {sheet === "edit" && project ? <ProjectSheet project={project} onClose={() => setSheet(null)} /> : null}
      <ActionSheet open={sheet === "menu"} title={project?.title ?? ""} actions={boardMenu} onClose={() => setSheet(null)} testID="flow-board-options" />
      <ActionSheet open={cardMenu != null} title={cardMenu?.title ?? ""} actions={cardMenu ? cardActions(cardMenu) : []} onClose={() => setCardMenu(null)} testID="flow-card-menu" />
      <ActionSheet open={columnMenu != null} title={columnMenu?.title ?? ""} actions={columnMenu ? columnActions(columnMenu) : []} onClose={() => setColumnMenu(null)} testID="flow-column-menu" />
      {moving ? <MoveSheet card={moving} columns={columns} sprints={sprints} onClose={() => setMoving(null)} onMove={(to) => moveTo(moving, to.columnId, to.where, to.sprintId)} /> : null}
      {coloring ? (
        <BottomSheet open title={t("flow.columns.color")} subtitle={coloring.title} onClose={() => setColoring(null)} testID="flow-column-color">
          <Swatches
            testID="flow-column-swatch"
            none
            colors={COLUMN_COLORS.map((hex) => ({ key: hex, hex }))}
            value={coloring.color}
            labelOf={(hex) => t("flow.color.swatch", { n: COLUMN_COLORS.indexOf(hex as (typeof COLUMN_COLORS)[number]) + 1 })}
            onPick={(color) => {
              updateColumn.mutate({ columnId: coloring.id, input: { color } });
              setColoring(null);
            }}
          />
        </BottomSheet>
      ) : null}
      </View>
    </Screen>
  );
}

function IconButton({ label, onPress, children, testID, disabled = false }: { label: string; onPress: () => void; children: ReactNode; testID: string; disabled?: boolean }) {
  const metrics = useMetrics();
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={{ width: metrics.touch - 4, height: metrics.touch - 4, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}>
      {children}
    </Pressable>
  );
}

function BoardSkeleton({ width, count }: { width: number; count: number }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View testID="flow-board-loading" style={{ flexDirection: "row", gap: COLUMN_GAP, paddingHorizontal: metrics.space.lg }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width, gap: 8, padding: metrics.space.sm, borderRadius: metrics.radius.lg, backgroundColor: colors.surface }}>
          <View style={{ height: 20, width: "50%", borderRadius: 6, backgroundColor: colors.border }} />
          {[0, 1, 2].map((r) => (
            <View key={r} style={{ height: 96, borderRadius: metrics.radius.md, backgroundColor: colors.border, opacity: 0.6 }} />
          ))}
        </View>
      ))}
    </View>
  );
}
