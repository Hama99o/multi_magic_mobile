/**
 * ONE NOTE, EDITED (phase 3, behind NOTES_EDITOR_ENABLED). SPEC §C2, §C11, §G2, §H.
 *
 *   server copy (+ a local draft) → openForEditing → engine B
 *   every engine change → saveFromEngine (codec, validate) → noteSaver
 *     (draft at once, server after 500 ms, conflicts asked, never overwritten)
 *
 * If B refuses the document, or a change cannot be turned back into HTML the
 * web loads, nothing is sent: the screen says so, keeps the text on the
 * phone, and offers the web (plan §11 condition 1).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createNativeEditorDocumentHandle, RichTextEditor } from "@apollohg/react-native-rich-text-editor";

import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { ChevronLeft, Globe } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { notesApi, type Note } from "@/api/notes";
import { failureMessage } from "@/api/failure";
import { noteDrafts } from "@/stores/noteDrafts.files";
import { decideOnOpen } from "@/stores/noteDrafts.store";
import { noteWebUrl } from "@/screens/notes/document";
import { NoteDocument } from "@/screens/notes/editor/NoteDocument";
import { ReadOnlyAtomProvider } from "@/screens/notes/editor/ReadOnlyAtom";
import { openForEditing, saveFromEngine, type EditSession } from "@/screens/notes/editor/editSession";
import { notesEngineAtoms, notesEngineSchema } from "@/screens/notes/editor/engineSchema";
import { engineTheme } from "@/screens/notes/editor/engineTheme";
import { createNoteSaver, type NoteSaver, type SaverState, type ServerNote } from "@/screens/notes/editor/noteSaver";
import type { DocNode, EditorLabels } from "@/screens/notes/editor/types";

interface Opened {
  title: string;
  html: string;
  base: ServerNote;
  restored: boolean;
  /** A draft to send at once (restored, or in conflict with the web). */
  resend: boolean;
}

const toServer = (n: Note): ServerNote => ({ title: n.title, html: n.html, updatedAt: n.updatedAt });

