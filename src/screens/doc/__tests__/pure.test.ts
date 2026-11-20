/**
 * The Doc helpers with no device in them: what a tool takes and says before
 * an upload (files.ts), the stroke maths of a drawn signature (strokes.ts),
 * a placement's ratios (Placement.tsx), the fonts' saved values (fonts.ts).
 */
jest.mock("expo-file-system", () => ({ Directory: class {}, File: class {}, Paths: { cache: "file:///cache" } }));

import { DOC_MAX_FILE_BYTES } from "@/api/doc";
import { checkMerge, checkOne, convertTargets, kindOf, mimeFor, needsServerPreview } from "../files";
import { fitStrokes, hasInk, nextPoint, pathFor } from "../strokes";
import { placeAt, resize, toPlacements, turn, MAX_WIDTH, MIN_WIDTH } from "../Placement";
import { SIGNATURE_FONTS, fontFor } from "../fonts";

const f = (name: string, mimeType: string | null = null, size: number | null = 100) => ({ uri: `file:///${name}`, name, mimeType, size });

describe("what Doc takes", () => {
  it("knows a PDF and every image a phone holds, by type or by name", () => {
    expect(kindOf(f("a.pdf"))).toBe("pdf");
    for (const name of ["a.heic", "a.HEIF", "a.avif", "a.webp", "a.tiff", "a.tif", "a.jp2", "a.bmp", "a.svg", "a.ico", "a.jpeg", "a.png", "a.gif"]) expect([name, kindOf(f(name))]).toEqual([name, "image"]);
    expect(kindOf(f("scan", "image/heic"))).toBe("image"); // no extension, a type
    expect(kindOf(f("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).toBe("other");
    expect(mimeFor(f("IMG.HEIC", "application/octet-stream"))).toBe("image/heic");
  });

  it("only the formats the phone cannot draw go to the server for a preview", () => {
    expect(needsServerPreview(f("a.jpg", "image/jpeg"))).toBe(false);
    expect(needsServerPreview(f("a.heic", "image/heic"))).toBe(false);
    expect(needsServerPreview(f("a.webp", "image/webp"))).toBe(false);
    expect(needsServerPreview(f("a.tiff", "image/tiff"))).toBe(true);
    expect(needsServerPreview(f("a.bmp", "image/bmp"))).toBe(true);
    expect(needsServerPreview(f("a.svg", "image/svg+xml"))).toBe(true);
    expect(needsServerPreview(f("a.pdf", "application/pdf"))).toBe(false);
  });

  it("refuses before the upload: too big, not a PDF where one is needed, not a picture", () => {
    expect(checkOne(f("a.pdf", null, DOC_MAX_FILE_BYTES + 1), "any")).toEqual({ reason: "too_large", name: "a.pdf" });
    expect(checkOne(f("a.jpg"), "pdf")).toEqual({ reason: "not_pdf", name: "a.jpg" });
    expect(checkOne(f("a.mov", "video/quicktime"), "any")).toEqual({ reason: "unreadable_image", name: "a.mov" });
    expect(checkOne(f("a.pdf"), "pdf")).toBeNull();
    expect(checkOne(f("a.pdf", null, null), "any")).toBeNull(); // an unknown size is the server's to judge
  });

  it("merge: 30 files, 150 MB together", () => {
    expect(checkMerge(Array.from({ length: 31 }, (_, i) => f(`${i}.pdf`)))).toEqual({ reason: "too_many_files" });
    expect(checkMerge([f("a.pdf", null, 100 * 1024 * 1024), f("b.pdf", null, 60 * 1024 * 1024)])).toEqual({ reason: "too_large" });
    expect(checkMerge([f("a.pdf"), f("b.jpg")])).toBeNull();
  });

  it("convert offers what the file is not (web ConverterDoc)", () => {
    expect(convertTargets(f("a.pdf"))).toEqual(["jpg", "png"]);
    expect(convertTargets(f("a.jpg", "image/jpeg"))).toEqual(["pdf", "png", "webp"]);
    expect(convertTargets(f("a.heic", "image/heic"))).toEqual(["pdf", "jpg", "png", "webp"]);
    expect(convertTargets(f("a.webp", "image/webp"))).toEqual(["pdf", "jpg", "png"]);
  });
});

describe("a drawn signature", () => {
  it("drops points closer than the step, keeps the rest rounded", () => {
    expect(nextPoint([10, 10, 0.5], 10.5, 10.5)).toBeNull();
    expect(nextPoint([10, 10, 0.5], 13.04, 10)).toEqual([13, 10, 0.5]);
    expect(nextPoint(undefined, 1.23, 4.56)).toEqual([1.2, 4.6, 0.5]);
  });

  it("a dot is a line a round cap can draw; a stroke is smoothed through midpoints", () => {
    expect(pathFor([])).toBe("");
    expect(pathFor([[5, 5, 0.5]])).toBe("M 5 5 L 5.01 5");
    expect(pathFor([[0, 0, 0.5], [10, 0, 0.5], [20, 10, 0.5]])).toBe("M 0 0 Q 10 0 15 5 L 20 10");
  });

  it("knows ink from an empty pad", () => {
    expect(hasInk([])).toBe(false);
    expect(hasInk([{ color: "#000", size: 3, brush: "pen", points: [[1, 1, 0.5]] }])).toBe(true);
  });

  it("a signature drawn on a phone fits a tablet's pad, scaled and centred", () => {
    const out = fitStrokes([{ color: "#000", size: 2, brush: "pen", points: [[0, 0, 0.5], [100, 50, 0.5]] }], { width: 100, height: 50 }, { width: 400, height: 100 });
    expect(out[0].size).toBe(4);
    expect(out[0].points).toEqual([[100, 0, 0.5], [300, 100, 0.5]]);
  });
});

describe("a placement", () => {
  it("starts at the web's 22 % of the page width, centred on the tap, inside the page", () => {
    const s = placeAt(2, 1.4, -0.2, 9);
    expect(s).toMatchObject({ page: 2, x: 1, y: 0, width: 0.22, rotation: 0, signatureId: 9 });
  });

  it("resizes within bounds and turns within (-180, 180]", () => {
    const s = placeAt(0, 0.5, 0.5, 1);
    expect(resize(s, 100).width).toBe(MAX_WIDTH);
    expect(resize(s, 0.001).width).toBe(MIN_WIDTH);
    expect(turn({ ...s, rotation: 170 }, 20).rotation).toBe(-170);
    expect(turn({ ...s, rotation: -170 }, -20).rotation).toBe(170);
  });

  it("the server gets ratios and a whole-degree rotation, no keys or ids", () => {
    const [p] = toPlacements([{ ...placeAt(1, 0.123456, 0.654321, 4), rotation: 14.6 }]);
    expect(p).toEqual({ page: 1, x: 0.1235, y: 0.6543, width: 0.22, rotation: 15 });
  });
});

describe("typed signature fonts", () => {
  it("saves the web's own value and reads it back, Caveat when unknown (as the server)", () => {
    expect(SIGNATURE_FONTS.map((f) => f.css)).toEqual(["'Caveat', cursive", "'Dancing Script', cursive", "'Pacifico', cursive", "'Sacramento', cursive", "'Great Vibes', cursive", "'Allura', cursive"]);
    expect(fontFor("'Great Vibes', cursive").family).toBe("SigGreatVibes");
    expect(fontFor("Comic Sans").family).toBe("SigCaveat");
    expect(fontFor(null).family).toBe("SigCaveat");
  });
});

import { entriesFor, moveSelected, remove, rotate, splitName, toServer } from "../pageOps";
import { moveItem } from "../files";

describe("page edits (web PagesDoc)", () => {
  const four = entriesFor(4);
  const keys = (...k: string[]) => new Set(k);

  it("turns only the selected pages, adding to what they had, in whole turns", () => {
    const once = rotate(four, keys("p1"), 90);
    expect(toServer(rotate(once, keys("p1", "p2"), -90))).toEqual([
      { source: 0, rotation: 0 },
      { source: 1, rotation: 0 },
      { source: 2, rotation: 270 },
      { source: 3, rotation: 0 },
    ]);
  });

  it("removing leaves pages out; extracting is sending only some", () => {
    expect(toServer(remove(four, keys("p0", "p3"))).map((e) => e.source)).toEqual([1, 2]);
  });

  it("a selection moves one step as a block, and stops at the ends", () => {
    expect(moveSelected(four, keys("p1", "p2"), -1).map((e) => e.source)).toEqual([1, 2, 0, 3]);
    expect(moveSelected(four, keys("p1", "p2"), 1).map((e) => e.source)).toEqual([0, 3, 1, 2]);
    expect(moveSelected(four, keys("p0"), -1)).toBe(four);
    expect(moveSelected(four, keys("p3"), 1)).toBe(four);
  });

  it("one file per page is named like the web's zip", () => {
    expect(splitName("Contract", 2, 9)).toBe("Contract-03.pdf");
    expect(splitName("Contract", 9, 120)).toBe("Contract-010.pdf");
  });

  it("merge's arrows move one file and do nothing at an end", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    const list = ["a", "b"];
    expect(moveItem(list, 0, -1)).toBe(list);
  });
});
