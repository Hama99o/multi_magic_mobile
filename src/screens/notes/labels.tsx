/**
 * LABELS — the web's note tags (owner, 2026-11-13: Keep's drawer and labels).
 * The drawer (☰), the Edit labels sheet, and a note's Labels sheet (⋮). All
 * read and write the web's store (api/noteTags.ts); nothing local.
 */
import { useState, useRef } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { SheetFrame } from "@/components/SheetFrame";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/reusables/text";
import { Check, ChevronDown, ChevronUp, LayoutGrid, NotebookPen, Palette, Pencil, Pin, Plus, Square, Trash2, X } from "@/components/icons";
import { useColors, useMetrics, useScheme } from "@/hooks/useColors";
import {
  moveTag, useCreateTag, useCreateTagOnNote, useNoteTags, useRemoveTag, useRenameTag, useReorderTags, useSetTagColor, useToggleNoteTag,
} from "./api/queries";
import { NoteColorPicker, useNoteColorLabels } from "./NoteColorPicker";
import { noteColor, type NoteColorKey } from "./editor/noteColors";
import type { Note, NoteTag } from "@/api/notes";
import TagIcon from "lucide-react-native/dist/esm/icons/tag";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ArchiveIcon from "lucide-react-native/dist/esm/icons/archive";
import BellIcon from "lucide-react-native/dist/esm/icons/bell";

export { useNoteTags };

/** Keep's drawer: Notes (current when no label), then every label; Edit labels. */
export type NotesView = "notes" | "pinned" | "reminders" | "archive" | "trash";

/** A label's tag icon, drawn in its colour (the web's dot colour) when it has one. */
export function LabelIcon({ tag, size, testID }: { tag: NoteTag; size: number; testID?: string }) {
  const colors = useColors();
  const scheme = useScheme();
  if (!tag.color) return <TagIcon size={size} color={colors.inkMuted} />;
  return (
    <View testID={testID}>
      <TagIcon size={size} color={noteColor(tag.color, scheme).dot} />
    </View>
  );
}

export function NotesDrawer({
  visible, currentTagId, view = "notes", onClose, onPick, onEditLabels, onPickView, onGoHome,
}: {
  visible: boolean;
  currentTagId: number | null;
  view?: NotesView;
  onClose(): void;
  onPick(tag: NoteTag | null): void;
  onEditLabels(): void;
  onPickView?(view: NotesView): void;
  /** Back to the app grid (TestFlight 1.2.0, 2026-11-15: no way back to Home). */
  onGoHome?(): void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  // Fetched with the grid (the drawer stays mounted): the labels are there the
  // moment it opens, not half a second later (demo video, 2026-11-14).
  const { data: tags = [] } = useNoteTags();
  // The drawer is a Modal: it starts under the status bar unless told (seen on the device).
  const insets = useSafeAreaInsets();
  const row = (testID: string, label: string, icon: React.ReactNode, selected: boolean, onPress: () => void) => (
    <Pressable
      key={testID}
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        minHeight: 52, flexDirection: "row", alignItems: "center", gap: 20, paddingHorizontal: 20,
        borderTopRightRadius: 999, borderBottomRightRadius: 999, marginRight: 12,
        backgroundColor: selected ? `${colors.accent}40` : "transparent",
      }}
    >
      {icon}
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: selected ? "700" : "500" }}>{label}</Text>
    </Pressable>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, flexDirection: "row" }}>
        <View testID="notes-drawer" style={{ width: "78%", maxWidth: 360, backgroundColor: colors.surface, paddingTop: insets.top + metrics.space.lg }}>
          <Text style={{ fontSize: 22, fontWeight: "600", paddingHorizontal: 20, marginBottom: metrics.space.md }} accessibilityRole="header">
            {t("notes.labels.drawerTitle")}
          </Text>
          <ScrollView>
            {onGoHome ? row("drawer-home", t("notes.labels.allApps"), <LayoutGrid size={22} color={colors.ink} />, false, onGoHome) : null}
            {row("drawer-notes", t("notes.title"), <NotebookPen size={22} color={colors.ink} />, view === "notes" && currentTagId === null, () => onPick(null))}
            {onPickView ? row("drawer-pinned", t("notes.views.pinned"), <Pin size={22} color={colors.ink} />, view === "pinned", () => onPickView("pinned")) : null}
            {onPickView ? row("drawer-reminders", t("notes.views.reminders"), <BellIcon size={22} color={colors.ink} />, view === "reminders", () => onPickView("reminders")) : null}
            <Text tone="muted" style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.6, paddingHorizontal: 20, marginTop: metrics.space.lg, marginBottom: metrics.space.xs }}>
              {t("notes.labels.title").toUpperCase()}
            </Text>
            {tags.map((tag) => row(`drawer-label-${tag.id}`, tag.name, <LabelIcon tag={tag} size={22} testID={`drawer-label-${tag.id}-dot`} />, view === "notes" && currentTagId === tag.id, () => onPick(tag)))}
            {row("drawer-edit-labels", t("notes.labels.edit"), <Pencil size={22} color={colors.ink} />, false, onEditLabels)}
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: metrics.space.sm }} />
            {onPickView ? row("drawer-archive", t("notes.views.archive"), <ArchiveIcon size={22} color={colors.ink} />, view === "archive", () => onPickView("archive")) : null}
            {onPickView ? row("drawer-trash", t("notes.views.trash"), <Trash2 size={22} color={colors.ink} />, view === "trash", () => onPickView("trash")) : null}
          </ScrollView>
        </View>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose} accessibilityLabel={t("common.close")} />
      </View>
    </Modal>
  );
}