export default function NoteEditScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string }>();
  const noteId = Number(params.id) || 0;

  const { data: note, error, refetch } = useQuery({
    queryKey: ["notes", "note", noteId],
    queryFn: () => notesApi.get(noteId),
    enabled: noteId > 0,
  });

  // The server copy, or an unsent draft (SPEC §C11).
  const [opened, setOpened] = useState<Opened | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (!note || opened) return;
    let live = true;
    void noteDrafts.get(noteId).then((draft) => {
      if (!live) return;
      const server = toServer(note);
      const d = decideOnOpen(draft, server);
      if (d.kind === "server") {
        if (d.discardDraft) void noteDrafts.discard(noteId);
        setOpened({ title: note.title, html: note.html, base: server, restored: false, resend: false });
      } else {
        // conflict: base it on the version the draft came from, so the first save asks.
        const base = d.kind === "restore" ? server : { ...server, updatedAt: d.draft.baseUpdatedAt };
        setOpened({ title: d.draft.title, html: d.draft.html, base, restored: true, resend: true });
      }
    });
    return () => {
      live = false;
    };
  }, [note, noteId, opened]);

  const labels: EditorLabels = {
    viewOnWeb: t("notes.viewOnWeb"),
    table: (rows, cols) => t("notes.block.table", { rows, cols }),
    code: (language) => (language ? t("notes.block.codeIn", { language }) : t("notes.block.code")),
    legacyImage: t("notes.block.legacyImage"),
    embed: t("notes.block.embed"),
    unknown: (type) => t("notes.block.unknown", { type }),
    imageUnavailable: t("notes.block.imageUnavailable"),
    checked: t("notes.task.checked"),
    unchecked: t("notes.task.unchecked"),
  };
  const openWeb = (url?: string) => void Linking.openURL(url ?? noteWebUrl(noteId)).catch(() => undefined);
  const openLink = (href: string) => {
    if (/^(https?:|mailto:|tel:)/i.test(href)) openWeb(href);
  };

  // Codec session and engine handle, once per opened content.
  const engine = useMemo(() => {
    if (!opened) return null;
    let session: EditSession | null = null;
    try {
      session = openForEditing(opened.html);
      const handle = createNativeEditorDocumentHandle({
        initialization: { type: "localJson", json: session.engineDoc },
        schema: notesEngineSchema,
        policy: { allowBase64Images: true },
      } as never);
      return { session, handle, failed: false as const };
    } catch {
      return { session, handle: null, failed: true as const };
    }
  }, [opened, generation]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => engine?.handle?.destroy(), [engine]);

  // Autosave.
  const [state, setState] = useState<SaverState>({ kind: "saved" });
  const [cannotSave, setCannotSave] = useState(false);
  const title = useRef("");
  const html = useRef("");
  const saverRef = useRef<NoteSaver | null>(null);
  useEffect(() => {
    if (!opened) return;
    title.current = opened.title;
    html.current = opened.html;
    const saver = createNoteSaver({
      noteId,
      base: opened.base,
      api: {
        get: async (id) => toServer(await notesApi.get(id)),
        update: async (id, body, expected) => toServer(await notesApi.update(id, body, expected)),
        create: async (body) => {
          const made = await notesApi.create(body);
          return { id: made.id, ...toServer(made) };
        },
      },
      drafts: noteDrafts,
      locale: i18n.language,
      untitled: t("notes.untitled"),
      onState: setState,
    });
    saverRef.current = saver;
    if (opened.resend) saver.change({ title: opened.title, html: opened.html });
    return () => {
      void saver.flush().finally(() => {
        void queryClient.invalidateQueries({ queryKey: ["notes"] });
      });
      saver.dispose();
    };
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const push = () => saverRef.current?.change({ title: title.current, html: html.current });

  const onEngineChange = (json: unknown) => {
    if (!engine?.session) return;
    const out = saveFromEngine(json as DocNode, engine.session);
    if (!out.ok) {
      setCannotSave(true);
      return;
    }
    if (out.html === html.current) return;
    html.current = out.html;
    push();
  };

  // A web edit meanwhile: ask; "Keep both" first (the owner's default, §G2).
  useEffect(() => {
    if (state.kind !== "conflict") return;
    const pick = (choice: "both" | "mine" | "web") => async () => {
      const result = await saverRef.current?.resolve(choice);
      if (result?.reload) {
        queryClient.setQueryData(["notes", "note", noteId], (old: Note | undefined) => (old ? { ...old, ...result.reload } : old));
        setOpened({ title: result.reload.title, html: result.reload.html, base: result.reload, restored: false, resend: false });
        setGeneration((g) => g + 1);
      }
    };
    Alert.alert(t("notes.edit.conflict.title"), t("notes.edit.conflict.body"), [
      { text: t("notes.edit.conflict.both"), onPress: pick("both") },
      { text: t("notes.edit.conflict.mine"), onPress: pick("mine") },
      { text: t("notes.edit.conflict.web"), onPress: pick("web") },
    ], { cancelable: false });
  }, [state.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const stateLabels: Record<SaverState["kind"], string> = {
    saved: t("notes.edit.state.saved"),
    unsaved: t("notes.edit.state.unsaved"),
    saving: t("notes.edit.state.saving"),
    local: t("notes.edit.state.local"),
    conflict: t("notes.edit.state.conflict"),
  };
  const stateLabel = stateLabels[state.kind];

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: metrics.space.sm, gap: metrics.space.sm }}>
      <Pressable
        testID="note-edit-back"
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
        hitSlop={8}
        style={{ width: metrics.touch, height: metrics.touch, justifyContent: "center" }}
      >
        <ChevronLeft size={24} color={colors.ink} />
      </Pressable>
      <Text testID="note-edit-state" tone="muted" style={{ flex: 1, fontSize: 13 }} accessibilityLiveRegion="polite">
        {opened ? stateLabel : ""}
      </Text>
      <Pressable
        testID="note-edit-web"
        onPress={() => openWeb()}
        accessibilityRole="link"
        accessibilityLabel={t("notes.viewOnWeb")}
        hitSlop={8}
        style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
      >
        <Globe size={22} color={colors.ink} />
      </Pressable>
    </View>
  );

  if (!note || !opened || !engine) {
    return (
      <Screen>
        {header}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: metrics.space.lg }}>
          {error ? (
            <Text testID="note-load-failed" tone="muted" style={{ textAlign: "center" }} onPress={() => void refetch()}>
              {failureMessage(error, t("notes.loadFailed"))}
            </Text>
          ) : (
            <ActivityIndicator testID="note-loading" color={colors.inkMuted} />
          )}
        </View>
      </Screen>
    );
  }

  // B refused this document: the read view, and the web to edit (plan §11 condition 1).
  if (engine.failed || !engine.handle) {
    return (
      <Screen>
        {header}
        <ScrollView contentContainerStyle={{ paddingBottom: metrics.space.xl, gap: metrics.space.md }}>
          <Text testID="note-edit-cannot-open" tone="muted">{t("notes.edit.cannotOpen")}</Text>
          {engine.session ? (
            <NoteDocument doc={engine.session.doc} colors={colors} labels={labels} onLinkPress={openLink} onViewOnWeb={openWeb} />
          ) : null}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      {opened.restored ? (
        <Text testID="note-edit-restored" tone="muted" style={{ fontSize: 13 }}>{t("notes.edit.restored")}</Text>
      ) : null}
      {cannotSave ? (
        <Text testID="note-edit-cannot-save" style={{ color: colors.danger, fontSize: 13 }} onPress={() => openWeb()}>
          {t("notes.edit.cannotSave")}
        </Text>
      ) : null}
      <TextInput
        testID="note-edit-title"
        key={`title-${generation}`}
        defaultValue={opened.title}
        placeholder={t("notes.edit.titlePlaceholder")}
        placeholderTextColor={colors.inkMuted}
        onChangeText={(v) => {
          title.current = v;
          push();
        }}
        returnKeyType="next"
        style={{ fontSize: 26, lineHeight: 32, fontWeight: "700", color: colors.ink, paddingVertical: metrics.space.sm }}
        accessibilityLabel={t("notes.edit.titlePlaceholder")}
      />
      <ReadOnlyAtomProvider value={{ colors, labels, editOnWeb: t("notes.edit.editOnWeb"), onViewOnWeb: openWeb, onLinkPress: openLink }}>
        <View style={{ flex: 1 }} testID="note-edit-body">
          <RichTextEditor
            key={`body-${generation}`}
            documentHandle={engine.handle}
            atoms={notesEngineAtoms}
            theme={engineTheme(colors) as never}
            placeholder={t("notes.edit.bodyPlaceholder")}
            showToolbar
            toolbarPlacement="keyboard"
            heightBehavior="fixed"
            style={{ flex: 1 }}
            containerStyle={{ flex: 1 }}
            onContentChangeJSON={onEngineChange}
            accessibilityLabel={t("notes.edit.bodyPlaceholder")}
          />
        </View>
      </ReadOnlyAtomProvider>
    </Screen>
  );
}
