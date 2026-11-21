/**
 * FILES ON A TABLE COMMENT (increment 5; the web's `CommentsFeed.tsx`): a
 * photo of the shop, a receipt. The server's rule, read on the phone so a
 * refusal is said before anything is sent (`TableApp::Comment`, MAX_FILES,
 * MAX_FILE_BYTES, FILE_TYPES): at most five, each 10 MB or less, images,
 * PDFs, text and the office kinds. Pure, so the rule is tested here.
 */
import type { IncomingFile } from "@/stores/uploads.store";

export const MAX_COMMENT_FILES = 5;
export const MAX_COMMENT_FILE_BYTES = 10 * 1024 * 1024;
/** The server's `FILE_TYPES`, character for character. */
const FILE_TYPES = /^(image\/|application\/pdf$|text\/|application\/(vnd\.openxmlformats|msword|vnd\.ms-excel|vnd\.oasis))/;

export type CommentFile = { uri: string; name: string; mimeType: string; size: number | null };
export type CommentFileRefusal = { name: string; why: "type" | "size" | "count" };

/** What the server would refuse this file for, or null. A size the picker did not give is the server's to judge. */
export function commentFileRefusal(file: { mimeType: string | null | undefined; size: number | null | undefined }): "type" | "size" | null {
  if (!file.mimeType || !FILE_TYPES.test(file.mimeType)) return "type";
  if (typeof file.size === "number" && file.size > MAX_COMMENT_FILE_BYTES) return "size";
  return null;
}

/** The files a comment keeps after a pick, in pick order, and the ones refused with why. */
export function addCommentFiles(current: CommentFile[], picked: IncomingFile[]): { files: CommentFile[]; refused: CommentFileRefusal[] } {
  const files = [...current];
  const refused: CommentFileRefusal[] = [];
  for (const p of picked) {
    const name = p.name ?? p.uri.split("/").pop() ?? "file";
    const why = commentFileRefusal(p);
    if (why) refused.push({ name, why });
    else if (files.length >= MAX_COMMENT_FILES) refused.push({ name, why: "count" });
    else files.push({ uri: p.uri, name, mimeType: p.mimeType ?? "application/octet-stream", size: p.size ?? null });
  }
  return { files, refused };
}
