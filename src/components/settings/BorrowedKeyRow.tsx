/**
 * A key somebody lent you, and — when they set one — how much of this month's
 * limit is left (multi_magic `9a5a3cb`).
 *
 * Over the limit the key stops working for the borrower until the month
 * turns. The chat already says so when it bites; this is where they can see it
 * coming, and see when it comes back, without asking the lender.
 *
 * Rule Zero, Mobbin searched first (2026-09-24): Whatnot
 * (`mobbin.com/screens/039d569d-c47e-43bd-aad8-be56557d89c3`) "Watch Limit —
 * resets on …" over a thin bar with used · total; Raycast
 * (`mobbin.com/screens/fc3c4a7f-d86d-43b0-8397-1cf5eacc5754`) a thin bar with
 * what is left; Affirm (`mobbin.com/screens/9431b596-8505-4c23-aed6-80c89f7c2975`)
 * "used / limit · Monthly". TAKE: a thin bar and one plain sentence, and the
 * reset DATE when it has run out. REJECT: a big number or a gauge; this is one
 * row among the keys, not a dashboard. No limit set, nothing extra.
 */
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import type { BorrowedKey } from "@/api/aiKeys";

/**
 * When a monthly limit resets: the next month start on the SERVER's calendar,
 * which is UTC. `spent_this_month` sums `Time.current.all_month`
 * (`multi_magic` `user_ai_key_grant.rb`), and `config/application.rb` leaves
 * `time_zone` at Rails' default. The caller formats this instant in the
 * phone's own zone.
 *
 * It used to be the first of next month on the PHONE's calendar. Two ways
 * wrong: west of UTC the key comes back on the evening of the last day, not
 * "on the 1st"; east of UTC, in the first hours of a local month (Paris,
 * 00:00 to 02:00 on the 1st), the server is still in last month, so the key
 * is back within two hours while the row said it returns in a MONTH.
 */
export function resetDate(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export function BorrowedKeyRow({ borrowed, testID }: { borrowed: BorrowedKey; testID?: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const { monthlyCreditLimit: limit, spentThisMonth: spent, exhausted } = borrowed;
  const number = (n: number) => n.toLocaleString(i18n.language, { maximumFractionDigits: 2 });
  const share = limit && limit > 0 ? Math.min(1, spent / limit) : exhausted ? 1 : 0;

  return (
    <View style={{ gap: metrics.space.xs }} testID={testID}>
      <Text variant="caption" tone="muted">
        {t("aiKeys.lentToYou", {
          provider: borrowed.provider,
          name: borrowed.ownerName ?? t("aiKeys.someone"),
        })}
      </Text>
      {limit != null ? (
        <>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={t("aiKeys.limitLabel")}
            accessibilityValue={{ min: 0, max: limit, now: Math.min(spent, limit) }}
            style={{ height: 4, borderRadius: metrics.radius.pill, backgroundColor: colors.border, overflow: "hidden" }}
          >
            <View
              style={{
                width: `${Math.round(share * 100)}%`,
                height: "100%",
                backgroundColor: exhausted ? colors.danger : colors.accent,
              }}
            />
          </View>
          <Text
            variant="caption"
            tone={exhausted ? "danger" : "muted"}
            testID={testID ? `${testID}-limit` : undefined}
          >
            {exhausted
              ? t("aiKeys.limitReached", {
                  date: resetDate().toLocaleDateString(i18n.language, { day: "numeric", month: "long" }),
                })
              : t("aiKeys.limitUsed", { spent: number(spent), limit: number(limit) })}
          </Text>
        </>
      ) : null}
    </View>
  );
}
