/**
 * ONE OPTIMISTIC WRITE, the `docs/DATA_LAYER.md` rule 3 shape, written once:
 * cancel what the write touches, snapshot it, apply the guess, put the
 * snapshot back on a refusal, and refetch exactly those keys when it settles.
 *
 * Todo and Finance each spell this out per mutation (`useTodoMutations.ts`);
 * Flow has some thirty writes, and Tables will reuse the field ones, so the
 * shape lives here and each write names only what is its own: the request,
 * the keys it touches, and the guess.
 */
import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";

export type Snapshot = [QueryKey, unknown][];

export async function snapshot(client: QueryClient, prefixes: QueryKey[]): Promise<Snapshot> {
  await Promise.all(prefixes.map((queryKey) => client.cancelQueries({ queryKey })));
  return prefixes.flatMap((queryKey) => client.getQueriesData({ queryKey }));
}

/** Put a snapshot back, key by key (`exact`), so no shape can change. */
export function restore(client: QueryClient, saved: Snapshot | undefined) {
  for (const [queryKey, data] of saved ?? []) client.setQueriesData({ queryKey, exact: true }, data);
}

export const settle = (client: QueryClient, keys: QueryKey[]) => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));

export interface OptimisticOptions<V, R> {
  /** The request. The client is passed for a request that reads what the guess wrote (a move's new order). */
  run: (vars: V, client: QueryClient) => Promise<R>;
  /** Every key the write changes: snapshotted, restored on error, refetched after. */
  touched: (vars: V) => QueryKey[];
  /** The guess, written before the server answers. Omit for a write the server must shape (an id, a name). */
  apply?: (client: QueryClient, vars: V) => void;
  /** The server's answer, written over the guess. */
  done?: (client: QueryClient, result: R, vars: V) => void;
  onDone?: (result: R, vars: V) => void;
  onError?: (error: unknown, vars: V) => void;
}

export function useOptimistic<V, R>(opts: OptimisticOptions<V, R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => opts.run(vars, client),
    onMutate: async (vars: V) => {
      const saved = await snapshot(client, opts.touched(vars));
      opts.apply?.(client, vars);
      return { saved };
    },
    onSuccess: (result: R, vars: V) => {
      opts.done?.(client, result, vars);
      opts.onDone?.(result, vars);
    },
    onError: (error: unknown, vars: V, ctx: { saved: Snapshot } | undefined) => {
      restore(client, ctx?.saved);
      opts.onError?.(error, vars);
    },
    onSettled: (_r: R | undefined, _e: unknown, vars: V) => settle(client, opts.touched(vars)),
  });
}
