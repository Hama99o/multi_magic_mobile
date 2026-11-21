/**
 * A thread with a PERSON — `docs/design/people-chat/SPEC.md`.
 *
 * ── TWO CHANNELS, AND WHICH ONE CARRIES WHAT ──────────────────────────────
 * This is the correction that would otherwise have shipped as a bug, so it is
 * written here as well as in the SPEC.
 *
 * `messaging/broadcast.rb:19-29` sends every new message TWICE:
 *
 *   to_user(member.user, message: payload(message, member.user), …)   per reader
 *   to_conversation(conversation, payload(message, nil))              user: NIL
 *
 * `MessageSerializer` derives `sent_by_me` from that argument
 * (`message_serializer.rb:25-27`). So on the **ConversationChannel** copy it is
 * `false` for everybody — the sender included — and `reactions[].mine` is false
 * for everybody too. A thread fed from that stream draws every message on the
 * left. (And it would not even get that far: the `created` frame there is the
 * bare message hash with no `message` key, which `useConversation.ts:203`
 * drops.)
 *
 * So: **messages come from `MessageChannel`**, exactly as the assistant's do —
 * that copy is rendered per reader and carries `conversation_id`, which
 * `useConversation` already filters on. **`ConversationChannel` is subscribed
 * for `typing` and `read` alone**, because those two exist nowhere else
 * (`broadcast.rb:41-48`).
 *
 * Nothing in `src/hooks/useConversation.ts`, `src/lib/cable.ts` or
 * `src/api/ai.ts` is changed to make that work, which is the check that Phase 1
 * really was built generic.
 *
 * ── SEARCH AND MEMBERS (audit #29, #30) ───────────────────────────────────
 * The header's search opens `ThreadSearch` (the web's): a result loads
 * history back to the message by cursor, then the list scrolls to it and
 * marks it (`revealMessage`, the web's `useChat.reveal`). A group's header
 * opens `MembersSheet` (the web's `MembersPanel`).
 *
 * ── SENDING IS HTTP, ALWAYS ───────────────────────────────────────────────
 * `messages_controller.rb:5-8`: "`perform` on a subscription that is not up is
 * a silent no-op, and a send that vanishes is the worst failure a chat can
 * have." `typing` and `mark_read` may ride the socket; a message may not.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, FlatList, Pressable, View, type ViewStyle } from "react-native";
import { useNav, useNavParams } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Search, Sparkles, Trash2, Users } from "@/components/icons";
import { useAsk } from "@/screens/flow/useAsk";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { UnreadableNotice } from "@/components/UnreadableNotice";
import { useConversation } from "@/hooks/useConversation";
import { performOnChannel, subscribeToChannel } from "@/lib/cable";
import {
  conversationsApi,
  threadApi,
  type ConversationEvent,
  type ConversationList,
} from "@/api/conversations";
import type { ChatMessage } from "@/api/ai";
import { failureMessage, refusalReason } from "@/api/failure";
import { Avatar } from "@/screens/people/Avatar";
import { PersonMessageRow } from "@/screens/people/PersonMessageRow";
import { ScrollToBottom, useNewestAnchor } from "@/components/chat/ScrollToBottom";
import { BubblesSkeleton } from "@/components/reusables/skeleton";
import { PersonComposer } from "@/screens/people/PersonComposer";
import { ReactionSheet } from "@/screens/people/ReactionSheet";
import { DayDivider, UnreadDivider, dayLabel } from "@/screens/people/DayDivider";
import { conversationKeys } from "@/api/keys";
import { ThreadSearch } from "@/screens/people/ThreadSearch";
import { MembersSheet } from "@/screens/people/MembersSheet";

/** A bound on `revealMessage`, the web's (`useChat.ts` MAX_REVEAL_PAGES): 25
 *  pages of history is far enough back for a search result, and keeps a
 *  runaway loop impossible. */
export const MAX_REVEAL_PAGES = 25;

/** The transcript as `useConversation` caches it — read here, never written. */
interface TranscriptCache {
  messages: ChatMessage[];
  hasOlder: boolean;
  unreadableLatest: number;
  unreadableOlder: number;
}

/** How long a typing indicator survives its last frame. */
const TYPING_LINGER_MS = 4_000;

/** A send that has not been accepted yet. Never merged into the transcript —
 *  it has no server id, and inventing one would collide. */
