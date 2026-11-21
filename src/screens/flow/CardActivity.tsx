/**
 * A card's three lists under its properties (`CardDetailDrawer.tsx` tabs):
 * Comments, Linked notes, History.
 *
 * - Comments: author by NAME (the web shows an id), date, text. The author
 *   edits their own (the API has it, the web has no button); the author, the
 *   owner or an admin deletes, after a confirm (the web deletes on one click).
 * - Linked notes: search your notes, link one (already-linked ones are
 *   marked), open it in Notes, unlink.
 * - History: each event as a sentence ("moved from To Do to Done"), not the
 *   raw key the web prints, newest first, more on scroll.
 */
import { useEffect, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { ActivityIndicator, Alert, Keyboard, Pressable, TextInput, View } from "react-native";
import { useSubmitText } from "@/lib/useSubmitText";
import { useNav } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { flowKeys } from "@/api/keys";
import { flowApi, type Column, type Comment, type HistoryEntry, type Sprint } from "@/api/flow";
import { notesApi } from "@/api/notes";
import { failureMessage } from "@/api/failure";
import { BottomSheet } from "@/components/BottomSheet";
import { ChoiceRow } from "@/components/fields/FieldRow";
import { Copy, History, Link, NotebookPen, Pencil, Search, Send, Trash2, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { relativeTime } from "@/lib/relativeTime";
import { ActionSheet } from "@/screens/contacts/ActionSheet";
import type { FlowRole } from "@/api/flow";
import { canDeleteComment, canEditComment } from "./logic";
import { Avatar } from "./parts";
import { useDeleteComment, useEditComment, useLinkNote, useUnlinkNote } from "./useFlowMutations";

// ── Comments ─────────────────────────────────────────────────────────────

export function CommentsList({ projectId, cardId, role, meId, onError }: { projectId: number; cardId: number; role: FlowRole; meId: number | undefined; onError: (m: string) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [menuFor, setMenuFor] = useState<Comment | null>(null);
  const [editing, setEditing] = useState<Comment | null>(null);
  const comments = useQuery({ queryKey: flowKeys.comments(projectId, cardId), queryFn: () => flowApi.comments(projectId, cardId) });
  const remove = useDeleteComment(projectId, cardId, { onError: (e) => onError(failureMessage(e, t("flow.comments.failed"))) });

  if (comments.isPending) return <ActivityIndicator color={colors.inkMuted} style={{ marginVertical: metrics.space.lg }} />;
  if (comments.error) return <Retry error={comments.error} fallback={t("flow.comments.loadFailed")} onRetry={() => void comments.refetch()} />;
  const rows = comments.data ?? [];
  return (
    <View testID="flow-comments" style={{ gap: metrics.space.md }}>
      {rows.length === 0 ? (
        <Text tone="muted" testID="flow-comments-empty" style={{ paddingVertical: metrics.space.md }}>
          {t("flow.comments.none")}
        </Text>
      ) : null}
      {rows.map((c) => {
        return (
          <Pressable
            key={c.id}
            testID="flow-comment"
            // Copy lives in the menu, so every comment has one (a selectable Text would eat the long press).
            onLongPress={() => setMenuFor(c)}
            disabled={c.id < 0}
            accessibilityRole="button"
            accessibilityLabel={`${c.user.name}, ${relativeTime(c.createdAt)}: ${c.content}`}
            accessibilityHint={t("flow.comments.hint")}
            style={{ flexDirection: "row", gap: metrics.space.sm, opacity: c.id < 0 ? 0.6 : 1 }}
          >
            <Avatar name={c.user.name || "?"} size={32} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: metrics.space.sm }}>
                <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {c.user.name || t("flow.someone")}
                </Text>
                <Text variant="caption" tone="muted">
                  {c.id < 0 ? t("flow.comments.sending") : relativeTime(c.createdAt)}
                </Text>
              </View>
              <Text style={{ lineHeight: 22 }}>
                {c.content}
              </Text>
            </View>
          </Pressable>
        );
      })}
      <ActionSheet
        open={menuFor != null}
        title={t("flow.comments.title")}
        subtitle={menuFor?.content}
        onClose={() => setMenuFor(null)}
        testID="flow-comment-menu"
        actions={
          menuFor
            ? [
                { key: "copy", label: t("flow.comments.copy"), icon: Copy, onPress: () => void Clipboard.setStringAsync(menuFor.content) },
                ...(canEditComment(meId, menuFor) ? [{ key: "edit", label: t("flow.comments.edit"), icon: Pencil, onPress: () => setTimeout(() => setEditing(menuFor), 320) }] : []),
                ...(canDeleteComment(role, meId, menuFor)
                  ? [
                      {
                        key: "delete",
                        label: t("flow.delete"),
                        icon: Trash2,
                        danger: true,
                        onPress: () =>
                          Alert.alert(t("flow.comments.deleteTitle"), menuFor.content, [
                            { text: t("fields.cancel"), style: "cancel" },
                            { text: t("flow.delete"), style: "destructive", onPress: () => remove.mutate(menuFor.id) },
                          ]),
                      },
                    ]
                  : []),
              ]
            : []
        }
      />
      {editing ? <EditComment projectId={projectId} cardId={cardId} comment={editing} onClose={() => setEditing(null)} onError={onError} /> : null}
    </View>
  );
}

function EditComment({ projectId, cardId, comment, onClose, onError }: { projectId: number; cardId: number; comment: Comment; onClose: () => void; onError: (m: string) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const firstInput = useRef<TextInput>(null);
  const [text, setText] = useState(comment.content);
  const edit = useEditComment(projectId, cardId, { onError: (e) => onError(failureMessage(e, t("flow.comments.failed"))) });
  return (
    <BottomSheet focusRef={firstInput}
      open
      title={t("flow.comments.edit")}
      onClose={onClose}
      testID="flow-comment-edit"
      footer={
        <Pressable
          testID="flow-comment-edit-save"
          disabled={!text.trim()}
          onPress={() => {
            if (text.trim() !== comment.content) edit.mutate({ commentId: comment.id, content: text.trim() });
            onClose();
          }}
          accessibilityRole="button"
          style={{ minHeight: metrics.touch, borderRadius: metrics.radius.md, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", opacity: text.trim() ? 1 : 0.5 }}
        >
          <Text variant="label" tone="onAccent">
            {t("fields.save")}
          </Text>
        </Pressable>
      }
    >
      <TextInput ref={firstInput} testID="flow-comment-edit-input" value={text} onChangeText={setText} multiline accessibilityLabel={t("flow.comments.edit")} style={{ minHeight: 100, textAlignVertical: "top", color: colors.ink, fontSize: 16, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, padding: metrics.space.md, backgroundColor: colors.surface }} />
    </BottomSheet>
  );
}

/** The comment box, pinned under the card (Todoist, Mobbin `131fe373`). Viewers comment too. */
export function CommentComposer({ onSend, busy }: { onSend: (text: string) => void; busy: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const text = useSubmitText();
  // Once per tap (`useSubmitText`), and the keyboard goes down so the comment
  // just sent is in view: it landed under the keyboard (device, 2026-11-20).
  const send = () => {
    const v = text.take();
    if (!v) return;
    onSend(v);
    Keyboard.dismiss();
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: metrics.space.sm, paddingVertical: metrics.space.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.ground }}>
      <TextInput
        testID="flow-comment-input"
        value={text.value}
        onChangeText={text.onChangeText}
        multiline
        placeholder={t("flow.comments.placeholder")}
        placeholderTextColor={colors.inkMuted}
        accessibilityLabel={t("flow.comments.placeholder")}
        style={{ flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: metrics.space.md, paddingVertical: 10, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.ink, fontSize: 16 }}
      />
      <Pressable testID="flow-comment-send" onPress={send} disabled={!text.value.trim() || busy} accessibilityRole="button" accessibilityLabel={t("flow.comments.send")} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", opacity: text.value.trim() ? 1 : 0.4 }}>
        <Send size={20} color={colors.onAccent} />
      </Pressable>
    </View>
  );
}

// ── Linked notes ─────────────────────────────────────────────────────────

export function NotesList({ projectId, cardId, canLink, onError }: { projectId: number; cardId: number; canLink: boolean; onError: (m: string) => void }) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [picking, setPicking] = useState(false);
  const links = useQuery({ queryKey: flowKeys.noteLinks(projectId, cardId), queryFn: () => flowApi.noteLinks(projectId, cardId) });
  const unlink = useUnlinkNote(projectId, cardId, { onError: (e) => onError(failureMessage(e, t("flow.notes.failed"))) });

  if (links.isPending) return <ActivityIndicator color={colors.inkMuted} style={{ marginVertical: metrics.space.lg }} />;
  if (links.error) return <Retry error={links.error} fallback={t("flow.notes.loadFailed")} onRetry={() => void links.refetch()} />;
  const rows = links.data ?? [];
  return (
    <View testID="flow-notes" style={{ gap: metrics.space.xs }}>
      {rows.length === 0 ? (
        <Text tone="muted" testID="flow-notes-empty" style={{ paddingVertical: metrics.space.md }}>
          {t("flow.notes.none")}
        </Text>
      ) : null}
      {rows.map((l) => (
        <View key={l.id} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 56 }}>
          <Pressable
            testID="flow-note-link"
            onPress={() => router.push({ pathname: "/notes/edit", params: { id: String(l.noteId) } })}
            accessibilityRole="link"
            accessibilityLabel={t("flow.notes.open", { title: l.title || t("flow.notes.untitled") })}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: metrics.space.md }}
          >
            <NotebookPen size={20} color={colors.inkMuted} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1}>{l.title || t("flow.notes.untitled")}</Text>
              {l.createdAt ? (
                <Text variant="caption" tone="muted">
                  {new Date(l.createdAt).toLocaleDateString(i18n.language)}
                </Text>
              ) : null}
            </View>
          </Pressable>
          {canLink ? (
            <Pressable testID="flow-note-unlink" onPress={() => unlink.mutate(l.id)} accessibilityRole="button" accessibilityLabel={t("flow.notes.unlink", { title: l.title })} hitSlop={6} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <X size={18} color={colors.inkMuted} />
            </Pressable>
          ) : null}
        </View>
      ))}
      {canLink ? (
        <Pressable testID="flow-notes-link" onPress={() => setPicking(true)} accessibilityRole="button" accessibilityLabel={t("flow.notes.link")} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 }}>
          <Link size={18} color={colors.accent} />
          <Text tone="accent" variant="label">
            {t("flow.notes.link")}
          </Text>
        </Pressable>
      ) : null}
      {picking ? <NotePicker projectId={projectId} cardId={cardId} linked={rows.map((r) => r.noteId)} onClose={() => setPicking(false)} onError={onError} /> : null}
    </View>
  );
}

