/**
 * One in-memory SecureStore for the whole suite.
 *
 * The device fingerprint and the token both live in SecureStore, and both are
 * read through a module-level cache, so a test that writes one and a test that
 * reads it must agree about the store. Mocking it per-file drifted in Karwan.
 */
const secureStore: Record<string, string> = {};

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => secureStore[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    secureStore[k] = v;
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    delete secureStore[k];
  }),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "11111111-2222-3333-4444-555555555555"),
}));

export function __clearSecureStore(): void {
  for (const k of Object.keys(secureStore)) delete secureStore[k];
}

(globalThis as { __clearSecureStore?: () => void }).__clearSecureStore =
  __clearSecureStore;

/**
 * `logApiFailure` warns on every failed request, and several suites fail
 * requests on purpose. Silencing it keeps a passing run readable; a test that
 * cares about the log can spy on it.
 */
jest.spyOn(console, "warn").mockImplementation(() => {});

/**
 * `useSafeAreaInsets` throws outside a provider, and `ScreenContainer` calls it
 * — so every screen test would fail on "No safe area value available" rather
 * than on anything it was testing. The library ships this mock for exactly
 * that, and it reports real inset numbers, so a test can still catch a screen
 * that ignores them.
 */
// `.default` — the library ships the mock as an ES default export, so requiring
// the module object gives you `{ default: {...} }` and every hook reads as
// undefined ("useSafeAreaInsets is not a function").
jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock").default,
);

/**
 * AsyncStorage is a native module, so importing it in a test throws before any
 * assertion runs. The library ships this mock for exactly that; it keeps an
 * in-memory store, so `useDraft` is genuinely exercised rather than stubbed.
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

/**
 * `expo-speech-recognition` is a native module: importing it under Jest throws
 * "Cannot find native module 'ExpoSpeechRecognition'" before any assertion
 * runs, and it takes down every suite that renders the composer — not just the
 * ones about dictation.
 *
 * The defaults describe a working device (a recogniser present, permission
 * granted) because that is the case most screens are rendered in. A suite about
 * dictation itself mocks `@/hooks/useSpeechToText` instead, which is the seam
 * where the interesting states live.
 */
jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: "granted" })),
    getPermissionsAsync: jest.fn(async () => ({ granted: true, status: "granted" })),
    getSpeechRecognitionServices: jest.fn(() => ["com.google.android.googlequicksearchbox"]),
    getSupportedLocales: jest.fn(async () => ({ locales: [], installedLocales: [] })),
  },
  useSpeechRecognitionEvent: jest.fn(),
}));
