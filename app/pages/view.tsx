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
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useVideoPlayer, VideoView } from "expo-video";
import { WebView } from "react-native-webview";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { LoadFailure } from "@/components/LoadFailure";
import { AnswerMarkdown } from "@/components/chat/AnswerMarkdown";
import { Download, Pause, Play } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { pagesApi, type PageNode } from "@/api/pages";
import { ImageGallery } from "@/screens/pages/ImageGallery";
import { PdfView } from "@/screens/pages/PdfView";
import { failureMessage } from "@/api/failure";
import { shareNode } from "@/screens/pages/ItemSheet";
import { HeaderButton, NodeGlyph, PagesHeader, metaLine } from "@/screens/pages/parts";
import { modeFor, pageDocument } from "@/screens/pages/viewerModes";

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

function TextFile({ uri, markdown }: { uri: string; markdown: boolean }) {
  const { t } = useTranslation();
  const { data, error, isLoading } = useQuery({
    queryKey: ["pages", "text", uri],
    queryFn: async () => {
      const res = await fetch(uri);
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    },
  });
  if (isLoading) return <ActivityIndicator style={{ marginTop: 32 }} />;
  if (error || data == null) return <Text tone="muted">{t("pages.view.textFailed")}</Text>;
  return <ScrollView>{markdown ? <AnswerMarkdown content={data} /> : <Text selectable>{data}</Text>}</ScrollView>;
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
    queryKey: ["pages", "node", spaceId, nodeId],
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
    queryKey: ["pages", "gallery", spaceId, node?.parentId ?? null],
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
  // Swiping changes what the header names and what Share sends.
  const [shown, setShown] = useState<PageNode | null>(null);
  useEffect(() => setShown(null), [nodeId]);
  const current = shown ?? node;
  const canShare = current?.kind === "file" && Boolean(current.attachmentUrl);

  return (
    <Screen measure={mode === "page" || mode === "text" || mode === "markdown" || mode === "other"}>
      <PagesHeader
        title={current?.title ?? params.title ?? ""}
        subtitle={current ? metaLine(current, t, i18n.language) : null}
        right={canShare ? <HeaderButton icon={Download} label={t("pages.item.share")} onPress={() => void share()} testID="pages-view-share" /> : null}
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
            <TextFile uri={node.attachmentUrl} markdown={mode === "markdown"} />
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
    </Screen>
  );
}
