/**
 * "N items here could not be read": the line a list shows when the server
 * sent rows its parser could not read (`readableRows`, parse.ts). Decided by
 * Hamma9901, 2026-09-25: skipping a bad row beats losing the whole screen to
 * it, and SAYING so beats skipping in silence, since a row dropped quietly is
 * data he has that the app will not show him. Nothing when the count is 0.
 */
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { useMetrics } from "@/hooks/useColors";

export function UnreadableNotice({ count }: { count: number }) {
  const { t } = useTranslation();
  const metrics = useMetrics();
  if (count <= 0) return null;
  return (
    <Text
      variant="caption"
      tone="muted"
      testID="unreadable-notice"
      accessibilityLiveRegion="polite"
      style={{ paddingVertical: metrics.space.sm }}
    >
      {t("common.unreadable", { count })}
    </Text>
  );
}
