/**
 * THE NOTES LIST. `docs/design/notes/SPEC.md` §C1 and §G5: pinned first, then
 * last edited, as the server orders them. Read-only in phase 2: a tap opens
 * the note; creating, pinning and deleting come with the editor (phase 3).
 */
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";

import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { LoadFailure } from "@/components/LoadFailure";
import { UnreadableNotice } from "@/components/UnreadableNotice";
import { ChevronLeft, Pin, Users } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { notesApi, type Note } from "@/api/notes";
import { relativeTime } from "@/lib/relativeTime";
import { noteSnippet } from "@/screens/notes/snippet";

type Row = { kind: "header"; key: string; title: string } | { kind: "note"; key: string; note: Note };

export default function NotesScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();

  const { data, error, refetch, isRefetching, isLoading, dataUpdatedAt, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["notes", "list"],
    queryFn: ({ pageParam }) => notesApi.list(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
  });

  const notes = useMemo(() => data?.pages.flatMap((p) => p.notes) ?? [], [data]);
  const unreadable = data?.pages.reduce((n, p) => n + p.unreadable, 0) ?? 0;

  const rows = useMemo<Row[]>(() => {
    const pinned = notes.filter((n) => n.pinned);
    const others = notes.filter((n) => !n.pinned);
    const out: Row[] = [];
    if (pinned.length) {
      out.push({ kind: "header", key: "h-pinned", title: t("notes.pinned") });
      pinned.forEach((note) => out.push({ kind: "note", key: `n-${note.id}`, note }));
    }
    if (others.length) {
      if (pinned.length) out.push({ kind: "header", key: "h-others", title: t("notes.others") });
      others.forEach((note) => out.push({ kind: "note", key: `n-${note.id}`, note }));
    }
    return out;
  }, [notes, t]);

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.sm }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          hitSlop={8}
          style={{ width: metrics.touch, height: metrics.touch, justifyContent: "center" }}
        >
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "700" }} accessibilityRole="header">
          {t("notes.title")}
        </Text>
      </View>

      <LoadFailure error={error} loadFailed={t("notes.listLoadFailed")} hasData={notes.length > 0} updatedAt={dataUpdatedAt} onRetry={() => void refetch()} testID="notes-load-failed" />
      {unreadable ? <UnreadableNotice count={unreadable} /> : null}

      {isLoading ? (
        <ActivityIndicator testID="notes-loading" color={colors.inkMuted} style={{ marginTop: metrics.space.xl }} />
      ) : (
        <FlatList
          testID="notes-list"
          data={rows}
          keyExtractor={(row) => row.key}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.inkMuted} />}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            error ? null : (
              <Text testID="notes-empty" tone="muted" style={{ textAlign: "center", marginTop: metrics.space.xl }}>
                {t("notes.empty")}
              </Text>
            )
          }
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={colors.inkMuted} style={{ margin: metrics.space.md }} /> : null}
          renderItem={({ item }) =>
            item.kind === "header" ? (
              <Text tone="muted" style={{ fontSize: 13, fontWeight: "600", marginTop: metrics.space.md, marginBottom: metrics.space.xs }}>
                {item.title}
              </Text>
            ) : (
              <NoteRow note={item.note} />
            )
          }
        />
      )}
    </Screen>
  );
}

function NoteRow({ note }: { note: Note }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const snippet = noteSnippet(note.html);
  // Pressed is tracked in state: a function style is dropped by NativeWind's interop.
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      testID={`note-row-${note.id}`}
      onPress={() => router.push({ pathname: "/notes/note", params: { id: String(note.id) } })}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      style={{ paddingVertical: metrics.space.md, borderBottomWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1, gap: 4 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {note.pinned ? <Pin size={14} color={colors.inkMuted} /> : null}
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 17, fontWeight: "600", color: note.title ? colors.ink : colors.inkMuted }}>
          {note.title || t("notes.untitled")}
        </Text>
        {note.isShared || note.sharedCount > 0 ? <Users size={14} color={colors.inkMuted} accessibilityLabel={t("notes.shared")} /> : null}
      </View>
      {snippet ? (
        <Text tone="muted" numberOfLines={2} style={{ fontSize: 14 }}>
          {snippet}
        </Text>
      ) : null}
      <Text tone="muted" style={{ fontSize: 12 }}>
        {t("notes.updated", { when: relativeTime(note.updatedAt) })}
      </Text>
    </Pressable>
  );
}
