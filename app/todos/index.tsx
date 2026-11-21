/**
 * TODO — the app's front page (`docs/design/todos/SPEC.md` §D.1-2).
 *
 * Three cards for what is due across every list (Today, Upcoming, Overdue;
 * Asana 02), then the lists, newest first, the way the server pages them
 * (`updated_at desc`, 20 a page: a list just made or touched is on top). Each
 * list shows a progress ring, "3 of 5" and its next three tasks, which can be
 * ticked from here as on the web's cards (`GroupCard.tsx`).
 *
 * Search looks in list names and in tasks (titles, notes) at once: the web
 * searches names only here, and tasks only from its global search.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useNav } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { todoKeys } from "@/api/keys";
import { todoGroupsApi, todosApi, type Todo, type TodoGroup } from "@/api/todos";
import { CalendarClock, ChevronRight, CircleAlert, LayoutTemplate, ListChecks, Plus, Search, Sun, X, type LucideIcon } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { UnreadableNotice } from "@/components/UnreadableNotice";
import { UndoToast } from "@/components/UndoToast";
import { useColors, useMetrics } from "@/hooks/useColors";
import { AppHeader } from "@/components/shell/AppHeader";
import { APP_COLORS } from "@/theme/appColors";
import { NameDialog } from "@/screens/pages/ItemSheet";
import { todayKey } from "@/screens/calendar/dates";
import { dueCounts, type DueView } from "@/screens/todos/due";
import { TaskRow, TodoCheck } from "@/screens/todos/TaskRow";
import { ProgressRing } from "@/screens/todos/ProgressRing";
import { useCreateList, useDeleteTask, useToggleTask, useUndoDeleteTask } from "@/screens/todos/useTodoMutations";
import { useTodoUndo } from "@/stores/todoUndo.store";

const SEARCH_DELAY_MS = 300;

export default function TodosScreen() {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const today = todayKey();
  const [searching, setSearching] = useState(false);
  const [typed, setTyped] = useState("");
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const offer = useTodoUndo((s) => s.offer);
  const clearOffer = useTodoUndo((s) => s.clear);

  useEffect(() => {
    const id = setTimeout(() => setTerm(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [typed]);

  const lists = useInfiniteQuery({
    queryKey: todoKeys.listSearch(term),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => todoGroupsApi.list({ page: pageParam, search: term }),
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
  const pending = useQuery({ queryKey: todoKeys.pending(), queryFn: todosApi.pending });
  const taskHits = useQuery({ queryKey: todoKeys.taskSearch(term), queryFn: () => todosApi.search(term), enabled: term.length > 0 });

  const rows = lists.data?.pages.flatMap((p) => p.rows) ?? [];
  const unreadable = lists.data?.pages.reduce((n, p) => n + p.unreadable, 0) ?? 0;
  const counts = dueCounts(pending.data ?? [], today);
  const create = useCreateList({
    onDone: (group) => router.push({ pathname: "/todos/list", params: { id: String(group.id) } }),
    onError: () => setFailure(t("todos.failed")),
  });

  const header = (
    <View style={{ gap: metrics.space.lg, paddingBottom: metrics.space.md }}>
      {term ? null : (
        <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
          <DueCard view="today" icon={Sun} count={counts.today} loading={pending.isPending} />
          <DueCard view="upcoming" icon={CalendarClock} count={counts.upcoming} loading={pending.isPending} />
          <DueCard view="overdue" icon={CircleAlert} count={counts.overdue} loading={pending.isPending} alert={counts.overdue > 0} />
        </View>
      )}
      {term && taskHits.data && taskHits.data.length > 0 ? (
        <TaskHits tasks={taskHits.data} lists={rows} today={today} />
      ) : null}
      <Text variant="label" tone="muted" accessibilityRole="header" testID="todos-lists-heading">
        {term ? t("todos.matchingLists") : t("todos.myLists")}
      </Text>
    </View>
  );

  return (
    <Screen measure header={<AppHeader app="todos" />}>
      {/* The app's own row, under the shared header: search and templates. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: metrics.space.sm, paddingVertical: metrics.space.xs }}>
        <Pressable
          testID="todos-search-toggle"
          onPress={() => {
            setSearching((s) => !s);
            setTyped("");
          }}
          accessibilityRole="button"
          accessibilityLabel={searching ? t("todos.closeSearch") : t("todos.search")}
          style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
        >
          {searching ? <X size={22} color={colors.ink} /> : <Search size={22} color={colors.ink} />}
        </Pressable>
        <Pressable testID="todos-templates" onPress={() => router.push("/todos/templates")} accessibilityRole="button" accessibilityLabel={t("todos.templates")} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
          <LayoutTemplate size={22} color={colors.ink} />
        </Pressable>
      </View>

      {searching ? (
        <Animated.View entering={FadeInDown.duration(180)} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, marginBottom: metrics.space.md }}>
          <Search size={18} color={colors.inkMuted} />
          <TextInput
            testID="todos-search"
            value={typed}
            onChangeText={setTyped}
            autoFocus
            placeholder={t("todos.searchPlaceholder")}
            placeholderTextColor={colors.inkMuted}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t("todos.search")}
            style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }}
          />
        </Animated.View>
      ) : null}

      <LoadFailure error={lists.error} loadFailed={t("todos.loadFailed")} hasData={Boolean(lists.data)} updatedAt={lists.dataUpdatedAt} onRetry={() => void lists.refetch()} testID="todos-load-failed" />
      {failure ? (
        <Pressable testID="todos-failure" onPress={() => setFailure(null)} accessibilityRole="button" accessibilityLabel={failure} accessibilityLiveRegion="polite">
          <Text tone="danger">{failure}</Text>
        </Pressable>
      ) : null}
      <UnreadableNotice count={unreadable} />

      <FlatList
        testID="todos-lists"
        data={rows}
        keyExtractor={(g) => String(g.id)}
        ListHeaderComponent={header}
        ListEmptyComponent={lists.isPending && !lists.error ? <RowsSkeleton rows={5} testID="todos-loading" /> : lists.data ? <Empty searching={Boolean(term)} hits={taskHits.data?.length ?? 0} onCreate={() => setCreating(true)} /> : null}
        ListFooterComponent={lists.isFetchingNextPage ? <ActivityIndicator /> : null}
        onEndReached={() => {
          if (lists.hasNextPage && !lists.isFetchingNextPage) void lists.fetchNextPage();
        }}
        renderItem={({ item }) => <ListRow group={item} today={today} />}
        ItemSeparatorComponent={() => <View style={{ height: metrics.space.sm }} />}
        refreshControl={
          <RefreshControl
            refreshing={lists.isRefetching && !lists.isFetchingNextPage}
            onRefresh={() => {
              void lists.refetch();
              void pending.refetch();
            }}
            tintColor={colors.inkMuted}
          />
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 96 }}
      />

      <Pressable
        testID="todos-new-list"
        onPress={() => setCreating(true)}
        accessibilityRole="button"
        accessibilityLabel={t("todos.newList")}
        style={{ position: "absolute", right: metrics.space.lg, bottom: metrics.space.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: APP_COLORS.todos, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
      >
        <Plus size={26} color="#04161a" />
      </Pressable>

      <NameDialog
        open={creating}
        title={t("todos.newList")}
        confirm={t("todos.create")}
        busy={create.isPending}
        error={null}
        onCancel={() => setCreating(false)}
        onSubmit={(name) => {
          setCreating(false);
          create.mutate(name);
        }}
      />
      <UndoToast offer={offer} onDone={clearOffer} testID="todos-undo" />
    </Screen>
  );
}

function DueCard({ view, icon: Icon, count, loading, alert = false }: { view: DueView; icon: LucideIcon; count: number; loading: boolean; alert?: boolean }) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      testID={`todos-due-${view}`}
      onPress={() => router.push({ pathname: "/todos/due", params: { view } })}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={t("todos.dueCard", { view: t(`todos.views.${view}`), count })}
      style={{
        flex: 1,
        minHeight: 88,
        padding: metrics.space.md,
        gap: metrics.space.xs,
        borderRadius: metrics.radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: alert ? `${colors.danger}66` : colors.border,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      }}
    >
      <Icon size={20} color={alert ? colors.danger : colors.inkMuted} />
      <Text testID={`todos-due-${view}-count`} style={{ fontSize: 24, lineHeight: 28, fontWeight: "700", color: alert ? colors.danger : colors.ink }}>
        {loading ? "–" : String(count)}
      </Text>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {t(`todos.views.${view}`)}
      </Text>
    </Pressable>
  );
}

function ListRow({ group, today }: { group: TodoGroup; today: string }) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const toggle = useToggleTask(group.id);
  const [pressed, setPressed] = useState(false);
  const more = group.pendingCount - group.previewTodos.length;
  return (
    <View>
      <Pressable
        testID={`todos-list-${group.id}`}
        onPress={() => router.push({ pathname: "/todos/list", params: { id: String(group.id) } })}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        accessibilityRole="button"
        accessibilityLabel={t("todos.openList", { name: group.name, done: group.completedCount, total: group.todosCount })}
        style={{ padding: metrics.space.md, gap: metrics.space.sm, borderRadius: metrics.radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md }}>
          <ProgressRing done={group.completedCount} total={group.todosCount} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontWeight: "600" }}>
              {group.name}
            </Text>
            <Text variant="caption" tone="muted">
              {group.todosCount === 0 ? t("todos.noTasksYet") : t("todos.progress", { done: group.completedCount, total: group.todosCount })}
            </Text>
          </View>
          {group.todosCount > 0 && group.completedCount === group.todosCount ? (
            // The web's card says "All done" once every task is ticked (`GroupCard.tsx:89-97`).
            <View testID={`todos-list-${group.id}-done`} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: metrics.radius.pill, backgroundColor: `${colors.accent}1f` }}>
              <Text variant="caption" style={{ color: colors.accent }}>
                {t("todos.allDoneTitle")}
              </Text>
            </View>
          ) : null}
          {group.overdueCount > 0 ? (
            <View testID={`todos-list-${group.id}-overdue`} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: metrics.radius.pill, backgroundColor: `${colors.danger}1f` }}>
              <Text variant="caption" tone="danger">
                {t("todos.overdueCount", { count: group.overdueCount })}
              </Text>
            </View>
          ) : null}
          <ChevronRight size={18} color={colors.inkMuted} />
        </View>
        {group.previewTodos.map((todo) => (
          <View key={todo.id} style={{ flexDirection: "row", alignItems: "center", marginLeft: -6, marginVertical: -6 }}>
            <TodoCheck done={todo.completed} onPress={() => toggle.mutate(todo)} label={t("todos.markDone", { title: todo.title })} testID={`todos-preview-check-${todo.id}`} />
            <Text numberOfLines={1} style={{ flex: 1 }} tone={todo.overdue && todo.dueDate && todo.dueDate < today ? "danger" : "default"}>
              {todo.title}
            </Text>
          </View>
        ))}
        {more > 0 ? (
          <Text variant="caption" tone="muted" style={{ marginLeft: 38 }}>
            {t("todos.more", { count: more })}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

function TaskHits({ tasks, lists, today }: { tasks: Todo[]; lists: TodoGroup[]; today: string }) {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const name = useCallback((id: number) => lists.find((g) => g.id === id)?.name, [lists]);
  return (
    <View testID="todos-task-hits" style={{ gap: metrics.space.xs }}>
      <Text variant="label" tone="muted" accessibilityRole="header">
        {t("todos.matchingTasks")}
      </Text>
      {tasks.slice(0, 20).map((todo) => (
        <HitRow key={todo.id} todo={todo} listName={name(todo.todoGroupId)} today={today} />
      ))}
    </View>
  );
}

function HitRow({ todo, listName, today }: { todo: Todo; listName?: string; today: string }) {
  const router = useNav();
  const { t } = useTranslation();
  const toggle = useToggleTask(todo.todoGroupId);
  const remove = useDeleteTask(todo.todoGroupId);
  const undo = useUndoDeleteTask(todo.todoGroupId);
  const offerUndo = useTodoUndo((s) => s.offerUndo);
  const openIt = () => router.push({ pathname: "/todos/list", params: { id: String(todo.todoGroupId), task: String(todo.id) } });
  return (
    <TaskRow
      todo={todo}
      today={today}
      listName={listName}
      onToggle={() => toggle.mutate(todo)}
      onOpen={openIt}
      onDelete={() => {
        remove.mutate(todo);
        offerUndo(t("todos.taskDeleted"), () => undo.mutate({ todo, index: Math.max(0, todo.position - 1) }));
      }}
    />
  );
}

function Empty({ searching, hits, onCreate }: { searching: boolean; hits: number; onCreate: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  if (searching && hits > 0) return null;
  return (
    <Animated.View entering={FadeInDown.duration(260)} testID="todos-empty" style={{ alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.xl, paddingHorizontal: metrics.space.lg }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: `${APP_COLORS.todos}2e`, alignItems: "center", justifyContent: "center", marginBottom: metrics.space.sm }}>
        {searching ? <Search size={40} color={colors.ink} /> : <ListChecks size={40} color={colors.ink} />}
      </View>
      <Text variant="title" style={{ textAlign: "center", fontSize: 20 }} testID="todos-empty-title">
        {searching ? t("todos.noMatch") : t("todos.emptyTitle")}
      </Text>
      {searching ? null : (
        <>
          <Text tone="muted" style={{ textAlign: "center" }}>
            {t("todos.emptyBody")}
          </Text>
          <Pressable testID="todos-empty-create" onPress={onCreate} accessibilityRole="button" style={{ marginTop: metrics.space.sm, minHeight: 44, paddingHorizontal: metrics.space.lg, borderRadius: metrics.radius.pill, backgroundColor: APP_COLORS.todos, alignItems: "center", justifyContent: "center" }}>
            <Text variant="label" style={{ color: "#04161a" }}>
              {t("todos.newList")}
            </Text>
          </Pressable>
        </>
      )}
    </Animated.View>
  );
}