interface Outgoing {
  key: string;
  body: string;
  failed: boolean;
  /**
   * The SERVER's reason, when it refused rather than was unreachable: a body
   * over `validates :body, length: { maximum: 10_000 }` is a 422 saying
   * exactly that, and "Tap to retry" alone would retry it for ever.
   */
  reason?: string | null;
}

type Row =
  | { kind: "day"; key: string; label: string }
  | { kind: "unread"; key: string }
  | { kind: "message"; key: string; message: ChatMessage; isLastSent: boolean; found: boolean }
  | { kind: "outgoing"; key: string; outgoing: Outgoing };

/** Module-level so the list is handed the same function every render. */
const rowKey = (row: Row) => row.key;

/** Two rows are the same row when everything the row DRAWS is the same.
 *  `rows` is rebuilt on every message change, so its objects are always new;
 *  comparing their fields is what lets an unchanged bubble skip rendering. */
function sameRow(a: Row, b: Row): boolean {
  if (a.kind !== b.kind || a.key !== b.key) return false;
  if (a.kind === "day" && b.kind === "day") return a.label === b.label;
  if (a.kind === "message" && b.kind === "message") {
    return a.message === b.message && a.isLastSent === b.isLastSent && a.found === b.found;
  }
  if (a.kind === "outgoing" && b.kind === "outgoing") {
    return (
      a.outgoing.body === b.outgoing.body &&
      a.outgoing.failed === b.outgoing.failed &&
      a.outgoing.reason === b.outgoing.reason
    );
  }
  return true;
}

/**
 * ONE ROW OF THE THREAD, MEMOISED.
 *
 * Measured 2026-09-24 on `qa_phone4` with React.Profiler: with an inline
 * `renderItem` and a fresh `onLongPress` arrow per row, typing in this
 * thread gave 17 list commits of 112-432 ms each, every visible bubble
 * re-rendering on every keystroke. The same defect the assistant's thread had
 * (`app/chat.tsx`, `renderItem`).
 */
const ThreadRow = memo(
  function ThreadRow({
    row,
    conversationId,
    nameFor,
    onOpenSheet,
    onReact,
    onRetry,
  }: {
    row: Row;
    conversationId: number;
    nameFor: (message: ChatMessage) => string | null;
    onOpenSheet: (message: ChatMessage) => void;
    onReact: (message: ChatMessage, emoji: string) => void;
    onRetry: (outgoing: Outgoing) => void;
  }) {
    if (row.kind === "day") return <DayDivider label={row.label} />;
    if (row.kind === "unread") return <UnreadDivider />;
    if (row.kind === "outgoing") {
      return (
        <PersonMessageRow
          message={{
            // A local echo. It never merges into the transcript — it has
            // no server id — and it is replaced by the saved message the
            // moment the POST answers.
            id: -1,
            conversationId,
            role: "user",
            body: row.outgoing.body,
            createdAt: new Date().toISOString(),
            deleted: false,
            userId: null,
            sentByMe: true,
            editedAt: null,
            readAt: null,
            reactions: [],
            links: [],
            sources: [],
            undoable: false,
            undoneAt: null,
          }}
          pending={!row.outgoing.failed}
          failed={row.outgoing.failed}
          failureReason={row.outgoing.reason ?? null}
          onRetry={() => onRetry(row.outgoing)}
        />
      );
    }
    const { message } = row;
    const bubble = (
      <PersonMessageRow
        message={message}
        senderName={nameFor(message)}
        isLastSent={row.isLastSent}
        onLongPress={() => onOpenSheet(message)}
        onToggleReaction={(emoji) => onReact(message, emoji)}
      />
    );
    // The search result just jumped to, marked so the eye lands on it.
    return row.found ? <FoundMark id={message.id}>{bubble}</FoundMark> : bubble;
  },
  (a, b) =>
    sameRow(a.row, b.row) &&
    a.conversationId === b.conversationId &&
    a.nameFor === b.nameFor &&
    a.onOpenSheet === b.onOpenSheet &&
    a.onReact === b.onReact &&
    a.onRetry === b.onRetry,
);

function FoundMark({ id, children }: { id: number; children: ReactNode }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View
      testID={`thread-found-${id}`}
      style={{ borderWidth: 2, borderColor: colors.accent, borderRadius: metrics.radius.md, padding: 2 }}
    >
      {children}
    </View>
  );
}

