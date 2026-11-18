/**
 * How much AI this person used, by period — the web's `AiUsagePanel.tsx`,
 * MANIFEST row 14. `GET /api/v1/ai_usage?period=`: requests, credits and
 * tokens, split by provider; and, only for someone who lends a key, what
 * the borrowers spent on it.
 */
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { LoadFailure } from "@/components/LoadFailure";
import { profileKeys } from "@/api/keys";
import { USAGE_PERIODS, developerApi, type UsagePeriod, type UsageSummary } from "@/api/developer";

const PERIOD_LABELS: Record<UsagePeriod, string> = {
  this_month: "aiUsage.this_month",
  last_month: "aiUsage.last_month",
  last_30_days: "aiUsage.last_30_days",
  last_7_days: "aiUsage.last_7_days",
  this_year: "aiUsage.this_year",
  last_year: "aiUsage.last_year",
  all: "aiUsage.all",
};

function Summary({ summary, testID }: { summary: UsageSummary; testID: string }) {
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const number = (n: number) => n.toLocaleString(i18n.language);
  return (
    <View testID={testID} style={{ gap: metrics.space.xs }}>
      <Text>{t("aiUsage.calls", { count: summary.calls })}</Text>
      <Text>{t("aiUsage.credits", { amount: number(summary.credits) })}</Text>
      <Text>{t("aiUsage.tokens", { count: summary.tokens })}</Text>
      {summary.byProvider.map((p) => (
        <Text key={p.provider} variant="caption" tone="muted">
          {`${p.provider} · ${t("aiUsage.calls", { count: p.calls })} · ${t("aiUsage.credits", { amount: number(p.credits) })}`}
        </Text>
      ))}
    </View>
  );
}

export function AiUsagePanel() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [period, setPeriod] = useState<UsagePeriod>("this_month");
  const query = useQuery({ queryKey: profileKeys.aiUsage(period), queryFn: () => developerApi.aiUsage(period) });
  const data = query.data;

  return (
    <View testID="ai-usage" style={{ marginTop: metrics.space.xl, gap: metrics.space.md }}>
      <Text variant="label" accessibilityRole="header">
        {t("aiUsage.title")}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: metrics.space.sm }}>
        {USAGE_PERIODS.map((p) => (
          <Pressable
            key={p}
            testID={`ai-usage-period-${p}`}
            onPress={() => setPeriod(p)}
            accessibilityRole="button"
            accessibilityState={{ selected: period === p }}
            style={{
              minHeight: 36,
              paddingHorizontal: metrics.space.md,
              justifyContent: "center",
              borderRadius: metrics.radius.md,
              borderWidth: 1,
              borderColor: period === p ? colors.accent : colors.border,
              backgroundColor: period === p ? colors.surface : undefined,
            }}
          >
            <Text variant="caption" tone={period === p ? "default" : "muted"}>
              {t(PERIOD_LABELS[p])}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <LoadFailure
        error={query.error}
        loadFailed={t("aiUsage.loadFailed")}
        hasData={Boolean(data)}
        updatedAt={query.dataUpdatedAt}
        onRetry={() => void query.refetch()}
        testID="ai-usage-failed"
        padded={false}
      />
      {data ? (
        data.mine.calls === 0 ? (
          <Text tone="muted" testID="ai-usage-nothing">
            {t("aiUsage.nothing")}
          </Text>
        ) : (
          <Summary summary={data.mine} testID="ai-usage-mine" />
        )
      ) : null}
      {data?.lent ? (
        <View testID="ai-usage-lent" style={{ gap: metrics.space.xs }}>
          <Text variant="label">{t("aiUsage.lentTitle")}</Text>
          <Summary summary={data.lent} testID="ai-usage-lent-summary" />
          {data.lent.byBorrower.map((b, i) => (
            <Text key={`${b.name}-${i}`} variant="caption" tone="muted">
              {`${b.name} · ${t("aiUsage.calls", { count: b.calls })} · ${t("aiUsage.credits", { amount: b.credits })}`}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
