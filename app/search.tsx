/**
 * GLOBAL SEARCH — one field for every app (docs/design/search/SPEC.md).
 *
 * The web's palette (`components/search/SearchDialog.tsx`) over the same
 * endpoint, `GET /api/v1/search`. A focused surface with its own chrome: the
 * field on top with Cancel (Raycast, ClickUp), opened over the current screen
 * from the header's search key, so Cancel returns exactly there.
 *
 * - Before typing: Recent (with Clear), then every app under "Go to". An
 *   empty search is never a dead end (the web's own rule).
 * - Typing: "Ask the assistant" first (Notion), then the apps and the "New …"
 *   commands that match (matched here, the web's tiers), then the server's
 *   records under their app's heading, in the server's order.
 * - A record opens its screen through `routeForWebPath`; one the phone has no
 *   screen for asks the assistant about it instead (composed, not sent: the
 *   notifications screen's rule).
 */
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useNavParams } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";

import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { LoadFailure } from "@/components/LoadFailure";
import { Clock, FileText, Plus, Search, Sparkles, X } from "@/components/icons";
import KanbanIcon from "lucide-react-native/dist/esm/icons/kanban";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useDraft } from "@/hooks/useDraft";
import { useMe } from "@/hooks/useMe";
import { aiApi } from "@/api/ai";
import { aiKeys } from "@/api/keys";
import { searchApi, type SearchGroup, type SearchKind, type SearchResult } from "@/api/search";
import { routeForWebPath } from "@/lib/inAppRoute";
import { APP_REGISTRY, type AppEntry } from "@/apps/registry";
import { WORD_PREFIX, score } from "@/screens/search/rank";
import { todayKey } from "@/screens/calendar/dates";
import { useSearchRecents, type RecentHit } from "@/stores/searchRecents";

/** Below this the server answers nothing (Search::Global::MIN_QUERY_LENGTH). */
const MIN_SERVER_QUERY = 2;
const DEBOUNCE_MS = 300;
const MAX_APPS = 6;
const MAX_COMMANDS = 4;

type Icon = ComponentType<{ size?: number; color?: string }>;
type Route = Parameters<typeof router.push>[0];

/** Each server group under its app's own name and icon; Flow and Doc have no app here. */
function groupMeta(t: TFunction): Record<SearchGroup, { label: string; icon: Icon }> {
  const app = (key: AppEntry["key"]) => APP_REGISTRY.find((a) => a.key === key)!;
  const of = (key: AppEntry["key"]) => ({ label: t(app(key).labelKey), icon: app(key).icon as Icon });
  return {
    notes: of("notes"),
    page_app: of("pages"),
    todos: of("todos"),
    calendar: of("calendar"),
    contacts: of("contacts"),
    finance: of("finance"),
    safezone: of("safezone"),
    conversations: of("chats"),
    ai: of("assistant"),
    flow: { label: t("search.groups.flow"), icon: KanbanIcon as Icon },
    doc: { label: t("search.groups.doc"), icon: FileText },
  };
}

/** The badge on a row: what the record is. Literal keys, so the key check sees them. */
function kindLabels(t: TFunction): Record<SearchKind, string> {
  return {
    note: t("search.kinds.note"), space: t("search.kinds.space"), file: t("search.kinds.file"),
    todoGroup: t("search.kinds.todoGroup"), task: t("search.kinds.task"), event: t("search.kinds.event"),
    contact: t("search.kinds.contact"), expense: t("search.kinds.expense"), income: t("search.kinds.income"),
    loan: t("search.kinds.loan"), password: t("search.kinds.password"), paymentCard: t("search.kinds.paymentCard"),
    identity: t("search.kinds.identity"), project: t("search.kinds.project"), card: t("search.kinds.card"),
    conversation: t("search.kinds.conversation"), message: t("search.kinds.message"),
    signature: t("search.kinds.signature"), document: t("search.kinds.document"),
  };
}

