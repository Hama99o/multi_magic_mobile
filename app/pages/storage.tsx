/**
 * STORAGE (parity audit Pages #6; web `StorageView.tsx`).
 *
 * How full the allowance is, which app holds what (one colour each; the bar
 * doubles as the legend), what the trash could give back, and the biggest
 * files — the three things someone who ran out of room needs to see. A
 * largest file opens where it is; one in the trash opens the trash.
 */
import { ScrollView, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { storageKeys } from "@/api/keys";
import { FULL_THRESHOLD, storageApi, type StorageApp } from "@/api/storage";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { ChevronRight, Trash2 } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { APP_COLORS, LIME } from "@/theme/appColors";
import { CATEGORY_COLORS } from "@/theme/tokens";
import { formatBytes } from "@/screens/pages/parts";

/** One colour per app: the app's own where it has one on Home, the icon's palette otherwise. */
const SLICE: Record<StorageApp, string> = {
  page_app: APP_COLORS.pages,
  notes: APP_COLORS.notes,
  editor: CATEGORY_COLORS[4],
  contacts: APP_COLORS.contacts,
  ai: APP_COLORS.assistant,
  doc: CATEGORY_COLORS[0],
  profile: CATEGORY_COLORS[2],
  fields: CATEGORY_COLORS[3],
  tables: LIME,
};

const LABEL: Record<StorageApp, string> = {
  page_app: "pages.storage.apps.page_app",
  notes: "pages.storage.apps.notes",
  editor: "pages.storage.apps.editor",
  contacts: "pages.storage.apps.contacts",
  ai: "pages.storage.apps.ai",
  doc: "pages.storage.apps.doc",
  profile: "pages.storage.apps.profile",
  fields: "pages.storage.apps.fields",
  tables: "pages.storage.apps.tables",
};

export default function StorageScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const usage = useQuery({ queryKey: storageKeys.usage(), queryFn: storageApi.show, staleTime: 30_000 });
  const bytes = (n: number) => formatBytes(n, t, i18n.language);
  const data = usage.data;
  const full = (data?.percentUsed ?? 0) >= FULL_THRESHOLD;

  return (
    <Screen measure>
      <AppHeader app="pages" title={t("pages.storage.title")} back />
      {usage.isPending ? (
        <RowsSkeleton />
      ) : !data ? (
        <LoadFailure error={usage.error} loadFailed={t("pages.storage.loadFailed")} hasData={false} updatedAt={usage.dataUpdatedAt} onRetry={() => void usage.refetch()} testID="pages-storage-failed" />
      ) : (
        <ScrollView contentContainerStyle={{ gap: metrics.space.lg, paddingVertical: metrics.space.md }} testID="pages-storage">
          <View style={{ gap: metrics.space.sm }}>
            <Text variant="title" accessibilityRole="header" testID="pages-storage-used">
              {t("pages.storage.usedOf", { used: bytes(data.totalBytes), limit: bytes(data.limitBytes) })}
            </Text>
            {/* The bar is the legend too: one slice per app, in the list's order. */}
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={t("pages.storage.percent", { percent: Math.round(data.percentUsed) })}
              accessibilityValue={{ min: 0, max: 100, now: Math.round(data.percentUsed) }}
              style={{ height: 14, borderRadius: 7, overflow: "hidden", flexDirection: "row", backgroundColor: colors.border }}
              testID="pages-storage-bar"
            >
              {data.limitBytes > 0
                ? data.byApp.map((a) => (
                    <View key={a.app} style={{ width: `${Math.min(100, (a.bytes / data.limitBytes) * 100)}%`, backgroundColor: full ? colors.danger : SLICE[a.app] }} />
                  ))
                : null}
            </View>
            <Text tone={full ? "danger" : "muted"} testID="pages-storage-available">
              {full ? t("pages.storage.almostFull", { available: bytes(data.availableBytes) }) : t("pages.storage.available", { available: bytes(data.availableBytes) })}
            </Text>
          </View>

          {data.byApp.length ? (
            <View style={{ gap: metrics.space.xs }} testID="pages-storage-apps">
              <Text variant="label" tone="muted" accessibilityRole="header">
                {t("pages.storage.byApp")}
              </Text>
              {data.byApp.map((a) => (
                <View key={a.app} style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: 36 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: SLICE[a.app] }} />
                  <Text style={{ flex: 1 }}>{t(LABEL[a.app])}</Text>
                  <Text tone="muted">{bytes(a.bytes)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {data.trashedBytes > 0 ? (
            <View style={{ gap: metrics.space.sm, padding: metrics.space.md, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }} testID="pages-storage-trash">
              <Text>{t("pages.storage.trashHolds", { size: bytes(data.trashedBytes) })}</Text>
              <Button tone="neutral" label={t("pages.storage.openTrash")} onPress={() => router.push({ pathname: "/pages/drive", params: { view: "trash" } })} testID="pages-storage-open-trash" />
            </View>
          ) : null}

          {data.largestFiles.length ? (
            <View style={{ gap: metrics.space.xs }} testID="pages-storage-largest">
              <Text variant="label" tone="muted" accessibilityRole="header">
                {t("pages.storage.largest")}
              </Text>
              {data.largestFiles.map((f) => (
                <Pressable
                  key={f.id}
                  testID={`pages-storage-file-${f.id}`}
                  onPress={() =>
                    f.trashed
                      ? router.push({ pathname: "/pages/drive", params: { view: "trash" } })
                      : router.push({ pathname: "/pages/view", params: { spaceId: String(f.spaceId), nodeId: String(f.id), title: f.title } })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={f.trashed ? t("pages.storage.fileInTrash", { title: f.title, size: bytes(f.byteSize) }) : t("pages.storage.file", { title: f.title, size: bytes(f.byteSize) })}
                  style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, minHeight: metrics.touch }}
                >
                  {f.trashed ? <Trash2 size={18} color={colors.inkMuted} /> : null}
                  <Text numberOfLines={1} style={{ flex: 1 }}>
                    {f.title}
                  </Text>
                  <Text tone="muted">{bytes(f.byteSize)}</Text>
                  <ChevronRight size={18} color={colors.inkMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
