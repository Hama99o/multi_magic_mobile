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