/**
 * WHAT THE APP ALREADY KNOWS ABOUT THIS THREAD, so it opens with it (2026-09-25).
 *
 * The chats list holds each conversation's last message, parsed by the same
 * `messagesApi.parseOne` as the thread's own page, so it is the same
 * `ChatMessage` and not a near-miss (the key-and-shape gate checks this read,
 * `src/__tests__/queryKeys.test.ts`). Seeding it means the thread opens with
 * the newest message instead of a skeleton; the first read MERGES by id and
 * keeps it.
 *
 * Only while the list's copy is fresh: a copy older than a minute may be
 * superseded, and a bubble that changes under the reader is worse than a
 * skeleton. A later edit arriving over the socket changes the bubble exactly
 * as it would on a thread already open, which is a live edit, not a
 * correction.
 */
export const SEED_MAX_AGE_MS = 60_000;

export function lastKnownMessages(client: QueryClient, conversationId: number, now = Date.now()): ChatMessage[] | undefined {
  const state = client.getQueryState<InfiniteData<ConversationList>>(conversationKeys.list());
  if (!state?.data || now - state.dataUpdatedAt > SEED_MAX_AGE_MS) return undefined;
  for (const page of state.data.pages) {
    const found = page.conversations.find((c) => c.id === conversationId);
    if (found) return found.lastMessage ? [found.lastMessage] : undefined;
  }
  return undefined;
}

