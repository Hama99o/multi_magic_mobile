/**
 * The conversation — `docs/design/chat/SPEC.md`. This is the app.
 *
 * ── The one fact that shapes everything ───────────────────────────────────
 * The reply does not come back from the request. `POST /api/v1/ai/show` returns
 * **202**: the question is saved and `Ai::RagChat` is enqueued, and the answer
 * is broadcast over ActionCable later. So this screen posts, shows the question
 * at once, and renders the answer when it lands — and survives the socket
 * dropping by re-reading the transcript on reconnect (`useConversation`).
 *
 * A question must **never vanish into an optimistic bubble**: on failure it
 * stays on screen with a Retry under it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Bell, CalendarDays, MessageSquareText, Users } from "lucide-react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useAuthStore } from "@/stores/auth.store";
import { aiApi, type ChatMessage, type MessageLink } from "@/api/ai";
import { isRateLimited, isNetworkFailure, apiErrorMessage } from "@/api/http";
import { useConversation } from "@/hooks/useConversation";
import { useDraft } from "@/hooks/useDraft";
import { useStarterPrompts } from "@/hooks/useStarterPrompts";
import { loadRememberedSession, rememberSession } from "@/lib/rememberedSession";
import { MessageRow } from "@/components/chat/MessageRow";
import { ThinkingDots } from "@/components/chat/ThinkingDots";
import { Composer } from "@/components/chat/Composer";
import { EmptyState } from "@/components/chat/EmptyState";
import { SourceSheet } from "@/components/chat/SourceSheet";
import { FilePreview } from "@/components/chat/FilePreview";
import type { AnswerLink } from "@/components/chat/AnswerMarkdown";
import { SessionsSheet } from "@/components/sessions/SessionsSheet";
import { AttachSheet } from "@/components/chat/AttachSheet";
import { PendingFiles } from "@/components/chat/PendingFiles";
import { useAttachments } from "@/hooks/useAttachments";
import { documentsApi } from "@/api/ai";
import { notificationsApi } from "@/api/notifications";
import { conversationsApi } from "@/api/conversations";

/**
 * One quiet door in the title bar.
 *
 * The badge is drawn only when there is something to say — a zero rendered as
 * "0" is a permanent red dot that teaches people to ignore the badge. Capped at
 * 99+ so a long number cannot widen the row.
 */
