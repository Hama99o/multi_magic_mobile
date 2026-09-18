/**
 * A LIVE TRANSCRIPT — the one piece of real engineering in this app.
 *
 * ── The problem it solves ─────────────────────────────────────────────────
 * `POST /api/v1/ai/show` returns 202. It SAVES the question and enqueues
 * `Ai::RagChat`; the answer is broadcast later over ActionCable. So a composer
 * cannot "send and await a response" — it sends, shows the question at once,
 * and renders the answer when it lands.
 *
 * And the socket WILL drop: a tunnel, a lock screen, a pocket. ActionCable
 * never replays what it broadcast while a client was away, so the only recovery
 * is to re-read the transcript over HTTP. That is what `onConnected` is for,
 * and it is why this hook exists rather than a `useEffect` in a screen.
 *
 * ── It knows nothing about the assistant ──────────────────────────────────
 * It takes a `conversationId` and a channel. `Conversation` is one model with
 * an `is_ai` flag, and both kinds of thread read history from the same endpoint
 * with the same cursor — so the assistant's session and a thread with a person
 * are the same code, differing only in which channel carries the live events.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeToChannel, type ChannelParams } from "@/lib/cable";
import { messagesApi, type ChatMessage } from "@/api/ai";

export type ConversationStatus = "loading" | "ready" | "failed";

export interface UseConversationOptions {
  conversationId: number | null;
  /** `MessageChannel` for the assistant, `ConversationChannel` for people. */
  channel: string;
  channelParams?: ChannelParams;
}

export interface UseConversationResult {
  messages: ChatMessage[];
  status: ConversationStatus;
  /** True between posting a question and the assistant's reply landing. */
  awaitingReply: boolean;
  hasOlder: boolean;
  loadOlder: () => Promise<void>;
  /** Show a just-posted question immediately, before the server echoes it. */
  addPending: (message: ChatMessage) => void;
  /** The reply did not arrive — the server said so over the socket. */
  failed: boolean;
  resync: () => Promise<void>;
}

interface SocketPayload {
  message?: unknown;
  aiError?: boolean;
  conversationId?: number;
}

/**
 * Newest wins on id, and order is by id.
 *
 * A message can arrive twice — once over the socket and once in a resync that
 * overlaps it — and the two copies are not always identical: a resync's copy
 * carries `read_at` and reactions the broadcast did not.
 */
function merge(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<number, ChatMessage>();
  for (const message of existing) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export function useConversation({
  conversationId,
  channel,
  channelParams,
}: UseConversationOptions): UseConversationResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConversationStatus>("loading");
  const [hasOlder, setHasOlder] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [failed, setFailed] = useState(false);

  /**
   * The live conversation id, read inside callbacks that must not be rebuilt
   * when it changes — a changing subscription callback would tear the socket
   * subscription down and back up on every render.
   */
  const conversationRef = useRef(conversationId);
  conversationRef.current = conversationId;

  const resync = useCallback(async () => {
    const id = conversationRef.current;
    if (id == null) return;
    try {
      const page = await messagesApi.latest(id);
      // Merged, not replaced. A reply can land on the socket while this request
      // is in flight, and replacing would drop it — the one message the user is
      // actually waiting for.
      setMessages((current) => merge(current, page.messages));
      setHasOlder(page.hasMore);
      setStatus("ready");
      if (page.messages.some((m) => m.role === "assistant")) setAwaitingReply(false);
    } catch {
      setStatus((current) => (current === "ready" ? current : "failed"));
    }
  }, []);

  const loadOlder = useCallback(async () => {
    const id = conversationRef.current;
    const oldest = messages[0]?.id;
    if (id == null || oldest == null || !hasOlder) return;
    try {
      // A CURSOR, not a page number — see `messagesApi.before`.
      const page = await messagesApi.before(id, oldest);
      setMessages((current) => merge(current, page.messages));
      setHasOlder(page.hasMore);
    } catch {
      // Leave what is on screen. Failing to load history is not a reason to
      // lose the part already read.
    }
  }, [messages, hasOlder]);

  const addPending = useCallback((message: ChatMessage) => {
    setMessages((current) => merge(current, [message]));
    setAwaitingReply(true);
    setFailed(false);
  }, []);

  // Opening a different conversation starts over.
  useEffect(() => {
    setMessages([]);
    setStatus(conversationId == null ? "loading" : "loading");
    setAwaitingReply(false);
    setFailed(false);
    if (conversationId != null) void resync();
  }, [conversationId, resync]);

  /**
   * Serialised so the effect below has a statically checkable primitive to
   * depend on. `channelParams` is an object literal at most call sites, so a
   * fresh identity every render would tear the socket subscription down and
   * rebuild it on each one — and a resubscribe means a `connected` callback,
   * which means a resync. A render loop that quietly refetches the transcript.
   */
  const channelParamsKey = JSON.stringify(channelParams ?? null);

  useEffect(() => {
    if (conversationId == null) return;

    const params = channelParamsKey ? (JSON.parse(channelParamsKey) as ChannelParams | null) : null;

    return subscribeToChannel<SocketPayload>(
      channel,
      {
        onData: (payload) => {
          // The server already broadcasts its own failure. Without this branch a
          // question that failed looks identical to one still being thought
          // about — for ever.
          if (payload?.aiError) {
            setAwaitingReply(false);
            setFailed(true);
            return;
          }
          if (!payload?.message) return;
          try {
            // Reuse the boundary parser rather than trusting the socket frame:
            // it arrives from the same serializer as the HTTP payload, and an
            // unparsed frame is the one place a bad shape would reach state.
            const parsed = messagesApi.parseOne(payload.message);
            if (parsed.conversationId !== conversationRef.current) return;
            setMessages((current) => merge(current, [parsed]));
            if (parsed.role === "assistant") {
              setAwaitingReply(false);
              setFailed(false);
            }
          } catch {
            // A frame we cannot read is a reason to go and re-read the
            // transcript, not to drop the message.
            void resync();
          }
        },
        // ── THE RULE ──────────────────────────────────────────────────────
        // Fires on the first connect AND every reconnect. A reply that landed
        // while the phone was in a tunnel is not on the socket any more; it is
        // only in the transcript.
        onConnected: () => void resync(),
      },
      params ?? undefined,
    );
  }, [conversationId, channel, channelParamsKey, resync]);

  return {
    messages, status, awaitingReply, hasOlder, loadOlder, addPending, failed, resync,
  };
}
