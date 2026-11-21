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
 * ── STARTING ONE ──────────────────────────────────────────────────────────
 * It used to only read and reply (audit P0 #4). Now "+" in the header and the
 * empty state open `NewConversationSheet`: a people picker for one person or a
 * named group, the web's `NewConversationDialog` and the same two calls
 * (`POST /conversations` with `user_id`, or `user_ids` + `name`). A new
 * conversation opens straight away.
 *
 * ── SEARCHING (audit #29) ─────────────────────────────────────────────────
 * The web's field (`Index.tsx`): debounced, then the same list route with
 * `search` — the server's `pg_search` over the people in a thread and a
 * group's name. A search is its own cached list (`conversationKeys.search`),
 * so clearing the field puts the whole list back at once; and it says "no
 * match" rather than the empty state, whose Start button would invite a
 * duplicate of a conversation that exists.
 *
 * The shared header (`AppHeader`) carries Home, the other apps and Android's back.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Plus, Search, X } from "@/components/icons";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { AppHeader } from "@/components/shell/AppHeader";
import { useColors, useMetrics } from "@/hooks/useColors";
import { subscribeToChannel } from "@/lib/cable";
import { conversationsApi, type Conversation } from "@/api/conversations";
import { UnreadableNotice } from "@/components/UnreadableNotice";
import { LoadFailure } from "@/components/LoadFailure";
import { ConversationRow } from "@/screens/people/ConversationRow";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { conversationKeys } from "@/api/keys";
import { Button } from "@/components/reusables/button";
import { NewConversationSheet } from "@/screens/people/NewConversationSheet";

/** The web waits 350 ms (`Index.tsx`); so does this. */
export const SEARCH_DEBOUNCE_MS = 350;

export default function Chats() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  /**
   * EVERY PAGE, not the first. The server pages at 15 (`conversations_controller.rb`),
   * and until 2026-09-24 this read page 1 only, so a sixteenth conversation
   * could not be reached from the phone at all (the volume audit). Pages load
   * as the reader nears the end. The key stays under ["conversations"], so the
   * thread's and the socket's invalidations still refetch it; a refetch
   * re-reads every page that is loaded.
   */
  const all = useInfiniteQuery({
    queryKey: conversationKeys.list(),
    queryFn: ({ pageParam }) => conversationsApi.list(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
  });
  // A search is its own list, so the whole one stays cached underneath and
  // comes back at once when the field is cleared (audit #29).
  const searched = useInfiniteQuery({
    queryKey: conversationKeys.search(term),
    queryFn: ({ pageParam }) => conversationsApi.list(pageParam, term),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled: term.length > 0,
  });
  const { data, isLoading, error, refetch, isRefetching, dataUpdatedAt, fetchNextPage, hasNextPage, isFetchingNextPage } =
    term ? searched : all;

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
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

  // By id, first seen: the list is ordered by latest activity, so a row can
  // move from page 2 to page 1 between two requests and arrive twice.
  const conversations = useMemo(() => {
    const seen = new Set<number>();
    return (data?.pages ?? [])
      .flatMap((page) => page.conversations)
      .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  }, [data]);

  return (
    <Screen measure header={<AppHeader app="chats" />}>
      {/* The app's own row: search, and a new conversation beside it. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, marginTop: metrics.space.sm, marginBottom: metrics.space.sm }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: metrics.space.sm,
          backgroundColor: colors.surface,
          borderRadius: metrics.radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: metrics.space.md,
          minHeight: metrics.touch,
          flex: 1,
        }}
      >
        <Search size={16} color={colors.inkMuted} />
        <TextInput
          testID="chats-search"
          value={search}
          onChangeText={setSearch}
          placeholder={t("chats.search")}
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={t("chats.search")}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={{ flex: 1, color: colors.ink, paddingVertical: metrics.space.sm }}
        />
        {search ? (
          <Pressable
            onPress={() => {
              setSearch("");
              setTerm("");
            }}
            accessibilityRole="button"
            accessibilityLabel={t("chats.clearSearch")}
            hitSlop={10}
          >
            <X size={16} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>
        <Pressable
          testID="chats-new"
          onPress={() => setStarting(true)}
          accessibilityRole="button"
          accessibilityLabel={t("chats.newConversation")}
          hitSlop={8}
          style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
        >
          <Plus size={22} color={colors.ink} />
        </Pressable>
      </View>

      <UnreadableNotice count={(data?.pages ?? []).reduce((n, page) => n + (page.unreadable ?? 0), 0)} />

      <LoadFailure
        error={error}
        loadFailed={t("chats.loadFailed")}
        hasData={Boolean(data)}
        updatedAt={dataUpdatedAt}
        onRetry={() => void refetch()}
        testID="chats-load-failed"
      />

      <FlatList
        testID="chats-list"
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
          isLoading ? (
            // Rows in the rows' own shape while they load (Telegram) — see
            // `skeleton.tsx`. Not a blank list, not a spinner.
            <RowsSkeleton />
          ) : error ? null : term ? (
            <View testID="chats-no-matches" style={{ paddingVertical: metrics.space.xl * 2 }}>
              <Text tone="muted">{t("chats.noMatches")}</Text>
            </View>
          ) : (
            /* Gymshark and My BMW: a heading and one line that says what will
               fill it. No icon, no illustration (IDENTITY.md §6). And the way
               to fill it, now that this screen can start one. */
            <View
              testID="chats-empty"
              style={{ paddingVertical: metrics.space.xl * 2, gap: metrics.space.sm }}
            >
              <Text variant="label">{t("chats.emptyTitle")}</Text>
              <Text tone="muted">{t("chats.emptyBody")}</Text>
              <View style={{ paddingTop: metrics.space.md }}>
                <Button
                  testID="chats-empty-start"
                  label={t("chats.emptyStart")}
                  block={false}
                  onPress={() => setStarting(true)}
                />
              </View>
            </View>
          )
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator testID="chats-more" color={colors.inkMuted} style={{ paddingVertical: metrics.space.lg }} />
          ) : null
        }
        contentContainerStyle={{ paddingBottom: metrics.space.xl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      />

      {starting ? (
        <NewConversationSheet
          onClose={() => setStarting(false)}
          onCreated={(conversation) => {
            setStarting(false);
            open(conversation);
          }}
        />
      ) : null}
    </Screen>
  );
}
