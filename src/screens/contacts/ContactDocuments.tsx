/**
 * The Documents section of a contact's card (audit #8), what the web's
 * `ContactDrawer.tsx` shows: each file with its icon or thumbnail, name and
 * size; tap to open it (`app/contacts/document.tsx`); Add from the photo
 * library or Files; Rename and Delete from the row's menu.
 *
 * Newest first (owner rule, 2026-11-09; `parseDocuments`). The server sends
 * every document with the contact, unpaged, so there is nothing to page.
 *
 * Different from the web, on purpose: Delete asks first, naming the file (the
 * web's ✕ deletes at once), and a file the server would refuse (type, 20 MB)
 * is refused here before it is sent, with the reason per file.
 */
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { FolderOpen, Images, MoreVertical, Pencil, Plus, Trash2, Eye } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { failureMessage } from "@/api/failure";
import type { ContactDocument } from "@/api/contacts";
import { explainPick, type PickResult } from "@/screens/pages/addFiles";
import { NameDialog } from "@/screens/pages/ItemSheet";
import { SHEET_CLOSE_MS } from "@/screens/pages/drive/sheets";
import { NodeGlyph, formatBytes } from "@/screens/pages/parts";
import { ActionSheet } from "@/screens/contacts/ActionSheet";
import { useContactDocuments } from "@/screens/contacts/useContactMutations";
import { asPageNode, pickDocuments, pickPhotos, sortPicked } from "@/screens/contacts/documents";

/** After the sheet has slid away: iOS will not present a picker or a second
 *  Modal over one still leaving (Pages' `NewSheet` waits the same). */
const afterSheet = (fn: () => void) => setTimeout(fn, SHEET_CLOSE_MS);

