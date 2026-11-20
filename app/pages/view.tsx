/**
 * THE VIEWER — one page or one file. `docs/design/pages/SPEC.md` §2.
 *
 * What the web's `NodeViewer.tsx` does, by what the thing is:
 *   page             its html (`content.html`), read-only here; editing is
 *                    phase 3 (SPEC §6)
 *   image            a dark gallery of the folder's images: swipe, pinch,
 *                    double-tap (`ImageGallery.tsx`); `expo-image` decodes
 *                    HEIC on both platforms
 *   video / audio    `expo-video`, native controls, streamed — a 2 GB clip
 *                    is not downloaded to be watched
 *   markdown / text  fetched and shown as text
 *   pdf / office     iOS: WKWebView renders them natively (Quick Look's
 *                    engine). Android's WebView renders neither: a PDF is
 *                    drawn by pdf.js (`PdfView.tsx`); an Office file goes to
 *                    the phone's own apps through the share sheet, said on
 *                    screen, not hidden.
 *   anything else    a card with its size and "Share / Save".
 *
 * The node is re-read on open (`GET nodes/:id`), so the signed URL and the
 * html are current, not whatever the list had.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVideoPlayer, VideoView } from "expo-video";
import { WebView } from "react-native-webview";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { LoadFailure } from "@/components/LoadFailure";
import { AnswerMarkdown } from "@/components/chat/AnswerMarkdown";
import { ChevronLeft, ChevronRight, Download, MoreVertical, Pause, Pencil, Play, Star } from "@/components/icons";
import * as Clipboard from "expo-clipboard";
import { nodeLink } from "@/screens/pages/links";
import { neighbours } from "@/screens/pages/neighbours";
import { VersionsSheet } from "@/screens/pages/VersionsSheet";
import { LinkedNotesSheet } from "@/screens/pages/LinkedNotesSheet";
import { TransferSheet } from "@/screens/pages/TransferSheet";
import type { Transfer } from "@/api/transfers";
import { familyFor } from "@/theme/fonts";
import { useColors, useMetrics } from "@/hooks/useColors";
import { pagesApi, type PageNode } from "@/api/pages";
import { ImageGallery } from "@/screens/pages/ImageGallery";
import { PdfView } from "@/screens/pages/PdfView";
import { failureMessage } from "@/api/failure";
import { NameDialog, shareNode } from "@/screens/pages/ItemSheet";
import { ActionsSheet, DetailsSheet, MoveSheet } from "@/screens/pages/drive/sheets";
import { useSpaceRights } from "@/screens/pages/permissions";
import { ShareSheet, type ShareSheetTarget } from "@/screens/pages/ShareSheet";
import { useMoveNodes, useRenameNode, useStarNodes, useTrashNodes } from "@/screens/pages/usePageMutations";
import { HeaderButton, NodeGlyph, PagesHeader, metaLine } from "@/screens/pages/parts";
import { modeFor, pageDocument } from "@/screens/pages/viewerModes";
import { MAX_COLUMNS, MAX_ROWS, parseDelimited } from "@/screens/pages/csv";
import { pagesKeys } from "@/api/keys";

/**
 * Video fills the screen. Audio is a music card with its own controls under
 * it, as Drive shows it. It used to play inside an empty, screen-high grey
 * video frame (QA_DEEP #17), and in a short box Android's native controls
 * showed only Play and full screen while paused, with no seek bar. So the
 * audio controls are drawn here: play/pause, a bar you tap to seek, and the
 * times, from the player's own events.
 */
function Media({ uri, audio, node }: { uri: string; audio: boolean; node: PageNode }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
  });
  if (!audio) return <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit="contain" allowsPictureInPicture />;
  return <AudioCard player={player} node={node} />;
}

type Player = ReturnType<typeof useVideoPlayer>;

