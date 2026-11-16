/**
 * The native modules a SCREEN reaches for, as values a `jest.mock` factory can
 * return. A factory may not close over imports, but it may `require`:
 *
 *   jest.mock("expo-router", () => require("@/__tests__/screenMocks").expoRouter);
 *
 * One copy, so a journey test is its screens and its steps, not forty lines
 * of mocks copied from the last one.
 */
const navigation = { getState: () => ({ index: 0, routes: [{ name: "home" }] }) };
export const expoRouter = {
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ id: "266", name: "Qa MOBILE", isGroup: "0", unread: "0" }),
  Link: ({ children }: { children: unknown }) => children,
  // The root stack: the assistant reads the screen under it (#35).
  useNavigation: () => navigation,
};
export const clipboard = { setStringAsync: jest.fn() };
export const haptics = { impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" } };
export const linking = { openURL: jest.fn() };
export const imagePicker = {
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
};
/** The socket is a no-op: its behaviour is `cable.test.ts`'s. */
export const cable = {
  subscribeToChannel: jest.fn(() => jest.fn()),
  performOnChannel: jest.fn(() => true),
  resetCable: jest.fn(),
};
