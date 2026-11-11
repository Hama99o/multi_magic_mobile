/**
 * An event's colour, as something `backgroundColor` can take.
 *
 * The web stores a KEY (`blue green amber red grey`, `EventDrawer.tsx`
 * COLORS); a few older rows carry a hex. Keys map onto the icon's own accents
 * (`CATEGORY_COLORS`, `IDENTITY.md` §1: colour only where a category exists,
 * and an event's colour is one). With no usable colour the KIND decides, as
 * the web's `colorKeyFor` does, so a birthday is amber on both clients.
 */
import type { CalendarEvent } from "@/api/calendar";
import { CATEGORY_COLORS } from "@/theme/tokens";

export const EVENT_COLORS: Record<string, string> = {
  blue: CATEGORY_COLORS[0],
  green: CATEGORY_COLORS[1],
  amber: CATEGORY_COLORS[2],
  red: CATEGORY_COLORS[3],
  grey: "#8A9DA3",
};

export const COLOR_CHOICES = ["blue", "green", "amber", "red", "grey"] as const;

export function colorKeyFor(kind: string | null, color: string | null): string {
  if (color && EVENT_COLORS[color]) return color;
  if (kind === "birthday") return "amber";
  if (kind === "anniversary") return "red";
  if (kind === "appointment") return "green";
  return "blue";
}

export function eventColor(event: Pick<CalendarEvent, "kind" | "color">): string {
  if (event.color && /^#[0-9a-fA-F]{3,8}$/.test(event.color)) return event.color;
  return EVENT_COLORS[colorKeyFor(event.kind, event.color)];
}
