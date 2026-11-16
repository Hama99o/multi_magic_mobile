/**
 * Password health (audit #28), the web's Security tab
 * (`pages/safezone/security/Index.tsx`): the totals, the weak passwords and
 * the groups that share one, from `GET /passwords/health`. Each entry opens
 * its item, where the person can change it.
 *
 * The report holds no value, but "these logins share a password" is a fact
 * about the secrets, so it lives in this component's state only: never React
 * Query (`rules.test.ts`), fetched with a live token, dropped on lock and on
 * leaving the tab.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, Copy, KeyRound, ShieldCheck, TriangleAlert } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { safezoneApi, type HealthEntry, type HealthReport } from "@/api/safezone";
import { useSafezoneLock } from "@/stores/safezoneLock.store";

type Load = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; report: HealthReport };

function openItem(entry: HealthEntry) {
  router.push({ pathname: "/safezone/item", params: { kind: "passwords", id: String(entry.id) } });
}

export function HealthPanel() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const lockEpoch = useSafezoneLock((s) => s.lockEpoch);
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  const fetchReport = useCallback(() => {
    let alive = true;
    setLoad({ kind: "loading" });
    const token = useSafezoneLock.getState().liveToken();
    if (!token) {
      useSafezoneLock.getState().lock();
      return () => undefined;
    }
    safezoneApi.health(token).then(
      (report) => alive && setLoad({ kind: "ready", report }),
      () => alive && setLoad({ kind: "failed" }),
    );
    return () => {
      alive = false;
    };
  }, []);

  // Fetched again after every lock, so nothing outlives an unlock window.
  useEffect(() => fetchReport(), [fetchReport, lockEpoch]);

  if (load.kind === "loading") return <ActivityIndicator testID="safezone-health-loading" style={{ marginTop: metrics.space.xl }} />;
  if (load.kind === "failed") {
    return (
      <View style={{ alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.xl }}>
        <Text tone="danger" style={{ textAlign: "center" }}>{t("safezone.health.loadFailed")}</Text>
        <Pressable testID="safezone-health-retry" onPress={fetchReport} accessibilityRole="button" style={{ minHeight: metrics.touch, paddingHorizontal: metrics.space.lg, justifyContent: "center" }}>
          <Text tone="accent" variant="label">{t("common.tryAgain")}</Text>
        </Pressable>
      </View>
    );
  }

  const { report } = load;
  const healthy = report.weakCount === 0 && report.reusedCount === 0;
  const tile = (testID: string, label: string, value: number, warn: boolean) => (
    <View style={{ flex: 1, gap: 2, padding: metrics.space.md, borderRadius: metrics.radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <Text testID={testID} tone={warn ? "danger" : "default"} style={{ fontSize: 24, lineHeight: 30, fontWeight: "700" }}>{value}</Text>
      <Text tone="muted" variant="caption" numberOfLines={2}>{label}</Text>
    </View>
  );

  return (
    <ScrollView testID="safezone-health" contentContainerStyle={{ gap: metrics.space.lg, paddingBottom: metrics.space.xl }}>
      <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
        {tile("safezone-health-total", t("safezone.health.total"), report.total, false)}
        {tile("safezone-health-weak-count", t("safezone.health.weak"), report.weakCount, report.weakCount > 0)}
        {tile("safezone-health-reused-count", t("safezone.health.reused"), report.reusedCount, report.reusedCount > 0)}
      </View>

      {healthy ? (
        <View style={{ alignItems: "center", gap: metrics.space.sm, padding: metrics.space.xl, borderRadius: metrics.radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
          <ShieldCheck size={36} color={colors.accent} />
          <Text style={{ fontWeight: "600", textAlign: "center" }}>{t("safezone.health.allHealthy")}</Text>
          <Text tone="muted" variant="caption" style={{ textAlign: "center" }}>{t("safezone.health.allHealthySub")}</Text>
        </View>
      ) : null}

      {report.weak.length > 0 ? (
        <View style={{ gap: metrics.space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
            <TriangleAlert size={16} color={colors.danger} />
            <Text variant="label" tone="danger" accessibilityRole="header">{t("safezone.health.weakTitle")}</Text>
          </View>
          <Text tone="muted" variant="caption">{t("safezone.health.weakHint")}</Text>
          {report.weak.map((entry) => (
            <EntryRow key={entry.id} entry={entry} testID={`safezone-health-weak-${entry.id}`} />
          ))}
        </View>
      ) : null}

      {report.reused.length > 0 ? (
        <View style={{ gap: metrics.space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
            <Copy size={16} color={colors.danger} />
            <Text variant="label" tone="danger" accessibilityRole="header">{t("safezone.health.reusedTitle")}</Text>
          </View>
          {report.reused.map((group) => (
            <View key={group.entries[0]?.id ?? group.count} style={{ gap: metrics.space.xs }}>
              <Text tone="muted" variant="caption">{t("safezone.health.reusedAcross", { count: group.count })}</Text>
              {group.entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} testID={`safezone-health-reused-${entry.id}`} />
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function EntryRow({ entry, testID }: { entry: HealthEntry; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const title = entry.title || t("safezone.noTitle");
  return (
    <Pressable
      testID={testID}
      onPress={() => openItem(entry)}
      accessibilityRole="button"
      accessibilityLabel={t("safezone.open", { name: title })}
      style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 52, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
    >
      <KeyRound size={18} color={colors.inkMuted} />
      <Text numberOfLines={1} style={{ flex: 1, fontWeight: "600" }}>{title}</Text>
      <ChevronRight size={18} color={colors.inkMuted} />
    </Pressable>
  );
}
