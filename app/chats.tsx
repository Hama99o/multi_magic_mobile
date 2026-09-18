/**
 * The chat list — `docs/design/people-chat/SPEC.md`.
 *
 * ── THERE IS NO `is_ai` TO FILTER ─────────────────────────────────────────
 * `conversations_controller.rb:14` goes through `Conversation.for_member`, and
 * `conversation.rb:26-30` opens with `human` — `where(is_ai: false)`. The
 * assistant's sessions are not on this wire at all, and the controller's own
 * header records that listing them here "was defect 1 in docs/MESSAGING.md".
 * A client-side filter would be a second implementation of a rule the server
 * enforces, and they would disagree the day one changed.
 *
 * ── AND IT CANNOT START ONE ───────────────────────────────────────────────
 * `POST /conversations` needs a `user_id` or `user_ids`
 * (`conversations_controller.rb:127-141`), which needs a people picker, which
 * needs user search, follow lists and a blocking rule — the same five-
 * permission-question shape that put group administration out of v1. So this
 * screen reads and replies, and the empty state SAYS SO rather than offering a
 * button with no room behind it. Runna's empty inbox has that button; we
 * rejected it by name in the SPEC.
 */
import { useCallback, useEffect } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { subscribeToChannel } from "@/lib/cable";
import { conversationsApi, type Conversation } from "@/api/conversations";
import { isNetworkFailure } from "@/api/http";
import { ConversationRow } from "@/screens/people/ConversationRow";

export default function Chats() {
  const colors = useColors();
  const metrics = useMetrics();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => conversationsApi.list(),
  });

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }, [queryClient]);

  /**
   * The list is kept current by `MessageChannel`, which streams the READER
   * rather than one thread (`messaging/broadcast.rb:7-9`): every message
   * addressed to them, in whichever conversation, wherever they are in the app.
   * That is exactly what a list needs, and it is why the list does not have to
   * subscribe per row.
   *
   * The frame carries a whole `conversation` payload, but it is re-read rather
   * than merged: `updated_at` decides the ORDER here, and splicing one row into
   * a sorted list correctly is more code than a 15-row refetch is worth.
   *
   * `onConnected` fires on the first connect AND every reconnect, and means
   * "you have missed things" — nothing broadcast while the socket was down is
   * ever replayed (`cable.ts:25-29`).
   */
  useEffect(
    () => subscribeToChannel("MessageChannel", { onData: reload, onConnected: reload }),
    [reload],
  );

  const open = useCallback((conversation: Conversation) => {
    router.push({
      pathname: "/chat/[id]",
      params: {
        id: String(conversation.id),
        name: conversation.displayName,
        isGroup: conversation.isGroup ? "1" : "0",
        // Carried so the thread can draw the UNREAD divider from the count the
        // row had BEFORE `mark_read` fires on open — see `chat/[id].tsx`.
        unread: String(conversation.unreadMessages),
      },
    });
  }, []);

  const conversations = data?.conversations ?? [];

  return (
    <Screen measure>
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
          accessibilityLabel="Back"
          hitSlop={8}
          style={{ width: 32, height: 32, justifyContent: "center" }}
        >
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" style={{ flex: 1 }}>
          Chats
        </Text>
      </View>

      {error ? (
        <View style={{ paddingVertical: metrics.space.xl, gap: metrics.space.sm }}>
          <Text tone="muted">
            {isNetworkFailure(error)
              ? "Could not reach MultiMagic."
              : "Could not load your chats."}
          </Text>
          <Pressable onPress={() => void refetch()} accessibilityRole="button" hitSlop={8}>
            <Text tone="accent">Try again</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={conversations}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ConversationRow conversation={item} onPress={() => open(item)} />
        )}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: colors.border, opacity: 0.5 }} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.inkMuted}
          />
        }
        ListEmptyComponent={
          isLoading || error ? null : (
            /* Gymshark and My BMW: a heading and one line that says what will
               fill it. No icon, no illustration (IDENTITY.md §6) — and no CTA,
               because there is nothing this screen could start. */
            <View style={{ paddingVertical: metrics.space.xl * 2, gap: metrics.space.sm }}>
              <Text variant="label">No conversations yet</Text>
              <Text tone="muted">Chats you start on MultiMagic appear here.</Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: metrics.space.xl }}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
