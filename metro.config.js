const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Keep docs and design references out of Metro's file map. Nothing under
// `docs/` is ever bundled, but writing to one still reloads the bundle — which
// mid-session blanks whatever is on screen. Lifted from karwan-mobile, where
// the same exclusion cost real time twice in one day.
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  /.*\/docs\/.*/,
];

module.exports = withNativeWind(config, { input: "./src/styles/global.css" });
