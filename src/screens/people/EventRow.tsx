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
import { MapPin, Repeat } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { categoryColorFor } from "@/theme/tokens";
import type { Occurrence } from "@/api/calendar";
import { t } from "@/i18n";

function timeLabel(occurrence: Occurrence): string {
  if (occurrence.allDay || !occurrence.startsAt) return t("calendar.allDay");
  const at = new Date(occurrence.startsAt);
  // ── A TIMESTAMP WE CANNOT READ IS NOT AN ALL-DAY EVENT ──────────────────
  // This used to return "All day" here, which is the worst answer available
  // on this screen: a confident wrong one, in an app whose whole purpose is
  // telling somebody when things are, on a row they will act on. Somebody
  // misses a 09:00 dentist because the row said the day was free.
  //
  // It was defended as unreachable — the server sends either a timestamp or
  // `all_day: true`. That is a claim about today's DATA, not about this
  // code: a calendar row renders whatever the server sends, and this parser
  // is the only thing between a malformed timestamp and that row.
  //
  // So it fails rather than guesses, and the row says it does not know.
  // "Unknown" rather than a fuller sentence because the column is 62 dp and
  // "Time unknown" wraps in it.
  if (Number.isNaN(at.getTime())) return t("calendar.timeUnknown");
  return at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** "1 h", "45 min" — only when the end is known and after the start. */
function durationLabel(occurrence: Occurrence): string | null {
  if (occurrence.allDay || !occurrence.startsAt || !occurrence.endsAt) return null;
  const minutes = Math.round(
    (new Date(occurrence.endsAt).getTime() - new Date(occurrence.startsAt).getTime()) / 60_000,
  );
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes < 60) return t("calendar.minutes", { count: minutes });
  const hours = minutes / 60;
  return t("calendar.hours", { count: Number.isInteger(hours) ? hours : Number(hours.toFixed(1)) });
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
  const title = event.title ?? t("calendar.untitled");
  const bar = event.color ?? categoryColorFor(event.id);
  const duration = durationLabel(occurrence);

  return (
    <Pressable
      testID={`calendar-event-${occurrence.key}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("calendar.event", { title, when: timeLabel(occurrence) })}
      accessibilityHint={t("calendar.eventHint")}
      android_ripple={{ color: colors.border }}
      style={{
        flexDirection: "row",
        gap: metrics.space.md,
        paddingVertical: metrics.space.md,
        minHeight: metrics.touch,
      }}
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
            {title}
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