function NotePicker({ projectId, cardId, linked, onClose, onError }: { projectId: number; cardId: number; linked: number[]; onClose: () => void; onError: (m: string) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const firstInput = useRef<TextInput>(null);
  const [typed, setTyped] = useState("");
  const [term, setTerm] = useState("");
  const link = useLinkNote(projectId, cardId, { onError: (e) => onError(failureMessage(e, t("flow.notes.failed"))) });
  useEffect(() => {
    const id = setTimeout(() => setTerm(typed.trim()), 300);
    return () => clearTimeout(id);
  }, [typed]);
  const notes = useQuery({ queryKey: flowKeys.noteSearch(term), queryFn: () => notesApi.list(1, term || undefined) });
  return (
    <BottomSheet focusRef={firstInput} open title={t("flow.notes.link")} onClose={onClose} testID="flow-note-picker" tall>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, backgroundColor: colors.surface, marginBottom: metrics.space.sm }}>
        <Search size={18} color={colors.inkMuted} />
        <TextInput ref={firstInput} testID="flow-note-search" value={typed} onChangeText={setTyped} placeholder={t("flow.notes.search")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("flow.notes.search")} style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }} />
      </View>
      {notes.isPending ? <ActivityIndicator color={colors.inkMuted} /> : null}
      {notes.error ? <Retry error={notes.error} fallback={t("flow.notes.loadFailed")} onRetry={() => void notes.refetch()} /> : null}
      {notes.data && notes.data.notes.length === 0 ? (
        <Text tone="muted" style={{ paddingVertical: metrics.space.md }}>
          {t("fields.noMatch")}
        </Text>
      ) : null}
      {(notes.data?.notes ?? []).map((n) => {
        const already = linked.includes(n.id);
        return (
          <ChoiceRow
            key={n.id}
            testID="flow-note-option"
            label={n.title || t("flow.notes.untitled")}
            selected={already}
            multi
            onPress={() => {
              if (already) return;
              link.mutate({ id: n.id, title: n.title });
              onClose();
            }}
          />
        );
      })}
    </BottomSheet>
  );
}

