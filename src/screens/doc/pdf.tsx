/**
 * SEEING A PDF ON A PHONE WITHOUT pdf.js (parity audit G5, G6).
 *
 * - `useInspect`: page count, page sizes as shown, and WHY a file cannot be
 *   used (locked / damaged / empty / not a PDF), before any tool runs.
 * - `usePageImage` + `PdfPage`: one page drawn by the server (poppler) at the
 *   screen's real pixel width, cached for the session by react-query, so
 *   paging back and forth does not upload again.
 * - `useThumbnails`: every page small, in ONE upload (Pages, Merge).
 *
 * A page is drawn on white in both themes (SPEC §B): paper is white, and a
 * PDF's own colours were chosen for it.
 */
import { useQuery } from "@tanstack/react-query";
import { docKeys } from "@/api/keys";
import { ActivityIndicator, PixelRatio, Pressable, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useTranslation } from "react-i18next";
import { docApi, DocError, type DocFile, type PdfInspection, type Thumbnails } from "@/api/doc";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

/** Never retried: a locked PDF stays locked, and a retry is an upload. */
const ONCE = { staleTime: Infinity, gcTime: 10 * 60_000, retry: false } as const;

export function useInspect(file: DocFile | null) {
  return useQuery<PdfInspection, DocError>({
    queryKey: docKeys.inspect(file?.uri ?? ""),
    queryFn: ({ signal }) => docApi.inspect(file as DocFile, { signal }),
    enabled: Boolean(file),
    ...ONCE,
  });
}

/** The reason an inspected file cannot be used, as a DocError, or null. */
export function inspectionProblem(info: PdfInspection | undefined): DocError | null {
  if (!info) return null;
  if (info.reason) return new DocError(info.reason);
  if (info.pages === 0) return new DocError("empty");
  return null;
}

/** Device pixels for a width in dp, inside the server's 320–2400. */
export function pixelWidth(dp: number): number {
  return Math.round(Math.min(2400, Math.max(320, dp * Math.min(PixelRatio.get(), 3))));
}

export function usePageImage(file: DocFile | null, page: number, widthDp: number) {
  const width = pixelWidth(widthDp);
  // Widths are bucketed so a rotation or a split-screen does not re-upload for 3 dp.
  const bucket = Math.ceil(width / 160) * 160;
  return useQuery<string, DocError>({
    queryKey: docKeys.page(file?.uri ?? "", page, bucket),
    queryFn: async ({ signal }) => (await docApi.pdfPage(file as DocFile, page, bucket, { signal })).uri,
    enabled: Boolean(file) && widthDp > 0,
    ...ONCE,
  });
}

export function useThumbnails(file: DocFile | null, width = 200) {
  return useQuery<Thumbnails, DocError>({
    queryKey: docKeys.thumbs(file?.uri ?? "", width),
    queryFn: ({ signal }) => docApi.thumbnails(file as DocFile, width, { signal }),
    enabled: Boolean(file),
    ...ONCE,
  });
}

/**
 * One page at a given width; its height from the page's own proportions so
 * the layout does not jump when the picture arrives.
 */
export function PdfPage({ file, page, width, aspect, children, testID }: { file: DocFile; page: number; width: number; aspect: number; children?: React.ReactNode; testID?: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const image = usePageImage(file, page, width);
  const height = width * aspect;
  return (
    <View testID={testID ?? "doc-pdf-page"} style={{ width, height, backgroundColor: "#ffffff", borderRadius: 4, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
      {image.data ? (
        <ExpoImage source={{ uri: image.data }} style={{ width, height }} contentFit="contain" transition={120} accessibilityLabel={t("doc.pages.page", { n: page + 1 })} />
      ) : image.isError ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: metrics.space.sm, padding: metrics.space.lg }}>
          <Text style={{ color: "#12232A", textAlign: "center" }}>{t("doc.sign.pageFailed")}</Text>
          <Pressable onPress={() => void image.refetch()} accessibilityRole="button" accessibilityLabel={t("doc.sign.retry")} style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.lg }}>
            <Text variant="label" style={{ color: "#2f8a83" }}>
              {t("doc.sign.retry")}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#5A7079" />
        </View>
      )}
      {children}
    </View>
  );
}
