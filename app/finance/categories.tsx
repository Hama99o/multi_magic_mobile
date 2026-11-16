/**
 * Finance › Categories (`docs/design/finance/SPEC.md` §A F22, §D.10; the web's
 * `pages/finance/tags/Index.tsx`). The web's two columns become a drill-down:
 * the categories with their subcategory count, and `?parent=` for one
 * category's subcategories, so the system back goes up a level.
 *
 * Add and rename through the name dialog; delete after an Alert that names
 * what goes with a category: its subcategories and any budget on it (the
 * server destroys both; entries only lose the category).
 *
 * Every tag comes from one `all=true` read, by name, split here, as the web.
 */
import { useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { financeKeys } from "@/api/keys";
import { financeApi, type Tag } from "@/api/finance";
import { ChevronRight, Pencil, Tag as TagIcon, Trash2 } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { NameDialog } from "@/screens/pages/ItemSheet";
import { useCreateTag, useDeleteTag, useRenameTag } from "@/screens/finance/useFinanceMutations";
import { EmptyState, Fab, ManageHeader } from "@/screens/finance/manage/common";

export default function CategoriesScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ parent?: string }>();
  const parentId = params.parent ? Number(params.parent) : null;
  const tags = useQuery({ queryKey: financeKeys.tags(), queryFn: financeApi.tags.all });
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "rename"; tag: Tag } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const close = () => {
    setDialog(null);
    setDialogError(null);
  };
  const create = useCreateTag({ onDone: close, onError: () => setDialogError(t("finance.manage.categories.saveFailed")) });
  const rename = useRenameTag({ onError: () => setFailure(t("finance.manage.categories.saveFailed")) });
  const remove = useDeleteTag({ onError: () => setFailure(t("finance.manage.failed")) });

  const all = tags.data ?? [];
  const parent = parentId == null ? null : (all.find((x) => x.id === parentId) ?? null);
  const rows = all.filter((x) => x.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));
  const subCount = (id: number) => all.filter((x) => x.parentId === id).length;

  const confirmDelete = (tag: Tag) => {
    const subs = subCount(tag.id);
    const body =
      tag.parentId != null
        ? t("finance.manage.categories.deleteSubBody")
        : subs > 0
          ? t("finance.manage.categories.deleteBody", { count: subs })
          : t("finance.manage.categories.deleteBodyNoSubs");
    Alert.alert(t("finance.manage.categories.deleteQuestion", { name: tag.name }), body, [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => remove.mutate(tag.id) },
    ]);
  };
  const submit = (name: string) => {
    if (!dialog) return;
    if (dialog.mode === "add") return create.mutate({ name, parentId });
    if (name !== dialog.tag.name) rename.mutate({ id: dialog.tag.id, name });
    close();
  };

  const title = parent ? parent.name : t("finance.manage.categories.title");
  return (
    <Screen measure>
      <ManageHeader testID="finance-categories" title={title} subtitle={parent ? t("finance.manage.categories.subcategories") : undefined} />
      <LoadFailure error={tags.error} loadFailed={t("finance.manage.categories.loadFailed")} hasData={Boolean(tags.data)} updatedAt={tags.dataUpdatedAt} onRetry={() => void tags.refetch()} testID="finance-categories-load-failed" />
      {failure ? (
        <Pressable testID="finance-categories-failure" onPress={() => setFailure(null)} accessibilityRole="button" accessibilityLabel={failure} accessibilityLiveRegion="polite">
          <Text tone="danger">{failure}</Text>
        </Pressable>
      ) : null}
      {tags.isPending && !tags.error ? <RowsSkeleton rows={5} testID="finance-categories-loading" /> : null}
      <FlatList
        testID="finance-categories-list"
        data={tags.data && (parentId == null || parent) ? rows : []}
        keyExtractor={(x) => String(x.id)}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
        refreshControl={<RefreshControl refreshing={tags.isRefetching} onRefresh={() => void tags.refetch()} tintColor={colors.inkMuted} />}
        contentContainerStyle={{ paddingBottom: 96 }}
        ListEmptyComponent={
          tags.data ? (
            parentId == null ? (
              <EmptyState testID="finance-categories-empty" icon={TagIcon} title={t("finance.manage.categories.empty")} body={t("finance.manage.categories.emptyBody")} />
            ) : (
              <EmptyState testID="finance-categories-empty" icon={TagIcon} title={t("finance.manage.categories.emptySub")} body={parent ? t("finance.manage.categories.emptySubBody", { name: parent.name }) : undefined} />
            )
          ) : null
        }
        renderItem={({ item, index }) => {
          const top = item.parentId == null;
          const count = top ? subCount(item.id) : 0;
          return (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 35).duration(220)}>
              <View testID={`finance-category-${item.id}`} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs, minHeight: 56 }}>
                <Pressable
                  testID={`finance-category-open-${item.id}`}
                  disabled={!top}
                  onPress={() => router.push({ pathname: "/finance/categories", params: { parent: String(item.id) } })}
                  accessibilityRole={top ? "button" : "text"}
                  accessibilityLabel={top ? t("finance.manage.categories.openA11y", { name: item.name }) : item.name}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 56 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: top ? "600" : "400" }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {top ? (
                      <Text testID={`finance-category-count-${item.id}`} variant="caption" tone="muted">
                        {t("finance.manage.categories.subCount", { count })}
                      </Text>
                    ) : null}
                  </View>
                  {top ? <ChevronRight size={20} color={colors.inkMuted} /> : null}
                </Pressable>
                <Pressable testID={`finance-category-rename-${item.id}`} onPress={() => setDialog({ mode: "rename", tag: item })} accessibilityRole="button" accessibilityLabel={t("finance.manage.categories.renameA11y", { name: item.name })} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
                  <Pencil size={18} color={colors.inkMuted} />
                </Pressable>
                <Pressable testID={`finance-category-delete-${item.id}`} onPress={() => confirmDelete(item)} accessibilityRole="button" accessibilityLabel={t("finance.manage.categories.deleteA11y", { name: item.name })} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
                  <Trash2 size={18} color={colors.danger} />
                </Pressable>
              </View>
            </Animated.View>
          );
        }}
      />
      {parentId == null || parent ? (
        <Fab testID="finance-categories-new" label={parent ? t("finance.manage.categories.newSub") : t("finance.manage.categories.new")} onPress={() => setDialog({ mode: "add" })} />
      ) : null}
      <NameDialog
        open={dialog != null}
        title={dialog?.mode === "rename" ? t("finance.manage.categories.renameTitle") : parent ? t("finance.manage.categories.newSub") : t("finance.manage.categories.new")}
        confirm={dialog?.mode === "rename" ? t("finance.manage.categories.rename") : t("finance.manage.categories.add")}
        initial={dialog?.mode === "rename" ? dialog.tag.name : ""}
        busy={create.isPending}
        error={dialogError}
        onCancel={close}
        onSubmit={submit}
      />
    </Screen>
  );
}
