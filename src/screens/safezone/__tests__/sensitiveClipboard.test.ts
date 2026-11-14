/**
 * Android 13+ shows a preview of whatever is copied, over every app, unless
 * the clip is marked sensitive (`ClipDescription.EXTRA_IS_SENSITIVE`, API 33,
 * developer.android.com/develop/ui/views/touch-and-input/copy-paste#SensitiveContent).
 * `expo-clipboard` 57 cannot set that flag (its SetStringOptions has
 * `inputFormat` only), so SafeZone copies through a local module,
 * `modules/sensitive-clipboard`, and falls back to `expo-clipboard` wherever
 * that module is not there: iOS, an old build, a failure.
 *
 * What Jest can say: which path a copy takes. Whether the preview is hidden
 * is a device check (SPEC §G D10).
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createSensitiveSetter } from "../sensitiveClipboard";

const ROOT = join(__dirname, "../../../..");

describe("a SafeZone copy is marked sensitive where it can be", () => {
  const fallback = () => jest.fn(async () => true);

  it("Android with the module: through the module, not expo-clipboard", async () => {
    const native = { setSensitiveStringAsync: jest.fn(async () => true) };
    const fb = fallback();
    await createSensitiveSetter({ native, platform: "android", fallback: fb })("hunter2");
    expect(native.setSensitiveStringAsync).toHaveBeenCalledWith("hunter2");
    expect(fb).not.toHaveBeenCalled();
  });

  it("iOS: expo-clipboard (the module is Android-only)", async () => {
    const native = { setSensitiveStringAsync: jest.fn(async () => true) };
    const fb = fallback();
    await createSensitiveSetter({ native, platform: "ios", fallback: fb })("hunter2");
    expect(native.setSensitiveStringAsync).not.toHaveBeenCalled();
    expect(fb).toHaveBeenCalledWith("hunter2");
  });

  it("Android without the module (a build before it): expo-clipboard", async () => {
    const fb = fallback();
    await createSensitiveSetter({ native: null, platform: "android", fallback: fb })("hunter2");
    expect(fb).toHaveBeenCalledWith("hunter2");
  });

  it("the module fails: the copy still happens, through expo-clipboard", async () => {
    const native = { setSensitiveStringAsync: jest.fn(async () => Promise.reject(new Error("no context"))) };
    const fb = fallback();
    await createSensitiveSetter({ native, platform: "android", fallback: fb })("hunter2");
    expect(fb).toHaveBeenCalledWith("hunter2");
  });

  it("the app's guard copies through it", () => {
    const guard = readFileSync(join(ROOT, "src/screens/safezone/clipboardGuard.ts"), "utf8");
    expect(guard).toMatch(/setStringAsync: sensitiveSetString/);
  });

  it("the module sets the flag the platform documents, by its API 33 name and its literal below", () => {
    const kt = readFileSync(join(ROOT, "modules/sensitive-clipboard/android/src/main/java/expo/modules/sensitiveclipboard/SensitiveClipboardModule.kt"), "utf8");
    expect(kt).toMatch(/ClipDescription\.EXTRA_IS_SENSITIVE/);
    expect(kt).toMatch(/"android\.content\.extra\.IS_SENSITIVE"/);
    expect(kt).toMatch(/Name\("SensitiveClipboard"\)/);
  });
});
