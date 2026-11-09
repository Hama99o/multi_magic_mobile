/**
 * SAVE TO PAGES — the destination picker. `docs/design/pages/SPEC.md` §3.
 *
 * Every way a file comes in ends here: the share sheet of Photos or Files,
 * and the "+ New" sheet in Pages. It answers one question, WHERE, and then
 * gets out of the way, because the upload itself runs in the queue
 * (`stores/uploads.store.ts`), not on this screen.
 *
 * Dressed like the rest of Pages (the owner, 2026-11-06: "like Google
 * Drive"), from the references (SPEC §1):
 * - Dropbox's "Choose a folder": the files as a strip of thumbnails at the
 *   top, so he sees what he is about to send; ONE full-width button below.
 * - Google Drive's "Upload to Drive": the location is shown before anything
 *   is chosen, it starts where the last upload went, and suggested folders
 *   (here: Recent) come first.
 * - Drive's folder search, across every space (`drive?view=search&kind=folder`).
 *
 * And his own habit, which no reference has: a folder per day, so the first
 * action in any space is "Today's folder (2026-11-06)" — one tap creates it
 * or opens it.
 *
 * Shared spaces are listed beside his own, and the view-only ones are greyed
 * with the reason rather than failing after the upload (`savePicker.ts`).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { LoadFailure } from "@/components/LoadFailure";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { CalendarDays, ChevronRight, Clock, Eye, File, Folder, Play, Plus, Search, X } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { pagesApi, type PageNode, type SharedItem, type Space } from "@/api/pages";
import { failureMessage } from "@/api/failure";
import { usePendingImport } from "@/screens/pages/addFiles";
import { EmptyLine, PagesHeader, formatBytes } from "@/screens/pages/parts";
import {
  accessResolver,
  asPlace,
  matchingSpaces,
  parentOf,
  placeFromFolder,
  placeFromShare,
  placeLabel,
  type Place,
} from "@/screens/pages/savePicker";
import {
  loadLastDestination,
  loadRecentDestinations,
  saveLastDestination,
  todayFolderName,
  useUploads,
  type IncomingFile,
  type LastDestination,
} from "@/stores/uploads.store";

const THUMB = 64;

function Thumb({ file }: { file: IncomingFile }) {
  const colors = useColors();
  const metrics = useMetrics();
  const isImage = (file.mimeType ?? "").startsWith("image/");
  const isVideo = (file.mimeType ?? "").startsWith("video/");
  return (
    <View
      style={{
        width: THUMB,
        height: THUMB,
        borderRadius: metrics.radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {isImage ? (
        <ExpoImage source={{ uri: file.uri }} style={{ width: THUMB, height: THUMB }} contentFit="cover" />
      ) : isVideo ? (
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#00000088", alignItems: "center", justifyContent: "center" }}>
          <Play size={16} color="#ffffff" fill="#ffffff" />
        </View>
      ) : (
        <File size={26} color={colors.inkMuted} />
      )}
    </View>
  );
}

/** A Drive-style destination row: glyph · name · subtitle · chevron. */
function PlaceRow({
  glyph,
  title,
  subtitle,
  onPress,
  disabled,
  testID,
}: {
  glyph: ReactNode;
  title: string;
  subtitle?: string | null;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 60, paddingVertical: metrics.space.xs, opacity: disabled ? 0.55 : 1 }}
      testID={testID}
    >
      <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>{glyph}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {disabled ? <Eye size={18} color={colors.inkMuted} /> : <ChevronRight size={18} color={colors.inkMuted} />}
    </Pressable>
  );
}

function SectionTitle({ label, testID }: { label: string; testID?: string }) {
  const metrics = useMetrics();
  return (
    <Text variant="label" tone="muted" style={{ paddingTop: metrics.space.lg, paddingBottom: metrics.space.xs }} accessibilityRole="header" testID={testID}>
      {label}
    </Text>
  );
}

function SpaceGlyph({ icon }: { icon: string | null }) {
  const colors = useColors();
  return icon ? <Text style={{ fontSize: 24 }}>{icon}</Text> : <Folder size={24} color={colors.inkMuted} fill={colors.inkMuted} />;
}

function FolderGlyph() {
  const colors = useColors();
  return <Folder size={24} color={colors.inkMuted} fill={colors.inkMuted} />;
}

type HomeItem =
  | { key: string; type: "title"; label: string; testID?: string }
  | { key: string; type: "recent"; destination: LastDestination; place: Place }
  | { key: string; type: "space"; space: Space }
  | { key: string; type: "share"; share: SharedItem; canWrite: boolean };