function AudioCard({ player, node }: { player: Player; node: PageNode }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [width, setWidth] = useState(0);
  const duration = Number.isFinite(player.duration) ? player.duration : 0;

  useEffect(() => {
    const a = player.addListener?.("timeUpdate", (e: { currentTime: number }) => setTime(e.currentTime));
    const b = player.addListener?.("playingChange", (e: { isPlaying: boolean }) => setPlaying(e.isPlaying));
    return () => {
      a?.remove();
      b?.remove();
    };
  }, [player]);

  const progress = duration > 0 ? Math.min(1, time / duration) : 0;
  return (
    <View style={{ flex: 1, justifyContent: "center", gap: metrics.space.xl }} testID="pages-view-audio">
      <View style={{ alignItems: "center" }}>
        <View style={{ width: 160, height: 160, borderRadius: metrics.radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
          <NodeGlyph node={node} size={96} />
        </View>
      </View>
      <View style={{ gap: metrics.space.sm }}>
        <Pressable
          onPress={(e) => {
            if (width > 0 && duration > 0) player.seekBy((e.nativeEvent.locationX / width) * duration - player.currentTime);
          }}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessibilityRole="adjustable"
          accessibilityLabel={t("pages.view.seek")}
          accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(time) }}
          hitSlop={12}
          style={{ height: 24, justifyContent: "center" }}
          testID="pages-audio-seek"
        >
          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border }}>
            <View style={{ width: `${progress * 100}%`, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />
          </View>
        </Pressable>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="caption" tone="muted" testID="pages-audio-time">
            {clock(time)}
          </Text>
          <Text variant="caption" tone="muted">
            {clock(duration)}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: "center" }}>
        <Pressable
          onPress={() => {
            if (playing) player.pause();
            // At the end, Play means from the start, as every player does.
            else if (duration > 0 && time >= duration - 0.3) player.replay();
            else player.play();
          }}
          accessibilityRole="button"
          accessibilityLabel={playing ? t("pages.view.pause") : t("pages.view.play")}
          style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}
          testID="pages-audio-play"
        >
          {playing ? <Pause size={28} color={colors.onAccent} /> : <Play size={28} color={colors.onAccent} fill={colors.onAccent} />}
        </Pressable>
      </View>
    </View>
  );
}

/** 0:07, 3:45, 1:02:03 — a player's clock. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/**
 * A text or Markdown file, and its edit (parity #49; web `NodeViewer`
 * `updateMarkdown`): whoever can write gets Edit; Save sends the new text
 * as the file's new content, the old one kept as a version by the server.
 */
function TextFile({ uri, markdown, node, canWrite }: { uri: string; markdown: boolean; node: PageNode; canWrite: boolean }) {
  const { t } = useTranslation();
  const colors = useColors();
  const metrics = useMetrics();
  const client = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data, error, isLoading } = useQuery({
    queryKey: pagesKeys.text(uri),
    queryFn: async () => {
      const res = await fetch(uri);
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    },
  });
  if (isLoading) return <ActivityIndicator style={{ marginTop: 32 }} />;
  if (error || data == null) return <Text tone="muted">{t("pages.view.textFailed")}</Text>;

  const save = async () => {
    if (draft == null) return;
    setSaving(true);
    try {
      await pagesApi.updateText(node.spaceId, node.id, draft, node.title);
      setDraft(null);
      await client.invalidateQueries({ queryKey: pagesKeys.all });
    } catch (e) {
      Alert.alert(failureMessage(e, t("pages.edit.saveFailed")));
    } finally {
      setSaving(false);
    }
  };
  const cancel = () =>
    draft === data
      ? setDraft(null)
      : Alert.alert(t("pages.edit.discardTitle"), t("pages.edit.discardBody"), [
          { text: t("pages.edit.keep"), style: "cancel" },
          { text: t("pages.edit.discard"), style: "destructive", onPress: () => setDraft(null) },
        ]);

  if (draft != null) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, gap: metrics.space.sm }}>
        <TextInput
          testID="pages-text-editor"
          value={draft}
          onChangeText={setDraft}
          multiline
          autoFocus
          textAlignVertical="top"
          accessibilityLabel={t("pages.edit.field", { title: node.title })}
          style={{ flex: 1, minHeight: 240, padding: metrics.space.md, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, color: colors.ink, backgroundColor: colors.surface, fontFamily: familyFor("mono"), fontSize: 15 }}
        />
        <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
          <View style={{ flex: 1 }}>
            <Button tone="neutral" label={t("pages.edit.cancel")} onPress={cancel} testID="pages-text-cancel" />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={t("pages.edit.save")} busy={saving} disabled={draft === data} onPress={() => void save()} testID="pages-text-save" />
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }
  return (
    <View style={{ flex: 1, gap: metrics.space.sm }}>
      {canWrite ? (
        <View style={{ alignItems: "flex-end" }}>
          <Pressable onPress={() => setDraft(data)} accessibilityRole="button" accessibilityLabel={t("pages.edit.edit")} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: metrics.touch, paddingHorizontal: metrics.space.sm }} testID="pages-text-edit">
            <Pencil size={18} color={colors.accent} />
            <Text variant="label" tone="accent">
              {t("pages.edit.edit")}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <ScrollView>{markdown ? <AnswerMarkdown content={data} /> : <Text selectable>{data}</Text>}</ScrollView>
    </View>
  );
}

