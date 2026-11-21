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
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useNav, useNavParams } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { crumbsFor } from "@/screens/pages/links";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearFade } from "@/screens/pages/drive/fade";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { LoadFailure } from "@/components/LoadFailure";
import { UnreadableNotice } from "@/components/UnreadableNotice";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { Check, Search } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { SORTS, pagesApi } from "@/api/pages";
import { FILTERS, listFilter, type Filter } from "@/screens/pages/drive/filters";
import { failureMessage } from "@/api/failure";
import { NameDialog } from "@/screens/pages/ItemSheet";
import { EmptyLine, formatBytes } from "@/screens/pages/parts";
import { planFolderUpload, startFolderUpload, type FolderPlan } from "@/screens/pages/pickFolder";
import { MAX_FOLDER_FILES } from "@/screens/pages/folderUpload";
import { openNode } from "@/screens/pages/navigation";
import { sortLabel, typeLabel } from "@/screens/pages/labels";
import { explainPick, pickDocuments, pickMedia, takePhotoOrVideo, type PickResult } from "@/screens/pages/addFiles";
import { NodeCollection } from "@/screens/pages/drive/NodeCollection";
import { BottomSheet, NewSheet } from "@/screens/pages/drive/sheets";
import { IconButton, NewFab, PagesTabBar, SortRow, UploadBar, useFolderSort, useViewPrefs } from "@/screens/pages/drive/ui";
import { useUploads } from "@/stores/uploads.store";
import { pagesKeys } from "@/api/keys";
import { useCreateFolder } from "@/screens/pages/usePageMutations";
import { useSpaceRights } from "@/screens/pages/permissions";
import { TransferSheet } from "@/screens/pages/TransferSheet";
import { pickZip } from "@/screens/pages/transferFiles";
import { transfersApi, type Transfer } from "@/api/transfers";

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
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const params = useNavParams<{ spaceId: string; parentId?: string; title?: string; trail?: string }>();
  const spaceId = Number(params.spaceId);
  const parentId = params.parentId ? Number(params.parentId) : null;
  // The folder's own record (its path, and its name when it was opened by
  // id alone, from "Show location") and the space's (its name, for the root
  // crumb). Both are cached: the rights already read the space.
  const folderNode = useQuery({
    queryKey: pagesKeys.node(spaceId, parentId ?? -1),
    queryFn: () => pagesApi.node(spaceId, parentId as number),
    enabled: Number.isFinite(spaceId) && parentId != null,
  });
  const spaceQuery = useQuery({ queryKey: pagesKeys.space(spaceId), queryFn: () => pagesApi.space(spaceId), enabled: Number.isFinite(spaceId) });
  const title = params.title || folderNode.data?.title || (parentId == null ? (spaceQuery.data?.title ?? "") : "");
  const trail = params.trail ?? "";
  // A tappable path (parity #8): every crumb opens the folder it names.
  const crumbs = useMemo(
    () =>
      spaceQuery.data && (parentId == null || folderNode.data)
        ? crumbsFor({ spaceId, spaceTitle: spaceQuery.data.title }, folderNode.data?.ancestors ?? [], folderNode.data ? { id: folderNode.data.id, title: folderNode.data.title } : null)
        : null,
    [spaceQuery.data, folderNode.data, parentId, spaceId],
  );

  // Kept across folders and restarts (audit P2, 2026-11-16), like the view.
  const sortBy = useFolderSort((s) => s.sortBy);
  const sortDir = useFolderSort((s) => s.sortDir);
  const setSort = useFolderSort((s) => s.setSort);
  const hydrateSort = useFolderSort((s) => s.hydrate);
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
    void hydrateSort();
  }, [hydrateUploads, hydrateView, hydrateSort]);

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

  // The space's permission decides every write here (audit P0 #2).
  const rights = useSpaceRights(spaceId);
  const rightsOf = useCallback(() => rights, [rights]);

  const here = [trail, title].filter(Boolean).join(" / ");
  const destination = useMemo(() => ({ spaceId, parentId, label: here || title }), [spaceId, parentId, here, title]);

  const add = useCallback(
    async (fn: () => Promise<PickResult>) => {
      const files = explainPick(await fn(), t);
      if (files) await enqueue(files, destination);
    },
    [enqueue, destination, t],
  );

  // Upload a folder (parity #24): read, refuse with the reason or confirm, then make and queue.
  const [readingFolder, setReadingFolder] = useState(false);
  const uploadFolder = useCallback(async () => {
    let plan: FolderPlan;
    try {
      plan = await planFolderUpload(() => setReadingFolder(true));
    } catch (e) {
      Alert.alert(failureMessage(e, t("pages.folderUpload.failed")));
      return;
    } finally {
      setReadingFolder(false);
    }
    if (plan.kind === "cancelled") return;
    if (plan.kind === "empty") {
      Alert.alert(t("pages.folderUpload.empty"));
      return;
    }
    if (plan.kind === "noRoom") {
      const size = formatBytes(plan.bytes, t, i18n.language);
      Alert.alert(t(plan.where === "server" ? "pages.folderUpload.noRoomServer" : "pages.folderUpload.noRoomDisk", { size }));
      return;
    }
    const { walked } = plan;
    const notes = [walked.skipped > 0 ? t("pages.folderUpload.skipped") : null, walked.truncated ? t("pages.folderUpload.truncated", { max: MAX_FOLDER_FILES }) : null].filter(Boolean);
    const body = [t("pages.folderUpload.confirm", { count: walked.files.length, size: formatBytes(walked.totalBytes, t, i18n.language), where: destination.label }), ...notes].join("\n\n");
    Alert.alert(t("pages.folderUpload.confirmTitle", { name: walked.folders[0]?.[0] ?? "" }), body, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("pages.folderUpload.start"),
        onPress: () =>
          void startFolderUpload(walked, { spaceId, parentId, label: destination.label }, enqueue)
            .then(() => client.invalidateQueries({ queryKey: pagesKeys.all }))
            .catch((e: unknown) => {
              void client.invalidateQueries({ queryKey: pagesKeys.all }); // folders made before the failure show
              Alert.alert(failureMessage(e, t("pages.folderUpload.failed")));
            }),
      },
    ]);
  }, [t, i18n.language, destination, spaceId, parentId, enqueue, client]);

  // Import a ZIP here (parity #25): its folders and files land in this folder.
  const [importing, setImporting] = useState<Transfer | null>(null);
  // New page (parity #22): named first, then opened in the editor.
  const [namingPage, setNamingPage] = useState(false);
  const [pageBusy, setPageBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const createPage = useCallback(
    async (name: string) => {
      setPageBusy(true);
      setPageError(null);
      try {
        const made = await pagesApi.createPage(spaceId, parentId, name);
        setNamingPage(false);
        router.push({ pathname: "/pages/edit", params: { spaceId: String(spaceId), nodeId: String(made.id), title: made.title } });
      } catch (e) {
        setPageError(failureMessage(e, t("pages.page.createFailed")));
      } finally {
        setPageBusy(false);
      }
    },
    [spaceId, parentId, t, router],
  );
  const importZip = useCallback(async () => {
    try {
      const zip = await pickZip();
      if (zip === "not-zip") return Alert.alert(t("pages.copy.notZip"));
      if (!zip) return;
      setImporting(await transfersApi.importZip(zip, { spaceId, parentNodeId: parentId }));
    } catch (e) {
      Alert.alert(failureMessage(e, t("pages.actions.failed")));
    }
  }, [spaceId, parentId, t]);

  const creating = useCreateFolder();
  const createFolder = useCallback(
    async (name: string) => {
      setNameBusy(true);
      setNameError(null);
      try {
        await creating.mutateAsync({ spaceId, parentId, title: name });
        setNaming(false);
      } catch (e) {
        setNameError(failureMessage(e, t("pages.save.folderFailed")));
      } finally {
        setNameBusy(false);
      }
    },
    [spaceId, parentId, creating, t],
  );

  // The folder's own row, under the shared header: where it is, and search.
  // A selection replaces this row, never the shared header.
  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: metrics.space.xs, paddingVertical: metrics.space.xs }}>
      {crumbs && crumbs.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ alignItems: "center" }} accessibilityLabel={t("pages.path.label")} testID="pages-folder-path">
          {crumbs.map((c, i) => (
            <View key={c.key} style={{ flexDirection: "row", alignItems: "center" }}>
              {i > 0 ? (
                <Text variant="caption" tone="muted" style={{ paddingHorizontal: 2 }}>
                  {"/"}
                </Text>
              ) : null}
              {c.target ? (
                <Pressable
                  onPress={() => {
                    const to = c.target;
                    if (!to) return;
                    router.push({ pathname: "/pages/folder", params: to.parentId == null ? { spaceId: String(to.spaceId), title: to.title } : { spaceId: String(to.spaceId), parentId: String(to.parentId), title: to.title, trail: to.trail } });
                  }}
                  accessibilityRole="link"
                  accessibilityLabel={t("pages.path.open", { name: c.label })}
                  hitSlop={8}
                  style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 4 }}
                  testID={`pages-crumb-${c.key}`}
                >
                  <Text variant="caption" tone="accent" numberOfLines={1} style={{ maxWidth: 160 }}>
                    {c.label}
                  </Text>
                </Pressable>
              ) : (
                <Text variant="caption" tone="muted" numberOfLines={1} style={{ maxWidth: 160, paddingHorizontal: 4 }}>
                  {c.label}
                </Text>
              )}
            </View>
          ))}
        </ScrollView>
      ) : trail ? (
        <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }} testID="pages-folder-trail">
          {trail}
        </Text>
      ) : null}
      <IconButton icon={Search} label={t("pages.search")} onPress={() => router.push({ pathname: "/pages/drive", params: { view: "search" } })} testID="pages-open-search" />
    </View>
  );

  return (
    <Screen measure={false} header={<AppHeader app="pages" title={title || undefined} back />}>
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
          rightsOf={rightsOf}
        />
        {/* A viewer adds nothing here (the web's `buildNewMenu`: no canWrite, no menu). */}
        {selecting || !rights.canWrite ? null : <NewFab onPress={() => setAdding(true)} />}
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
        onImportZip={rights.canWrite ? () => void importZip() : undefined}
        onPage={rights.canWrite ? () => setNamingPage(true) : undefined}
        onUploadFolder={rights.canWrite ? () => void uploadFolder() : undefined}
      />
      <TransferSheet started={importing} onClose={() => setImporting(null)} />
      {readingFolder ? (
        <View testID="pages-folder-reading" accessibilityLiveRegion="polite" style={{ position: "absolute", left: metrics.space.lg, right: metrics.space.lg, bottom: metrics.space.xl, flexDirection: "row", alignItems: "center", gap: metrics.space.sm, padding: metrics.space.md, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <ActivityIndicator color={colors.accent} />
          <Text>{t("pages.folderUpload.reading")}</Text>
        </View>
      ) : null}
      <NameDialog
        open={namingPage}
        title={t("pages.page.new")}
        confirm={t("pages.page.create")}
        initial=""
        onCancel={() => setNamingPage(false)}
        onSubmit={(name) => void createPage(name)}
        busy={pageBusy}
        error={pageError}
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
              if (option === sortBy) setSort(option, sortDir === "asc" ? "desc" : "asc");
              // Dates newest first, names A→Z: what anybody means by each.
              else setSort(option, option === "name" || option === "type" ? "asc" : "desc");
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
