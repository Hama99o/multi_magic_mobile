/**
 * Delete one SafeZone item for good (audit 2026-11-16 #26; SECURITY.md §10):
 * the server keeps no trash. The lists are refreshed after, so the row is
 * gone when the screen goes back. It lives outside `app/safezone/item.tsx`
 * because that screen may not touch React Query at all (rules.test.ts); a
 * delete carries no secret, only the kind, the id and the unlock token.
 */
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { safezoneApi, safezoneKeys, type SafeZoneKind } from "@/api/safezone";

export function useRemoveItem(): (kind: SafeZoneKind, id: number, token: string) => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(
    async (kind, id, token) => {
      await safezoneApi.remove(kind, id, token);
      await queryClient.invalidateQueries({ queryKey: safezoneKeys.lists() });
    },
    [queryClient],
  );
}
