/**
 * Today / Upcoming / Overdue across every list (SPEC B5; Todoist 14, Tiimo
 * 15). Read from `GET todos?completed=false`, grouped on the phone
 * (`src/screens/todos/due.ts`): Today shows what is overdue first, then
 * today; Upcoming one section per day; Overdue only the past. Each task names
 * its list, and ticks, swipes and opens as it does inside the list.
 */
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, SectionList, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQueries, useQuery, type InfiniteData } from "@tanstack/react-query";
import { todoKeys } from "@/api/keys";
import { todoGroupsApi, todosApi, type Todo, type TodoGroup, type TodoGroupsPage } from "@/api/todos";
import { ListChecks } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { UndoToast } from "@/components/UndoToast";
import { useColors, useMetrics } from "@/hooks/useColors";
import { APP_COLORS } from "@/theme/appColors";
import { formatDay, todayKey } from "@/screens/calendar/dates";
import { DUE_VIEWS, dueLabel, dueSections, type DueView } from "@/screens/todos/due";
import { TaskRow } from "@/screens/todos/TaskRow";
import { TaskSheet } from "@/screens/todos/TaskSheet";
import { useDeleteTask, useToggleTask, useUndoDeleteTask, useUpdateTask } from "@/screens/todos/useTodoMutations";
import { useTodoUndo } from "@/stores/todoUndo.store";
import { useReminderSync } from "@/screens/todos/useReminderSync";
import { useQueryClient } from "@tanstack/react-query";

