/**
 * TABLES: A TABLE'S FORMS (increment 8; the web's `FormsMenu.tsx`): each
 * form with who can fill it, whether it takes answers, and how many came;
 * "New form" asks every column it can. People who edit the base build forms
 * (`FormPolicy`); the page people fill is the web's, opened in the browser.
 * Newest first, as every list here.
 */
import { FlatList, Pressable, View } from "react-native";
import { useNav, useNavParams } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { tableFormsApi } from "@/api/tableForms";
import { failureMessage } from "@/api/failure";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { SheetButton } from "@/components/fields/FieldRow";
import { ClipboardList } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { EmptyState } from "@/screens/flow/parts";
import { useOneAtATime } from "@/screens/tables/useOneAtATime";

export default function FormsScreen() {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const params = useNavParams<{ table: string }>();
  const tableId = Number(params.table);
  const forms = useQuery({ queryKey: tablesKeys.forms(tableId), queryFn: () => tableFormsApi.list(tableId), enabled: Number.isFinite(tableId) });
  // The server lists them oldest first; the phone shows the newest on top (the owner's rule for every list).
  const rows = [...(forms.data ?? [])].sort((a, b) => b.id - a.id);
  const once = useOneAtATime(); // a double tap makes one form
  const create = useMutation({
    mutationFn: () => tableFormsApi.create(tableId),
    onSuccess: async (form) => {
      await client.invalidateQueries({ queryKey: tablesKeys.forms(tableId) });
      router.push({ pathname: "/tables/form", params: { id: String(form.id), table: String(tableId) } });
    },
  });

  return (
    <Screen measure header={<AppHeader app="tables" back title={t("tables.forms.title")} />}>
      <LoadFailure error={forms.error} loadFailed={t("tables.forms.loadFailed")} hasData={Boolean(forms.data)} updatedAt={forms.dataUpdatedAt} onRetry={() => void forms.refetch()} testID="tables-forms-failed" />
      <FlatList
        testID="tables-forms"
        data={rows}
        keyExtractor={(f) => String(f.id)}
        ItemSeparatorComponent={() => <View style={{ height: metrics.space.sm }} />}
        ListHeaderComponent={
          <View style={{ gap: metrics.space.xs, paddingBottom: metrics.space.sm }}>
            <SheetButton testID="tables-forms-new" label={t("tables.forms.new")} disabled={create.isPending} busy={create.isPending} onPress={() => once(() => create.mutateAsync())} />
            {create.error ? (
              <Text tone="danger" accessibilityLiveRegion="polite">
                {failureMessage(create.error, t("tables.forms.createFailed"))}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={forms.isPending ? <RowsSkeleton rows={3} testID="tables-forms-loading" /> : forms.data ? <EmptyState testID="tables-forms-empty" icon={ClipboardList} title={t("tables.forms.emptyTitle")} body={t("tables.forms.emptyBody")} /> : null}
        renderItem={({ item, index }) => (
          <Pressable
            testID={`tables-forms-${index}`}
            onPress={() => router.push({ pathname: "/tables/form", params: { id: String(item.id), table: String(tableId) } })}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${t(`tables.forms.access.${item.accessMode}`)}, ${t("tables.forms.answers", { count: item.submissionsCount })}`}
            style={{ height: 72, justifyContent: "center", gap: 2, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <Text variant="label" numberOfLines={1}>
              {item.name}
            </Text>
            <Text tone={item.closed || !item.accepting ? "danger" : "muted"} variant="caption" numberOfLines={1}>
              {[t(`tables.forms.access.${item.accessMode}`), t("tables.forms.answers", { count: item.submissionsCount }), item.closed ? t("tables.forms.closed") : !item.accepting ? t("tables.forms.paused") : null].filter(Boolean).join(" · ")}
            </Text>
          </Pressable>
        )}
        contentContainerStyle={{ paddingBottom: metrics.space.xl }}
      />
    </Screen>
  );
}
