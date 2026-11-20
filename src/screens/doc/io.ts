/**
 * IN AND OUT OF DOC: where a file comes from (Photos, Files, the camera, and
 * the scanner once it ships) and where a result goes (Share, Save).
 *
 * In — Pages' pickers (`screens/pages/addFiles.ts`) are for anything; these
 * ask for what a Doc tool can use: pictures only from Photos (no videos), a
 * PDF or a picture from Files, a photo from the camera. HEIC stays HEIC
 * (`preferredAssetRepresentationMode: Current`): the server reads it, and the
 * tools keep the original quality.
 *
 * Out — Share is the system sheet (Mail, WhatsApp, iOS "Save to Files").
 * Save puts the result on the phone: pictures into the gallery, anything
 * else into a folder the person picks once. Several results at once (split,
 * PDF → pictures) go the same way in one step.
 */
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { Directory, File, FileMode } from "expo-file-system";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import { friendlyName, type PickResult } from "@/screens/pages/addFiles";
import { isPickerCancel } from "@/screens/pages/downloadMany";
import type { DocFile } from "@/api/doc";

/**
 * The document scanner needs a native module (VisionKit / ML Kit) and so a new
 * native build. Designed and wired behind this flag; on for the next build
 * (docs/design/doc/SPEC.md, "Scanner"). No EAS build is spent on it now.
 */
export const DOC_SCANNER_ENABLED = false;

async function safely(pick: () => Promise<PickResult>): Promise<PickResult> {
  try {
    return await pick();
  } catch {
    return { failed: true };
  }
}

function exifDate(exif: Record<string, unknown> | null | undefined): string | null {
  const value = exif?.DateTimeOriginal ?? exif?.DateTime;
  return typeof value === "string" ? value : null;
}

const fromAssets = (assets: ImagePicker.ImagePickerAsset[]) => ({
  files: assets.map((asset) => {
    const mimeType = asset.mimeType ?? "image/jpeg";
    return { uri: asset.uri, name: friendlyName(asset.fileName ?? null, mimeType, exifDate(asset.exif)), mimeType, size: asset.fileSize ?? null };
  }),
});

export const pickPhotos = (multiple: boolean): Promise<PickResult> =>
  safely(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { denied: true };
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: multiple,
      selectionLimit: multiple ? 0 : 1,
      quality: 1,
      exif: true,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      shouldDownloadFromNetwork: true,
    });
    if (result.canceled) return null;
    return fromAssets(result.assets);
  });

export const pickFiles = (multiple: boolean, pdfOnly: boolean): Promise<PickResult> =>
  safely(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple,
      copyToCacheDirectory: true,
      type: pdfOnly ? ["application/pdf"] : ["application/pdf", "image/*"],
    });
    if (result.canceled) return null;
    return { files: result.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? null, size: a.size ?? null })) };
  });

export const takePhoto = (): Promise<PickResult> =>
  safely(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { denied: true };
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: false });
    if (result.canceled) return null;
    return fromAssets(result.assets);
  });

/* ───────────────────────────── out ─────────────────────────────────────── */

const UTI: Record<string, string> = {
  "application/pdf": "com.adobe.pdf",
  "image/jpeg": "public.jpeg",
  "image/png": "public.png",
  "application/zip": "public.zip-archive",
};

export async function shareResult(file: DocFile): Promise<"shared" | "unavailable"> {
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  await Sharing.shareAsync(file.uri, { mimeType: file.mimeType ?? undefined, UTI: UTI[file.mimeType ?? ""], dialogTitle: file.name });
  return "shared";
}

export type SaveOutcome = { saved: number; failed: number; destination: "gallery" | "files" } | "gallery-denied" | null;

export interface SaveDeps {
  pickDirectory: () => Promise<string>;
  copyInto: (directoryUri: string, file: DocFile) => Promise<void>;
  galleryPermission: () => Promise<boolean>;
  intoGallery: (file: DocFile) => Promise<void>;
}

const isPicture = (f: DocFile) => /^image\/(jpeg|png|webp|gif|heic|heif)$/.test(f.mimeType ?? "");

const COPY_CHUNK = 1024 * 1024;

/** Chunked copy into a SAF folder (see `downloadMany.streamInto` for why not `copy`). */
async function copyInto(directoryUri: string, file: DocFile): Promise<void> {
  const target = new Directory(directoryUri).createFile(file.name, file.mimeType ?? null);
  try {
    const from = new File(file.uri).open(FileMode.ReadOnly);
    const to = target.open(FileMode.WriteOnly);
    try {
      for (;;) {
        const chunk = from.readBytes(COPY_CHUNK);
        if (chunk.length === 0) break;
        to.writeBytes(chunk);
      }
    } finally {
      from.close();
      to.close();
    }
  } catch (error) {
    try {
      target.delete();
    } catch {
      /* the original error is the one to report */
    }
    throw error;
  }
}

export const deviceSaveDeps: SaveDeps = {
  pickDirectory: async () => (await Directory.pickDirectoryAsync()).uri,
  copyInto,
  galleryPermission: async () => (await requestPermissionsAsync(true)).granted,
  // Results already carry their real name (`writeResult` gives each its own folder).
  intoGallery: async (file) => {
    await Asset.create(file.uri);
  },
};

/**
 * Pictures → the gallery, anything else (or `toFiles`) → a folder picked once.
 * Null when the folder picker was cancelled: nothing to say.
 */
export async function saveResults(files: DocFile[], deps: SaveDeps = deviceSaveDeps, options: { toFiles?: boolean } = {}, onProgress?: (n: number, total: number) => void): Promise<SaveOutcome> {
  if (files.length === 0) return { saved: 0, failed: 0, destination: "files" };
  let save: (f: DocFile) => Promise<void>;
  let destination: "gallery" | "files";
  if (!options.toFiles && files.every(isPicture)) {
    if (!(await deps.galleryPermission())) return "gallery-denied";
    destination = "gallery";
    save = deps.intoGallery;
  } else {
    let dir: string;
    try {
      dir = await deps.pickDirectory();
    } catch (error) {
      if (isPickerCancel(error)) return null;
      throw error;
    }
    destination = "files";
    save = (f) => deps.copyInto(dir, f);
  }
  let saved = 0;
  let failed = 0;
  for (const [i, f] of files.entries()) {
    onProgress?.(i + 1, files.length);
    try {
      await save(f);
      saved += 1;
    } catch {
      failed += 1;
    }
  }
  return { saved, failed, destination };
}
