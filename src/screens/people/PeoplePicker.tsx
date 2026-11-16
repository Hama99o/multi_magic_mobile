/**
 * THE PEOPLE PICKER — a search field over the people-finder and the list it
 * answers, searched as you type and paged on scroll.
 *
 * Lifted out of `NewConversationSheet` (audit #30) so adding somebody to a
 * group picks them the same way starting a conversation does. It fills the
 * space it is given (`flex: 1` on the list), so the sheet around it decides
 * the height and, with `KeyboardPadding`, rises with the keyboard.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Check, Search, Users } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { useColors, useMetrics } from "@/hooks/useColors";
import { peopleApi, type Person } from "@/api/conversations";
import { conversationKeys } from "@/api/keys";
import { failureMessage } from "@/api/failure";
import { Avatar } from "./Avatar";

const SEARCH_DEBOUNCE_MS = 300;

export function PeoplePicker({
  onPick,
  isSelected,
  exclude,
  busyId = null,
  between = null,
  testIDs,
}: {
  onPick: (person: Person) => void;
  /** Draws a check on the row. */
  isSelected?: (person: Person) => boolean;
  /** Left out of the list: a group's members, when adding to it. */
  exclude?: ReadonlySet<number>;
  /** A row whose pick is on its way: a spinner, and no second tap. */
  busyId?: number | null;
  /** Drawn between the field and the list (the group's "2 people chosen"). */
  between?: ReactNode;
  testIDs: { search: string; list: string; loading: string };
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const people = useInfiniteQuery({
    queryKey: conversationKeys.people(term),
    queryFn: ({ pageParam }) => peopleApi.search(term, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
  });
  const rows = useMemo(() => {
    const seen = new Set<number>();
    return (people.data?.pages ?? [])
      .flatMap((page) => page.people)
      .filter((p) => !exclude?.has(p.id))
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [people.data, exclude]);

  return (
    <>
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
        }}
      >
        <Search size={16} color={colors.inkMuted} />
        <TextInput
          testID={testIDs.search}
          value={search}
          onChangeText={setSearch}
          placeholder={t("chats.searchPeople")}
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={t("chats.searchPeople")}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, color: colors.ink, paddingVertical: metrics.space.sm }}
        />
      </View>

      {between}

      <FlatList
        testID={testIDs.list}
        style={{ flex: 1 }}
        data={rows}
        keyExtractor={(p) => String(p.id)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const on = isSelected?.(item) ?? false;
          return (
            <Pressable
              testID={`person-${item.id}`}
              onPress={() => onPick(item)}
              disabled={busyId != null}
              accessibilityRole="button"
              accessibilityState={{ selected: on, busy: busyId === item.id }}
              accessibilityLabel={item.name}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: metrics.space.md,
                paddingVertical: metrics.space.sm,
                paddingHorizontal: metrics.space.sm,
                minHeight: metrics.touch,
                borderRadius: metrics.radius.md,
                backgroundColor: on ? colors.surface : "transparent",
              }}
            >
              <Avatar name={item.name} uri={item.avatar} userId={item.id} size={36} />
              <View style={{ flex: 1 }}>
                <Text variant="label" numberOfLines={1}>
                  {item.name}
                </Text>
                {item.email && item.email !== item.name ? (
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {item.email}
                  </Text>
                ) : null}
              </View>
              {busyId === item.id ? <ActivityIndicator color={colors.inkMuted} /> : null}
              {on ? <Check size={18} color={colors.accent} /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          people.isLoading ? (
            <RowsSkeleton rows={4} testID={testIDs.loading} />
          ) : people.error ? (
            <View style={{ paddingVertical: metrics.space.lg, gap: metrics.space.sm }}>
              <Text tone="muted">{failureMessage(people.error, t("chats.peopleFailed"))}</Text>
              <Pressable onPress={() => void people.refetch()} accessibilityRole="button" hitSlop={8}>
                <Text tone="accent">{t("common.tryAgain")}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ paddingVertical: metrics.space.lg, flexDirection: "row", gap: metrics.space.sm }}>
              <Users size={16} color={colors.inkMuted} />
              <Text tone="muted">{t("chats.nobodyFound")}</Text>
            </View>
          )
        }
        onEndReached={() => {
          if (people.hasNextPage && !people.isFetchingNextPage) void people.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          people.isFetchingNextPage ? <ActivityIndicator color={colors.inkMuted} style={{ paddingVertical: metrics.space.md }} /> : null
        }
      />
    </>
  );
}
