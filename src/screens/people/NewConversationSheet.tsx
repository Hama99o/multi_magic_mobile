/**
 * Starting a conversation — audit P0 #4 (2026-11-16), after the web's
 * `NewConversationDialog.tsx`.
 *
 * Two modes, as on the web: DIRECT (one person; the server hands back the
 * chat that already exists, so this never makes a duplicate) and GROUP (two
 * people or more, and a name; with no name it is named after its people's
 * first names, which is what the web sends). The people come from the
 * people-finder, `peopleApi.search`, searched as you type and paged on scroll.
 *
 * A refusal keeps the sheet open and says why: the person picked somebody
 * and pressed Start, and a sheet that closed with nothing made would read as
 * a missed tap.
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, Search, Users, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { useColors, useMetrics } from "@/hooks/useColors";
import { conversationsApi, peopleApi, type Conversation, type Person } from "@/api/conversations";
import { conversationKeys } from "@/api/keys";
import { failureMessage } from "@/api/failure";
import { Avatar } from "./Avatar";

type Mode = "direct" | "group";

const SEARCH_DEBOUNCE_MS = 300;
const FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

export function NewConversationSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conversation: Conversation) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("direct");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<Person[]>([]);
  const [groupName, setGroupName] = useState("");

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
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [people.data]);

  const create = useMutation({
    mutationFn: (args: { mode: Mode; people: Person[]; name: string }) =>
      args.mode === "direct"
        ? conversationsApi.create(args.people[0].id)
        : conversationsApi.createGroup(
            args.people.map((p) => p.id),
            args.name.trim() || args.people.map((p) => p.firstName ?? p.name).join(", "),
          ),
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
      onCreated(conversation);
    },
  });

  const canStart = mode === "direct" ? selected.length === 1 : selected.length >= 2;

  const pickMode = (next: Mode) => {
    setMode(next);
    setSelected([]);
    create.reset();
  };

  const toggle = (person: Person) => {
    create.reset();
    if (mode === "direct") {
      setSelected([person]);
      return;
    }
    setSelected((current) =>
      current.some((p) => p.id === person.id) ? current.filter((p) => p.id !== person.id) : [...current, person],
    );
  };

  const start = () => {
    if (!canStart || create.isPending) return;
    create.mutate({ mode, people: selected, name: groupName });
  };

  const modeChip = (value: Mode, label: string, testID: string) => {
    const on = mode === value;
    return (
      <Pressable
        testID={testID}
        onPress={() => pickMode(value)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={label}
        style={{
          paddingHorizontal: metrics.space.md,
          minHeight: 36,
          justifyContent: "center",
          borderRadius: metrics.radius.pill,
          backgroundColor: on ? colors.accent : colors.surface,
          borderWidth: 1,
          borderColor: on ? colors.accent : colors.border,
        }}
      >
        <Text variant="label" tone={on ? "onAccent" : "muted"}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        {/* The scrim is a sibling, not a parent (docs/ACCESSIBILITY.md N1). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={onClose}
          style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.5)" }}
        />
        <View
          testID="new-conversation-sheet"
          style={{
            backgroundColor: colors.ground,
            borderTopLeftRadius: metrics.radius.lg,
            borderTopRightRadius: metrics.radius.lg,
            paddingTop: metrics.space.lg,
            paddingHorizontal: metrics.space.lg,
            paddingBottom: metrics.space.lg + insets.bottom,
            gap: metrics.space.md,
            height: "85%",
            width: "100%",
            maxWidth: metrics.maxMeasure,
            alignSelf: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text variant="title" style={{ flex: 1 }} numberOfLines={1}>
              {t("chats.newConversation")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              hitSlop={10}
              onPress={onClose}
              style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
            >
              <X size={22} color={colors.inkMuted} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
            {modeChip("direct", t("chats.direct"), "new-conversation-direct")}
            {modeChip("group", t("chats.group"), "new-conversation-group")}
          </View>

          {mode === "group" ? (
            <TextInput
              testID="new-conversation-name"
              value={groupName}
              onChangeText={setGroupName}
              placeholder={t("chats.groupName")}
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel={t("chats.groupName")}
              style={{
                color: colors.ink,
                backgroundColor: colors.surface,
                borderRadius: metrics.radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: metrics.space.md,
                minHeight: metrics.touch,
              }}
            />
          ) : null}

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
              testID="new-conversation-search"
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

          {mode === "group" ? (
            <Text variant="caption" tone="muted">
              {t("chats.chosen", { count: selected.length })}
            </Text>
          ) : null}

          <FlatList
            testID="new-conversation-people"
            style={{ flex: 1 }}
            data={rows}
            keyExtractor={(p) => String(p.id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const on = selected.some((p) => p.id === item.id);
              return (
                <Pressable
                  testID={`person-${item.id}`}
                  onPress={() => toggle(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
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
                  {on ? <Check size={18} color={colors.accent} /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              people.isLoading ? (
                <RowsSkeleton rows={4} testID="new-conversation-loading" />
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

          {create.error ? (
            <Text variant="caption" tone="danger" testID="new-conversation-error" accessibilityLiveRegion="polite">
              {failureMessage(create.error, t("chats.startFailed"))}
            </Text>
          ) : null}

          <Button
            testID="new-conversation-start"
            label={t("chats.start")}
            onPress={start}
            disabled={!canStart}
            busy={create.isPending}
          />
        </View>
      </View>
    </Modal>
  );
}
