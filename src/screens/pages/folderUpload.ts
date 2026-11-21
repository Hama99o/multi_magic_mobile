/**
 * UPLOAD A FOLDER (parity audit #24; web `Drive.tsx` "Upload folder").
 *
 * The phone way: `Directory.pickDirectoryAsync` (expo-file-system 57, native
 * on iOS and Android), then three steps, each its own function here so each
 * can be tested without a device:
 *
 * 1. `walkTree`: read the picked tree. The picked folder itself is kept (as
 *    the web keeps it), its folders listed parent first, and every file
 *    carries its path. Hidden files (".DS_Store") are left out, an unreadable
 *    subfolder is skipped rather than fatal, and a tree over MAX_FOLDER_FILES
 *    stops there and says so.
 * 2. `checkRoom`: nothing is copied unless both the server space and the
 *    phone can hold it. The phone matters because the queue copies every
 *    file into Documents before sending it (`uploads.store.ts` `adopt`), so
 *    the bytes exist twice on the phone until each upload finishes and its
 *    copy is deleted.
 * 3. `mirrorFolders`: make the same folders on the server, parent first. The
 *    first failure stops it, so no file is ever queued into a folder that was
 *    not made.
 */

/** About what a person uploads at once; past it, a ZIP import is the better road. */
export const MAX_FOLDER_FILES = 2000;
/** Left free on the phone after the copies: the OS and the app need room to run. */
export const DISK_MARGIN_BYTES = 500 * 1024 * 1024;

/** A file or a folder as `expo-file-system` gives them (a folder has `list`). */
export type TreeEntry = { name: string; uri: string; size?: number | null; type?: string; list?: () => TreeEntry[] };

export interface WalkedFile {
  /** The folder path it lands in, the picked folder first. */
  path: string[];
  name: string;
  uri: string;
  size: number;
  mimeType: string | null;
}

export interface Walked {
  folders: string[][];
  files: WalkedFile[];
  totalBytes: number;
  /** Hidden files and unreadable folders left out. */
  skipped: number;
  /** True when the tree had more than MAX_FOLDER_FILES files. */
  truncated: boolean;
}

const hidden = (name: string) => name.startsWith(".");

export function walkTree(root: TreeEntry): Walked {
  const out: Walked = { folders: [], files: [], totalBytes: 0, skipped: 0, truncated: false };
  const visit = (folder: TreeEntry, path: string[]) => {
    let children: TreeEntry[];
    try {
      children = folder.list ? folder.list() : [];
    } catch {
      out.skipped += 1; // not made on the server either: an empty folder there would mislead
      return;
    }
    out.folders.push(path);
    // Files first, then folders, each by name: a stable order the queue keeps.
    const sorted = [...children].sort((a, b) => Number(Boolean(a.list)) - Number(Boolean(b.list)) || a.name.localeCompare(b.name));
    for (const child of sorted) {
      if (hidden(child.name)) {
        out.skipped += 1;
        continue;
      }
      if (child.list) {
        visit(child, [...path, child.name]);
        continue;
      }
      if (out.files.length >= MAX_FOLDER_FILES) {
        out.truncated = true;
        continue;
      }
      const size = child.size ?? 0;
      out.files.push({ path, name: child.name, uri: child.uri, size, mimeType: child.type || null });
      out.totalBytes += size;
    }
  };
  visit(root, [root.name]);
  return out;
}

export function checkRoom(bytes: number, room: { serverAvailable: number; serverLimited: boolean; diskAvailable: number }): "server" | "disk" | null {
  if (room.serverLimited && bytes > room.serverAvailable) return "server";
  if (bytes + DISK_MARGIN_BYTES > room.diskAvailable) return "disk";
  return null;
}

/**
 * Makes every folder, parent first; the map is "Trip/Day 1" → its new id. If one
 * fails, the root it made goes (`remove`, the trash: its children with it) before
 * the error is thrown, so a retry does not leave a second, duplicate tree beside
 * an empty first one (review 88, P6).
 */
export async function mirrorFolders(
  folders: string[][],
  parentId: number | null,
  create: (parentId: number | null, title: string) => Promise<number>,
  remove?: (id: number) => Promise<unknown>,
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  try {
    for (const path of folders) {
      const under = path.length === 1 ? parentId : ids.get(path.slice(0, -1).join("/"));
      if (under === undefined) throw new Error(`folder upload: no parent made for ${path.join("/")}`);
      ids.set(path.join("/"), await create(under, path[path.length - 1]));
    }
  } catch (error) {
    const roots = folders.filter((path) => path.length === 1 && ids.has(path[0])).map((path) => ids.get(path[0]) as number);
    for (const id of roots) await remove?.(id).catch(() => undefined);
    throw error;
  }
  return ids;
}
