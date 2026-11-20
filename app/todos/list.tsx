/**
 * One todo list (`docs/design/todos/SPEC.md` §D.3; Amie 04/05, Todoist 06).
 *
 * The name (in the shared header; rename from ⋯), a progress bar, the open tasks in the list's own
 * order, the done ones folded under "Done (n)", and the quick-add bar pinned
 * at the bottom. A tapped task opens its sheet. ⋯ holds the list's actions,
 * as the web's toolbar does (`GroupDrawer.tsx`).
 *
 * A task ticked here stays in place for a moment before it folds away, so a
 * wrong tap can be seen and undone where it happened.
 *
 * `?task=` (a search hit, `/todos?group=&task=` on the web) highlights that
 * task and opens it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { todoKeys } from "@/api/keys";
import { todoGroupsApi, type Todo } from "@/api/todos";
import { ArrowUpDown, ChevronDown, ChevronRight, Copy, Eraser, LayoutTemplate, ListChecks, MoreVertical, Pencil, RotateCcw, Trash2 } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { UndoToast } from "@/components/UndoToast";
import { useColors, useMetrics } from "@/hooks/useColors";
import { APP_COLORS } from "@/theme/appColors";
import { ActionSheet } from "@/screens/contacts/ActionSheet";
import { NameDialog } from "@/screens/pages/ItemSheet";
import { todayKey } from "@/screens/calendar/dates";
import { TaskRow } from "@/screens/todos/TaskRow";
import { TaskSheet } from "@/screens/todos/TaskSheet";
import { QuickAdd } from "@/screens/todos/QuickAdd";
import { DragList } from "@/screens/todos/DragList";
import { useTodoUndo } from "@/stores/todoUndo.store";
import { useReminderSync } from "@/screens/todos/useReminderSync";
import {
  useAddTask,
  useClearCompleted,
  useDeleteList,
  useDeleteTask,
  useDuplicateList,
  useMoveTask,
  useRenameList,
  useReorderTasks,
  useResetList,
  useSaveAsTemplate,
  useToggleTask,
  useUndoDeleteTask,
  useUpdateTask,
} from "@/screens/todos/useTodoMutations";

/** How long a just-ticked task stays among the open ones. */
const LINGER_MS = 600;

type Item = { kind: "task"; todo: Todo } | { kind: "doneHeader"; count: number } | { kind: "allDone" };

