/**
 * LINKED IN PAGES — the web's panel under a note (`notes/Show.tsx:453-490`,
 * `note_links#index`): every page in Pages that links this note, as
 * "space › page". On the phone the editor fills the screen, so it is a chip
 * beside "Shared with" that opens the list. As on the web, only the owner can
 * open a page from it: the others may not see the space.
 */
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SheetFrame } from "@/components/SheetFrame";
import { useNav } from "@/lib/nav";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/reusables/text";
import { ChevronRight, FileText, X } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import type { Note, NoteLink } from "@/api/notes";
import { useNoteLinks } from "./api/queries";

/** Where a link goes in Pages: a folder opens as a folder, anything else in the viewer. */
export function linkRoute(link: NoteLink) {
  const node = link.node;
  if (!node) return null;
  return node.kind === "folder"
    ? { pathname: "/pages/folder" as const, params: { spaceId: String(node.spaceId), parentId: String(node.id), title: node.title } }
    : { pathname: "/pages/view" as const, params: { spaceId: String(node.spaceId), nodeId: String(node.id), title: node.title } };
}

export function NoteLinksChip({ note }: { note: Pick<Note, "id" | "role"> }) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const { data: links = [] } = useNoteLinks(note.id);
  const [open, setOpen] = useState(false);
  if (!links.length) return null;
  const owner = note.role === "owner";
  return (
    <>
      <Pressable
        testID="note-links"
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 4, marginBottom: metrics.space.xs }}
      >
        <FileText size={14} color={colors.ink} />
        <Text style={{ fontSize: 13 }}>{t("notes.links.chip", { count: links.length })}</Text>
      </Pressable>
      <SheetFrame visible={open} onClose={() => setOpen(false)} closeLabel={t("common.close")} testID="note-links-sheet" maxHeight="70%" style={{ padding: metrics.space.lg, gap: metrics.space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: "700" }} accessibilityRole="header">
            {t("notes.links.title")}
          </Text>
          <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.close")} style={{ padding: 8 }}>
            <X size={22} color={colors.ink} />
          </Pressable>
        </View>
        {!owner ? (
          <Text tone="muted" style={{ fontSize: 13 }}>
            {t("notes.links.ownerOnly")}
          </Text>
        ) : null}
        <ScrollView style={{ flexGrow: 0 }}>
          {links.map((link) => {
            const to = owner ? linkRoute(link) : null;
            const space = link.node?.space;
            return (
              <Pressable
                key={link.id}
                testID={`note-link-${link.id}`}
                onPress={
                  to
                    ? () => {
                        setOpen(false);
                        router.push(to);
                      }
                    : undefined
                }
                disabled={!to}
                accessibilityRole="button"
                accessibilityState={{ disabled: !to }}
                style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Text style={{ fontSize: 18 }}>{space?.icon || "📄"}</Text>
                {link.node ? (
                  <>
                    <Text tone="muted" numberOfLines={1} style={{ flexShrink: 1, maxWidth: "40%", fontSize: 15 }}>
                      {space?.title ?? ""}
                    </Text>
                    <ChevronRight size={14} color={colors.inkMuted} />
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: to ? colors.ink : colors.inkMuted }}>
                      {link.node.title || t("notes.untitled")}
                    </Text>
                  </>
                ) : (
                  <Text tone="muted" style={{ flex: 1, fontSize: 15 }}>
                    {t("notes.links.gone")}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </SheetFrame>
    </>
  );
}
