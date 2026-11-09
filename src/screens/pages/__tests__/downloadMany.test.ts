/**
 * DOWNLOAD SEVERAL FILES AT ONCE (docs/MISSING_FEATURES.md #1, the owner,
 * 2026-11-09: "with 2+ items selected the top bar has only star / move /
 * delete").
 *
 * The system asks ONCE where to put them (a folder picker), then each real
 * file is saved there, one after another. The share sheet cannot do this: it
 * takes one file, so five files would be five sheets.
 */
import { downloadMany, isPickerCancel, type DownloadDeps } from "../downloadMany";
import type { PageNode } from "@/api/pages";

const node = (id: number, kind: PageNode["kind"], title: string, attachmentUrl: string | null = `https://mm/f/${id}`) =>
  ({ id, kind, title, attachmentUrl, mimeType: kind === "file" ? "image/jpeg" : null }) as PageNode;

function deps(over: Partial<DownloadDeps> = {}) {
  const saved: string[] = [];
  const base: DownloadDeps = {
    pickDirectory: jest.fn(async () => "dir"),
    saveInto: jest.fn(async (_dir: string, n: PageNode) => {
      saved.push(n.title);
    }),
    ...over,
  };
  return { deps: base, saved };
}

it("saves every real file into the ONE folder picked, in order", async () => {
  const { deps: d, saved } = deps();
  const result = await downloadMany([node(1, "file", "a.jpg"), node(2, "file", "b.pdf")], d);
  expect(d.pickDirectory).toHaveBeenCalledTimes(1);
  expect(saved).toEqual(["a.jpg", "b.pdf"]);
  expect(result).toEqual({ saved: 2, failed: 0, skipped: 0 });
});

it("skips pages and folders, and counts them so the user is told", async () => {
  const { deps: d, saved } = deps();
  const result = await downloadMany(
    [node(1, "file", "a.jpg"), node(2, "folder", "Trip", null), node(3, "page", "Notes", null)],
    d,
  );
  expect(saved).toEqual(["a.jpg"]);
  expect(result).toEqual({ saved: 1, failed: 0, skipped: 2 });
});

it("one file failing does not stop the rest", async () => {
  const saved: string[] = [];
  const { deps: d } = deps({
    saveInto: jest.fn(async (_dir: string, n: PageNode) => {
      if (n.id === 2) throw new Error("network");
      saved.push(n.title);
    }),
  });
  const result = await downloadMany([node(1, "file", "a"), node(2, "file", "b"), node(3, "file", "c")], d);
  expect(saved).toEqual(["a", "c"]);
  expect(result).toEqual({ saved: 2, failed: 1, skipped: 0 });
});

it("one at a time, never several downloads open together", async () => {
  let open = 0;
  let most = 0;
  const { deps: d } = deps({
    saveInto: jest.fn(async () => {
      open += 1;
      most = Math.max(most, open);
      await new Promise((r) => setTimeout(r, 5));
      open -= 1;
    }),
  });
  await downloadMany([node(1, "file", "a"), node(2, "file", "b"), node(3, "file", "c")], d);
  expect(most).toBe(1);
});

it("reports progress as 'n of total' before each file", async () => {
  const progress: [number, number][] = [];
  const { deps: d } = deps();
  await downloadMany([node(1, "file", "a"), node(2, "folder", "F", null), node(3, "file", "c")], d, (done, total) =>
    progress.push([done, total]),
  );
  expect(progress).toEqual([
    [1, 2],
    [2, 2],
  ]);
});

it("cancelling the folder picker does nothing and says nothing (null)", async () => {
  const { deps: d } = deps({
    pickDirectory: jest.fn(async () => {
      throw Object.assign(new Error("The file picker was cancelled by the user"), { code: "ERR_PICKER_CANCELLED" });
    }),
  });
  await expect(downloadMany([node(1, "file", "a")], d)).resolves.toBeNull();
  expect(d.saveInto).not.toHaveBeenCalled();
});

it("with no real file selected, never opens the picker", async () => {
  const { deps: d } = deps();
  const result = await downloadMany([node(2, "folder", "Trip", null)], d);
  expect(d.pickDirectory).not.toHaveBeenCalled();
  expect(result).toEqual({ saved: 0, failed: 0, skipped: 1 });
});

it("a picker that fails for another reason is NOT taken for a cancel", async () => {
  const { deps: d } = deps({
    pickDirectory: jest.fn(async () => {
      throw Object.assign(new Error("boom"), { code: "ERR_UNKNOWN" });
    }),
  });
  await expect(downloadMany([node(1, "file", "a")], d)).rejects.toThrow("boom");
});

describe("isPickerCancel: the codes expo-file-system throws on each platform", () => {
  // Android: PickerCancelledException (FileSystemExceptions.kt) → ERR_PICKER_CANCELLED.
  // iOS: FilePickingCancelledException (FileSystemExceptions.swift) → ERR_FILE_PICKING_CANCELLED.
  // Expo derives a CodedException's code from its class name.
  it.each(["ERR_PICKER_CANCELLED", "ERR_FILE_PICKING_CANCELLED"])("%s is a cancel", (code) => {
    expect(isPickerCancel({ code })).toBe(true);
  });
  it("anything else is not", () => {
    expect(isPickerCancel({ code: "ERR_UNKNOWN" })).toBe(false);
    expect(isPickerCancel(new Error("x"))).toBe(false);
    expect(isPickerCancel(null)).toBe(false);
  });
});
