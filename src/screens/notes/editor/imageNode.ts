/**
 * The image node a phone inserts (audit P0 #5). tiptop has one image node,
 * `imageUploader`; a finished upload on the web is that node with these
 * attrs (ImageUploaderExtension handleSuccess after a pick), so the web
 * draws the phone's picture exactly as its own.
 */
import type { DocNode } from "./types";

let seq = 0;
const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function imageNode({ url, name, size, id }: { url: string; name?: string; size?: number; id?: string }): DocNode {
  return {
    type: "imageUploader",
    attrs: { id: id ?? newId(), src: url, progress: 100, failed: false, uploading: false, selectMedia: false, errorMessage: null, name, size },
  };
}