export default function PersonThread() {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const params = useNavParams<{
    id: string;
    name?: string;
    isGroup?: string;
    unread?: string;
  }>();

  const conversationId = Number(params.id);
  const isGroup = params.isGroup === "1";
  const title = params.name ?? t("thread.chat");
  const ask = useAsk();

  /**
   * `mergeMessage`, never `addPending` — and the difference is a poll storm.
   *
   * `addPending` also sets `awaitingReply`, which clears only on an ASSISTANT
   * message newer than the last pending id — and a thread with a person never
   * produces one. Routing a send, an edit or a thumbs-up through it would start
   * the 3-second resync poll and run it the full three minutes before the
   * timeout released it, on a mobile connection, for a reaction.
   *
   * This screen documented that cost rather than editing somebody else's file;
   * the other session has since landed `mergeMessage` for exactly this, so the
   * cost is now taken rather than carried. Nothing here expects a reply, so
   * nothing here calls `addPending`.
   */
  // Fixed at open: what the chats list already knew (`lastKnownMessages`).
  const [seed] = useState(() => (Number.isFinite(conversationId) ? lastKnownMessages(queryClient, conversationId) : undefined));
  const { messages, status, hasOlder, loadOlder, mergeMessage, resync, unreadable, loadError } = useConversation({
    conversationId: Number.isFinite(conversationId) ? conversationId : null,
    // See this file's header. NOT ConversationChannel.
    channel: "MessageChannel",
    seed,
  });

  const [draft, setDraft] = useState("");
  const [outbox, setOutbox] = useState<Outgoing[]>([]);
  const [sheetFor, setSheetFor] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  /** A failed edit or delete, said once above the composer until the next try. */
  const [threadError, setThreadError] = useState<string | null>(null);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  /** The search result being loaded back to, and the one last jumped to. */
  const [revealing, setRevealing] = useState<number | null>(null);
  const [foundId, setFoundId] = useState<number | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const listRef = useRef<FlatList<Row>>(null);
  // Inverted, like the assistant's thread — `useNewestAnchor` has why.
  const { awayFromBottom, onScroll, toBottom, maintainVisibleContentPosition } =
    useNewestAnchor(listRef);

  /**
   * The unread count as it was BEFORE the thread was opened.
   *
   * `mark_read` fires on open, so asking the server how many were unread
   * afterwards gets zero — every time. The count is carried in from the list
   * row and read once, which is the only moment it is still true.
   */
  const unreadOnOpen = useRef(Number(params.unread ?? 0));

  /**
   * `mark_read` ON OPEN, over HTTP.
   *
   * The route's own comment says it exists "for a client that has just opened
   * one and cannot wait for a subscription" (`routes.rb:287`) — and a thread
   * that opens before the socket is up is the normal case on a phone, not the
   * edge one. The list's badge is invalidated after, so going back shows the
   * row already cleared.
   */
  // A mutation the effect FIRES; the request itself lives in the mutation
  // (docs/DATA_LAYER.md). Losing it is survivable: it is re-sent the next
  // time the thread opens, and the badge is stale rather than wrong.
  const { mutate: markRead } = useMutation({
    mutationFn: (id: number) => conversationsApi.markRead(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: conversationKeys.all }),
  });
  useEffect(() => {
    if (Number.isFinite(conversationId)) markRead(conversationId);
  }, [conversationId, markRead]);

  /**
   * `ConversationChannel` — typing and read state, and nothing else.
   *
   * A `read` frame means somebody's `last_read_at` moved, which changes the
   * tick under MY messages. `read_at` is derived rather than pushed
   * (`message_serializer.rb:5-8`), so the way to pick it up is to re-read the
   * transcript — which is the same resync the socket dropping uses.
   */
  useEffect(() => {
    if (!Number.isFinite(conversationId)) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const stop = subscribeToChannel<ConversationEvent>(
      "ConversationChannel",
      {
        onData: (event) => {
          if (event?.typing) {
            setTypingName(event.user?.fullname ?? t("thread.someone"));
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => setTypingName(null), TYPING_LINGER_MS);
            return;
          }
          if (event?.read) void resync();
        },
        // The server refused the subscription — not a member, or it is gone.
        // The transcript is still readable over HTTP, so this is not fatal;
        // what it costs is typing and live read state.
        onRejected: () => setTypingName(null),
      },
      { conversation_id: conversationId },
    );

    return () => {
      if (timer) clearTimeout(timer);
      stop();
    };
  }, [conversationId, resync, t]);

  /** Fire-and-forget: `performOnChannel` returns false when the subscription is
   *  not up, and a lost typing indicator costs nothing. */
  const announceTyping = useCallback(() => {
    performOnChannel("ConversationChannel", "typing", undefined, {
      conversation_id: conversationId,
    });
  }, [conversationId]);

  /**
   * The thread's writes are mutations (docs/DATA_LAYER.md), held as their
   * STABLE mutate functions so `ThreadRow`'s props do not change on a
   * keystroke (a whole mutation object is a new one every render). NOT optimistic,
   * on purpose, and unchanged: an outgoing message waits in the OUTBOX (local
   * UI state, shown as sending) and stays on screen if it fails (BRIEF.md
   * §5); reaction counts come back from the server, never guessed. Each
   * answer is merged into the thread's cache by `mergeMessage`.
   */
  const { mutateAsync: sendBody } = useMutation({ mutationFn: (body: string) => threadApi.send(conversationId, body) });
  const { mutateAsync: editBody } = useMutation({ mutationFn: ({ id, body }: { id: number; body: string }) => threadApi.edit(conversationId, id, body) });
  const { mutateAsync: reactTo } = useMutation({ mutationFn: ({ id, emoji }: { id: number; emoji: string }) => threadApi.react(conversationId, id, emoji) });
  const { mutateAsync: removeById } = useMutation({ mutationFn: (id: number) => threadApi.remove(conversationId, id) });

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || !Number.isFinite(conversationId)) return;
    setThreadError(null);

    // Editing is a different verb on the same field.
    if (editing) {
      const target = editing;
      setEditing(null);
      setDraft("");
      try {
        mergeMessage(await editBody({ id: target.id, body }));
      } catch (e) {
        // Put it back in the composer rather than losing the words, AND say
        // so: the text silently reappearing read as the tap not working.
        setDraft(body);
        setEditing(target);
        setThreadError(failureMessage(e, t("thread.editFailed")));
      }
      return;
    }

    const key = `out-${Date.now()}`;
    setDraft("");
    setOutbox((current) => [...current, { key, body, failed: false }]);

    try {
      const saved = await sendBody(body);
      // Merged by the server's own id, so the MessageChannel echo of the same
      // message lands on top of it rather than appearing twice.
      mergeMessage(saved);
      setOutbox((current) => current.filter((item) => item.key !== key));
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    } catch (e) {
      // It STAYS ON SCREEN. `BRIEF.md` §5 — a message arrives or says it did
      // not; it never disappears into an optimistic bubble. With the server's
      // reason when it refused, so a retry that cannot work is not the only
      // thing on offer.
      setOutbox((current) =>
        current.map((item) =>
          item.key === key ? { ...item, failed: true, reason: refusalReason(e) } : item,
        ),
      );
    }
  }, [draft, conversationId, editing, mergeMessage, queryClient, t, sendBody, editBody]);

  const retry = useCallback(
    async (item: Outgoing) => {
      setOutbox((current) =>
        current.map((row) => (row.key === item.key ? { ...row, failed: false } : row)),
      );
      try {
        mergeMessage(await sendBody(item.body));
        setOutbox((current) => current.filter((row) => row.key !== item.key));
      } catch (e) {
        setOutbox((current) =>
          current.map((row) =>
            row.key === item.key ? { ...row, failed: true, reason: refusalReason(e) } : row,
          ),
        );
      }
    },
    [mergeMessage, sendBody],
  );

  /**
   * One endpoint both adds and removes — the same emoji twice takes it back
   * (`routes.rb:295`). The response is the whole updated message, so the
   * counts come back rather than being guessed at. From the sheet, and from a
   * chip under the message (which toggles that emoji).
   */
  const reactWith = useCallback(
    async (target: ChatMessage, emoji: string) => {
      setThreadError(null);
      try {
        mergeMessage(await reactTo({ id: target.id, emoji }));
      } catch (e) {
        // The chip stays as it was, which is the truth, and now it says why:
        // a press that changed nothing read as a missed tap (audit P2).
        setThreadError(failureMessage(e, t("thread.reactionFailed")));
      }
    },
    [mergeMessage, reactTo, t],
  );

  const react = useCallback(
    async (emoji: string) => {
      const target = sheetFor;
      setSheetFor(null);
      if (target) await reactWith(target, emoji);
    },
    [sheetFor, reactWith],
  );

  const removeMessage = useCallback(async () => {
    const target = sheetFor;
    setSheetFor(null);
    if (!target) return;
    try {
      // Comes back `deleted: true` with `body: null` — the row keeps its place,
      // because "a hole in the thread reads as a bug".
      mergeMessage(await removeById(target.id));
    } catch (e) {
      // The message stays, which is the truth, and now it says why: the
      // sheet closing with nothing changed read as a missed tap.
      setThreadError(failureMessage(e, t("thread.deleteFailed")));
    }
  }, [sheetFor, mergeMessage, removeById, t]);

  /**
   * The message the UNREAD divider sits above, fixed on first load.
   *
   * Anchored to an id rather than to an index, because the list grows while it
   * is open and an index would slide the divider down the thread.
   */
  const unreadAnchor = useRef<{ settled: boolean; id: number | null }>({
    settled: false,
    id: null,
  });
  const unreadAnchorId = useMemo(() => {
    // LATCHED on the first page that arrives, and never recomputed. The list
    // grows while the thread is open, so `length - count` would slide the
    // divider one message further down with every message received — which is
    // exactly the bug the "anchor to an id" rule exists to prevent.
    // And only on the SERVER's page: a seeded thread starts with one message
    // (`lastKnownMessages`), and latching on it would put the divider nowhere
    // and keep it there.
    if (unreadAnchor.current.settled || messages.length === 0 || status !== "ready") return unreadAnchor.current.id;

    unreadAnchor.current.settled = true;
    const count = unreadOnOpen.current;
    const index = messages.length - count;
    // Every message on screen is unread only when the whole first page is: the
    // divider would then sit at the very top, where it says nothing.
    unreadAnchor.current.id = count > 0 && index > 0 ? (messages[index]?.id ?? null) : null;
    return unreadAnchor.current.id;
  }, [messages, status]);

  /** The last message I sent — the only one that carries a tick. */
  const lastSentId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].sentByMe) return messages[index].id;
    }
    return null;
  }, [messages]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let lastDay = "";

    for (const message of messages) {
      const label = dayLabel(message.createdAt, undefined, t);
      if (label && label !== lastDay) {
        out.push({ kind: "day", key: `day-${label}-${message.id}`, label });
        lastDay = label;
      }
      if (message.id === unreadAnchorId) {
        out.push({ kind: "unread", key: `unread-${message.id}` });
      }
      out.push({
        kind: "message",
        key: String(message.id),
        message,
        isLastSent: message.id === lastSentId,
        found: message.id === foundId,
      });
    }

    for (const item of outbox) {
      out.push({ kind: "outgoing", key: item.key, outgoing: item });
    }
    return out;
    // `t` is passed to `dayLabel` because the day labels are words
    // ("Aujourd’hui"), so a language switch re-derives them.
  }, [messages, outbox, unreadAnchorId, lastSentId, foundId, t]);
  const newestFirst = useMemo(() => [...rows].reverse(), [rows]);

  /**
   * BRING A SEARCH RESULT ON SCREEN — the web's `useChat.reveal`. A result is
   * often far up the history, so marking its id alone would point at
   * nothing: older pages are loaded by cursor (`loadOlder`) until it is in
   * the transcript, at most `MAX_REVEAL_PAGES` of them, then the list scrolls
   * to it (the effect below). Read through the cache, not `messages`, which
   * would be this render's copy for the whole loop.
   */
  const scrolledTo = useRef<number | null>(null);
  const revealMessage = useCallback(
    async (target: ChatMessage) => {
      const transcript = () => queryClient.getQueryData<TranscriptCache>(conversationKeys.transcript(conversationId));
      setSearchNotice(null);
      setRevealing(target.id);
      let found = false;
      for (let round = 0; round < MAX_REVEAL_PAGES; round += 1) {
        const now = transcript();
        if (now?.messages.some((m) => m.id === target.id)) {
          found = true;
          break;
        }
        if (!now?.hasOlder) break;
        const oldest = now.messages[0]?.id;
        await loadOlder();
        // `loadOlder` keeps what is on screen when a page fails; no progress
        // means stop rather than ask again.
        if (transcript()?.messages[0]?.id === oldest) break;
      }
      setRevealing(null);
      if (found) {
        scrolledTo.current = null;
        setFoundId(target.id);
        setSearching(false);
      } else {
        setSearchNotice(t("thread.searchNotReached"));
      }
    },
    [conversationId, loadOlder, queryClient, t],
  );

  /** Scroll to the result once it is a row (inverted list: index from newest). */
  useEffect(() => {
    if (foundId == null || scrolledTo.current === foundId) return;
    const index = newestFirst.findIndex((row) => row.key === String(foundId));
    if (index < 0) return;
    scrolledTo.current = foundId;
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
  }, [foundId, newestFirst]);

  /** Rows are measured as they render, so a far one can need a second try. */
  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
      setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 }), 100);
    },
    [],
  );

  /**
   * The thread itself — for the header's AVATAR and presence, and for naming
   * the sender in a group.
   *
   * The avatar is not decoration: it is the fourth signal separating this
   * screen from the assistant's, which has none by rule (`IDENTITY.md` §7: "No
   * avatar for the assistant"). Every one of the eight thread references puts a
   * face and a name in the header, and its presence is what says "a person" at
   * a glance.
   *
   * `participants` names the sender in a group, and with `is_admin` it is what
   * the members sheet draws (audit #30).
   */
  const { data: detail } = useQuery({
    queryKey: conversationKeys.thread(conversationId),
    queryFn: () => conversationsApi.show(conversationId),
    enabled: Number.isFinite(conversationId),
  });

  /**
   * DELETE THE CONVERSATION — for this reader only (audit P1 #31). The server
   * soft-deletes it for them and the others keep their history
   * (`conversations_controller.rb#destroy`, "Conversation deleted for you"),
   * so the confirm says exactly that. Offered where the web offers it: when
   * `can_delete` (always for a direct chat; a group's admins only).
   *
   * The row leaves the cached list first and the thread closes; its cache is
   * NOT removed while it is still mounted, which would refetch a conversation
   * that is going (the web's qa found that 403). A refusal keeps the thread
   * and says why.
   */
  const { mutate: clearForMe } = useMutation({
    mutationFn: () => conversationsApi.clearForMe(conversationId),
    onMutate: () => setThreadError(null),
    onSuccess: () => {
      queryClient.setQueryData<InfiniteData<ConversationList>>(conversationKeys.list(), (old) =>
        old
          ? { ...old, pages: old.pages.map((page) => ({ ...page, conversations: page.conversations.filter((c) => c.id !== conversationId) })) }
          : old,
      );
      void queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
      if (router.canGoBack()) router.back();
      else router.replace("/chats");
    },
    onError: (e) => setThreadError(failureMessage(e, t("thread.deleteConversationFailed"))),
  });
  const confirmClear = useCallback(() => {
    Alert.alert(t("thread.deleteConversationQuestion"), t("thread.deleteConversationBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => clearForMe() },
    ]);
  }, [clearForMe, t]);

  /** A search result's second line: who wrote it. */
  const senderFor = useCallback(
    (message: ChatMessage): string => {
      if (message.sentByMe) return t("thread.you");
      const name = message.userId == null ? null : detail?.participants.find((p) => p.id === message.userId)?.name;
      return name ?? (detail?.isGroup ? t("thread.someone") : (detail?.displayName ?? title));
    },
    [detail, title, t],
  );

  const nameFor = useCallback(
    (message: ChatMessage): string | null => {
      if (!isGroup || message.sentByMe || message.userId == null) return null;
      return detail?.participants.find((p) => p.id === message.userId)?.name ?? null;
    },
    [isGroup, detail],
  );

  // ── EVERY LIST PROP STABLE ACROSS A KEYSTROKE — see `ThreadRow` ────────
  const openSheet = useCallback((message: ChatMessage) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSheetFor(message);
  }, []);
  const onRetryOutgoing = useCallback((outgoing: Outgoing) => void retry(outgoing), [retry]);
  const onReactChip = useCallback((message: ChatMessage, emoji: string) => void reactWith(message, emoji), [reactWith]);
  const renderItem = useCallback(
    ({ item }: { item: Row }) => (
      <ThreadRow
        row={item}
        conversationId={conversationId}
        nameFor={nameFor}
        onOpenSheet={openSheet}
        onReact={onReactChip}
        onRetry={onRetryOutgoing}
      />
    ),
    [conversationId, nameFor, openSheet, onReactChip, onRetryOutgoing],
  );
  const onEndReached = useMemo(() => (hasOlder ? () => void loadOlder() : undefined), [hasOlder, loadOlder]);
  const listContentStyle = useMemo<ViewStyle>(
    () => ({
      width: "100%",
      maxWidth: metrics.maxMeasure,
      alignSelf: "center",
      flexGrow: 1,
      // Was `space.md`, which left the newest message almost touching the
      // composer. Same value as the assistant's chat so the two threads
      // feel like one app.
      // `paddingTop` because the list is inverted: top and bottom swap.
      paddingTop: metrics.space.xl,
    }),
    [metrics],
  );
  const listEmpty = useMemo(
    () => (
          status === "loading" ? (
            // A View, so the inverted list can un-flip it (`app/chat.tsx`,
            // "WRAPPED IN A PLAIN VIEW"). The thread's shape while it loads.
            <View>
              <BubblesSkeleton />
            </View>
          ) : status === "failed" ? (
            <View testID="thread-load-failed" style={{ paddingVertical: metrics.space.xl, gap: metrics.space.sm }}>
              <Text tone="muted">{failureMessage(loadError, t("thread.loadFailed"))}</Text>
              <Pressable onPress={() => void resync()} accessibilityRole="button" hitSlop={8}>
                <Text tone="accent">{t("common.tryAgain")}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ flex: 1, justifyContent: "flex-end", paddingBottom: metrics.space.lg }}>
              <Text tone="muted">{t("thread.noMessages")}</Text>
            </View>
          )
    ),
    [status, loadError, metrics, t, resync],
  );

  return (
    <Screen measure avoidKeyboard>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: metrics.space.sm,
          paddingVertical: metrics.space.md,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          hitSlop={8}
          style={{ width: 32, height: 32, justifyContent: "center" }}
        >
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        {/* A FACE IN THE HEADER — the assistant has none, by rule. It is the
            cheapest and most immediate way to know which screen you are on. */}
        <Avatar
          name={detail?.displayName ?? title}
          uri={detail?.avatar ?? null}
          userId={conversationId}
          size={34}
          isOnline={detail?.isOnline ?? false}
        />

        <View style={{ flex: 1 }}>
          <Text testID="thread-title" variant="label" numberOfLines={1} style={{ fontSize: 17 }}>
            {detail?.displayName ?? title}
          </Text>
          {/* Typing replaces the subtitle rather than adding a row, so the
              header does not change height and shove the thread down. */}
          {typingName ? (
            <Text testID="thread-typing" variant="caption" tone="accent">
              {isGroup ? t("thread.someoneTyping", { name: typingName }) : t("thread.typing")}
            </Text>
          ) : detail?.isOnline ? (
            <Text variant="caption" tone="muted">
              {t("thread.online")}
            </Text>
          ) : null}
        </View>
        <Pressable
          testID="thread-search-toggle"
          onPress={() => {
            setSearchNotice(null);
            setSearching((on) => !on);
          }}
          accessibilityRole="button"
          accessibilityLabel={t("thread.search")}
          accessibilityState={{ selected: searching }}
          hitSlop={8}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
        >
          <Search size={20} color={searching ? colors.accent : colors.inkMuted} />
        </Pressable>
        {/* Ask the assistant about this conversation (parity audit, Chats, old P2): COMPOSED in its box,
            never sent, as every "ask" in this app (useAsk). */}
        <Pressable
          testID="thread-ask"
          onPress={() => ask(t("thread.askQuestion", { name: title }))}
          accessibilityRole="button"
          accessibilityLabel={t("thread.ask")}
          hitSlop={8}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
        >
          <Sparkles size={20} color={colors.inkMuted} />
        </Pressable>
        {detail?.isGroup ? (
          <Pressable
            testID="thread-members"
            onPress={() => setShowMembers(true)}
            accessibilityRole="button"
            accessibilityLabel={t("thread.members")}
            hitSlop={8}
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <Users size={20} color={colors.inkMuted} />
          </Pressable>
        ) : null}
        {detail?.canDelete ? (
          <Pressable
            testID="thread-delete"
            onPress={confirmClear}
            accessibilityRole="button"
            accessibilityLabel={t("thread.deleteConversation")}
            hitSlop={8}
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <Trash2 size={20} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>

      {searching ? (
        <ThreadSearch
          conversationId={conversationId}
          senderFor={senderFor}
          onPick={(message) => void revealMessage(message)}
          onClose={() => setSearching(false)}
          revealing={revealing}
          notice={searchNotice}
        />
      ) : null}

      {/* Messages that could not be read, said rather than skipped in silence. */}
      <UnreadableNotice count={unreadable ?? 0} />
      {/* Wrapped so the button anchors to the list rather than the screen —
          anchored to the screen it lands on the composer. */}
      <View style={{ flex: 1 }}>
      <FlatList
        testID="thread-list"
        // A drag puts the keyboard away. Before this, the ONLY way to close it
        // here was Back, and Back on a pushed screen can pop the thread
        // (`docs/design/people-chat/SPEC.md`, and why `06` failed).
        keyboardDismissMode="on-drag"
        ref={listRef}
        // INVERTED, newest first. Reversing the whole `rows` array keeps each
        // day and unread divider visually ABOVE the messages it heads.
        inverted
        data={newestFirst}
        keyExtractor={rowKey}
        maintainVisibleContentPosition={maintainVisibleContentPosition}
        onScrollToIndexFailed={onScrollToIndexFailed}
        renderItem={renderItem}
        onScroll={onScroll}
        scrollEventThrottle={64}
        // History by cursor as the reader reaches the OLDEST end — the list's
        // end, inverted. An id cursor cannot skip a message that arrived while
        // they were scrolling, which is what page numbers did
        // (`messages_controller.rb:19-23`).
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        showsVerticalScrollIndicator={false}
        // IDENTITY.md §8: at 800 dp the conversation takes a measure and
        // centres rather than stretching — the same treatment the assistant's
        // list already has, and the one place a wide screen needs a decision
        // instead of a resize.
        contentContainerStyle={listContentStyle}
        ListEmptyComponent={listEmpty}
      />

        <ScrollToBottom visible={awayFromBottom} onPress={toBottom} />
      </View>

      {threadError ? (
        <Text variant="caption" tone="danger" testID="thread-error" accessibilityLiveRegion="polite">
          {threadError}
        </Text>
      ) : null}
      {editing ? (
        <Pressable
          onPress={() => {
            setEditing(null);
            setDraft("");
          }}
          accessibilityRole="button"
          style={{ paddingVertical: metrics.space.xs }}
        >
          <Text variant="caption" tone="accent">
            {t("thread.editing")}
          </Text>
        </Pressable>
      ) : null}

      {/* Deleted on another device while open: said, and nothing more can be
          sent into it (`status: "gone"`, useConversation). */}
      {status === "gone" ? (
        <Text variant="caption" tone="danger" testID="thread-gone" accessibilityLiveRegion="polite">
          {t("thread.gone")}
        </Text>
      ) : null}
      <PersonComposer
        value={draft}
        onChange={setDraft}
        onSend={() => void send()}
        onTyping={announceTyping}
        editing={Boolean(editing)}
        disabled={status === "gone"}
      />

      <ReactionSheet
        message={sheetFor}
        onReact={(emoji) => void react(emoji)}
        onCopy={() => {
          void Clipboard.setStringAsync(sheetFor?.body ?? "");
          setSheetFor(null);
        }}
        onEdit={() => {
          setEditing(sheetFor);
          setDraft(sheetFor?.body ?? "");
          setSheetFor(null);
        }}
        onDelete={() => void removeMessage()}
        onClose={() => setSheetFor(null)}
      />

      {showMembers && detail?.isGroup ? (
        <MembersSheet conversation={detail} onClose={() => setShowMembers(false)} />
      ) : null}
    </Screen>
  );
}