/** "New …" for every form the phone has (the web's COMMANDS, less the ones with no screen here). */
function commands(t: TFunction): { id: string; label: string; alias: string; route: () => Route }[] {
  const app = (key: AppEntry["key"]) => t(APP_REGISTRY.find((a) => a.key === key)!.labelKey);
  return [
    { id: "new-expense", label: t("search.commands.newExpense"), alias: app("finance"), route: () => ({ pathname: "/finance/entry", params: { kind: "expense" } }) },
    { id: "new-income", label: t("search.commands.newIncome"), alias: app("finance"), route: () => ({ pathname: "/finance/entry", params: { kind: "income" } }) },
    { id: "new-loan", label: t("search.commands.newLoan"), alias: app("finance"), route: () => "/finance/loan-edit" },
    { id: "new-contact", label: t("search.commands.newContact"), alias: app("contacts"), route: () => "/contacts/edit" },
    { id: "new-event", label: t("search.commands.newEvent"), alias: app("calendar"), route: () => ({ pathname: "/calendar/edit", params: { day: todayKey() } }) },
    { id: "new-password", label: t("search.commands.newPassword"), alias: app("safezone"), route: () => ({ pathname: "/safezone/edit", params: { kind: "passwords" } }) },
  ];
}

export default function SearchScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const me = useMe();
  const { recents, remember, clear } = useSearchRecents(me?.id ?? null);
  const { data: sessionId } = useQuery({ queryKey: aiKeys.currentSession(), queryFn: aiApi.currentSessionId });
  const { setDraft } = useDraft(sessionId ?? null);

  // What was typed in the Apps sheet before coming here, searched at once.
  const params = useNavParams<{ q?: string }>();
  const [query, setQuery] = useState(() => (typeof params.q === "string" ? params.q : ""));
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);
  const serverQuery = debounced.length >= MIN_SERVER_QUERY ? debounced : "";
  const search = useQuery({
    queryKey: ["search", serverQuery],
    queryFn: ({ signal }) => searchApi.all(serverQuery, signal),
    enabled: serverQuery.length > 0,
    // The last answer stays while the next is on its way: stale beats empty.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const groups = useMemo(() => groupMeta(t), [t]);
  const kinds = useMemo(() => kindLabels(t), [t]);
  const apps = useMemo(() => APP_REGISTRY.filter((a) => a.key !== "home"), []);
  const q = debounced;

  const appHits = useMemo(() => {
    if (!q) return apps;
    return apps
      // Its line too, as the Apps sheet finds it ("passwords" is SafeZone).
      .map((a) => ({ a, s: score(t(a.labelKey), q, [t(a.lineKey)]) }))
      // One letter: only a start of a word counts ("n" is Notes, not Finance).
      .filter((x): x is { a: AppEntry; s: number } => x.s !== null && (q.length > 1 || x.s >= WORD_PREFIX))
      .sort((x, y) => y.s - x.s)
      .slice(0, MAX_APPS)
      .map((x) => x.a);
  }, [apps, q, t]);
  const commandHits = useMemo(() => {
    if (!q) return [];
    return commands(t)
      .map((c) => ({ c, s: score(c.label, q, [c.alias]) }))
      .filter((x) => x.s !== null && (q.length > 1 || x.s >= WORD_PREFIX))
      .sort((x, y) => (y.s ?? 0) - (x.s ?? 0))
      .slice(0, MAX_COMMANDS)
      .map((x) => x.c);
  }, [q, t]);

  // The server's records, grouped by app in the order the groups first appear.
  const records = useMemo(() => (serverQuery ? (search.data?.results ?? []) : []), [serverQuery, search.data]);
  const grouped = useMemo(() => {
    const out = new Map<SearchGroup, SearchResult[]>();
    for (const r of records) out.set(r.group, [...(out.get(r.group) ?? []), r]);
    return [...out.entries()];
  }, [records]);

  const ask = (text: string) => {
    setDraft(text);
    router.push("/chat");
  };
  const openRecord = (r: { id: string; title: string; subtitle: string | null; to: string }, kind?: string) => {
    remember({ id: r.id, title: r.title, subtitle: r.subtitle, to: r.to });
    const route = routeForWebPath(r.to, r.title);
    if (route) router.push(route);
    else ask(t("search.askAbout", { title: r.title, kind: kind ?? "" }));
  };
  const openApp = (a: AppEntry) => {
    remember({ id: `app:${a.key}`, title: t(a.labelKey), subtitle: null, to: a.key });
    router.push(a.route as Route);
  };
  const openRecent = (r: RecentHit) => {
    if (r.id.startsWith("app:")) {
      const a = apps.find((x) => `app:${x.key}` === r.id);
      if (a) openApp(a);
      return;
    }
    if (r.id.startsWith("command:")) {
      const c = commands(t).find((x) => `command:${x.id}` === r.id);
      if (c) router.push(c.route());
      return;
    }
    openRecord(r);
  };

  const row = (testID: string, icon: ReactNode, title: string, subtitle: string | null, onPress: () => void, badge?: string) => (
    <Pressable
      key={testID}
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, badge].filter(Boolean).join(", ")}
      style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: metrics.space.md, paddingVertical: metrics.space.xs }}
    >
      <View style={{ width: 32, alignItems: "center" }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 16 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} tone="muted" variant="caption">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View style={{ borderRadius: metrics.radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.surface }}>
          <Text tone="muted" variant="caption">
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
  const section = (key: string, label: string, children: ReactNode, action?: ReactNode) => (
    <View key={key} testID={`search-section-${key}`} style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: metrics.space.md }}>
        <Text tone="muted" variant="caption" style={{ flex: 1, fontWeight: "600", letterSpacing: 0.4 }} accessibilityRole="header">
          {label.toUpperCase()}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );

  const searching = serverQuery.length > 0 && search.isFetching;
  const nothing = serverQuery.length > 0 && !search.isFetching && !search.isError && records.length === 0 && appHits.length === 0 && commandHits.length === 0;

  return (
    <Screen measure avoidKeyboard>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.sm }}>
        <View
          style={{
            flex: 1, flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 48,
            paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, backgroundColor: colors.surface,
          }}
        >
          <Search size={18} color={colors.inkMuted} />
          <TextInput
            testID="search-input"
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder={t("search.placeholder")}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t("search.placeholder")}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={{ flex: 1, color: colors.ink, fontSize: 16, paddingVertical: metrics.space.sm }}
          />
          {query ? (
            <Pressable testID="search-clear" onPress={() => setQuery("")} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("search.clear")}>
              <X size={18} color={colors.inkMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable testID="search-cancel" onPress={() => router.back()} accessibilityRole="button" hitSlop={8} style={{ minHeight: 48, justifyContent: "center" }}>
          <Text style={{ color: colors.accent, fontSize: 16 }}>{t("common.cancel")}</Text>
        </Pressable>
      </View>
      <View style={{ height: 2 }}>{searching ? <ActivityIndicator testID="search-searching" size="small" color={colors.inkMuted} /> : null}</View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: metrics.space.xl }}>
        {q ? (
          row("search-ask", <Sparkles size={20} color={colors.accent} />, t("search.ask", { query: q }), null, () => ask(q))
        ) : recents.length ? (
          section(
            "recents",
            t("search.sections.recents"),
            recents.map((r) => row(`search-recent-${r.id}`, <Clock size={20} color={colors.inkMuted} />, r.title, r.subtitle, () => openRecent(r))),
            <Pressable testID="search-recents-clear" onPress={clear} hitSlop={8} accessibilityRole="button">
              <Text style={{ color: colors.accent }} variant="caption">
                {t("search.clearRecents")}
              </Text>
            </Pressable>,
          )
        ) : null}

        {appHits.length
          ? section(
              "apps",
              t("search.sections.apps"),
              appHits.map((a) => {
                const AppIcon = a.icon as Icon;
                return row(`search-app-${a.key}`, <AppIcon size={20} color={colors.ink} />, t(a.labelKey), null, () => openApp(a));
              }),
            )
          : null}
        {commandHits.length
          ? section(
              "commands",
              t("search.sections.commands"),
              commandHits.map((c) =>
                row(`search-command-${c.id}`, <Plus size={20} color={colors.ink} />, c.label, null, () => {
                  remember({ id: `command:${c.id}`, title: c.label, subtitle: null, to: c.id });
                  router.push(c.route());
                }),
              ),
            )
          : null}

        {grouped.map(([group, rows]) => {
          const meta = groups[group];
          const GroupIcon = meta.icon;
          return section(
            group,
            meta.label,
            rows.map((r) => row(`search-hit-${r.id}`, <GroupIcon size={20} color={colors.ink} />, r.title, r.subtitle, () => openRecord(r, kinds[r.kind]), kinds[r.kind])),
          );
        })}

        {search.isError ? (
          <LoadFailure error={search.error} loadFailed={t("search.loadFailed")} hasData={false} updatedAt={0} onRetry={() => void search.refetch()} testID="search-failed" />
        ) : null}
        {nothing ? (
          <Text testID="search-empty" tone="muted" style={{ textAlign: "center", marginTop: metrics.space.xl }}>
            {t("search.empty", { query: serverQuery })}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
