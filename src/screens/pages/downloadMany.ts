/**
 * DOWNLOAD SEVERAL FILES AT ONCE (docs/MISSING_FEATURES.md #1).
 *
 * The system's folder picker asks ONCE where they go (expo-file-system
 * `Directory.pickDirectoryAsync`: Android's document tree, iOS's Files), then
 * each real file is fetched into the cache (`downloadToCache`, reused if it is
 * already there) and copied into that folder, one after another, so a big
 * selection never opens ten downloads on a weak connection.
 *
 * Why not the share sheet, as for one file (`ItemSheet.shareNode`):
 * `Sharing.shareAsync` takes one file, so five files would be five sheets.
 *
 * WHERE, the owner (2026-11-09): "if EVERY selected file is a photo or video,
 * save them to the Gallery; if the selection includes ANY other file,
 * everything goes to Files". One destination per Download, decided by the
 * real files. The gallery needs write permission (`expo-media-library`,
 * write-only); refused, nothing is saved and the caller offers Files.
 *
 * Pages and folders have no bytes to save and are skipped and counted, so the
 * screen can say how many. One file failing does not stop the rest.
 */
import { Directory, File } from "expo-file-system";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import { downloadToCache, safeFileName, type PageNode } from "@/api/pages";

export type DownloadResult = { saved: number; failed: number; skipped: number; destination: "gallery" | "files" };

/** What touches the device, so the order and counting are testable without it. */
export type DownloadDeps = {
  /** The folder's uri; throws a picker-cancel error when the user backs out. */
  pickDirectory: () => Promise<string>;
  saveInto: (directoryUri: string, node: PageNode) => Promise<void>;
  /** Write access to the photo library (asks once; true when allowed). */
  galleryPermission: () => Promise<boolean>;
  saveToGallery: (node: PageNode) => Promise<void>;
};

const isMedia = (node: PageNode): boolean => /^(image|video)\//.test(node.mimeType ?? "");

/**
 * expo-file-system's cancel, per platform. Expo derives a CodedException's
 * code from its class: Android `PickerCancelledException`
 * (FileSystemExceptions.kt) → ERR_PICKER_CANCELLED; iOS
 * `FilePickingCancelledException` (FileSystemExceptions.swift) →
 * ERR_FILE_PICKING_CANCELLED.
 */
export function isPickerCancel(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "ERR_PICKER_CANCELLED" || code === "ERR_FILE_PICKING_CANCELLED";
}

export const deviceDeps: DownloadDeps = {
  pickDirectory: async () => (await Directory.pickDirectoryAsync()).uri,
  saveInto: async (directoryUri, node) => {
    const cached = new File(await downloadToCache(node));
    const target = new Directory(directoryUri).createFile(safeFileName(node.title), node.mimeType ?? null);
    await cached.copy(target);
  },
  galleryPermission: async () => (await requestPermissionsAsync(true)).granted,
  saveToGallery: async (node) => {
    await Asset.create(await downloadToCache(node));
  },
};

/**
 * Null when the folder picker was cancelled (nothing happened, nothing to
 * say); "gallery-denied" when photos were bound for the gallery and write
 * access was refused (nothing saved; ask again with `toFiles`).
 * `onProgress(n, total)` fires before the n-th file starts.
 */
export async function downloadMany(
  nodes: PageNode[],
  deps: DownloadDeps = deviceDeps,
  onProgress?: (n: number, total: number) => void,
  options: { toFiles?: boolean } = {},
): Promise<DownloadResult | "gallery-denied" | null> {
  const files = nodes.filter((node) => node.kind === "file" && node.attachmentUrl);
  const skipped = nodes.length - files.length;
  if (files.length === 0) return { saved: 0, failed: 0, skipped, destination: "files" };

  let save: (node: PageNode) => Promise<void>;
  let destination: DownloadResult["destination"];
  if (!options.toFiles && files.every(isMedia)) {
    if (!(await deps.galleryPermission())) return "gallery-denied";
    destination = "gallery";
    save = (node) => deps.saveToGallery(node);
  } else {
    let directory: string;
    try {
      directory = await deps.pickDirectory();
    } catch (error) {
      if (isPickerCancel(error)) return null;
      throw error;
    }
    destination = "files";
    save = (node) => deps.saveInto(directory, node);
  }

  let saved = 0;
  let failed = 0;
  for (const [index, node] of files.entries()) {
    onProgress?.(index + 1, files.length);
    try {
      await save(node);
      saved += 1;
    } catch {
      failed += 1;
    }
  }
  return { saved, failed, skipped, destination };
}
