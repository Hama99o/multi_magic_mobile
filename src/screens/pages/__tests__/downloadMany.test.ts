/**
 * DOWNLOAD SEVERAL FILES AT ONCE (docs/MISSING_FEATURES.md #1, the owner,
 * 2026-11-09: "with 2+ items selected the top bar has only star / move /
 * delete").
 *
 * The system asks ONCE where to put them (a folder picker), then each real
 * file is saved there, one after another. The share sheet cannot do this: it
 * takes one file, so five files would be five sheets.
 */
// Its classes extend a native object Jest does not have; everything that
// touches the device is passed in as `deps` here, so a stand-in is enough.
jest.mock("expo-media-library", () => ({ Asset: { create: jest.fn() }, requestPermissionsAsync: jest.fn() }));

/* eslint-disable import/first */
import { downloadMany, isPickerCancel, type DownloadDeps } from "../downloadMany";
import type { PageNode } from "@/api/pages";

// A file is a PDF unless said otherwise, so the Files path stays the default
// in the tests that are not about the gallery.
const node = (
  id: number,
  kind: PageNode["kind"],
  title: string,
  attachmentUrl: string | null = `https://mm/f/${id}`,
  mimeType: string | null = kind === "file" ? "application/pdf" : null,
) => ({ id, kind, title, attachmentUrl, mimeType }) as PageNode;
const photo = (id: number, title: string) => node(id, "file", title, undefined, "image/jpeg");
const clip = (id: number, title: string) => node(id, "file", title, undefined, "video/quicktime");

