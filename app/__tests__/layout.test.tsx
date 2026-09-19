/**
 * The root: the status bar and the Stack's ground follow the APP's theme.
 *
 * They used to follow `useColorScheme()` — the phone — while every View
 * followed the store. The two agree until somebody uses the theme chooser,
 * which is the only moment it matters: Dark chosen on a light phone gave dark
 * status-bar glyphs on a #102125 ground, i.e. no status bar, and a light Stack
 * background flashing between screens. So the phone is pinned to "light" here
 * and the store is flipped, and the bar must follow the store.
 */
import { act, render, waitFor } from "@testing-library/react-native";

const mockStatusBar = jest.fn();
jest.mock("expo-status-bar", () => ({
  StatusBar: (props: unknown) => {
    mockStatusBar(props);
    return null;
  },
}));

const mockStack = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  Stack: (props: unknown) => {
    mockStack(props);
    return null;
  },
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}));

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
}));

// The PHONE says light, throughout. Whatever the bar does must come from the
// store, or this mock would make it wrong.
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => "light",
}));

// NativeWind's stylesheet is a Metro concern; Jest has no CSS pipeline.
jest.mock("@/styles/global.css", () => ({}));

/* eslint-disable import/first */
import RootLayout from "../_layout";
import { useAuthStore } from "@/stores/auth.store";
import { useThemeStore } from "@/stores/theme.store";
import { TOKENS } from "@/theme/tokens";
import AsyncStorage from "@react-native-async-storage/async-storage";

type StatusBarProps = { style: string };
type StackProps = { screenOptions: { contentStyle: { backgroundColor: string } } };

const lastStatusBar = (): StatusBarProps => mockStatusBar.mock.calls.at(-1)![0] as StatusBarProps;
const lastStack = (): StackProps => mockStack.mock.calls.at(-1)![0] as StackProps;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useThemeStore.setState({ choice: "system", hydrated: false });
  useAuthStore.setState({ user: null, status: "unknown", signedOutReason: null });
});

describe("a session that ends underneath the app", () => {
  // A 401 clears the token and flips the store — and until this, nobody
  // navigated. The chat stayed up, every request failing, nothing said.
  it("goes to sign-in when the sign-out was FORCED", async () => {
    render(<RootLayout />);
    await waitFor(() => expect(mockStatusBar).toHaveBeenCalled());
    act(() => useAuthStore.setState({ status: "signedIn" }));

    act(() => useAuthStore.getState().forceSignOut("revoked"));

    expect(mockReplace).toHaveBeenCalledWith("/sign-in");
    expect(useAuthStore.getState().signedOutReason).toBe("revoked");
  });

  // The sessions sheet navigates itself on a deliberate sign-out; doing it
  // here too would be two replaces for one departure.
  it("leaves a deliberate sign-out to the screen that made it", async () => {
    render(<RootLayout />);
    await waitFor(() => expect(mockStatusBar).toHaveBeenCalled());
    act(() => useAuthStore.setState({ status: "signedIn" }));

    act(() => useAuthStore.setState({ status: "signedOut", signedOutReason: null }));

    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("the status bar", () => {
  it("draws LIGHT glyphs when the app is Dark, whatever the phone says", async () => {
    useThemeStore.setState({ choice: "dark" });

    render(<RootLayout />);

    await waitFor(() => expect(mockStatusBar).toHaveBeenCalled());
    expect(lastStatusBar().style).toBe("light");
    expect(lastStack().screenOptions.contentStyle.backgroundColor).toBe(TOKENS.dark.ground);
  });

  it("follows the chooser live", async () => {
    useThemeStore.setState({ choice: "dark" });
    render(<RootLayout />);
    await waitFor(() => expect(mockStatusBar).toHaveBeenCalled());

    act(() => useThemeStore.setState({ choice: "light" }));

    await waitFor(() => expect(lastStatusBar().style).toBe("dark"));
    expect(lastStack().screenOptions.contentStyle.backgroundColor).toBe(TOKENS.light.ground);
  });

  it("takes the phone's answer when the choice is System", async () => {
    useThemeStore.setState({ choice: "system" });

    render(<RootLayout />);

    await waitFor(() => expect(mockStatusBar).toHaveBeenCalled());
    // The phone is mocked light, so dark glyphs on a light ground.
    expect(lastStatusBar().style).toBe("dark");
    expect(lastStack().screenOptions.contentStyle.backgroundColor).toBe(TOKENS.light.ground);
  });
});