/** Wide enough for a date or an amount; one line each, so every row is the same height. */
const CELL_WIDTH = 132;
const CELL_HEIGHT = 40;

/**
 * A CSV or TSV as a table (parity #46). Rows are virtualised (a FlatList of
 * fixed-height rows inside a horizontal scroll), the first row reads as the
 * header, and a sheet past the preview's size says so.
 */
function SheetFile({ uri, title }: { uri: string; title: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  const metrics = useMetrics();
  const { data, error, isLoading } = useQuery({
    queryKey: pagesKeys.text(uri),
    queryFn: async () => {
      const res = await fetch(uri);
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    },
  });
  const sheet = useMemo(() => (data == null ? null : parseDelimited(data, title)), [data, title]);
  if (isLoading) return <ActivityIndicator style={{ marginTop: 32 }} />;
  if (error || !sheet) return <Text tone="muted">{t("pages.view.textFailed")}</Text>;
  const columns = Math.max(1, ...sheet.rows.map((r) => r.length));
  return (
    <View style={{ flex: 1, gap: metrics.space.sm }} testID="pages-sheet">
      {sheet.truncated ? (
        <Text variant="caption" tone="muted" testID="pages-sheet-truncated">
          {t("pages.view.sheetTruncated", { rows: MAX_ROWS, columns: MAX_COLUMNS })}
        </Text>
      ) : null}
      <ScrollView horizontal>
        <FlatList
          data={sheet.rows}
          keyExtractor={(_, i) => String(i)}
          getItemLayout={(_, index) => ({ length: CELL_HEIGHT, offset: CELL_HEIGHT * index, index })}
          initialNumToRender={30}
          renderItem={({ item, index }) => (
            <View style={{ flexDirection: "row", height: CELL_HEIGHT, backgroundColor: index === 0 ? colors.surface : "transparent" }}>
              {Array.from({ length: columns }, (_, c) => (
                <View key={c} style={{ width: CELL_WIDTH, height: CELL_HEIGHT, justifyContent: "center", paddingHorizontal: 8, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border }}>
                  <Text numberOfLines={1} variant={index === 0 ? "label" : "body"} style={{ fontSize: 14 }}>
                    {item[c] ?? ""}
                  </Text>
                </View>
              ))}
            </View>
          )}
        />
      </ScrollView>
    </View>
  );
}

export default function Viewer() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ spaceId: string; nodeId: string; title?: string }>();
  const spaceId = Number(params.spaceId);
  const nodeId = Number(params.nodeId);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const { data: node, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: pagesKeys.node(spaceId, nodeId),
    queryFn: () => pagesApi.node(spaceId, nodeId),
  });

  useEffect(() => setShareError(null), [nodeId]);
  // A Pages link from an answer can point at a FOLDER (`page_node`,
  // `inAppRoute.ts`): it belongs on the folder screen, not in a viewer.
  useEffect(() => {
    if (node?.kind === "folder") {
      router.replace({ pathname: "/pages/folder", params: { spaceId: String(node.spaceId), parentId: String(node.id), title: node.title } });
    }
  }, [node]);
  const shownRef = useRef<PageNode | null>(null);

  const share = useCallback(async () => {
    const target = shownRef.current ?? node;
    if (!target) return;
    setSharing(true);
    setShareError(null);
    try {
      await shareNode(target);
    } catch (e) {
      setShareError(failureMessage(e, t("pages.item.shareFailed")));
    } finally {
      setSharing(false);
    }
  }, [node, t]);

  const mode = node ? modeFor(node) : null;

  // The photos beside this one, in the folder's default order (name), so a
  // swipe goes where Drive's does. Up to 4 pages (100 photos).
  const siblings = useQuery({
    queryKey: pagesKeys.gallery(spaceId, node?.parentId ?? null),
    queryFn: async () => {
      const rows: PageNode[] = [];
      for (let page = 1; page <= 4; page += 1) {
        const res = await pagesApi.children(spaceId, node!.parentId, page, { type: "image", kind: "file", sortBy: "name", sortDir: "asc" });
        rows.push(...res.rows);
        if (!res.hasMore) break;
      }
      return rows;
    },
    enabled: mode === "image",
  });
  const gallery = useMemo(() => {
    if (!node) return [];
    const rows = siblings.data ?? [];
    return rows.some((n) => n.id === node.id) ? rows : [node];
  }, [siblings.data, node]);
  // Every file beside this one, by name (the gallery's order), so previous /
  // next steps across all of them, not only the pictures (parity #43).
  const siblingFiles = useQuery({
    queryKey: pagesKeys.siblings(spaceId, node?.parentId ?? null),
    queryFn: async () => {
      const rows: PageNode[] = [];
      for (let page = 1; page <= 4; page += 1) {
        const res = await pagesApi.children(spaceId, node!.parentId, page, { kind: "file", sortBy: "name", sortDir: "asc" });
        rows.push(...res.rows);
        if (!res.hasMore) break;
      }
      return rows;
    },
    enabled: node?.kind === "file",
  });
  // Swiping changes what the header names and what Share sends.
  const [shown, setShown] = useState<PageNode | null>(null);
  useEffect(() => setShown(null), [nodeId]);
  // The shown photo as the cache has it now, so a star or a rename shows.
  const current = (shown && gallery.find((n) => n.id === shown.id)) ?? shown ?? node;
  const canShare = current?.kind === "file" && Boolean(current.attachmentUrl);

  // The web Lightbox's header actions (audit #17): the drive lists' sheets,
  // mutations and rights (`permissions.ts`), so a viewer gets nothing that
  // writes and an editor no move or trash, exactly as in a folder.
  const rights = useSpaceRights(spaceId);
  const space = useQuery({ queryKey: pagesKeys.space(spaceId), queryFn: () => pagesApi.space(spaceId), enabled: Number.isFinite(spaceId) });
  const [actionsFor, setActionsFor] = useState<PageNode | null>(null);
  const [detailsFor, setDetailsFor] = useState<PageNode | null>(null);
  const [sharingWith, setSharingWith] = useState<ShareSheetTarget | null>(null);
  const [moving, setMoving] = useState<PageNode[] | null>(null);
  const [renaming, setRenaming] = useState<PageNode | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const failed = useCallback((e: unknown) => Alert.alert(failureMessage(e, t("pages.actions.failed"))), [t]);
  const starring = useStarNodes({ onError: failed });
  // Gone from here: back to where it was opened from, which no longer lists it.
  const trashing = useTrashNodes({ onDone: () => router.back(), onError: failed });
  const mover = useMoveNodes();
  const renamer = useRenameNode({
    onDone: () => setRenaming(null),
    onError: (e) => setRenameError(failureMessage(e, t("pages.actions.failed"))),
  });
  const around = current ? neighbours(siblingFiles.data ?? [], current.id) : null;
  const go = (to: PageNode) => router.replace({ pathname: "/pages/view", params: { spaceId: String(to.spaceId), nodeId: String(to.id), title: to.title } });
  // This branch's item actions, in the viewer's menu too.
  const client = useQueryClient();
  const [versionsOf, setVersionsOf] = useState<{ node: PageNode; replace: boolean } | null>(null);
  const [notesOf, setNotesOf] = useState<PageNode | null>(null);
  const [copying, setCopying] = useState<PageNode[] | null>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const duplicate = async (n: PageNode, to?: { spaceId: number; parentId: number | null }, quiet = false) => {
    try {
      const out = await pagesApi.duplicate(n.spaceId, n.id, to ? { targetSpaceId: to.spaceId, parentId: to.parentId } : {});
      if ("transfer" in out) setTransfer(out.transfer);
      else {
        await client.invalidateQueries({ queryKey: pagesKeys.all });
        Alert.alert(t("pages.copy.copied", { title: n.title }));
      }
    } catch (e) {
      if (!quiet) Alert.alert(failureMessage(e, t("pages.copy.failed")));
      throw e;
    }
  };
  const location = [space.data?.title ?? current?.space?.title ?? "", ...(current?.ancestors ?? []).map((a) => a.title)].filter(Boolean).join(" / ");

  return (
    <Screen measure={mode === "page" || mode === "text" || mode === "markdown" || mode === "sheet" || mode === "other"}>
      <PagesHeader
        title={current?.title ?? params.title ?? ""}
        subtitle={current ? metaLine(current, t, i18n.language) : null}
        right={
          current ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {current.starred ? (
                <View accessible accessibilityLabel={t("pages.places.starred")} testID="pages-view-starred" style={{ marginHorizontal: metrics.space.xs }}>
                  <Star size={16} color={colors.accent} fill={colors.accent} />
                </View>
              ) : null}
              {canShare ? <HeaderButton icon={Download} label={t("pages.item.share")} onPress={() => void share()} testID="pages-view-share" /> : null}
              <HeaderButton icon={MoreVertical} label={t("pages.item.more", { title: current.title })} onPress={() => setActionsFor(current)} testID="pages-view-more" />
            </View>
          ) : null
        }
      />
      {shareError ? (
        <Text tone="danger" testID="pages-view-share-error">
          {shareError}
        </Text>
      ) : null}
      <LoadFailure
        error={error}
        loadFailed={t("pages.view.loadFailed")}
        hasData={Boolean(node)}
        updatedAt={dataUpdatedAt}
        onRetry={() => void refetch()}
        testID="pages-view-load-failed"
      />
      {!node ? (
        error ? null : <ActivityIndicator color={colors.inkMuted} style={{ marginTop: metrics.space.xl }} testID="pages-view-loading" />
      ) : (
        <View style={{ flex: 1, paddingBottom: metrics.space.md }} testID={`pages-view-${mode}`}>
          {mode === "page" && rights.canWrite ? (
            <View style={{ alignItems: "flex-end" }}>
              <Pressable
                onPress={() => router.push({ pathname: "/pages/edit", params: { spaceId: String(node.spaceId), nodeId: String(node.id), title: node.title } })}
                accessibilityRole="button"
                accessibilityLabel={t("pages.edit.edit")}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: metrics.touch, paddingHorizontal: metrics.space.sm }}
                testID="pages-page-edit"
              >
                <Pencil size={18} color={colors.accent} />
                <Text variant="label" tone="accent">
                  {t("pages.edit.edit")}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {mode === "page" ? (
            node.html ? (
              <WebView
                originWhitelist={["*"]}
                source={{ html: pageDocument(node.html, colors) }}
                style={{ flex: 1, backgroundColor: colors.ground }}
                setSupportMultipleWindows={false}
              />
            ) : (
              <Text tone="muted">{t("pages.view.emptyPage")}</Text>
            )
          ) : mode === "image" && node.attachmentUrl ? (
            siblings.isLoading ? (
              <ActivityIndicator color={colors.inkMuted} style={{ marginTop: metrics.space.xl }} />
            ) : (
              <ImageGallery
                images={gallery}
                startId={node.id}
                onShown={(n) => {
                  shownRef.current = n;
                  setShown(n);
                }}
              />
            )
          ) : mode === "media" && node.attachmentUrl ? (
            <Media uri={node.attachmentUrl} audio={(node.mimeType ?? "").startsWith("audio/")} node={node} />
          ) : (mode === "text" || mode === "markdown") && node.attachmentUrl ? (
            <TextFile uri={node.attachmentUrl} markdown={mode === "markdown"} node={node} canWrite={rights.canWrite} />
          ) : mode === "sheet" && node.attachmentUrl ? (
            <SheetFile uri={node.attachmentUrl} title={node.title} />
          ) : mode === "pdf" && node.attachmentUrl ? (
            <PdfView node={node} onShare={() => void share()} sharing={sharing} />
          ) : mode === "document" && node.attachmentUrl ? (
            <WebView source={{ uri: node.attachmentUrl }} style={{ flex: 1 }} startInLoadingState />
          ) : (
            <View style={{ alignItems: "center", gap: metrics.space.md, paddingTop: metrics.space.xl * 2 }} testID="pages-view-card">
              <NodeGlyph node={node} size={72} />
              <Text tone="muted" style={{ textAlign: "center" }}>
                {t("pages.view.noPreview")}
              </Text>
              {canShare ? <Button label={t("pages.item.share")} block={false} busy={sharing} onPress={() => void share()} testID="pages-view-share-button" /> : null}
            </View>
          )}
        </View>
      )}
      {around && around.total > 1 && around.index >= 0 ? (
        <View testID="pages-view-stepper" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: metrics.space.sm }}>
          <HeaderButton
            icon={ChevronLeft}
            label={around.prev ? t("pages.view.prevFile", { title: around.prev.title }) : t("pages.view.position", { n: around.index + 1, total: around.total })}
            onPress={() => around.prev && go(around.prev)}
            testID="pages-view-prev"
          />
          <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
            {t("pages.view.position", { n: around.index + 1, total: around.total })}
          </Text>
          <HeaderButton
            icon={ChevronRight}
            label={around.next ? t("pages.view.nextFile", { title: around.next.title }) : t("pages.view.position", { n: around.index + 1, total: around.total })}
            onPress={() => around.next && go(around.next)}
            testID="pages-view-next"
          />
        </View>
      ) : null}
      <ActionsSheet
        node={actionsFor}
        onClose={() => setActionsFor(null)}
        onShare={() => void share()}
        onCopyLink={(n) => void Clipboard.setStringAsync(nodeLink(n)).then(() => Alert.alert(t("pages.actions.linkCopied")))}
        onMakeCopy={(n) => void duplicate(n).catch(() => undefined)}
        onCopyTo={(n) => setCopying([n])}
        onVersions={(n) => setVersionsOf({ node: n, replace: false })}
        onReplace={(n) => setVersionsOf({ node: n, replace: true })}
        onLinkedNotes={setNotesOf}
        onShareWith={(n) => setSharingWith({ spaceId: n.spaceId, nodeId: n.id, title: n.title })}
        onStar={(n) => starring.mutate({ nodes: [n], starred: !n.starred })}
        onRename={(n) => {
          setRenameError(null);
          setRenaming(n);
        }}
        onMove={(n) => setMoving([n])}
        onDetails={setDetailsFor}
        onTrash={(n) => trashing.mutate([n])}
        rights={rights}
      />
      <DetailsSheet
        node={detailsFor}
        location={location}
        onClose={() => setDetailsFor(null)}
        onManageAccess={rights.canShare ? (n) => setSharingWith({ spaceId: n.spaceId, nodeId: n.id, title: n.title }) : undefined}
      />
      <VersionsSheet node={versionsOf?.node ?? null} replaceNow={versionsOf?.replace} canWrite={rights.canWrite} onClose={() => setVersionsOf(null)} />
      <LinkedNotesSheet node={notesOf} canWrite={rights.canWrite} onClose={() => setNotesOf(null)} />
      <MoveSheet
        mode="copy"
        nodes={copying}
        onClose={() => setCopying(null)}
        onMove={async (to) => {
          if (copying?.[0]) await duplicate(copying[0], to, true);
        }}
      />
      <TransferSheet started={transfer} onClose={() => setTransfer(null)} />
      <ShareSheet target={sharingWith} onClose={() => setSharingWith(null)} />
      <MoveSheet
        nodes={moving}
        onClose={() => setMoving(null)}
        onMove={async (to) => {
          if (moving) await mover.mutateAsync({ nodes: moving, to: { spaceId: to.spaceId, parentId: to.parentId } });
        }}
      />
      <NameDialog
        open={renaming != null}
        title={t("pages.actions.rename")}
        confirm={t("pages.actions.renameConfirm")}
        initial={renaming?.title ?? ""}
        keepExtension={renaming?.kind === "file"}
        onCancel={() => setRenaming(null)}
        onSubmit={(name) => {
          if (renaming) renamer.mutate({ node: renaming, title: name });
        }}
        busy={renamer.isPending}
        error={renameError}
      />
    </Screen>
  );
}
