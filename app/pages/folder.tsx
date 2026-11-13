/**
 * A SPACE, or a folder inside one — Drive's folder screen.
 * `docs/design/pages/DRIVE_SIDE_BY_SIDE.md` §Folder.
 *
 * Params: `spaceId`, optional `parentId` (absent = the space's root),
 * `title`, `trail` (the names above, for the subtitle and Details).
 *
 * The header names the folder; the sort row ("Name ↑" + the list/grid
 * toggle) and the type chips scroll with the items; "+" adds HERE (a new
 * folder, photos and videos, files, the camera). Folders first, whatever the
 * sort (`FOLDERS_FIRST`, `node_sorting.rb`): the server does it, because the
 * list is paged and a client sort would put page two's folders after page
 * one's files. 25 a page.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearFade } from "@/screens/pages/drive/fade";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { AiButton } from "@/components/AiButton";
import { LoadFailure } from "@/components/LoadFailure";
import { UnreadableNotice } from "@/components/UnreadableNotice";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { Check, ChevronLeft, Search } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { SORTS, pagesApi, type SortBy, type SortDir } from "@/api/pages";
import { FILTERS, listFilter, type Filter } from "@/screens/pages/drive/filters";
import { failureMessage } from "@/api/failure";
import { NameDialog } from "@/screens/pages/ItemSheet";
import { EmptyLine } from "@/screens/pages/parts";
import { openNode } from "@/screens/pages/navigation";
import { sortLabel, typeLabel } from "@/screens/pages/labels";
import { explainPick, pickDocuments, pickMedia, takePhotoOrVideo, type PickResult } from "@/screens/pages/addFiles";
import { NodeCollection } from "@/screens/pages/drive/NodeCollection";
import { BottomSheet, NewSheet } from "@/screens/pages/drive/sheets";
import { IconButton, NewFab, PagesTabBar, SortRow, UploadBar, useViewPrefs } from "@/screens/pages/drive/ui";
import { useUploads } from "@/stores/uploads.store";
import { pagesKeys } from "@/api/keys";

function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{
        minHeight: 36,
        paddingHorizontal: metrics.space.md,
        borderRadius: metrics.radius.sm,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? `${colors.accent}22` : "transparent",
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      }}
      testID={testID}
    >
      {selected ? <Check size={14} color={colors.accent} /> : null}
      <Text variant="label" tone={selected ? "accent" : "default"}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function Folder() {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ spaceId: string; parentId?: string; title?: string; trail?: string }>();
  const spaceId = Number(params.spaceId);
  const parentId = params.parentId ? Number(params.parentId) : null;
  const title = params.title ?? "";
  const trail = params.trail ?? "";

  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [type, setType] = useState<Filter | null>(null);
  const [sorting, setSorting] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [naming, setNaming] = useState(false);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const hydrateUploads = useUploads((s) => s.hydrate);
  const hydrateView = useViewPrefs((s) => s.hydrate);
  const enqueue = useUploads((s) => s.enqueue);

  useEffect(() => {
    void hydrateUploads();
    void hydrateView();
  }, [hydrateUploads, hydrateView]);

  const { data, isLoading, error, refetch, isRefetching, dataUpdatedAt, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: pagesKeys.children(spaceId, parentId, sortBy, sortDir, type),
    queryFn: ({ pageParam }) => pagesApi.children(spaceId, parentId, pageParam, { sortBy, sortDir, ...listFilter(type) }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled: Number.isFinite(spaceId),
  });

  const nodes = useMemo(() => {
    const seen = new Set<number>();
    return (data?.pages ?? []).flatMap((p) => p.rows).filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
  }, [data]);

  const here = [trail, title].filter(Boolean).join(" / ");
  const destination = useMemo(() => ({ spaceId, parentId, label: here || title }), [spaceId, parentId, here, title]);

  const add = useCallback(
    async (fn: () => Promise<PickResult>) => {
      const files = explainPick(await fn(), t);
      if (files) await enqueue(files, destination);
    },
    [enqueue, destination, t],
  );

  const createFolder = useCallback(
    async (name: string) => {
      setNameBusy(true);
      setNameError(null);
      try {
        await pagesApi.createFolder(spaceId, parentId, name);
        setNaming(false);
        void queryClient.invalidateQueries({ queryKey: pagesKeys.all });
      } catch (e) {
        setNameError(failureMessage(e, t("pages.save.folderFailed")));
      } finally {
        setNameBusy(false);
      }
    },
    [spaceId, parentId, queryClient, t],
  );

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs, paddingVertical: metrics.space.sm, minHeight: 60 }}>
      <IconButton icon={ChevronLeft} label={t("common.back")} onPress={() => router.back()} tone="ink" testID="pages-back" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="title" numberOfLines={1} accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28 }}>
          {title}
        </Text>
        {trail ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {trail}
          </Text>
        ) : null}
      </View>
      <IconButton icon={Search} label={t("pages.search")} onPress={() => router.push({ pathname: "/pages/drive", params: { view: "search" } })} testID="pages-open-search" />
      {/* The assistant from every screen (docs/QA_FULL.md F4). */}
      <AiButton compact />
    </View>
  );

  return (
    <Screen measure={false}>
      <View style={{ flex: 1 }}>
        <NodeCollection
          testID="pages-folder-list"
          nodes={nodes}
          top={header}
          header={
            <View style={{ gap: metrics.space.xs, paddingBottom: metrics.space.sm }}>
              <SortRow label={sortLabel(sortBy, t)} ascending={sortDir === "asc"} onSort={() => setSorting(true)} />
              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: metrics.space.sm, paddingRight: 32 }}>
                  <Chip label={typeLabel(null, t)} selected={type == null} onPress={() => setType(null)} testID="pages-type-all" />
                  {FILTERS.map((f) => (
                    <Chip key={f} label={typeLabel(f, t)} selected={type === f} onPress={() => setType(type === f ? null : f)} testID={`pages-type-${f}`} />
                  ))}
                </ScrollView>
                {/* The edge fade: the row visibly continues, so a clipped
                    "Documents" reads as "more this way", not as a bug. */}
                <LinearFade color={colors.ground} width={32} />
              </View>
              <UnreadableNotice count={(data?.pages ?? []).reduce((n, p) => n + p.unreadable, 0)} />
              <LoadFailure error={error} loadFailed={t("pages.loadFailed")} hasData={Boolean(data)} updatedAt={dataUpdatedAt} onRetry={() => void refetch()} testID="pages-folder-load-failed" padded={false} />
            </View>
          }
          empty={
            isLoading ? (
              <RowsSkeleton />
            ) : error ? null : (
              <EmptyLine title={type ? t("pages.emptyFiltered") : t("pages.emptyFolder")} body={type ? undefined : t("pages.emptyFolderBody")} testID="pages-folder-empty" />
            )
          }
          loadingMore={isFetchingNextPage}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          onOpen={(node) => openNode(node, { trail: here })}
          locationOf={() => here}
          bottomPadding={96 + insets.bottom}
          onSelectingChange={setSelecting}
        />
        {selecting ? null : <NewFab onPress={() => setAdding(true)} />}
      </View>
      <View style={{ marginHorizontal: -metrics.space.lg, marginBottom: -insets.bottom }}>
        <UploadBar />
        {/* Drive keeps its tabs inside a folder; one tap goes back to the
            tab, the folder stack closing behind it (QA_DEEP #14). */}
        <PagesTabBar tab="files" onTab={(tab) => router.navigate({ pathname: "/pages", params: { tab } })} />
      </View>

      <NewSheet
        open={adding}
        onClose={() => setAdding(false)}
        onFolder={() => setNaming(true)}
        onMedia={() => void add(pickMedia)}
        onFiles={() => void add(pickDocuments)}
        onCamera={() => void add(takePhotoOrVideo)}
      />
      <NameDialog
        open={naming}
        title={t("pages.new.folder")}
        confirm={t("pages.save.create")}
        onCancel={() => {
          setNaming(false);
          setNameError(null);
        }}
        onSubmit={(name) => void createFolder(name)}
        busy={nameBusy}
        error={nameError}
      />
      <BottomSheet open={sorting} onClose={() => setSorting(false)} testID="pages-sort-sheet">
        <Text variant="label" tone="muted" style={{ paddingHorizontal: metrics.space.xl, paddingBottom: metrics.space.sm }}>
          {t("pages.sort.title")}
        </Text>
        {SORTS.map((option) => (
          <Pressable
            key={option}
            onPress={() => {
              if (option === sortBy) setSortDir(sortDir === "asc" ? "desc" : "asc");
              else {
                setSortBy(option);
                // Dates newest first, names A→Z: what anybody means by each.
                setSortDir(option === "name" || option === "type" ? "asc" : "desc");
              }
              setSorting(false);
            }}
            accessibilityRole="button"
            accessibilityLabel={sortLabel(option, t)}
            accessibilityState={{ selected: option === sortBy }}
            style={{ flexDirection: "row", alignItems: "center", minHeight: 52, paddingHorizontal: metrics.space.xl }}
            testID={`pages-sort-${option}`}
          >
            <Text style={{ flex: 1 }}>{sortLabel(option, t)}</Text>
            {option === sortBy ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
                <Text variant="caption" tone="muted">
                  {sortDir === "asc" ? t("pages.sort.asc") : t("pages.sort.desc")}
                </Text>
                <Check size={18} color={colors.accent} />
              </View>
            ) : null}
          </Pressable>
        ))}
      </BottomSheet>
    </Screen>
  );
}
