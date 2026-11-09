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
 * Why not the Photos gallery: that is `expo-media-library`, a new native
 * module and a new permission; asked of the owner, not assumed.
 *
 * Pages and folders have no bytes to save and are skipped and counted, so the
 * screen can say how many. One file failing does not stop the rest.
 */
import { Directory, File } from "expo-file-system";
import { downloadToCache, safeFileName, type PageNode } from "@/api/pages";

export type DownloadResult = { saved: number; failed: number; skipped: number };

/** What touches the device, so the order and counting are testable without it. */
export type DownloadDeps = {
  /** The folder's uri; throws a picker-cancel error when the user backs out. */
  pickDirectory: () => Promise<string>;
  saveInto: (directoryUri: string, node: PageNode) => Promise<void>;
};

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
};

/**
 * Null when the picker was cancelled (nothing happened, nothing to say).
 * `onProgress(n, total)` fires before the n-th file starts.
 */
export async function downloadMany(
  nodes: PageNode[],
  deps: DownloadDeps = deviceDeps,
  onProgress?: (n: number, total: number) => void,
): Promise<DownloadResult | null> {
  const files = nodes.filter((node) => node.kind === "file" && node.attachmentUrl);
  const skipped = nodes.length - files.length;
  if (files.length === 0) return { saved: 0, failed: 0, skipped };

  let directory: string;
  try {
    directory = await deps.pickDirectory();
  } catch (error) {
    if (isPickerCancel(error)) return null;
    throw error;
  }

  let saved = 0;
  let failed = 0;
  for (const [index, node] of files.entries()) {
    onProgress?.(index + 1, files.length);
    try {
      await deps.saveInto(directory, node);
      saved += 1;
    } catch {
      failed += 1;
    }
  }
  return { saved, failed, skipped };
}
