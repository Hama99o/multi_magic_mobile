/**
 * Editor images (audit P0 #5): the web's upload route for the note and page
 * editors, POST /api/v1/images with `file` and no note_id, which stores the
 * picture once, owned by the user, and answers { url } (web NoteEditor
 * imgUploadUrl; server Api::V1::ImagesController#upload_for_editor).
 */
import { http } from "./http";
import { obj } from "./parse";

/** The server's own limits (ImagesController IMAGE_TYPES, MAX_SIZE). */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 120_000;

/** What the server would refuse, said before the upload; null when fine. */
export function imageProblem(file: { mimeType?: string | null; fileSize?: number | null }): "type" | "size" | null {
  if (!file.mimeType || !(IMAGE_TYPES as readonly string[]).includes(file.mimeType)) return "type";
  if (typeof file.fileSize === "number" && file.fileSize > IMAGE_MAX_BYTES) return "size";
  return null;
}

export const imagesApi = {
  /** Uploads a picked picture; the URL the document keeps. */
  upload: async (file: { uri: string; name: string; mimeType: string }): Promise<string> => {
    const form = new FormData();
    // React Native's FormData takes {uri,name,type} rather than a Blob.
    form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    const res = await http.post("/api/v1/images", form, {
      // The instance default is JSON; Rails would read an empty body.
      headers: { "Content-Type": "multipart/form-data" },
      timeout: UPLOAD_TIMEOUT_MS,
    });
    const body = obj(res.data, "image upload") as { url?: unknown; image?: { url?: unknown } };
    const url = typeof body.url === "string" ? body.url : typeof body.image?.url === "string" ? body.image.url : null;
    if (!url) throw new Error("image upload: no url in the answer");
    return url;
  },
};
