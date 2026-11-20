/**
 * TABLES: COMMENTS and HISTORY (increment 5; the web's `ActivityPanel.tsx`,
 * `CommentsFeed.tsx`, `HistoryFeed.tsx`), for a whole table or for one row
 * (`record`). Two tabs, newest first, older on demand.
 *
 * Comments: write one (an @ offers the base's people; a mention rings their
 * bell, the server sends no email), edit or delete your own (the base's
 * managers may delete any). History: every change in the web's words
 * (`history.ts`), filtered by kind, with the assistant's and imports' badge,
 * and Restore on a deleted column still in the trash.
 */
import { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { HISTORY_KINDS, tablesApi, type HistoryKind, type TableComment } from "@/api/tables";
import { failureMessage } from "@/api/failure";
import { Pencil, Send, Trash2 } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { KeyboardPadding } from "@/components/KeyboardPadding";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { relativeTime } from "@/lib/relativeTime";
import { ActionSheet } from "@/screens/contacts/ActionSheet";
import { Segmented } from "@/screens/flow/parts";
import { canEditRows } from "@/screens/tables/logic";
import { historyLine } from "@/screens/tables/history";
import { addMention, mentionQuery, mentionsIn } from "@/screens/tables/mentions";

type Tab = "comments" | "history";

export default function ActivityScreen() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ table: string; record?: string; tab?: string }>();
  const tableId = Number(params.table);
  const recordId = params.record ? Number(params.record) : undefined;
  const [tab, setTab] = useState<Tab>(params.tab === "history" ? "history" : "comments");
  const table = useQuery({ queryKey: tablesKeys.table(tableId), queryFn: () => tablesApi.table(tableId), enabled: Number.isFinite(tableId) });
  const bases = useQuery({ queryKey: tablesKeys.bases("created_at_desc"), queryFn: () => tablesApi.bases(), enabled: Boolean(table.data) });
  const base = bases.data?.find((b) => b.id === table.data?.baseId);

  return (
    <Screen measure>
      <AppHeader app="tables" back title={recordId ? t("tables.activity.rowTitle") : (table.data?.name ?? t("tables.title"))} />
      <View style={{ paddingVertical: metrics.space.xs }}>
        <Segmented
          testID="tables-activity-tabs"
          value={tab}
          onChange={setTab}
          options={[
            { value: "comments", label: t("tables.activity.comments") },
            { value: "history", label: t("tables.history.title") },
          ]}
        />
      </View>
      {tab === "comments" ? (
        <Comments tableId={tableId} recordId={recordId} baseId={table.data?.baseId} />
      ) : (
        <History tableId={tableId} recordId={recordId} canRestore={canEditRows(base?.role)} />
      )}
    </Screen>
  );
}

