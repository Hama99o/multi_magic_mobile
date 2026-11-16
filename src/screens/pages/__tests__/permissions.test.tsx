/**
 * WHO MAY DO WHAT IN A SPACE, as the web decides it (multi_magic
 * `drive/Drive.tsx` "Permissions", `drive/menus.ts`):
 * - viewer: nothing that writes;
 * - editor: rename, star, add — but not Move or Trash (owner/admin only);
 * - owner, admin: everything.
 * Unknown (still loading, or a permission the app does not know) reads as
 * the least access: a control appearing a moment late beats one that
 * answers 403. In the drive-wide lists (Recent, Starred, Search) the web
 * grants writes only on the caller's OWN spaces.
 */
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";
import type { PageNode } from "@/api/pages";

const page = (rows: unknown[]) => ({ rows, hasMore: false, unreadable: 0, total: rows.length });
const mockApi = {
  space: jest.fn(async (id: number) => ({ id, title: "Family", icon: null, permission: id === 400 ? "viewer" : id === 401 ? "editor" : "admin" })),
  spaces: jest.fn(async () => page([{ id: 315, title: "QA Pages", icon: "🧪" }])),
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: new Proxy({}, { get: (_t, key: string) => (...a: unknown[]) => (mockApi as Record<string, (...x: unknown[]) => unknown>)[key](...a) }),
}));

/* eslint-disable import/first */
import { rightsFor, useDriveRights, useSpaceRights } from "../permissions";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={testQueryClient()}>{children}</QueryClientProvider>;
}

describe("rightsFor: the web's rule", () => {
  it("owner and admin may write and move/trash", () => {
    expect(rightsFor("owner")).toEqual({ canWrite: true, canMove: true });
    expect(rightsFor("admin")).toEqual({ canWrite: true, canMove: true });
  });
  it("an editor writes but may not move or trash", () => {
    expect(rightsFor("editor")).toEqual({ canWrite: true, canMove: false });
  });
  it("a viewer, or nothing known, may do neither", () => {
    expect(rightsFor("viewer")).toEqual({ canWrite: false, canMove: false });
    expect(rightsFor(null)).toEqual({ canWrite: false, canMove: false });
  });
});

describe("useSpaceRights: a folder view reads the space's own permission", () => {
  it("a viewer of a shared space gets no writes", async () => {
    const { result } = renderHook(() => useSpaceRights(400), { wrapper });
    await waitFor(() => expect(mockApi.space).toHaveBeenCalledWith(400));
    expect(result.current).toEqual({ canWrite: false, canMove: false });
  });
  it("an editor gets writes, not move/trash", async () => {
    const { result } = renderHook(() => useSpaceRights(401), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ canWrite: true, canMove: false }));
  });
  it("an admin gets everything", async () => {
    const { result } = renderHook(() => useSpaceRights(402), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ canWrite: true, canMove: true }));
  });
  it("one of his own spaces is his before its detail has loaded", async () => {
    mockApi.space.mockImplementationOnce(() => new Promise(() => {}));
    const { result } = renderHook(() => useSpaceRights(315), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ canWrite: true, canMove: true }));
  });
});

describe("useDriveRights: Recent, Starred, Search grant writes on OWN spaces only", () => {
  const node = (spaceId: number) => ({ id: 1, spaceId }) as PageNode;
  it("his own space: everything; a shared one: nothing", async () => {
    const { result } = renderHook(() => useDriveRights(), { wrapper });
    await waitFor(() => expect(result.current(node(315))).toEqual({ canWrite: true, canMove: true }));
    expect(result.current(node(400))).toEqual({ canWrite: false, canMove: false });
  });
});
