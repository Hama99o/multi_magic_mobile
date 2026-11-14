/**
 * Removes the remote-push entitlement that expo-notifications always adds.
 *
 * MultiMagic schedules LOCAL notifications only (note reminders). Those need
 * no entitlement, and the App Store profile has no Push capability, so the
 * key made the 1.1.1 iOS build fail. Expo runs mods in reverse order of
 * registration, so this is listed BEFORE expo-notifications in app.json. src/__tests__/noPushEntitlement.test.ts holds the order and
 * the "no push token" rule. If remote push is ever added, enable Push on the
 * App ID, regenerate the profile, then delete this plugin and its test.
 */
const { withEntitlementsPlist } = require("expo/config-plugins");

function stripPushEntitlement(entitlements) {
  const out = { ...entitlements };
  delete out["aps-environment"];
  return out;
}

const withoutPushEntitlement = (config) =>
  withEntitlementsPlist(config, (c) => {
    c.modResults = stripPushEntitlement(c.modResults);
    return c;
  });

module.exports = withoutPushEntitlement;
module.exports.stripPushEntitlement = stripPushEntitlement;
