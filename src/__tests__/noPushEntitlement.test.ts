/**
 * The iOS app asks for no remote-push entitlement (2026-11-14).
 *
 * expo-notifications always adds `aps-environment` to the app's entitlements.
 * MultiMagic only schedules LOCAL notifications (note reminders), which need
 * no entitlement, and the App Store provisioning profile has no Push
 * capability. With the key present, the 1.1.1 EAS build failed: "Provisioning
 * profile … doesn't include the aps-environment entitlement".
 * plugins/withoutPushEntitlement.js removes it again. Expo runs mods in
 * REVERSE order of registration, so it is listed BEFORE expo-notifications
 * (measured 2026-11-14 with `expo config --type introspect`: listed after,
 * the key stayed; listed before, it is gone).
 *
 * If remote push is ever added: enable Push on the App ID, regenerate the
 * profile, then delete this plugin and this test.
 */
import appJson from "../../app.json";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { stripPushEntitlement } = require("../../plugins/withoutPushEntitlement") as {
  stripPushEntitlement: (e: Record<string, unknown>) => Record<string, unknown>;
};

const names = (appJson.expo.plugins as unknown[]).map((p) => (Array.isArray(p) ? String(p[0]) : String(p)));

it("removes aps-environment and keeps every other entitlement", () => {
  const out = stripPushEntitlement({
    "aps-environment": "production",
    "com.apple.security.application-groups": ["group.com.multimagics.mobile"],
  });
  expect(out).not.toHaveProperty("aps-environment");
  expect(out["com.apple.security.application-groups"]).toEqual(["group.com.multimagics.mobile"]);
});

it("is listed before expo-notifications, so its mod runs after the one that adds the key", () => {
  const notif = names.indexOf("expo-notifications");
  const strip = names.indexOf("./plugins/withoutPushEntitlement");
  expect(notif).toBeGreaterThanOrEqual(0);
  expect(strip).toBeGreaterThanOrEqual(0);
  expect(strip).toBeLessThan(notif);
});

it("the app registers for no remote push token", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { execSync } = require("child_process") as typeof import("child_process");
  const hits = execSync(
    "grep -rlE 'getExpoPushTokenAsync|getDevicePushTokenAsync' src app --include=*.ts --include=*.tsx || true",
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((f) => f && !f.includes("__tests__"));
  expect(hits).toEqual([]);
});
