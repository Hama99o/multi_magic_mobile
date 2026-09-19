/**
 * "serif" is a font on Android and a warning on iOS.
 *
 * Jest runs under jest-expo's default platform, which is iOS — so the constant
 * checks below ARE the iOS case, not a simulation of it. The Android case is
 * proved by re-requiring the module against a Platform that says otherwise.
 * Both directions are asserted so that "just use Georgia everywhere" cannot
 * pass either: Georgia is not installed on Android.
 */
import { Platform } from "react-native";
import { FONTS, familyFor } from "../fonts";

describe("familyFor", () => {
  it.each([
    ["serif", "ios", "Georgia"],
    ["serif", "android", "serif"],
    ["mono", "ios", "Menlo"],
    ["mono", "android", "monospace"],
  ] as const)("%s on %s is %s", (kind, os, expected) => {
    expect(familyFor(kind, os)).toBe(expected);
  });

  it("never hands iOS a generic name it cannot resolve", () => {
    expect(familyFor("serif", "ios")).not.toBe("serif");
    expect(familyFor("mono", "ios")).not.toBe("monospace");
  });
});

describe("FONTS, as the app actually loads them", () => {
  it("is resolved for the platform Jest runs as, which is iOS", () => {
    expect(Platform.OS).toBe("ios");
    expect(FONTS.serif).toBe("Georgia");
    expect(FONTS.mono).toBe("Menlo");
  });

  it("resolves to the generic names when the platform is Android", () => {
    jest.doMock("react-native/Libraries/Utilities/Platform", () => ({
      __esModule: true,
      default: {
        OS: "android",
        select: (spec: Record<string, unknown>) => spec.android ?? spec.default,
      },
    }));
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const android = require("../fonts") as typeof import("../fonts");
        expect(android.FONTS.serif).toBe("serif");
        expect(android.FONTS.mono).toBe("monospace");
      });
    } finally {
      jest.dontMock("react-native/Libraries/Utilities/Platform");
    }
  });
});
