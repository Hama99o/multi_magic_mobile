/**
 * Backlog — the web's `/flow/backlog` (`pages/flow_app/Backlog.tsx`): every
 * project, each one opening to its cards that have NO sprint, grouped by
 * column, with a quick add per column.
 *
 * Better than the web on two counts the parity audit names: every project
 * pages in (the web shows the first 20), and a card opens the CARD (the web's
 * row opens the board and leaves the person to find it again). A project
 * that cannot load says so with a retry; the web has no error state here.
 */
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, TextInput, View } from "react-native";
import { useNav } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { useSubmitText } from "@/lib/useSubmitText";
import { useInfiniteQuery } from "@tanstack/react-query";
import { flowKeys } from "@/api/keys";
import { flowApi, type Project } from "@/api/flow";
import { failureMessage } from "@/api/failure";
import { ChevronDown, ChevronRight, Inbox, Kanban, Plus } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useMe } from "@/hooks/useMe";
import { formatDay, todayKey } from "@/screens/calendar/dates";
import { colorHex, columnCards, dueOf, isOverdue, powersOf, roleIn } from "./logic";
import { EmptyState, ProjectBadge } from "./parts";
import { useCreateCard } from "./useFlowMutations";

export function BacklogTab() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [open, setOpen] = useState<number[]>([]);
  const projects = useInfiniteQuery({
    queryKey: flowKeys.projects(""),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => flowApi.projects({ page: pageParam }),
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
  const rows = projects.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <>
      <Text tone="muted" variant="caption" style={{ paddingBottom: metrics.space.sm }}>
        {t("flow.backlog.intro")}
      </Text>
      <LoadFailure error={projects.error} loadFailed={t("flow.loadFailed")} hasData={Boolean(projects.data)} updatedAt={projects.dataUpdatedAt} onRetry={() => void projects.refetch()} testID="flow-backlog-failed" />
      <FlatList
        testID="flow-backlog"
        data={rows}
        keyExtractor={(p) => String(p.id)}
        ItemSeparatorComponent={() => <View style={{ height: metrics.space.sm }} />}
        ListEmptyComponent={projects.isPending ? <RowsSkeleton rows={4} testID="flow-backlog-loading" /> : projects.data ? <EmptyState testID="flow-backlog-empty" icon={Kanban} title={t("flow.emptyTitle")} body={t("flow.emptyBody")} /> : null}
        ListFooterComponent={projects.isFetchingNextPage ? <ActivityIndicator color={colors.inkMuted} /> : null}
        onEndReached={() => {
          if (projects.hasNextPage && !projects.isFetchingNextPage) void projects.fetchNextPage();
        }}
        refreshControl={<RefreshControl refreshing={projects.isRefetching && !projects.isFetchingNextPage} onRefresh={() => void projects.refetch()} tintColor={colors.inkMuted} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: metrics.space.xl }}
        renderItem={({ item }) => <ProjectSection project={item} open={open.includes(item.id)} onToggle={() => setOpen((o) => (o.includes(item.id) ? o.filter((x) => x !== item.id) : [...o, item.id]))} />}
      />
    </>
  );
}

function ProjectSection({ project, open, onToggle }: { project: Project; open: boolean; onToggle: () => void }) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <View style={{ borderRadius: metrics.radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable
          testID="flow-backlog-project"
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={t("flow.backlog.project", { title: project.title })}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: metrics.space.md, padding: metrics.space.md, minHeight: 64 }}
        >
          {open ? <ChevronDown size={20} color={colors.inkMuted} /> : <ChevronRight size={20} color={colors.inkMuted} />}
          <ProjectBadge color={project.color} size={32} />
          <Text numberOfLines={1} style={{ flex: 1, fontWeight: "600" }}>
            {project.title}
          </Text>
        </Pressable>
        <Pressable testID="flow-backlog-open-board" onPress={() => router.push({ pathname: "/flow/board", params: { id: String(project.id), sprint: "backlog" } })} accessibilityRole="button" accessibilityLabel={t("flow.backlog.openBoard", { title: project.title })} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
          <Kanban size={20} color={colors.inkMuted} />
        </Pressable>
      </View>
      {open ? <ProjectBacklog project={project} /> : null}
    </View>
  );
}