export function ContactDocuments({
  contactId,
  documents,
}: {
  contactId: number;
  /** null while only the list row is known: the full card is on its way.
   *  If it fails, the card itself says so with Try again (`ContactCard`),
   *  since React Query drops the placeholder row on an error. */
  documents: ContactDocument[] | null;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const { upload, rename, remove } = useContactDocuments(contactId);
  const [adding, setAdding] = useState(false);
  const [menuFor, setMenuFor] = useState<ContactDocument | null>(null);
  const [renaming, setRenaming] = useState<ContactDocument | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  const add = async (pick: () => Promise<PickResult>) => {
    const files = explainPick(await pick(), t);
    if (!files) return;
    const { ready, refused } = sortPicked(files);
    if (refused.length) {
      Alert.alert(
        t("contacts.documents.refusedTitle"),
        refused.map((r) => `${r.name}: ${r.why === "type" ? t("contacts.documents.refusedType") : t("contacts.documents.refusedSize")}`).join("\n"),
      );
    }
    if (!ready.length) return;
    upload.mutate(ready, { onError: (e) => Alert.alert(t("contacts.documents.uploadFailed"), failureMessage(e, t("contacts.documents.uploadFailed"))) });
  };

  const open = (doc: ContactDocument) =>
    router.push({ pathname: "/contacts/document", params: { contactId: String(contactId), documentId: String(doc.id) } });

  const confirmDelete = (doc: ContactDocument) =>
    Alert.alert(t("contacts.documents.deleteTitle", { name: doc.filename }), t("contacts.documents.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => remove.mutate(doc.id, { onError: (e) => Alert.alert(t("contacts.documents.deleteFailed"), failureMessage(e, t("contacts.documents.deleteFailed"))) }),
      },
    ]);

  const saveName = (name: string) => {
    if (!renaming) return;
    if (name === renaming.filename) {
      setRenaming(null);
      return;
    }
    setRenameError(null);
    rename.mutate(
      { documentId: renaming.id, filename: name },
      { onSuccess: () => setRenaming(null), onError: (e) => setRenameError(failureMessage(e, t("contacts.documents.renameFailed"))) },
    );
  };

  return (
    <View testID="contact-documents" style={{ gap: metrics.space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text variant="label" tone="muted" accessibilityRole="header" style={{ flex: 1 }}>
          {t("contacts.documents.title")}
        </Text>
        {upload.isPending ? (
          <View testID="contact-documents-uploading" style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 }}>
            <ActivityIndicator color={colors.inkMuted} />
            <Text variant="caption" tone="muted">
              {t("contacts.documents.uploading")}
            </Text>
          </View>
        ) : (
          <Pressable
            testID="contact-documents-add"
            onPress={() => setAdding(true)}
            accessibilityRole="button"
            accessibilityLabel={t("contacts.documents.addTitle")}
            hitSlop={6}
            style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <Plus size={16} color={colors.accent} />
            <Text variant="label" tone="accent">
              {t("contacts.documents.add")}
            </Text>
          </Pressable>
        )}
      </View>

      {documents == null ? (
        <ActivityIndicator testID="contact-documents-loading" color={colors.inkMuted} style={{ alignSelf: "flex-start" }} />
      ) : documents.length === 0 ? (
        <Text testID="contact-documents-empty" tone="muted" variant="caption">
          {t("contacts.documents.empty")}
        </Text>
      ) : (
        <View style={{ borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
          {documents.map((doc, i) => {
            const size = formatBytes(doc.byteSize, t, i18n.language);
            return (
              <View key={doc.id} style={{ flexDirection: "row", alignItems: "center", borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <Pressable
                  testID={`contact-document-${doc.id}`}
                  onPress={() => open(doc)}
                  accessibilityRole="button"
                  accessibilityLabel={`${doc.filename}, ${size}`}
                  android_ripple={{ color: colors.border }}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 64, paddingHorizontal: metrics.space.md, paddingVertical: metrics.space.sm }}
                >
                  <NodeGlyph node={asPageNode(doc, contactId)} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1}>{doc.filename}</Text>
                    <Text variant="caption" tone="muted">
                      {size}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  testID={`contact-document-${doc.id}-more`}
                  onPress={() => setMenuFor(doc)}
                  accessibilityRole="button"
                  accessibilityLabel={t("contacts.documents.more", { name: doc.filename })}
                  hitSlop={4}
                  style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
                >
                  <MoreVertical size={20} color={colors.inkMuted} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <ActionSheet
        open={adding}
        title={t("contacts.documents.addTitle")}
        actions={[
          { key: "library", label: t("contacts.documents.fromLibrary"), icon: Images, onPress: () => afterSheet(() => void add(pickPhotos)) },
          { key: "files", label: t("contacts.documents.fromFiles"), icon: FolderOpen, onPress: () => afterSheet(() => void add(pickDocuments)) },
        ]}
        onClose={() => setAdding(false)}
        testID="contact-documents-source"
      />
      <ActionSheet
        open={menuFor != null}
        title={menuFor?.filename ?? ""}
        actions={
          menuFor
            ? [
                { key: "open", label: t("contacts.documents.open"), icon: Eye, onPress: () => open(menuFor) },
                {
                  key: "rename",
                  label: t("contacts.documents.rename"),
                  icon: Pencil,
                  onPress: () => {
                    const doc = menuFor;
                    setRenameError(null);
                    afterSheet(() => setRenaming(doc));
                  },
                },
                { key: "delete", label: t("common.delete"), icon: Trash2, danger: true, onPress: () => confirmDelete(menuFor) },
              ]
            : []
        }
        onClose={() => setMenuFor(null)}
        testID="contact-document-menu"
      />
      <NameDialog
        open={renaming != null}
        title={t("contacts.documents.rename")}
        confirm={t("contacts.documents.rename")}
        initial={renaming?.filename ?? ""}
        onCancel={() => setRenaming(null)}
        onSubmit={saveName}
        busy={rename.isPending}
        error={renameError}
      />
    </View>
  );
}
