/**
 * How the viewer shows a node — `app/pages/view.tsx` explains each case.
 * Pure, so it is tested without a renderer.
 */
import { Platform } from "react-native";
import type { PageNode } from "@/api/pages";
import { mediaKind } from "@/lib/mediaKind";

export type Mode = "page" | "image" | "media" | "text" | "markdown" | "sheet" | "workbook" | "document" | "pdf" | "other";

export function modeFor(node: Pick<PageNode, "kind" | "mimeType" | "title">, os: string = Platform.OS): Mode {
  if (node.kind === "page") return "page";
  const mime = node.mimeType ?? "";
  const kind = mediaKind(mime);
  if (kind === "image") return "image";
  if (kind === "video" || kind === "audio") return "media";
  if (mime === "text/markdown" || mime === "text/x-markdown" || /\.md$/i.test(node.title)) return "markdown";
  // A CSV or TSV is drawn as a table (parity #46, `csv.ts`).
  if (mime === "text/csv" || mime === "text/tab-separated-values" || /\.(csv|tsv)$/i.test(node.title)) return "sheet";
  if (mime.startsWith("text/") || mime === "application/json") return "text";
  // XLSX and ODS: read by the server (spreadsheet_preview) and drawn as a table.
  // iOS keeps QuickLook, which renders a workbook natively. .xls is refused by
  // the server on purpose, so it stays with the system viewer.
  const workbook =
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.oasis.opendocument.spreadsheet" ||
    /\.(xlsx|ods)$/i.test(node.title);
  if (workbook && os !== "ios") return "workbook";
  const document =
    mime === "application/pdf" ||
    mime.includes("officedocument") ||
    mime.includes("msword") ||
    mime.includes("ms-excel") ||
    mime.includes("ms-powerpoint");
  if (document && os === "ios") return "document";
  if (mime === "application/pdf") return "pdf";
  return "other";
}

/** A page's html, in the app's colours, at a phone's reading size. */
export function pageDocument(html: string, colors: { ground: string; ink: string; inkMuted: string; accent: string; border: string }): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;padding:16px;background:${colors.ground};color:${colors.ink};font:17px/1.6 -apple-system,Roboto,sans-serif;word-wrap:break-word}
a{color:${colors.accent}} img,video{max-width:100%;height:auto;border-radius:8px}
table{border-collapse:collapse;max-width:100%;display:block;overflow-x:auto} td,th{border:1px solid ${colors.border};padding:6px}
blockquote{border-left:3px solid ${colors.border};margin:0;padding-left:12px;color:${colors.inkMuted}}
pre,code{background:${colors.border}33;border-radius:6px;padding:2px 4px;white-space:pre-wrap}
</style></head><body>${html}</body></html>`;
}
