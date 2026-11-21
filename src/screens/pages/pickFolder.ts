/**
 * Upload a folder, the device half (parity #24): pick, read, check the room,
 * then make the folders and queue the files. The rules are in
 * `folderUpload.ts` and tested there; this file only joins them to the
 * picker, the server and the queue.
 *
 * Restart-proof by construction: the queue copies each file into the app's
 * Documents the moment it is queued (`uploads.store.ts` `adopt`), so nothing
 * depends on a picked folder's URI (Android SAF `content://`, iOS
 * security-scoped) still opening after a restart. A kill during that copy
 * comes back as "add it again" and its half copy is deleted (`sweepCopies`).
 */
import { Directory, Paths } from "expo-file-system";
import { pagesApi } from "@/api/pages";
import { storageApi } from "@/api/storage";
import type { Destination, IncomingFile } from "@/stores/uploads.store";
import { checkRoom, mirrorFolders, walkTree, type TreeEntry, type Walked } from "./folderUpload";

export type FolderPlan = { kind: "cancelled" } | { kind: "empty" } | { kind: "noRoom"; where: "server" | "disk"; bytes: number } | { kind: "ready"; walked: Walked };

/** Picks a folder and reads it; says why not when it cannot go. */
export async function planFolderUpload(onReading?: () => void): Promise<FolderPlan> {
  let picked: Directory;
  try {
    picked = await Directory.pickDirectoryAsync();
  } catch (e) {
    // The person closed the picker: not an error to show. Both platforms say "cancelled"
    // (Android PickerCancelledException, iOS FilePickingCancelledException, expo-file-system 57).
    if (/cancel/i.test(e instanceof Error ? e.message : String(e))) return { kind: "cancelled" };
    throw e;
  }
  if (!picked) return { kind: "cancelled" };
  // The walk is synchronous: let the "Reading the folder…" line paint first.
  onReading?.();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const walked = walkTree(picked as unknown as TreeEntry);
  if (walked.files.length === 0) return { kind: "empty" };
  const usage = await storageApi.show();
  const short = checkRoom(walked.totalBytes, { serverAvailable: usage.availableBytes, serverLimited: usage.limitBytes > 0, diskAvailable: Paths.availableDiskSpace });
  if (short) return { kind: "noRoom", where: short, bytes: walked.totalBytes };
  return { kind: "ready", walked };
}

/**
 * Makes the folders under `parentId`, then queues every file into its own folder,
 * all rows in one call (`enqueueGroups`) so a kill partway leaves no file without
 * a row (review 88, P5). A mirror that fails puts what it made in the trash (P6).
 */
export async function startFolderUpload(
  walked: Walked,
  where: { spaceId: number; parentId: number | null; label: string },
  enqueueGroups: (groups: { files: IncomingFile[]; destination: Destination }[]) => Promise<number>,
): Promise<number> {
  const ids = await mirrorFolders(
    walked.folders,
    where.parentId,
    async (parentId, title) => (await pagesApi.createFolder(where.spaceId, parentId, title)).id,
    (id) => pagesApi.trash(where.spaceId, id),
  );
  const byFolder = new Map<string, IncomingFile[]>();
  for (const f of walked.files) {
    const key = f.path.join("/");
    const list = byFolder.get(key) ?? [];
    list.push({ uri: f.uri, name: f.name, mimeType: f.mimeType, size: f.size });
    byFolder.set(key, list);
  }
  const groups: { files: IncomingFile[]; destination: Destination }[] = [];
  for (const [key, files] of byFolder) {
    const folderId = ids.get(key);
    if (folderId === undefined) continue; // made above for every path a file has
    groups.push({ files, destination: { spaceId: where.spaceId, parentId: folderId, label: [where.label, ...key.split("/")].filter(Boolean).join(" / ") } });
  }
  return enqueueGroups(groups);
}
