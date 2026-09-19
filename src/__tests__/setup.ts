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
    // `SFSpeechRecognizer.isAvailable` on iOS, `SpeechRecognizer.isRecognitionAvailable`
    // on Android. True by default: a working device.
    isRecognitionAvailable: jest.fn(() => true),
    supportsOnDeviceRecognition: jest.fn(() => false),
    getSupportedLocales: jest.fn(async () => ({ locales: [], installedLocales: [] })),
  },
  useSpeechRecognitionEvent: jest.fn(),
}));

/**
 * `expo-audio` and `expo-speech` are native modules too, and the read-aloud
 * store requires both inside a try for the same reason as the recogniser: a
 * binary without them must render NO control, not crash the chat. Under Jest
 * the real modules would throw at import, which is the "absent" case — so the
 * mocks describe a device that HAS both, and a suite about absence isolates
 * the store with a module that throws.
 *
 * The player is a small stateful fake: `play`/`pause`/`seekTo` update the
 * fields a listener would see, and `__emit` lets a test deliver a status
 * event, so the store is exercised through the surface it uses on a phone.
 */
// The factory is ONE `require`, deliberately: babel-plugin-jest-hoist refuses
// any identifier in a mock factory that is not on its allowlist, and a TYPE
// counts — `Record<string, unknown>` in a parameter annotation is the
// identifier `Record`, which fails the whole FILE to load (17 suites, with an
// error naming neither the type nor the factory). `require` is allowed, so the
// fake lives in a module that may use types freely.
jest.mock("expo-audio", () => require("./mocks/expoAudio"));

jest.mock("expo-speech", () => ({
  speak: jest.fn(),
  stop: jest.fn(async () => {}),
  pause: jest.fn(async () => {}),
  resume: jest.fn(async () => {}),
  isSpeakingAsync: jest.fn(async () => false),
  maxSpeechInputLength: 4000,
}));
