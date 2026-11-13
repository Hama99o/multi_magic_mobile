/**
 * ONE NOTE, EDITED (phase 3, behind NOTES_EDITOR_ENABLED). SPEC §C2, §C11, §G2, §H.
 *
 *   server copy (+ a local draft) → openForEditing → engine B
 *   every engine change → saveFromEngine (codec, validate) → noteSaver
 *     (draft at once, server after 500 ms, conflicts asked, never overwritten)
 *
 * If B refuses the document, or a change cannot be turned back into HTML the
 * web loads, nothing is sent: the screen says so and keeps the text on the
 * phone (plan §11 condition 1). No web link anywhere (owner, 2026-11-13).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, Share, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { createNativeEditorDocumentHandle, RichTextEditor, type RichTextEditorRef } from "@apollohg/react-native-rich-text-editor";

import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { KeyboardPadding } from "@/components/KeyboardPadding";
import { ChevronLeft, Copy, Pin, Share2, Trash2 } from "@/components/icons";
import TagIcon from "lucide-react-native/dist/esm/icons/tag";
import ArchiveIcon from "lucide-react-native/dist/esm/icons/archive";
import BellIcon from "lucide-react-native/dist/esm/icons/bell";
import LockIcon from "lucide-react-native/dist/esm/icons/lock";
import LockOpenIcon from "lucide-react-native/dist/esm/icons/lock-open";
import { ReminderSheet, reminderLabel } from "@/screens/notes/ReminderSheet";
import { ensureReminderPermission, resyncReminders } from "@/screens/notes/reminderNotifications";
import type { NoteReminder } from "@/screens/notes/reminders";
import { NoteLabelsSheet } from "@/screens/notes/labels";
import { useColors, useMetrics, useScheme } from "@/hooks/useColors";
import { canEdit, type Note } from "@/api/notes";
import {
  fetchFreshNote, notesKeys, useArchiveNote, useCreateNote, useDuplicateNote, useLockNote, useNote, usePinNote,
  useSaveNote, useSetNoteColor, useSetNoteReminder, useTrashNote,
} from "@/screens/notes/api/queries";
import { failureMessage } from "@/api/failure";
import { noteDrafts } from "@/stores/noteDrafts.files";
import { decideOnOpen } from "@/stores/noteDrafts.store";
import { NoteDocument } from "@/screens/notes/editor/NoteDocument";
import { ReadOnlyAtomProvider } from "@/screens/notes/editor/ReadOnlyAtom";
import { openForEditing, saveFromEngine, type EditSession } from "@/screens/notes/editor/editSession";
import { notesEngineAtoms, notesEngineSchema } from "@/screens/notes/editor/engineSchema";
import { engineTheme } from "@/screens/notes/editor/engineTheme";
import { createNoteSaver, type NoteSaver, type SaverState, type ServerNote } from "@/screens/notes/editor/noteSaver";
import type { DocNode, EditorLabels } from "@/screens/notes/editor/types";
import { EditorToolbar } from "@/screens/notes/editor/EditorToolbar";
import { buildToolbar, type Command, type Panel } from "@/screens/notes/editor/toolbarModel";
import { runCommand, type EngineRef } from "@/screens/notes/editor/engineCommands";
import { toolbarLabels } from "@/screens/notes/toolbarLabels";
import { NoteColorPicker } from "@/screens/notes/NoteColorPicker";
import { noteColor, type NoteColorKey } from "@/screens/notes/editor/noteColors";
import { cardPreview } from "@/screens/notes/cardPreview";
import { relativeTime } from "@/lib/relativeTime";
import { CODE_LANGUAGES, deleteBlockAt, setCodeLanguageAt, textblockAt, toCodeBlockAt, toParagraphAt } from "@/screens/notes/editor/blockEdits";

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

  const { data: note, error, refetch } = useNote(noteId);
  const save = useSaveNote();
  const createNote = useCreateNote();
  const saveCalls = useRef({ save: save.mutateAsync, create: createNote.mutateAsync });
  saveCalls.current = { save: save.mutateAsync, create: createNote.mutateAsync };
  const pin = usePinNote();
  const setNoteColor = useSetNoteColor();
  const lock = useLockNote();
  const setNoteReminder = useSetNoteReminder();
  const archive = useArchiveNote();
  const trash = useTrashNote();
  const duplicate = useDuplicateNote();

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
    table: (rows, cols) => t("notes.block.table", { rows, cols }),
    code: (language) => (language ? t("notes.block.codeIn", { language }) : t("notes.block.code")),
    legacyImage: t("notes.block.legacyImage"),
    embed: t("notes.block.embed"),
    unknown: (type) => t("notes.block.unknown", { type }),
    imageUnavailable: t("notes.block.imageUnavailable"),
    checked: t("notes.task.checked"),
    unchecked: t("notes.task.unchecked"),
  };
  const openLink = (href: string) => {
    if (/^(https?:|mailto:|tel:)/i.test(href)) void Linking.openURL(href).catch(() => undefined);
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
    } catch (e) {
      // Why the engine refused (it names the node or attribute): visible in
      // the dev log, which is how a refusal gets fixed (plan §11 cond. 1).
      console.warn("[notes] engine B refused the note:", e instanceof Error ? e.message : String(e));
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
        get: async (id) => toServer(await fetchFreshNote(queryClient, id)),
        update: async (id, body, expected) => toServer(await saveCalls.current.save({ id, body, expectedUpdatedAt: expected })),
        create: async (body) => {
          const made = await saveCalls.current.create(body);
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
      // Each save already wrote the server's note into the cards (useSaveNote).
      void saver.flush();
      saver.dispose();
    };
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const push = () => saverRef.current?.change({ title: title.current, html: html.current });

  // The engine's document as we last saw it (for structural edits and the caret's block).
  const engineDocRef = useRef<DocNode | null>(null);
  useEffect(() => {
    engineDocRef.current = engine?.session?.engineDoc ?? null;
  }, [engine]);

  const onEngineChange = (json: unknown) => {
    if (!engine?.session) return;
    engineDocRef.current = json as DocNode;
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
        queryClient.setQueryData<Note>(notesKeys.detail(noteId), (old) => (old ? { ...old, ...result.reload } : old));
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

  // Our toolbar (SPEC §C3, owner 2026-11-13): the engine's state drives it.
  const editorRef = useRef<RichTextEditorRef | null>(null);
  // Taps on our bar must not take the focus (and the keyboard) from the
  // engine: B treats this view as part of the editor (focusPreservingRefs).
  const barRef = useRef<View | null>(null);
  const [active, setActive] = useState<{ marks: Record<string, boolean>; nodes: Record<string, boolean> }>({ marks: {}, nodes: { paragraph: true } });
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [hasSelection, setHasSelection] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [caretPos, setCaretPos] = useState<number | null>(null);
  const caretScalar = useRef<{ anchor: number; head: number } | null>(null);
  const scheme = useScheme();
  const [focused, setFocused] = useState(false);
  const [sheet, setSheet] = useState<"noteColor" | "more" | "confirmDelete" | "labels" | "reminder" | null>(null);
  // Pin, colour, lock, reminder and labels: read from the cache, which the
  // mutations change at once (optimistic) and put back on a refusal.
  const locked = note?.locked ?? false;
  const [reminderDenied, setReminderDenied] = useState(false);
  const notePinned = note?.pinned ?? false;
  const noteColorKey = note?.color ?? null;
  const page = noteColor(noteColorKey, scheme);
  const pageFill = noteColorKey ? page.fill : colors.ground;
  const [codeSheet, setCodeSheet] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");
  const labelsForToolbar = useMemo(() => toolbarLabels(t), [t]);
  // The textblock under the caret, from our copy of the engine's document.
  const caretBlock = caretPos !== null && engineDocRef.current ? textblockAt(engineDocRef.current, caretPos) : null;
  const headingLevel = caretBlock?.node.type === "heading" ? Number(caretBlock.node.attrs?.level ?? 1) : undefined;
  const codeLanguage = caretBlock?.node.type === "codeBlock" ? ((caretBlock.node.attrs?.language as string | null) ?? null) : undefined;
  // Locked: every edit key is off; ⋮ (delete, copy, send, labels) stays.
  // Our document's block under the caret decides "in code" (B's active state
  // can lag behind a whole-document replace; seen on the device).
  const nodesForBar = caretBlock ? { ...active.nodes, codeBlock: caretBlock.node.type === "codeBlock" } : active.nodes;
  const toolbarKeys = buildToolbar({ ...active, nodes: nodesForBar, ...history, hasSelection, panel: locked ? null : panel, headingLevel, codeLanguage, focused: focused && !locked })
    .keys.map((k) => (locked && k.id !== "more" && k.id !== "spacer" ? { ...k, disabled: true } : k));

  /** Replace the engine's document with a structural edit of it (B has no command for these). */
  const applyStructural = (edit: (doc: DocNode, path: number[]) => DocNode) => {
    const ref = editorRef.current;
    const doc = engineDocRef.current;
    if (!ref || !doc || !caretBlock) {
      console.warn("[notes] no block under the caret for a structural edit", { caretPos, types: doc?.content?.map((n) => n.type) });
      return;
    }
    const next = edit(doc, caretBlock.path);
    ref.setContentJson(next as never);
    onEngineChange(next);
    // B puts the caret at the start after a whole-document replace (seen on
    // the device): put it back where it was, as B's own mention code does.
    const at = caretScalar.current;
    const bridge = (engine?.handle as unknown as { bridge?: { getState(): { documentRevision: string }; setSelection(r: unknown): unknown } } | null)?.bridge;
    if (at && bridge) {
      // After B has applied the new document (setContentJson goes through a
      // render): restoring before it is undone by the replace (seen on device).
      setTimeout(() => {
        try {
          bridge.setSelection({
            baseDocumentRevision: bridge.getState().documentRevision,
            selection: {
              type: "text",
              anchor: { offset: at.anchor, kind: "scalar", affinity: "after" },
              head: { offset: at.head, kind: "scalar", affinity: "after" },
            },
          });
          ref.focus();
        } catch {
          // A position the new document cannot hold: the caret stays where B put it.
        }
      }, 150);
    }
  };

  const onCommand = (command: Command) => {
    const ref = editorRef.current as unknown as EngineRef | null;
    if (command.kind === "panel") {
      if (command.panel === "codeLanguage") {
        setLanguageQuery("");
        setCodeSheet(true);
      } else setPanel(command.panel);
      return;
    }
    if (command.kind === "block" && command.value === "codeBlock") {
      if (caretBlock && caretBlock.node.type !== "codeBlock") applyStructural(toCodeBlockAt);
      return;
    }
    if (command.kind === "block" && caretBlock?.node.type === "codeBlock") {
      applyStructural(toParagraphAt);
      if (command.value === "paragraph") return;
    }
    if (command.kind === "link") {
      setLinkDraft("");
      return;
    }
    if (command.kind === "sheet") {
      setSheet(command.sheet);
      return;
    }
    if (command.kind === "none") return;
    if (!ref) return;
    runCommand(ref, command, { nodes: nodesForBar, headingLevel });
    if (command.kind === "color") setPanel(null);
  };
  const [actionFailed, setActionFailed] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setActionFailed(false);
    try {
      await fn();
      return true;
    } catch {
      setActionFailed(true);
      return false;
    }
  };
  const togglePin = () =>
    void act(async () => {
      await pin.mutateAsync({ id: noteId, pinned: !notePinned });
    });
  const noteReminder = note?.reminder ?? null;
  const resync = () => void resyncReminders({ untitled: t("notes.untitled") }).catch(() => undefined);
  const saveReminder = (next: NoteReminder | null) => {
    setSheet(null);
    void act(async () => {
      if (next) setReminderDenied(!(await ensureReminderPermission()));
      await setNoteReminder.mutateAsync({ id: noteId, reminder: next });
      resync();
    });
  };
  const toggleLock = () =>
    void act(async () => {
      if (!locked) {
        await saverRef.current?.flush();
        editorRef.current?.blur();
      }
      await lock.mutateAsync({ id: noteId, locked: !locked });
    });
  const archiveNote = () =>
    void act(async () => {
      await saverRef.current?.flush();
      await archive.mutateAsync({ id: noteId });
      resync();
    }).then((ok) => {
      if (ok) router.back();
    });
  const pickColor = (key: NoteColorKey | null) => {
    setSheet(null);
    void act(async () => {
      await setNoteColor.mutateAsync({ id: noteId, color: key });
    });
  };
  const deleteNote = () => {
    setSheet(null);
    void act(async () => {
      await saverRef.current?.flush();
      await trash.mutateAsync({ id: noteId });
      resync();
    }).then((ok) => {
      if (ok) router.back();
    });
  };
  const copyNote = () => {
    setSheet(null);
    void act(async () => {
      await saverRef.current?.flush();
      const copy = await duplicate.mutateAsync({ id: noteId });
      router.replace({ pathname: "/notes/edit", params: { id: String(copy.id) } });
    });
  };
  const sendNote = () => {
    setSheet(null);
    const body = cardPreview(html.current, 100000).lines.join("\n");
    const message = [title.current.trim(), body].filter(Boolean).join("\n\n");
    void Share.share({ message, title: title.current.trim() || undefined }).catch(() => undefined);
  };
  const colorLabels = {
    no_color: t("notes.grid.colors.no_color"), red: t("notes.grid.colors.red"), orange: t("notes.grid.colors.orange"),
    yellow: t("notes.grid.colors.yellow"), green: t("notes.grid.colors.green"), teal: t("notes.grid.colors.teal"),
    blue: t("notes.grid.colors.blue"), purple: t("notes.grid.colors.purple"), pink: t("notes.grid.colors.pink"),
    gray: t("notes.grid.colors.gray"),
  } satisfies Record<NoteColorKey, string>;

  const saveLink = () => {
    const ref = editorRef.current;
    const href = (linkDraft ?? "").trim();
    if (ref) {
      if (href) ref.setLink(/^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}`);
      else ref.unsetLink();
    }
    setLinkDraft(null);
  };

  const stateLabels: Record<SaverState["kind"], string> = {
    saved: t("notes.edit.state.saved"),
    unsaved: t("notes.edit.state.unsaved"),
    saving: t("notes.edit.state.saving"),
    local: t("notes.edit.state.local"),
    conflict: t("notes.edit.state.conflict"),
  };
  const stateLabel = stateLabels[state.kind];

  // Keep's header (owner's screenshots, 2026-11-13, not stored): a round back
  // button; on the right a rounded pill of the note's actions (pin for now;
  // reminder and archive join it in their step).
  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: metrics.space.sm, gap: metrics.space.sm }}>
      <Pressable
        testID="note-edit-back"
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
        hitSlop={8}
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.ink}14` }}
      >
        <ChevronLeft size={24} color={colors.ink} />
      </Pressable>
      <Text testID="note-edit-state" tone="muted" style={{ flex: 1, fontSize: 12 }} accessibilityLiveRegion="polite">
        {opened ? stateLabel : ""}
      </Text>
      {note ? (
        <View style={{ flexDirection: "row", borderRadius: 999, backgroundColor: `${colors.ink}14`, paddingHorizontal: 4 }}>
          <Pressable
            testID="note-edit-pin"
            onPress={togglePin}
            accessibilityRole="button"
            accessibilityLabel={notePinned ? t("notes.grid.unpin") : t("notes.grid.pin")}
            accessibilityState={{ selected: notePinned }}
            hitSlop={4}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Pin size={20} color={notePinned ? colors.accent : colors.ink} fill={notePinned ? colors.accent : "none"} />
          </Pressable>
          {canEdit(note) ? (
            <Pressable
              testID="note-edit-lock"
              onPress={toggleLock}
              accessibilityRole="button"
              accessibilityLabel={locked ? t("notes.lock.unlock") : t("notes.lock.lock")}
              accessibilityState={{ selected: locked }}
              hitSlop={4}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              {locked ? <LockIcon size={20} color={colors.accent} /> : <LockOpenIcon size={20} color={colors.ink} />}
            </Pressable>
          ) : null}
          <Pressable
            testID="note-edit-reminder"
            onPress={() => setSheet("reminder")}
            accessibilityRole="button"
            accessibilityLabel={t("notes.reminder.bell")}
            accessibilityState={{ selected: Boolean(noteReminder) }}
            hitSlop={4}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <BellIcon size={20} color={noteReminder ? colors.accent : colors.ink} />
          </Pressable>
          {note.role === "owner" || note.role === "administrator" ? (
            <Pressable
              testID="note-edit-archive"
              onPress={archiveNote}
              accessibilityRole="button"
              accessibilityLabel={t("notes.views.archiveAction")}
              hitSlop={4}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <ArchiveIcon size={20} color={colors.ink} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
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

  // B refused this document: the read view, nothing sent (plan §11 condition 1).
  if (engine.failed || !engine.handle) {
    return (
      <Screen>
        {header}
        <ScrollView contentContainerStyle={{ paddingBottom: metrics.space.xl, gap: metrics.space.md }}>
          <Text testID="note-edit-cannot-open" tone="muted">{t("notes.edit.cannotOpen")}</Text>
          {engine.session ? (
            <NoteDocument doc={engine.session.doc} colors={colors} labels={labels} onLinkPress={openLink} />
          ) : null}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen avoidKeyboard background={pageFill}>
      <View testID="note-edit-page" style={{ flex: 1, marginHorizontal: -metrics.space.lg, paddingHorizontal: metrics.space.lg, backgroundColor: pageFill }}>
      {header}
      {actionFailed ? (
        <Text testID="note-edit-action-failed" style={{ color: colors.danger, fontSize: 13 }}>{t("notes.grid.actionFailed")}</Text>
      ) : null}
      {opened.restored ? (
        <Text testID="note-edit-restored" tone="muted" style={{ fontSize: 13 }}>{t("notes.edit.restored")}</Text>
      ) : null}
      {cannotSave ? (
        <Text testID="note-edit-cannot-save" style={{ color: colors.danger, fontSize: 13 }}>
          {t("notes.edit.cannotSave")}
        </Text>
      ) : null}
      <TextInput
        testID="note-edit-title"
        key={`title-${generation}`}
        defaultValue={opened.title}
        editable={!locked}
        placeholder={t("notes.edit.titlePlaceholder")}
        placeholderTextColor={colors.inkMuted}
        onChangeText={(v) => {
          title.current = v;
          push();
        }}
        returnKeyType="next"
        style={{ fontSize: 28, lineHeight: 36, fontWeight: "400", color: colors.ink, paddingVertical: metrics.space.sm }}
        accessibilityLabel={t("notes.edit.titlePlaceholder")}
      />
      {locked ? (
        <View testID="note-edit-locked-chip" style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: `${colors.ink}14`, paddingHorizontal: 10, paddingVertical: 4, marginBottom: metrics.space.xs }}>
          <LockIcon size={14} color={colors.ink} />
          <Text style={{ fontSize: 13 }}>{t("notes.lock.locked")}</Text>
        </View>
      ) : null}
      {noteReminder ? (
        <Pressable
          testID="note-edit-reminder-chip"
          onPress={() => setSheet("reminder")}
          accessibilityRole="button"
          style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 4, marginBottom: metrics.space.xs }}
        >
          <BellIcon size={14} color={colors.ink} />
          <Text style={{ fontSize: 13 }}>
            {reminderLabel(noteReminder, i18n.language, (r) => t(`notes.reminder.${r}`))}
          </Text>
        </Pressable>
      ) : null}
      {reminderDenied ? (
        <Text testID="note-edit-reminder-denied" tone="muted" style={{ fontSize: 12 }}>{t("notes.reminder.denied")}</Text>
      ) : null}
      <ReadOnlyAtomProvider value={{ colors, labels, onLinkPress: openLink }}>
        <View style={{ flex: 1 }} testID="note-edit-body">
          <RichTextEditor
            ref={editorRef}
            key={`body-${generation}`}
            documentHandle={engine.handle}
            atoms={notesEngineAtoms}
            theme={engineTheme(colors, pageFill) as never}
            focusPreservingRefs={barRef}
            editable={!locked}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t("notes.edit.bodyPlaceholder")}
            showToolbar={false}
            onActiveStateChange={(state) => setActive({ marks: { ...state.marks }, nodes: { ...state.nodes } })}
            onHistoryStateChange={(h) => setHistory({ canUndo: h.canUndo, canRedo: h.canRedo })}
            onSelectionChange={(sel) => {
              setHasSelection(sel.type === "text" && sel.anchor !== sel.head);
              setCaretPos(typeof sel.head === "number" ? sel.head : null);
              caretScalar.current =
                typeof sel.anchorScalar === "number" && typeof sel.headScalar === "number" ? { anchor: sel.anchorScalar, head: sel.headScalar } : null;
            }}
            autoCorrect={!active.nodes.codeBlock}
            autoCapitalize={active.nodes.codeBlock ? "none" : "sentences"}
            heightBehavior="fixed"
            style={{ flex: 1 }}
            containerStyle={{ flex: 1 }}
            onContentChangeJSON={onEngineChange}
            accessibilityLabel={t("notes.edit.bodyPlaceholder")}
          />
        </View>
      </ReadOnlyAtomProvider>
      <View ref={barRef} collapsable={false} style={{ marginHorizontal: -metrics.space.lg }}>
        <EditorToolbar keys={toolbarKeys} labels={labelsForToolbar} colors={{ ...colors, surface: pageFill }} onCommand={onCommand} />
      </View>
      </View>
      <NoteColorPicker
        visible={sheet === "noteColor"}
        value={noteColorKey}
        mode={scheme}
        colors={colors}
        title={t("notes.grid.colorTitle")}
        labels={colorLabels}
        onPick={pickColor}
        onClose={() => setSheet(null)}
      />
      <Modal visible={sheet === "more"} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={() => setSheet(null)} accessibilityLabel={t("common.close")} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: metrics.space.md, paddingHorizontal: metrics.space.lg }}>
          <Text testID="note-more-edited" tone="muted" style={{ fontSize: 12, marginBottom: metrics.space.sm }}>
            {t("notes.more.edited", { when: relativeTime(note.updatedAt) })}
          </Text>
          {(
            [
              ["note-more-delete", Trash2, t("notes.more.delete"), () => setSheet("confirmDelete")],
              ["note-more-copy", Copy, t("notes.more.copy"), copyNote],
              ["note-more-send", Share2, t("notes.more.send"), sendNote],
              ["note-more-labels", TagIcon, t("notes.labels.title"), () => setSheet("labels")],
            ] as const
          ).map(([testID, Icon, label, onPress]) => (
            <Pressable key={testID} testID={testID} onPress={onPress} accessibilityRole="button" style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 16 }}>
              <Icon size={22} color={colors.ink} />
              <Text style={{ fontSize: 16 }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>
      <ReminderSheet
        visible={sheet === "reminder"}
        value={noteReminder}
        onSave={(r) => saveReminder(r)}
        onRemove={() => saveReminder(null)}
        onClose={() => setSheet(null)}
      />
      <NoteLabelsSheet
        visible={sheet === "labels"}
        note={{ id: noteId, tags: note.tags }}
        onClose={() => setSheet(null)}
      />
      <Modal visible={sheet === "confirmDelete"} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <View style={{ flex: 1, justifyContent: "center", padding: metrics.space.lg, backgroundColor: "rgba(0,0,0,0.45)" }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: metrics.space.lg, gap: metrics.space.md }}>
            <Text style={{ fontWeight: "700", fontSize: 17 }}>{t("notes.grid.deleteTitle", { count: 1 })}</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: metrics.space.md }}>
              <Pressable testID="note-more-delete-cancel" onPress={() => setSheet(null)} style={{ padding: 10 }}>
                <Text tone="muted">{t("common.cancel")}</Text>
              </Pressable>
              <Pressable testID="note-more-delete-confirm" onPress={deleteNote} style={{ padding: 10 }}>
                <Text style={{ color: colors.danger, fontWeight: "700" }}>{t("notes.grid.deleteConfirm")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={linkDraft !== null} transparent animationType="fade" onRequestClose={() => setLinkDraft(null)}>
        <KeyboardPadding>
          <View style={{ flex: 1, justifyContent: "center", padding: metrics.space.lg, backgroundColor: "rgba(0,0,0,0.4)" }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: metrics.space.lg, gap: metrics.space.md }}>
              <Text style={{ fontWeight: "700", fontSize: 17 }}>{t("notes.toolbar.link")}</Text>
              <TextInput
                testID="note-link-input"
                value={linkDraft ?? ""}
                onChangeText={setLinkDraft}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="https://"
                placeholderTextColor={colors.inkMuted}
                onSubmitEditing={saveLink}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.ink, fontSize: 16 }}
              />
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: metrics.space.md }}>
                <Pressable testID="note-link-cancel" onPress={() => setLinkDraft(null)} hitSlop={8} style={{ padding: 10 }}>
                  <Text tone="muted">{t("common.cancel")}</Text>
                </Pressable>
                <Pressable testID="note-link-save" onPress={saveLink} hitSlop={8} style={{ padding: 10 }}>
                  <Text style={{ color: colors.accent, fontWeight: "700" }}>{t("common.save")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardPadding>
      </Modal>
      <Modal visible={codeSheet} transparent animationType="slide" onRequestClose={() => setCodeSheet(false)}>
        <KeyboardPadding>
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }}>
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: metrics.space.lg, gap: metrics.space.md, maxHeight: "75%" }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, fontWeight: "700", fontSize: 17 }}>{t("notes.code.title")}</Text>
                <Pressable testID="note-code-done" onPress={() => setCodeSheet(false)} hitSlop={8} style={{ padding: 8 }}>
                  <Text style={{ color: colors.accent, fontWeight: "700" }}>{t("common.close")}</Text>
                </Pressable>
              </View>
              <TextInput
                testID="note-code-language-search"
                autoFocus
                value={languageQuery}
                onChangeText={setLanguageQuery}
                placeholder={t("notes.code.search")}
                placeholderTextColor={colors.inkMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.ink, fontSize: 16 }}
              />
              <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
                {CODE_LANGUAGES.filter((l) => (l.id === null ? t("notes.code.plain") : l.name).toLowerCase().includes(languageQuery.trim().toLowerCase())).map((l) => (
                  <Pressable
                    key={l.id ?? "plain"}
                    testID={`note-code-language-${l.id ?? "plain"}`}
                    onPress={() => {
                      applyStructural((doc, path) => setCodeLanguageAt(doc, path, l.id));
                      setCodeSheet(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: (codeLanguage ?? null) === l.id }}
                    style={{ minHeight: 48, justifyContent: "center", borderBottomWidth: 1, borderColor: colors.border }}
                  >
                    <Text style={{ fontWeight: (codeLanguage ?? null) === l.id ? "700" : "400" }}>{l.id === null ? t("notes.code.plain") : l.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                testID="note-code-delete"
                onPress={() => {
                  applyStructural(deleteBlockAt);
                  setCodeSheet(false);
                }}
                accessibilityRole="button"
                style={{ minHeight: 48, justifyContent: "center" }}
              >
                <Text style={{ color: colors.danger, fontWeight: "600" }}>{t("notes.code.delete")}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardPadding>
      </Modal>
    </Screen>
  );
}
