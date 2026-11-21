/**
 * The signature library: the one thing Doc keeps on the server.
 * Active first, then newest (the server's own order, kept as it comes).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { docKeys } from "@/api/keys";
import { docApi, type Signature, type SignatureInput } from "@/api/doc";

export function useSignatures() {
  return useQuery({ queryKey: docKeys.signatures(), queryFn: docApi.signatures.list, staleTime: 0 });
}

/** "Signature N", the web's default, N one past the highest number in use. */
export function nextSignatureName(rows: Signature[], word: (n: number) => string): string {
  let n = rows.length + 1;
  const taken = new Set(rows.map((r) => r.name));
  while (taken.has(word(n))) n += 1;
  return word(n);
}

export function useSaveSignature() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: SignatureInput }) => (id ? docApi.signatures.update(id, input) : docApi.signatures.create(input)),
    onSettled: () => client.invalidateQueries({ queryKey: docKeys.signatures() }),
  });
}

export function useDeleteSignature() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => docApi.signatures.remove(id),
    onSettled: () => client.invalidateQueries({ queryKey: docKeys.signatures() }),
  });
}