/** Create, rename, colour, reorder and delete labels (the web's ManageLabelsModal and its tab drag). */
export function EditLabelsSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const { data: tags = [] } = useNoteTags(visible);
  const createTag = useCreateTag();
  const renameTag = useRenameTag();
  const removeTag = useRemoveTag();
  const setTagColor = useSetTagColor();
  const reorder = useReorderTags();
  const scheme = useScheme();
  const colorLabels = useNoteColorLabels();
  // Whose colour the picker is choosing: a label's id, or "new" for the one being made.
  const [coloring, setColoring] = useState<number | "new" | null>(null);
  const [draftColor, setDraftColor] = useState<NoteColorKey | null>(null);
  const [draft, setDraft] = useState("");
  const [names, setNames] = useState<Record<number, string>>({});
  const [toDelete, setToDelete] = useState<NoteTag | null>(null);
  const [failed, setFailed] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setFailed(false);
    try {
      await fn();
    } catch {
      setFailed(true);
    }
  };
  const create = () => {
    const name = draft.trim();
    if (!name) return;
    const color = draftColor;
    setDraft("");
    setDraftColor(null);
    void run(() => createTag.mutateAsync({ name, color }));
  };
  const sent = useRef<Record<number, string>>({});
  const commitRename = (tag: NoteTag) => {
    const name = (names[tag.id] ?? tag.name).trim();
    if (!name || name === tag.name || sent.current[tag.id] === name) return;
    sent.current[tag.id] = name;
    void run(() => renameTag.mutateAsync({ id: tag.id, name }));
  };
  const close = () => {
    for (const tag of tags) commitRename(tag);
    onClose();
  };
  const move = (from: number, step: -1 | 1) => {
    const order = moveTag(tags, from, step);
    if (order !== tags) void run(() => reorder.mutateAsync({ order }));
  };
  const swatch = (testID: string, color: NoteColorKey | null, label: string, onPress: () => void) => (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
      {color ? (
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: noteColor(color, scheme).dot }} />
      ) : (
        <Palette size={20} color={colors.inkMuted} />
      )}
    </Pressable>
  );
  const coloringTag = typeof coloring === "number" ? tags.find((tag) => tag.id === coloring) : undefined;
  return (
    <SheetFrame visible={visible} onClose={close} closeLabel={t("common.close")} keyboard testID="labels-edit" maxHeight="85%" style={{ padding: metrics.space.lg, gap: metrics.space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: "700" }}>{t("notes.labels.edit")}</Text>
          <Pressable testID="labels-close" onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.close")} style={{ padding: 8 }}>
            <X size={22} color={colors.ink} />
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {swatch("labels-new-color", draftColor, t("notes.labels.colorOf", { name: draft.trim() || t("notes.labels.create") }), () => setColoring("new"))}
          <TextInput
            testID="labels-new"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={create}
            placeholder={t("notes.labels.create")}
            placeholderTextColor={colors.inkMuted}
            style={{ flex: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 10, color: colors.ink, fontSize: 16 }}
          />
          <Pressable testID="labels-create" onPress={create} accessibilityRole="button" accessibilityLabel={t("notes.labels.create")} hitSlop={8} style={{ padding: 10 }}>
            <Plus size={22} color={colors.accent} />
          </Pressable>
        </View>
        {failed ? <Text style={{ color: colors.danger, fontSize: 13 }}>{t("notes.grid.actionFailed")}</Text> : null}
        <ScrollView keyboardShouldPersistTaps="handled">
          {tags.map((tag, i) => (
            <View key={tag.id} style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 52 }}>
              {swatch(`labels-color-${tag.id}`, tag.color, t("notes.labels.colorOf", { name: tag.name }), () => setColoring(tag.id))}
              <TextInput
                testID={`labels-name-${tag.id}`}
                value={names[tag.id] ?? tag.name}
                onChangeText={(v) => setNames((n) => ({ ...n, [tag.id]: v }))}
                // Return, leaving the field or closing the sheet all keep
                // the rename (audit P2: without Return it was lost).
                onSubmitEditing={() => commitRename(tag)}
                onBlur={() => commitRename(tag)}
                accessibilityLabel={tag.name}
                style={{ flex: 1, color: colors.ink, fontSize: 16, paddingVertical: 8 }}
              />
              {(
                [
                  ["up", -1, i === 0, ChevronUp, t("notes.labels.moveUp", { name: tag.name })],
                  ["down", 1, i === tags.length - 1, ChevronDown, t("notes.labels.moveDown", { name: tag.name })],
                ] as const
              ).map(([key, step, end, Icon, label]) => (
                <Pressable
                  key={key}
                  testID={`labels-${key}-${tag.id}`}
                  onPress={() => move(i, step)}
                  disabled={end}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ disabled: end }}
                  hitSlop={4}
                  style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", opacity: end ? 0.3 : 1 }}
                >
                  <Icon size={20} color={colors.inkMuted} />
                </Pressable>
              ))}
              <Pressable testID={`labels-delete-${tag.id}`} onPress={() => setToDelete(tag)} accessibilityRole="button" accessibilityLabel={t("notes.grid.delete")} hitSlop={8} style={{ padding: 8 }}>
                <Trash2 size={20} color={colors.inkMuted} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      <NoteColorPicker
        visible={coloring !== null}
        value={coloring === "new" ? draftColor : (coloringTag?.color ?? null)}
        mode={scheme}
        colors={colors}
        title={t("notes.labels.colorOf", { name: coloring === "new" ? draft.trim() || t("notes.labels.create") : (coloringTag?.name ?? "") })}
        labels={colorLabels}
        onPick={(key) => {
          const target = coloring;
          setColoring(null);
          if (target === "new") setDraftColor(key);
          else if (typeof target === "number") void run(() => setTagColor.mutateAsync({ id: target, color: key }));
        }}
        onClose={() => setColoring(null)}
      />
      <Modal visible={toDelete !== null} transparent animationType="fade" onRequestClose={() => setToDelete(null)}>
        <View style={{ flex: 1, justifyContent: "center", padding: metrics.space.lg, backgroundColor: "rgba(0,0,0,0.45)" }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: metrics.space.lg, gap: metrics.space.md }}>
            <Text style={{ fontWeight: "700", fontSize: 17 }}>{t("notes.labels.deleteTitle", { name: toDelete?.name ?? "" })}</Text>
            <Text tone="muted">{t("notes.labels.deleteBody")}</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: metrics.space.md }}>
              <Pressable onPress={() => setToDelete(null)} style={{ padding: 10 }}>
                <Text tone="muted">{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                testID="labels-delete-confirm"
                onPress={() => {
                  const tag = toDelete;
                  setToDelete(null);
                  if (tag) void run(() => removeTag.mutateAsync({ id: tag.id }));
                }}
                style={{ padding: 10 }}
              >
                <Text style={{ color: colors.danger, fontWeight: "700" }}>{t("common.delete")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SheetFrame>
  );
}

