/**
 * WHAT A SCREEN SAYS WHEN ITS LOAD FAILED: one statement, never two.
 *
 * Two cases, and they are different facts:
 *   - nothing loaded yet: the cause (`failureMessage`), else the screen's own
 *     "Could not load …";
 *   - it had loaded, and a REFRESH failed: the screen keeps what it had
 *     (states/SPEC.md, "Had content, then the refresh failed"), and this
 *     says so in ONE statement that owns both facts: the cause, else
 *     "Could not refresh.", then how old what is shown is.
 *
 * Why one statement (Hamma9901's ruling, 2026-09-25): the calendar used to
 * say "Updated just now" above "Could not load your calendar.". Both were
 * true, since the assistant had fetched it seconds earlier, and together they
 * read as a contradiction because nothing related them. So while this stands
 * over kept data, the screen hides its own "Updated …" line (`stale` is what
 * it checks) and this is the only freshness claim on screen.
 *
 * Rule Zero: no reference found words this sentence. Starlink marks kept rows
 * "unreachable" and Docusign marks one "Failed to sync"; the words here are
 * the ruling's, recorded as such.
 */
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { useMetrics } from "@/hooks/useColors";
import { failureMessage } from "@/api/failure";
import { relativeTime } from "@/lib/relativeTime";

const MINUTE = 60_000;

/** True when a failed refresh is standing over data the screen kept. */
export function isStale(error: unknown, hasData: boolean): boolean {
  return Boolean(error) && hasData;
}

export function LoadFailure({
  error,
  loadFailed,
  hasData,
  updatedAt,
  onRetry,
  testID,
  padded = true,
}: {
  error: unknown;
  /** The screen's own "Could not load …", for a first load. */
  loadFailed: string;
  /** Whether the screen is still showing an earlier answer. */
  hasData: boolean;
  /** `dataUpdatedAt`: when that earlier answer arrived. */
  updatedAt: number;
  onRetry: () => void;
  testID: string;
  padded?: boolean;
}) {
  const metrics = useMetrics();
  const { t } = useTranslation();
  if (!error) return null;

  let sentence: string;
  if (hasData && updatedAt) {
    const age = Date.now() - updatedAt;
    const freshness =
      age < MINUTE ? t("failure.showingRecent") : t("failure.showingFrom", { when: relativeTime(new Date(updatedAt).toISOString()) });
    sentence = `${failureMessage(error, t("failure.couldNotRefresh"))} ${freshness}`;
  } else {
    sentence = failureMessage(error, loadFailed);
  }

  return (
    <View testID={testID} style={{ paddingVertical: padded ? metrics.space.xl : 0, gap: metrics.space.sm }}>
      <Text tone="muted" testID={`${testID}-sentence`}>
        {sentence}
      </Text>
      <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8}>
        <Text tone="accent">{t("common.tryAgain")}</Text>
      </Pressable>
    </View>
  );
}
