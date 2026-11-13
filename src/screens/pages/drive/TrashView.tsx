/**
 * TRASH, as Drive has it (QA_DEEP #9): each item has a ⋯ with Restore and
 * Delete forever, and "Empty trash" sits above the list. Both deletes ask
 * first, and say it cannot be undone. A tap on an item opens the same
 * sheet, since a trashed file is not opened in Drive either.
 *
 * Only the items that were put in the bin are listed (`trash_roots`); a
 * folder's contents come back, or go, with it. The server has no "empty"
 * endpoint, so `pagesApi.emptyTrash` deletes each one.
 */
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Text } from "@/components/reusables/text";
import { LoadFailure } from "@/components/LoadFailure";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { RotateCcw, Trash2 } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { pagesApi, type PageNode } from "@/api/pages";
import { failureMessage } from "@/api/failure";
import { EmptyLine } from "../parts";
import { BottomSheet, SheetRow } from "./sheets";
import { ListRow } from "./ui";
import { pagesKeys } from "@/api/keys";

export function TrashView() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<PageNode | null>(null);
  const [emptying, setEmptying] = useState(false);

  const trash = useInfiniteQuery({
    queryKey: pagesKeys.drive("trash", ""),
    queryFn: ({ pageParam }) => pagesApi.drive("trash", pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
  });
  const nodes = useMemo(() => (trash.data?.pages ?? []).flatMap((p) => p.rows), [trash.data]);
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: pagesKeys.all }), [queryClient]);

  const restore = useCallback(
    (node: PageNode) => {
      setChosen(null);
      void pagesApi
        .restore(node.spaceId, node.id)
        .then(refresh)
        .catch((e: unknown) => Alert.alert(failureMessage(e, t("pages.trash.restoreFailed"))));
    },
    [refresh, t],
  );

  const destroy = useCallback(
    (node: PageNode) => {
      setChosen(null);
      Alert.alert(t("pages.trash.deleteTitle", { title: node.title }), t("pages.trash.deleteBody"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("pages.trash.deleteForever"),
          style: "destructive",
          onPress: () =>
            void pagesApi
              .destroyForever(node.spaceId, node.id)
              .then(refresh)
              .catch((e: unknown) => Alert.alert(failureMessage(e, t("pages.trash.deleteFailed")))),
        },
      ]);
    },
    [refresh, t],
  );

  const empty = useCallback(() => {
    Alert.alert(t("pages.trash.emptyTitle"), t("pages.trash.emptyBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("pages.trash.empty"),
        style: "destructive",
        onPress: () => {
          setEmptying(true);
          void pagesApi
            .emptyTrash()
            .then((count) => Alert.alert(t("pages.trash.emptied", { count })))
            .catch((e: unknown) => Alert.alert(failureMessage(e, t("pages.trash.emptyFailed"))))
            .finally(() => {
              setEmptying(false);
              void refresh();
            });
        },
      },
    ]);
  }, [refresh, t]);

  return (
    <View style={{ flex: 1 }}>
      {nodes.length > 0 ? (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingBottom: metrics.space.sm }}>
          <Pressable
            onPress={empty}
            disabled={emptying}
            accessibilityRole="button"
            accessibilityLabel={t("pages.trash.empty")}
            hitSlop={6}
            style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs, minHeight: 40, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: colors.border }}
            testID="pages-trash-empty"
          >
            {emptying ? <ActivityIndicator size="small" color={colors.danger} /> : <Trash2 size={16} color={colors.danger} />}
            <Text variant="label" tone="danger">
              {t("pages.trash.empty")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <LoadFailure
        error={trash.error}
        loadFailed={t("pages.loadFailed")}
        hasData={Boolean(trash.data)}
        updatedAt={trash.dataUpdatedAt}
        onRetry={() => void trash.refetch()}
        testID="pages-drive-load-failed"
      />
      <FlatList
        testID="pages-drive-list"
        data={nodes}
        keyExtractor={(n) => String(n.id)}
        renderItem={({ item }) => (
          <ListRow node={item} onPress={() => setChosen(item)} onMore={() => setChosen(item)} onLongPress={() => setChosen(item)} selecting={false} selected={false} showSpace />
        )}
        ListEmptyComponent={trash.isLoading ? <RowsSkeleton /> : trash.error ? null : <EmptyLine title={t("pages.empty.trash")} testID="pages-drive-empty" />}
        onEndReached={() => {
          if (trash.hasNextPage && !trash.isFetchingNextPage) void trash.fetchNextPage();
        }}
        ListFooterComponent={trash.isFetchingNextPage ? <ActivityIndicator color={colors.inkMuted} style={{ paddingVertical: metrics.space.lg }} /> : null}
        refreshControl={<RefreshControl refreshing={trash.isRefetching} onRefresh={() => void trash.refetch()} tintColor={colors.inkMuted} />}
        showsVerticalScrollIndicator={false}
      />

      <BottomSheet open={chosen != null} onClose={() => setChosen(null)} testID="pages-trash-sheet">
        {chosen ? (
          <>
            <Text variant="label" numberOfLines={2} style={{ paddingHorizontal: metrics.space.xl, paddingBottom: metrics.space.sm }}>
              {chosen.title}
            </Text>
            <SheetRow icon={RotateCcw} label={t("pages.trash.restore")} onPress={() => restore(chosen)} testID="pages-trash-restore" />
            <SheetRow icon={Trash2} label={t("pages.trash.deleteForever")} onPress={() => destroy(chosen)} danger testID="pages-trash-delete" />
          </>
        ) : null}
      </BottomSheet>
    </View>
  );
}
