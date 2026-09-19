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
 * ── SENDING IS HTTP, ALWAYS ───────────────────────────────────────────────
 * `messages_controller.rb:5-8`: "`perform` on a subscription that is not up is
 * a silent no-op, and a send that vanishes is the worst failure a chat can
 * have." `typing` and `mark_read` may ride the socket; a message may not.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useConversation } from "@/hooks/useConversation";
import { performOnChannel, subscribeToChannel } from "@/lib/cable";
import {
  conversationsApi,
  threadApi,
  type ConversationEvent,
} from "@/api/conversations";
import type { ChatMessage } from "@/api/ai";
import { Avatar } from "@/screens/people/Avatar";
import { PersonMessageRow } from "@/screens/people/PersonMessageRow";
import { PersonComposer } from "@/screens/people/PersonComposer";
import { ReactionSheet } from "@/screens/people/ReactionSheet";
import { DayDivider, UnreadDivider, dayLabel } from "@/screens/people/DayDivider";

/** How long a typing indicator survives its last frame. */
const TYPING_LINGER_MS = 4_000;

/** A send that has not been accepted yet. Never merged into the transcript —
 *  it has no server id, and inventing one would collide. */
interface Outgoing {
  key: string;
  body: string;
  failed: boolean;
}

type Row =
  | { kind: "day"; key: string; label: string }
  | { kind: "unread"; key: string }
  | { kind: "message"; key: string; message: ChatMessage; isLastSent: boolean }
  | { kind: "outgoing"; key: string; outgoing: Outgoing };

