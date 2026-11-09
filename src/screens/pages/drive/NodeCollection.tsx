/**
 * ANY LIST OF ITEMS, IN EITHER VIEW, WITH EVERY ACTION — one component, so
 * list and grid can never drift apart (the owner: "both are important, make
 * sure every option works"). Used by the tabs (Home, Starred, Shared),
 * a folder, and search.
 *
 * - View: `useViewPrefs` (list or grid, kept across restarts, like Drive).
 * - Selection: a long press starts it (Drive), a tap then toggles; the
 *   search pill becomes a selection bar with Download, Star, Move and Trash
 *   (Download for anyone who can see the files; the rest need write access).
 * - "⋯" on a row or a card opens the actions sheet; every action
 *   invalidates the `["pages"]` queries so each list shows the result.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, View } from "react-native";
import { Text } from "@/components/reusables/text";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FolderInput, Star, Trash2 } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { pagesApi, type PageNode } from "@/api/pages";
import { failureMessage } from "@/api/failure";
import { NameDialog, shareNode } from "../ItemSheet";
import { downloadMany } from "../downloadMany";
import { ActionsSheet, DetailsSheet, MoveSheet } from "./sheets";
import { GridCard, IconButton, ListRow, SelectionBar, useViewPrefs } from "./ui";

const GAP = 12;

/** How long the "moved to the trash · Undo" bar stays. */
const UNDO_MS = 6000;
/** Clears the 56 px "+" button and its margin (`NewFab`). */
const UNDO_BAR_LIFT = 92;

/** Closes a row of folders in the grid; never a node. */
const SPACER = { spacer: true } as const;

