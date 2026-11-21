/**
 * A CARD (`docs/design/flow/SPEC.md` §D): the web's drawer and full page
 * (`CardDetailDrawer.tsx`, `CardShow.tsx`) as one scroll.
 *
 * Title (tap to edit); the properties as ClickUp's rows (Mobbin `84eb5561`):
 * column, sprint, creator, then every custom field through the shared
 * `FieldRow` (the 13 types, saved as they change); the description, read as
 * rich text and edited in the Notes editor; then Comments, Linked notes and
 * History, with the comment box pinned at the bottom.
 *
 * A viewer reads it all and comments; nothing else is offered. Leaving with
 * a title half edited asks first (the web's unsaved-changes guard).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { useNavigation } from "expo-router";
import { useNav, useNavParams } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { flowKeys } from "@/api/keys";
import { flowApi, type Card } from "@/api/flow";
import { failureMessage } from "@/api/failure";
import type { FieldDefinition, RecordOption } from "@/api/fields";
import { FieldRow, ChoiceRow } from "@/components/fields/FieldRow";
import { useFieldWrites } from "@/components/fields/useFieldWrites";
import { BottomSheet } from "@/components/BottomSheet";
import { ArrowRightLeft, CircleDot, Columns3, Ellipsis, Kanban, Pencil, Sparkles, Trash2 } from "@/components/icons";
import { RichText } from "@/components/RichText";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useMe } from "@/hooks/useMe";
import { relativeTime } from "@/lib/relativeTime";
import { useRichTextSession } from "@/stores/richTextSession.store";
import { ActionSheet } from "@/screens/contacts/ActionSheet";
import { CommentComposer, CommentsList, HistoryList, NotesList } from "@/screens/flow/CardActivity";
import { MoveSheet } from "@/screens/flow/MoveSheet";
import { canDeleteCard, colorHex, powersOf, roleIn } from "@/screens/flow/logic";
import { EmptyState, Segmented } from "@/screens/flow/parts";
import { useAsk } from "@/screens/flow/useAsk";
import { cardFieldTarget, useAddComment, useDeleteCard, useMoveCard, useUpdateCard } from "@/screens/flow/useFlowMutations";

type Tab = "comments" | "notes" | "history";

export default function CardScreen() {
  const params = useNavParams<{ projectId?: string; id?: string }>();
  const projectId = Number(params.projectId);
  const cardId = Number(params.id);
  const { t } = useTranslation();
  if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(cardId) || cardId <= 0) {
    return (
      <Screen measure header={<AppHeader app="flow" back />}>
        <EmptyState testID="flow-card-bad-link" icon={Kanban} title={t("flow.card.notFound")} />
      </Screen>
    );
  }
  return <CardView projectId={projectId} cardId={cardId} />;
}

/**
 * The board's parts a card needs (columns, sprints, fields, people, labels,
 * the role): from the board already in the cache when the card was opened
 * from it, else its first page (a link, a notification).
 */
function useBoardParts(projectId: number) {
  return useInfiniteQuery({
    queryKey: flowKeys.board(projectId, "all"),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => flowApi.board(projectId, "all", pageParam),
    getNextPageParam: (last) => last.paging.nextPage ?? undefined,
    staleTime: 30_000,
  });
}