export default function PersonThread() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    isGroup?: string;
    unread?: string;
  }>();

  const conversationId = Number(params.id);
  const isGroup = params.isGroup === "1";
  const title = params.name ?? t("thread.chat");

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
  const { messages, status, hasOlder, loadOlder, mergeMessage, resync } = useConversation({
    conversationId: Number.isFinite(conversationId) ? conversationId : null,
    // See this file's header. NOT ConversationChannel.
    channel: "MessageChannel",
  });

  const [draft, setDraft] = useState("");
  const [outbox, setOutbox] = useState<Outgoing[]>([]);
  const [sheetFor, setSheetFor] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [typingName, setTypingName] = useState<string | null>(null);
  const listRef = useRef<FlatList<Row>>(null);

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
  useEffect(() => {
    if (!Number.isFinite(conversationId)) return;
    void conversationsApi
      .markRead(conversationId)
      .then(() => queryClient.invalidateQueries({ queryKey: ["conversations"] }))
      .catch(() => {
        // Losing this is survivable: it is re-sent the next time the thread
        // opens, and the badge is stale rather than wrong.
      });
  }, [conversationId, queryClient]);

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

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || !Number.isFinite(conversationId)) return;

    // Editing is a different verb on the same field.
    if (editing) {
      const target = editing;
      setEditing(null);
      setDraft("");
      try {
        mergeMessage(await threadApi.edit(conversationId, target.id, body));
      } catch {
        // Put it back in the composer rather than losing the words.
        setDraft(body);
        setEditing(target);
      }
      return;
    }

    const key = `out-${Date.now()}`;
    setDraft("");
    setOutbox((current) => [...current, { key, body, failed: false }]);

    try {
      const saved = await threadApi.send(conversationId, body);
      // Merged by the server's own id, so the MessageChannel echo of the same
      // message lands on top of it rather than appearing twice.
      mergeMessage(saved);
      setOutbox((current) => current.filter((item) => item.key !== key));
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch {
      // It STAYS ON SCREEN. `BRIEF.md` §5 — a message arrives or says it did
      // not; it never disappears into an optimistic bubble.
      setOutbox((current) =>
        current.map((item) => (item.key === key ? { ...item, failed: true } : item)),
      );
    }
  }, [draft, conversationId, editing, mergeMessage, queryClient]);

  const retry = useCallback(
    async (item: Outgoing) => {
      setOutbox((current) =>
        current.map((row) => (row.key === item.key ? { ...row, failed: false } : row)),
      );
      try {
        mergeMessage(await threadApi.send(conversationId, item.body));
        setOutbox((current) => current.filter((row) => row.key !== item.key));
      } catch {
        setOutbox((current) =>
          current.map((row) => (row.key === item.key ? { ...row, failed: true } : row)),
        );
      }
    },
    [conversationId, mergeMessage],
  );

  const react = useCallback(
    async (emoji: string) => {
      const target = sheetFor;
      setSheetFor(null);
      if (!target) return;
      try {
        // One endpoint both adds and removes — the same emoji twice takes it
        // back (`routes.rb:295`). The response is the whole updated message,
        // so the counts come back rather than being guessed at.
        mergeMessage(await threadApi.react(conversationId, target.id, emoji));
      } catch {
        // The chip simply does not change. A failed reaction is not worth an
        // error banner over somebody's conversation.
      }
    },
    [sheetFor, conversationId, mergeMessage],
  );

  const removeMessage = useCallback(async () => {
    const target = sheetFor;
    setSheetFor(null);
    if (!target) return;
    try {
      // Comes back `deleted: true` with `body: null` — the row keeps its place,
      // because "a hole in the thread reads as a bug".
      mergeMessage(await threadApi.remove(conversationId, target.id));
    } catch {
      // Nothing changes on screen, which is the truth.
    }
  }, [sheetFor, conversationId, mergeMessage]);

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
    if (unreadAnchor.current.settled || messages.length === 0) return unreadAnchor.current.id;

    unreadAnchor.current.settled = true;
    const count = unreadOnOpen.current;
    const index = messages.length - count;
    // Every message on screen is unread only when the whole first page is: the
    // divider would then sit at the very top, where it says nothing.
    unreadAnchor.current.id = count > 0 && index > 0 ? (messages[index]?.id ?? null) : null;
    return unreadAnchor.current.id;
  }, [messages]);

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
      const label = dayLabel(message.createdAt);
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
      });
    }

    for (const item of outbox) {
      out.push({ kind: "outgoing", key: item.key, outgoing: item });
    }
    return out;
  }, [messages, outbox, unreadAnchorId, lastSentId]);

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
   * Groups are read-only in v1, so `participants` is used for the sender name
   * and `is_admin` — the flag an add/remove UI would hang off — is parsed and
   * left unrendered on purpose (`docs/design/people-chat/SPEC.md` §2.3).
   */
  const { data: detail } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => conversationsApi.show(conversationId),
    enabled: Number.isFinite(conversationId),
  });

  const nameFor = useCallback(
    (message: ChatMessage): string | null => {
      if (!isGroup || message.sentByMe || message.userId == null) return null;
      return detail?.participants.find((p) => p.id === message.userId)?.name ?? null;
    },
    [isGroup, detail],
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
      </View>

      <FlatList
        testID="thread-list"
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={({ item }) => {
          if (item.kind === "day") return <DayDivider label={item.label} />;
          if (item.kind === "unread") return <UnreadDivider />;
          if (item.kind === "outgoing") {
            return (
              <PersonMessageRow
                message={{
                  // A local echo. It never merges into the transcript — it has
                  // no server id — and it is replaced by the saved message the
                  // moment the POST answers.
                  id: -1,
                  conversationId,
                  role: "user",
                  body: item.outgoing.body,
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
                pending={!item.outgoing.failed}
                failed={item.outgoing.failed}
                onRetry={() => void retry(item.outgoing)}
              />
            );
          }
          return (
            <PersonMessageRow
              message={item.message}
              senderName={nameFor(item.message)}
              isLastSent={item.isLastSent}
              onLongPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSheetFor(item.message);
              }}
            />
          );
        }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        // History by cursor as the reader reaches the top — an id cursor cannot
        // skip a message that arrived while they were scrolling, which is what
        // page numbers did (`messages_controller.rb:19-23`).
        onStartReached={hasOlder ? () => void loadOlder() : undefined}
        onStartReachedThreshold={0.3}
        showsVerticalScrollIndicator={false}
        // IDENTITY.md §8: at 800 dp the conversation takes a measure and
        // centres rather than stretching — the same treatment the assistant's
        // list already has, and the one place a wide screen needs a decision
        // instead of a resize.
        contentContainerStyle={{
          width: "100%",
          maxWidth: metrics.maxMeasure,
          alignSelf: "center",
          flexGrow: 1,
          paddingBottom: metrics.space.md,
        }}
        ListEmptyComponent={
          status === "loading" ? null : status === "failed" ? (
            <View style={{ paddingVertical: metrics.space.xl, gap: metrics.space.sm }}>
              <Text tone="muted">{t("thread.loadFailed")}</Text>
              <Pressable onPress={() => void resync()} accessibilityRole="button" hitSlop={8}>
                <Text tone="accent">{t("common.tryAgain")}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ flex: 1, justifyContent: "flex-end", paddingBottom: metrics.space.lg }}>
              <Text tone="muted">{t("thread.noMessages")}</Text>
            </View>
          )
        }
      />

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

      <PersonComposer
        value={draft}
        onChange={setDraft}
        onSend={() => void send()}
        onTyping={announceTyping}
        editing={Boolean(editing)}
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
    </Screen>
  );
}
