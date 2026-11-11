import { eventColor } from "../colors";
import { CATEGORY_COLORS } from "@/theme/tokens";

describe("an event's colour", () => {
  it("maps the web's key onto the icon's accents", () => {
    expect(eventColor({ kind: "event", color: "green" })).toBe(CATEGORY_COLORS[1]);
    expect(eventColor({ kind: "event", color: "amber" })).toBe(CATEGORY_COLORS[2]);
  });

  it("keeps an older hex as it is", () => {
    expect(eventColor({ kind: "event", color: "#123456" })).toBe("#123456");
  });

  it("falls back by kind, so a birthday is amber on both clients", () => {
    expect(eventColor({ kind: "birthday", color: null })).toBe(CATEGORY_COLORS[2]);
    expect(eventColor({ kind: null, color: null })).toBe(CATEGORY_COLORS[0]);
  });

  it("never returns a key a native view would reject", () => {
    for (const color of ["blue", "green", "amber", "red", "grey", null, "#abc"]) {
      expect(eventColor({ kind: "event", color })).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    }
  });
});
