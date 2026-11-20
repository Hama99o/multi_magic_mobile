/**
 * TABLES: the bases (`docs/design/tables/SPEC.md` §A, §B Airtable "Bases").
 *
 * A plain list: a coloured square, the name, the description, the tables and
 * rows it holds. Newest first: the server's default since multi_magic
 * feat/flow-rest-paging (API_ASKS §6.2, the owner's rule), and a chip offers
 * Recently changed and A–Z. One answer holds every base, so search filters
 * on the phone.
 */
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { BASE_SORTS, tablesApi, type Base, type BaseSort } from "@/api/tables";
import { Search, Table2, X } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { EmptyState } from "@/screens/flow/parts";
import { BaseBadge, SortChips } from "@/screens/tables/parts";
import { baseMatches } from "@/screens/tables/logic";

export default function TablesScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [sort, setSort] = useState<BaseSort>("created_at_desc");
  const [searching, setSearching] = useState(false);
  const [term, setTerm] = useState("");

  const bases = useQuery({ queryKey: tablesKeys.bases(sort), queryFn: () => tablesApi.bases(sort) });
  const shown = useMemo(() => (bases.data ?? []).filter((b) => baseMatches(b, term)), [bases.data, term]);

  return (
    <Screen measure>
      <AppHeader app="tables" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.xs }}>
        <View style={{ flex: 1 }}>
          <SortChips
            testID="tables-bases-sort"
            value={sort}
            onChange={setSort}
            options={BASE_SORTS.map((s) => ({ value: s, label: t(`tables.baseSort.${s}`) }))}
          />
        </View>
        <Pressable
          testID="tables-search-toggle"
          onPress={() => {
            setSearching((s) => !s);
            setTerm("");
          }}
          accessibilityRole="button"
          accessibilityLabel={searching ? t("tables.closeSearch") : t("tables.searchBases")}
          style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
        >
          {searching ? <X size={22} color={colors.ink} /> : <Search size={22} color={colors.ink} />}
        </Pressable>
      </View>
      {searching ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, marginBottom: metrics.space.sm, backgroundColor: colors.surface }}>
          <Search size={18} color={colors.inkMuted} />
          <TextInput
            testID="tables-search"
            value={term}
            onChangeText={setTerm}
            autoFocus
            placeholder={t("tables.searchPlaceholder")}
            placeholderTextColor={colors.inkMuted}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t("tables.searchBases")}
            style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }}
          />
        </View>
      ) : null}

      <LoadFailure error={bases.error} loadFailed={t("tables.loadFailed")} hasData={Boolean(bases.data)} updatedAt={bases.dataUpdatedAt} onRetry={() => void bases.refetch()} testID="tables-load-failed" />
      <FlatList
        testID="tables-bases"
        data={shown}
        keyExtractor={(b) => String(b.id)}
        ListEmptyComponent={
          bases.isPending && !bases.error ? (
            <RowsSkeleton rows={5} testID="tables-loading" />
          ) : bases.data ? (
            term.trim() ? (
              <EmptyState testID="tables-no-match" icon={Search} title={t("tables.noMatch", { term: term.trim() })} />
            ) : (
              <EmptyState testID="tables-empty" icon={Table2} title={t("tables.emptyTitle")} body={t("tables.emptyBody")} />
            )
          ) : null
        }
        renderItem={({ item, index }) => <BaseRow base={item} index={index} />}
        ItemSeparatorComponent={() => <View style={{ height: metrics.space.sm }} />}
        refreshControl={<RefreshControl refreshing={bases.isRefetching} onRefresh={() => void bases.refetch()} tintColor={colors.inkMuted} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: metrics.space.xl }}
      />
    </Screen>
  );
}

function BaseRow({ base, index }: { base: Base; index: number }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [pressed, setPressed] = useState(false);
  const stats = [t("tables.tableCount", { count: base.tables.length }), t("tables.rowCount", { count: base.rowCount, formatted: base.rowCount.toLocaleString(i18n.language) })].join(" · ");
  const first = base.tables[0];
  return (
    <Pressable
      testID={`tables-base-${index}`}
      disabled={!first}
      onPress={() => first && router.push({ pathname: "/tables/table", params: { id: String(first.id), base: String(base.id) } })}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={[base.name, base.description, stats].filter(Boolean).join(". ")}
      style={{ flexDirection: "row", gap: metrics.space.md, padding: metrics.space.md, minHeight: 72, borderRadius: metrics.radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.border : colors.surface }}
    >
      <BaseBadge color={base.color} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" numberOfLines={1}>
          {base.name}
        </Text>
        {base.description ? (
          <Text tone="muted" numberOfLines={1}>
            {base.description}
          </Text>
        ) : null}
        <Text tone="muted" variant="caption">
          {stats}
        </Text>
      </View>
    </Pressable>
  );
}
