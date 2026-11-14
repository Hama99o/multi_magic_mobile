/**
 * The iOS permission sentences in French (`locales/ios-fr.json`, app.json
 * `expo.locales.fr`) must reach iOS only. Expo writes a locale file's
 * top-level keys into Android's `values-b+fr/strings.xml` too
 * (`@expo/config-plugins/build/utils/locales.js`: Android gets `...rest,
 * ...android`, iOS `...rest, ...ios`), and there an `NS…UsageDescription` with
 * no default-locale twin is an `ExtraTranslation` error that FAILS
 * `lintVitalRelease`: measured 2026-11-14, a local `assembleRelease` stopped
 * on 5 of them. So they live under `ios`, and nothing sits at the top level.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");
const app = JSON.parse(readFileSync(join(ROOT, "app.json"), "utf8")).expo;

describe.each(Object.entries(app.locales ?? {}) as [string, string][])("locale %s", (lang, file) => {
  const json = JSON.parse(readFileSync(join(ROOT, file), "utf8"));

  it("puts nothing at the top level, where Android would get it", () => {
    expect(Object.keys(json).filter((k) => k !== "ios" && k !== "android")).toEqual([]);
  });

  it("keeps every iOS usage description under ios, and none under android", () => {
    const ns = (o: Record<string, unknown> = {}) => Object.keys(o).filter((k) => /^NS\w+UsageDescription$/.test(k));
    expect(ns(json.ios).length).toBeGreaterThan(0);
    expect(ns(json.android)).toEqual([]);
    expect(ns(json.ios)).toEqual(expect.arrayContaining(["NSCameraUsageDescription", "NSPhotoLibraryUsageDescription", "NSMicrophoneUsageDescription"]));
    void lang;
  });
});
