/**
 * A PDF ON ANDROID, INLINE (QA_DEEP #11). Android's WebView does not render
 * a PDF (iOS's does, `viewerModes.ts` "document"), so the file is downloaded
 * to the phone's cache and drawn page by page by pdf.js inside a WebView,
 * fitted to the width, scrolling down like Drive's viewer. Pinch-zoom is the
 * WebView's own.
 *
 * pdf.js comes from cdnjs, pinned to 3.11.174 (the last line that ships a
 * classic, non-module `pdf.min.js` with a global `pdfjsLib`). So the first
 * PDF opened needs the internet; offline, or when the file is too big to
 * hand over as text (`MAX_BYTES`), the page says so and offers Share, which
 * is what this screen did before for every PDF.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { File } from "expo-file-system";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { downloadToCache, type PageNode } from "@/api/pages";

/** Above this the PDF is offered to the phone's own viewer instead. */
export const MAX_BYTES = 25 * 1000 * 1000;
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

/** The page pdf.js runs in. Pure, so the test reads what it loads. */
export function pdfDocument(base64: string, ground: string): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5">
<style>html,body{margin:0;background:${ground}}canvas{display:block;width:100%;height:auto;margin:0 0 8px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25)}</style>
<script src="${PDFJS}/pdf.min.js"></script></head><body><div id="pages"></div><script>
(function(){
  function say(m){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(m)}
  if(!window.pdfjsLib){say("failed");return}
  pdfjsLib.GlobalWorkerOptions.workerSrc="${PDFJS}/pdf.worker.min.js";
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
  const { t } = useTranslation();
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

  if (tooBig || failed) {
    return (
      <View style={{ alignItems: "center", gap: metrics.space.md, paddingTop: metrics.space.xl * 2 }} testID="pages-view-pdf-fallback">
        <Text tone="muted" style={{ textAlign: "center" }}>
          {tooBig ? t("pages.view.pdfTooBig") : t("pages.view.pdfFailed")}
        </Text>
        <Button label={t("pages.item.share")} block={false} busy={sharing} onPress={onShare} testID="pages-view-share-button" />
      </View>
    );
  }
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
