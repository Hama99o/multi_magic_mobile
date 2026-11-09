/**
 * What a filter chip asks the server for. The owner, on his iPhone
 * (2026-11-07): with a type chosen "they still show the folders, and it's the
 * same for the reverse". Google Drive's type filter lists only matching
 * files, and its "Folders" filter only folders. The server keeps folders
 * beside a content type ON PURPOSE for the web (`node_sorting.rb`
 * apply_content_type_filter), so the phone has to ask for files itself:
 * `kind` is applied before the content type (`apply_node_filters`).
 */
import { listFilter, FILTERS } from "../drive/filters";

describe("listFilter", () => {
  it("All asks for everything", () => expect(listFilter(null)).toEqual({}));
  it("a type asks for FILES of that type, never the folders", () => {
    expect(listFilter("image")).toEqual({ type: "image", kind: "file" });
    expect(listFilter("pdf")).toEqual({ type: "pdf", kind: "file" });
  });
  it("Folders asks for folders only", () => expect(listFilter("folders")).toEqual({ kind: "folder" }));
  it("offers Folders first after All, as Drive does", () => expect(FILTERS[0]).toBe("folders"));
});
