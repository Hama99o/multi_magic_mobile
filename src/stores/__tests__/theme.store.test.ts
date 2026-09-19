/**
 * The theme chooser reaches the NATIVE window on iOS.
 *
 * Our own palette follows the store everywhere; what does not is what iOS
 * draws for us — the keyboard, Alert, the pickers — which read the window's
 * `overrideUserInterfaceStyle`. `Appearance.setColorScheme` is how the choice
 * gets there, and this file pins three things: it is called with the choice,
 * "System" hands control back with `null`, and Android is left alone tonight.
 */
const mockSetColorScheme = jest.fn();
jest.mock("react-native/Libraries/Utilities/Appearance", () => ({
  __esModule: true,
  setColorScheme: (...args: unknown[]) => mockSetColorScheme(...args),
  getColorScheme: () => "light",
  addChangeListener: () => ({ remove: () => {} }),
}));

/* eslint-disable import/first */
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useThemeStore } from "../theme.store";

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useThemeStore.setState({ choice: "system", hydrated: false });
});

afterEach(() => jest.restoreAllMocks());

describe("on iOS", () => {
  it("runs as iOS, so the assertions below are the real platform", () => {
    expect(Platform.OS).toBe("ios");
  });

  it("tells the window when Dark is chosen", () => {
    useThemeStore.getState().setChoice("dark");

    expect(mockSetColorScheme).toHaveBeenCalledWith("dark");
    expect(useThemeStore.getState().choice).toBe("dark");
  });

  it("hands control back to the phone for System, with null and not a string", () => {
    useThemeStore.getState().setChoice("light");
    useThemeStore.getState().setChoice("system");

    expect(mockSetColorScheme).toHaveBeenLastCalledWith(null);
  });

  // The first frame after launch has to be right too — a keyboard that is
  // white until the person opens the theme row is the bug in slow motion.
  it("applies a stored choice on hydrate, before anything is drawn", async () => {
    await AsyncStorage.setItem("mm-theme", "dark");

    await useThemeStore.getState().hydrate();

    expect(mockSetColorScheme).toHaveBeenCalledWith("dark");
    expect(useThemeStore.getState().hydrated).toBe(true);
  });

  it("does not touch the window when nothing was stored", async () => {
    await useThemeStore.getState().hydrate();

    expect(mockSetColorScheme).not.toHaveBeenCalled();
  });
});

describe("on Android", () => {
  // Deliberately not widened tonight: on Android the same call is a
  // configuration change through AppCompatDelegate, and the one emulator is
  // running flows. The store still records the choice; only the native call
  // is withheld.
  it("records the choice and leaves the native window alone", () => {
    const os = jest.replaceProperty(Platform, "OS", "android");
    try {
      useThemeStore.getState().setChoice("dark");

      expect(useThemeStore.getState().choice).toBe("dark");
      expect(mockSetColorScheme).not.toHaveBeenCalled();
    } finally {
      os.restore();
    }
  });
});
