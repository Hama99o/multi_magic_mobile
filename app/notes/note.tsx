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
import { useMemo } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { ChevronLeft, Pencil } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { canEdit, notesApi } from "@/api/notes";
import { NOTES_EDITOR_ENABLED } from "@/config/features";
import { failureMessage } from "@/api/failure";
import { NoteDocument } from "@/screens/notes/editor/NoteDocument";
import type { EditorLabels } from "@/screens/notes/editor/types";
import { parseNoteHtml } from "@/screens/notes/document";

export default function NoteScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const noteId = Number(params.id) || 0;

  const { data: note, error, refetch, isPending } = useQuery({
    queryKey: ["notes", "note", noteId],
    queryFn: () => notesApi.get(noteId),
    enabled: noteId > 0,
  });

  const parsed = useMemo(() => (note ? parseNoteHtml(note.html) : null), [note]);

  const labels: EditorLabels = {
    table: (rows, cols) => t("notes.block.table", { rows, cols }),
    code: (language) => (language ? t("notes.block.codeIn", { language }) : t("notes.block.code")),
    legacyImage: t("notes.block.legacyImage"),
    embed: t("notes.block.embed"),
    unknown: (type) => t("notes.block.unknown", { type }),
    imageUnavailable: t("notes.block.imageUnavailable"),
    checked: t("notes.task.checked"),
    unchecked: t("notes.task.unchecked"),
  };

  // Links in the note: only what the phone can open (a relative web link has no host here).
  const openLink = (href: string) => {
    if (/^(https?:|mailto:|tel:)/i.test(href)) void Linking.openURL(href).catch(() => undefined);
  };

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
      {note && NOTES_EDITOR_ENABLED && canEdit(note) ? (
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
        <NoteDocument doc={parsed.doc} colors={colors} labels={labels} onLinkPress={openLink} />
      </ScrollView>
    </Screen>
  );
}
