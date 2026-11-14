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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppState, type AppStateStatus } from "react-native";
import { subscribeToChannel, type ChannelParams } from "@/lib/cable";
import { messagesApi, type ChatMessage } from "@/api/ai";
import { conversationKeys } from "@/api/keys";

/** While waiting for a reply we also ask the API, so a lost broadcast cannot
 *  strand the chat. `AI_ASSISTANT.md` §11. */
const RESYNC_MS = 3_000;
/** Longest we keep waiting before giving the composer back. */
const REPLY_TIMEOUT_MS = 180_000;
/** How far a reconnect reads back to close a gap: 20 pages of 25. Past that
 *  the thread is re-read from the newest, and older history loads on scroll. */
const MAX_GAP_PAGES = 20;

/** "gone": the server answered 404, so the conversation was deleted
 *  elsewhere (Hamma9901's call, 2026-09-25): the screen says so rather than
 *  letting him type into something that no longer exists. */
export type ConversationStatus = "loading" | "ready" | "failed" | "gone";

/**
 * Ids at or above this are LOCAL — a question drawn before the server has
 * given it an id. Far above any database id, so it sorts last, where a new
 * question belongs; `merge` orders by id.
 */
const OPTIMISTIC_BASE = Number.MAX_SAFE_INTEGER - 1_000_000;
export const isOptimisticId = (id: number) => id >= OPTIMISTIC_BASE;

export interface UseConversationOptions {
  conversationId: number | null;
  /** `MessageChannel` for the assistant, `ConversationChannel` for people. */
  channel: string;
  channelParams?: ChannelParams;
  /**
   * Messages the app ALREADY KNOWS for this conversation, drawn before the
   * first read arrives, instead of a skeleton (2026-09-25). The people thread
   * passes the chats list's last message. They go through the same parser
   * (`messagesApi.parseOne`) as a loaded page, and the first read MERGES by
   * id, so a seeded bubble is kept, not replaced. Only for the conversation
   * it was given with: a different id starts empty.
   */
  seed?: ChatMessage[];
}

