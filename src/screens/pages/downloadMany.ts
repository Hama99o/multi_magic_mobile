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
 *
 * WHAT IS A PHOTO is the file's TYPE (`mediaKind`), never its name. A file
 * whose type is missing or octet-stream (stored before the server read types
 * from the bytes: the owner's "IMG_2041", 2026-11-12) is asked what its first
 * bytes say (`resolveType`). And the saved name carries the extension of the
 * type when it has none, because Android's gallery and Files app decide what a
 * file is from its extension (`withExtension`).
 */
import { Directory, File, FileMode, Paths } from "expo-file-system";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import { downloadToCache, safeFileName, type PageNode } from "@/api/pages";
import { isGalleryMedia, isUnknownType, withExtension } from "@/lib/mediaKind";
import { sniffLocalFile } from "@/lib/probeMimeType";

export type DownloadResult = { saved: number; failed: number; skipped: number; destination: "gallery" | "files" };

/** What touches the device, so the order and counting are testable without it. */
export type DownloadDeps = {
  /** The folder's uri; throws a picker-cancel error when the user backs out. */
  pickDirectory: () => Promise<string>;
  saveInto: (directoryUri: string, node: PageNode) => Promise<void>;
  /** Write access to the photo library (asks once; true when allowed). */
  galleryPermission: () => Promise<boolean>;
  saveToGallery: (node: PageNode) => Promise<void>;
  /** The type a file's bytes say, for one whose `mimeType` says nothing. */
  resolveType?: (node: PageNode) => Promise<string | null>;
};

const isMedia = (node: PageNode): boolean => isGalleryMedia(node.mimeType);

/** The name a node is saved under: its title, made safe, with the extension of its type. */
const savedName = (node: PageNode): string => withExtension(safeFileName(node.title), node.mimeType);

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

/** 1 MB: a 500 MB clip is copied without ever sitting in memory. */
export const COPY_CHUNK_BYTES = 1024 * 1024;

/**
 * Bytes from the cache into a file made in the picked folder, through two
 * file handles. NOT `File.copy(target)`: on Android, seen 2026-11-10 on the
 * emulator, expo-file-system's SAF strategy (fsops/CopyMoveStrategy.kt,
 * `prepareAsDestination`) refuses a destination that already exists, and
 * `createFile` is what made it exist, so every file failed and stayed behind
 * empty. Copying into the FOLDER instead would name it after the cache file.
 * A file that fails half way is removed rather than left empty.
 */
async function streamInto(directoryUri: string, node: PageNode): Promise<void> {
  const cached = new File(await downloadToCache(node));
  const target = new Directory(directoryUri).createFile(savedName(node), node.mimeType ?? null);
  try {
    const from = cached.open(FileMode.ReadOnly);
    const to = target.open(FileMode.WriteOnly);
    try {
      for (;;) {
        const chunk = from.readBytes(COPY_CHUNK_BYTES);
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
      // Already gone; the original error is the one worth reporting.
    }
    throw error;
  }
}

/**
 * The gallery names a photo after the file it is handed, and the cache file is
 * `pages-<id>-<stamp>-<title>` (seen 2026-11-10: DCIM held
 * `pages-3392-20261107001902756-IMG_2041.jpg`). So it is handed a copy under
 * the file's own name, in a folder of its own, removed afterwards.
 */
async function intoGallery(node: PageNode): Promise<void> {
  const cached = new File(await downloadToCache(node));
  const folder = new Directory(Paths.cache, `gallery-${node.id}-${Date.now()}`);
  folder.create();
  try {
    const named = new File(folder, savedName(node));
    cached.copy(named);
    await Asset.create(named.uri);
  } finally {
    try {
      folder.delete();
    } catch {
      // A leftover in the cache is the system's to clear.
    }
  }
}

export const deviceDeps: DownloadDeps = {
  pickDirectory: async () => (await Directory.pickDirectoryAsync()).uri,
  saveInto: streamInto,
  galleryPermission: async () => (await requestPermissionsAsync(true)).granted,
  saveToGallery: intoGallery,
  // Downloaded anyway to be saved, so reading its first bytes costs nothing more.
  resolveType: async (node) => sniffLocalFile(await downloadToCache(node)),
};

/** Each file with its type: the server's, or the one its bytes say. */
async function withTypes(files: PageNode[], deps: DownloadDeps): Promise<PageNode[]> {
  const typed: PageNode[] = [];
  for (const node of files) {
    if (!isUnknownType(node.mimeType) || !deps.resolveType) {
      typed.push(node);
      continue;
    }
    let found: string | null = null;
    try {
      found = await deps.resolveType(node);
    } catch {
      // Unreadable: it is not known to be a photo, so it goes to Files.
    }
    typed.push(found ? { ...node, mimeType: found } : node);
  }
  return typed;
}

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
  const real = nodes.filter((node) => node.kind === "file" && node.attachmentUrl);
  const skipped = nodes.length - real.length;
  const files = await withTypes(real, deps);
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
