/**
 * Lifted from karwan-mobile, minus the rule that does not apply here.
 *
 * NOT CARRIED OVER: Karwan's `no-restricted-syntax` ban on physical spacing
 * utilities (`pl-`, `mr-`, `text-left`…). That rule exists because Karwan ships
 * Pashto and Dari and a physical utility does not flip under RTL, so it ships a
 * mirrored bug. This app is English and LTR — `config/locales/` in multi_magic
 * holds only `en.yml` — so the same rule here would be cargo: a warning with no
 * failure behind it, which teaches people to ignore warnings.
 */
module.exports = {
  extends: ["expo"],
  ignorePatterns: [
    "node_modules/",
    "coverage/",
    ".expo/",
    "docs/",
    "*.config.js",
  ],
};
