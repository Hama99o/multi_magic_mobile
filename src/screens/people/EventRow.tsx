/**
 * One occurrence in the agenda.
 *
 * ── THE TIME GOES IN A LEFT COLUMN ────────────────────────────────────────
 * Outlook and Equinox+ put it there; Saturn and Otter put it under the title.
 * The left column wins for one reason the others cannot answer: an **all-day**
 * event leaves no hole. `All day` sits in the same slot a time would, exactly
 * as Equinox+'s `Anytime` chip does — and since the server already orders
 * all-day events before timed ones within a day (`occurrences.rb:19`), the
 * column reads top to bottom as "the all-day things, then the timed ones".
 *
 * ── THE COLOUR BAR IS DATA ────────────────────────────────────────────────
 * `event.color` is on the wire (`event_serializer.rb:7`), so the bar says
 * something rather than decorating — which is the only kind of colour
 * `IDENTITY.md` §1 permits from the icon's eight. When an event has none, the
 * fallback is `categoryColorFor(event.id)`, stable per event.
 *
 * ── AND A REPEAT SAYS SO ──────────────────────────────────────────────────
 * Teams and Outlook both mark recurrence with a glyph. A weekly stand-up that
 * looks like a one-off is a small lie, and it is one icon.
 */
import { Pressable, View } from "react-native";
import { MapPin, Repeat } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { categoryColorFor } from "@/theme/tokens";
import type { Occurrence } from "@/api/calendar";

function timeLabel(occurrence: Occurrence): string {
  if (occurrence.allDay || !occurrence.startsAt) return "All day";
  const at = new Date(occurrence.startsAt);
  if (Number.isNaN(at.getTime())) return "All day";
  return at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** "1 h", "45 min" — only when the end is known and after the start. */
function durationLabel(occurrence: Occurrence): string | null {
  if (occurrence.allDay || !occurrence.startsAt || !occurrence.endsAt) return null;
  const minutes = Math.round(
    (new Date(occurrence.endsAt).getTime() - new Date(occurrence.startsAt).getTime()) / 60_000,
  );
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`;
}

export function EventRow({
  occurrence,
  onPress,
}: {
  occurrence: Occurrence;
  onPress: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { event } = occurrence;
  const bar = event.color ?? categoryColorFor(event.id);
  const duration = durationLabel(occurrence);

  return (
    <Pressable
      testID={`calendar-event-${occurrence.key}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${timeLabel(occurrence)}`}
      accessibilityHint="Opens the assistant with a question about this event"
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: metrics.space.md,
        paddingVertical: metrics.space.md,
        minHeight: metrics.touch,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={{ width: 62, alignItems: "flex-start", gap: 2 }}>
        <Text variant="caption" tone="muted">
          {timeLabel(occurrence)}
        </Text>
        {duration ? (
          <Text variant="caption" tone="muted" style={{ fontSize: 11 }}>
            {duration}
          </Text>
        ) : null}
      </View>

      <View style={{ width: 3, borderRadius: 2, backgroundColor: bar }} />

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs }}>
          <Text variant="label" numberOfLines={2} style={{ flex: 1, fontSize: 15 }}>
            {event.title}
          </Text>
          {event.recurrence ? (
            <Repeat testID="event-repeats" size={13} color={colors.inkMuted} />
          ) : null}
        </View>

        {/* The field that decides whether he needs to leave now. */}
        {event.location ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <MapPin size={11} color={colors.inkMuted} />
            <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
              {event.location}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
