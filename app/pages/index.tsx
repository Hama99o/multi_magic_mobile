/**
 * PAGES — the Drive-style shell. `docs/design/pages/DRIVE_SIDE_BY_SIDE.md`.
 *
 * Four tabs, as Drive's: Home (recent files), Starred, Shared, Files (the
 * spaces). The rounded search pill on top with the avatar; a "⋯" menu for
 * what Drive keeps in its side menu (Trash, Uploads); the "+" button bottom
 * right; the upload bar above the tabs while anything is going up.
 *
 * The tab is local state rather than four routes: the shell is one screen
 * people come back to, and a folder or the viewer is pushed over it.
 */
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { LoadFailure } from "@/components/LoadFailure";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { Folder, Trash2, Upload } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { pagesApi, type SharedItem, type Space } from "@/api/pages";
import { NodeCollection } from "@/screens/pages/drive/NodeCollection";
import { BottomSheet, NewSheet, SheetRow } from "@/screens/pages/drive/sheets";
import { NewFab, PagesTabBar, SearchPill, SortRow, UploadBar, useViewPrefs, type PagesTab } from "@/screens/pages/drive/ui";
import { EmptyLine } from "@/screens/pages/parts";
import { openNode } from "@/screens/pages/navigation";
import { explainPick, pickDocuments, pickMedia, takePhotoOrVideo, usePendingImport, type PickResult } from "@/screens/pages/addFiles";
import { useUploads } from "@/stores/uploads.store";

function SpaceRow({ space, mode, width }: { space: Space; mode: "list" | "grid"; width: number }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const open = () => router.push({ pathname: "/pages/folder", params: { spaceId: String(space.id), title: space.title } });
  const meta = t("pages.itemCount", { count: space.nodesCount });
  if (mode === "grid") {
    return (
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={t("pages.rowLabel", { title: space.title, meta })}
        style={{ width, flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 52, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
        testID="pages-space-row"
      >
        <Text style={{ fontSize: 18 }}>{space.icon ?? "📁"}</Text>
        <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
          {space.title}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={t("pages.rowLabel", { title: space.title, meta })}
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 64, paddingLeft: metrics.space.xs }}
      testID="pages-space-row"
    >
      <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 24 }}>{space.icon ?? "📁"}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1}>{space.title}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {space.permission && space.permission !== "owner" && space.ownerName ? `${meta} · ${space.ownerName}` : meta}
        </Text>
      </View>
      <Folder size={20} color={colors.inkMuted} />
    </Pressable>
  );
}

function SharedRow({ item }: { item: SharedItem }) {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const title = item.node ? item.node.title : item.space.title;
  const open = () => {
    if (!item.node) router.push({ pathname: "/pages/folder", params: { spaceId: String(item.space.id), title: item.space.title } });
    else if (item.node.kind === "folder")
      router.push({ pathname: "/pages/folder", params: { spaceId: String(item.space.id), parentId: String(item.node.id), title: item.node.title, trail: item.space.title } });
    else router.push({ pathname: "/pages/view", params: { spaceId: String(item.space.id), nodeId: String(item.node.id), title: item.node.title } });
  };
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={t("pages.rowLabel", { title, meta: item.space.title })} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 64 }} testID="pages-shared-row">
      <View style={{ width: 40, alignItems: "center" }}>
        <Text style={{ fontSize: 22 }}>{item.node ? "📄" : (item.space.icon ?? "📁")}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1}>{title}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {item.node ? item.space.title : t("pages.wholeSpace")}
        </Text>
      </View>
    </Pressable>
  );
}

