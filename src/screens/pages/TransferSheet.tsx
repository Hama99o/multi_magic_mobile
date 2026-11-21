/**
 * ONE BACKGROUND TRANSFER, FOLLOWED TO ITS END (parity audit #12, #25, #28,
 * #33, #34; web `TransferProgressDialog.tsx`).
 *
 * Asks the server every second while it works (the web listens on
 * ActionCable; a poll is the same answer without a socket), shows the
 * progress and the server's own message ("Zipping 12 files"), and can be
 * cancelled. When it is done:
 * - an export's ZIP is fetched, then shared or saved to a folder;
 * - an import or a copy opens what it made.
 * Closing the sheet does not stop the work; Cancel does.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { useNav } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pagesKeys } from "@/api/keys";
import { isFinished, transfersApi, type Transfer } from "@/api/transfers";
import { failureMessage } from "@/api/failure";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { BottomSheet } from "./drive/sheets";
import { fetchArtifact, saveArtifact, shareArtifact } from "./transferFiles";
import { followAfterClose } from "./transferFollow";

const POLL_MS = 1000;

const TITLES = {
  export: "pages.transfer.exportTitle",
  import: "pages.transfer.importTitle",
  copy: "pages.transfer.copyTitle",
} as const;

export function TransferSheet({ started, onClose }: { started: Transfer | null; onClose: () => void }) {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const [busy, setBusy] = useState<"share" | "save" | "cancel" | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const followed = useQuery({
    queryKey: pagesKeys.transfer(started?.id ?? 0),
    queryFn: () => transfersApi.show(started?.id as number),
    enabled: Boolean(started),
    initialData: started ?? undefined,
    refetchInterval: (q) => (q.state.data && isFinished(q.state.data) ? false : POLL_MS),
  });
  const transfer = followed.data ?? started;
  const done = transfer?.state === "done";

  // What an import or a copy made shows up in every list.
  useEffect(() => {
    if (done && transfer && transfer.kind !== "export") void client.invalidateQueries({ queryKey: pagesKeys.all });
  }, [done, transfer, client]);

  useEffect(() => setSaid(null), [started?.id]);

  if (!started || !transfer) return null;

  // Closed while an import or a copy still runs: keep following it, so the lists
  // catch up when it is done (review 88, P7).
  const close = () => {
    followAfterClose(transfer, client);
    onClose();
  };

  const withArtifact = async (fn: (file: Awaited<ReturnType<typeof fetchArtifact>>) => Promise<string | null>, which: "share" | "save") => {
    if (!transfer.artifactUrl) return;
    setBusy(which);
    try {
      const file = await fetchArtifact(transfer.artifactUrl, transfer.artifactFilename ?? "export.zip", transfer.id);
      setSaid(await fn(file));
    } catch (e) {
      setSaid(failureMessage(e, t("pages.actions.failed")));
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    try {
      await transfersApi.cancel(transfer.id);
      onClose();
    } catch (e) {
      Alert.alert(failureMessage(e, t("pages.actions.failed")));
    } finally {
      setBusy(null);
    }
  };

  const open = () => {
    onClose();
    if (transfer.resultNodeId && transfer.resultSpaceId) {
      router.push({ pathname: "/pages/folder", params: { spaceId: String(transfer.resultSpaceId), parentId: String(transfer.resultNodeId) } });
    } else if (transfer.resultSpaceId) {
      router.push({ pathname: "/pages/folder", params: { spaceId: String(transfer.resultSpaceId) } });
    }
  };

  return (
    <BottomSheet open onClose={close} testID="pages-transfer-sheet">
      <View style={{ paddingHorizontal: metrics.space.xl, gap: metrics.space.md, paddingBottom: metrics.space.sm }}>
        <Text variant="label" accessibilityRole="header">
          {t(TITLES[transfer.kind])}
        </Text>
        {transfer.state === "failed" ? (
          <Text tone="danger" accessibilityLiveRegion="assertive" testID="pages-transfer-failed">
            {transfer.error ?? t("pages.transfer.failed")}
          </Text>
        ) : done ? (
          <Text accessibilityLiveRegion="polite" testID="pages-transfer-done">
            {transfer.kind === "export" ? t("pages.transfer.exportReady", { name: transfer.artifactFilename ?? "" }) : t("pages.transfer.made")}
          </Text>
        ) : (
          <View style={{ gap: metrics.space.sm }} accessibilityLiveRegion="polite">
            <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
              <ActivityIndicator color={colors.accent} />
              <Text style={{ flex: 1 }} numberOfLines={2} testID="pages-transfer-message">
                {transfer.message ?? (transfer.state === "enqueued" ? t("pages.transfer.waiting") : t("pages.transfer.working"))}
              </Text>
              <Text variant="label">{t("pages.transfer.percent", { percent: Math.round(transfer.progress) })}</Text>
            </View>
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(transfer.progress) }}
              style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" }}
            >
              <View style={{ width: `${transfer.progress}%`, height: 6, backgroundColor: colors.accent }} />
            </View>
          </View>
        )}
        {said ? <Text testID="pages-transfer-said">{said}</Text> : null}
        {done && transfer.kind === "export" && transfer.artifactUrl ? (
          <>
            <Button
              label={t("pages.transfer.share")}
              busy={busy === "share"}
              onPress={() => void withArtifact(async (f) => ((await shareArtifact(f)) === "unavailable" ? t("pages.transfer.noShare") : null), "share")}
              testID="pages-transfer-share"
            />
            <Button
              tone="neutral"
              label={t("pages.transfer.save")}
              busy={busy === "save"}
              onPress={() => void withArtifact(async (f) => ((await saveArtifact(f)) === "saved" ? t("pages.transfer.saved", { name: f.name }) : null), "save")}
              testID="pages-transfer-save"
            />
          </>
        ) : null}
        {done && transfer.kind !== "export" && transfer.resultSpaceId ? <Button label={t("pages.transfer.open")} onPress={open} testID="pages-transfer-open" /> : null}
        {!isFinished(transfer) ? <Button tone="neutral" label={t("pages.transfer.cancel")} busy={busy === "cancel"} onPress={() => void cancel()} testID="pages-transfer-cancel" /> : null}
        {isFinished(transfer) ? <Button tone="neutral" label={t("pages.transfer.close")} onPress={onClose} testID="pages-transfer-close" /> : null}
      </View>
    </BottomSheet>
  );
}