function CardView({ projectId, cardId }: { projectId: number; cardId: number }) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const me = useMe();
  const ask = useAsk();
  const [tab, setTab] = useState<Tab>("comments");
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [sheet, setSheet] = useState<"menu" | "move" | "column" | "sprint" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const leaving = useRef(false);

  const board = useBoardParts(projectId);
  const parts = board.data?.pages[0];
  const card = useQuery({
    queryKey: flowKeys.card(projectId, cardId),
    queryFn: () => flowApi.card(projectId, cardId),
    // What the board already holds shows at once; the card's own answer replaces it.
    placeholderData: () => board.data?.pages.flatMap((p) => p.cards).find((c) => c.id === cardId),
  });
  const c: Card | undefined = card.data;

  const role = parts ? roleIn(parts.project, me?.id) : "viewer";
  const powers = powersOf(role);
  const fields = parts?.fields ?? [];
  const columns = useMemo(() => [...(parts?.columns ?? [])].sort((a, b) => a.position - b.position), [parts?.columns]);
  const sprints = parts?.sprints ?? [];
  const fail = (fallback: string) => (e: unknown) => setNote(failureMessage(e, fallback));

  const update = useUpdateCard(projectId, cardId, { onError: fail(t("flow.card.saveFailed")) });
  const move = useMoveCard(projectId, { onError: fail(t("flow.board.moveFailed")) });
  const remove = useDeleteCard(projectId, {
    onDone: () => {
      leaving.current = true;
      router.back();
    },
    onError: fail(t("flow.card.deleteFailed")),
  });
  const comment = useAddComment(projectId, cardId, { id: me?.id ?? 0, name: me?.fullName || me?.email || "" }, { onError: fail(t("flow.comments.failed")) });
  const writes = useFieldWrites(cardFieldTarget(projectId, cardId), fail(t("flow.card.saveFailed")));

  const known = useMemo(
    () =>
      (field: FieldDefinition): RecordOption[] => {
        switch (field.recordClass) {
          case "User":
            return (parts?.people ?? []).map((p) => ({ id: p.id, label: p.name || `#${p.id}`, color: null }));
          case "Core::Tag":
            return (field.tagCategoryId ? (parts?.tagsByCategory[field.tagCategoryId] ?? []) : []).map((tag) => ({ id: tag.id, label: tag.label, color: tag.color }));
          case "FlowApp::Sprint":
            return (parts?.sprints ?? []).map((s) => ({ id: s.id, label: s.title, color: null }));
          case "FlowApp::Card":
            return (board.data?.pages.flatMap((p) => p.cards) ?? []).map((x) => ({ id: x.id, label: x.title, color: null }));
          default:
            return [];
        }
      },
    [parts, board.data],
  );

  const titleDirty = editingTitle && c != null && title.trim() !== c.title;
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (leaving.current || !titleDirty) return;
      e.preventDefault();
      Alert.alert(t("flow.card.unsavedTitle"), t("flow.card.unsavedBody"), [
        { text: t("flow.card.keepEditing"), style: "cancel" },
        {
          text: t("flow.card.discard"),
          style: "destructive",
          onPress: () => {
            leaving.current = true;
            navigation.dispatch(e.data.action);
          },
        },
        {
          text: t("fields.save"),
          onPress: () => {
            const leave = () => {
              leaving.current = true;
              navigation.dispatch(e.data.action);
            };
            // Leave only once the save has landed: leaving first lost both
            // the title (rolled back) and the failure note, on an unmounted
            // screen (review FL3). A refused save stays here and says so.
            if (title.trim()) update.mutate({ title: title.trim() }, { onSuccess: leave });
            else leave();
          },
        },
      ]);
    });
    return unsubscribe;
  }, [navigation, titleDirty, title, t, update]);

  const saveTitle = () => {
    if (!c) return;
    const v = title.trim();
    if (!v) return;
    if (v !== c.title) update.mutate({ title: v });
    setEditingTitle(false);
  };

  const editDescription = () => {
    if (!c) return;
    useRichTextSession.getState().start({ html: c.description ?? "", title: t("flow.card.description"), onDone: (html) => update.mutate({ description: html.trim() ? html : null }) });
    router.push("/rich-text");
  };

  const confirmDelete = () =>
    c &&
    Alert.alert(t("flow.card.deleteTitle", { title: c.title }), t("flow.card.deleteBody"), [
      { text: t("fields.cancel"), style: "cancel" },
      { text: t("flow.delete"), style: "destructive", onPress: () => remove.mutate(c) },
    ]);

  const column = columns.find((x) => x.id === c?.columnId);
  const sprint = sprints.find((s) => s.id === c?.sprintId);

  if (card.isPending && !c) {
    return (
      <Screen measure header={<AppHeader app="flow" back title={parts?.project.title} />}>
        <RowsSkeleton rows={6} testID="flow-card-loading" />
      </Screen>
    );
  }
  if (!c) {
    return (
      <Screen measure header={<AppHeader app="flow" back title={parts?.project.title} />}>
        <LoadFailure error={card.error} loadFailed={t("flow.card.loadFailed")} hasData={false} updatedAt={0} onRetry={() => void card.refetch()} testID="flow-card-failed" />
      </Screen>
    );
  }

  return (
    <Screen measure avoidKeyboard header={<AppHeader app="flow" back title={parts?.project.title ?? t("flow.title")} />}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: metrics.space.xl }} testID="flow-card">
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: metrics.space.sm, marginTop: metrics.space.xs }}>
          {editingTitle ? (
            <View style={{ flex: 1, gap: metrics.space.sm }}>
              <TextInput
                testID="flow-card-title-input"
                value={title}
                onChangeText={setTitle}
                autoFocus
                multiline
                submitBehavior="submit"
                returnKeyType="done"
                onSubmitEditing={saveTitle}
                accessibilityLabel={t("flow.card.title")}
                style={{ fontSize: 22, lineHeight: 28, fontWeight: "700", color: colors.ink, borderWidth: 1, borderColor: title.trim() ? colors.accent : colors.danger, borderRadius: metrics.radius.md, padding: metrics.space.sm }}
              />
              {!title.trim() ? (
                <Text tone="danger" variant="caption" accessibilityLiveRegion="polite">
                  {t("flow.card.titleRequired")}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: metrics.space.sm, justifyContent: "flex-end" }}>
                <Pressable testID="flow-card-title-cancel" onPress={() => setEditingTitle(false)} accessibilityRole="button" style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: metrics.space.md }}>
                  <Text variant="label" tone="muted">
                    {t("fields.cancel")}
                  </Text>
                </Pressable>
                <Pressable testID="flow-card-title-save" onPress={saveTitle} disabled={!title.trim()} accessibilityRole="button" style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: metrics.space.lg, borderRadius: metrics.radius.sm, backgroundColor: colors.accent, opacity: title.trim() ? 1 : 0.5 }}>
                  <Text variant="label" tone="onAccent">
                    {t("fields.save")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              testID="flow-card-title"
              style={{ flex: 1 }}
              disabled={!powers.editCards}
              onPress={() => {
                setTitle(c.title);
                setEditingTitle(true);
              }}
              accessibilityRole={powers.editCards ? "button" : "header"}
              accessibilityLabel={c.title}
              accessibilityHint={powers.editCards ? t("flow.card.editTitleHint") : undefined}
            >
              <Text variant="title" style={{ fontSize: 22, lineHeight: 28 }}>
                {c.title}
              </Text>
            </Pressable>
          )}
          <Pressable testID="flow-card-menu-button" onPress={() => setSheet("menu")} accessibilityRole="button" accessibilityLabel={t("flow.card.options")} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Ellipsis size={22} color={colors.ink} />
          </Pressable>
        </View>
        {note ? (
          <Pressable testID="flow-card-note" onPress={() => setNote(null)} accessibilityRole="button" accessibilityLiveRegion="polite" style={{ marginTop: metrics.space.sm }}>
            <Text tone="danger">{note}</Text>
          </Pressable>
        ) : null}

        {/* Properties */}
        <View style={{ marginTop: metrics.space.md, padding: metrics.space.md, borderRadius: metrics.radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <PropertyRow testID="flow-card-column" icon={Columns3} label={t("flow.card.column")} value={column?.title ?? "—"} dot={colorHex(column?.color) ?? undefined} onPress={powers.editCards ? () => setSheet("column") : undefined} />
          <PropertyRow testID="flow-card-sprint" icon={CircleDot} label={t("flow.card.sprint")} value={sprint?.title ?? t("flow.sprints.noSprint")} onPress={powers.editCards ? () => setSheet("sprint") : undefined} />
          {fields.map((f) => (
            <FieldRow key={f.id} testID={`flow-field-${f.key}`} field={f} value={c.fieldValues[f.id]} editable={powers.editCards} writes={writes} known={known} onError={setNote} />
          ))}
          {!parts && board.isPending ? <ActivityIndicator color={colors.inkMuted} style={{ marginTop: metrics.space.sm }} /> : null}
        </View>

        {/* Description */}
        <View style={{ marginTop: metrics.space.lg, gap: metrics.space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text variant="label" accessibilityRole="header" style={{ flex: 1, fontSize: 16 }}>
              {t("flow.card.description")}
            </Text>
            {powers.editCards && c.description ? (
              <Pressable testID="flow-card-description-edit" onPress={editDescription} accessibilityRole="button" accessibilityLabel={t("flow.card.editDescription")} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <Pencil size={18} color={colors.inkMuted} />
              </Pressable>
            ) : null}
          </View>
          {c.description ? (
            <RichText value={c.description} testID="flow-card-description" />
          ) : powers.editCards ? (
            <Pressable testID="flow-card-description-add" onPress={editDescription} accessibilityRole="button" style={{ minHeight: 64, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: metrics.radius.md, padding: metrics.space.md, justifyContent: "center" }}>
              <Text tone="muted">{t("flow.card.addDescription")}</Text>
            </Pressable>
          ) : (
            <Text tone="muted">{t("flow.card.noDescription")}</Text>
          )}
        </View>

        {/* Activity */}
        <View style={{ marginTop: metrics.space.lg, gap: metrics.space.md }}>
          <Segmented
            testID="flow-card-tabs"
            value={tab}
            onChange={setTab}
            options={[
              { value: "comments", label: c.commentsCount ? t("flow.comments.tabCount", { count: c.commentsCount }) : t("flow.comments.tab") },
              { value: "notes", label: t("flow.notes.tab") },
              { value: "history", label: t("flow.history.tab") },
            ]}
          />
          {tab === "comments" ? <CommentsList projectId={projectId} cardId={cardId} role={role} meId={me?.id} onError={setNote} /> : null}
          {tab === "notes" ? <NotesList projectId={projectId} cardId={cardId} canLink={powers.comment} onError={setNote} /> : null}
          {tab === "history" ? <HistoryList projectId={projectId} cardId={cardId} columns={columns} sprints={sprints} /> : null}
          {c.createdAt ? (
            <Text variant="caption" tone="muted" style={{ textAlign: "center", marginTop: metrics.space.sm }}>
              {t("flow.card.createdBy", { name: c.creator.name || t("flow.someone"), when: relativeTime(c.createdAt) })}
            </Text>
          ) : null}
        </View>
      </ScrollView>
      {tab === "comments" ? <CommentComposer busy={false} onSend={(text) => comment.mutate(text)} /> : null}

      <ActionSheet
        open={sheet === "menu"}
        title={c.title}
        onClose={() => setSheet(null)}
        testID="flow-card-options"
        actions={[
          ...(powers.editCards ? [{ key: "move", label: t("flow.move.title"), icon: ArrowRightLeft, onPress: () => setTimeout(() => setSheet("move"), 320) }] : []),
          { key: "board", label: t("flow.card.openBoard"), icon: Kanban, onPress: () => router.push({ pathname: "/flow/board", params: { id: String(projectId) } }) },
          { key: "ask", label: t("flow.card.ask"), icon: Sparkles, onPress: () => ask(t("flow.card.askPrompt", { title: c.title, project: parts?.project.title ?? "" })) },
          ...(canDeleteCard(role, me?.id, c) ? [{ key: "delete", label: t("flow.card.delete"), icon: Trash2, danger: true, onPress: confirmDelete }] : []),
        ]}
      />
      {sheet === "move" ? (
        <MoveSheet
          card={c}
          columns={columns}
          sprints={sprints}
          onClose={() => setSheet(null)}
          onMove={(to) => {
            const count = (board.data?.pages.flatMap((p) => p.cards) ?? []).filter((x) => x.columnId === to.columnId && x.id !== c.id).length;
            move.mutate({ card: c, toColumn: to.columnId, index: to.where === "top" ? 0 : count, sprintId: to.sprintId });
          }}
        />
      ) : null}
      {sheet === "column" ? (
        <BottomSheet open title={t("flow.card.column")} onClose={() => setSheet(null)} testID="flow-card-column-sheet">
          {columns.map((col) => (
            <ChoiceRow
              key={col.id}
              testID={`flow-card-column-${col.position}`}
              label={col.title}
              color={colorHex(col.color)}
              selected={col.id === c.columnId}
              multi={false}
              onPress={() => {
                if (col.id !== c.columnId) move.mutate({ card: c, toColumn: col.id, index: 0 });
                setSheet(null);
              }}
            />
          ))}
        </BottomSheet>
      ) : null}
      {sheet === "sprint" ? (
        <BottomSheet open title={t("flow.card.sprint")} onClose={() => setSheet(null)} testID="flow-card-sprint-sheet">
          <ChoiceRow testID="flow-card-sprint-none" label={t("flow.sprints.noSprint")} selected={c.sprintId == null} multi={false} onPress={() => {
              update.mutate({ sprintId: null });
              setSheet(null);
            }} />
          {sprints.map((s) => (
            <ChoiceRow key={s.id} testID="flow-card-sprint-option" label={s.title} selected={s.id === c.sprintId} multi={false} onPress={() => {
                update.mutate({ sprintId: s.id });
                setSheet(null);
              }} />
          ))}
        </BottomSheet>
      ) : null}
    </Screen>
  );
}

function PropertyRow({ icon: Icon, label, value, dot, onPress, testID }: { icon: typeof Columns3; label: string; value: string; dot?: string; onPress?: () => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={onPress ? t("fields.editHint") : undefined}
      style={{ flexDirection: "row", alignItems: "center", minHeight: metrics.touch, gap: metrics.space.md, paddingVertical: metrics.space.xs }}
    >
      <Icon size={18} color={colors.inkMuted} />
      <Text variant="label" tone="muted" style={{ width: "34%", fontWeight: "500" }}>
        {label}
      </Text>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
        {dot ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} /> : null}
        <Text numberOfLines={1} style={{ flexShrink: 1 }}>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}
