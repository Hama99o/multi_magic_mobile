/**
 * NOTES LINKED TO AN ITEM (parity audit #26, #51; web `LinkNotesDialog`,
 * `NodeViewer` "Linked notes").
 *
 * The notes linked to this file, page or folder, in their order; each opens
 * the note. Whoever can write may link more (a search over their notes,
 * debounced as on the web) and unlink one; unlinking leaves the note itself
 * untouched, so it needs no confirm.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pagesKeys } from "@/api/keys";
import { noteLinksApi } from "@/api/noteLinks";
import { notesApi } from "@/api/notes";
import type { PageNode } from "@/api/pages";
import { failureMessage } from "@/api/failure";
import { Check, NotebookPen, Plus, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { BottomSheet } from "./drive/sheets";

const SEARCH_DELAY_MS = 400;

export function LinkedNotesSheet({ node, canWrite, onClose }: { node: PageNode | null; canWrite: boolean; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setQuery(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [typed]);
  useEffect(() => {
    if (!node) {
      setPicking(false);
      setTyped("");
    }
  }, [node]);

  const links = useQuery({
    queryKey: pagesKeys.noteLinks(node?.spaceId ?? 0, node?.id ?? 0),
    queryFn: () => noteLinksApi.list((node as PageNode).spaceId, (node as PageNode).id),
    enabled: Boolean(node),
  });
  const notes = useQuery({
    queryKey: pagesKeys.notePicker(query),
    queryFn: () => notesApi.list(1, query || undefined),
    enabled: Boolean(node) && picking,
  });

  if (!node) return null;
  const rows = links.data?.rows ?? [];
  const linked = new Set(rows.map((r) => r.noteId));
  const refresh = () => client.invalidateQueries({ queryKey: pagesKeys.noteLinks(node.spaceId, node.id) });

  const link = async (noteId: number) => {
    setBusy(noteId);
    try {
      await noteLinksApi.create(node.spaceId, node.id, noteId, rows.length);
      await refresh();
    } catch (e) {
      Alert.alert(failureMessage(e, t("pages.notes.linkFailed")));
    } finally {
      setBusy(null);
    }
  };
  const unlink = async (linkId: number, noteId: number) => {
    setBusy(noteId);
    try {
      await noteLinksApi.remove(node.spaceId, node.id, linkId);
      await refresh();
    } catch (e) {
      Alert.alert(failureMessage(e, t("pages.notes.unlinkFailed")));
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet open onClose={onClose} testID="pages-notes-sheet">
      <View style={{ paddingHorizontal: metrics.space.xl, gap: metrics.space.sm, paddingBottom: metrics.space.sm }}>
        <Text variant="label" accessibilityRole="header" numberOfLines={2}>
          {t("pages.notes.title", { title: node.title })}
        </Text>
      </View>
      {picking ? (
        <View style={{ paddingHorizontal: metrics.space.xl, gap: metrics.space.sm }}>
          <TextInput
            testID="pages-notes-search"
            value={typed}
            onChangeText={setTyped}
            autoFocus
            placeholder={t("pages.notes.search")}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t("pages.notes.search")}
            style={{ minHeight: metrics.touch, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, backgroundColor: colors.surface }}
          />
          {notes.isPending ? (
            <ActivityIndicator color={colors.inkMuted} />
          ) : (
            <FlatList
              testID="pages-notes-results"
              style={{ maxHeight: 280 }}
              keyboardShouldPersistTaps="handled"
              data={notes.data?.notes ?? []}
              keyExtractor={(n) => String(n.id)}
              ListEmptyComponent={<Text tone="muted">{t("pages.notes.noResults")}</Text>}
              renderItem={({ item }) => {
                const already = linked.has(item.id);
                return (
                  <Pressable
                    testID={`pages-notes-pick-${item.id}`}
                    disabled={already || busy === item.id}
                    onPress={() => void link(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={already ? t("pages.notes.alreadyLinked", { title: item.title || t("pages.notes.untitled") }) : t("pages.notes.linkOne", { title: item.title || t("pages.notes.untitled") })}
                    accessibilityState={{ disabled: already }}
                    style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch }}
                  >
                    {busy === item.id ? <ActivityIndicator color={colors.inkMuted} /> : already ? <Check size={18} color={colors.accent} /> : <Plus size={18} color={colors.ink} />}
                    <Text numberOfLines={1} tone={already ? "muted" : "default"} style={{ flex: 1 }}>
                      {item.title || t("pages.notes.untitled")}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}
          <Button tone="neutral" label={t("pages.notes.done")} onPress={() => setPicking(false)} testID="pages-notes-done" />
        </View>
      ) : (
        <View style={{ paddingHorizontal: metrics.space.xl, gap: metrics.space.sm }}>
          {links.isPending ? (
            <ActivityIndicator color={colors.inkMuted} />
          ) : links.isError ? (
            <Text tone="danger">{t("pages.notes.loadFailed")}</Text>
          ) : rows.length === 0 ? (
            <Text tone="muted" testID="pages-notes-empty">
              {t("pages.notes.none")}
            </Text>
          ) : (
            rows.map((r) => (
              <View key={r.id} testID="pages-notes-row" style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch }}>
                <Pressable
                  onPress={() => {
                    onClose();
                    router.push({ pathname: "/notes/note", params: { id: String(r.noteId) } });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t("pages.notes.open", { title: r.noteTitle || t("pages.notes.untitled") })}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch }}
                  testID={`pages-notes-open-${r.noteId}`}
                >
                  <NotebookPen size={18} color={colors.inkMuted} />
                  <Text numberOfLines={1} style={{ flex: 1 }}>
                    {r.noteTitle || t("pages.notes.untitled")}
                  </Text>
                </Pressable>
                {canWrite ? (
                  <Pressable
                    onPress={() => void unlink(r.id, r.noteId)}
                    disabled={busy === r.noteId}
                    accessibilityRole="button"
                    accessibilityLabel={t("pages.notes.unlink", { title: r.noteTitle || t("pages.notes.untitled") })}
                    style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
                    testID={`pages-notes-unlink-${r.noteId}`}
                  >
                    {busy === r.noteId ? <ActivityIndicator color={colors.inkMuted} /> : <X size={18} color={colors.inkMuted} />}
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
          {canWrite ? <Button label={t("pages.notes.link")} onPress={() => setPicking(true)} testID="pages-notes-link" /> : null}
        </View>
      )}
    </BottomSheet>
  );
}
