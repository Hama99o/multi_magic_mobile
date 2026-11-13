/**
 * LABELS — the web's note tags (owner, 2026-11-13: Keep's drawer and labels).
 * The drawer (☰), the Edit labels sheet, and a note's Labels sheet (⋮). All
 * read and write the web's store (api/noteTags.ts); nothing local.
 */
import { useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Text } from "@/components/reusables/text";
import { Check, NotebookPen, Pencil, Plus, Square, Trash2, X } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { noteTagsApi } from "@/api/noteTags";
import type { Note, NoteTag } from "@/api/notes";
import TagIcon from "lucide-react-native/dist/esm/icons/tag";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ArchiveIcon from "lucide-react-native/dist/esm/icons/archive";
import BellIcon from "lucide-react-native/dist/esm/icons/bell";

export const TAGS_KEY = ["notes", "tags"] as const;
export const useNoteTags = (enabled = true) => useQuery({ queryKey: TAGS_KEY, queryFn: () => noteTagsApi.list(), enabled });

/** Keep's drawer: Notes (current when no label), then every label; Edit labels. */
export type NotesView = "notes" | "reminders" | "archive" | "trash";

export function NotesDrawer({
  visible, currentTagId, view = "notes", onClose, onPick, onEditLabels, onPickView,
}: {
  visible: boolean;
  currentTagId: number | null;
  view?: NotesView;
  onClose(): void;
  onPick(tag: NoteTag | null): void;
  onEditLabels(): void;
  onPickView?(view: NotesView): void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const { data: tags = [] } = useNoteTags(visible);
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
            {row("drawer-notes", t("notes.title"), <NotebookPen size={22} color={colors.ink} />, view === "notes" && currentTagId === null, () => onPick(null))}
            {onPickView ? row("drawer-reminders", t("notes.views.reminders"), <BellIcon size={22} color={colors.ink} />, view === "reminders", () => onPickView("reminders")) : null}
            <Text tone="muted" style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.6, paddingHorizontal: 20, marginTop: metrics.space.lg, marginBottom: metrics.space.xs }}>
              {t("notes.labels.title").toUpperCase()}
            </Text>
            {tags.map((tag) => row(`drawer-label-${tag.id}`, tag.name, <TagIcon size={22} color={colors.ink} />, currentTagId === tag.id, () => onPick(tag)))}
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

/** Create, rename and delete labels (the web's ManageLabelsModal). */
export function EditLabelsSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: tags = [] } = useNoteTags(visible);
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
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    }
  };
  const create = () => {
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    void run(() => noteTagsApi.create(name));
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
        <View testID="labels-edit" style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: metrics.space.lg, gap: metrics.space.sm, maxHeight: "85%" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: "700" }}>{t("notes.labels.edit")}</Text>
            <Pressable testID="labels-close" onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.close")} style={{ padding: 8 }}>
              <X size={22} color={colors.ink} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
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
            {tags.map((tag) => (
              <View key={tag.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 }}>
                <TagIcon size={20} color={colors.inkMuted} />
                <TextInput
                  testID={`labels-name-${tag.id}`}
                  value={names[tag.id] ?? tag.name}
                  onChangeText={(v) => setNames((n) => ({ ...n, [tag.id]: v }))}
                  onSubmitEditing={() => {
                    const name = (names[tag.id] ?? tag.name).trim();
                    if (name && name !== tag.name) void run(() => noteTagsApi.rename(tag.id, name));
                  }}
                  accessibilityLabel={tag.name}
                  style={{ flex: 1, color: colors.ink, fontSize: 16, paddingVertical: 8 }}
                />
                <Pressable testID={`labels-delete-${tag.id}`} onPress={() => setToDelete(tag)} accessibilityRole="button" accessibilityLabel={t("notes.grid.delete")} hitSlop={8} style={{ padding: 8 }}>
                  <Trash2 size={20} color={colors.inkMuted} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
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
                  if (tag) void run(() => noteTagsApi.remove(tag.id));
                }}
                style={{ padding: 10 }}
              >
                <Text style={{ color: colors.danger, fontWeight: "700" }}>{t("common.delete")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

/** A note's labels (⋮ Labels): tick to put on or take off; type to find or create. */
export function NoteLabelsSheet({
  visible, note, onClose, onChanged,
}: {
  visible: boolean;
  note: Pick<Note, "id" | "tags">;
  onClose(): void;
  onChanged(note: Note): void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: tags = [] } = useNoteTags(visible);
  const [query, setQuery] = useState("");
  const [failed, setFailed] = useState(false);
  const on = new Set(note.tags.map((tag) => tag.id));
  const q = query.trim().toLowerCase();
  const shown = tags.filter((tag) => tag.name.toLowerCase().includes(q));
  const exact = tags.some((tag) => tag.name.toLowerCase() === q);
  const run = async (fn: () => Promise<Note>) => {
    setFailed(false);
    try {
      onChanged(await fn());
    } catch {
      setFailed(true);
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: metrics.space.lg, gap: metrics.space.sm, maxHeight: "85%" }}>
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
                  void run(() => noteTagsApi.createOnNote(note.id, name));
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
                  onPress={() => void run(() => noteTagsApi.toggleOnNote(note.id, tag.id))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={tag.name}
                  style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 16 }}
                >
                  <TagIcon size={20} color={colors.inkMuted} />
                  <Text style={{ flex: 1, fontSize: 16 }}>{tag.name}</Text>
                  {checked ? <Check size={22} color={colors.accent} /> : <Square size={22} color={colors.inkMuted} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