export default function DueScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<DueView>(DUE_VIEWS.find((v) => v === params.view) ?? "today");
  const [openId, setOpenId] = useState<number | null>(null);
  const today = todayKey();
  const client = useQueryClient();
  const offer = useTodoUndo((s) => s.offer);
  const clearOffer = useTodoUndo((s) => s.clear);

  const pending = useQuery({ queryKey: todoKeys.pending(), queryFn: todosApi.pending });
  const tasks = useMemo(() => pending.data ?? [], [pending.data]);

  // Each task names its list: from the lists already loaded, else its own.
  const known = useMemo(() => {
    const names = new Map<number, string>();
    for (const [, data] of client.getQueriesData<InfiniteData<TodoGroupsPage>>({ queryKey: todoKeys.lists() })) {
      for (const page of data?.pages ?? []) for (const g of page.rows) names.set(g.id, g.name);
    }
    return names;
    // Re-read when the tasks change (a list renamed elsewhere refetches them).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, tasks]);
  const missing = [...new Set(tasks.map((x) => x.todoGroupId))].filter((id) => !known.has(id));
  const groups = useQueries({ queries: missing.map((id) => ({ queryKey: todoKeys.group(id), queryFn: () => todoGroupsApi.show(id) })) });
  const listName = (id: number) => known.get(id) ?? groups.find((q) => (q.data as TodoGroup | undefined)?.id === id)?.data?.name ?? "";

  const sections = dueSections(tasks, view, today).map((s) => ({
    key: s.key,
    title:
      s.key === "overdue"
        ? t("todos.views.overdue")
        : `${dueLabel(s.key, today, i18n.language, t)}${s.key === today || s.key === "overdue" ? "" : ` · ${formatDay(s.key, i18n.language)}`}`,
    data: s.tasks,
  }));
  const opened = openId == null ? null : (tasks.find((x) => x.id === openId) ?? null);

  return (
    <Screen measure>
      <AppHeader app="todos" title={t(`todos.views.${view}`)} back />

      <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: metrics.radius.md, padding: metrics.space.xs, marginTop: metrics.space.md, marginBottom: metrics.space.md }}>
        {DUE_VIEWS.map((v) => {
          const on = v === view;
          return (
            <Pressable
              key={v}
              testID={`todo-due-tab-${v}`}
              onPress={() => setView(v)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: metrics.radius.sm, backgroundColor: on ? APP_COLORS.todos : "transparent" }}
            >
              <Text variant="label" style={{ color: on ? "#04161a" : colors.ink }} numberOfLines={1}>
                {t(`todos.views.${v}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <LoadFailure error={pending.error} loadFailed={t("todos.loadFailed")} hasData={Boolean(pending.data)} updatedAt={pending.dataUpdatedAt} onRetry={() => void pending.refetch()} testID="todo-due-load-failed" />
      {pending.isPending && !pending.error ? <RowsSkeleton rows={6} testID="todo-due-loading" /> : null}

      <SectionList
        testID="todo-due-list"
        sections={pending.data ? sections : []}
        keyExtractor={(x) => String(x.id)}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={pending.isRefetching} onRefresh={() => void pending.refetch()} tintColor={colors.inkMuted} />}
        renderSectionHeader={({ section }) => (
          <Text
            variant="label"
            accessibilityRole="header"
            testID={`todo-due-section-${section.key}`}
            style={{ paddingTop: metrics.space.md, paddingBottom: metrics.space.xs, color: section.key === "overdue" ? colors.danger : colors.inkMuted }}
          >
            {`${section.title.toLocaleUpperCase(i18n.language)}  ${section.data.length}`}
          </Text>
        )}
        renderItem={({ item, index }) => (
          <View>
            <DueRow todo={item} today={today} listName={listName(item.todoGroupId)} onOpen={() => setOpenId(item.id)} />
          </View>
        )}
        ListEmptyComponent={pending.data ? <Empty view={view} /> : null}
        contentContainerStyle={{ paddingBottom: metrics.space.xl }}
      />

      {opened ? <DueSheet todo={opened} listName={listName(opened.todoGroupId)} today={today} onClose={() => setOpenId(null)} /> : null}
      <UndoToast offer={offer} onDone={clearOffer} testID="todo-due-undo" />
    </Screen>
  );
}

/** A row with its own list's writes (each list is a separate set of caches). */
function DueRow({ todo, today, listName, onOpen }: { todo: Todo; today: string; listName: string; onOpen: () => void }) {
  const { t } = useTranslation();
  const toggle = useToggleTask(todo.todoGroupId);
  const remove = useDeleteTask(todo.todoGroupId);
  const undo = useUndoDeleteTask(todo.todoGroupId);
  const offerUndo = useTodoUndo((s) => s.offerUndo);
  return (
    <TaskRow
      todo={todo}
      today={today}
      listName={listName}
      onToggle={() => {
        toggle.mutate(todo);
        if (!todo.completed) offerUndo(t("todos.taskDone"), () => toggle.mutate({ ...todo, completed: true }));
      }}
      onOpen={onOpen}
      onDelete={() => {
        remove.mutate(todo);
        offerUndo(t("todos.taskDeleted"), () => undo.mutate({ todo, index: Math.max(0, todo.position - 1) }));
      }}
    />
  );
}

function DueSheet({ todo, listName, today, onClose }: { todo: Todo; listName: string; today: string; onClose: () => void }) {
  const { t } = useTranslation();
  const toggle = useToggleTask(todo.todoGroupId);
  const update = useUpdateTask(todo.todoGroupId);
  const remove = useDeleteTask(todo.todoGroupId);
  const undo = useUndoDeleteTask(todo.todoGroupId);
  const offerUndo = useTodoUndo((s) => s.offerUndo);
  const syncReminders = useReminderSync();
  return (
    <TaskSheet
      todo={todo}
      listName={listName}
      today={today}
      canMoveUp={false}
      canMoveDown={false}
      onUpdate={(x, input) => update.mutate({ todo: x, input }, "remindAt" in input ? { onSettled: () => syncReminders({ ask: input.remindAt != null }) } : undefined)}
      onToggle={(x) => toggle.mutate(x)}
      onDelete={(x) => {
        onClose();
        remove.mutate(x);
        offerUndo(t("todos.taskDeleted"), () => undo.mutate({ todo: x, index: Math.max(0, x.position - 1) }));
      }}
      onClose={onClose}
    />
  );
}

function Empty({ view }: { view: DueView }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <Animated.View entering={FadeInDown.duration(260)} testID="todo-due-empty" style={{ alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.xl * 1.5 }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: `${APP_COLORS.todos}2e`, alignItems: "center", justifyContent: "center" }}>
        <ListChecks size={40} color={colors.ink} />
      </View>
      <Text variant="title" style={{ fontSize: 20, textAlign: "center" }}>
        {t(`todos.emptyView.${view}`)}
      </Text>
    </Animated.View>
  );
}
