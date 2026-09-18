/**
 * Jest — the unit layer, and for Phase 1 it is the ONLY layer.
 *
 * The auth-and-transport spine (fingerprint, token, cable URL, reconnect
 * resync) cannot be seen by looking at a screen: a fingerprint mismatch does
 * not render, and a resync that fetches the wrong endpoint shows an empty
 * transcript rather than an error. So it has to be seen by a test.
 *
 * `transformIgnorePatterns` is not boilerplate: RN/Expo packages ship
 * untranspiled ESM, and a package missing from this list fails with a syntax
 * error on `import` that points at OUR file's first import line rather than at
 * the module three hops away that actually needs the transform.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/src/__tests__/env.ts"],
  setupFilesAfterEnv: [
    "<rootDir>/src/__tests__/setup.ts",
  ],
  testMatch: ["**/__tests__/**/*.test.[jt]s?(x)"],
  testTimeout: 30000,
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.[jt]sx?$": [
      "babel-jest",
      {
        caller: { name: "metro", bundler: "metro", platform: "android" },
        configFile: "./babel.config.js",
      },
    ],
  },
  transformIgnorePatterns: [
    "node_modules/(?!(" +
      "@react-native|" +
      "react-native|" +
      "expo|" +
      "@expo|" +
      "expo-router|" +
      "@react-navigation|" +
      "expo-modules-core|" +
      "expo-constants|" +
      "expo-crypto|" +
      "expo-font|" +
      "expo-image|" +
      "expo-asset|" +
      "expo-linking|" +
      "expo-haptics|" +
      "expo-secure-store|" +
      "expo-speech-recognition|" +
      "expo-document-picker|" +
      "expo-image-picker|" +
      "expo-splash-screen|" +
      "expo-status-bar|" +
      "nativewind|" +
      "@nativewind|" +
      "react-native-css-interop|" +
      "react-native-reanimated|" +
      "react-native-worklets|" +
      "react-native-gesture-handler|" +
      "react-native-safe-area-context|" +
      "react-native-screens|" +
      "react-native-svg|" +
      "@shopify/flash-list|" +
      "lucide-react-native|" +
      "@rails/actioncable|" +
      "zustand" +
      ")/)",
  ],
  collectCoverageFrom: [
    "src/api/**/*.ts",
    "src/lib/**/*.ts",
    "src/theme/**/*.ts",
    "!src/**/__tests__/**",
  ],
};