function ProjectBacklog({ project }: { project: Project }) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const me = useMe();
  const today = todayKey();
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const board = useInfiniteQuery({
    queryKey: flowKeys.board(project.id, "backlog"),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => flowApi.board(project.id, "backlog", pageParam),
    getNextPageParam: (last) => last.paging.nextPage ?? undefined,
  });
  const create = useCreateCard(project.id, { onError: (e) => setFailure(failureMessage(e, t("flow.board.addFailed"))) });
  const canEdit = powersOf(roleIn(project, me?.id)).editCards;

  if (board.isPending) return <ActivityIndicator style={{ marginVertical: metrics.space.md }} color={colors.inkMuted} />;
  if (board.error || !board.data) {
    return (
      <Pressable onPress={() => void board.refetch()} accessibilityRole="button" style={{ padding: metrics.space.md, gap: 4 }} testID="flow-backlog-project-failed">
        <Text tone="danger">{failureMessage(board.error, t("flow.board.loadFailed"))}</Text>
        <Text tone="accent" variant="label">
          {t("fields.retry")}
        </Text>
      </Pressable>
    );
  }
  const first = board.data.pages[0];
  const cards = board.data.pages.flatMap((p) => p.cards).filter((c) => c.sprintId == null);
  const columns = [...first.columns].sort((a, b) => a.position - b.position);

  return (
    <View style={{ paddingHorizontal: metrics.space.md, paddingBottom: metrics.space.md, gap: metrics.space.md }}>
      {failure ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {failure}
        </Text>
      ) : null}
      {columns.map((col) => {
        const inCol = columnCards(cards, col.id, first.fields);
        return (
          <View key={col.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 36 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colorHex(col.color) ?? colors.inkMuted }} />
              <Text variant="label" style={{ flex: 1 }} accessibilityRole="header">
                {`${col.title} · ${inCol.length}`}
              </Text>
              {canEdit ? (
                <Pressable testID="flow-backlog-add" onPress={() => setAddingTo(col.id)} accessibilityRole="button" accessibilityLabel={t("flow.board.addTo", { column: col.title })} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
                  <Plus size={18} color={colors.inkMuted} />
                </Pressable>
              ) : null}
            </View>
            {inCol.length === 0 && addingTo !== col.id ? (
              <Text variant="caption" tone="muted" style={{ paddingLeft: 16 }}>
                {t("flow.backlog.noCards")}
              </Text>
            ) : null}
            {inCol.map((c) => {
              const due = dueOf(c, first.fields);
              const late = isOverdue(due, today);
              return (
                <Pressable
                  key={c.id}
                  testID="flow-backlog-card"
                  disabled={c.id < 0}
                  onPress={() => router.push({ pathname: "/flow/card", params: { projectId: String(project.id), id: String(c.id) } })}
                  accessibilityRole="button"
                  accessibilityLabel={due ? `${c.title}. ${t(late ? "flow.tile.overdue" : "flow.tile.due", { date: formatDay(due, i18n.language) })}` : c.title}
                  style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 44, paddingLeft: 16, opacity: c.id < 0 ? 0.6 : 1 }}
                >
                  <Text numberOfLines={1} style={{ flex: 1 }}>
                    {c.title}
                  </Text>
                  {due ? (
                    <Text variant="caption" tone={late ? "danger" : "muted"}>
                      {formatDay(due, i18n.language)}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
            {addingTo === col.id ? (
              <InlineAdd
                onAdd={(title) => {
                  setFailure(null);
                  create.mutate({ title, columnId: col.id, sprintId: null });
                }}
                onClose={() => setAddingTo(null)}
              />
            ) : null}
          </View>
        );
      })}
      {cards.length === 0 && columns.length > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
          <Inbox size={16} color={colors.inkMuted} />
          <Text tone="muted" variant="caption">
            {t("flow.backlog.empty")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function InlineAdd({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const title = useSubmitText();
  return (
    <TextInput
      testID="flow-backlog-add-input"
      value={title.value}
      onChangeText={title.onChangeText}
      autoFocus
      submitBehavior="submit"
      returnKeyType="done"
      onSubmitEditing={() => {
        const v = title.take();
        if (v) onAdd(v);
      }}
      onBlur={onClose}
      placeholder={t("flow.board.cardTitle")}
      placeholderTextColor={colors.inkMuted}
      accessibilityLabel={t("flow.board.cardTitle")}
      style={{ marginLeft: 16, minHeight: 44, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.sm, borderWidth: 1, borderColor: colors.accent, color: colors.ink, fontSize: 16 }}
    />
  );
}
