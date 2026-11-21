/**
 * Upload a folder (parity #24): the picked tree is read, checked against the
 * room on the server AND on the phone (every file is copied into the app's
 * Documents before it is sent), and its folders are made on the server
 * parent first, so every file lands in its own folder.
 */
import { checkRoom, mirrorFolders, walkTree, MAX_FOLDER_FILES, DISK_MARGIN_BYTES, type TreeEntry } from "../folderUpload";

const file = (name: string, size: number, type = "image/jpeg"): TreeEntry => ({ name, uri: `file:///pick/${name}`, size, type });
const dir = (name: string, children: TreeEntry[]): TreeEntry => ({ name, uri: `file:///pick/${name}/`, list: () => children });

describe("walkTree", () => {
  const tree = dir("Trip", [
    file("a.jpg", 100),
    file(".DS_Store", 6),
    dir("Day 1", [file("b.mov", 2000, "video/quicktime"), dir("raw", [file("c.jpg", 50)])]),
    dir("empty", []),
  ]);

  it("keeps the picked folder itself, its folders parent first, and every file with its path", () => {
    const w = walkTree(tree);
    expect(w.folders).toEqual([["Trip"], ["Trip", "Day 1"], ["Trip", "Day 1", "raw"], ["Trip", "empty"]]);
    expect(w.files.map((f) => [f.path.join("/"), f.name, f.size])).toEqual([
      ["Trip", "a.jpg", 100],
      ["Trip/Day 1", "b.mov", 2000],
      ["Trip/Day 1/raw", "c.jpg", 50],
    ]);
    expect(w.totalBytes).toBe(2150);
  });

  it("leaves out hidden files (.DS_Store) and says how many", () => {
    expect(walkTree(tree).skipped).toBe(1);
  });

  it("stops at the file limit and says it did", () => {
    const many = dir("Big", Array.from({ length: MAX_FOLDER_FILES + 5 }, (_, i) => file(`${i}.jpg`, 1)));
    const w = walkTree(many);
    expect(w.files).toHaveLength(MAX_FOLDER_FILES);
    expect(w.truncated).toBe(true);
  });

  it("an unreadable subfolder is skipped, not fatal", () => {
    const bad: TreeEntry = { name: "locked", uri: "file:///pick/locked/", list: () => { throw new Error("EACCES"); } };
    const w = walkTree(dir("T", [file("x.jpg", 1), bad]));
    expect(w.files).toHaveLength(1);
    expect(w.skipped).toBe(1);
  });
});

describe("checkRoom", () => {
  it("refuses when the server space is short", () => {
    expect(checkRoom(500, { serverAvailable: 400, serverLimited: true, diskAvailable: 10 ** 12 })).toBe("server");
  });
  it("refuses when the phone cannot hold the copies (with a margin)", () => {
    expect(checkRoom(1000, { serverAvailable: 10 ** 12, serverLimited: true, diskAvailable: 1000 + DISK_MARGIN_BYTES - 1 })).toBe("disk");
  });
  it("an unlimited server is never short", () => {
    expect(checkRoom(10 ** 11, { serverAvailable: 0, serverLimited: false, diskAvailable: 10 ** 12 })).toBeNull();
  });
  it("fits", () => {
    expect(checkRoom(1000, { serverAvailable: 2000, serverLimited: true, diskAvailable: 1000 + DISK_MARGIN_BYTES })).toBeNull();
  });
});

describe("mirrorFolders", () => {
  it("makes each folder once, parent first, under the right parent", async () => {
    let next = 100;
    const made: [number | null, string][] = [];
    const create = jest.fn(async (parentId: number | null, title: string) => {
      made.push([parentId, title]);
      return next++;
    });
    const ids = await mirrorFolders([["Trip"], ["Trip", "Day 1"], ["Trip", "Day 1", "raw"], ["Trip", "empty"]], 7, create);
    expect(made).toEqual([[7, "Trip"], [100, "Day 1"], [101, "raw"], [100, "empty"]]);
    expect(ids.get("Trip/Day 1/raw")).toBe(102);
  });

  it("a failure stops the mirror and is thrown (no file is queued into a missing folder)", async () => {
    const create = jest.fn(async (_p: number | null, title: string) => {
      if (title === "Day 1") throw new Error("422");
      return 1;
    });
    await expect(mirrorFolders([["Trip"], ["Trip", "Day 1"], ["Trip", "Day 1", "raw"]], null, create)).rejects.toThrow("422");
    expect(create).toHaveBeenCalledTimes(2);
  });
});
