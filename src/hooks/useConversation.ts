/**
 * A LIVE TRANSCRIPT — the one piece of real engineering in this app.
 *
 * ── THE CHANNEL IS THE FAST PATH, NEVER THE ONLY ONE ──────────────────────
 * This is the rule multi_magic arrived at after shipping the other version, and
 * it is written into `AI_ASSISTANT.md` §11: a socket that is down loses
 * everything broadcast while it was, and that used to mean "a question with no
 * bubble and a spinner that only a reload could clear".
 *
 * So the socket is treated as an OPTIMISATION over HTTP, not as the delivery
 * mechanism. Three things run alongside it, all of them here:
 *
 *   1. while a reply is pending, the transcript is re-read every 3 s;
 *   2. it is re-read on every (re)connect and whenever the app returns to the
 *      foreground;
 *   3. a reply that never comes releases the composer after 3 minutes, rather
 *      than leaving somebody looking at dots for ever.
 *
 * The web verified the consequence with every cable socket force-closed: the
 * question still appears and the answer still lands in about three seconds.
 * Without this an answer that arrives while the phone is asleep is simply lost
 * until the user restarts the app — and on a phone that is the normal case
 * rather than the edge one.
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
import { AppState, type AppStateStatus } from "react-native";
import { subscribeToChannel, type ChannelParams } from "@/lib/cable";
import { messagesApi, type ChatMessage } from "@/api/ai";

/** While waiting for a reply we also ask the API, so a lost broadcast cannot
 *  strand the chat. `AI_ASSISTANT.md` §11. */
const RESYNC_MS = 3_000;
/** Longest we keep waiting before giving the composer back. */
const REPLY_TIMEOUT_MS = 180_000;

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
  /** The reply did not arrive — the server said so over the socket, or we gave
   *  up waiting. */
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

  /**
   * The id of the question we are waiting on an answer to.
   *
   * `awaitingReply` must clear on ANY assistant message newer than it, whatever
   * brought it — socket frame, 3-second poll, or a resync on waking. Clearing
   * only on a socket frame is what made a delivered answer still look pending.
   */
  const askedAfterIdRef = useRef(0);

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
      // Newer than the question, not merely present: an older assistant message
      // already on screen must not be read as this question's answer.
      if (page.messages.some((m) => m.role === "assistant" && m.id > askedAfterIdRef.current)) {
        setAwaitingReply(false);
      }
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
    askedAfterIdRef.current = message.id;
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
            if (parsed.role === "assistant" && parsed.id > askedAfterIdRef.current) {
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

  /**
   * While a reply is pending, ask the API as well as listening.
   *
   * Not a fallback that runs "if the socket fails" — there is no reliable way
   * to know that it has. It runs alongside, and whichever arrives first clears
   * the wait.
   */
  useEffect(() => {
    if (!awaitingReply) return;
    const timer = setInterval(() => void resync(), RESYNC_MS);
    return () => clearInterval(timer);
  }, [awaitingReply, resync]);

  /**
   * Back from the background: pick up whatever was missed.
   *
   * `lib/cable.ts` reopens a dropped socket on the same signal, but that only
   * helps if the socket had actually dropped. A phone that was asleep for a
   * minute may hold a socket the OS quietly stopped delivering to, so the
   * transcript is re-read regardless.
   */
  useEffect(() => {
    const sub = AppState.addEventListener("change", (status: AppStateStatus) => {
      if (status === "active") void resync();
    });
    return () => sub.remove();
  }, [resync]);

  /**
   * Give the composer back after three minutes.
   *
   * A job can genuinely take a while, so this is long. But dots that never stop
   * are indistinguishable from a lost reply, and the one thing a person cannot
   * do with them is decide what to do next.
   */
  useEffect(() => {
    if (!awaitingReply) return;
    const timer = setTimeout(() => {
      setAwaitingReply(false);
      setFailed(true);
    }, REPLY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [awaitingReply]);

  return {
    messages, status, awaitingReply, hasOlder, loadOlder, addPending, failed, resync,
  };
}