function deps(over: Partial<DownloadDeps> = {}) {
  const saved: string[] = [];
  const base: DownloadDeps = {
    pickDirectory: jest.fn(async () => "dir"),
    saveInto: jest.fn(async (_dir: string, n: PageNode) => {
      saved.push(n.title);
    }),
    galleryPermission: jest.fn(async () => true),
    saveToGallery: jest.fn(async (n: PageNode) => {
      saved.push(`gallery:${n.title}`);
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
  expect(result).toEqual({ saved: 2, failed: 0, skipped: 0, destination: "files" });
});

it("skips pages and folders, and counts them so the user is told", async () => {
  const { deps: d, saved } = deps();
  const result = await downloadMany(
    [node(1, "file", "a.jpg"), node(2, "folder", "Trip", null), node(3, "page", "Notes", null)],
    d,
  );
  expect(saved).toEqual(["a.jpg"]);
  expect(result).toEqual({ saved: 1, failed: 0, skipped: 2, destination: "files" });
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
  expect(result).toEqual({ saved: 2, failed: 1, skipped: 0, destination: "files" });
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
  expect(result).toEqual({ saved: 0, failed: 0, skipped: 1, destination: "files" });
});

it("a picker that fails for another reason is NOT taken for a cancel", async () => {
  const { deps: d } = deps({
    pickDirectory: jest.fn(async () => {
      throw Object.assign(new Error("boom"), { code: "ERR_UNKNOWN" });
    }),
  });
  await expect(downloadMany([node(1, "file", "a")], d)).rejects.toThrow("boom");
});

/**
 * WHERE THEY GO — the owner, 2026-11-09: "if EVERY selected file is a photo or
 * video, save them to the Gallery; if the selection includes ANY other file,
 * everything goes to Files". So one destination per Download, decided by the
 * real files (pages and folders are skipped either way).
 */
describe("photos and videos go to the gallery", () => {
  it("all photos and videos: the gallery, and no folder picker", async () => {
    const { deps: d, saved } = deps();
    const result = await downloadMany([photo(1, "a.jpg"), clip(2, "b.MOV")], d);
    expect(d.pickDirectory).not.toHaveBeenCalled();
    expect(saved).toEqual(["gallery:a.jpg", "gallery:b.MOV"]);
    expect(result).toEqual({ saved: 2, failed: 0, skipped: 0, destination: "gallery" });
  });

  it("a folder selected with the photos is skipped, and the photos still go to the gallery", async () => {
    const { deps: d, saved } = deps();
    const result = await downloadMany([photo(1, "a.jpg"), node(2, "folder", "Trip", null)], d);
    expect(saved).toEqual(["gallery:a.jpg"]);
    expect(result).toEqual({ saved: 1, failed: 0, skipped: 1, destination: "gallery" });
  });

  it("ONE other file (a PDF) among photos: everything goes to Files", async () => {
    const { deps: d, saved } = deps();
    const result = await downloadMany([photo(1, "a.jpg"), node(2, "file", "b.pdf")], d);
    expect(d.galleryPermission).not.toHaveBeenCalled();
    expect(d.pickDirectory).toHaveBeenCalledTimes(1);
    expect(saved).toEqual(["a.jpg", "b.pdf"]);
    expect(result).toMatchObject({ destination: "files" });
  });

  it("permission refused: nothing is saved, and the caller is told so it can offer Files", async () => {
    const { deps: d, saved } = deps({ galleryPermission: jest.fn(async () => false) });
    const result = await downloadMany([photo(1, "a.jpg")], d);
    expect(result).toBe("gallery-denied");
    expect(saved).toEqual([]);
    expect(d.pickDirectory).not.toHaveBeenCalled();
  });

  it("asked again with toFiles, photos go to the folder picked", async () => {
    const { deps: d, saved } = deps({ galleryPermission: jest.fn(async () => false) });
    const result = await downloadMany([photo(1, "a.jpg")], d, undefined, { toFiles: true });
    expect(d.galleryPermission).not.toHaveBeenCalled();
    expect(saved).toEqual(["a.jpg"]);
    expect(result).toMatchObject({ saved: 1, destination: "files" });
  });

  it("one photo failing does not stop the rest", async () => {
    const saved: string[] = [];
    const { deps: d } = deps({
      saveToGallery: jest.fn(async (n: PageNode) => {
        if (n.id === 1) throw new Error("disk full");
        saved.push(n.title);
      }),
    });
    const result = await downloadMany([photo(1, "a.jpg"), clip(2, "b.MOV")], d);
    expect(saved).toEqual(["b.MOV"]);
    expect(result).toEqual({ saved: 1, failed: 1, skipped: 0, destination: "gallery" });
  });
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

/**
 * The owner, 2026-11-12: a photo named "IMG_2041" or "1000017023" (no
 * extension) that the server had stored as octet-stream was not offered to the
 * gallery. The decision is the TYPE's; when the type says nothing, the
 * file's first bytes decide (`deps.resolveType`), never its name.
 */
describe("a file whose type is missing or octet-stream", () => {
  const unknown = (id: number, title: string, mimeType: string | null = "application/octet-stream") =>
    node(id, "file", title, undefined, mimeType);

  it("photos and videos found by their bytes go to the gallery, with their real type", async () => {
    const found: Record<number, string> = { 1: "image/jpeg", 2: "video/mp4" };
    const gallery: PageNode[] = [];
    const { deps: d } = deps({
      resolveType: jest.fn(async (n: PageNode) => found[n.id] ?? null),
      saveToGallery: jest.fn(async (n: PageNode) => {
        gallery.push(n);
      }),
    });

    const result = await downloadMany([unknown(1, "IMG_2041"), unknown(2, "1000017023", null)], d);

    expect(result).toEqual({ saved: 2, failed: 0, skipped: 0, destination: "gallery" });
    expect(gallery.map((n) => [n.title, n.mimeType])).toEqual([
      ["IMG_2041", "image/jpeg"],
      ["1000017023", "video/mp4"],
    ]);
    expect(d.pickDirectory).not.toHaveBeenCalled();
  });

  it("a voice note found by its bytes is audio: it goes to Files, not the gallery", async () => {
    const { deps: d, saved } = deps({ resolveType: jest.fn(async () => "audio/ogg") });
    const result = await downloadMany([photo(1, "a.jpg"), unknown(2, "voice note")], d);
    expect(result).toMatchObject({ destination: "files" });
    expect(saved).toEqual(["a.jpg", "voice note"]);
  });

  it("bytes that say nothing: Files", async () => {
    const { deps: d } = deps({ resolveType: jest.fn(async () => null) });
    expect(await downloadMany([unknown(1, "IMG_2041")], d)).toMatchObject({ destination: "files" });
  });

  it("a file the server already typed is never probed", async () => {
    const resolveType = jest.fn(async () => "image/jpeg");
    const { deps: d } = deps({ resolveType });
    await downloadMany([photo(1, "a.jpg"), clip(2, "b.MOV")], d);
    expect(resolveType).not.toHaveBeenCalled();
  });

  it("a NAME with a photo's extension does not make a PDF a photo", async () => {
    const { deps: d } = deps();
    const result = await downloadMany([node(1, "file", "holiday.jpg", undefined, "application/pdf")], d);
    expect(result).toMatchObject({ destination: "files" });
  });
});
