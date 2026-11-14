/**
 * react-native-screens 4.26.2 (Expo SDK 57's `~4.26.0`) has a use-after-free
 * that crashes the app in `MountingCoordinator::pullTransaction` (SIGSEGV on
 * the JS thread, about 1 launch in 20 on the device, 2026-11-13/14; see
 * `docs/FABRIC_CRASH_2026-11-14.md`). Upstream fixed it in 4.28.0
 * (software-mansion/react-native-screens#4413); we backport that PR as a
 * patch-package patch, so Expo's pin stays.
 *
 * These checks keep the backport honest:
 * - the patch is named for the INSTALLED version, so moving screens without
 *   re-making the patch fails here (patch-package would only warn);
 * - the installed source really carries the fix (postinstall applied it).
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");
const SCREENS = join(ROOT, "node_modules/react-native-screens");
const installed: string = JSON.parse(readFileSync(join(SCREENS, "package.json"), "utf8")).version;
const patchFile = join(ROOT, `patches/react-native-screens+${installed}.patch`);

describe("the react-native-screens use-after-free backport (#4413)", () => {
  it("has a patch for the installed version", () => {
    expect(existsSync(patchFile)).toBe(true);
  });

  it("the patch is the fix: one immortal listener, a guarded install, no raw `this`", () => {
    const patch = readFileSync(patchFile, "utf8");
    expect(patch).toMatch(/removalListener\(\)/);
    expect(patch).toMatch(/installMutex_/);
    expect(patch).toMatch(/clearListener\(removalListenerToken_\)/);
    expect(patch).toMatch(/listenerMutex_/);
  });

  it("the installed NativeProxy.cpp carries it (postinstall applied the patch)", () => {
    const proxy = readFileSync(join(SCREENS, "android/src/main/cpp/NativeProxy.cpp"), "utf8");
    expect(proxy).toMatch(/std::lock_guard<std::mutex> lock\(installMutex_\)/);
    expect(proxy).toMatch(/static const std::shared_ptr<RNSScreenRemovalListener> instance/);
    expect(proxy).not.toMatch(/\[this\]\(int tag\)/);
  });

  it("the installed listener passes a transaction through when no callback is set", () => {
    const listener = readFileSync(join(SCREENS, "cpp/RNSScreenRemovalListener.cpp"), "utf8");
    expect(listener).toMatch(/if \(!listener\) \{/);
  });
});
