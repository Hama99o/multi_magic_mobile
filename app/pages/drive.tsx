/**
 * The drive seen as a whole: Recent, Starred, Trash, Search
 * (`GET drive/nodes?view=…`, `drive_controller.rb`) and Shared with me
 * (`GET spaces/shared_with_me`). `docs/design/pages/SPEC.md` §2.
 *
 * Every row here can come from any space, so every row says which one.
 * Search and Trash have their own Drive-style views (`drive/SearchView.tsx`,
 * `drive/TrashView.tsx`, QA_DEEP #8 and #9).
 */
import { useMemo } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { LoadFailure } from "@/components/LoadFailure";
import { UnreadableNotice } from "@/components/UnreadableNotice";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { ChevronRight, Folder } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { pagesApi, type DriveView, type SharedItem } from "@/api/pages";
import { NodeCollection } from "@/screens/pages/drive/NodeCollection";
import { SearchView } from "@/screens/pages/drive/SearchView";
import { TrashView } from "@/screens/pages/drive/TrashView";
import { EmptyLine, PagesHeader, Separator } from "@/screens/pages/parts";
import { openNode } from "@/screens/pages/navigation";
import { pagesKeys } from "@/api/keys";

type View_ = DriveView | "shared";

function titleFor(view: View_, t: (key: string) => string): string {
  switch (view) {
    case "recent":
      return t("pages.places.recent");
    case "starred":
      return t("pages.places.starred");
    case "trash":
      return t("pages.places.trash");
    case "shared":
      return t("pages.places.shared");
    default:
      return t("pages.search");
  }
}

function emptyFor(view: View_, t: (key: string) => string): string {
  switch (view) {
    case "recent":
      return t("pages.empty.recent");
    case "starred":
      return t("pages.empty.starred");
    case "trash":
      return t("pages.empty.trash");
    case "shared":
      return t("pages.empty.shared");
    default:
      return t("pages.empty.search");
  }
}

function SharedRow({ item }: { item: SharedItem }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const label = item.node ? item.node.title : item.space.title;
  const where = `${item.space.icon ?? ""} ${item.space.title}`.trim();
  const open = () => {
    if (!item.node) {
      router.push({ pathname: "/pages/folder", params: { spaceId: String(item.space.id), title: item.space.title } });
    } else if (item.node.kind === "folder") {
      router.push({
        pathname: "/pages/folder",
        params: { spaceId: String(item.space.id), parentId: String(item.node.id), title: item.node.title, trail: item.space.title },
      });
    } else {
      router.push({ pathname: "/pages/view", params: { spaceId: String(item.space.id), nodeId: String(item.node.id), title: item.node.title } });
    }
  };
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={t("pages.rowLabel", { title: label, meta: where })}
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 60 }}
      testID="pages-shared-row"
    >
      <View style={{ width: 44, height: 44, borderRadius: metrics.radius.sm, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        {item.node ? <Folder size={22} color={colors.accent} /> : <Text style={{ fontSize: 22, lineHeight: 28 }}>{item.space.icon ?? "📁"}</Text>}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1}>{label}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {item.node ? where : t("pages.wholeSpace")}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.inkMuted} />
    </Pressable>
  );
}

export default function Drive() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ view?: string }>();
  const view: View_ = (["recent", "starred", "trash", "search", "shared"] as const).find((v) => v === params.view) ?? "recent";

  const nodesQuery = useInfiniteQuery({
    queryKey: pagesKeys.drive(view, ""),
    queryFn: ({ pageParam }) => pagesApi.drive(view as DriveView, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled: view === "recent" || view === "starred",
  });
  const sharedQuery = useQuery({ queryKey: pagesKeys.shared(), queryFn: pagesApi.sharedWithMe, enabled: view === "shared" });

  const nodes = useMemo(() => (nodesQuery.data?.pages ?? []).flatMap((p) => p.rows), [nodesQuery.data]);
  const active = view === "shared" ? sharedQuery : nodesQuery;

  if (view === "search") {
    return (
      <Screen measure avoidKeyboard>
        <SearchView />
      </Screen>
    );
  }
  if (view === "trash") {
    return (
      <Screen measure>
        <PagesHeader title={titleFor(view, t)} />
        <TrashView />
      </Screen>
    );
  }

  return (
    <Screen measure>
      <PagesHeader title={titleFor(view, t)} />

      <UnreadableNotice
        count={view === "shared" ? (sharedQuery.data?.unreadable ?? 0) : (nodesQuery.data?.pages ?? []).reduce((n, p) => n + p.unreadable, 0)}
      />
      <LoadFailure
        error={active.error}
        loadFailed={t("pages.loadFailed")}
        hasData={Boolean(active.data)}
        updatedAt={active.dataUpdatedAt}
        onRetry={() => void active.refetch()}
        testID="pages-drive-load-failed"
      />

      {view === "shared" ? (
        <FlatList
          testID="pages-drive-list"
          data={sharedQuery.data?.rows ?? []}
          keyExtractor={(s) => String(s.id)}
          renderItem={({ item }) => <SharedRow item={item} />}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={sharedQuery.isLoading ? <RowsSkeleton /> : sharedQuery.error ? null : <EmptyLine title={emptyFor(view, t)} testID="pages-drive-empty" />}
          refreshControl={<RefreshControl refreshing={sharedQuery.isRefetching} onRefresh={() => void sharedQuery.refetch()} tintColor={colors.inkMuted} />}
        />
      ) : (
        // Recent, Starred: the same list/grid, ⋯ and selection as a folder
        // (`NodeCollection`), each row naming its space.
        <NodeCollection
          testID="pages-drive-list"
          nodes={nodes}
          top={null}
          empty={nodesQuery.isLoading ? <RowsSkeleton /> : nodesQuery.error ? null : <EmptyLine title={emptyFor(view, t)} testID="pages-drive-empty" />}
          loadingMore={nodesQuery.isFetchingNextPage}
          onEndReached={() => {
            if (nodesQuery.hasNextPage && !nodesQuery.isFetchingNextPage) void nodesQuery.fetchNextPage();
          }}
          refreshing={nodesQuery.isRefetching}
          onRefresh={() => void nodesQuery.refetch()}
          onOpen={(node) => openNode(node, { trail: node.space?.title ?? "" })}
          showSpace
          locationOf={(node) => node.space?.title ?? ""}
          bottomPadding={metrics.space.xl}
        />
      )}
    </Screen>
  );
}
