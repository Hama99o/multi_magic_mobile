/**
 * SEARCH, as Drive has it (QA_DEEP #8): the field is a pill with back and
 * clear, and under it three chips, Type · Modified · Owner, each opening a
 * short sheet. A chip alone searches too ("PDFs", nothing typed: every PDF),
 * because the server treats a blank query as everything (`search_nodes`).
 *
 * Where each filter runs, and why:
 * - Type: on the server (`kind` / `content_type`, `drive_controller#listed`),
 *   the same meaning as a folder's chips (`filters.ts`).
 * - Modified and Owner: on the phone, over the rows that came back. The
 *   server has no date or owner filter for search. Results come newest
 *   first, so a date window keeps a prefix of each page, and more pages are
 *   fetched while the filtered list is short.
 */
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Text } from "@/components/reusables/text";
import { LoadFailure } from "@/components/LoadFailure";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { Check, ChevronDown, ChevronLeft, X } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { pagesApi, type PageNode } from "@/api/pages";
import { EmptyLine } from "../parts";
import { openNode } from "../navigation";
import { typeLabel } from "../labels";
import { BottomSheet } from "./sheets";
import { NodeCollection } from "./NodeCollection";
import { FILTERS, listFilter, type Filter } from "./filters";
import { pagesKeys } from "@/api/keys";
import { useMe } from "@/hooks/useMe";

export type Modified = "any" | "today" | "week" | "month" | "year";
export type Owner = "anyone" | "me" | "others";

const MODIFIED: Modified[] = ["any", "today", "week", "month", "year"];
const OWNERS: Owner[] = ["anyone", "me", "others"];

/** Kept by a "Modified" window? `now` is a parameter so tests can pin it. */
export function withinModified(updatedAt: string, window: Modified, now: Date = new Date()): boolean {
  if (window === "any") return true;
  const when = new Date(updatedAt).getTime();
  if (window === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return when >= start.getTime();
  }
  if (window === "year") return new Date(updatedAt).getFullYear() === now.getFullYear();
  const days = window === "week" ? 7 : 30;
  return when >= now.getTime() - days * 86_400_000;
}

/** Kept by an "Owner" choice? By name: the rows carry the owner's name only. */
export function withinOwner(node: Pick<PageNode, "ownerName">, owner: Owner, me: string | null): boolean {
  if (owner === "anyone" || !me) return true;
  const mine = (node.ownerName ?? "").trim().toLocaleLowerCase() === me.trim().toLocaleLowerCase();
  return owner === "me" ? mine : !mine;
}

function modifiedLabel(m: Modified, t: (k: string) => string): string {
  switch (m) {
    case "today":
      return t("pages.searchChips.today");
    case "week":
      return t("pages.searchChips.week");
    case "month":
      return t("pages.searchChips.month");
    case "year":
      return t("pages.searchChips.year");
    default:
      return t("pages.searchChips.any");
  }
}

function ownerLabel(o: Owner, t: (k: string) => string): string {
  switch (o) {
    case "me":
      return t("pages.searchChips.me");
    case "others":
      return t("pages.searchChips.others");
    default:
      return t("pages.searchChips.anyone");
  }
}

function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        minHeight: 36,
        paddingHorizontal: metrics.space.md,
        borderRadius: metrics.radius.sm,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.border,
        backgroundColor: active ? `${colors.accent}22` : "transparent",
      }}
      testID={testID}
    >
      <Text variant="label" tone={active ? "accent" : "default"}>
        {label}
      </Text>
      <ChevronDown size={16} color={active ? colors.accent : colors.inkMuted} />
    </Pressable>
  );
}

function Option({ label, chosen, onPress, testID }: { label: string; chosen: boolean; onPress: () => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: chosen }}
      style={{ flexDirection: "row", alignItems: "center", minHeight: 52, paddingHorizontal: metrics.space.xl, gap: metrics.space.md }}
      testID={testID}
    >
      <Text style={{ flex: 1 }}>{label}</Text>
      {chosen ? <Check size={20} color={colors.accent} /> : null}
    </Pressable>
  );
}

