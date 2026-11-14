/**
 * The wiring of the clipboard sweep (`clipboardGuard.ts`, `app/_layout.tsx`):
 * a SafeZone copy left behind by a killed app is cleared at the next launch
 * and on the next return to the foreground, wherever the app opens. The
 * marker logic itself is `clipboardMarker.test.ts`; this proves the real
 * guard is built with it, and that the root layout calls the sweep.
 */
import { readFileSync } from "fs";
import { join } from "path";

type Listener = (s: string) => void;

function load(clipboardText: string) {
  let text = clipboardText;
  const listeners: Listener[] = [];
  jest.resetModules();
  jest.doMock("expo-clipboard", () => ({
    setStringAsync: jest.fn(async (v: string) => {
      text = v;
      return true;
    }),
    getStringAsync: jest.fn(async () => text),
  }));
  const rn = jest.requireActual("react-native") as typeof import("react-native");
  jest.spyOn(rn.AppState, "addEventListener").mockImplementation((_e, fn) => {
    listeners.push(fn as Listener);
    return { remove: jest.fn() } as never;
  });
  Object.defineProperty(rn.Platform, "OS", { value: "android", configurable: true });
  const guard = require("../clipboardGuard") as typeof import("../clipboardGuard");
  return { guard, read: () => text, foreground: () => listeners.forEach((l) => l("active")) };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const realOS = (jest.requireActual("react-native") as typeof import("react-native")).Platform.OS;
afterEach(() => {
  Object.defineProperty((jest.requireActual("react-native") as typeof import("react-native")).Platform, "OS", { value: realOS, configurable: true });
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("the clipboard sweep", () => {
  it("a copy from a process that was killed is cleared at the next launch, once due", async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    // Process 1 copies a secret and dies before its 30 s timer.
    const first = load("");
    await first.guard.clipboardGuard.copy("hunter2");
    expect(first.read()).toBe("hunter2");
    // Process 2 starts 40 s later on the same secure store and clipboard.
    jest.setSystemTime(1_040_000);
    const second = load("hunter2");
    second.guard.wireClipboardSweep();
    await flush();
    expect(second.read()).toBe("");
  });

  it("and on a return to the foreground", async () => {
    jest.useFakeTimers({ now: 2_000_000 });
    const first = load("");
    await first.guard.clipboardGuard.copy("s3cret-pw");
    const second = load("s3cret-pw");
    second.guard.wireClipboardSweep(); // launched before the deadline: kept for now
    await flush();
    expect(second.read()).toBe("s3cret-pw");
    jest.setSystemTime(2_031_000);
    second.foreground();
    await flush();
    expect(second.read()).toBe("");
  });

  it("the root layout calls it", () => {
    const layout = readFileSync(join(__dirname, "../../../../app/_layout.tsx"), "utf8");
    expect(layout).toMatch(/^wireClipboardSweep\(\);$/m);
  });
});
