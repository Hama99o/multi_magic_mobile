/**
 * ONE NOTE, read-only (phase 2). `docs/design/notes/SPEC.md` §C2.
 *
 * The body is the HTML the web stored; it is parsed with the same rules the
 * web editor uses (src/screens/notes/document.ts) and drawn natively by
 * NoteDocument. Editing is `edit.tsx` (phase 3), reached by the pencil when
 * NOTES_EDITOR_ENABLED is on and the reader may edit.
 *
 * Re-read on open (`GET /note_app/notes/:id`) so the body is current, not the
 * list's copy.
 */
import { useMemo, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useNav, useNavParams } from "@/lib/nav";
import { useTranslation } from "react-i18next";

import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { ChevronLeft, Pencil } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { canEdit, canShare } from "@/api/notes";
import { useDestroyNoteForever, useNote, useRestoreNote } from "@/screens/notes/api/queries";
import { NoteLinksChip } from "@/screens/notes/NoteLinks";
import RotateCcwIcon from "lucide-react-native/dist/esm/icons/rotate-ccw";
import Flame from "lucide-react-native/dist/esm/icons/flame";
import { NOTES_EDITOR_ENABLED } from "@/config/features";
import { failureMessage } from "@/api/failure";
import { NoteDocument } from "@/screens/notes/editor/NoteDocument";
import { openReadViewLink, useEditorLabels } from "@/screens/notes/readView";
import { parseNoteHtml } from "@/screens/notes/document";

export default function NoteScreen() {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const params = useNavParams<{ id?: string }>();
  const noteId = Number(params.id) || 0;

  const { data: note, error, refetch, isPending } = useNote(noteId);

  const parsed = useMemo(() => (note ? parseNoteHtml(note.html) : null), [note]);

  const labels = useEditorLabels();
  const restore = useRestoreNote();
  const destroyForever = useDestroyNoteForever();
  // The trash opens here (the grid sends it to the read view, as the web
  // does), so the trash's two actions are here too (web Show.tsx:313-325).
  // Who may: the owner or an administrator (note_policy#restore?, #destroy_permanently?).
  const trashed = note?.status === "trashed";
  const canTrashAct = trashed && note !== undefined && canShare(note);
  const failed = () => Alert.alert(t("notes.grid.actionFailed"));
  const confirmForever = () =>
    Alert.alert(t("notes.views.foreverTitle", { count: 1 }), t("notes.views.foreverBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("notes.views.deleteForever"),
        style: "destructive",
        onPress: () => {
          void destroyForever.mutateAsync({ id: noteId }).then(() => router.back(), failed);
        },
      },
    ]);
  const key = (testID: string, label: string, onPress: () => void, icon: ReactNode) => (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
    >
      {icon}
    </Pressable>
  );

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: metrics.space.sm }}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
        hitSlop={8}
        style={{ width: metrics.touch, height: metrics.touch, justifyContent: "center" }}
      >
        <ChevronLeft size={24} color={colors.ink} />
      </Pressable>
      <View style={{ flex: 1 }} />
      {canTrashAct
        ? key("note-restore", t("notes.views.restore"), () => void restore.mutateAsync({ id: noteId }).catch(failed), <RotateCcwIcon size={22} color={colors.ink} />)
        : null}
      {canTrashAct ? key("note-forever", t("notes.views.deleteForever"), confirmForever, <Flame size={22} color={colors.danger} />) : null}
      {note && !trashed && NOTES_EDITOR_ENABLED && canEdit(note) ? (
        <Pressable
          testID="note-edit"
          onPress={() => router.push({ pathname: "/notes/edit", params: { id: String(noteId) } })}
          accessibilityRole="button"
          accessibilityLabel={t("notes.edit.open")}
          hitSlop={8}
          style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
        >
          <Pencil size={22} color={colors.ink} />
        </Pressable>
      ) : null}
    </View>
  );

  if (!note || !parsed) {
    return (
      <Screen>
        {header}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: metrics.space.lg }}>
          {error || noteId === 0 ? (
            <>
              <Text testID="note-load-failed" tone="muted" style={{ textAlign: "center" }}>
                {failureMessage(error, t("notes.loadFailed"))}
              </Text>
              {noteId > 0 ? <Button label={t("common.tryAgain")} block={false} onPress={() => void refetch()} /> : null}
            </>
          ) : isPending ? (
            <ActivityIndicator testID="note-loading" color={colors.inkMuted} />
          ) : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <ScrollView testID="note-body" contentContainerStyle={{ paddingBottom: metrics.space.xl, gap: metrics.space.md }}>
        <Text testID="note-title" style={{ fontSize: 26, lineHeight: 32, fontWeight: "700", color: note.title ? colors.ink : colors.inkMuted }} accessibilityRole="header">
          {note.title || t("notes.untitled")}
        </Text>
        {trashed ? (
          <Text testID="note-trashed" tone="muted" style={{ fontSize: 13 }}>
            {t("notes.views.inTrash")}
          </Text>
        ) : null}
        <NoteLinksChip note={note} />
        <NoteDocument doc={parsed.doc} colors={colors} labels={labels} onLinkPress={openReadViewLink} />
      </ScrollView>
    </Screen>
  );
}
