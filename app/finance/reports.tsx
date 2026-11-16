/**
 * Finance › Reports and export (`docs/design/finance/SPEC.md` §A F8 F9, §D.11;
 * the web's `ReportsPanel.tsx`).
 *
 * A month or a whole year (the switcher's Year mode): income, expenses and
 * net, each per currency and never added across them, then spend by
 * category from the server's `by_tag` (primary category only, biggest first).
 *
 * Export: a From / To range (the current month by default), then Expenses,
 * Incomes or Loans as CSV, Excel or PDF. The file is downloaded with the
 * session's headers and handed to the share sheet (expo-sharing, as Pages
 * does). Loans ignore the range on the server, so they say "all time".
 * A press is a user action, so the download is a mutation, not an effect.
 */
import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Sharing from "expo-sharing";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { financeKeys } from "@/api/keys";
import { financeApi, formatMoney, formatTotals, type ExportFormat, type Totals } from "@/api/finance";
import { Download } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { useColors, useMetrics } from "@/hooks/useColors";
import { addDays, addMonths, startOfMonth, todayKey } from "@/screens/calendar/dates";
import { chartColor, DayChooser, Field, MONEY_IN, PeriodSwitcher, ShareBar } from "@/screens/finance/parts";
import { ManageHeader } from "@/screens/finance/manage/common";

type Resource = "expenses" | "incomes" | "loans";
const FORMATS: ExportFormat[] = ["csv", "xlsx", "pdf"];
/** File-type names, the same in every language (not sentences, so not in i18n). */
const FORMAT_NAME: Record<ExportFormat, string> = { csv: "CSV", xlsx: "Excel", pdf: "PDF" };
const MIME: Record<ExportFormat, string> = { csv: "text/csv", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pdf: "application/pdf" };
const UTI: Record<ExportFormat, string> = { csv: "public.comma-separated-values-text", xlsx: "org.openxmlformats.spreadsheetml.sheet", pdf: "com.adobe.pdf" };