export default function PagesHome() {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [tab, setTab] = useState<PagesTab>("home");
  // A tab tapped inside a folder comes back here as `?tab=` (`folder.tsx`).
  const params = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => {
    if (params.tab === "home" || params.tab === "starred" || params.tab === "shared" || params.tab === "files") setTab(params.tab);
  }, [params.tab]);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [width, setWidth] = useState(0);
  const mode = useViewPrefs((s) => s.mode);
  const hydrateView = useViewPrefs((s) => s.hydrate);
  const hydrateUploads = useUploads((s) => s.hydrate);
  const setPending = usePendingImport((s) => s.set);

  useEffect(() => {
    void hydrateView();
    void hydrateUploads();
  }, [hydrateView, hydrateUploads]);

  const view = tab === "starred" ? "starred" : "recent";
  const drive = useInfiniteQuery({
    queryKey: ["pages", "drive", view, ""],
    queryFn: ({ pageParam }) => pagesApi.drive(view, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled: tab === "home" || tab === "starred",
  });
  const nodes = useMemo(() => (drive.data?.pages ?? []).flatMap((p) => p.rows), [drive.data]);
  const spaces = useQuery({ queryKey: ["pages", "spaces"], queryFn: () => pagesApi.spaces(1), enabled: tab === "files" });
  const shared = useQuery({ queryKey: ["pages", "shared"], queryFn: pagesApi.sharedWithMe, enabled: tab === "shared" });

  const pick = async (fn: () => Promise<PickResult>) => {
    const files = explainPick(await fn(), t);
    if (!files) return;
    setPending(files);
    router.push("/pages/save");
  };

  const pill = <SearchPill onMenu={() => setMenu(true)} />;
  const empty = (title: string, testID: string, body?: string) => <EmptyLine title={title} body={body} testID={testID} />;

  return (
    <Screen measure={false}>
      <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {tab === "home" || tab === "starred" ? (
          <NodeCollection
            testID="pages-home-list"
            nodes={nodes}
            top={pill}
            header={
              <View>
                <SortRow label={tab === "home" ? t("pages.tabs.recentFiles") : t("pages.sort.updated")} ascending={false} />
                <LoadFailure error={drive.error} loadFailed={t("pages.loadFailed")} hasData={Boolean(drive.data)} updatedAt={drive.dataUpdatedAt} onRetry={() => void drive.refetch()} testID="pages-load-failed" padded={false} />
              </View>
            }
            empty={drive.isLoading ? <RowsSkeleton rows={5} /> : drive.error ? null : empty(tab === "home" ? t("pages.empty.recent") : t("pages.empty.starred"), "pages-home-empty")}
            loadingMore={drive.isFetchingNextPage}
            onEndReached={() => {
              if (drive.hasNextPage && !drive.isFetchingNextPage) void drive.fetchNextPage();
            }}
            refreshing={drive.isRefetching}
            onRefresh={() => void drive.refetch()}
            onOpen={(node) => openNode(node, { trail: node.space?.title ?? "" })}
            showSpace
            locationOf={(node) => node.space?.title ?? ""}
            onSelectingChange={setSelecting}
          />
        ) : tab === "files" ? (
          <>
            {pill}
            <FlatList
              key={`spaces-${mode}`}
              testID="pages-spaces-list"
              data={spaces.data?.rows ?? []}
              numColumns={mode === "grid" ? 2 : 1}
              columnWrapperStyle={mode === "grid" ? { gap: 12, marginBottom: 12 } : undefined}
              keyExtractor={(s) => String(s.id)}
              ListHeaderComponent={
                <View>
                  <SortRow label={t("pages.spaces")} ascending />
                  <LoadFailure error={spaces.error} loadFailed={t("pages.loadFailed")} hasData={Boolean(spaces.data)} updatedAt={spaces.dataUpdatedAt} onRetry={() => void spaces.refetch()} testID="pages-spaces-failed" padded={false} />
                </View>
              }
              renderItem={({ item }) => <SpaceRow space={item} mode={mode} width={Math.floor((width - 12) / 2)} />}
              ListEmptyComponent={spaces.isLoading ? <RowsSkeleton rows={4} /> : spaces.error ? null : empty(t("pages.noSpacesTitle"), "pages-no-spaces", t("pages.noSpacesBody"))}
              refreshControl={<RefreshControl refreshing={spaces.isRefetching} onRefresh={() => void spaces.refetch()} tintColor={colors.inkMuted} />}
              contentContainerStyle={{ paddingBottom: 96 }}
            />
          </>
        ) : (
          <>
            {pill}
            <FlatList
              testID="pages-shared-list"
              data={shared.data?.rows ?? []}
              keyExtractor={(s) => String(s.id)}
              renderItem={({ item }) => <SharedRow item={item} />}
              ListEmptyComponent={shared.isLoading ? <RowsSkeleton rows={4} /> : shared.error ? null : empty(t("pages.empty.shared"), "pages-shared-empty")}
              refreshControl={<RefreshControl refreshing={shared.isRefetching} onRefresh={() => void shared.refetch()} tintColor={colors.inkMuted} />}
            />
          </>
        )}
        {selecting ? null : <NewFab onPress={() => setAdding(true)} />}
      </View>
      <View style={{ marginHorizontal: -metrics.space.lg, marginBottom: -insets.bottom }}>
        <UploadBar />
        <PagesTabBar tab={tab} onTab={setTab} />
      </View>

      <NewSheet
        open={adding}
        onClose={() => setAdding(false)}
        onMedia={() => void pick(pickMedia)}
        onFiles={() => void pick(pickDocuments)}
        onCamera={() => void pick(takePhotoOrVideo)}
      />
      <BottomSheet open={menu} onClose={() => setMenu(false)} testID="pages-menu-sheet">
        <SheetRow icon={Upload} label={t("pages.uploads.title")} onPress={() => (setMenu(false), router.push("/pages/uploads"))} testID="pages-menu-uploads" />
        <SheetRow icon={Trash2} label={t("pages.places.trash")} onPress={() => (setMenu(false), router.push({ pathname: "/pages/drive", params: { view: "trash" } }))} testID="pages-menu-trash" />
      </BottomSheet>
    </Screen>
  );
}

