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
import { Alert, BackHandler, FlatList, Pressable, RefreshControl, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { LoadFailure } from "@/components/LoadFailure";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { Check, Folder, MoreVertical, Pencil, Trash2, Upload } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { pagesApi, type SharedItem, type SortDir, type Space, type SpaceListOptions } from "@/api/pages";
import { sortLabel } from "@/screens/pages/labels";
import { NodeCollection } from "@/screens/pages/drive/NodeCollection";
import { BottomSheet, NewSheet, SheetRow } from "@/screens/pages/drive/sheets";
import { IconButton, NewFab, PagesTabBar, SearchPill, SharedNodeGlyph, SortRow, UploadBar, useViewPrefs, type PagesTab } from "@/screens/pages/drive/ui";
import { EmptyLine } from "@/screens/pages/parts";
import { openNode } from "@/screens/pages/navigation";
import { explainPick, pickDocuments, pickMedia, takePhotoOrVideo, usePendingImport, type PickResult } from "@/screens/pages/addFiles";
import { useUploads } from "@/stores/uploads.store";
import { pagesKeys } from "@/api/keys";
import { useDriveRights } from "@/screens/pages/permissions";
import { SpaceForm } from "@/screens/pages/SpaceForm";
import { useDeleteSpace } from "@/screens/pages/usePageMutations";
import { failureMessage } from "@/api/failure";
import { Button } from "@/components/reusables/button";

type SpaceSortBy = NonNullable<SpaceListOptions["sortBy"]>;
/** `VALID_SPACE_SORT_COLUMNS` (`spaces_controller.rb`). */
const SPACE_SORTS: SpaceSortBy[] = ["created_at", "updated_at", "name"];

/** The web's `owned`: edit and delete are the owner's alone (`SpacePolicy`). This
 *  list is the caller's own spaces, so a row says null or "owner". */
const ownsSpace = (space: Space) => space.permission == null || space.permission === "owner";

function SpaceRow({ space, mode, width, onMore }: { space: Space; mode: "list" | "grid"; width: number; onMore: (space: Space) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const open = () => router.push({ pathname: "/pages/folder", params: { spaceId: String(space.id), title: space.title } });
  const meta = t("pages.itemCount", { count: space.nodesCount });
  const more = ownsSpace(space) ? (
    <IconButton icon={MoreVertical} label={t("pages.item.more", { title: space.title })} onPress={() => onMore(space)} testID="pages-space-more" />
  ) : null;
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
        {more}
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
      {more ?? <Folder size={20} color={colors.inkMuted} />}
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
        {item.node ? <SharedNodeGlyph node={item.node} /> : <Text style={{ fontSize: 22 }}>{item.space.icon ?? "📁"}</Text>}
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
  const [spaceForm, setSpaceForm] = useState(false);
  // A space's ⋯ (audit #15): Edit opens the form filled in; Delete asks first.
  const [spaceMenu, setSpaceMenu] = useState<Space | null>(null);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);
  const deleting = useDeleteSpace({ onError: (e) => Alert.alert(failureMessage(e, t("pages.spaceMenu.deleteFailed"))) });
  const deleteSpace = (target: Space) => {
    setSpaceMenu(null);
    Alert.alert(t("pages.spaceMenu.deleteTitle", { title: target.title }), t("pages.spaceMenu.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("pages.spaceMenu.delete"), style: "destructive", onPress: () => deleting.mutate(target.id) },
    ]);
  };
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

  // Android back at Pages with nothing behind (a share, a link): Home, not
  // out of the app. With history, the stack's own back runs (as in Notes).
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (router.canGoBack()) return false;
      router.replace("/home");
      return true;
    });
    return () => sub.remove();
  }, []);

  const view = tab === "starred" ? "starred" : "recent";
  const drive = useInfiniteQuery({
    queryKey: pagesKeys.drive(view, ""),
    queryFn: ({ pageParam }) => pagesApi.drive(view, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled: tab === "home" || tab === "starred",
  });
  const nodes = useMemo(() => (drive.data?.pages ?? []).flatMap((p) => p.rows), [drive.data]);
  const rightsOf = useDriveRights();
  // Newest first by default (the owner's rule, 2026-11-09), every page of them.
  const [spaceSort, setSpaceSort] = useState<{ sortBy: SpaceSortBy; sortDir: SortDir }>({ sortBy: "created_at", sortDir: "desc" });
  const [sortingSpaces, setSortingSpaces] = useState(false);
  const spaces = useInfiniteQuery({
    queryKey: pagesKeys.spacesSorted(spaceSort.sortBy, spaceSort.sortDir),
    queryFn: ({ pageParam }) => pagesApi.spaces(pageParam, spaceSort),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled: tab === "files",
  });
  const spaceRows = useMemo(() => {
    const seen = new Set<number>();
    return (spaces.data?.pages ?? []).flatMap((p) => p.rows).filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  }, [spaces.data]);
  const shared = useQuery({ queryKey: pagesKeys.shared(), queryFn: pagesApi.sharedWithMe, enabled: tab === "shared" });

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
            rightsOf={rightsOf}
          />
        ) : tab === "files" ? (
          <>
            {pill}
            <FlatList
              key={`spaces-${mode}`}
              testID="pages-spaces-list"
              data={spaceRows}
              onEndReached={() => {
                if (spaces.hasNextPage && !spaces.isFetchingNextPage) void spaces.fetchNextPage();
              }}
              onEndReachedThreshold={0.5}
              numColumns={mode === "grid" ? 2 : 1}
              columnWrapperStyle={mode === "grid" ? { gap: 12, marginBottom: 12 } : undefined}
              keyExtractor={(s) => String(s.id)}
              ListHeaderComponent={
                <View>
                  <SortRow label={sortLabel(spaceSort.sortBy, t)} ascending={spaceSort.sortDir === "asc"} onSort={() => setSortingSpaces(true)} />
                  <LoadFailure error={spaces.error} loadFailed={t("pages.loadFailed")} hasData={Boolean(spaces.data)} updatedAt={spaces.dataUpdatedAt} onRetry={() => void spaces.refetch()} testID="pages-spaces-failed" padded={false} />
                </View>
              }
              renderItem={({ item }) => <SpaceRow space={item} mode={mode} width={Math.floor((width - 12) / 2)} onMore={setSpaceMenu} />}
              ListEmptyComponent={
                spaces.isLoading ? (
                  <RowsSkeleton rows={4} />
                ) : spaces.error ? null : (
                  <View>
                    {empty(t("pages.noSpacesTitle"), "pages-no-spaces", t("pages.noSpacesBody"))}
                    <Button label={t("pages.new.space")} block={false} onPress={() => setSpaceForm(true)} testID="pages-new-space" />
                  </View>
                )
              }
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
              ListHeaderComponent={
                <LoadFailure error={shared.error} loadFailed={t("pages.loadFailed")} hasData={Boolean(shared.data)} updatedAt={shared.dataUpdatedAt} onRetry={() => void shared.refetch()} testID="pages-shared-failed" padded={false} />
              }
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
        onSpace={() => setSpaceForm(true)}
      />
      <SpaceForm open={spaceForm} onClose={() => setSpaceForm(false)} />
      <SpaceForm open={editingSpace != null} space={editingSpace} onClose={() => setEditingSpace(null)} />
      <BottomSheet open={spaceMenu != null} onClose={() => setSpaceMenu(null)} testID="pages-space-menu">
        {spaceMenu ? (
          <>
            <Text variant="label" numberOfLines={2} style={{ paddingHorizontal: metrics.space.xl, paddingBottom: metrics.space.sm }}>
              {spaceMenu.title}
            </Text>
            <SheetRow icon={Pencil} label={t("pages.spaceMenu.edit")} onPress={() => (setEditingSpace(spaceMenu), setSpaceMenu(null))} testID="pages-space-edit" />
            <SheetRow icon={Trash2} label={t("pages.spaceMenu.delete")} danger onPress={() => deleteSpace(spaceMenu)} testID="pages-space-delete" />
          </>
        ) : null}
      </BottomSheet>
      <BottomSheet open={sortingSpaces} onClose={() => setSortingSpaces(false)} testID="pages-sort-sheet">
        <Text variant="label" tone="muted" style={{ paddingHorizontal: metrics.space.xl, paddingBottom: metrics.space.sm }}>
          {t("pages.sort.title")}
        </Text>
        {SPACE_SORTS.map((option) => (
          <Pressable
            key={option}
            onPress={() => {
              setSpaceSort((current) =>
                option === current.sortBy
                  ? { sortBy: option, sortDir: current.sortDir === "asc" ? "desc" : "asc" }
                  : // Dates newest first, names A to Z, as in a folder.
                    { sortBy: option, sortDir: option === "name" ? "asc" : "desc" },
              );
              setSortingSpaces(false);
            }}
            accessibilityRole="button"
            accessibilityLabel={sortLabel(option, t)}
            accessibilityState={{ selected: option === spaceSort.sortBy }}
            style={{ flexDirection: "row", alignItems: "center", minHeight: 52, paddingHorizontal: metrics.space.xl }}
            testID={`pages-sort-${option}`}
          >
            <Text style={{ flex: 1 }}>{sortLabel(option, t)}</Text>
            {option === spaceSort.sortBy ? <Check size={18} color={colors.accent} /> : null}
          </Pressable>
        ))}
      </BottomSheet>
      <BottomSheet open={menu} onClose={() => setMenu(false)} testID="pages-menu-sheet">
        <SheetRow icon={Upload} label={t("pages.uploads.title")} onPress={() => (setMenu(false), router.push("/pages/uploads"))} testID="pages-menu-uploads" />
        <SheetRow icon={Trash2} label={t("pages.places.trash")} onPress={() => (setMenu(false), router.push({ pathname: "/pages/drive", params: { view: "trash" } }))} testID="pages-menu-trash" />
      </BottomSheet>
    </Screen>
  );
}

