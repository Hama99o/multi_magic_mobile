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
import { MessageSquareText } from "lucide-react-native";
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
import { MessageRow } from "@/components/chat/MessageRow";
import { ThinkingDots } from "@/components/chat/ThinkingDots";
import { Composer } from "@/components/chat/Composer";
import { EmptyState } from "@/components/chat/EmptyState";
import { SourceSheet } from "@/components/chat/SourceSheet";
import { SessionsSheet } from "@/components/sessions/SessionsSheet";
import { AttachSheet } from "@/components/chat/AttachSheet";
import { PendingFiles } from "@/components/chat/PendingFiles";
import { useAttachments } from "@/hooks/useAttachments";
import { documentsApi } from "@/api/ai";

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
   * A session chosen from the sheet wins over the server's default. Null means
   * "whatever the server says is current", which is also the state after a
   * delete — the server hands back the session to fall back to.
   */
  const [chosenId, setChosenId] = useState<number | null>(null);
  const conversationId = chosenId ?? sessionId ?? null;
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const { messages, status, awaitingReply, failed, hasOlder, loadOlder, addPending, resync } =
    useConversation({ conversationId, channel: "MessageChannel" });

  const { draft, setDraft, clear } = useDraft(conversationId);

  /** What the session already holds, so the cap is counted against the truth. */
  const { data: uploaded = [] } = useQuery({
    queryKey: ["ai", "documents", conversationId],
    queryFn: () => documentsApi.list(conversationId as number),
    enabled: conversationId != null,
  });

  const attachments = useAttachments(conversationId, uploaded.length);
  const [attachOpen, setAttachOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [failedQuestion, setFailedQuestion] = useState<FailedQuestion | null>(null);
  const [openSource, setOpenSource] = useState<MessageLink | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

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
    <Screen measure={false}>
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
          {/* The title bar carries a list icon; an app with one destination does
              not need a persistent drawer. Sign out lives inside the sheet. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Conversations"
            hitSlop={8}
            onPress={() => setSessionsOpen(true)}
            style={{
              width: metrics.touch,
              height: metrics.touch,
              alignItems: "center",
              justifyContent: "center",
            }}
            testID="chat-open-sessions"
          >
            <MessageSquareText size={22} color={colors.ink} />
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          renderItem={({ item }) => <MessageRow message={item} onOpenSource={setOpenSource} />}
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
              <EmptyState onPick={(q) => void send(q)} />
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
        onOpenSession={setChosenId}
        onSignOut={() => {
          setSessionsOpen(false);
          void useAuthStore.getState().signOut().then(() => router.replace("/sign-in"));
        }}
      />
    </Screen>
  );
}