export function NodeCollection({
  nodes,
  top,
  header,
  empty,
  loadingMore,
  onEndReached,
  refreshing,
  onRefresh,
  onOpen,
  showSpace = false,
  locationOf,
  canWrite = true,
  bottomPadding = 96,
  onSelectingChange,
  testID,
}: {
  nodes: PageNode[];
  /** The search pill or a folder's header; the selection bar replaces it. */
  top: ReactNode;
  /** Sort row, chips, banners: scrolls with the items. */
  header?: ReactElement | null;
  empty: ReactElement | null;
  loadingMore?: boolean;
  onEndReached?: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (node: PageNode) => void;
  showSpace?: boolean;
  /** "Space / Folder" for the Details sheet. */
  locationOf: (node: PageNode) => string;
  canWrite?: boolean;
  bottomPadding?: number;
  /** Drive hides "+ New" while items are selected; the screen owns the "+". */
  onSelectingChange?: (selecting: boolean) => void;
  testID: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const mode = useViewPrefs((s) => s.mode);
  const [width, setWidth] = useState(0);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selecting = selected.size > 0;
  useEffect(() => {
    onSelectingChange?.(selecting);
  }, [selecting, onSelectingChange]);
  // Unmounted mid-selection (a tab switch): the "+" comes back.
  useEffect(() => () => onSelectingChange?.(false), [onSelectingChange]);
  const [actionsFor, setActionsFor] = useState<PageNode | null>(null);
  const [detailsFor, setDetailsFor] = useState<PageNode | null>(null);
  const [renaming, setRenaming] = useState<PageNode | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [moving, setMoving] = useState<PageNode[] | null>(null);

  const refresh = useCallback(() => void queryClient.invalidateQueries({ queryKey: ["pages"] }), [queryClient]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const chosen = useMemo(() => [...selected].map((id) => byId.get(id)).filter((n): n is PageNode => Boolean(n)), [selected, byId]);

  const toggle = useCallback((node: PageNode) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  }, []);

  const press = useCallback((node: PageNode) => (selecting ? toggle(node) : onOpen(node)), [selecting, toggle, onOpen]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const share = useCallback(
    async (node: PageNode) => {
      try {
        await shareNode(node);
      } catch (e) {
        Alert.alert(failureMessage(e, t("pages.item.shareFailed")));
      }
    },
    [t],
  );

  const setStar = useCallback(
    async (targets: PageNode[], starred: boolean) => {
      try {
        for (const n of targets) await pagesApi.update(n.spaceId, n.id, { starred });
      } catch (e) {
        Alert.alert(failureMessage(e, t("pages.actions.failed")));
      } finally {
        refresh();
      }
    },
    [refresh, t],
  );

  // MOVE TO TRASH GOES AT ONCE, WITH UNDO (docs/QA_FULL.md top-10 #7), as
  // Drive does: no "are you sure" in the way, and a mistake costs one tap.
  // What went is remembered for UNDO_MS; Undo restores exactly those.
  const [trashed, setTrashed] = useState<PageNode[] | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const trash = useCallback(
    (targets: PageNode[]) => {
      setSelected(new Set());
      void (async () => {
        const done: PageNode[] = [];
        try {
          for (const n of targets) {
            await pagesApi.trash(n.spaceId, n.id);
            done.push(n);
          }
        } catch (e) {
          Alert.alert(failureMessage(e, t("pages.actions.failed")));
        } finally {
          refresh();
          if (done.length) {
            setTrashed(done);
            if (undoTimer.current) clearTimeout(undoTimer.current);
            undoTimer.current = setTimeout(() => setTrashed(null), UNDO_MS);
          }
        }
      })();
    },
    [refresh, t],
  );

  const undo = useCallback(() => {
    const back = trashed;
    setTrashed(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (!back) return;
    void (async () => {
      try {
        for (const n of back) await pagesApi.restore(n.spaceId, n.id);
      } catch (e) {
        Alert.alert(failureMessage(e, t("pages.trash.restoreFailed")));
      } finally {
        refresh();
      }
    })();
  }, [trashed, refresh, t]);

  const rename = useCallback(
    async (name: string) => {
      if (!renaming) return;
      setRenameBusy(true);
      setRenameError(null);
      try {
        await pagesApi.update(renaming.spaceId, renaming.id, { title: name });
        setRenaming(null);
        refresh();
      } catch (e) {
        setRenameError(failureMessage(e, t("pages.actions.failed")));
      } finally {
        setRenameBusy(false);
      }
    },
    [renaming, refresh, t],
  );

  // docs/MISSING_FEATURES.md #1. One folder asked for once, then each file in
  // turn (`downloadMany`); the selection stays, so a failure can be retried.
  const [downloading, setDownloading] = useState<{ n: number; total: number } | null>(null);
  const download = useCallback(
    async (items: PageNode[]) => {
      setDownloading({ n: 0, total: 0 });
      try {
        const result = await downloadMany(items, undefined, (n, total) => setDownloading({ n, total }));
        if (!result) return;
        if (result.saved + result.failed === 0) {
          Alert.alert(t("pages.download.title"), t("pages.download.noFiles"));
          return;
        }
        const lines = [
          result.saved > 0 ? t("pages.download.saved", { count: result.saved }) : null,
          result.failed > 0 ? t("pages.download.failed", { count: result.failed }) : null,
          result.skipped > 0 ? t("pages.download.skipped", { count: result.skipped }) : null,
        ].filter(Boolean);
        Alert.alert(t("pages.download.title"), lines.join("\n"));
      } catch (e) {
        Alert.alert(t("pages.download.title"), failureMessage(e, t("pages.actions.failed")));
      } finally {
        setDownloading(null);
      }
    },
    [t],
  );

  const move = useCallback(
    async (to: { spaceId: number; parentId: number | null }) => {
      if (!moving) return;
      try {
        // Only where it goes: the label is for the sheet, not the server.
        for (const n of moving) await pagesApi.move(n.spaceId, n.id, { spaceId: to.spaceId, parentId: to.parentId });
        setSelected(new Set());
      } finally {
        refresh();
      }
    },
    [moving, refresh],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const allStarred = chosen.length > 0 && chosen.every((n) => n.starred);
  const columns = mode === "grid" ? 2 : 1;
  // Drive's grid: folders are short tiles, files tall cards, and they never
  // share a row. An odd number of folders leaves the last folder alone on its
  // row (a spacer beside it), so the files start on a row of their own; and
  // a row aligns to the top, so a folder never stretches to a card's height.
  // The owner (2026-11-07) saw "Vlog 2026" as a tall empty card beside a file.
  const rows = useMemo<(PageNode | typeof SPACER)[]>(() => {
    if (columns === 1) return nodes;
    const folders = nodes.filter((n) => n.kind === "folder");
    const others = nodes.filter((n) => n.kind !== "folder");
    return folders.length % 2 === 1 && others.length > 0 ? [...folders, SPACER, ...others] : [...folders, ...others];
  }, [nodes, columns]);
  const cardWidth = width > 0 ? Math.floor((width - GAP) / 2) : 0;

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID={`${testID}-root`}>
      {selecting ? (
        <SelectionBar count={selected.size} onClose={() => setSelected(new Set())}>
          <IconButton
            icon={Download}
            label={t("pages.download.title")}
            onPress={() => {
              if (!downloading) void download(chosen);
            }}
            tone="ink"
            testID="pages-select-download"
          />
          {canWrite ? (
            <>
              <IconButton
                icon={Star}
                label={allStarred ? t("pages.actions.unstar") : t("pages.actions.star")}
                onPress={() => void setStar(chosen, !allStarred)}
                tone="ink"
                testID="pages-select-star"
              />
              <IconButton icon={FolderInput} label={t("pages.actions.move")} onPress={() => setMoving(chosen)} tone="ink" testID="pages-select-move" />
              <IconButton icon={Trash2} label={t("pages.actions.trash")} onPress={() => trash(chosen)} tone="ink" testID="pages-select-trash" />
            </>
          ) : null}
        </SelectionBar>
      ) : (
        top
      )}
      {downloading && downloading.total > 0 ? (
        <Text variant="caption" tone="muted" accessibilityLiveRegion="polite" style={{ paddingHorizontal: metrics.space.md }} testID="pages-download-progress">
          {t("pages.download.progress", { n: downloading.n, total: downloading.total })}
        </Text>
      ) : null}

      <FlatList
        key={mode}
        testID={testID}
        data={rows}
        numColumns={columns}
        keyExtractor={(n) => ("spacer" in n ? "spacer" : String(n.id))}
        columnWrapperStyle={columns > 1 ? { gap: GAP, marginBottom: GAP, alignItems: "flex-start" } : undefined}
        ListHeaderComponent={header}
        renderItem={({ item }) =>
          "spacer" in item ? (
            <View style={{ width: cardWidth }} testID="pages-grid-spacer" />
          ) : mode === "grid" ? (
            cardWidth > 0 ? (
              <GridCard
                node={item}
                width={cardWidth}
                onPress={() => press(item)}
                onLongPress={() => toggle(item)}
                onMore={() => setActionsFor(item)}
                selecting={selecting}
                selected={selected.has(item.id)}
              />
            ) : null
          ) : (
            <ListRow
              node={item}
              onPress={() => press(item)}
              onLongPress={() => toggle(item)}
              onMore={() => setActionsFor(item)}
              selecting={selecting}
              selected={selected.has(item.id)}
              showSpace={showSpace}
            />
          )
        }
        ListEmptyComponent={empty}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.inkMuted} style={{ paddingVertical: metrics.space.lg }} /> : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.inkMuted} />}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      />

      <ActionsSheet
        node={actionsFor}
        onClose={() => setActionsFor(null)}
        onShare={(n) => void share(n)}
        onStar={(n) => void setStar([n], !n.starred)}
        onRename={(n) => {
          setRenameError(null);
          setRenaming(n);
        }}
        onMove={(n) => setMoving([n])}
        onDetails={setDetailsFor}
        onTrash={(n) => trash([n])}
        canWrite={canWrite}
      />
      <DetailsSheet node={detailsFor} location={detailsFor ? locationOf(detailsFor) : ""} onClose={() => setDetailsFor(null)} />
      {trashed ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            // ABOVE the "+" button, which screens draw over this list: at the
            // bottom, the "+" covered Undo (measured 2026-11-07, 360 dp).
            bottom: UNDO_BAR_LIFT,
            flexDirection: "row",
            alignItems: "center",
            gap: metrics.space.md,
            minHeight: 52,
            paddingLeft: metrics.space.lg,
            paddingRight: metrics.space.xs,
            borderRadius: metrics.radius.md,
            backgroundColor: colors.ink,
          }}
          testID="pages-undo-bar"
        >
          <Text style={{ flex: 1, color: colors.ground }} numberOfLines={2}>
            {trashed.length === 1
              ? t("pages.actions.trashedOne", { title: trashed[0].title })
              : t("pages.actions.trashedMany", { count: trashed.length })}
          </Text>
          <Pressable onPress={undo} accessibilityRole="button" accessibilityLabel={t("pages.actions.undo")} hitSlop={6} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: metrics.space.md }} testID="pages-undo">
            <Text variant="label" style={{ color: colors.accent }}>
              {t("pages.actions.undo")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <MoveSheet nodes={moving} onClose={() => setMoving(null)} onMove={move} />
      <NameDialog
        open={renaming != null}
        title={t("pages.actions.rename")}
        confirm={t("pages.actions.renameConfirm")}
        initial={renaming?.title ?? ""}
        onCancel={() => setRenaming(null)}
        onSubmit={(name) => void rename(name)}
        busy={renameBusy}
        error={renameError}
      />
    </View>
  );
}
