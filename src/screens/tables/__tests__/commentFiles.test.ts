/**
 * The server's rule for files on a table comment (`TableApp::Comment`
 * MAX_FILES = 5, MAX_FILE_BYTES = 10.megabytes, FILE_TYPES), said on the
 * phone before anything is sent.
 */
import { addCommentFiles, commentFileRefusal, MAX_COMMENT_FILE_BYTES, type CommentFile } from "../commentFiles";

const f = (name: string, mimeType: string | null, size: number | null = 1000) => ({ uri: `file:///${name}`, name, mimeType, size });
/** A file already on the comment (it passed the rule, so its kind is known). */
const kept = (name: string): CommentFile => ({ uri: `file:///${name}`, name, mimeType: "image/jpeg", size: 1000 });

describe("commentFileRefusal", () => {
  it("takes the server's kinds: images, PDF, text, the office files", () => {
    for (const type of ["image/jpeg", "image/png", "application/pdf", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/msword", "application/vnd.ms-excel", "application/vnd.oasis.opendocument.text"]) {
      expect(commentFileRefusal({ mimeType: type, size: 10 })).toBeNull();
    }
  });

  it("refuses what the server refuses: video, zip, an unknown kind, a PDF look-alike", () => {
    for (const type of ["video/mp4", "application/zip", "application/octet-stream", "application/pdfx", null]) {
      expect(commentFileRefusal({ mimeType: type, size: 10 })).toBe("type");
    }
  });

  it("allows exactly 10 MB and refuses one byte more; an unknown size is the server's to judge", () => {
    expect(commentFileRefusal({ mimeType: "image/jpeg", size: MAX_COMMENT_FILE_BYTES })).toBeNull();
    expect(commentFileRefusal({ mimeType: "image/jpeg", size: MAX_COMMENT_FILE_BYTES + 1 })).toBe("size");
    expect(commentFileRefusal({ mimeType: "image/jpeg", size: null })).toBeNull();
  });
});

describe("addCommentFiles", () => {
  it("keeps five and refuses the sixth by count, in pick order", () => {
    const { files, refused } = addCommentFiles([kept("1.jpg"), kept("2.jpg")], [f("3.pdf", "application/pdf"), f("4.jpg", "image/jpeg"), f("5.jpg", "image/jpeg"), f("6.jpg", "image/jpeg")]);
    expect(files.map((x) => x.name)).toEqual(["1.jpg", "2.jpg", "3.pdf", "4.jpg", "5.jpg"]);
    expect(refused).toEqual([{ name: "6.jpg", why: "count" }]);
  });

  it("says why each refused file was refused, and a refused file does not take a place", () => {
    const { files, refused } = addCommentFiles([], [f("clip.mp4", "video/mp4"), f("big.jpg", "image/jpeg", MAX_COMMENT_FILE_BYTES + 1), f("ok.png", "image/png")]);
    expect(files.map((x) => x.name)).toEqual(["ok.png"]);
    expect(refused).toEqual([
      { name: "clip.mp4", why: "type" },
      { name: "big.jpg", why: "size" },
    ]);
  });
});
