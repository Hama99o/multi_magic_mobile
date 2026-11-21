/**
 * Todo templates (the web's `TemplatesDrawer.tsx`; SPEC A21-A22): reusable
 * lists, each with its tasks and an optional repeat. Use makes a new list
 * from one and opens it. A repeating template makes its own lists: the server
 * does it when the lists load (`generate_due_for!`), so there is nothing to
 * run from here.
 */
import { useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { todoKeys } from "@/api/keys";
import { todoTemplatesApi, type TodoTemplate } from "@/api/todos";
import { LayoutTemplate, Pencil, Play, Plus, Repeat, Trash2 } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { APP_COLORS } from "@/theme/appColors";
import { formatDay } from "@/screens/calendar/dates";
import { useApplyTemplate, useDeleteTemplate } from "@/screens/todos/useTodoMutations";
import { repeatLabel } from "@/screens/todos/templates";

export default function TemplatesScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [failure, setFailure] = useState<string | null>(null);
  const templates = useQuery({ queryKey: todoKeys.templates(), queryFn: todoTemplatesApi.list });
  const apply = useApplyTemplate({
    onDone: (group) => router.replace({ pathname: "/todos/list", params: { id: String(group.id) } }),
    onError: () => setFailure(t("todos.failed")),
  });
  const remove = useDeleteTemplate({ onError: () => setFailure(t("todos.failed")) });

  const confirmDelete = (tpl: TodoTemplate) =>
    Alert.alert(t("todos.deleteTemplateQuestion", { name: tpl.name }), t("todos.deleteTemplateBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => remove.mutate(tpl.id) },
    ]);

  return (
    <Screen measure header={<AppHeader app="todos" title={t("todos.templates")} back />}>
      <Text tone="muted" style={{ paddingVertical: metrics.space.md }}>
        {t("todos.templatesHint")}
      </Text>
      <LoadFailure error={templates.error} loadFailed={t("todos.loadFailed")} hasData={Boolean(templates.data)} updatedAt={templates.dataUpdatedAt} onRetry={() => void templates.refetch()} testID="todo-templates-load-failed" />
      {failure ? (
        <Pressable testID="todo-templates-failure" onPress={() => setFailure(null)} accessibilityRole="button" accessibilityLabel={failure} accessibilityLiveRegion="polite">
          <Text tone="danger">{failure}</Text>
        </Pressable>
      ) : null}
      {templates.isPending && !templates.error ? <RowsSkeleton rows={4} testID="todo-templates-loading" /> : null}

      <FlatList
        testID="todo-templates-list"
        data={templates.data ?? []}
        keyExtractor={(x) => String(x.id)}
        ItemSeparatorComponent={() => <View style={{ height: metrics.space.sm }} />}
        refreshControl={<RefreshControl refreshing={templates.isRefetching} onRefresh={() => void templates.refetch()} tintColor={colors.inkMuted} />}
        contentContainerStyle={{ paddingBottom: 96 }}
        ListEmptyComponent={
          templates.data ? (
            <View testID="todo-templates-empty" style={{ alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.xl }}>
              <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: `${APP_COLORS.todos}2e`, alignItems: "center", justifyContent: "center" }}>
                <LayoutTemplate size={40} color={colors.ink} />
              </View>
              <Text variant="title" style={{ fontSize: 20, textAlign: "center" }}>
                {t("todos.noTemplates")}
              </Text>
              <Text tone="muted" style={{ textAlign: "center" }}>
                {t("todos.noTemplatesBody")}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const repeat = repeatLabel(item, t);
          return (
            <View>
              <View testID={`todo-template-${item.id}`} style={{ padding: metrics.space.md, gap: metrics.space.sm, borderRadius: metrics.radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
                  <LayoutTemplate size={18} color={colors.inkMuted} />
                  <Text style={{ flex: 1, fontWeight: "600" }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {t("todos.taskCount", { count: item.itemsCount })}
                  </Text>
                </View>
                {item.items.length ? (
                  <Text variant="caption" tone="muted" numberOfLines={2}>
                    {item.items.map((i) => i.title).join(" · ")}
                  </Text>
                ) : null}
                {repeat ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
                    <Repeat size={14} color={colors.inkMuted} />
                    <Text variant="caption" tone="muted">
                      {item.nextOccurrenceOn ? t("todos.repeatNext", { repeat, day: formatDay(item.nextOccurrenceOn, i18n.language) }) : repeat}
                    </Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: "row", gap: metrics.space.sm, paddingTop: metrics.space.xs }}>
                  <ActionButton testID={`todo-template-use-${item.id}`} icon={Play} label={t("todos.useTemplate")} primary onPress={() => apply.mutate(item.id)} />
                  <ActionButton testID={`todo-template-edit-${item.id}`} icon={Pencil} label={t("todos.edit")} onPress={() => router.push({ pathname: "/todos/template", params: { id: String(item.id) } })} />
                  <ActionButton testID={`todo-template-delete-${item.id}`} icon={Trash2} label={t("common.delete")} danger onPress={() => confirmDelete(item)} />
                </View>
              </View>
            </View>
          );
        }}
      />

      <Pressable
        testID="todo-templates-new"
        onPress={() => router.push("/todos/template")}
        accessibilityRole="button"
        accessibilityLabel={t("todos.newTemplate")}
        style={{ position: "absolute", right: metrics.space.lg, bottom: metrics.space.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: APP_COLORS.todos, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
      >
        <Plus size={26} color="#04161a" />
      </Pressable>
    </Screen>
  );
}

function ActionButton({ icon: Icon, label, onPress, testID, primary = false, danger = false }: { icon: typeof Play; label: string; onPress: () => void; testID: string; primary?: boolean; danger?: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  const tint = danger ? colors.danger : primary ? "#04161a" : colors.ink;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 40,
        paddingHorizontal: metrics.space.md,
        borderRadius: metrics.radius.pill,
        backgroundColor: primary ? APP_COLORS.todos : "transparent",
        borderWidth: primary ? 0 : 1,
        borderColor: danger ? `${colors.danger}66` : colors.border,
      }}
    >
      <Icon size={15} color={tint} />
      <Text variant="label" style={{ color: tint }}>
        {label}
      </Text>
    </Pressable>
  );
}