export function SearchView() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const me = useMe()?.fullName ?? null;

  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<Filter | null>(null);
  const [modified, setModified] = useState<Modified>("any");
  const [owner, setOwner] = useState<Owner>("anyone");
  const [sheet, setSheet] = useState<"type" | "modified" | "owner" | null>(null);

  // Ask once he stops typing, not on every letter.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  const asking = query.length > 0 || type != null || modified !== "any" || owner !== "anyone";
  const found = useInfiniteQuery({
    queryKey: pagesKeys.driveSearch(query, type),
    queryFn: ({ pageParam }) => pagesApi.drive("search", pageParam, { search: query, ...listFilter(type) }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled: asking,
  });
  const nodes = useMemo(
    () => (found.data?.pages ?? []).flatMap((p) => p.rows).filter((n) => withinModified(n.updatedAt, modified) && withinOwner(n, owner, me)),
    [found.data, modified, owner, me],
  );
  // A phone-side filter can leave a page nearly empty: read on while short.
  useEffect(() => {
    if (asking && nodes.length < 20 && found.hasNextPage && !found.isFetchingNextPage) void found.fetchNextPage();
  }, [asking, nodes.length, found]);

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: metrics.space.xs,
          minHeight: 52,
          borderRadius: metrics.radius.pill,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: metrics.space.xs,
          marginVertical: metrics.space.sm,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          hitSlop={6}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          testID="pages-back"
        >
          <ChevronLeft size={22} color={colors.ink} />
        </Pressable>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          autoFocus
          placeholder={t("pages.searchPill")}
          placeholderTextColor={colors.inkMuted}
          returnKeyType="search"
          accessibilityLabel={t("pages.search")}
          style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }}
          testID="pages-search-input"
        />
        {typed ? (
          <Pressable
            onPress={() => setTyped("")}
            accessibilityRole="button"
            accessibilityLabel={t("pages.searchChips.clear")}
            hitSlop={8}
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
            testID="pages-search-clear"
          >
            <X size={20} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* "handled": a chip works on the first tap with the keyboard up. */}
      <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: metrics.space.sm, paddingBottom: metrics.space.sm }}>
        <Chip label={type ? typeLabel(type, t) : t("pages.searchChips.type")} active={type != null} onPress={() => setSheet("type")} testID="pages-search-chip-type" />
        <Chip label={modified !== "any" ? modifiedLabel(modified, t) : t("pages.searchChips.modified")} active={modified !== "any"} onPress={() => setSheet("modified")} testID="pages-search-chip-modified" />
        <Chip label={owner !== "anyone" ? ownerLabel(owner, t) : t("pages.searchChips.owner")} active={owner !== "anyone"} onPress={() => setSheet("owner")} testID="pages-search-chip-owner" />
      </ScrollView>

      <LoadFailure error={found.error} loadFailed={t("pages.loadFailed")} hasData={Boolean(found.data)} updatedAt={found.dataUpdatedAt} onRetry={() => void found.refetch()} testID="pages-drive-load-failed" />

      <NodeCollection
        testID="pages-drive-list"
        nodes={asking ? nodes : []}
        top={null}
        empty={
          !asking ? (
            <Text tone="muted" style={{ paddingVertical: metrics.space.lg }} testID="pages-search-hint">
              {t("pages.searchChips.hint")}
            </Text>
          ) : found.isLoading ? (
            <RowsSkeleton />
          ) : found.error ? null : (
            <EmptyLine title={t("pages.empty.search")} testID="pages-drive-empty" />
          )
        }
        loadingMore={found.isFetchingNextPage}
        onEndReached={() => {
          if (found.hasNextPage && !found.isFetchingNextPage) void found.fetchNextPage();
        }}
        refreshing={found.isRefetching}
        onRefresh={() => void found.refetch()}
        onOpen={(node) => openNode(node, { trail: node.space?.title ?? "" })}
        showSpace
        locationOf={(node) => node.space?.title ?? ""}
        bottomPadding={metrics.space.xl}
      />

      <BottomSheet open={sheet === "type"} onClose={() => setSheet(null)} testID="pages-search-type-sheet">
        <Option label={typeLabel(null, t)} chosen={type == null} onPress={() => (setType(null), setSheet(null))} testID="pages-search-type-all" />
        {FILTERS.map((f) => (
          <Option key={f} label={typeLabel(f, t)} chosen={type === f} onPress={() => (setType(f), setSheet(null))} testID={`pages-search-type-${f}`} />
        ))}
      </BottomSheet>
      <BottomSheet open={sheet === "modified"} onClose={() => setSheet(null)} testID="pages-search-modified-sheet">
        {MODIFIED.map((m) => (
          <Option key={m} label={modifiedLabel(m, t)} chosen={modified === m} onPress={() => (setModified(m), setSheet(null))} testID={`pages-search-modified-${m}`} />
        ))}
      </BottomSheet>
      <BottomSheet open={sheet === "owner"} onClose={() => setSheet(null)} testID="pages-search-owner-sheet">
        {OWNERS.map((o) => (
          <Option key={o} label={ownerLabel(o, t)} chosen={owner === o} onPress={() => (setOwner(o), setSheet(null))} testID={`pages-search-owner-${o}`} />
        ))}
      </BottomSheet>
    </View>
  );
}
