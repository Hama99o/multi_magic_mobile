/**
 * A session's device name, as the server stored it. Labels written before #31
 * carry English literals ("Unknown Browser on Unknown OS") even on a French
 * account, because the server did. Device QA 2026-11-17.
 */
import i18n from "@/i18n";
import { deviceName } from "../deviceLabel";

const t = i18n.t.bind(i18n);
afterEach(() => i18n.changeLanguage("en"));

it("says a wholly unknown device in the reader's language", async () => {
  await i18n.changeLanguage("fr");
  for (const stored of ["Unknown Browser on Unknown OS", "Unknown Browser sur Unknown OS", "Unknown Device", null]) {
    expect(deviceName(stored, t)).toBe("Appareil inconnu");
  }
});

it("translates an unknown part and keeps the known one", async () => {
  await i18n.changeLanguage("fr");
  expect(deviceName("Unknown Browser sur Linux", t)).toBe("Navigateur inconnu sur Linux");
});

it("leaves a real name alone", () => {
  expect(deviceName("Chrome 131 on Windows", t)).toBe("Chrome 131 on Windows");
  expect(deviceName("MultiMagic app · Android", t)).toBe("MultiMagic app · Android");
});
