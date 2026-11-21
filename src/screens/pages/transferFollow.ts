/**
 * AN IMPORT OR A COPY KEEPS BEING FOLLOWED AFTER ITS SHEET IS CLOSED (review 88, P7).
 *
 * The transfer sheet polls while it is open and refreshes every Pages list when an
 * import or a copy is done. People close it (an import takes a while), and closing
 * stopped the polling, so the lists never learned it had finished. On close, an
 * unfinished import or copy is handed here: polled until it ends (capped), then the
 * lists are refreshed. An export needs nothing: it changes no list. A session that
 * ends stops every follow (another account must not be refreshed with this one's).
 */
import type { QueryClient } from "@tanstack/react-query";
import { pagesKeys } from "@/api/keys";
import { isFinished, transfersApi, type Transfer } from "@/api/transfers";
import { onSessionEnd } from "@/lib/sessionEnd";

const POLL_MS = 2000;
const GIVE_UP_MS = 30 * 60_000;
const following = new Map<number, ReturnType<typeof setTimeout>>();

onSessionEnd(() => {
  for (const timer of following.values()) clearTimeout(timer);
  following.clear();
});

export function followAfterClose(transfer: Transfer, client: QueryClient): void {
  if (transfer.kind === "export" || isFinished(transfer) || following.has(transfer.id)) return;
  const until = Date.now() + GIVE_UP_MS;
  const tick = async () => {
    try {
      const now = await transfersApi.show(transfer.id);
      if (isFinished(now)) {
        following.delete(transfer.id);
        if (now.state === "done") void client.invalidateQueries({ queryKey: pagesKeys.all });
        return;
      }
    } catch {
      // Offline for a moment: try again on the next tick.
    }
    if (!following.has(transfer.id)) return; // stopped (session ended)
    if (Date.now() > until) {
      following.delete(transfer.id);
      return;
    }
    following.set(transfer.id, setTimeout(() => void tick(), POLL_MS));
  };
  following.set(transfer.id, setTimeout(() => void tick(), POLL_MS));
}