// ── History ──────────────────────────────────────────────────────────────

/** One history row as a sentence, naming columns and sprints the board knows. */
export function historySentence(entry: HistoryEntry, columns: Column[], sprints: Sprint[], t: (k: string, o?: Record<string, unknown>) => string): string {
  const col = (v: unknown) => columns.find((c) => c.id === v)?.title ?? t("flow.history.aColumn");
  const spr = (v: unknown) => (v == null ? t("flow.sprints.noSprint") : (sprints.find((s) => s.id === v)?.title ?? t("flow.history.aSprint")));
  const p = entry.payload;
  switch (entry.event) {
    case "created":
      return p.column_id != null ? t("flow.history.createdIn", { column: col(p.column_id) }) : t("flow.history.created");
    case "column_changed":
      return t("flow.history.moved", { from: col(p.from), to: col(p.to) });
    case "sprint_changed":
      return t("flow.history.sprint", { from: spr(p.from), to: spr(p.to) });
    case "commented":
      return t("flow.history.commented");
    case "field_updated":
      return typeof p.field === "string" || typeof p.name === "string" ? t("flow.history.fieldNamed", { field: String(p.field ?? p.name) }) : t("flow.history.field");
    default:
      return t("flow.history.other", { event: entry.rawEvent.replace(/_/g, " ") });
  }
}

