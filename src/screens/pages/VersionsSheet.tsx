/**
 * A FILE'S VERSIONS, AND REPLACING IT (parity audit #37, #39; web
 * `VersionsSection.tsx`, `menus.ts` "Replace file").
 *
 * Uploading a new version keeps the old one here (the server does it,
 * `keep_current_version!`). Each earlier version can be opened (shared),
 * restored or deleted; the last two need write access and ask first.
 * "Replace file" in the item menu opens this sheet straight on the picker.
 */
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { Directory, File, Paths } from "expo-file-system";
import { pagesKeys } from "@/api/keys";
import { pagesApi, safeFileName, type NodeVersion, type PageNode } from "@/api/pages";
import { failureMessage } from "@/api/failure";
import { History, RotateCcw, Share2, Trash2 } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { relativeTime } from "@/lib/relativeTime";
import { BottomSheet } from "./drive/sheets";
import { formatBytes } from "./parts";
import { pickDocuments } from "./addFiles";

export function VersionsSheet({ node, canWrite, replaceNow, onClose }: { node: PageNode | null; canWrite: boolean; replaceNow?: boolean; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [sending, setSending] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const started = useRef(false);

  const versions = useQuery({
    queryKey: pagesKeys.versions(node?.spaceId ?? 0, node?.id ?? 0),
    queryFn: () => pagesApi.versions((node as PageNode).spaceId, (node as PageNode).id),
    enabled: Boolean(node),
  });

  const refresh = () => {
    void client.invalidateQueries({ queryKey: pagesKeys.all });
  };

  const replace = async () => {
    if (!node) return;
    const picked = await pickDocuments();
    if (!picked || !("files" in picked) || !picked.files[0]) return;
    const f = picked.files[0];
    setSending(0);
    try {
      await pagesApi.replaceFile(node.spaceId, node.id, { uri: f.uri, name: f.name ?? node.title, mimeType: f.mimeType }, { onProgress: setSending });
      refresh();
    } catch (e) {
      Alert.alert(failureMessage(e, t("pages.versions.replaceFailed")));
    } finally {
      setSending(null);
    }
  };

  // "Replace file" from the item menu: the picker opens once, at once.
  useEffect(() => {
    if (node && replaceNow && canWrite && !started.current) {
      started.current = true;
      void replace();
    }
    if (!node) started.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [node, replaceNow, canWrite]);

  if (!node) return null;

  const share = async (v: NodeVersion) => {
    if (!v.url) return;
    setBusyId(v.id);
    try {
      const dir = new Directory(Paths.cache, "pages-versions", String(v.id));
      dir.create({ intermediates: true, idempotent: true });
      const target = new File(dir, safeFileName(v.filename ?? node.title));
      const file = target.exists ? target : await File.downloadFileAsync(v.url, target, { idempotent: true });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: v.contentType ?? undefined, dialogTitle: file.name });
    } catch (e) {
      Alert.alert(failureMessage(e, t("pages.actions.failed")));
    } finally {
      setBusyId(null);
    }
  };

  const confirm = (title: string, body: string, action: string, danger: boolean, run: () => Promise<unknown>) =>
    Alert.alert(title, body, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: action,
        style: danger ? "destructive" : "default",
        onPress: () =>
          void run()
            .then(refresh)
            .catch((e: unknown) => Alert.alert(failureMessage(e, t("pages.actions.failed")))),
      },
    ]);

  const when = (iso: string) => `${new Date(iso).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" })} (${relativeTime(iso)})`;

  return (
    <BottomSheet open onClose={onClose} testID="pages-versions-sheet">
      <View style={{ paddingHorizontal: metrics.space.xl, gap: metrics.space.sm, paddingBottom: metrics.space.sm }}>
        <Text variant="label" accessibilityRole="header" numberOfLines={2}>
          {t("pages.versions.title", { title: node.title })}
        </Text>
        {canWrite ? (
          <Button
            label={sending != null ? t("pages.versions.sending", { percent: Math.round(sending * 100) }) : t("pages.versions.upload")}
            busy={sending != null}
            onPress={() => void replace()}
            testID="pages-versions-upload"
          />
        ) : null}
        <Text variant="caption" tone="muted">
          {t("pages.versions.hint")}
        </Text>
      </View>
      {versions.isPending ? (
        <ActivityIndicator color={colors.inkMuted} style={{ padding: metrics.space.lg }} />
      ) : versions.isError ? (
        <Text tone="danger" style={{ paddingHorizontal: metrics.space.xl }}>
          {t("pages.versions.loadFailed")}
        </Text>
      ) : (
        <FlatList
          testID="pages-versions-list"
          style={{ maxHeight: 360 }}
          data={versions.data}
          keyExtractor={(v) => String(v.id)}
          ListEmptyComponent={
            <Text tone="muted" style={{ paddingHorizontal: metrics.space.xl, paddingVertical: metrics.space.md }} testID="pages-versions-empty">
              {t("pages.versions.none")}
            </Text>
          }
          renderItem={({ item: v }) => (
            <View testID="pages-version-row" style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingHorizontal: metrics.space.xl, minHeight: 64 }}>
              <History size={20} color={colors.inkMuted} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1}>{when(v.createdAt)}</Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {[formatBytes(v.byteSize, t, i18n.language), v.createdBy].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {v.url ? (
                <Pressable onPress={() => void share(v)} disabled={busyId === v.id} accessibilityRole="button" accessibilityLabel={t("pages.versions.open", { when: when(v.createdAt) })} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }} testID={`pages-version-open-${v.id}`}>
                  {busyId === v.id ? <ActivityIndicator color={colors.inkMuted} /> : <Share2 size={20} color={colors.ink} />}
                </Pressable>
              ) : null}
              {canWrite ? (
                <>
                  <Pressable
                    onPress={() => confirm(t("pages.versions.restoreTitle"), t("pages.versions.restoreBody"), t("pages.versions.restore"), false, () => pagesApi.restoreVersion(node.spaceId, node.id, v.id))}
                    accessibilityRole="button"
                    accessibilityLabel={t("pages.versions.restoreOne", { when: when(v.createdAt) })}
                    style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
                    testID={`pages-version-restore-${v.id}`}
                  >
                    <RotateCcw size={20} color={colors.ink} />
                  </Pressable>
                  <Pressable
                    onPress={() => confirm(t("pages.versions.deleteTitle"), t("pages.versions.deleteBody"), t("pages.versions.delete"), true, () => pagesApi.deleteVersion(node.spaceId, node.id, v.id))}
                    accessibilityRole="button"
                    accessibilityLabel={t("pages.versions.deleteOne", { when: when(v.createdAt) })}
                    style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
                    testID={`pages-version-delete-${v.id}`}
                  >
                    <Trash2 size={20} color={colors.danger} />
                  </Pressable>
                </>
              ) : null}
            </View>
          )}
        />
      )}
    </BottomSheet>
  );
}
