/**
 * SafeZone's vault (`docs/design/safezone/SPEC.md` §C.2): Passwords, Cards
 * and IDs, behind the PIN. Every row comes from `safezoneApi.list`, so it
 * holds no secret (`SECURITY.md` §0). Leaving this screen locks the vault.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CreditCard, IdCard, KeyRound, Lock, Search, TriangleAlert, X } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { SAFEZONE_KINDS, safezoneApi, safezoneKeys, type SafeZoneKind, type SafeZoneRow } from "@/api/safezone";
import { useSafezoneLock } from "@/stores/safezoneLock.store";
import { SafeZoneGate } from "@/screens/safezone/SafeZoneGate";
import { isExpired, rowSubtitle } from "@/screens/safezone/display";
import { secureScreen } from "@/screens/safezone/secureScreen";

const ICONS = { passwords: KeyRound, payment_cards: CreditCard, identities: IdCard } as const;
const SEARCH_DELAY_MS = 300;

export default function SafeZoneScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <Screen measure>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
        <Pressable testID="safezone-back" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={8} style={{ width: 32, height: 32, justifyContent: "center" }}>
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }} testID="safezone-title">
          {t("safezone.title")}
        </Text>
        <LockButton />
      </View>
      <SafeZoneGate lockOnLeave>
        <Vault />
      </SafeZoneGate>
    </Screen>
  );
}

function LockButton() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const unlocked = useSafezoneLock((s) => s.status.kind === "unlocked");
  if (!unlocked) return null;
  return (
    <Pressable testID="safezone-lock" onPress={() => useSafezoneLock.getState().lock()} accessibilityRole="button" accessibilityLabel={t("safezone.lockNow")} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
      <Lock size={22} color={colors.ink} />
    </Pressable>
  );
}

function Vault() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [kind, setKind] = useState<SafeZoneKind>("passwords");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setSearch(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [typed]);

  const list = useInfiniteQuery({
    queryKey: safezoneKeys.list(kind, search),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const token = useSafezoneLock.getState().liveToken();
      if (!token) {
        useSafezoneLock.getState().lock();
        throw new Error("safezone locked");
      }
      return safezoneApi.list(kind, { token, page: pageParam, search });
    },
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    retry: false,
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <View style={{ flex: 1, gap: metrics.space.md }}>
      {!secureScreen.available() ? (
        <View testID="safezone-no-capture-block" style={{ flexDirection: "row", gap: metrics.space.sm, alignItems: "center" }}>
          <TriangleAlert size={18} color={colors.danger} />
          <Text tone="danger" variant="caption" style={{ flex: 1 }}>
            {t("safezone.noCapture")}
          </Text>
        </View>
      ) : null}
      <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: metrics.radius.md, padding: metrics.space.xs }}>
        {SAFEZONE_KINDS.map((k) => {
          const on = k === kind;
          return (
            <Pressable
              key={k}
              testID={`safezone-tab-${k}`}
              onPress={() => setKind(k)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: metrics.radius.sm, backgroundColor: on ? colors.accent : "transparent" }}
            >
              <Text variant="label" tone={on ? "onAccent" : "default"} numberOfLines={1}>
                {t(`safezone.tabs.${k}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md }}>
        <Search size={18} color={colors.inkMuted} />
        <TextInput
          testID="safezone-search"
          value={typed}
          onChangeText={setTyped}
          placeholder={t("safezone.search")}
          placeholderTextColor={colors.inkMuted}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={t("safezone.search")}
          style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }}
        />
        {typed ? (
          <Pressable testID="safezone-search-clear" onPress={() => setTyped("")} accessibilityRole="button" accessibilityLabel={t("safezone.clearSearch")} hitSlop={8}>
            <X size={18} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>
      <LoadFailure error={list.error} loadFailed={t("safezone.loadFailed")} hasData={Boolean(list.data)} updatedAt={list.dataUpdatedAt} onRetry={() => void list.refetch()} testID="safezone-load-failed" />
      {list.isPending && !list.error ? <ActivityIndicator testID="safezone-loading" style={{ marginTop: metrics.space.xl }} /> : null}
      <FlatList
        testID="safezone-list"
        data={rows}
        keyExtractor={(r) => `${r.kind}-${r.id}`}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        ListEmptyComponent={
          list.data ? (
            <Text testID="safezone-empty" tone="muted" style={{ paddingVertical: metrics.space.xl, textAlign: "center" }}>
              {search ? t("safezone.noMatch") : t(`safezone.empty.${kind}`)}
            </Text>
          ) : null
        }
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator /> : null}
        renderItem={({ item }) => <Row row={item} />}
        contentContainerStyle={{ paddingBottom: 48 }}
      />
    </View>
  );
}

function rowTitle(row: SafeZoneRow, t: (key: string) => string): string {
  if (row.kind === "passwords") return row.title || row.link || t("safezone.noTitle");
  if (row.kind === "payment_cards") return row.name || t("safezone.noTitle");
  return row.type ? t(`safezone.identityTypes.${row.type}`) : t("safezone.noTitle");
}

function Row({ row }: { row: SafeZoneRow }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const Icon = ICONS[row.kind];
  const title = rowTitle(row, t);
  const expired = row.kind === "identities" && isExpired(row.expiresAt);
  const weak = row.kind === "passwords" && row.weak === true;
  return (
    <Pressable
      testID={`safezone-row-${row.kind}-${row.id}`}
      onPress={() => router.push({ pathname: "/safezone/item", params: { kind: row.kind, id: String(row.id) } })}
      accessibilityRole="button"
      accessibilityLabel={t("safezone.open", { name: title })}
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 64 }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <Icon size={20} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1}>{title}</Text>
        <Text tone="muted" variant="caption" numberOfLines={1}>
          {rowSubtitle(row)}
        </Text>
      </View>
      {expired ? (
        <Text tone="danger" variant="caption" testID={`safezone-expired-${row.id}`}>
          {t("safezone.expired")}
        </Text>
      ) : null}
      {weak ? (
        <Text tone="danger" variant="caption" testID={`safezone-weak-${row.id}`}>
          {t("safezone.weak")}
        </Text>
      ) : null}
      <ChevronRight size={18} color={colors.inkMuted} />
    </Pressable>
  );
}
