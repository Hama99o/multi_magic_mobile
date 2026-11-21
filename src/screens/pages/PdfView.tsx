/**
 * A PDF ON ANDROID, INLINE (QA_DEEP #11). Android's WebView does not render
 * a PDF (iOS's does, `viewerModes.ts` "document"), so the file is downloaded
 * to the phone's cache and drawn page by page by pdf.js inside a WebView,
 * fitted to the width, scrolling down like Drive's viewer. Pinch-zoom is the
 * WebView's own.
 *
 * pdf.js 3.11.174 ships IN THE APP (`src/vendor/pdfjs`, 2026-11-21): it used
 * to come from cdnjs, so the first PDF opened offline failed. Both files are
 * inlined into the page; the worker runs on the page's own thread
 * (`globalThis.pdfjsWorker`), so no Worker URL is needed.
 *
 * When pdf.js cannot (a file over `MAX_BYTES` to hand over as text, or a
 * render that fails), the SERVER draws the pages (`page_images`, multi_magic
 * feat/mobile-gaps-2) and they are shown as images, ten at a time. Only when
 * the server cannot either (not a readable PDF) does the screen say so and
 * offer Share, which is what it did before for every PDF.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { File } from "expo-file-system";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { downloadToCache, pagesApi, type PageNode } from "@/api/pages";
import { pagesKeys } from "@/api/keys";
import { PDFJS_LIB, PDFJS_WORKER } from "@/vendor/pdfjs/pdfjs";

/** Above this the PDF is offered to the phone's own viewer instead. */
export const MAX_BYTES = 25 * 1000 * 1000;
/** Server-drawn pages asked for at a time (the server allows up to 20). */
export const PAGE_WINDOW = 10;

/** The page pdf.js runs in. Pure, so the test reads what it loads. */
export function pdfDocument(base64: string, ground: string): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5">
<style>html,body{margin:0;background:${ground}}canvas{display:block;width:100%;height:auto;margin:0 0 8px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25)}</style>
<script>${PDFJS_LIB}</script><script>${PDFJS_WORKER}</script></head><body><div id="pages"></div><script>
(function(){
  function say(m){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(m)}
  if(!window.pdfjsLib){say("failed");return}
  var raw=atob("${base64}"),bytes=new Uint8Array(raw.length);
  for(var i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  pdfjsLib.getDocument({data:bytes}).promise.then(function(pdf){
    say("pages:"+pdf.numPages);
    var box=document.getElementById("pages"),ratio=window.devicePixelRatio||1;
    function draw(n){
      if(n>pdf.numPages){say("done");return}
      pdf.getPage(n).then(function(page){
        var v=page.getViewport({scale:1}),scale=(box.clientWidth||window.innerWidth)/v.width*ratio,vp=page.getViewport({scale:scale});
        var c=document.createElement("canvas");c.width=vp.width;c.height=vp.height;box.appendChild(c);
        page.render({canvasContext:c.getContext("2d"),viewport:vp}).promise.then(function(){draw(n+1)});
      });
    }
    draw(1);
  },function(){say("failed")});
})();
</script></body></html>`;
}

export function PdfView({ node, onShare, sharing }: { node: PageNode; onShare: () => void; sharing: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const tooBig = (node.fileSize ?? 0) > MAX_BYTES;

  useEffect(() => {
    if (tooBig) return;
    let live = true;
    void (async () => {
      try {
        const uri = await downloadToCache(node);
        const base64 = await new File(uri).base64();
        if (live) setHtml(pdfDocument(base64, colors.ground));
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [node, tooBig, colors.ground]);

  if (tooBig || failed) return <ServerPages node={node} onShare={onShare} sharing={sharing} why={tooBig ? "tooBig" : "failed"} />;
  if (!html) return <ActivityIndicator color={colors.inkMuted} style={{ marginTop: metrics.space.xl }} testID="pages-view-pdf-loading" />;
  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html }}
      style={{ flex: 1, backgroundColor: colors.ground }}
      onMessage={(e: WebViewMessageEvent) => {
        if (e.nativeEvent.data === "failed") setFailed(true);
      }}
      setSupportMultipleWindows={false}
      testID="pages-view-pdf-web"
    />
  );
}

/** The pages as the server drew them; Share only when it cannot either. */
function ServerPages({ node, onShare, sharing, why }: { node: PageNode; onShare: () => void; sharing: boolean; why: "tooBig" | "failed" }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  // One fresh list per 30 s at most: an expired url is fixed by one refetch;
  // a page that fails for another reason must not loop.
  const lastRefresh = useRef(0);
  const pages = useInfiniteQuery({
    queryKey: pagesKeys.pageImages(node.id),
    queryFn: ({ pageParam }) => pagesApi.pageImages(node.id, pageParam, PAGE_WINDOW),
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const seen = all.reduce((n, p) => n + p.pages.length, 0);
      return last.pages.length > 0 && seen < last.pageCount ? seen : undefined;
    },
    retry: false,
  });

  const { refetch } = pages;
  const refresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefresh.current < 30_000) return;
    lastRefresh.current = now;
    void refetch();
  }, [refetch]);

  if (pages.isError) {
    return (
      <View style={{ alignItems: "center", gap: metrics.space.md, paddingTop: metrics.space.xl * 2 }} testID="pages-view-pdf-fallback">
        <Text tone="muted" style={{ textAlign: "center" }}>
          {why === "tooBig" ? t("pages.view.pdfTooBig") : t("pages.view.pdfFailed")}
        </Text>
        <Button label={t("pages.item.share")} block={false} busy={sharing} onPress={onShare} testID="pages-view-share-button" />
      </View>
    );
  }
  if (!pages.data) return <ActivityIndicator color={colors.inkMuted} style={{ marginTop: metrics.space.xl }} testID="pages-view-pdf-loading" />;
  const all = pages.data.pages.flatMap((p) => p.pages);
  const count = pages.data.pages[0]?.pageCount ?? all.length;
  return (
    <FlatList
      data={all}
      keyExtractor={(p) => String(p.index)}
      onEndReached={() => {
        if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
      }}
      onEndReachedThreshold={1.5}
      style={{ flex: 1, backgroundColor: colors.ground }}
      contentContainerStyle={{ gap: metrics.space.sm, paddingBottom: metrics.space.xl }}
      ListFooterComponent={pages.isFetchingNextPage ? <ActivityIndicator color={colors.inkMuted} /> : null}
      renderItem={({ item }) => (
        <ExpoImage
          source={{ uri: item.url }}
          style={{ width: "100%", aspectRatio: item.width / item.height, backgroundColor: "#FFFFFF" }}
          contentFit="contain"
          recyclingKey={`${node.id}-${item.index}`}
          // A signed url lives an hour; an expired one answers 403. Ask for
          // the list again: the new urls replace the old in place.
          onError={refresh}
          accessibilityLabel={t("pages.view.pdfPage", { n: item.index + 1, count })}
          testID={`pages-pdf-image-${item.index}`}
        />
      )}
      testID="pages-pdf-images"
    />
  );
}
