/**
 * The share extension's configuration (`app.json`, expo-share-intent), read
 * the way the plugin reads it (contacts SPEC §F.3, the owner 2026-11-13: a
 * contact shared from iOS must reach MultiMagic, under the name
 * "MultiMagic", not "MultiMagic Pages").
 *
 * What this cannot see: iOS actually offering MultiMagic in the share sheet
 * of the Contacts app. That is NOT MEASURED until the owner's iPhone (RC).
 */
import appJson from "../../app.json";
// The plugin's own functions: the bundle id is computed exactly as the build computes it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const constants = require("expo-share-intent/plugin/build/ios/constants") as {
  getShareExtensionBundledIdentifier: (appId: string, p: Record<string, unknown>) => string;
  getShareExtensionName: (p: Record<string, unknown>) => string;
};

type Plugin = [string, Record<string, unknown>];
const share = (appJson.expo.plugins as unknown[]).find((p): p is Plugin => Array.isArray(p) && String(p[0]).includes("share-intent"));
const params = share?.[1] ?? {};
const APP_ID = appJson.expo.ios.bundleIdentifier;

it("is called MultiMagic in the share sheet", () => {
  expect(params.iosShareExtensionName).toBe("MultiMagic");
});

it("keeps the extension's bundle id the rename could have moved (signing, App Store record)", () => {
  expect(params.iosShareExtensionBundleIdentifier).toBeUndefined();
  const before = constants.getShareExtensionBundledIdentifier(APP_ID, { ...params, iosShareExtensionName: "MultiMagic Pages" });
  const after = constants.getShareExtensionBundledIdentifier(APP_ID, params);
  expect(after).toBe(before);
  expect(after).toBe("com.multimagics.mobile.share-extension");
});

describe("iOS offers MultiMagic for", () => {
  const rule = String(params.iosActivationRules);
  it.each(["public.vcard", "public.image", "public.movie", "public.plain-text", "public.file-url", "public.content"])("%s", (uti) => {
    expect(rule).toContain(`UTI-CONFORMS-TO "${uti}"`);
  });

  it("but not a bare web link (public.url, and public.data which a link conforms to)", () => {
    expect(rule).not.toMatch(/"public\.url"|"public\.data"/);
  });

  it("up to 100 attachments, as before", () => {
    expect(rule).toContain("attachments.@count <= 100");
  });
});

it("Android accepts every type, vCards included (text/vcard, text/x-vcard)", () => {
  expect(params.androidIntentFilters).toEqual(["*/*"]);
  expect(params.androidMultiIntentFilters).toEqual(["*/*"]);
});
