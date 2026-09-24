/**
 * THE app's query client, in a module of its own so that signing out can
 * clear it (`auth.store.ts`, `forgetSession`). It lived inside
 * `app/_layout.tsx` until 2026-09-24, out of reach of the code that ends a
 * session, so a sign-out left every cached conversation, profile, key and
 * notification in memory, and the next account's screens opened on the
 * previous account's data until each re-fetch landed.
 */
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The assistant's data changes because the user changed it, not because
      // time passed. Refetching on every focus would re-read a transcript the
      // socket is already keeping current.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
