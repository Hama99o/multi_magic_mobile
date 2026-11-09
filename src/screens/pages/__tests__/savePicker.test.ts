/**
 * Where a shared file may go. The rules come from the server, not from this
 * file: `SpacePolicy::Scope` lists owned spaces only, and `NodePolicy#create?`
 * lets owner, admin and editor add a file, never a viewer (multi_magic,
 * `app/policies/page_app/`).
 */
import { accessResolver, asPlace, matchingSpaces, placeFromFolder, placeFromShare, placeLabel } from "../savePicker";
import type { SharedItem } from "@/api/pages";

const space = (id: number, title: string) => ({ id, title, icon: null });
const share = (id: number, spaceId: number, permission: SharedItem["permission"], node: SharedItem["node"] = null): SharedItem => ({
  id,
  permission,
  space: space(spaceId, `S${spaceId}`),
  node,
});

describe("accessResolver", () => {
  const access = accessResolver([{ id: 1 }], [share(10, 2, "viewer"), share(11, 3, "editor"), share(12, 4, "viewer"), share(13, 4, "admin")]);

  it("owner may always write", () => expect(access(1)).toEqual({ canWrite: true, permission: "owner" }));
  it("a viewer may not", () => expect(access(2)).toEqual({ canWrite: false, permission: "viewer" }));
  it("an editor may", () => expect(access(3)?.canWrite).toBe(true));
  it("takes the strongest of several shares in one space", () => expect(access(4)?.permission).toBe("admin"));
  it("knows nothing of a space it was not told about", () => expect(access(99)).toBeNull());
});

describe("places", () => {
  it("a whole shared space opens at its root; a shared folder opens at the folder, root locked", () => {
    expect(placeFromShare(share(1, 2, "editor"))).toEqual({ space: space(2, "S2"), path: [], floor: 0 });
    const folder = placeFromShare(share(1, 2, "editor", { id: 7, title: "Trip", kind: "folder", parentId: 5 }));
    expect(folder).toEqual({ space: space(2, "S2"), path: [{ id: 7, title: "Trip" }], floor: 1 });
    expect(placeLabel(folder)).toBe("S2 / Trip");
  });

  it("a found folder carries its ancestors; outside a whole space only the folder itself is reachable", () => {
    const hit = { id: 9, title: "2026-11-06", ancestors: [{ id: 3, title: "Vlogs" }] };
    expect(placeFromFolder(hit, space(1, "Me"), true).floor).toBe(0);
    const p = placeFromFolder(hit, space(2, "Them"), false);
    expect(p.path.map((x) => x.id)).toEqual([3, 9]);
    expect(p.floor).toBe(2);
  });

  it("asPlace refuses what an older version or a corrupt store left", () => {
    expect(asPlace(null)).toBeNull();
    expect(asPlace({ space: { id: "1" }, path: [] })).toBeNull();
    expect(asPlace({ space: { id: 1, title: "A" }, path: [{ id: "x" }] })).toBeNull();
    expect(asPlace({ space: { id: 1, title: "A" }, path: [] })).toEqual({ space: { id: 1, title: "A", icon: null }, path: [], floor: 0 });
  });

  it("matchingSpaces ignores case and an empty query", () => {
    const all = [space(1, "Vloging"), space(2, "Taxes")];
    expect(matchingSpaces(all, "VLOG").map((s) => s.id)).toEqual([1]);
    expect(matchingSpaces(all, "  ")).toEqual([]);
  });
});