export function HistoryList({ projectId, cardId, columns, sprints }: { projectId: number; cardId: number; columns: Column[]; sprints: Sprint[] }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const history = useInfiniteQuery({
    queryKey: flowKeys.history(projectId, cardId),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => flowApi.history(projectId, cardId, pageParam),
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
  if (history.isPending) return <ActivityIndicator color={colors.inkMuted} style={{ marginVertical: metrics.space.lg }} />;
  if (history.error) return <Retry error={history.error} fallback={t("flow.history.loadFailed")} onRetry={() => void history.refetch()} />;
  const rows = history.data?.pages.flatMap((p) => p.rows) ?? [];
  return (
    <View testID="flow-history" style={{ gap: metrics.space.md }}>
      {rows.length === 0 ? (
        <Text tone="muted" style={{ paddingVertical: metrics.space.md }}>
          {t("flow.history.none")}
        </Text>
      ) : null}
      {rows.map((h) => (
        <View key={h.id} testID="flow-history-row" style={{ flexDirection: "row", gap: metrics.space.sm }}>
          <View style={{ width: 32, alignItems: "center", paddingTop: 2 }}>
            <History size={16} color={colors.inkMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text>
              <Text style={{ fontWeight: "600" }}>{h.user?.name || t("flow.history.system")}</Text> {historySentence(h, columns, sprints, t)}
            </Text>
            <Text variant="caption" tone="muted">
              {relativeTime(h.createdAt)}
            </Text>
          </View>
        </View>
      ))}
      {history.hasNextPage ? (
        <Pressable testID="flow-history-more" onPress={() => void history.fetchNextPage()} disabled={history.isFetchingNextPage} accessibilityRole="button" accessibilityLabel={t("flow.history.more")} style={{ minHeight: 44, justifyContent: "center" }}>
          {history.isFetchingNextPage ? <ActivityIndicator color={colors.inkMuted} /> : <Text tone="accent" variant="label">{t("flow.history.more")}</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}

function Retry({ error, fallback, onRetry }: { error: unknown; fallback: string; onRetry: () => void }) {
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <Pressable onPress={onRetry} accessibilityRole="button" style={{ paddingVertical: metrics.space.md, gap: 4 }}>
      <Text tone="danger">{failureMessage(error, fallback)}</Text>
      <Text tone="accent" variant="label">
        {t("fields.retry")}
      </Text>
    </Pressable>
  );
}
