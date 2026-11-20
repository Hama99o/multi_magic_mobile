/**
 * Copy link (parity #30) and the tappable path (parity #8): pure, so the
 * web's URL scheme and the crumbs' targets are pinned without a screen.
 * Invented values only.
 */
import { crumbsFor, nodeLink } from "../links";
import { http } from "@/api/http";

const base = () => (http.defaults.baseURL ?? "").replace(/\/$/, "");

describe("copy link: the web's own URL for each kind (Drive.tsx copyLink)", () => {
  it("a folder opens as a folder, a page as a page, a file as a preview", () => {
    expect(nodeLink({ id: 7, spaceId: 3, kind: "folder" })).toBe(`${base()}/pages/3?folder=7`);
    expect(nodeLink({ id: 8, spaceId: 3, kind: "page" })).toBe(`${base()}/pages/3?node=8`);
    expect(nodeLink({ id: 9, spaceId: 3, kind: "file" })).toBe(`${base()}/pages/3?preview=9`);
  });
});

describe("the path, one crumb per place, each opening where it names", () => {
  it("space first, then every folder above, the current folder last and not a link", () => {
    const crumbs = crumbsFor({ spaceId: 3, spaceTitle: "Family" }, [{ id: 10, title: "Taxes" }, { id: 11, title: "2026" }], { id: 12, title: "Receipts" });
    expect(crumbs).toEqual([
      { key: "space", label: "Family", target: { spaceId: 3, parentId: null, title: "Family", trail: "" } },
      { key: "10", label: "Taxes", target: { spaceId: 3, parentId: 10, title: "Taxes", trail: "Family" } },
      { key: "11", label: "2026", target: { spaceId: 3, parentId: 11, title: "2026", trail: "Family / Taxes" } },
      { key: "12", label: "Receipts", target: null },
    ]);
  });

  it("a space's own root is one crumb, not a link", () => {
    expect(crumbsFor({ spaceId: 3, spaceTitle: "Family" }, [], null)).toEqual([{ key: "space", label: "Family", target: null }]);
  });

  it("the current folder is never listed twice when the server counts it among the ancestors", () => {
    const crumbs = crumbsFor({ spaceId: 3, spaceTitle: "Family" }, [{ id: 10, title: "Taxes" }, { id: 12, title: "Receipts" }], { id: 12, title: "Receipts" });
    expect(crumbs.map((c) => c.label)).toEqual(["Family", "Taxes", "Receipts"]);
  });
});
