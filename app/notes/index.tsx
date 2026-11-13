/**
 * THE NOTES GRID — Google Keep's UX (owner, 2026-11-13: "we have almost all
 * the similarity with Google Keep, so we do this"; layout from his Keep
 * screenshots, not stored). `docs/design/notes/KEEP.md`.
 *
 * - Top: a rounded search pill, the grid/list key and the avatar.
 * - Pinned, then Others, in the server's order (pinned desc, updated desc).
 * - A 2-column staggered grid by default; the list (1 column) is the second
 *   choice, kept per user (notesView.store).
 * - A card: title, several lines of the body with breaks and indents kept,
 *   label chips; the note's colour (the web's ten keys) fills the card;
 *   no colour is an outline.
 * - Long-press to select; the bar pins, colours and deletes (to the trash).
 * - Bottom bar: a new checklist, and the big + for a new note.
 *
 * Only what the web stores (pinned, data.color, tags, trash). Archive is a
 * server addition in progress (multi_magic branch); voice and drawing notes
 * do not exist on the web (MISSING_FEATURES.md).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { LoadFailure } from "@/components/LoadFailure";
import { UnreadableNotice } from "@/components/UnreadableNotice";
import { LayoutGrid, List, ListChecks, Menu, Palette, Pin, PinOff, Plus, Trash2, Users, X } from "@/components/icons";
import { useColors, useMetrics, useScheme } from "@/hooks/useColors";
import { canEdit, notesApi, type Note, type NoteTag } from "@/api/notes";
import { NOTES_EDITOR_ENABLED } from "@/config/features";
import { useAuthStore } from "@/stores/auth.store";
import { useNotesView } from "@/stores/notesView.store";
import { Avatar } from "@/screens/people/Avatar";
import { cardPreview } from "@/screens/notes/cardPreview";
import { masonry } from "@/screens/notes/masonry";
import { NoteColorPicker } from "@/screens/notes/NoteColorPicker";
import { noteColor, type NoteColorKey } from "@/screens/notes/editor/noteColors";
import { EditLabelsSheet, NotesDrawer, type NotesView } from "@/screens/notes/labels";
import ArchiveIcon from "lucide-react-native/dist/esm/icons/archive";
import ArchiveRestore from "lucide-react-native/dist/esm/icons/archive-restore";
import RotateCcwIcon from "lucide-react-native/dist/esm/icons/rotate-ccw";
import Flame from "lucide-react-native/dist/esm/icons/flame";
import BellIcon from "lucide-react-native/dist/esm/icons/bell";
import LockIcon from "lucide-react-native/dist/esm/icons/lock";

/** The web's empty to-do list (tiptop 2.3.1 taskList markup), for "new checklist". */
const EMPTY_CHECKLIST =
  '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p></p></div></li></ul>';
const GAP = 8;

