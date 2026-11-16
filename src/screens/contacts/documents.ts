/**
 * A contact's documents (ID card, passport…), audit #8: what the web's
 * `ContactDrawer.tsx` does with them, on the phone.
 *
 * Nothing here is new machinery. A document is drawn and opened by the Pages
 * app's own pieces (`NodeGlyph`, `ImageGallery`, `PdfView`, `shareNode`), so
 * `asPageNode` dresses one as the file node those pieces read. Files come
 * from the Pages pickers (`addFiles.ts`), except the photo library, which is
 * asked for IMAGES and for a JPEG copy: the server keeps png/jpeg/gif/webp
 * and PDF only, and Pages' picker hands over videos and the HEIC original.
 */
import * as ImagePicker from "expo-image-picker";
import { documentRefusal, documentType, type ContactDocument } from "@/api/contacts";
import type { PageNode } from "@/api/pages";
import type { IncomingFile } from "@/stores/uploads.store";
import { friendlyName, pickDocuments, type PickResult } from "@/screens/pages/addFiles";

/** A document as the Pages viewer pieces read a file node. `updatedAt`
 *  feeds `downloadToCache`'s file name only: the contact id keeps two
 *  contacts' files apart in the cache, the title keeps a renamed one fresh. */
export function asPageNode(doc: ContactDocument, contactId: number): PageNode {
  return {
    id: doc.id,
    spaceId: 0,
    parentId: null,
    title: doc.filename,
    kind: "file",
    starred: false,
    childrenCount: 0,
    attachmentUrl: doc.url,
    thumbnailUrl: doc.thumbnailUrl,
    mimeType: doc.contentType || null,
    fileSize: doc.byteSize,
    ownerName: null,
    updatedAt: `contact-${contactId}`,
    createdAt: null,
    deletedAt: null,
    space: null,
    html: null,
    ancestors: [],
  };
}

export type Ready = { uri: string; name: string; mimeType: string };
export type Refused = { name: string; why: "type" | "size" };

/** The files the server would keep, and the ones it would refuse with why. */
export function sortPicked(files: IncomingFile[]): { ready: Ready[]; refused: Refused[] } {
  const ready: Ready[] = [];
  const refused: Refused[] = [];
  for (const file of files) {
    const name = file.name ?? file.uri.split("/").pop() ?? "file";
    const why = documentRefusal({ name, mimeType: file.mimeType, size: file.size });
    if (why) refused.push({ name, why });
    else ready.push({ uri: file.uri, name, mimeType: documentType({ name, mimeType: file.mimeType }) ?? "application/octet-stream" });
  }
  return { ready, refused };
}

/** Photos from the library, images only, re-encoded (quality < 1) so iOS
 *  hands over a JPEG rather than the HEIC the server would refuse. */
export async function pickPhotos(): Promise<PickResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { denied: true };
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 0, quality: 0.9 });
  } catch {
    return { failed: true };
  }
  if (result.canceled) return null;
  return {
    files: result.assets.map((asset) => {
      const mimeType = asset.mimeType ?? "image/jpeg";
      return { uri: asset.uri, name: friendlyName(asset.fileName ?? null, mimeType, null), mimeType, size: asset.fileSize ?? null };
    }),
  };
}

export { pickDocuments };
