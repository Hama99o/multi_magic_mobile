/**
 * UPLOADS — what is going up, how far along, and what needs a tap.
 * `docs/design/pages/SPEC.md` §3.
 *
 * One row per file: name, destination, a bar, and "412 MB of 1.8 GB". A
 * failed row says WHY in words (quota, too large, signed out, connection)
 * and offers Retry; every unfinished row offers Cancel. Nothing here is
 * needed for the upload to happen — it is a window onto the queue, which
 * keeps running with this screen closed.
 */
import { useEffect } from "react";
import { FlatList, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Check, RotateCw, X } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { EmptyLine, HeaderButton, PagesHeader, formatBytes } from "@/screens/pages/parts";
import { useUploads, type UploadError, type UploadItem } from "@/stores/uploads.store";

function errorKey(error: UploadError | null): string {
  switch (error) {
    case "quota":
      return "pages.uploads.errorQuota";
    case "tooLarge":
      return "pages.uploads.errorTooLarge";
    case "signedOut":
      return "pages.uploads.errorSignedOut";
    case "missingFile":
      return "pages.uploads.errorMissing";
    case "network":
      return "pages.uploads.errorNetwork";
    default:
      return "pages.uploads.errorServer";
  }
}

function UploadRow({ item }: { item: UploadItem }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const retry = useUploads((s) => s.retry);
  const cancel = useUploads((s) => s.cancel);
  const fraction = item.size > 0 ? Math.min(1, item.sent / item.size) : 0;

  let line: string;
  if (item.status === "done") line = t("pages.uploads.done", { place: item.destination.label });
  else if (item.status === "failed") line = t(errorKey(item.error));
  else if (item.status === "checking") line = t("pages.uploads.checking");
  else if (item.status === "preparing") line = t("pages.uploads.preparing");
  else if (item.status === "uploading" && item.sent === 0) line = t("pages.uploads.sending");
  else if (item.status === "queued")
    line = item.error === "network" ? t("pages.uploads.retrying") : t("pages.uploads.waiting");
  else
    line = t("pages.uploads.progress", {
      sent: formatBytes(item.sent, t, i18n.language),
      total: formatBytes(item.size, t, i18n.language),
    });

  return (
    <View style={{ paddingVertical: metrics.space.md, gap: metrics.space.xs }} testID={`pages-upload-${item.status}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1}>{item.fileName}</Text>
          <Text variant="caption" tone={item.status === "failed" ? "danger" : "muted"} numberOfLines={2}>
            {line}
          </Text>
        </View>
        {item.status === "done" ? <Check size={20} color={colors.accent} /> : null}
        {item.status === "failed" && item.error !== "tooLarge" && item.error !== "missingFile" ? (
          <HeaderButton icon={RotateCw} label={t("pages.uploads.retry")} onPress={() => retry(item.id)} testID="pages-upload-retry" />
        ) : null}
        {item.status !== "done" ? (
          <HeaderButton icon={X} label={t("pages.uploads.cancel")} onPress={() => cancel(item.id)} testID="pages-upload-cancel" />
        ) : null}
      </View>
      {item.status === "uploading" || item.status === "queued" ? (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
          style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden" }}
        >
          <View style={{ width: `${fraction * 100}%`, height: 4, backgroundColor: colors.accent }} />
        </View>
      ) : null}
      {item.status !== "done" ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {t("pages.uploads.to", { place: item.destination.label })}
        </Text>
      ) : null}
    </View>
  );
}

export default function Uploads() {
  const colors = useColors();
  const { t } = useTranslation();
  const items = useUploads((s) => s.items);
  const hydrate = useUploads((s) => s.hydrate);
  const clearFinished = useUploads((s) => s.clearFinished);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const active = items.filter((i) => i.status !== "done" && i.status !== "failed").length;
  const finished = items.filter((i) => i.status === "done").length;

  return (
    <Screen measure>
      <PagesHeader
        title={t("pages.uploads.title")}
        subtitle={active > 0 ? t("pages.uploads.active", { count: active }) : null}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/pages"))}
        right={
          finished > 0 ? (
            <Pressable onPress={clearFinished} accessibilityRole="button" hitSlop={8} testID="pages-uploads-clear">
              <Text tone="accent" variant="label">
                {t("pages.uploads.clear")}
              </Text>
            </Pressable>
          ) : null
        }
      />
      {active > 0 ? (
        <Text variant="caption" tone="muted" testID="pages-uploads-keep-going">
          {t("pages.uploads.keepGoing")}
        </Text>
      ) : null}
      <FlatList
        testID="pages-uploads-list"
        data={[...items].reverse()}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <UploadRow item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border, opacity: 0.5 }} />}
        ListEmptyComponent={<EmptyLine title={t("pages.uploads.emptyTitle")} body={t("pages.uploads.emptyBody")} testID="pages-uploads-empty" />}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
