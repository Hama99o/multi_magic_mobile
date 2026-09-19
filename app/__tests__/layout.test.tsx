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
jest.mock("expo-router", () => ({
  Stack: (props: unknown) => {
    mockStack(props);
    return null;
  },
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
