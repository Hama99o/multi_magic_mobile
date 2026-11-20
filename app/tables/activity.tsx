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
import { Alert, FlatList, Linking, Pressable, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { tablesKeys } from "@/api/keys";
import { HISTORY_KINDS, tablesApi, type HistoryKind, type TableComment } from "@/api/tables";
import { failureMessage } from "@/api/failure";
import { FileText, Image as ImageIcon, Paperclip, Pencil, Send, Trash2, X } from "@/components/icons";
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
import { historyDays, historyLine } from "@/screens/tables/history";
import { addMention, mentionQuery, mentionsIn } from "@/screens/tables/mentions";
import { addCommentFiles, type CommentFile } from "@/screens/tables/commentFiles";
import { pickPhotos } from "@/screens/contacts/documents";
import { explainPick, pickDocuments, type PickResult } from "@/screens/pages/addFiles";
// iOS will not present a picker over a sheet still leaving (`ContactDocuments.tsx` waits the same).
import { SHEET_CLOSE_MS } from "@/screens/pages/drive/sheets";

type Tab = "comments" | "history";

/** The base's people with an account, by ACCOUNT id: who can be mentioned, and whose changes can be shown. */
function basePeople(data: { owner: { id: number; name: string }; members: { pending: boolean; name: string | null; userId: number | null }[] } | undefined) {
  if (!data) return [];
  return [{ id: data.owner.id, name: data.owner.name }, ...data.members.filter((m) => !m.pending && m.name && m.userId).map((m) => ({ id: m.userId!, name: m.name ?? "" }))];
}

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
        <History tableId={tableId} recordId={recordId} baseId={table.data?.baseId} canRestore={canEditRows(base?.role)} />
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
  const everyone = useMemo(() => basePeople(people.data), [people.data]);
  const rows = comments.data?.pages.flatMap((p) => p.comments) ?? [];
  const [text, setText] = useState("");
  const [mentioned, setMentioned] = useState<{ id: number; name: string }[]>([]);
  const [editing, setEditing] = useState<TableComment | null>(null);
  const [menuFor, setMenuFor] = useState<TableComment | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [files, setFiles] = useState<CommentFile[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const canSend = (Boolean(text.trim()) || (!editing && files.length > 0)) && !busy;
  const attach = async (pick: () => Promise<PickResult>) => {
    const picked = explainPick(await pick(), t);
    if (!picked) return;
    const out = addCommentFiles(files, picked);
    setFiles(out.files);
    if (out.refused.length) Alert.alert(t("tables.activity.refusedTitle"), out.refused.map((x) => t(`tables.activity.refused.${x.why}`, { name: x.name })).join("\n"));
  };
  const query = mentionQuery(text);
  const suggestions = query === null ? [] : everyone.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);

  const send = async () => {
    const body = text.trim();
    if (!canSend) return;
    setBusy(true);
    setFailure(null);
    try {
      if (editing) await tablesApi.editComment(editing.id, body);
      else await tablesApi.addComment(tableId, { body, recordId, mentionIds: mentionsIn(body, mentioned), files });
      setText("");
      setFiles([]);
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
              {item.body ? <Text>{item.body}</Text> : null}
              {item.files.map((f, i) => (
                <Pressable key={f.id} testID={`tables-comment-${index}-file-${i}`} disabled={!f.url} onPress={() => f.url && void Linking.openURL(f.url)} accessibilityRole="link" accessibilityLabel={t("tables.activity.openFile", { name: f.filename })} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs, minHeight: 32 }}>
                  {f.contentType?.startsWith("image/") ? <ImageIcon size={16} color={colors.accent} /> : <FileText size={16} color={colors.accent} />}
                  <Text tone="accent" variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {f.filename}
                  </Text>
                </Pressable>
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
        {files.length && !editing ? (
          <View testID="tables-comment-files" style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs, paddingTop: metrics.space.xs }}>
            {files.map((f, i) => (
              <View key={`${f.uri}-${i}`} style={{ flexDirection: "row", alignItems: "center", maxWidth: "100%", minHeight: 36, paddingLeft: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
                <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {f.name}
                </Text>
                <Pressable testID={`tables-comment-file-${i}-remove`} onPress={() => setFiles((cur) => cur.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={t("tables.activity.removeFile", { name: f.name })} hitSlop={6} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
                  <X size={16} color={colors.inkMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: metrics.space.sm, paddingVertical: metrics.space.sm }}>
          {editing ? null : (
            <Pressable testID="tables-comment-attach" onPress={() => setAttachOpen(true)} disabled={busy} accessibilityRole="button" accessibilityLabel={t("tables.activity.attach")} accessibilityHint={t("tables.activity.attachLimit")} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}>
              <Paperclip size={22} color={colors.inkMuted} />
            </Pressable>
          )}
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
          <Pressable testID="tables-comment-send" onPress={() => void send()} disabled={!canSend} accessibilityRole="button" accessibilityLabel={editing ? t("tables.activity.saveEdit") : t("tables.activity.send")} accessibilityState={{ disabled: !canSend, busy }} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: canSend ? colors.accent : colors.border }}>
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
        <ActionSheet
          open={attachOpen}
          title={t("tables.activity.attach")}
          actions={[
            { key: "photos", label: t("tables.activity.attachPhotos"), icon: ImageIcon, onPress: () => setTimeout(() => void attach(pickPhotos), SHEET_CLOSE_MS) },
            { key: "files", label: t("tables.activity.attachFiles"), icon: FileText, onPress: () => setTimeout(() => void attach(pickDocuments), SHEET_CLOSE_MS) },
          ]}
          onClose={() => setAttachOpen(false)}
          testID="tables-comment-attach-menu"
        />
      </View>
    </KeyboardPadding>
  );
}

function History({ tableId, recordId, baseId, canRestore }: { tableId: number; recordId?: number; baseId?: number; canRestore: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [kind, setKind] = useState<HistoryKind | "all">("all");
  // By person (the web's `HistoryFeed.tsx` picker, the server's `user_id`): offered once the base has two people.
  const [person, setPerson] = useState(0);
  const people = useQuery({ queryKey: tablesKeys.members(baseId ?? 0), queryFn: () => tablesApi.members(baseId!), enabled: Boolean(baseId) && !recordId });
  const everyone = useMemo(() => basePeople(people.data), [people.data]);
  const key = tablesKeys.history(tableId, recordId ?? 0, kind, person);
  const history = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => tablesApi.history(tableId, { recordId, kind: kind === "all" ? undefined : kind, userId: person || undefined, before: pageParam || undefined }),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const items = useMemo(() => history.data?.pages.flatMap((p) => p.items) ?? [], [history.data]);
  // Under "Today", "Yesterday" or the date (the web's HistoryFeed.tsx). A line keeps its own number in its testID.
  const entries = useMemo(() => {
    let n = 0;
    return historyDays(items, t, i18n.language).map((e) => (e.kind === "line" ? { ...e, n: n++ } : { ...e, n: -1 }));
  }, [items, t, i18n.language]);
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
      {recordId || everyone.length < 2 ? null : (
        <View testID="tables-history-people" accessibilityLabel={t("tables.history.person")} style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs, paddingBottom: metrics.space.xs }}>
          {[{ id: 0, name: t("tables.history.everyone") }, ...everyone].map((p) => {
            const on = p.id === person;
            return (
              <Pressable key={p.id} testID={`tables-history-person-${p.id}`} onPress={() => setPerson(p.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={p.id ? t("tables.history.byPerson", { name: p.name }) : p.name} style={{ minHeight: 32, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, justifyContent: "center", borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.surface }}>
                <Text variant="caption" tone={on ? "onAccent" : "default"} numberOfLines={1}>
                  {p.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <LoadFailure error={history.error} loadFailed={t("tables.history.loadFailed")} hasData={Boolean(history.data)} updatedAt={history.dataUpdatedAt} onRetry={() => void history.refetch()} testID="tables-history-failed" />
      <FlatList
        testID="tables-history"
        data={entries}
        keyExtractor={(e) => e.key}
        renderItem={({ item: entry }) => {
          if (entry.kind === "day")
            return (
              <Text variant="caption" tone="muted" accessibilityRole="header" testID={`tables-history-day-${entry.key}`} style={{ paddingTop: metrics.space.md, paddingBottom: metrics.space.xs, fontWeight: "600" }}>
                {entry.label}
              </Text>
            );
          const item = entry.item;
          const index = entry.n;
          return (
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
          );
        }}
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