function Comments({ tableId, recordId, baseId }: { tableId: number; recordId?: number; baseId?: number }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const key = tablesKeys.comments(tableId, recordId ?? 0);
  const comments = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => tablesApi.comments(tableId, { recordId, before: pageParam || undefined }),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const people = useQuery({ queryKey: tablesKeys.members(baseId ?? 0), queryFn: () => tablesApi.members(baseId!), enabled: Boolean(baseId) });
  const everyone = useMemo(() => (people.data ? [{ id: people.data.owner.id, name: people.data.owner.name }, ...people.data.members.filter((m) => !m.pending && m.name && m.userId).map((m) => ({ id: m.userId!, name: m.name ?? "" }))] : []), [people.data]);
  const rows = comments.data?.pages.flatMap((p) => p.comments) ?? [];
  const [text, setText] = useState("");
  const [mentioned, setMentioned] = useState<{ id: number; name: string }[]>([]);
  const [editing, setEditing] = useState<TableComment | null>(null);
  const [menuFor, setMenuFor] = useState<TableComment | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const query = mentionQuery(text);
  const suggestions = query === null ? [] : everyone.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      if (editing) await tablesApi.editComment(editing.id, body);
      else await tablesApi.addComment(tableId, { body, recordId, mentionIds: mentionsIn(body, mentioned) });
      setText("");
      setMentioned([]);
      setEditing(null);
      await client.invalidateQueries({ queryKey: key });
    } catch (e) {
      setFailure(failureMessage(e, t("tables.activity.sendFailed")));
    } finally {
      setBusy(false);
    }
  };
  const remove = (c: TableComment) =>
    Alert.alert(t("tables.activity.deleteTitle"), t("tables.activity.deleteBody"), [
      { text: t("fields.cancel"), style: "cancel" },
      {
        text: t("tables.delete"),
        style: "destructive",
        onPress: () =>
          void tablesApi
            .deleteComment(c.id)
            .then(() => client.invalidateQueries({ queryKey: key }))
            .catch((e: unknown) => setFailure(failureMessage(e, t("tables.activity.deleteFailed")))),
      },
    ]);

  return (
    <KeyboardPadding>
      <View style={{ flex: 1 }}>
        <LoadFailure error={comments.error} loadFailed={t("tables.activity.loadFailed")} hasData={Boolean(comments.data)} updatedAt={comments.dataUpdatedAt} onRetry={() => void comments.refetch()} testID="tables-comments-failed" />
        <FlatList
          testID="tables-comments"
          data={rows}
          keyExtractor={(c) => String(c.id)}
          renderItem={({ item, index }) => (
            <Pressable
              testID={`tables-comment-${index}`}
              onLongPress={item.mine || item.canDelete ? () => setMenuFor(item) : undefined}
              accessibilityRole={item.mine || item.canDelete ? "button" : undefined}
              accessibilityHint={item.mine || item.canDelete ? t("tables.activity.commentHint") : undefined}
              style={{ paddingVertical: metrics.space.sm, gap: 2, borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <Text variant="label">
                {item.author?.name ?? t("tables.history.someone")}
                <Text tone="muted" variant="caption">
                  {"  "}
                  {relativeTime(item.createdAt)}
                  {item.editedAt ? ` · ${t("tables.activity.edited")}` : ""}
                </Text>
              </Text>
              <Text>{item.body}</Text>
              {item.files.map((f) => (
                <Text key={f.id} tone="accent" variant="caption">
                  📎 {f.filename}
                </Text>
              ))}
            </Pressable>
          )}
          ListEmptyComponent={comments.isPending ? <RowsSkeleton rows={3} testID="tables-comments-loading" /> : comments.data ? <Text tone="muted" testID="tables-comments-empty">{t("tables.activity.noComments")}</Text> : null}
          ListFooterComponent={
            comments.hasNextPage ? (
              <Pressable testID="tables-comments-older" onPress={() => void comments.fetchNextPage()} accessibilityRole="button" accessibilityLabel={t("tables.history.older")} style={{ padding: metrics.space.md, alignItems: "center" }}>
                <Text tone="accent" variant="label">
                  {t("tables.history.older")}
                </Text>
              </Pressable>
            ) : null
          }
        />
        {suggestions.length ? (
          <View testID="tables-mention-suggestions" style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs, paddingVertical: metrics.space.xs }}>
            {suggestions.map((p) => (
              <Pressable
                key={p.id}
                testID={`tables-mention-${p.id}`}
                onPress={() => {
                  setText((cur) => addMention(cur, p.name));
                  setMentioned((cur) => (cur.some((m) => m.id === p.id) ? cur : [...cur, p]));
                }}
                accessibilityRole="button"
                accessibilityLabel={t("tables.activity.mention", { name: p.name })}
                style={{ minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center", borderWidth: 1, borderColor: colors.accent }}
              >
                <Text variant="label">@{p.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {failure ? (
          <Text tone="danger" testID="tables-comment-failure" accessibilityLiveRegion="polite">
            {failure}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: metrics.space.sm, paddingVertical: metrics.space.sm }}>
          <TextInput
            testID="tables-comment-input"
            value={text}
            onChangeText={setText}
            multiline
            placeholder={editing ? t("tables.activity.editPlaceholder") : t("tables.activity.placeholder")}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t("tables.activity.placeholder")}
            style={{ flex: 1, minHeight: 44, maxHeight: 140, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, paddingVertical: metrics.space.sm, color: colors.ink, fontSize: 16, backgroundColor: colors.surface }}
          />
          <Pressable testID="tables-comment-send" onPress={() => void send()} disabled={!text.trim() || busy} accessibilityRole="button" accessibilityLabel={editing ? t("tables.activity.saveEdit") : t("tables.activity.send")} accessibilityState={{ disabled: !text.trim() || busy, busy }} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: text.trim() && !busy ? colors.accent : colors.border }}>
            <Send size={20} color={colors.onAccent} />
          </Pressable>
        </View>
        <ActionSheet
          open={menuFor !== null}
          title={menuFor?.body.slice(0, 60) ?? ""}
          actions={
            menuFor
              ? [
                  ...(menuFor.mine ? [{ key: "edit", label: t("tables.activity.edit"), icon: Pencil, onPress: () => { setEditing(menuFor); setText(menuFor.body); } }] : []),
                  ...(menuFor.canDelete ? [{ key: "delete", label: t("tables.activity.delete"), icon: Trash2, danger: true, onPress: () => remove(menuFor) }] : []),
                ]
              : []
          }
          onClose={() => setMenuFor(null)}
          testID="tables-comment-menu"
        />
      </View>
    </KeyboardPadding>
  );
}

function History({ tableId, recordId, canRestore }: { tableId: number; recordId?: number; canRestore: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const [kind, setKind] = useState<HistoryKind | "all">("all");
  const key = tablesKeys.history(tableId, recordId ?? 0, kind);
  const history = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => tablesApi.history(tableId, { recordId, kind: kind === "all" ? undefined : kind, before: pageParam || undefined }),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const items = history.data?.pages.flatMap((p) => p.items) ?? [];
  const restore = (fieldId: number) =>
    void tablesApi
      .restoreField(fieldId)
      .then(() => Promise.all([client.invalidateQueries({ queryKey: tablesKeys.table(tableId) }), client.invalidateQueries({ queryKey: tablesKeys.historyAll(tableId) })]))
      .catch((e: unknown) => Alert.alert(failureMessage(e, t("tables.history.restoreFailed"))));

  return (
    <View style={{ flex: 1 }}>
      {recordId ? null : (
        <View testID="tables-history-kinds" style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs, paddingBottom: metrics.space.xs }}>
          {(["all", ...HISTORY_KINDS] as const).map((k) => {
            const on = k === kind;
            return (
              <Pressable key={k} testID={`tables-history-kind-${k}`} onPress={() => setKind(k)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t(`tables.history.kinds.${k}`)} style={{ minHeight: 32, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center", borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.surface }}>
                <Text variant="caption" tone={on ? "onAccent" : "default"}>
                  {t(`tables.history.kinds.${k}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <LoadFailure error={history.error} loadFailed={t("tables.history.loadFailed")} hasData={Boolean(history.data)} updatedAt={history.dataUpdatedAt} onRetry={() => void history.refetch()} testID="tables-history-failed" />
      <FlatList
        testID="tables-history"
        data={items}
        keyExtractor={(h) => String(h.id)}
        renderItem={({ item, index }) => (
          <View testID={`tables-history-${index}`} style={{ paddingVertical: metrics.space.sm, gap: 2, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text>{historyLine(item, t)}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
              <Text tone="muted" variant="caption">
                {relativeTime(item.at)}
              </Text>
              {item.source === "assistant" || item.source === "import" ? (
                <Text variant="caption" tone="accent" testID={`tables-history-${index}-source`}>
                  {t(`tables.history.sources.${item.source}`)}
                </Text>
              ) : null}
              {item.restorable && canRestore && item.subjectId ? (
                <Pressable testID={`tables-history-${index}-restore`} onPress={() => restore(item.subjectId!)} accessibilityRole="button" accessibilityLabel={t("tables.history.restore")} style={{ minHeight: 32, justifyContent: "center" }}>
                  <Text tone="accent" variant="label">
                    {t("tables.history.restore")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={history.isPending ? <RowsSkeleton rows={4} testID="tables-history-loading" /> : history.data ? <Text tone="muted" testID="tables-history-empty">{t("tables.history.nothing")}</Text> : null}
        ListFooterComponent={
          history.hasNextPage ? (
            <Pressable testID="tables-history-older" onPress={() => void history.fetchNextPage()} accessibilityRole="button" accessibilityLabel={t("tables.history.older")} style={{ padding: metrics.space.md, alignItems: "center" }}>
              <Text tone="accent" variant="label">
                {t("tables.history.older")}
              </Text>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}
