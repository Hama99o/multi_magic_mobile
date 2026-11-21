/**
 * FLOW — the app's front page (`docs/design/flow/SPEC.md` §B): Projects and
 * Backlog, the web's two tabs (`pages/flow_app/Layout.tsx`), as a segmented
 * control kept in the address (`?tab=backlog`, shell rule "every tab is in
 * its address").
 *
 * Projects come newest first: the server's default order is `created_at
 * desc` since multi_magic feat/flow-rest-paging (owner rule: a project just
 * made is on top of page 1). 20 a page, more on scroll: the web never pages
 * and shows only the first 20 (parity audit, web bug).
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import { flowKeys } from "@/api/keys";
import { flowApi, type Project } from "@/api/flow";
import { failureMessage } from "@/api/failure";
import { Columns3, Ellipsis, Kanban, Pencil, Plus, Search, SlidersHorizontal, Trash2, Users, X } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { UnreadableNotice } from "@/components/UnreadableNotice";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useMe } from "@/hooks/useMe";
import { ActionSheet, type SheetAction } from "@/screens/contacts/ActionSheet";
import { BacklogTab } from "@/screens/flow/Backlog";
import { MembersSheet } from "@/screens/flow/MembersSheet";
import { ProjectSheet } from "@/screens/flow/ProjectSheet";
import { powersOf, roleIn } from "@/screens/flow/logic";
import { EmptyState, FLOW_COLOR, ON_FLOW, PrimaryPill, ProjectBadge, RolePill, Segmented } from "@/screens/flow/parts";
import { useDeleteProject } from "@/screens/flow/useFlowMutations";

type Tab = "projects" | "backlog";
const SEARCH_DELAY_MS = 400;

export default function FlowScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ tab?: string; new?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "backlog" ? "backlog" : "projects");
  const [searching, setSearching] = useState(false);
  const [typed, setTyped] = useState("");
  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState<Project | "new" | null>(params.new === "1" ? "new" : null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setTerm(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [typed]);

  const pick = (next: Tab) => {
    setTab(next);
    router.setParams({ tab: next === "backlog" ? "backlog" : undefined });
  };

  return (
    <Screen header={<AppHeader app="flow" />}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.xs }}>
        <View style={{ flex: 1 }}>
          <Segmented
            testID="flow-tabs"
            value={tab}
            onChange={pick}
            options={[
              { value: "projects", label: t("flow.tabs.projects") },
              { value: "backlog", label: t("flow.tabs.backlog") },
            ]}
          />
        </View>
        {tab === "projects" ? (
          <Pressable
            testID="flow-search-toggle"
            onPress={() => {
              setSearching((s) => !s);
              setTyped("");
            }}
            accessibilityRole="button"
            accessibilityLabel={searching ? t("flow.closeSearch") : t("flow.searchProjects")}
            style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
          >
            {searching ? <X size={22} color={colors.ink} /> : <Search size={22} color={colors.ink} />}
          </Pressable>
        ) : null}
      </View>
      {tab === "projects" && searching ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, marginBottom: metrics.space.sm, backgroundColor: colors.surface }}>
          <Search size={18} color={colors.inkMuted} />
          <TextInput
            testID="flow-search"
            value={typed}
            onChangeText={setTyped}
            autoFocus
            placeholder={t("flow.searchPlaceholder")}
            placeholderTextColor={colors.inkMuted}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t("flow.searchProjects")}
            style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }}
          />
        </View>
      ) : null}

      {tab === "projects" ? <ProjectsTab term={term} onNew={() => setEditing("new")} onEdit={setEditing} onEmpty={setEmpty} /> : <BacklogTab />}

      {/* Not over the empty state, which has its own "Create your first
          project": two buttons for one action (device, 2026-11-20). */}
      {tab === "projects" && !empty ? (
        <Pressable
          testID="flow-new-project"
          onPress={() => setEditing("new")}
          accessibilityRole="button"
          accessibilityLabel={t("flow.project.new")}
          style={{ position: "absolute", right: metrics.space.lg, bottom: metrics.space.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: FLOW_COLOR, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
        >
          <Plus size={26} color={ON_FLOW} />
        </Pressable>
      ) : null}

      {editing ? (
        <ProjectSheet
          project={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onCreated={(p) => router.push({ pathname: "/flow/board", params: { id: String(p.id) } })}
        />
      ) : null}
    </Screen>
  );
}

function ProjectsTab({ term, onNew, onEdit, onEmpty }: { term: string; onNew: () => void; onEdit: (p: Project) => void; onEmpty: (empty: boolean) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const me = useMe();
  const [menuFor, setMenuFor] = useState<Project | null>(null);
  const [membersOf, setMembersOf] = useState<Project | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const remove = useDeleteProject({ onError: (e) => setFailure(failureMessage(e, t("flow.project.deleteFailed"))) });

  const projects = useInfiniteQuery({
    queryKey: flowKeys.projects(term),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => flowApi.projects({ page: pageParam, search: term }),
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
  const rows = projects.data?.pages.flatMap((p) => p.rows) ?? [];
  const nothing = Boolean(projects.data) && rows.length === 0 && !term.trim();
  useEffect(() => onEmpty(nothing), [nothing, onEmpty]);
  const unreadable = projects.data?.pages.reduce((n, p) => n + p.unreadable, 0) ?? 0;

  const confirmDelete = (p: Project) =>
    Alert.alert(t("flow.project.deleteTitle", { title: p.title }), t("flow.project.deleteBody", { count: p.cardsCount }), [
      { text: t("fields.cancel"), style: "cancel" },
      { text: t("flow.delete"), style: "destructive", onPress: () => remove.mutate(p.id) },
    ]);

  const actions = (p: Project): SheetAction[] => {
    const powers = powersOf(roleIn(p, me?.id));
    const open = (path: "/flow/columns" | "/flow/fields") => router.push({ pathname: path, params: { id: String(p.id) } });
    return [
      { key: "open", label: t("flow.project.open"), icon: Kanban, onPress: () => router.push({ pathname: "/flow/board", params: { id: String(p.id) } }) },
      ...(powers.manage ? [{ key: "edit", label: t("flow.project.edit"), icon: Pencil, onPress: () => onEdit(p) }] : []),
      { key: "members", label: powers.manage ? t("flow.members.manage") : t("flow.members.title"), icon: Users, onPress: () => setMembersOf(p) },
      ...(powers.manage
        ? [
            { key: "fields", label: t("flow.fields.title"), icon: SlidersHorizontal, onPress: () => open("/flow/fields") },
            { key: "columns", label: t("flow.columns.title"), icon: Columns3, onPress: () => open("/flow/columns") },
          ]
        : []),
      ...(powers.deleteProject ? [{ key: "delete", label: t("flow.project.delete"), icon: Trash2, danger: true, onPress: () => confirmDelete(p) }] : []),
    ];
  };

  return (
    <>
      <LoadFailure error={projects.error} loadFailed={t("flow.loadFailed")} hasData={Boolean(projects.data)} updatedAt={projects.dataUpdatedAt} onRetry={() => void projects.refetch()} testID="flow-load-failed" />
      {failure ? (
        <Pressable testID="flow-failure" onPress={() => setFailure(null)} accessibilityRole="button" accessibilityLabel={failure} accessibilityLiveRegion="polite">
          <Text tone="danger">{failure}</Text>
        </Pressable>
      ) : null}
      <UnreadableNotice count={unreadable} />
      <FlatList
        testID="flow-projects"
        data={rows}
        keyExtractor={(p) => String(p.id)}
        // Keep the rows of the last search on screen, dimmed, while the next one loads.
        style={{ opacity: projects.isFetching && !projects.isFetchingNextPage && !projects.isRefetching ? 0.6 : 1 }}
        ListEmptyComponent={
          projects.isPending && !projects.error ? (
            <RowsSkeleton rows={5} testID="flow-loading" />
          ) : projects.data ? (
            term ? (
              <EmptyState testID="flow-no-match" icon={Search} title={t("flow.noMatch", { term })} />
            ) : (
              <EmptyState testID="flow-empty" icon={Kanban} title={t("flow.emptyTitle")} body={t("flow.emptyBody")} action={<PrimaryPill testID="flow-empty-create" label={t("flow.createFirst")} icon={Plus} onPress={onNew} />} />
            )
          ) : null
        }
        ListFooterComponent={projects.isFetchingNextPage ? <ActivityIndicator color={colors.inkMuted} /> : null}
        onEndReached={() => {
          if (projects.hasNextPage && !projects.isFetchingNextPage) void projects.fetchNextPage();
        }}
        renderItem={({ item }) => <ProjectRow project={item} meId={me?.id} onMenu={() => setMenuFor(item)} />}
        ItemSeparatorComponent={() => <View style={{ height: metrics.space.sm }} />}
        refreshControl={<RefreshControl refreshing={projects.isRefetching && !projects.isFetchingNextPage} onRefresh={() => void projects.refetch()} tintColor={colors.inkMuted} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 96 }}
      />
      <ActionSheet open={menuFor != null} title={menuFor?.title ?? ""} actions={menuFor ? actions(menuFor) : []} onClose={() => setMenuFor(null)} testID="flow-project-menu" />
      {membersOf ? <MembersSheet project={membersOf} onClose={() => setMembersOf(null)} /> : null}
    </>
  );
}

function ProjectRow({ project, meId, onMenu }: { project: Project; meId: number | undefined; onMenu: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [pressed, setPressed] = useState(false);
  const role = roleIn(project, meId);
  // The owner is not a member row on the server, so the people on a board are members + 1.
  const stats = [t("flow.project.cards", { count: project.cardsCount }), t("flow.project.sprints", { count: project.sprintsCount }), t("flow.project.people", { count: project.membersCount + 1 })].join(" · ");
  return (
    <View style={{ flexDirection: "row", alignItems: "stretch", borderRadius: metrics.radius.lg, backgroundColor: pressed ? colors.border : colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <Pressable
        testID="flow-project-row"
        onPress={() => router.push({ pathname: "/flow/board", params: { id: String(project.id) } })}
        onLongPress={onMenu}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        accessibilityRole="button"
        accessibilityLabel={[project.title, project.description, stats, role !== "owner" ? t(`flow.roles.${role}`) : null].filter(Boolean).join(". ")}
        accessibilityHint={t("flow.project.rowHint")}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: metrics.space.md, padding: metrics.space.md, minHeight: 84 }}
      >
        <ProjectBadge color={project.color} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
            <Text numberOfLines={1} style={{ flex: 1, fontWeight: "700", fontSize: 16 }}>
              {project.title}
            </Text>
            {role !== "owner" ? <RolePill role={role} /> : null}
          </View>
          {project.description ? (
            <Text tone="muted" numberOfLines={2} variant="caption">
              {project.description}
            </Text>
          ) : null}
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {stats}
          </Text>
        </View>
      </Pressable>
      <Pressable testID="flow-project-more" onPress={onMenu} accessibilityRole="button" accessibilityLabel={t("flow.project.options", { title: project.title })} style={{ width: metrics.touch, alignItems: "center", justifyContent: "center" }}>
        <Ellipsis size={20} color={colors.inkMuted} />
      </Pressable>
    </View>
  );
}