export default function TodoListScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string; task?: string }>();
  const groupId = Number(params.id);
  const focusTask = Number(params.task) || null;
  const today = todayKey();

  const query = useQuery({ queryKey: todoKeys.group(groupId), queryFn: () => todoGroupsApi.show(groupId), enabled: Number.isFinite(groupId) });
  const group = query.data;
  const todos = useMemo(() => group?.todos ?? [], [group]);

  const [openId, setOpenId] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [lingering, setLingering] = useState<number[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const offer = useTodoUndo((s) => s.offer);
  const offerUndo = useTodoUndo((s) => s.offerUndo);
  const clearOffer = useTodoUndo((s) => s.clear);
  const focused = useRef(false);
  const syncReminders = useReminderSync();
  /** A write that can change what this phone should ring for. */
  const afterReminderChange = (todo: Todo, ask = false) => ({ onSettled: () => (todo.remindAt || ask ? syncReminders({ ask }) : undefined) });

  const onError = useCallback(() => setFailure(t("todos.failed")), [t]);
  const toggle = useToggleTask(groupId, { onError });
  const add = useAddTask(groupId, { onError });
  const update = useUpdateTask(groupId, { onError });
  const remove = useDeleteTask(groupId, { onError });
  const undoDelete = useUndoDeleteTask(groupId, { onError });
  const move = useMoveTask(groupId, { onError });
  const reorder = useReorderTasks(groupId, { onError });
  const rename = useRenameList(groupId, { onError });
  const clearDone = useClearCompleted(groupId, { onError });
  const reset = useResetList(groupId, { onError });
  const removeList = useDeleteList(groupId, { onError, onDone: () => (router.canGoBack() ? router.back() : router.replace("/todos")) });
  const duplicate = useDuplicateList(groupId, { onError, onDone: (copy) => router.replace({ pathname: "/todos/list", params: { id: String(copy.id) } }) });
  const saveTemplate = useSaveAsTemplate(groupId, { onError, onDone: () => offerUndo(t("todos.savedAsTemplate")) });

  // A search hit: open that task once the list is here.
  useEffect(() => {
    if (focused.current || !focusTask || !todos.some((x) => x.id === focusTask)) return;
    focused.current = true;
    setOpenId(focusTask);
  }, [focusTask, todos]);

  const done = todos.filter((x) => x.completed);
  const open = todos.filter((x) => !x.completed || lingering.includes(x.id));
  const doneFolded = done.filter((x) => !lingering.includes(x.id));
  const pct = todos.length ? done.length / todos.length : 0;

  const onToggle = (todo: Todo) => {
    if (!todo.completed) {
      setLingering((l) => [...l, todo.id]);
      setTimeout(() => setLingering((l) => l.filter((id) => id !== todo.id)), LINGER_MS);
    }
    toggle.mutate(todo, afterReminderChange(todo));
  };
  const onDelete = (todo: Todo) => {
    const index = todos.findIndex((x) => x.id === todo.id);
    setOpenId(null);
    remove.mutate(todo, afterReminderChange(todo));
    offerUndo(t("todos.taskDeleted"), () => undoDelete.mutate({ todo, index }));
  };
  const confirmDeleteList = () => {
    if (!group) return;
    Alert.alert(t("todos.deleteListQuestion", { name: group.name }), t("todos.deleteListBody", { count: todos.length }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => removeList.mutate() },
    ]);
  };
  const confirmClear = () => {
    Alert.alert(t("todos.clearQuestion"), t("todos.clearBody", { count: done.length }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("todos.clear"), style: "destructive", onPress: () => clearDone.mutate() },
    ]);
  };

  const items: Item[] = [
    ...open.map((todo) => ({ kind: "task" as const, todo })),
    ...(todos.length > 0 && open.length === 0 ? [{ kind: "allDone" as const }] : []),
    ...(doneFolded.length ? [{ kind: "doneHeader" as const, count: doneFolded.length }] : []),
    ...(showDone ? doneFolded.map((todo) => ({ kind: "task" as const, todo })) : []),
  ];
  const opened = openId == null ? null : (todos.find((x) => x.id === openId) ?? null);
  const openIndex = opened ? todos.indexOf(opened) : -1;

  return (
    <Screen measure avoidKeyboard>
      <AppHeader app="todos" title={group?.name ?? t("todos.title")} back />
      {/* The list's own row, under the shared header: its actions. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: metrics.space.sm, paddingVertical: metrics.space.xs }}>
        {reordering ? (
          <Pressable testID="todo-reorder-done" onPress={() => setReordering(false)} accessibilityRole="button" accessibilityLabel={t("todos.reorderDone")} style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.sm }}>
            <Text variant="label" style={{ color: colors.accent }}>
              {t("todos.reorderDone")}
            </Text>
          </Pressable>
        ) : (
          <Pressable testID="todo-list-menu" onPress={() => setMenu(true)} disabled={!group} accessibilityRole="button" accessibilityLabel={t("todos.listActions")} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
            <MoreVertical size={22} color={colors.ink} />
          </Pressable>
        )}
      </View>

      {group && todos.length > 0 ? (
        <View testID="todo-progress" style={{ gap: metrics.space.xs, paddingBottom: metrics.space.md }}>
          <Text variant="caption" tone="muted">
            {t("todos.progress", { done: done.length, total: todos.length })}
          </Text>
          <ProgressBar pct={pct} />
        </View>
      ) : null}

      <LoadFailure error={query.error} loadFailed={t("todos.loadFailed")} hasData={Boolean(group)} updatedAt={query.dataUpdatedAt} onRetry={() => void query.refetch()} testID="todo-list-load-failed" />
      {failure ? (
        <Pressable testID="todo-failure" onPress={() => setFailure(null)} accessibilityLiveRegion="polite" accessibilityRole="button" accessibilityLabel={failure} style={{ paddingVertical: metrics.space.sm }}>
          <Text tone="danger">{failure}</Text>
        </Pressable>
      ) : null}
      {query.isPending && !query.error ? <RowsSkeleton rows={6} testID="todo-list-loading" /> : null}

      {reordering ? (
        <Animated.ScrollView scrollEnabled={!dragging} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: metrics.space.xl }}>
          <Text variant="caption" tone="muted" style={{ paddingBottom: metrics.space.sm }}>
            {t("todos.reorderHint")}
          </Text>
          <DragList todos={todos.filter((x) => !x.completed)} onDragging={setDragging} onReorder={(order) => reorder.mutate([...order, ...done.map((x) => x.id)])} />
        </Animated.ScrollView>
      ) : (
        <FlatList
          testID="todo-tasks"
          // NO layout animation on the rows, on purpose. Per-row `layout` /
          // `exiting` left a ghost gap and the Done header over a task, and
          // `itemLayoutAnimation` left a row ON TOP of another after Done was
          // folded, so a swipe on Bread ticked Coffee (Todo QA, 2026-11-16,
          // both on the device, neither visible to jest). Rows still fade in.
          style={{ flex: 1 }}
          data={group ? items : []}
          keyExtractor={(item) => (item.kind === "task" ? `t${item.todo.id}` : item.kind)}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.inkMuted} />}
          ListEmptyComponent={group ? <EmptyList /> : null}
          contentContainerStyle={{ paddingBottom: metrics.space.xl }}
          renderItem={({ item, index }) => {
            if (item.kind === "allDone") return <AllDone />;
            if (item.kind === "doneHeader") {
              return (
                <Pressable
                  testID="todo-done-toggle"
                  onPress={() => setShowDone((s) => !s)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showDone }}
                  accessibilityLabel={t("todos.doneCount", { count: item.count })}
                  style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch, marginTop: metrics.space.sm }}
                >
                  {showDone ? <ChevronDown size={18} color={colors.inkMuted} /> : <ChevronRight size={18} color={colors.inkMuted} />}
                  <Text variant="label" tone="muted">
                    {t("todos.doneCount", { count: item.count })}
                  </Text>
                </Pressable>
              );
            }
            return (
              <View>
                <TaskRow
                  todo={item.todo}
                  today={today}
                  highlighted={item.todo.id === focusTask}
                  onToggle={() => onToggle(item.todo)}
                  onOpen={() => setOpenId(item.todo.id)}
                  onDelete={() => onDelete(item.todo)}
                />
              </View>
            );
          }}
        />
      )}

      {group && !reordering ? <QuickAdd today={today} autoFocus={todos.length === 0} onAdd={(input) => add.mutate(input)} /> : null}

      <TaskSheet
        todo={opened}
        listName={group?.name ?? ""}
        today={today}
        canMoveUp={openIndex > 0 && !opened?.completed}
        canMoveDown={openIndex >= 0 && openIndex < todos.length - 1 && !todos[openIndex + 1]?.completed}
        onUpdate={(todo, input) => update.mutate({ todo, input }, "remindAt" in input ? afterReminderChange(todo, input.remindAt != null) : undefined)}
        onToggle={onToggle}
        onMove={(todo, by) => move.mutate({ todoId: todo.id, by })}
        onDelete={onDelete}
        onClose={() => setOpenId(null)}
      />

      <ActionSheet
        open={menu}
        title={group?.name ?? ""}
        subtitle={t("todos.progress", { done: done.length, total: todos.length })}
        onClose={() => setMenu(false)}
        testID="todo-list-actions"
        actions={[
          { key: "rename", label: t("todos.rename"), icon: Pencil, onPress: () => { setMenu(false); setRenaming(true); } },
          { key: "reorder", label: t("todos.reorder"), icon: ArrowUpDown, disabled: open.length < 2, onPress: () => { setMenu(false); setReordering(true); } },
          { key: "reset", label: t("todos.uncheckAll"), icon: RotateCcw, disabled: done.length === 0, onPress: () => { setMenu(false); reset.mutate(); } },
          { key: "clear", label: t("todos.clearCompleted"), icon: Eraser, disabled: done.length === 0, onPress: () => { setMenu(false); confirmClear(); } },
          { key: "duplicate", label: t("todos.duplicate"), icon: Copy, onPress: () => { setMenu(false); duplicate.mutate(); } },
          { key: "template", label: t("todos.saveAsTemplate"), icon: LayoutTemplate, onPress: () => { setMenu(false); saveTemplate.mutate(); } },
          { key: "delete", label: t("todos.deleteList"), icon: Trash2, danger: true, onPress: () => { setMenu(false); confirmDeleteList(); } },
        ]}
      />

      <NameDialog
        open={renaming}
        title={t("todos.rename")}
        confirm={t("common.save")}
        initial={group?.name ?? ""}
        busy={false}
        error={null}
        onCancel={() => setRenaming(false)}
        onSubmit={(name) => {
          setRenaming(false);
          if (name !== group?.name) rename.mutate(name);
        }}
      />

      <UndoToast offer={offer} onDone={clearOffer} testID="todo-undo" bottom={72} />
    </Screen>
  );
}

/**
 * The list's progress, eased to its new width. A `layout` transition on a
 * percentage width stayed at the old width on the device ("2 of 2 done" at
 * two thirds, Todo QA 2026-11-16), so the width itself is animated.
 */
function ProgressBar({ pct }: { pct: number }) {
  const colors = useColors();
  const width = useSharedValue(pct);
  useEffect(() => {
    width.value = withTiming(pct, { duration: 300 });
  }, [pct, width]);
  const style = useAnimatedStyle(() => ({ width: `${Math.round(width.value * 100)}%` }));
  return (
    <View testID="todo-progress-bar" style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface, overflow: "hidden" }}>
      <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: APP_COLORS.todos }, style]} />
    </View>
  );
}

function EmptyList() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <Animated.View entering={FadeIn.duration(260)} testID="todo-list-empty" style={{ alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.xl * 1.5 }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: `${APP_COLORS.todos}2e`, alignItems: "center", justifyContent: "center" }}>
        <ListChecks size={40} color={colors.ink} />
      </View>
      <Text variant="title" style={{ fontSize: 20, textAlign: "center" }}>
        {t("todos.emptyListTitle")}
      </Text>
      <Text tone="muted" style={{ textAlign: "center" }}>
        {t("todos.emptyListBody")}
      </Text>
    </Animated.View>
  );
}

function AllDone() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <Animated.View entering={FadeIn.duration(300)} testID="todo-all-done" style={{ alignItems: "center", gap: metrics.space.xs, paddingVertical: metrics.space.xl }}>
      <Text variant="title" style={{ fontSize: 20 }}>
        {t("todos.allDoneTitle")}
      </Text>
      <Text tone="muted">{t("todos.allDoneBody")}</Text>
    </Animated.View>
  );
}