export default function SaveToPages() {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const files = usePendingImport((s) => s.files);
  const onDone = usePendingImport((s) => s.onDone);
  const clearPending = usePendingImport((s) => s.clear);
  const enqueue = useUploads((s) => s.enqueue);

  const [place, setPlace] = useState<Place | null>(null);
  const [recents, setRecents] = useState<LastDestination[]>([]);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searching = query.trim().length >= 2;

  // Start where the last upload went (Google Drive's "Location").
  useEffect(() => {
    void (async () => {
      const [last, recent] = await Promise.all([loadLastDestination(), loadRecentDestinations()]);
      const lastPlace = asPlace(last?.place);
      if (lastPlace) setPlace(lastPlace);
      setRecents(recent);
      setRestored(true);
    })();
  }, []);

  const totalBytes = useMemo(() => files.reduce((n, f) => n + (f.size ?? 0), 0), [files]);

  const spaces = useQuery({ queryKey: ["pages", "spaces", "picker"], queryFn: () => pagesApi.spaces(1) });
  const shared = useQuery({ queryKey: ["pages", "shared"], queryFn: () => pagesApi.sharedWithMe() });
  const accessFor = useMemo(
    () => accessResolver(spaces.data?.rows ?? [], shared.data?.rows ?? []),
    [spaces.data, shared.data],
  );
  const listsLoaded = Boolean(spaces.data && shared.data);

  const parentId = place ? parentOf(place) : null;
  const folders = useInfiniteQuery({
    queryKey: ["pages", "folders", place?.space.id, parentId],
    queryFn: ({ pageParam }) =>
      pagesApi.children(place!.space.id, parentId, pageParam, { kind: "folder", sortBy: "name", sortDir: "asc" }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled: place != null && !searching,
  });
  const folderRows = useMemo(() => (folders.data?.pages ?? []).flatMap((p) => p.rows), [folders.data]);

  const found = useQuery({
    queryKey: ["pages", "folder-search", query.trim()],
    queryFn: () => pagesApi.drive("search", 1, { search: query.trim(), kind: "folder" }),
    enabled: searching,
  });

  // Unknown access (still loading) counts as writable: the server decides.
  const placeAccess = place ? accessFor(place.space.id) : null;
  const canWriteHere = place != null && (!listsLoaded || placeAccess?.canWrite !== false);

  const enterFolder = useCallback((folder: Pick<PageNode, "id" | "title">) => {
    setPlace((current) => (current ? { ...current, path: [...current.path, { id: folder.id, title: folder.title }] } : current));
  }, []);

  /** A search hit: opened with its ancestors, so the breadcrumb is right. */
  const openFound = useCallback(
    async (folder: PageNode) => {
      const space = folder.space ?? { id: folder.spaceId, title: "", icon: null };
      const whole = spaces.data?.rows.some((s) => s.id === space.id) || shared.data?.rows.some((s) => s.space.id === space.id && !s.node);
      // The upload button is under the keyboard; a choice made is a search done.
      Keyboard.dismiss();
      setBusy(true);
      setError(null);
      try {
        const full = await pagesApi.node(space.id, folder.id);
        setPlace(placeFromFolder(full, space, Boolean(whole)));
      } catch {
        setPlace(placeFromFolder({ ...folder, ancestors: [] }, space, false));
      } finally {
        setBusy(false);
        setQuery("");
      }
    },
    [spaces.data, shared.data],
  );

  const makeFolder = useCallback(
    async (name: string) => {
      if (!place) return;
      setBusy(true);
      setError(null);
      try {
        const created = await pagesApi.createFolder(place.space.id, parentId, name);
        void queryClient.invalidateQueries({ queryKey: ["pages"] });
        setNewName(null);
        enterFolder(created);
      } catch (e) {
        setError(failureMessage(e, t("pages.save.folderFailed")));
      } finally {
        setBusy(false);
      }
    },
    [place, parentId, enterFolder, queryClient, t],
  );

  /** One tap: today's folder, made if missing, entered either way. */
  const goToToday = useCallback(() => {
    const name = todayFolderName();
    const existing = folderRows.find((f) => f.title === name);
    if (existing) enterFolder(existing);
    else void makeFolder(name);
  }, [folderRows, enterFolder, makeFolder]);

  const save = useCallback(async () => {
    if (!place || files.length === 0 || !canWriteHere) return;
    setBusy(true);
    const destination = { spaceId: place.space.id, parentId, label: placeLabel(place) };
    await saveLastDestination({ ...destination, place });
    await enqueue(files, destination);
    onDone?.();
    clearPending();
    setBusy(false);
    router.replace("/pages/uploads");
  }, [place, files, parentId, canWriteHere, enqueue, onDone, clearPending]);

  const cancel = useCallback(() => {
    onDone?.();
    clearPending();
    if (router.canGoBack?.()) router.back();
    else router.replace("/pages");
  }, [onDone, clearPending]);

  // ── The first screen: Recent, My spaces, Shared with me ──────────────────
  const homeItems = useMemo<HomeItem[]>(() => {
    const items: HomeItem[] = [];
    const usableRecents = recents
      .map((destination) => ({ destination, place: asPlace(destination.place) }))
      .filter((r): r is { destination: LastDestination; place: Place } => r.place != null)
      .filter((r) => !listsLoaded || accessFor(r.destination.spaceId)?.canWrite === true);
    if (usableRecents.length) {
      items.push({ key: "t-recent", type: "title", label: t("pages.save.recent"), testID: "pages-save-recent-title" });
      usableRecents.forEach((r) => items.push({ key: `r-${r.destination.spaceId}-${r.destination.parentId}`, type: "recent", ...r }));
    }
    const mine = spaces.data?.rows ?? [];
    if (mine.length) {
      items.push({ key: "t-mine", type: "title", label: t("pages.save.mySpaces") });
      mine.forEach((space) => items.push({ key: `s-${space.id}`, type: "space", space }));
    }
    const shares = shared.data?.rows ?? [];
    if (shares.length) {
      items.push({ key: "t-shared", type: "title", label: t("pages.save.sharedWithMe") });
      shares.forEach((share) => items.push({ key: `h-${share.id}`, type: "share", share, canWrite: share.permission !== "viewer" }));
    }
    return items;
  }, [recents, spaces.data, shared.data, listsLoaded, accessFor, t]);

  const renderHomeItem = ({ item }: { item: HomeItem }) => {
    switch (item.type) {
      case "title":
        return <SectionTitle label={item.label} testID={item.testID} />;
      case "recent":
        return (
          <PlaceRow
            glyph={<Clock size={22} color={colors.inkMuted} />}
            title={item.place.path.at(-1)?.title ?? item.place.space.title}
            subtitle={item.destination.label}
            onPress={() => setPlace(item.place)}
            testID="pages-save-recent"
          />
        );
      case "space":
        return (
          <PlaceRow
            glyph={<SpaceGlyph icon={item.space.icon} />}
            title={item.space.title}
            onPress={() => setPlace({ space: { id: item.space.id, title: item.space.title, icon: item.space.icon }, path: [], floor: 0 })}
            testID="pages-save-space"
          />
        );
      case "share":
        return (
          <PlaceRow
            glyph={item.share.node ? <FolderGlyph /> : <SpaceGlyph icon={item.share.space.icon} />}
            title={item.share.node?.title ?? item.share.space.title}
            subtitle={
              item.canWrite
                ? item.share.node
                  ? t("pages.save.sharedFolderIn", { space: item.share.space.title })
                  : null
                : t("pages.save.viewOnly")
            }
            disabled={!item.canWrite}
            onPress={() => setPlace(placeFromShare(item.share))}
            testID={item.canWrite ? "pages-save-shared" : "pages-save-shared-readonly"}
          />
        );
    }
  };

  // ── Search results: matching spaces, then folders anywhere ───────────────
  const spaceHits = searching ? matchingSpaces(spaces.data?.rows ?? [], query) : [];
  const folderHits = found.data?.rows ?? [];

  const floor = place?.floor ?? 0;
  const today = todayFolderName();
  const atToday = place?.path.at(-1)?.title === today;

  const crumb = (label: string, onPress: (() => void) | null, current: boolean, key: string | number, testID?: string) => (
    <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
      <Pressable
        onPress={onPress ?? undefined}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !onPress }}
        hitSlop={8}
        testID={testID}
      >
        <Text tone={current || !onPress ? "default" : "accent"} variant={current ? "label" : "body"}>
          {label}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <Screen measure>
      <PagesHeader
        title={t("pages.save.title")}
        subtitle={
          files.length > 0
            ? t("pages.save.summary", { count: files.length, size: formatBytes(totalBytes, t, i18n.language) })
            : null
        }
        onBack={cancel}
      />

      {files.length === 0 ? (
        <EmptyLine title={t("pages.save.nothingTitle")} body={t("pages.save.nothingBody")} testID="pages-save-nothing" />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: metrics.space.sm }} style={{ flexGrow: 0 }}>
            {files.slice(0, 30).map((file, index) => (
              <Thumb key={`${file.uri}-${index}`} file={file} />
            ))}
          </ScrollView>

          {/* Drive's search pill, for folders in every space. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: metrics.space.sm,
              minHeight: 48,
              marginTop: metrics.space.md,
              paddingHorizontal: metrics.space.md,
              borderRadius: metrics.radius.pill,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Search size={20} color={colors.inkMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("pages.save.searchFolders")}
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel={t("pages.save.searchFolders")}
              returnKeyType="search"
              autoCorrect={false}
              style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }}
              testID="pages-save-search"
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} accessibilityRole="button" accessibilityLabel={t("pages.save.clearSearch")} hitSlop={8} testID="pages-save-search-clear">
                <X size={20} color={colors.inkMuted} />
              </Pressable>
            ) : null}
          </View>

          {searching ? (
            <View style={{ flex: 1, paddingTop: metrics.space.sm }}>
              <LoadFailure
                error={found.error}
                loadFailed={t("pages.loadFailed")}
                hasData={Boolean(found.data)}
                updatedAt={found.dataUpdatedAt}
                onRetry={() => void found.refetch()}
                testID="pages-save-load-failed"
              />
              <FlatList
                data={[
                  ...spaceHits.map((space) => ({ key: `s-${space.id}`, space, folder: null as PageNode | null })),
                  ...folderHits.map((folder) => ({ key: `f-${folder.id}`, space: null as Space | null, folder })),
                ]}
                keyExtractor={(row) => row.key}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  found.isLoading ? (
                    <RowsSkeleton rows={3} />
                  ) : found.error ? null : (
                    <Text tone="muted" style={{ paddingVertical: metrics.space.lg }} testID="pages-save-no-matches">
                      {t("pages.save.noMatches", { query: query.trim() })}
                    </Text>
                  )
                }
                renderItem={({ item }) => {
                  if (item.space) {
                    const space = item.space;
                    return (
                      <PlaceRow
                        glyph={<SpaceGlyph icon={space.icon} />}
                        title={space.title}
                        onPress={() => {
                          Keyboard.dismiss();
                          setPlace({ space: { id: space.id, title: space.title, icon: space.icon }, path: [], floor: 0 });
                          setQuery("");
                        }}
                        testID="pages-save-result"
                      />
                    );
                  }
                  const folder = item.folder!;
                  const writable = !listsLoaded || accessFor(folder.spaceId)?.canWrite !== false;
                  return (
                    <PlaceRow
                      glyph={<FolderGlyph />}
                      title={folder.title}
                      subtitle={writable ? (folder.space?.title ?? null) : t("pages.save.viewOnly")}
                      disabled={!writable || busy}
                      onPress={() => void openFound(folder)}
                      testID={writable ? "pages-save-result" : "pages-save-result-readonly"}
                    />
                  );
                }}
              />
            </View>
          ) : place == null ? (
            <View style={{ flex: 1 }}>
              <LoadFailure
                error={spaces.error ?? shared.error}
                loadFailed={t("pages.loadFailed")}
                hasData={Boolean(spaces.data)}
                updatedAt={spaces.dataUpdatedAt}
                onRetry={() => {
                  void spaces.refetch();
                  void shared.refetch();
                }}
                testID="pages-save-load-failed"
              />
              <FlatList
                data={restored ? homeItems : []}
                keyExtractor={(item) => item.key}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={spaces.isLoading || !restored ? <RowsSkeleton rows={5} /> : null}
                renderItem={renderHomeItem}
                testID="pages-save-places"
              />
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              {/* Where it will go: the breadcrumb is the location, tappable. */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, paddingTop: metrics.space.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
                  {crumb(t("pages.save.allSpaces"), () => setPlace(null), false, "root", "pages-save-crumb-root")}
                  {[{ id: -1, title: `${place.space.icon ?? ""} ${place.space.title}`.trim() }, ...place.path].map((step, index) => {
                    const last = index === place.path.length;
                    const reachable = index >= floor && !last;
                    return (
                      <View key={`${step.id}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
                        <ChevronRight size={14} color={colors.inkMuted} />
                        {crumb(step.title, reachable ? () => setPlace({ ...place, path: place.path.slice(0, index) }) : null, last, index)}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>

              {!canWriteHere ? (
                <View style={{ flexDirection: "row", gap: metrics.space.sm, alignItems: "center", paddingTop: metrics.space.md }} testID="pages-save-readonly">
                  <Eye size={18} color={colors.inkMuted} />
                  <Text tone="muted" style={{ flex: 1 }}>
                    {t("pages.save.viewOnly")}
                  </Text>
                </View>
              ) : null}

              {error ? (
                <Text tone="danger" style={{ paddingTop: metrics.space.sm }} testID="pages-save-error">
                  {error}
                </Text>
              ) : null}

              {canWriteHere ? (
                <View style={{ flexDirection: "row", gap: metrics.space.sm, paddingTop: metrics.space.md, flexWrap: "wrap" }}>
                  {atToday ? null : (
                    <Pressable
                      onPress={goToToday}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={t("pages.save.today", { date: today })}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: metrics.space.xs,
                        backgroundColor: `${colors.accent}22`,
                        borderRadius: metrics.radius.pill,
                        paddingHorizontal: metrics.space.md,
                        minHeight: 40,
                      }}
                      testID="pages-save-today"
                    >
                      <CalendarDays size={16} color={colors.accent} />
                      <Text tone="accent" variant="label">
                        {t("pages.save.today", { date: today })}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => setNewName("")}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={t("pages.save.newFolder")}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: metrics.space.xs,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: metrics.radius.pill,
                      paddingHorizontal: metrics.space.md,
                      minHeight: 40,
                    }}
                    testID="pages-save-new-folder"
                  >
                    <Plus size={16} color={colors.ink} />
                    <Text variant="label">{t("pages.save.newFolder")}</Text>
                  </Pressable>
                </View>
              ) : null}

              {newName != null ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingTop: metrics.space.md }}>
                  <TextInput
                    value={newName}
                    onChangeText={setNewName}
                    autoFocus
                    placeholder={t("pages.save.folderName")}
                    placeholderTextColor={colors.inkMuted}
                    onSubmitEditing={() => newName.trim() && void makeFolder(newName.trim())}
                    returnKeyType="done"
                    accessibilityLabel={t("pages.save.folderName")}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: metrics.radius.md,
                      paddingHorizontal: metrics.space.md,
                      color: colors.ink,
                      backgroundColor: colors.surface,
                    }}
                    testID="pages-save-folder-name"
                  />
                  <Button
                    label={t("pages.save.create")}
                    block={false}
                    busy={busy}
                    onPress={() => newName.trim() && void makeFolder(newName.trim())}
                    testID="pages-save-folder-create"
                  />
                </View>
              ) : null}

              <LoadFailure
                error={folders.error}
                loadFailed={t("pages.loadFailed")}
                hasData={Boolean(folders.data)}
                updatedAt={folders.dataUpdatedAt}
                onRetry={() => void folders.refetch()}
                testID="pages-save-load-failed"
              />
              <FlatList
                data={folderRows}
                keyExtractor={(f) => String(f.id)}
                style={{ marginTop: metrics.space.sm }}
                onEndReached={() => {
                  if (folders.hasNextPage && !folders.isFetchingNextPage) void folders.fetchNextPage();
                }}
                ListEmptyComponent={
                  folders.isLoading ? (
                    <RowsSkeleton rows={4} />
                  ) : folders.error ? null : (
                    <Text tone="muted" style={{ paddingVertical: metrics.space.lg }} testID="pages-save-no-folders">
                      {t("pages.save.noFolders")}
                    </Text>
                  )
                }
                ListFooterComponent={folders.isFetchingNextPage ? <ActivityIndicator color={colors.inkMuted} /> : null}
                renderItem={({ item }) => (
                  <PlaceRow glyph={<FolderGlyph />} title={item.title} onPress={() => enterFolder(item)} testID="pages-save-folder" />
                )}
              />
            </View>
          )}

          <View style={{ paddingTop: metrics.space.md, paddingBottom: metrics.space.md + insets.bottom, gap: metrics.space.xs }}>
            {place ? (
              <Text variant="caption" tone="muted" numberOfLines={1} testID="pages-save-location">
                {t("pages.save.locationIs", { place: placeLabel(place) })}
              </Text>
            ) : null}
            <Button
              label={
                place
                  ? t("pages.save.uploadHere", { count: files.length, place: place.path.at(-1)?.title ?? place.space.title })
                  : t("pages.save.pickPlace")
              }
              disabled={!place || !canWriteHere}
              busy={busy}
              onPress={() => void save()}
              testID="pages-save-here"
            />
          </View>
        </>
      )}
    </Screen>
  );
}
