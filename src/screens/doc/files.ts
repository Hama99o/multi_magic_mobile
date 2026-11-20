/**
 * WHAT DOC TAKES, AND WHAT IT SAYS BEFORE AN UPLOAD.
 *
 * The same list as the web (`multi_magic` `pages/doc/lib/files.ts`): a PDF or
 * any image, including the ones a phone actually holds — HEIC from every
 * iPhone, AVIF and WebP screenshots, TIFF scans. Nothing is refused by type
 * on the phone except what is clearly neither (a .docx, a video): the server
 * reads the content, not the name, and answers `unreadable_image` for the rest.
 *
 * Limits are said BEFORE the upload (brief: "size limits explained before
 * upload"): sending 80 MB over mobile data to hear "too large" is the failure
 * this file exists to prevent.
 */
import { DOC_MAX_FILE_BYTES, DOC_MAX_MERGE_BYTES, DOC_MAX_MERGE_FILES, type DocFile, type DocReason } from "@/api/doc";

export type DocKind = "pdf" | "image" | "other";

/** Every image extension the server decodes (libvips + poppler). */
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif", "avif", "tif", "tiff", "jp2", "j2k", "jpf", "jpx", "svg", "ico"] as const;

/** What the phone's own image views draw without the server's help. */
const NATIVE_DRAWABLE = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif"];

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  tif: "image/tiff",
  tiff: "image/tiff",
  jp2: "image/jp2",
  j2k: "image/jp2",
  jpf: "image/jpx",
  jpx: "image/jpx",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  zip: "application/zip",
};

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

/** A MIME type a picker forgot to give, from the extension. */
export function mimeFor(file: { name: string; mimeType: string | null }): string {
  if (file.mimeType && file.mimeType !== "application/octet-stream") return file.mimeType;
  return MIME_BY_EXT[extensionOf(file.name)] ?? "application/octet-stream";
}

export function kindOf(file: { name: string; mimeType: string | null }): DocKind {
  const mime = mimeFor(file);
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) return "image";
  return "other";
}

/** True when an image must go through the server to be SHOWN (TIFF, BMP, SVG…). */
export function needsServerPreview(file: { name: string; mimeType: string | null }): boolean {
  if (kindOf(file) !== "image") return false;
  const ext = extensionOf(file.name);
  const sub = mimeFor(file).split("/")[1] ?? "";
  return !NATIVE_DRAWABLE.includes(ext) && !NATIVE_DRAWABLE.includes(sub === "jpeg" ? "jpg" : sub);
}

/** The file with its MIME type filled in, ready for a multipart part. */
export function normalise(file: DocFile): DocFile {
  return { ...file, mimeType: mimeFor(file) };
}

export type Refusal = { reason: DocReason; name?: string };

/** What a tool would refuse, said before anything is sent. */
export function checkOne(file: DocFile, accept: "pdf" | "image" | "any"): Refusal | null {
  const kind = kindOf(file);
  if (kind === "other") return { reason: "unreadable_image", name: file.name };
  if (accept === "pdf" && kind !== "pdf") return { reason: "not_pdf", name: file.name };
  if (accept === "image" && kind !== "image") return { reason: "unreadable_image", name: file.name };
  if (typeof file.size === "number" && file.size > DOC_MAX_FILE_BYTES) return { reason: "too_large", name: file.name };
  return null;
}

/** Merge's own limits: 30 files, 150 MB together. */
export function checkMerge(files: DocFile[]): Refusal | null {
  if (files.length > DOC_MAX_MERGE_FILES) return { reason: "too_many_files" };
  const total = files.reduce((n, f) => n + (f.size ?? 0), 0);
  if (total > DOC_MAX_MERGE_BYTES) return { reason: "too_large" };
  return null;
}

/** Convert's targets, by what the file IS (web `ConverterDoc.tsx:51-73`). */
export type ConvertTarget = "pdf" | "jpg" | "png" | "webp";
export function convertTargets(file: { name: string; mimeType: string | null }): ConvertTarget[] {
  const kind = kindOf(file);
  if (kind === "pdf") return ["jpg", "png"];
  if (kind !== "image") return [];
  const own = extensionOf(file.name) === "jpeg" ? "jpg" : extensionOf(file.name);
  const sub = mimeFor(file).split("/")[1];
  const self = sub === "jpeg" ? "jpg" : sub;
  return (["pdf", "jpg", "png", "webp"] as ConvertTarget[]).filter((t) => t !== own && t !== self);
}

/** A share of the page width, never past the page. */
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Moves one item a step, or not at all at an end (Merge's arrows). */
export function moveItem<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** "1,5" or "1.5" → 1.5, inside the server's range; null when not a number. */
export function parseTarget(text: string): number | null {
  const n = Number(text.replace(",", ".").trim());
  if (!text.trim() || !Number.isFinite(n) || n <= 0) return null;
  return Math.min(49, Math.max(0.1, n));
}

