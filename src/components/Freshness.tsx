/**
 * "IS THIS STILL TRUE?" — a control and a line, both deliberately small.
 *
 * His words: *"there should be an option — same for notification; it should
 * not be very big which can break design but it should be stylish."* So:
 *
 * - **Pull-to-refresh stays the primary gesture.** It is what a list on a
 *   phone already means, and both screens have had it from the start.
 * - **The control is a header glyph**, the same quiet treatment as the chat's
 *   four doors (`IDENTITY.md` §7): an outline icon, `inkMuted`, no label, the
 *   48 dp touch floor as its tap target and 18 px of ink inside it. Outlook's
 *   agenda header and Mesh's notification header both carry exactly this —
 *   small unlabelled glyphs, top right — and neither shows a refresh button,
 *   which is recorded in both SPECs as the thing the references could not
 *   settle.
 * - **The state lives IN the control.** A spinner where the glyph was, never
 *   a full-screen one: the person is reading the list they just asked to
 *   refresh, and replacing it with a spinner takes away the thing they were
 *   looking at to tell them it is being looked at.
 * - **Freshness is a line, not a banner.** One muted caption under the
 *   header. A banner would be a second thing to dismiss.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { RotateCw } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { relativeTime } from "@/lib/relativeTime";

export function RefreshButton({
  refreshing,
  onPress,
  label = "Refresh",
  testID,
}: {
  refreshing: boolean;
  onPress: () => void;
  label?: string;
  testID: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: refreshing, disabled: refreshing }}
      disabled={refreshing}
      hitSlop={6}
      onPress={onPress}
      style={{
        width: metrics.touch,
        height: metrics.touch,
        alignItems: "center",
        justifyContent: "center",
      }}
      testID={testID}
    >
      {refreshing ? (
        // In the control, not over the content.
        <ActivityIndicator size="small" color={colors.accent} testID={`${testID}-busy`} />
      ) : (
        <RotateCw size={18} color={colors.inkMuted} />
      )}
    </Pressable>
  );
}

/**
 * "Updated just now" — and it keeps being true.
 *
 * Re-rendered on a timer while mounted, because a line that says "just now"
 * twenty minutes later is worse than no line: it is the screen asserting
 * freshness it does not have. The timer is cleared on unmount and runs only
 * while there is something to age.
 */
export function UpdatedLine({
  at,
  refreshing,
  testID = "updated-line",
}: {
  /** `dataUpdatedAt` from the query — 0 until the first answer lands. */
  at: number;
  refreshing: boolean;
  testID?: string;
}) {
  const metrics = useMetrics();
  const [, tick] = useState(0);

  useEffect(() => {
    if (!at) return;
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, [at]);

  if (!at) return null;

  return (
    <View style={{ paddingBottom: metrics.space.xs }}>
      <Text variant="caption" tone="muted" testID={testID}>
        {refreshing ? "Updating…" : `Updated ${relativeTime(new Date(at).toISOString())}`}
      </Text>
    </View>
  );
}
