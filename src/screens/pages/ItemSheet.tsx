/**
 * What can be done with one item, from a long press — and EXPORT, which is
 * the half of "in and out" that leaves the app.
 * `docs/design/pages/SPEC.md` §4.
 *
 * "Share / Save to Files" downloads the file into the cache (once per
 * version, `downloadToCache`) and hands it to the system share sheet
 * (`expo-sharing`), which on iOS is where "Save to Files", "Save Video",
 * AirDrop and every other app already live, and on Android is the chooser
 * with Drive, Files and the rest. One door, every destination, nothing to
 * build per app.
 */
import { useCallback, useState } from "react";
import { ActivityIndicator, Modal, Pressable, TextInput, View } from "react-native";
import * as Sharing from "expo-sharing";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FILL } from "@/theme/fill";
import { Download, Eye, FolderOpen, type LucideIcon } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { downloadToCache, type PageNode } from "@/api/pages";
import { failureMessage } from "@/api/failure";
import { NodeGlyph, metaLine } from "./parts";

export async function shareNode(node: PageNode): Promise<void> {
  const uri = await downloadToCache(node);
  await Sharing.shareAsync(uri, { mimeType: node.mimeType ?? undefined, dialogTitle: node.title });
}

function Row({ icon: Icon, label, onPress, testID, busy }: { icon: LucideIcon; label: string; onPress: () => void; testID: string; busy?: boolean }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: Boolean(busy) }}
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: metrics.touch + 8 }}
      testID={testID}
    >
      {busy ? <ActivityIndicator color={colors.inkMuted} /> : <Icon size={22} color={colors.ink} />}
      <Text>{label}</Text>
    </Pressable>
  );
}

export function ItemSheet({ node, onClose, onOpen }: { node: PageNode | null; onClose: () => void; onOpen: (node: PageNode) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = useCallback(async () => {
    if (!node) return;
    setBusy(true);
    setError(null);
    try {
      await shareNode(node);
      onClose();
    } catch (e) {
      setError(failureMessage(e, t("pages.item.shareFailed")));
    } finally {
      setBusy(false);
    }
  }, [node, onClose, t]);

  if (!node) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.5)" }} />
        <View
          style={{
            backgroundColor: colors.ground,
            borderTopLeftRadius: metrics.radius.lg,
            borderTopRightRadius: metrics.radius.lg,
            padding: metrics.space.lg,
            paddingBottom: metrics.space.lg + insets.bottom,
            width: "100%",
            maxWidth: metrics.maxMeasure,
            alignSelf: "center",
            gap: metrics.space.sm,
          }}
          testID="pages-item-sheet"
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, paddingBottom: metrics.space.sm }}>
            <NodeGlyph node={node} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="label" numberOfLines={2}>
                {node.title}
              </Text>
              <Text variant="caption" tone="muted">
                {metaLine(node, t, i18n.language)}
              </Text>
            </View>
          </View>
          <Row
            icon={node.kind === "folder" ? FolderOpen : Eye}
            label={node.kind === "folder" ? t("pages.item.openFolder") : t("pages.item.open")}
            onPress={() => {
              onClose();
              onOpen(node);
            }}
            testID="pages-item-open"
          />
          {node.kind === "file" && node.attachmentUrl ? (
            <Row icon={Download} label={t("pages.item.share")} onPress={() => void share()} busy={busy} testID="pages-item-share" />
          ) : null}
          {error ? (
            <Text tone="danger" testID="pages-item-error">
              {error}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/** A name, asked for: New folder. Android has no `Alert.prompt`. */
export function NameDialog({
  open,
  title,
  confirm,
  onCancel,
  onSubmit,
  busy,
  error,
  initial = "",
}: {
  open: boolean;
  title: string;
  confirm: string;
  /** Rename starts from the current name. */
  initial?: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  const [shownFor, setShownFor] = useState<string | null>(null);
  // Reset to `initial` each time the dialog opens for a different item.
  if (open && shownFor !== initial) {
    setShownFor(initial);
    setName(initial);
  }
  if (!open) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: "center", padding: metrics.space.xl }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onCancel} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.5)" }} />
        <View
          style={{
            backgroundColor: colors.ground,
            borderRadius: metrics.radius.lg,
            padding: metrics.space.lg,
            gap: metrics.space.md,
            width: "100%",
            maxWidth: 420,
            alignSelf: "center",
          }}
          testID="pages-name-dialog"
        >
          <Text variant="label">{title}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            selectTextOnFocus
            onSubmitEditing={() => name.trim() && onSubmit(name.trim())}
            returnKeyType="done"
            accessibilityLabel={title}
            style={{
              minHeight: 44,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: metrics.radius.md,
              paddingHorizontal: metrics.space.md,
              color: colors.ink,
              backgroundColor: colors.surface,
            }}
            testID="pages-name-input"
          />
          {error ? <Text tone="danger">{error}</Text> : null}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: metrics.space.sm }}>
            <Button label={t("common.cancel")} tone="neutral" block={false} onPress={onCancel} testID="pages-name-cancel" />
            <Button
              label={confirm}
              block={false}
              busy={busy}
              disabled={!name.trim()}
              onPress={() => onSubmit(name.trim())}
              testID="pages-name-confirm"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