export interface UseConversationResult {
  messages: ChatMessage[];
  status: ConversationStatus;
  /** True between posting a question and the assistant's reply landing. */
  awaitingReply: boolean;
  hasOlder: boolean;
  loadOlder: () => Promise<void>;
  /**
   * Show a just-posted QUESTION immediately, and start waiting for an answer.
   * Only for a turn that expects an assistant reply.
   */
  addPending: (message: ChatMessage) => void;
  /**
   * Show a question THE MOMENT it is sent, before the server has answered the
   * POST — returns the local id to confirm or drop it by.
   *
   * Measured 2026-09-24 on `qa_phone4`: waiting for the 202 before drawing the
   * bubble left the question on screen NOWHERE for ~1.4 s, while the emptied
   * composer let the thread drop back to older messages; then the bubble
   * arrived and the thread jumped up. Down, pause, up — the blink he reported.
   */
  addOptimistic: (message: Omit<ChatMessage, "id">) => number;
  /** The POST answered: the local question becomes the server's message. */
  confirmPending: (localId: number, serverId: number) => void;
  /** The POST failed: take the local question back off the screen. */
  dropPending: (localId: number) => void;
  /**
   * A list key that SURVIVES the local id becoming the server's. Keyed on the
   * raw id, the row remounts at the swap and replays its entry fade.
   */
  keyOf: (message: ChatMessage) => string;
  /**
   * Merge a message in WITHOUT claiming a reply is coming.
   *
   * A thread with a person never produces an assistant message, so routing its
   * sends, edits, reactions and deletes through `addPending` would start the
   * 3-second resync poll and run it for the full three minutes before the
   * timeout released it — on a mobile connection, for a thumbs-up. Correct and
   * self-healing, and still a poll storm on the screen people use most.
   */
  mergeMessage: (message: ChatMessage) => void;
  /** The reply did not arrive — the server said so over the socket, or we gave
   *  up waiting. */
  failed: boolean;
  /** Messages the parser could not read and left out, for the screen to say
   *  so (`UnreadableNotice`). */
  unreadable: number;
  /**
   * WHY the last load failed, for the screen to say which (offline, a
   * refusal, too many requests) through `failureMessage`. Null once a load
   * succeeds. Before this the thread said one sentence for all of them.
   */
  loadError: unknown;
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
/**
 * A STALE SNAPSHOT MUST NOT UNDO A CHANGE (the socket audit, 2026-09-24).
 *
 * A resync is an HTTP read that started at some moment; a socket frame for an
 * edit or a delete can land while it is in flight, and the response then
 * arrives carrying the message as it was BEFORE. Taken whole, it would give a
 * deleted message its words back, revert an edit, or re-offer an undone undo.
 * The people thread resyncs whenever the other side reads, so this is not
 * rare. Deleted, edited and undone only move forward. Everything else
 * (reactions, read state) takes the incoming copy.
 */
function notOlder(had: ChatMessage, incoming: ChatMessage): ChatMessage {
  let next = incoming;
  if (had.deleted && !incoming.deleted) next = { ...next, deleted: true, body: had.body };
  // Compared as TIMES, not as text: two ISO strings for one instant can differ
  // in offset ("…22:00:00Z" and "…00:00:00+02:00"), and a text comparison
  // would call the later edit the older one (self-review, 2026-09-25).
  if (had.editedAt && (!incoming.editedAt || Date.parse(incoming.editedAt) < Date.parse(had.editedAt))) {
    next = { ...next, body: had.body, editedAt: had.editedAt };
  }
  if (had.undoneAt && !incoming.undoneAt) next = { ...next, undoneAt: had.undoneAt, undoable: had.undoable };
  return next;
}

function merge(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<number, ChatMessage>();
  // A local question is superseded by the server's copy of it, whichever path
  // brings that copy — the 202, the socket echo, or a resync. Matched on role
  // and body because the local copy has no id the server knows.
  const arrived = new Set(
    incoming.filter((m) => !isOptimisticId(m.id) && m.role === "user").map((m) => m.body),
  );
  for (const message of existing) {
    if (isOptimisticId(message.id) && arrived.has(message.body)) continue;
    byId.set(message.id, message);
  }
  for (const message of incoming) {
    // KEEP THE OBJECT WE HAVE when nothing in it changed. The 3-second resync
    // while an answer is pending re-reads the whole page, and handing every
    // row a fresh-but-identical object defeated `MessageRow`'s memo: each
    // poll re-rendered and re-parsed every visible answer, 413–602 ms per
    // commit measured on `qa_phone4` 2026-09-24.
    const had = byId.get(message.id);
    if (had && JSON.stringify(had) === JSON.stringify(message)) continue;
    byId.set(message.id, had ? notOlder(had, message) : message);
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** What the cache holds for one conversation (`conversationKeys.transcript`). */
interface Transcript {
  messages: ChatMessage[];
  hasOlder: boolean;
  unreadableLatest: number;
  unreadableOlder: number;
}
const EMPTY: Transcript = { messages: [], hasOlder: false, unreadableLatest: 0, unreadableOlder: 0 };

/**
 * ── WHERE THE TRANSCRIPT LIVES (React Query audit, 2026-11-13) ─────────────
 * The messages, `hasOlder` and the unreadable counts are in the React Query
 * cache under `conversationKeys.transcript(id)` (`docs/DATA_LAYER.md`), not in
 * this hook's state. So a conversation opened again draws what it had at once
 * while it re-reads, and any screen can read or merge into it. The READ is
 * that query's `queryFn` (the resync below, gap fill and all); the 3-second
 * poll while a reply is pending is its `refetchInterval`; a reconnect, the
 * return to the foreground and a bad frame call `resync`, which refetches it.
 * Socket frames, sends, edits and the optimistic question go in with
 * `setQueryData`, keyed through a ref so every callback here stays STABLE
 * (the people thread's rows depend on that).
 *
 * What stays local, because it is THIS screen's state and not the server's:
 * `status`, `loadError`, waiting for a reply, `failed`, and the local-id
 * bookkeeping (`askedAfterIdRef`, `drawnAs`).
 */
export function useConversation({
  conversationId,
  channel,
  channelParams,
  seed,
}: UseConversationOptions): UseConversationResult {
  const client = useQueryClient();
  // The seed belongs to the id it arrived with, fixed at mount.
  const seedFor = useRef({ id: conversationId, messages: seed ?? [] });
  const [status, setStatus] = useState<ConversationStatus>("loading");
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);

  /**
   * The live conversation id, read inside callbacks that must not be rebuilt
   * when it changes — a changing subscription callback would tear the socket
   * subscription down and back up on every render. Written in an effect, not
   * during render: the React Compiler (SDK 57) rejects a ref assignment in a
   * render body, and every read below happens in a callback or a frame.
   */
  const conversationRef = useRef(conversationId);
  useEffect(() => {
    conversationRef.current = conversationId;
  });

  /** Read and write the cached transcript of the CURRENT conversation. */
  const read = useCallback((id: number | null) => (id == null ? undefined : client.getQueryData<Transcript>(conversationKeys.transcript(id))), [client]);
  const edit = useCallback(
    (fn: (t: Transcript) => Transcript) => {
      const id = conversationRef.current;
      if (id == null) return;
      client.setQueryData<Transcript>(conversationKeys.transcript(id), (t) => fn(t ?? EMPTY));
    },
    [client],
  );

  /**
   * The id of the question we are waiting on an answer to.
   *
   * `awaitingReply` must clear on ANY assistant message newer than it, whatever
   * brought it — socket frame, 3-second poll, or a resync on waking. Clearing
   * only on a socket frame is what made a delivered answer still look pending.
   */
  const askedAfterIdRef = useRef(0);

  /** The read, as the transcript query's `queryFn`. */
  const readTranscript = useCallback(
    async (id: number): Promise<Transcript> => {
      try {
        const page = await messagesApi.latest(id);
        // ── THE GAP A RECONNECT LEAVES (the socket audit, 2026-09-24) ─────
        // The latest page is 25 messages. If more than that arrived while the
        // socket was down, the ones between what is on screen and this page
        // were never fetched, and `loadOlder` only reaches back from the OLDEST
        // loaded message, so the hole stayed for as long as the screen was
        // open: a thread that reconnects and quietly misses messages. So read
        // back until the page meets what is already here, or history ends.
        const known = read(id)?.messages ?? [];
        const newestKnown = Math.max(0, ...known.filter((m) => !isOptimisticId(m.id)).map((m) => m.id));
        let hasMore = page.hasMore;
        let unreadable = page.unreadable ?? 0;
        const filled = [...page.messages];
        for (let i = 0; i < MAX_GAP_PAGES && newestKnown > 0 && hasMore; i++) {
          const oldest = Math.min(...filled.map((m) => m.id));
          if (oldest <= newestKnown + 1) break;
          const older = await messagesApi.before(id, oldest);
          filled.unshift(...older.messages);
          hasMore = older.hasMore;
          unreadable += older.unreadable ?? 0;
        }
        // Merged into the cache AS IT IS NOW, not as it was when this read
        // started: a reply can land on the socket while this request is in
        // flight, and replacing would drop it — the one message the user is
        // actually waiting for.
        const now = read(id) ?? EMPTY;
        const next: Transcript = { ...now, messages: merge(now.messages, filled), hasOlder: page.hasMore, unreadableLatest: unreadable };
        if (id === conversationRef.current) {
          setStatus("ready");
          setLoadError(null);
          // Newer than the question, not merely present: an older assistant
          // message already on screen must not be read as this question's answer.
          if (filled.some((m) => m.role === "assistant" && m.id > askedAfterIdRef.current)) setAwaitingReply(false);
        }
        return next;
      } catch (e) {
        // A 404 is a fact, not a failure: the conversation was deleted on
        // another device while this screen had it open. Silent here, it let
        // him keep typing, and the send then failed looking like a network
        // problem. Anything else keeps the old rule: a thread already shown
        // stays shown.
        if (id === conversationRef.current) {
          if ((e as { response?: { status?: number } })?.response?.status === 404) setStatus("gone");
          else {
            setLoadError(e);
            setStatus((current) => (current === "ready" ? current : "failed"));
          }
        }
        throw e;
      }
    },
    [read],
  );

  const seedTranscript = conversationId != null && conversationId === seedFor.current.id && seedFor.current.messages.length
    ? { ...EMPTY, messages: seedFor.current.messages }
    : undefined;
  const transcript = useQuery({
    queryKey: conversationKeys.transcript(conversationId),
    queryFn: () => readTranscript(conversationId!),
    enabled: conversationId != null,
    retry: false,
    // A seed is drawn at once and is stale from the start, so it is read too.
    initialData: seedTranscript,
    initialDataUpdatedAt: 0,
    // While a reply is pending, ask the API as well as listening. Not a
    // fallback that runs "if the socket fails": there is no reliable way to
    // know that it has. Whichever arrives first clears the wait.
    refetchInterval: awaitingReply ? RESYNC_MS : false,
    refetchIntervalInBackground: false,
  });
  const data = transcript.data ?? EMPTY;
  const { refetch } = transcript;

  const resync = useCallback(async () => {
    if (conversationRef.current == null) return;
    // A refused read has already said so through `status` and `loadError`.
    await refetch().catch(() => undefined);
  }, [refetch]);

  const loadOlder = useCallback(async () => {
    const id = conversationRef.current;
    const oldest = read(id)?.messages[0]?.id;
    if (id == null || oldest == null || !read(id)?.hasOlder) return;
    try {
      // A CURSOR, not a page number — see `messagesApi.before`. Read through
      // the cache, then merged into the transcript.
      const page = await client.fetchQuery({
        queryKey: conversationKeys.olderPage(id, oldest),
        queryFn: () => messagesApi.before(id, oldest),
        gcTime: 0,
      });
      edit((t) => ({ ...t, messages: merge(t.messages, page.messages), unreadableOlder: t.unreadableOlder + (page.unreadable ?? 0), hasOlder: page.hasMore }));
    } catch {
      // Leave what is on screen. Failing to load history is not a reason to
      // lose the part already read.
    }
  }, [client, read, edit]);

  const mergeMessage = useCallback(
    (message: ChatMessage) => edit((t) => ({ ...t, messages: merge(t.messages, [message]) })),
    [edit],
  );

  const addPending = useCallback(
    (message: ChatMessage) => {
      mergeMessage(message);
      askedAfterIdRef.current = message.id;
      setAwaitingReply(true);
      setFailed(false);
    },
    [mergeMessage],
  );

  const nextLocalId = useRef(OPTIMISTIC_BASE);
  /** server id → the local id it was drawn under, for `keyOf`. */
  const drawnAs = useRef(new Map<number, number>());
  const keyOf = useCallback(
    (message: ChatMessage) => String(drawnAs.current.get(message.id) ?? message.id),
    [],
  );

  const addOptimistic = useCallback(
    (draft: Omit<ChatMessage, "id">) => {
      const localId = nextLocalId.current++;
      edit((t) => {
        // The answer is whatever assistant message is newer than everything we
        // have now; the question's own id is not known yet.
        askedAfterIdRef.current = t.messages.reduce((max, m) => (isOptimisticId(m.id) ? max : Math.max(max, m.id)), 0);
        return { ...t, messages: merge(t.messages, [{ ...draft, id: localId }]) };
      });
      setAwaitingReply(true);
      setFailed(false);
      return localId;
    },
    [edit],
  );

  const confirmPending = useCallback(
    (localId: number, serverId: number) => {
      edit((t) => {
        const local = t.messages.find((m) => m.id === localId);
        const rest = t.messages.filter((m) => m.id !== localId);
        // Already superseded by an echo that beat the 202: nothing to swap.
        if (local) drawnAs.current.set(serverId, localId);
        return { ...t, messages: local ? merge(rest, [{ ...local, id: serverId }]) : rest };
      });
      askedAfterIdRef.current = Math.max(askedAfterIdRef.current, serverId);
    },
    [edit],
  );

  const dropPending = useCallback(
    (localId: number) => {
      edit((t) => ({ ...t, messages: t.messages.filter((m) => m.id !== localId) }));
      setAwaitingReply(false);
    },
    [edit],
  );

  // Opening a different conversation starts over (its transcript, if the
  // cache has one, is drawn at once and re-read by the query).
  useEffect(() => {
    drawnAs.current.clear();
    setStatus("loading");
    setAwaitingReply(false);
    setFailed(false);
    setLoadError(null);
  }, [conversationId]);

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
            mergeMessage(parsed);
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
  }, [conversationId, channel, channelParamsKey, resync, mergeMessage]);

  /**
   * Back from the background: pick up whatever was missed.
   *
   * `lib/cable.ts` reopens a dropped socket on the same signal, but that only
   * helps if the socket had actually dropped. A phone that was asleep for a
   * minute may hold a socket the OS quietly stopped delivering to, so the
   * transcript is re-read regardless.
   */
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void resync();
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
    messages: data.messages, status, awaitingReply, hasOlder: data.hasOlder, loadOlder,
    addPending, addOptimistic, confirmPending, dropPending, keyOf, mergeMessage, failed, resync,
    unreadable: data.unreadableLatest + data.unreadableOlder,
    loadError,
  };
}