export default function ReportsScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const firstDay = startOfMonth(todayKey());
  const [from, setFrom] = useState(firstDay);
  const [to, setTo] = useState(addDays(addMonths(firstDay, 1), -1));
  const [failure, setFailure] = useState<string | null>(null);
  const resourceName = (r: Resource) => (r === "expenses" ? t("finance.manage.reports.expenses") : r === "incomes" ? t("finance.manage.reports.income") : t("finance.manage.reports.loans"));
  const summary = useQuery({ queryKey: financeKeys.summary(year, month), queryFn: () => financeApi.reports.summary(year, month || null) });
  const exporting = useMutation({
    mutationFn: async ({ resource, format }: { resource: Resource; format: ExportFormat }) => {
      const uri = await financeApi.reports.export(resource, format, from, to);
      await Sharing.shareAsync(uri, { mimeType: MIME[format], UTI: UTI[format], dialogTitle: resourceName(resource) });
    },
    onMutate: () => setFailure(null),
    onError: () => setFailure(t("finance.manage.reports.exportFailed")),
  });
  const total = (x: Totals | undefined) => (x && formatTotals(x, i18n.language)) || formatMoney(0, "eur", i18n.language);
  const max = Math.max(0, ...(summary.data?.byCategory ?? []).map((s) => s.amount));

  return (
    <Screen measure>
      <ManageHeader testID="finance-reports" title={t("finance.manage.reports.title")} />
      <ScrollView refreshControl={<RefreshControl refreshing={summary.isRefetching} onRefresh={() => void summary.refetch()} tintColor={colors.inkMuted} />} contentContainerStyle={{ gap: metrics.space.lg, paddingBottom: metrics.space.xl }}>
        <PeriodSwitcher
          testID="finance-reports-period"
          year={year}
          month={month}
          onChange={(y, m) => {
            setYear(y);
            setMonth(m);
          }}
        />
        <LoadFailure error={summary.error} loadFailed={t("finance.manage.reports.loadFailed")} hasData={Boolean(summary.data)} updatedAt={summary.dataUpdatedAt} onRetry={() => void summary.refetch()} testID="finance-reports-load-failed" />
        {summary.isPending && !summary.error ? <RowsSkeleton rows={3} testID="finance-reports-loading" /> : null}
        {summary.data ? (
          <View style={{ gap: metrics.space.sm }}>
            <Stat testID="finance-reports-income" label={t("finance.manage.reports.income")} value={total(summary.data.incomes)} tone={MONEY_IN} />
            <Stat testID="finance-reports-expenses" label={t("finance.manage.reports.expenses")} value={total(summary.data.expenses)} />
            <Stat testID="finance-reports-net" label={t("finance.manage.reports.net")} value={total(summary.data.net)} />
          </View>
        ) : null}

        {summary.data ? (
          <View style={{ gap: metrics.space.sm }}>
            <Text variant="label" tone="muted" accessibilityRole="header">
              {t("finance.manage.reports.byCategory")}
            </Text>
            {summary.data.byCategory.length ? (
              summary.data.byCategory.map((s, i) => (
                <Animated.View key={`${s.label}-${s.currency}`} entering={FadeInDown.delay(Math.min(i, 10) * 35).duration(220)} testID={`finance-reports-category-${i}`} style={{ gap: metrics.space.xs, minHeight: 44, justifyContent: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
                    <Text style={{ flex: 1 }} numberOfLines={1}>
                      {s.label || t("finance.manage.reports.noCategory")}
                    </Text>
                    <Text style={{ fontWeight: "600", fontVariant: ["tabular-nums"] }}>{formatMoney(s.amount, s.currency, i18n.language)}</Text>
                  </View>
                  <ShareBar share={max > 0 ? s.amount / max : 0} color={chartColor(i)} />
                </Animated.View>
              ))
            ) : (
              <Text testID="finance-reports-nothing" tone="muted">
                {t("finance.manage.reports.nothingSpent")}
              </Text>
            )}
          </View>
        ) : null}

        <View style={{ gap: metrics.space.md, paddingTop: metrics.space.md, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text variant="title" accessibilityRole="header" style={{ fontSize: 20 }}>
            {t("finance.manage.reports.export")}
          </Text>
          <Field label={t("finance.manage.reports.from")}>
            <DayChooser testID="finance-reports-from" value={from} onChange={setFrom} />
          </Field>
          <Field label={t("finance.manage.reports.to")}>
            <DayChooser testID="finance-reports-to" value={to} onChange={setTo} />
          </Field>
          {(["expenses", "incomes", "loans"] as const).map((resource) => (
            <View key={resource} style={{ gap: metrics.space.xs }}>
              <Text style={{ fontWeight: "600" }}>{resourceName(resource)}</Text>
              {resource === "loans" ? (
                <Text variant="caption" tone="muted">
                  {t("finance.manage.reports.loansAllTime")}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
                {FORMATS.map((format) => {
                  const busy = exporting.isPending && exporting.variables?.resource === resource && exporting.variables.format === format;
                  return (
                    <Pressable
                      key={format}
                      testID={`finance-export-${resource}-${format}`}
                      onPress={() => exporting.mutate({ resource, format })}
                      disabled={exporting.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={t("finance.manage.reports.exportA11y", { what: resourceName(resource), format: FORMAT_NAME[format] })}
                      accessibilityState={{ disabled: exporting.isPending, busy }}
                      style={{ flex: 1, flexDirection: "row", gap: 6, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, opacity: exporting.isPending && !busy ? 0.5 : 1 }}
                    >
                      {busy ? <ActivityIndicator size="small" color={colors.ink} /> : <Download size={16} color={colors.ink} />}
                      <Text variant="label">{FORMAT_NAME[format]}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          {failure ? (
            <Text testID="finance-reports-failure" tone="danger" accessibilityLiveRegion="polite">
              {failure}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, tone, testID }: { label: string; value: string; tone?: string; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View testID={testID} accessible accessibilityLabel={`${label}: ${value}`} style={{ padding: metrics.space.md, borderRadius: metrics.radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 2, minHeight: 56 }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Text testID={`${testID}-value`} style={{ fontSize: 22, lineHeight: 28, fontWeight: "700", color: tone ?? colors.ink, fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
    </View>
  );
}