function HeaderIcon({
  label,
  icon: Icon,
  badge = 0,
  onPress,
  testID,
}: {
  label: string;
  icon: typeof Bell;
  badge?: number;
  onPress: () => void;
  testID: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge > 0 ? `${label}, ${badge} unread` : label}
      hitSlop={6}
      onPress={onPress}
      style={{
        width: metrics.touch,
        height: metrics.touch,
        alignItems: "center",
        justifyContent: "center",
      }}
      testID={testID}
    >
      <Icon size={21} color={colors.inkMuted} />
      {badge > 0 ? (
        <View
          style={{
            position: "absolute",
            top: 6,
            right: 4,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            paddingHorizontal: 4,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
          testID={`${testID}-badge`}
        >
          <Text variant="caption" tone="onAccent" style={{ fontSize: 10, lineHeight: 13 }}>
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** A question that could not be posted, kept so it is never lost. */
interface FailedQuestion {
  body: string;
  reason: string;
}

export default function Chat() {
  const colors = useColors();
  const metrics = useMetrics();
  const user = useAuthStore((s) => s.user);

  const { data: sessionId } = useQuery({
    queryKey: ["ai", "currentSession"],
    queryFn: aiApi.currentSessionId,
  });

  /**
   * A session chosen on THIS device wins over the server's default.
   *
   * `ai/conversation` returns the session most recently talked in ACROSS EVERY
   * CLIENT, which is the right default on a first launch and the wrong one
   * afterwards — a question asked from the laptop would silently move the phone
   * to a different conversation mid-thread. So the choice is remembered per
   * user and the server's answer is only the fallback.
   */
  const [chosenId, setChosenId] = useState<number | null>(null);
  const conversationId = chosenId ?? sessionId ?? null;
  const [sessionsOpen, setSessionsOpen] = useState(false);

  // Restore this device's choice once, before the server's default is used.
  useEffect(() => {
    if (!user?.id) return;
    void loadRememberedSession(user.id).then((id) => {
      if (id) setChosenId(id);
    });
  }, [user?.id]);

  const chooseSession = useCallback(
    (id: number) => {
      setChosenId(id);
      if (user?.id) void rememberSession(user.id, id);
    },
    [user?.id],
  );
  const { messages, status, awaitingReply, failed, hasOlder, loadOlder, addPending, mergeMessage, resync } =
    useConversation({ conversationId, channel: "MessageChannel" });

  const { draft, setDraft, clear } = useDraft(conversationId);

  /**
   * What the session already holds, so the cap is counted against the truth.
   *
   * ── POLLED WHILE ANYTHING IS PENDING ──────────────────────────────────────
   * A file is extracted and embedded by a background job, so it arrives
   * `pending` and becomes `ready` or `failed` later, with nothing pushed over
   * the socket to say so. Without this the chip a user just uploaded says
   * "pending" for ever, and — worse — they ask a question about a document the
   * assistant cannot see yet, with nothing on screen to explain why.
   *
   * 2.5 s is the web's interval (`AI_ASSISTANT.md` §9). Polling STOPS once
   * nothing is pending, so an idle chat makes no requests.
   */
  const { data: uploaded = [] } = useQuery({
    queryKey: ["ai", "documents", conversationId],
    queryFn: () => documentsApi.list(conversationId as number),
    enabled: conversationId != null,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((d) => d.status === "pending") ? 2_500 : false,
  });

  // Derived from what this user actually has — never a written list.
  const { prompts } = useStarterPrompts(conversationId);

  const attachments = useAttachments(conversationId, uploaded.length);
  const [attachOpen, setAttachOpen] = useState(false);

  /**
   * The two badges.
   *
   * Counted by the endpoints that exist to count, NOT by `index.length`: both
   * indexes are paginated at 20, so counting a page caps the badge at 20 and
   * pays for a page of bodies to draw one number.
   *
   * And the names are a trap worth naming: `unread_messages_count` on the
   * CONVERSATIONS endpoint counts THREADS with something unread, while the
   * field of the same name on a row counts MESSAGES in that thread. One name,
   * two meanings, one endpoint apart. The icon wants threads.
   */
  const { data: unreadNotifications = 0 } = useQuery<number>({
    queryKey: ["notifications", "unreadCount"],
    queryFn: notificationsApi.unreadCount,
  });
  const { data: unread } = useQuery({
    queryKey: ["conversations", "unreadCount"],
    queryFn: conversationsApi.unreadCount,
  });
  // THREADS with something unread, not messages — see the note above.
  const unreadChats = unread?.unreadConversations ?? 0;
  const [posting, setPosting] = useState(false);
  const [failedQuestion, setFailedQuestion] = useState<FailedQuestion | null>(null);
  const [openSource, setOpenSource] = useState<MessageLink | null>(null);
  const [openFile, setOpenFile] = useState<AnswerLink | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  /**
   * ONLY THE MOST RECENT undoable reply gets the button.
   *
   * `AI_ASSISTANT.md` §Undo: a stack of reversals is a second thing to learn,
   * and the mistake somebody wants gone is almost always the one they are
   * looking at. The serializer says what is POSSIBLE; choosing which one to
   * offer is the UI's job.
   */
  const newestUndoableId = [...messages]
    .reverse()
    .find((m) => m.undoable && !m.undoneAt)?.id ?? null;

  const send = useCallback(
    async (body: string) => {
      if (conversationId == null || posting) return;
      const question = body.trim();
      if (!question) return;

      setFailedQuestion(null);
      setPosting(true);
      clear();

      try {
        const { userMessageId } = await aiApi.ask({ conversationId, body: question });
        // Drawn immediately from the server's OWN id, so when the socket echoes
        // the same message it merges rather than appearing twice.
        addPending({
          id: userMessageId,
          conversationId,
          role: "user",
          body: question,
          createdAt: new Date().toISOString(),
          deleted: false,
          userId: user?.id ?? null,
          sentByMe: true,
          editedAt: null,
          readAt: null,
          reactions: [],
          links: [],
          sources: [],
          undoable: false,
          undoneAt: null,
        });
      } catch (e) {
        // The question comes BACK, into the composer and onto the screen. The
        // one thing this must never do is swallow it.
        setDraft(question);
        setFailedQuestion({
          body: question,
          reason: isRateLimited(e)
            ? "You have asked a lot in a short time. Try again in a minute."
            : isNetworkFailure(e)
              ? "Could not reach MultiMagic. Your question is still here."
              : (apiErrorMessage(e) ?? "That did not send."),
        });
      } finally {
        setPosting(false);
      }
    },
    [conversationId, posting, clear, addPending, setDraft, user],
  );

  // Follow new messages. `onContentSizeChange` rather than an effect on
  // `messages`, because the list has not laid out when the array changes.
  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  useEffect(() => {
    if (awaitingReply) scrollToEnd();
  }, [awaitingReply, scrollToEnd]);

  return (
    /* `avoidKeyboard` — and this screen is the one that most needed it and was
       the only one without it. On Android the window resizes, which masks the
       omission; on iOS nothing resizes and the keyboard sits straight over the
       composer, so the field somebody is typing into is the thing they cannot
       see. The three auth screens had it from the start; the screen people type
       in most did not. */
    <Screen measure={false} avoidKeyboard>
      <View style={{ flex: 1, gap: metrics.space.sm }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: metrics.space.md,
          }}
        >
          <Text variant="title">Assistant</Text>

          {/* The doors out of here.
              QUIET, per IDENTITY.md §7: outline glyphs, muted, the touch floor
              as the tap target, no labels, and no accent anywhere except a badge
              that actually has something to say. An affordance can be findable
              without being loud. */}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <HeaderIcon
              label="Chats"
              icon={Users}
              badge={unreadChats}
              onPress={() => router.push("/chats")}
              testID="chat-open-chats"
            />
            <HeaderIcon
              label="Notifications"
              icon={Bell}
              badge={unreadNotifications}
              onPress={() => router.push("/notifications")}
              testID="chat-open-notifications"
            />
            <HeaderIcon
              label="Calendar"
              icon={CalendarDays}
              onPress={() => router.push("/calendar")}
              testID="chat-open-calendar"
            />
            {/* This one stays last and is the assistant's own: an app with one
                destination does not need a persistent drawer. */}
            <HeaderIcon
              label="Conversations"
              icon={MessageSquareText}
              onPress={() => setSessionsOpen(true)}
              testID="chat-open-sessions"
            />
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          renderItem={({ item }) => (
            <MessageRow
              message={item}
              onOpenSource={setOpenSource}
              onOpenLink={setOpenFile}
              showUndo={item.id === newestUndoableId}
              onUndone={(updated) =>
                // Merged in place — NOT `addPending`. The reply now carries
                // `undone_at`; nothing new is being waited for, and claiming
                // otherwise would start a three-minute poll for an answer that
                // has already arrived.
                mergeMessage(updated)
              }
            />
          )}
          onContentSizeChange={scrollToEnd}
          // Older history by cursor, pulled in as the reader reaches the top.
          onStartReached={hasOlder ? () => void loadOlder() : undefined}
          onStartReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
          // §8: the conversation takes a measure and centres on a tablet. A
          // full-width line of serif text at 800 dp is unreadable.
          contentContainerStyle={{
            width: "100%",
            maxWidth: metrics.maxMeasure,
            alignSelf: "center",
            flexGrow: 1,
          }}
          ListEmptyComponent={
            status === "loading" ? null : status === "failed" ? (
              <View style={{ gap: metrics.space.md, paddingVertical: metrics.space.xl }}>
                <Text tone="muted" testID="chat-load-failed">
                  Could not load this conversation.
                </Text>
                <Button label="Try again" tone="neutral" onPress={() => void resync()} />
              </View>
            ) : (
              <EmptyState onPick={(q) => void send(q)} prompts={prompts} />
            )
          }
          ListFooterComponent={
            <View style={{ gap: metrics.space.sm }}>
              {awaitingReply ? <ThinkingDots /> : null}

              {failed ? (
                <View style={{ gap: metrics.space.sm }} testID="chat-answer-failed">
                  <Text variant="caption" tone="danger">
                    That question did not get an answer.
                  </Text>
                  <Button
                    label="Ask again"
                    tone="neutral"
                    block={false}
                    onPress={() => {
                      const last = [...messages].reverse().find((m) => m.role === "user");
                      if (last?.body) void send(last.body);
                    }}
                  />
                </View>
              ) : null}

              {failedQuestion ? (
                <View style={{ gap: metrics.space.sm }} testID="chat-send-failed">
                  <Text variant="caption" tone="danger">
                    {failedQuestion.reason}
                  </Text>
                  <Button
                    label="Retry"
                    tone="neutral"
                    block={false}
                    onPress={() => void send(failedQuestion.body)}
                  />
                </View>
              ) : null}
            </View>
          }
        />

        <View
          style={{
            width: "100%",
            maxWidth: metrics.maxMeasure,
            alignSelf: "center",
            gap: metrics.space.xs,
            paddingBottom: metrics.space.sm,
          }}
        >
          <PendingFiles files={attachments.pending} onRemove={attachments.remove} />

          {attachments.error ? (
            <Text variant="caption" tone="danger" testID="attach-error">
              {attachments.error}
            </Text>
          ) : null}

          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => void send(draft)}
            busy={posting}
            onAttach={conversationId != null ? () => setAttachOpen(true) : undefined}
          />
          {/* Mindvalley's one line, once, under the composer. */}
          <Text variant="caption" tone="muted" style={{ textAlign: "center", color: colors.inkMuted }}>
            Answers come from your MultiMagic data and can be wrong. Check anything that
            matters.
          </Text>
        </View>
      </View>

      <SourceSheet source={openSource} onClose={() => setOpenSource(null)} />

      <FilePreview link={openFile} onClose={() => setOpenFile(null)} />

      <AttachSheet
        visible={attachOpen}
        fileCount={uploaded.length}
        onClose={() => setAttachOpen(false)}
        onPickImage={() => void attachments.pickImage()}
        onTakePhoto={() => void attachments.takePhoto()}
        onPickDocument={() => void attachments.pickDocument()}
      />

      <SessionsSheet
        visible={sessionsOpen}
        activeId={conversationId}
        onClose={() => setSessionsOpen(false)}
        onOpenSession={chooseSession}
        onSignOut={() => {
          setSessionsOpen(false);
          void useAuthStore.getState().signOut().then(() => router.replace("/sign-in"));
        }}
      />
    </Screen>
  );
}