export default function NotesScreen() {
  const colors = useColors();
  const scheme = useScheme();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const layout = useNotesView((s) => s.layout);
  const setLayout = useNotesView((s) => s.setLayout);
  useEffect(() => {
    if (user?.id) void useNotesView.getState().hydrate(user.id);
  }, [user?.id]);

  // Search: the server's ?search=, 300 ms after typing stops (as on the web).
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Drawer and label filter (the web's tags; index's ?tag_id=).
  const [drawer, setDrawer] = useState(false);
  const [editLabels, setEditLabels] = useState(false);
  const [label, setLabel] = useState<NoteTag | null>(null);
  const [view, setView] = useState<NotesView>("notes");
  const [confirmForever, setConfirmForever] = useState(false);

  const { data, error, refetch, isRefetching, isLoading, dataUpdatedAt, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["notes", "list", view, search, label?.id ?? null],
    queryFn: ({ pageParam }) => notesApi.list(pageParam, search || undefined, view === "notes" ? label?.id : undefined, view),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
  });
  const notes = useMemo(() => data?.pages.flatMap((p) => p.notes) ?? [], [data]);
  const unreadable = data?.pages.reduce((n, p) => n + p.unreadable, 0) ?? 0;
  const pinned = notes.filter((n) => n.pinned);
  const others = notes.filter((n) => !n.pinned);
  const columns = layout === "grid" ? 2 : 1;

  // Selection (long-press).
  const [selected, setSelected] = useState<number[]>([]);
  const selecting = selected.length > 0;
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const [colorOpen, setColorOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [failed, setFailed] = useState(false);
  const selectedNotes = notes.filter((n) => selected.includes(n.id));
  const allPinned = selectedNotes.length > 0 && selectedNotes.every((n) => n.pinned);

  const runOnSelection = async (action: (note: Note) => Promise<unknown>) => {
    setFailed(false);
    try {
      for (const n of selectedNotes) await action(n);
      setSelected([]);
    } catch {
      setFailed(true);
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    }
  };

  const openNote = (note: Note) => {
    // Straight into the editor (Keep); the trash is for reading, as on the web.
    const edit = NOTES_EDITOR_ENABLED && canEdit(note) && view !== "trash";
    router.push({ pathname: edit ? "/notes/edit" : "/notes/note", params: { id: String(note.id) } });
  };
  const create = async (html: string) => {
    setFailed(false);
    try {
      const made = await notesApi.create({ title: "", html });
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      router.push({ pathname: "/notes/edit", params: { id: String(made.id) } });
    } catch {
      setFailed(true);
    }
  };

  const section = (key: "pinned" | "others", title: string, items: Note[], showTitle: boolean) =>
    items.length ? (
      <View key={key} style={{ gap: GAP }}>
        {showTitle ? (
          <Text tone="muted" style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.5, marginTop: metrics.space.sm, marginLeft: 4 }}>
            {title}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", gap: GAP, alignItems: "flex-start" }}>
          {masonry(items, estimateHeight, columns).map((col, c) => (
            <View key={c} testID={`notes-grid-${key}-col-${c}`} style={{ flex: 1, gap: GAP }}>
              {col.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  mode={scheme}
                  maxLines={layout === "grid" ? 10 : 6}
                  selected={selected.includes(note.id)}
                  onPress={() => (selecting ? toggle(note.id) : openNote(note))}
                  onLongPress={() => toggle(note.id)}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
    ) : null;

  const colorLabels = {
    no_color: t("notes.grid.colors.no_color"), red: t("notes.grid.colors.red"), orange: t("notes.grid.colors.orange"),
    yellow: t("notes.grid.colors.yellow"), green: t("notes.grid.colors.green"), teal: t("notes.grid.colors.teal"),
    blue: t("notes.grid.colors.blue"), purple: t("notes.grid.colors.purple"), pink: t("notes.grid.colors.pink"),
    gray: t("notes.grid.colors.gray"),
  } satisfies Record<NoteColorKey, string>;

  const iconKey = (testID: string, label: string, onPress: () => void, icon: ReactNode) => (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
    >
      {icon}
    </Pressable>
  );

  return (
    <Screen>
      {selecting ? (
        <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: metrics.space.sm, gap: 4 }}>
          {iconKey("notes-selection-close", t("notes.grid.clearSelection"), () => setSelected([]), <X size={22} color={colors.ink} />)}
          <Text testID="notes-selection-count" style={{ flex: 1, fontSize: 18, fontWeight: "600" }}>
            {t("notes.grid.selected", { count: selected.length })}
          </Text>
          {view === "notes" || view === "reminders"
            ? iconKey(
                "notes-selection-pin",
                allPinned ? t("notes.grid.unpin") : t("notes.grid.pin"),
                () => void runOnSelection((n) => notesApi.setPinned(n.id, !allPinned)),
                allPinned ? <PinOff size={22} color={colors.ink} /> : <Pin size={22} color={colors.ink} />,
              )
            : null}
          {view !== "trash" ? iconKey("notes-selection-color", t("notes.grid.color"), () => setColorOpen(true), <Palette size={22} color={colors.ink} />) : null}
          {view === "notes" || view === "reminders"
            ? iconKey("notes-selection-archive", t("notes.views.archiveAction"), () => void runOnSelection((n) => notesApi.archive(n.id)), <ArchiveIcon size={22} color={colors.ink} />)
            : null}
          {view === "archive"
            ? iconKey("notes-selection-unarchive", t("notes.views.unarchiveAction"), () => void runOnSelection((n) => notesApi.unarchive(n.id)), <ArchiveRestore size={22} color={colors.ink} />)
            : null}
          {view === "trash"
            ? iconKey("notes-selection-restore", t("notes.views.restore"), () => void runOnSelection((n) => notesApi.restore(n.id)), <RotateCcwIcon size={22} color={colors.ink} />)
            : null}
          {view === "trash"
            ? iconKey("notes-selection-forever", t("notes.views.deleteForever"), () => setConfirmForever(true), <Flame size={22} color={colors.danger} />)
            : iconKey("notes-selection-delete", t("notes.grid.delete"), () => setConfirmDelete(true), <Trash2 size={22} color={colors.ink} />)}
        </View>
      ) : (
        <View
          style={{
            flexDirection: "row", alignItems: "center", marginVertical: metrics.space.sm, paddingLeft: 12, paddingRight: 4,
            borderRadius: 999, backgroundColor: colors.surface, minHeight: 52,
          }}
        >
          {iconKey("notes-menu", t("notes.labels.title"), () => setDrawer(true), <Menu size={22} color={colors.ink} />)}
          <TextInput
            testID="notes-search"
            value={query}
            onChangeText={setQuery}
            placeholder={t("notes.grid.search")}
            placeholderTextColor={colors.inkMuted}
            returnKeyType="search"
            accessibilityLabel={t("notes.grid.search")}
            style={{ flex: 1, color: colors.ink, fontSize: 16, paddingHorizontal: 10, paddingVertical: 10 }}
          />
          {query ? iconKey("notes-search-clear", t("common.close"), () => setQuery(""), <X size={20} color={colors.inkMuted} />) : null}
          {iconKey(
            "notes-layout-toggle",
            layout === "grid" ? t("notes.grid.layoutList") : t("notes.grid.layoutGrid"),
            () => setLayout(layout === "grid" ? "list" : "grid"),
            layout === "grid" ? <List size={22} color={colors.ink} /> : <LayoutGrid size={22} color={colors.ink} />,
          )}
          {iconKey(
            "notes-profile",
            t("notes.grid.profile"),
            () => router.push("/profile"),
            <Avatar name={user?.fullName ?? user?.email ?? ""} uri={user?.avatar ?? null} userId={user?.id ?? 0} size={30} />,
          )}
        </View>
      )}

      {view !== "notes" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: metrics.space.xs }}>
          <Text testID="notes-view-title" style={{ flex: 1, fontSize: 18, fontWeight: "600" }} accessibilityRole="header">
            {view === "archive" ? t("notes.views.archive") : view === "reminders" ? t("notes.views.reminders") : t("notes.views.trash")}
          </Text>
          {iconKey("notes-view-close", t("notes.labels.clearFilter"), () => setView("notes"), <X size={20} color={colors.inkMuted} />)}
        </View>
      ) : null}
      {label && view === "notes" ? (
        <View testID="notes-label-filter" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: metrics.space.xs }}>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: "600" }} accessibilityLabel={t("notes.labels.filter", { name: label.name })}>
            {label.name}
          </Text>
          {iconKey("notes-label-filter-clear", t("notes.labels.clearFilter"), () => setLabel(null), <X size={20} color={colors.inkMuted} />)}
        </View>
      ) : null}
      <LoadFailure error={error} loadFailed={t("notes.listLoadFailed")} hasData={notes.length > 0} updatedAt={dataUpdatedAt} onRetry={() => void refetch()} testID="notes-load-failed" />
      {unreadable ? <UnreadableNotice count={unreadable} /> : null}
      {failed ? (
        <Text testID="notes-action-failed" style={{ color: colors.danger, fontSize: 13 }}>
          {t("notes.grid.actionFailed")}
        </Text>
      ) : null}

      {isLoading ? (
        <ActivityIndicator testID="notes-loading" color={colors.inkMuted} style={{ marginTop: metrics.space.xl }} />
      ) : (
        <ScrollView
          testID="notes-list"
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.inkMuted} />}
          contentContainerStyle={{ gap: metrics.space.sm, paddingBottom: 120 }}
          scrollEventThrottle={200}
          onScroll={({ nativeEvent: e }) => {
            const nearEnd = e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 600;
            if (nearEnd && hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
        >
          {notes.length === 0 && !error ? (
            search ? (
              <Text testID="notes-search-empty" tone="muted" style={{ textAlign: "center", marginTop: metrics.space.xl }}>
                {t("notes.grid.searchEmpty", { query: search })}
              </Text>
            ) : (
              <Text testID="notes-empty" tone="muted" style={{ textAlign: "center", marginTop: metrics.space.xl }}>
                {view === "archive" ? t("notes.views.archiveEmpty") : view === "trash" ? t("notes.views.trashEmpty") : t("notes.empty")}
              </Text>
            )
          ) : null}
          {section("pinned", t("notes.pinned"), pinned, true)}
          {section("others", t("notes.others"), others, pinned.length > 0)}
          {isFetchingNextPage ? <ActivityIndicator color={colors.inkMuted} style={{ margin: metrics.space.md }} /> : null}
        </ScrollView>
      )}

      {NOTES_EDITOR_ENABLED && !selecting && view === "notes" ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute", left: 0, right: 0, bottom: 0, height: 72, flexDirection: "row", alignItems: "center",
            backgroundColor: colors.surface, paddingHorizontal: metrics.space.md,
          }}
        >
          {iconKey("notes-new-checklist", t("notes.grid.newChecklist"), () => void create(EMPTY_CHECKLIST), <ListChecks size={24} color={colors.ink} />)}
          <View style={{ flex: 1 }} />
          <Pressable
            testID="notes-new"
            onPress={() => void create("")}
            accessibilityRole="button"
            accessibilityLabel={t("notes.grid.newNote")}
            style={{
              width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center",
              backgroundColor: colors.accent, marginTop: -40, elevation: 4,
              shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
            }}
          >
            <Plus size={30} color={colors.onAccent} />
          </Pressable>
        </View>
      ) : null}

      <NotesDrawer
        visible={drawer}
        currentTagId={label?.id ?? null}
        onClose={() => setDrawer(false)}
        view={view}
        onPick={(tag) => {
          setDrawer(false);
          setView("notes");
          setLabel(tag);
        }}
        onPickView={(v) => {
          setDrawer(false);
          setSelected([]);
          setView(v);
        }}
        onEditLabels={() => {
          setDrawer(false);
          setEditLabels(true);
        }}
      />
      <EditLabelsSheet visible={editLabels} onClose={() => setEditLabels(false)} />
      <NoteColorPicker
        visible={colorOpen}
        value={selectedNotes.length === 1 ? selectedNotes[0].color : null}
        mode={scheme}
        colors={colors}
        title={t("notes.grid.colorTitle")}
        labels={colorLabels}
        onPick={(key) => {
          setColorOpen(false);
          void runOnSelection((n) => notesApi.setColor(n.id, key));
        }}
        onClose={() => setColorOpen(false)}
      />
      <Modal visible={confirmForever} transparent animationType="fade" onRequestClose={() => setConfirmForever(false)}>
        <View style={{ flex: 1, justifyContent: "center", padding: metrics.space.lg, backgroundColor: "rgba(0,0,0,0.4)" }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: metrics.space.lg, gap: metrics.space.md }}>
            <Text style={{ fontWeight: "700", fontSize: 17 }}>{t("notes.views.foreverTitle", { count: selected.length })}</Text>
            <Text tone="muted">{t("notes.views.foreverBody")}</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: metrics.space.md }}>
              <Pressable onPress={() => setConfirmForever(false)} style={{ padding: 10 }}>
                <Text tone="muted">{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                testID="notes-forever-confirm"
                onPress={() => {
                  setConfirmForever(false);
                  void runOnSelection((n) => notesApi.destroyForever(n.id));
                }}
                style={{ padding: 10 }}
              >
                <Text style={{ color: colors.danger, fontWeight: "700" }}>{t("notes.views.deleteForever")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={{ flex: 1, justifyContent: "center", padding: metrics.space.lg, backgroundColor: "rgba(0,0,0,0.4)" }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: metrics.space.lg, gap: metrics.space.md }}>
            <Text style={{ fontWeight: "700", fontSize: 17 }}>{t("notes.grid.deleteTitle", { count: selected.length })}</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: metrics.space.md }}>
              <Pressable testID="notes-delete-cancel" onPress={() => setConfirmDelete(false)} style={{ padding: 10 }}>
                <Text tone="muted">{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                testID="notes-delete-confirm"
                onPress={() => {
                  setConfirmDelete(false);
                  void runOnSelection((n) => notesApi.trash(n.id));
                }}
                style={{ padding: 10 }}
              >
                <Text style={{ color: colors.danger, fontWeight: "700" }}>{t("notes.grid.deleteConfirm")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

/** A card's height, roughly, for balancing the two columns. */
function estimateHeight(note: Note): number {
  const { lines } = cardPreview(note.html, 10);
  return 48 + (note.title ? 24 : 0) + lines.length * 20 + (note.tags.length ? 30 : 0);
}

function NoteCard({
  note, mode, maxLines, selected, onPress, onLongPress,
}: {
  note: Note;
  mode: "dark" | "light";
  maxLines: number;
  selected: boolean;
  onPress(): void;
  onLongPress(): void;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  const tone = noteColor(note.color, mode);
  const { lines, truncated } = useMemo(() => cardPreview(note.html, maxLines), [note.html, maxLines]);
  const body = lines.join("\n") + (truncated ? "\n…" : "");
  return (
    <Pressable
      testID={`note-card-${note.id}`}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={note.title || t("notes.untitled")}
      accessibilityState={{ selected }}
      style={{
        borderRadius: 12,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.accent : tone.border,
        backgroundColor: note.color ? tone.fill : "transparent",
        padding: 12,
        gap: 6,
      }}
    >
      {note.title || note.locked || note.isShared || note.sharedCount > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
          <Text numberOfLines={2} style={{ flex: 1, fontSize: 16, fontWeight: "700", color: colors.ink }}>
            {note.title}
          </Text>
          {note.locked ? (
            <View testID={`note-card-${note.id}-locked`} accessibilityLabel={t("notes.lock.locked")}>
              <LockIcon size={15} color={colors.inkMuted} />
            </View>
          ) : null}
          {note.isShared || note.sharedCount > 0 ? <Users size={16} color={colors.inkMuted} accessibilityLabel={t("notes.shared")} /> : null}
        </View>
      ) : null}
      {body ? <Text style={{ fontSize: 14, lineHeight: 20, color: colors.ink }}>{body}</Text> : null}
      {note.reminder ? (
        <View testID={`note-card-${note.id}-reminder`} style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: `${colors.ink}1f` }}>
          <BellIcon size={12} color={colors.ink} />
          <Text style={{ fontSize: 12, color: colors.ink }}>
            {note.reminder.at.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      ) : null}
      {note.tags.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
          {note.tags.map((tag) => (
            <View key={tag.id} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: `${colors.ink}1f` }}>
              <Text style={{ fontSize: 12, color: colors.ink }}>{tag.name}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}
