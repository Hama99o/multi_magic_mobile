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
import { ChevronLeft, ChevronRight, Lock, Plus, Search, TriangleAlert, X } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { SAFEZONE_KINDS, safezoneApi, safezoneKeys, type SafeZoneKind, type SafeZoneRow } from "@/api/safezone";
import { useSafezoneLock } from "@/stores/safezoneLock.store";
import { SafeZoneGate } from "@/screens/safezone/SafeZoneGate";
import { isExpired, rowSubtitle } from "@/screens/safezone/display";
import { KIND_ICONS, Tile } from "@/screens/safezone/Tile";
import { APP_COLORS } from "@/theme/appColors";
import Animated, { FadeInDown } from "react-native-reanimated";
import { secureScreen } from "@/screens/safezone/secureScreen";

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
      <SafeZoneGate>
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
        ListEmptyComponent={list.data ? <EmptyState kind={kind} searching={Boolean(search)} /> : null}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator /> : null}
        renderItem={({ item, index }) => <Row row={item} index={index} />}
        contentContainerStyle={{ paddingBottom: 96, gap: metrics.space.sm }}
      />
      {/* Add (owner, 2026-11-15: "everything doable on mobile"): the kind on screen. */}
      <Pressable
        testID="safezone-add"
        onPress={() => router.push({ pathname: "/safezone/edit", params: { kind } })}
        accessibilityRole="button"
        accessibilityLabel={t("safezone.add")}
        style={{ position: "absolute", right: 0, bottom: metrics.space.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: APP_COLORS.safezone, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
      >
        <Plus size={26} color="#04161a" />
      </Pressable>
    </View>
  );
}

function rowTitle(row: SafeZoneRow, t: (key: string) => string): string {
  if (row.kind === "passwords") return row.title || row.link || t("safezone.noTitle");
  if (row.kind === "payment_cards") return row.name || t("safezone.noTitle");
  return row.type ? t(`safezone.identityTypes.${row.type}`) : t("safezone.noTitle");
}

function EmptyState({ kind, searching }: { kind: SafeZoneKind; searching: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const Icon = searching ? Search : KIND_ICONS[kind];
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={{ alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.xl * 1.5, paddingHorizontal: metrics.space.lg }}>
      <View testID="safezone-empty-art" style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: `${colors.accent}1f`, alignItems: "center", justifyContent: "center", marginBottom: metrics.space.sm }}>
        <Icon size={40} color={colors.accent} />
      </View>
      <Text testID="safezone-empty-title" variant="title" style={{ textAlign: "center", fontSize: 20 }}>
        {searching ? t("safezone.noMatch") : t(`safezone.emptyTitle.${kind}`)}
      </Text>
      {searching ? null : (
        <Text testID="safezone-empty" tone="muted" style={{ textAlign: "center" }}>
          {t(`safezone.empty.${kind}`)}
        </Text>
      )}
      {searching ? <View testID="safezone-empty" /> : null}
    </Animated.View>
  );
}

function Row({ row, index }: { row: SafeZoneRow; index: number }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [pressed, setPressed] = useState(false);
  const title = rowTitle(row, t);
  const expired = row.kind === "identities" && isExpired(row.expiresAt);
  const weak = row.kind === "passwords" && row.weak === true;
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 35).duration(220)}>
    <Pressable
      testID={`safezone-row-${row.kind}-${row.id}`}
      onPress={() => router.push({ pathname: "/safezone/item", params: { kind: row.kind, id: String(row.id) } })}
      accessibilityRole="button"
      accessibilityLabel={t("safezone.open", { name: title })}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: metrics.space.md,
        minHeight: 68,
        paddingHorizontal: metrics.space.md,
        paddingVertical: metrics.space.sm,
        borderRadius: metrics.radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      }}
    >
      <Tile kind={row.kind} site={row.kind === "passwords" ? row.link || row.title || "" : ""} testID={`safezone-tile-${row.kind}-${row.id}`} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontWeight: "600" }}>{title}</Text>
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
    </Animated.View>
  );
}
