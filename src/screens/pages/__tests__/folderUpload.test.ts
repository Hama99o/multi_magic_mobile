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

// Review 88, P6 (2026-11-21): a mirror that failed partway left its folders
// behind, so retrying the upload made a second, duplicate tree. It now puts
// what it made in the trash (the root takes its children) before failing.
describe("mirrorFolders: a failure leaves nothing behind", () => {
  it("the root it made goes to the trash, then the error is thrown", async () => {
    let next = 100;
    const create = jest.fn(async (_p: number | null, title: string) => {
      if (title === "raw") throw new Error("422");
      return next++;
    });
    const remove = jest.fn(async () => undefined);
    await expect(mirrorFolders([["Trip"], ["Trip", "Day 1"], ["Trip", "Day 1", "raw"]], 7, create, remove)).rejects.toThrow("422");
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(100); // "Trip", the root this upload made
  });

  it("nothing made yet: nothing to remove", async () => {
    const create = jest.fn(async () => {
      throw new Error("422");
    });
    const remove = jest.fn(async () => undefined);
    await expect(mirrorFolders([["Trip"]], 7, create, remove)).rejects.toThrow("422");
    expect(remove).not.toHaveBeenCalled();
  });
});

// Review 88, P5 (2026-11-21): files were queued folder by folder, each folder
// waiting for the copies of the one before. A kill partway left the later
// folders' files with no row at all: missing, and nothing said so. Every row is
// now registered in ONE call before any copy, so a kill leaves visible rows
// ("add it again"), never silence.
describe("startFolderUpload: every file has its row before any copy", () => {
  it("hands all folders' files over at once, each with its own folder", async () => {
    jest.resetModules();
    jest.doMock("@/api/pages", () => ({ pagesApi: { createFolder: jest.fn(async (_s: number, _p: number | null, title: string) => ({ id: title === "Trip" ? 1 : 2 })), trash: jest.fn() } }));
    jest.doMock("@/api/storage", () => ({ storageApi: { show: jest.fn() } }));
    jest.doMock("expo-file-system", () => ({ Directory: class {}, Paths: {} }));
    const { startFolderUpload } = require("../pickFolder") as typeof import("../pickFolder");
    const walked = {
      folders: [["Trip"], ["Trip", "Day 1"]],
      files: [
        { path: ["Trip"], name: "a.jpg", uri: "content://a", size: 1, mimeType: "image/jpeg" },
        { path: ["Trip", "Day 1"], name: "b.jpg", uri: "content://b", size: 1, mimeType: "image/jpeg" },
      ],
      totalBytes: 2,
      skipped: 0,
      truncated: false,
    };
    const calls: unknown[][] = [];
    // The first folder's copies never finish (a kill would land here).
    const enqueueGroups = jest.fn((groups: unknown) => {
      calls.push([groups]);
      return new Promise<number>(() => {});
    });
    void startFolderUpload(walked, { spaceId: 3, parentId: null, label: "QA" }, enqueueGroups as never);
    await new Promise((r) => setTimeout(r, 20));
    expect(enqueueGroups).toHaveBeenCalledTimes(1);
    const groups = calls[0][0] as { files: { name: string }[]; destination: { parentId: number } }[];
    expect(groups.map((g) => [g.destination.parentId, g.files.map((f) => f.name)])).toEqual([
      [1, ["a.jpg"]],
      [2, ["b.jpg"]],
    ]);
  });
});
