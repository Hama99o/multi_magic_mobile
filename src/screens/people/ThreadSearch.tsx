/**
 * Finding something said in THIS thread — audit #29, after the web's
 * `components/chat/ThreadSearch.tsx`.
 *
 * The same request the web makes: the thread's messages route with `search`
 * (`messages_controller.rb#index`, `body ILIKE`, the newest 25 matches),
 * debounced 350 ms and only from two characters, as the web waits for. A
 * result is a button; the thread loads history back to it and shows it
 * (`revealMessage` in `app/chat/[id].tsx`), which is the web's `reveal`.
 *
 * It sits under the header, not in a sheet: the thread's screen already rises
 * with the keyboard (`Screen avoidKeyboard`), and the results stay next to the
 * conversation they point into, as on the web.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { threadApi, type ChatMessage } from "@/api/conversations";
import { conversationKeys } from "@/api/keys";
import { failureMessage } from "@/api/failure";
import { dayLabel } from "./DayDivider";

export const THREAD_SEARCH_DEBOUNCE_MS = 350;
/** The web searches from two characters (`ThreadSearch.tsx`). */
export const THREAD_SEARCH_MIN = 2;

export function ThreadSearch({
  conversationId,
  senderFor,
  onPick,
  onClose,
  revealing,
  notice,
}: {
  conversationId: number;
  /** Who wrote it, as a result's second line. */
  senderFor: (message: ChatMessage) => string;
  onPick: (message: ChatMessage) => void;
  onClose: () => void;
  /** The id being loaded back to, if any: its row shows a spinner. */
  revealing: number | null;
  /** Said under the field: a result that could not be reached. */
  notice: string | null;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), THREAD_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const active = term.length >= THREAD_SEARCH_MIN;
  const results = useQuery({
    queryKey: conversationKeys.threadSearch(conversationId, term),
    queryFn: () => threadApi.search(conversationId, term),
    enabled: active,
  });

  return (
    <View
      testID="thread-search"
      style={{
        gap: metrics.space.sm,
        paddingBottom: metrics.space.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        maxHeight: 320,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: metrics.space.sm,
            backgroundColor: colors.surface,
            borderRadius: metrics.radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: metrics.space.md,
            minHeight: metrics.touch,
          }}
        >
          <Search size={16} color={colors.inkMuted} />
          <TextInput
            testID="thread-search-input"
            value={search}
            onChangeText={setSearch}
            autoFocus
            placeholder={t("thread.search")}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t("thread.search")}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{ flex: 1, color: colors.ink, paddingVertical: metrics.space.sm }}
          />
        </View>
        <Pressable
          testID="thread-search-close"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("thread.closeSearch")}
          hitSlop={8}
          style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
        >
          <X size={20} color={colors.inkMuted} />
        </Pressable>
      </View>

      {notice ? (
        <Text variant="caption" tone="danger" testID="thread-search-notice" accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}

      {active ? (
        results.isLoading ? (
          <ActivityIndicator testID="thread-search-loading" color={colors.inkMuted} />
        ) : results.error ? (
          <View testID="thread-search-failed" style={{ gap: metrics.space.xs }}>
            <Text tone="muted">{failureMessage(results.error, t("thread.searchFailed"))}</Text>
            <Pressable onPress={() => void results.refetch()} accessibilityRole="button" hitSlop={8}>
              <Text tone="accent">{t("common.tryAgain")}</Text>
            </Pressable>
          </View>
        ) : (results.data ?? []).length === 0 ? (
          <Text tone="muted">{t("thread.noMatches")}</Text>
        ) : (
          <FlatList
            data={results.data}
            keyExtractor={(m) => String(m.id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                testID={`thread-search-result-${item.id}`}
                onPress={() => onPick(item)}
                disabled={revealing != null}
                accessibilityRole="button"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: metrics.space.sm,
                  paddingVertical: metrics.space.sm,
                  minHeight: metrics.touch,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1}>{item.deleted ? t("thread.deleted") : item.body}</Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {`${senderFor(item)} · ${dayLabel(item.createdAt, undefined, t)}`}
                  </Text>
                </View>
                {revealing === item.id ? <ActivityIndicator color={colors.inkMuted} /> : null}
              </Pressable>
            )}
          />
        )
      ) : null}
    </View>
  );
}
