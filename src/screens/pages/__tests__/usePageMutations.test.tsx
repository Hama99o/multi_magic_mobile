/**
 * The Pages writes (`docs/DATA_LAYER.md` rule 3). A node can be cached in
 * many lists at once (its folder, Recent, Starred, a search, the trash, its
 * own detail), so the optimistic step must find it in EVERY one, in every
 * shape, and a refusal must put every one back.
 */
import MockAdapter from "axios-mock-adapter";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { http } from "@/api/http";
import { pagesKeys } from "@/api/keys";
import type { Page, PageNode } from "@/api/pages";
import { testQueryClient } from "@/__tests__/queryClient";
import { patchCached, useEmptyTrash, useRenameNode, useStarNodes, useTrashNodes } from "../usePageMutations";

let mock: MockAdapter;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

const node = (id: number, over: Partial<PageNode> = {}): PageNode =>
  ({ id, spaceId: 1, parentId: null, title: `N${id}`, kind: "file", starred: false, childrenCount: 0, attachmentUrl: null, thumbnailUrl: null, mimeType: null, fileSize: null, ...over }) as PageNode;
const page = (...rows: PageNode[]): Page<PageNode> => ({ rows, hasMore: false, unreadable: 0, total: rows.length });
const infinite = (...rows: PageNode[]): InfiniteData<Page<PageNode>> => ({ pages: [page(...rows)], pageParams: [1] });

function gated(status: number, body: unknown = {}) {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  return { open, reply: async () => (await opened, [status, body] as [number, unknown]) };
}

const FOLDER = pagesKeys.children(1, null, "name", "asc", undefined);
const RECENT = pagesKeys.drive("recent", "");
const TRASH = pagesKeys.drive("trash", "");

beforeEach(() => {
  mock = new MockAdapter(http);
  client = testQueryClient({ queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity } });
  client.setQueryData(FOLDER, infinite(node(1), node(2)));
  client.setQueryData(RECENT, infinite(node(2), node(3)));
  client.setQueryData(pagesKeys.node(1, 2), node(2));
  client.setQueryData(TRASH, infinite(node(9)));
});
afterEach(() => {
  mock.restore();
  client.clear();
});

const rows = (key: readonly unknown[]) => client.getQueryData<InfiniteData<Page<PageNode>>>(key)!.pages.flatMap((p) => p.rows);

describe("patchCached: one node, every shape", () => {
  const ids = new Set([2]);
  it("infinite pages, a single page, the node itself; others untouched", () => {
    const star = (n: PageNode) => ({ ...n, starred: true });
    expect((patchCached(infinite(node(1), node(2)), ids, star) as InfiniteData<Page<PageNode>>).pages[0].rows.map((n) => n.starred)).toEqual([false, true]);
    expect((patchCached(page(node(2)), ids, star) as Page<PageNode>).rows[0].starred).toBe(true);
    expect((patchCached(node(2), ids, star) as PageNode).starred).toBe(true);
    const other = node(5);
    expect(patchCached(other, ids, star)).toBe(other);
  });

  it("null removes it from a list (a node's own entry is left for the refetch)", () => {
    expect((patchCached(page(node(1), node(2)), ids, () => null) as Page<PageNode>).rows.map((n) => n.id)).toEqual([1]);
  });

  it("a shape it does not know is left exactly as it was", () => {
    const weird = { something: [1, 2] };
    expect(patchCached(weird, ids, () => null)).toBe(weird);
  });
});

describe("star", () => {
  it("in the folder, in Recent and on the node at once; all back on a refusal", async () => {
    const g = gated(500);
    mock.onAny(/nodes\/2/).reply(g.reply);
    const { result } = renderHook(() => useStarNodes(), { wrapper });
    act(() => result.current.mutate({ nodes: [node(2)], starred: true }));
    await waitFor(() => expect(rows(FOLDER).find((n) => n.id === 2)?.starred).toBe(true));
    expect(rows(RECENT).find((n) => n.id === 2)?.starred).toBe(true);
    expect(client.getQueryData<PageNode>(pagesKeys.node(1, 2))?.starred).toBe(true);
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rows(FOLDER).find((n) => n.id === 2)?.starred).toBe(false);
    expect(rows(RECENT).find((n) => n.id === 2)?.starred).toBe(false);
  });
});

describe("to the trash", () => {
  it("gone from every list at once; Undo offered with what went", async () => {
    const g = gated(204);
    mock.onAny(/nodes\/2/).reply(g.reply);
    const onDone = jest.fn();
    const { result } = renderHook(() => useTrashNodes({ onDone }), { wrapper });
    act(() => result.current.mutate([node(2)]));
    await waitFor(() => expect(rows(FOLDER).map((n) => n.id)).toEqual([1]));
    expect(rows(RECENT).map((n) => n.id)).toEqual([3]);
    g.open();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith([expect.objectContaining({ id: 2 })]));
  });

  it("a refusal puts it back everywhere", async () => {
    const g = gated(500);
    mock.onAny(/nodes\/2/).reply(g.reply);
    const { result } = renderHook(() => useTrashNodes(), { wrapper });
    act(() => result.current.mutate([node(2)]));
    await waitFor(() => expect(rows(FOLDER)).toHaveLength(1));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rows(FOLDER).map((n) => n.id)).toEqual([1, 2]);
    expect(rows(RECENT).map((n) => n.id)).toEqual([2, 3]);
  });
});

describe("rename and empty the trash", () => {
  it("rename shows at once; back on a refusal", async () => {
    const g = gated(500);
    mock.onAny(/nodes\/1/).reply(g.reply);
    const { result } = renderHook(() => useRenameNode(), { wrapper });
    act(() => result.current.mutate({ node: node(1), title: "Renamed" }));
    await waitFor(() => expect(rows(FOLDER)[0].title).toBe("Renamed"));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rows(FOLDER)[0].title).toBe("N1");
  });

  it("empty the trash: empty at once; back on a refusal", async () => {
    const g = gated(500);
    mock.onAny(/trash/).reply(g.reply);
    const { result } = renderHook(() => useEmptyTrash(), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(rows(TRASH)).toHaveLength(0));
    g.open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rows(TRASH).map((n) => n.id)).toEqual([9]);
  });
});