/** A note's labels (⋮ Labels): tick to put on or take off; type to find or create. */
export function NoteLabelsSheet({
  visible, note, onClose,
}: {
  visible: boolean;
  note: Pick<Note, "id" | "tags">;
  onClose(): void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const { data: tags = [] } = useNoteTags(visible);
  const toggleTag = useToggleNoteTag();
  const createOnNote = useCreateTagOnNote();
  const [query, setQuery] = useState("");
  const [failed, setFailed] = useState(false);
  const on = new Set(note.tags.map((tag) => tag.id));
  const q = query.trim().toLowerCase();
  const shown = tags.filter((tag) => tag.name.toLowerCase().includes(q));
  const exact = tags.some((tag) => tag.name.toLowerCase() === q);
  // The note's labels come from its cache entry; a toggle shows at once.
  const run = async (fn: () => Promise<Note>) => {
    setFailed(false);
    try {
      await fn();
    } catch {
      setFailed(true);
    }
  };
  return (
    <SheetFrame visible={visible} onClose={onClose} closeLabel={t("common.close")} keyboard maxHeight="85%" style={{ padding: metrics.space.lg, gap: metrics.space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: "700" }}>{t("notes.labels.title")}</Text>
          <Pressable testID="note-labels-close" onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.close")} style={{ padding: 8 }}>
            <X size={22} color={colors.ink} />
          </Pressable>
        </View>
        <TextInput
          testID="note-labels-search"
          value={query}
          onChangeText={setQuery}
          placeholder={t("notes.labels.search")}
          placeholderTextColor={colors.inkMuted}
          style={{ borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 10, color: colors.ink, fontSize: 16 }}
        />
        {failed ? <Text style={{ color: colors.danger, fontSize: 13 }}>{t("notes.grid.actionFailed")}</Text> : null}
        <ScrollView keyboardShouldPersistTaps="handled">
          {q && !exact ? (
            <Pressable
              testID="note-labels-create"
              onPress={() => {
                const name = query.trim();
                setQuery("");
                void run(() => createOnNote.mutateAsync({ id: note.id, name }));
              }}
              accessibilityRole="button"
              style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 16 }}
            >
              <Plus size={22} color={colors.accent} />
              <Text style={{ color: colors.accent }}>{t("notes.labels.createNamed", { name: query.trim() })}</Text>
            </Pressable>
          ) : null}
          {shown.map((tag) => {
            const checked = on.has(tag.id);
            return (
              <Pressable
                key={tag.id}
                testID={`note-label-${tag.id}`}
                onPress={() => void run(() => toggleTag.mutateAsync({ id: note.id, tag }))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={tag.name}
                style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 16 }}
              >
                <LabelIcon tag={tag} size={20} />
                <Text style={{ flex: 1, fontSize: 16 }}>{tag.name}</Text>
                {checked ? <Check size={22} color={colors.accent} /> : <Square size={22} color={colors.inkMuted} />}
              </Pressable>
            );
          })}
        </ScrollView>
    </SheetFrame>
  );
}
