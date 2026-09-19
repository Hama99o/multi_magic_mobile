/**
 * THE ASSISTANT JUST CHANGED SOMETHING — refresh, without being asked.
 *
 * His words: *"if AI agent calendar and it is not applied you can say reload
 * it — there should be an option — same for notification."* The option is the
 * header control; this is the half that means he rarely needs it.
 *
 * ── The signal already exists, so nothing is polled and nothing is guessed ─
 * An assistant reply that CREATED records carries them as `links`, and each
 * link has a route `key` — `calendar_event`, `note`, `contact`
 * (`frontend_routes.rb`). `MessageChannel` streams that reply to this user
 * wherever they are in the app (`messaging/broadcast.rb:7-9`), which is
 * exactly the case here: the question was asked on the chat screen and the
 * calendar is the screen that went stale.
 *
 * So the calendar listens for replies mentioning `calendar_event` and re-reads
 * itself. It is not a timer, it is not a guess from a path string, and it costs
 * one request at the moment something actually changed — the alternative,
 * polling a calendar every thirty seconds in case the assistant wrote to it,
 * would spend a request a minute for ever to catch an event a few times a week.
 *
 * ── What it deliberately does NOT do ──────────────────────────────────────
 * It does not merge the record into the list from the frame. The reply says
 * THAT something changed, not what the list should now look like: a created
 * event may be recurring, may be shared, may fall outside the window. Re-read
 * the endpoint that knows.
 */
import { useEffect, useRef } from "react";
import { subscribeToChannel } from "@/lib/cable";
import { messagesApi } from "@/api/ai";

/** `FrontendRoutes::ROUTES` keys, per screen. Never a path prefix. */
export const CALENDAR_KEYS = ["calendar_event"] as const;
/**
 * A notification is not something the assistant creates directly — the server
 * raises it — so this list is empty and the screen relies on
 * `NotificationChannel`, which already pushes every new row. The constant
 * exists so the two screens read alike and so the day an action does create
 * one, there is a named place for it.
 */
export const NOTIFICATION_KEYS = [] as const;

interface SocketFrame {
  message?: unknown;
}

/**
 * Call `onChanged` when an assistant reply says it touched one of `keys`.
 *
 * `onChanged` is held in a ref, so a screen may pass an inline function
 * without tearing the subscription down and rebuilding it on every render —
 * which would also mean a `connected` callback, and a refetch, per render.
 */
export function useAssistantEcho(keys: readonly string[], onChanged: () => void): void {
  const changed = useRef(onChanged);
  changed.current = onChanged;

  // A primitive the effect can depend on: `keys` is a literal at every call
  // site, so its identity changes every render.
  const watched = keys.join(",");

  useEffect(() => {
    if (!watched) return;
    const wanted = watched.split(",");

    return subscribeToChannel<SocketFrame>("MessageChannel", {
      onData: (payload) => {
        if (!payload?.message) return;
        try {
          const message = messagesApi.parseOne(payload.message);
          if (message.role !== "assistant") return;
          if (message.links.some((link) => link.key && wanted.includes(link.key))) {
            changed.current();
          }
        } catch {
          // A frame we cannot read is not a statement that anything changed.
          // `useConversation` already resyncs on one; doing it here as well
          // would refetch this screen for every malformed frame.
        }
      },
    });
  }, [watched]);
}
