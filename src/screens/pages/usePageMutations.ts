/**
 * The Pages writes, through React Query (`docs/DATA_LAYER.md`), shared by the
 * drive views and folders (`NodeCollection`), the trash (`TrashView`) and the
 * new-folder forms (`folder.tsx`, `save.tsx`).
 *
 * A node can sit in many cached lists at once: its folder, Recent, Starred, a
 * search, the trash, its own detail. So the optimistic step walks EVERY Pages
 * cache entry (`patchNodes`) and edits that node wherever it is, and the
 * refetch after is the Pages subtree (`pagesKeys.all`): that is the set of
 * keys a node write can touch, not a shortcut.
 *
 * OPTIMISTIC: star/unstar, rename, move to trash (Undo stays), restore,
 * delete for ever, empty the trash, move elsewhere (it leaves this list).
 * NOT optimistic: a new folder (it has no id, and its place in a sorted list
 * is the server's to decide).
 */
import { useMutation, useQueryClient, type InfiniteData, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { pagesApi, type Page, type PageNode } from "@/api/pages";
import { pagesKeys } from "@/api/keys";

type Edit = (node: PageNode) => PageNode | null;
type Snapshot = [QueryKey, unknown][];

const isNode = (x: unknown): x is PageNode => typeof x === "object" && x !== null && "spaceId" in x && "kind" in x && "id" in x;
const isPage = (x: unknown): x is Page<unknown> => typeof x === "object" && x !== null && Array.isArray((x as Page<unknown>).rows);
const isInfinite = (x: unknown): x is InfiniteData<Page<unknown>> => typeof x === "object" && x !== null && Array.isArray((x as InfiniteData<unknown>).pages);

function patchPage(page: Page<unknown>, ids: Set<number>, edit: Edit): Page<unknown> {
  const rows = page.rows.flatMap((r) => (isNode(r) && ids.has(r.id) ? (edit(r) ?? []) : [r]));
  return rows.length === page.rows.length && rows.every((r, i) => r === page.rows[i]) ? page : { ...page, rows };
}

/** Apply `edit` to these nodes in any cached shape: a page, infinite pages, one node. */
export function patchCached(data: unknown, ids: Set<number>, edit: Edit): unknown {
  if (isInfinite(data)) return { ...data, pages: data.pages.map((p) => (isPage(p) ? patchPage(p, ids, edit) : p)) };
  if (isPage(data)) return patchPage(data, ids, edit);
  if (isNode(data) && ids.has(data.id)) return edit(data) ?? data;
  return data;
}

async function patchNodes(client: QueryClient, ids: number[], edit: Edit): Promise<Snapshot> {
  await client.cancelQueries({ queryKey: pagesKeys.all });
  const saved = client.getQueriesData({ queryKey: pagesKeys.all });
  const wanted = new Set(ids);
  for (const [queryKey, data] of saved) {
    const next = patchCached(data, wanted, edit);
    if (next !== data) client.setQueriesData({ queryKey, exact: true }, next);
  }
  return saved;
}

/** Put a snapshot back: what each key held, so no shape can change. */
function restore(client: QueryClient, saved: Snapshot | undefined) {
  for (const [queryKey, data] of saved ?? []) client.setQueriesData({ queryKey, exact: true }, data);
}

const refetch = (client: QueryClient) => client.invalidateQueries({ queryKey: pagesKeys.all });

/** One write per node, in turn; what succeeded is returned (a partial failure keeps those). */
async function eachNode(nodes: PageNode[], write: (n: PageNode) => Promise<unknown>): Promise<PageNode[]> {
  const done: PageNode[] = [];
  for (const n of nodes) {
    await write(n);
    done.push(n);
  }
  return done;
}

function optimistic(client: QueryClient, edit: (nodes: PageNode[]) => Edit) {
  return {
    onMutate: async (nodes: PageNode[]) => ({ saved: await patchNodes(client, nodes.map((n) => n.id), edit(nodes)) }),
    onError: (_e: unknown, _n: PageNode[], ctx: { saved: Snapshot } | undefined) => restore(client, ctx?.saved),
    onSettled: () => refetch(client),
  };
}

export function useStarNodes(opts: { onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  const base = optimistic(client, () => (n) => n);
  return useMutation({
    mutationFn: ({ nodes, starred }: { nodes: PageNode[]; starred: boolean }) => eachNode(nodes, (n) => pagesApi.update(n.spaceId, n.id, { starred })),
    onMutate: async ({ nodes, starred }) => ({ saved: await patchNodes(client, nodes.map((n) => n.id), (n) => ({ ...n, starred })) }),
    onError: (e, v, ctx) => (base.onError(e, v.nodes, ctx), opts.onError?.(e)),
    onSettled: base.onSettled,
  });
}

/** To the trash, with Undo: gone from every list at once. */
export function useTrashNodes(opts: { onDone?: (done: PageNode[]) => void; onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  const base = optimistic(client, () => () => null);
  return useMutation({
    mutationFn: (nodes: PageNode[]) => eachNode(nodes, (n) => pagesApi.trash(n.spaceId, n.id)),
    onMutate: base.onMutate,
    onSuccess: (done) => opts.onDone?.(done),
    onError: (e, v, ctx) => (base.onError(e, v, ctx), opts.onError?.(e)),
    onSettled: base.onSettled,
  });
}

/** Undo, or Restore from the trash: out of the trash view at once. */
export function useRestoreNodes(opts: { onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  const base = optimistic(client, () => () => null);
  return useMutation({
    mutationFn: (nodes: PageNode[]) => eachNode(nodes, (n) => pagesApi.restore(n.spaceId, n.id)),
    onMutate: base.onMutate,
    onError: (e, v, ctx) => (base.onError(e, v, ctx), opts.onError?.(e)),
    onSettled: base.onSettled,
  });
}

export function useDestroyNodes(opts: { onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  const base = optimistic(client, () => () => null);
  return useMutation({
    mutationFn: (nodes: PageNode[]) => eachNode(nodes, (n) => pagesApi.destroyForever(n.spaceId, n.id)),
    onMutate: base.onMutate,
    onError: (e, v, ctx) => (base.onError(e, v, ctx), opts.onError?.(e)),
    onSettled: base.onSettled,
  });
}

/** Empty the trash: the trash view is empty at once. Answers how many went. */
export function useEmptyTrash(opts: { onDone?: (count: number) => void; onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  const trashKey = pagesKeys.drive("trash", "");
  return useMutation({
    mutationFn: () => pagesApi.emptyTrash(),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: trashKey });
      const saved = client.getQueriesData({ queryKey: trashKey });
      for (const [queryKey, data] of saved) {
        client.setQueriesData({ queryKey, exact: true }, isInfinite(data) ? { ...data, pages: data.pages.map((p) => ({ ...p, rows: [] })) } : data);
      }
      return { saved };
    },
    onSuccess: (count) => opts.onDone?.(count),
    onError: (e, _v, ctx) => (restore(client, ctx?.saved), opts.onError?.(e)),
    onSettled: () => refetch(client),
  });
}

export function useRenameNode(opts: { onDone?: () => void; onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ node, title }: { node: PageNode; title: string }) => pagesApi.update(node.spaceId, node.id, { title }),
    onMutate: async ({ node, title }) => ({ saved: await patchNodes(client, [node.id], (n) => ({ ...n, title })) }),
    onSuccess: () => opts.onDone?.(),
    onError: (e, _v, ctx) => (restore(client, ctx?.saved), opts.onError?.(e)),
    onSettled: () => refetch(client),
  });
}

/** Move elsewhere: it leaves the lists it was in at once; the destination refetches. */
export function useMoveNodes(opts: { onDone?: () => void; onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ nodes, to }: { nodes: PageNode[]; to: { spaceId: number; parentId: number | null } }) =>
      eachNode(nodes, (n) => pagesApi.move(n.spaceId, n.id, to)),
    onMutate: async ({ nodes }) => ({ saved: await patchNodes(client, nodes.map((n) => n.id), () => null) }),
    onSuccess: () => opts.onDone?.(),
    onError: (e, _v, ctx) => (restore(client, ctx?.saved), opts.onError?.(e)),
    onSettled: () => refetch(client),
  });
}

/** A new folder: not optimistic (no id yet, and the server sorts the list). */
export function useCreateFolder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ spaceId, parentId, title }: { spaceId: number; parentId: number | null; title: string }) => pagesApi.createFolder(spaceId, parentId, title),
    onSettled: () => refetch(client),
  });
}
