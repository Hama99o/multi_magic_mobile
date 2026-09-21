/**
 * The switch, beside the theme.
 *
 * The rule worth a test: **each language is written in itself.** The way out
 * of a language you cannot read has to be legible from inside it, so the
 * French option says "Français" in an English app and the English one says
 * "English" in a French one. The web's own switcher does the same.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { LanguageRow } from "../LanguageRow";
import { __resetLanguage, useLanguage } from "@/stores/language.store";
import i18n from "@/i18n";
import { profileApi } from "@/api/profile";

beforeEach(() => {
  jest.clearAllMocks();
  __resetLanguage();
  jest.spyOn(profileApi, "update").mockResolvedValue({
    id: 7, email: null, lang: "fr", firstName: null, lastName: null, fullName: null,
    username: null, about: null, phoneNumber: null, avatar: null, createdAt: null,
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  __resetLanguage();
  await i18n.changeLanguage("en");
});

describe("the row", () => {
  it("offers both languages, each written in itself", () => {
    render(<LanguageRow userId={7} />);

    expect(screen.getByTestId("language-en")).toBeTruthy();
    expect(screen.getByTestId("language-fr")).toBeTruthy();
    expect(screen.getByText("English")).toBeTruthy();
    expect(screen.getByText("Français")).toBeTruthy();
  });

  it("marks the one in force", () => {
    render(<LanguageRow userId={7} />);

    expect(screen.getByTestId("language-en").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("language-fr").props.accessibilityState.selected).toBe(false);
  });

  it("switches the app and saves it for the web too", () => {
    render(<LanguageRow userId={7} />);

    fireEvent.press(screen.getByTestId("language-fr"));

    expect(useLanguage.getState().language).toBe("fr");
    expect(profileApi.update).toHaveBeenCalledWith(7, { lang: "fr" });
  });

  it("still reads in the other language once switched", async () => {
    await i18n.changeLanguage("fr");
    useLanguage.setState({ language: "fr" });
    render(<LanguageRow userId={7} />);

    // The way back is legible from inside French.
    expect(screen.getByText("English")).toBeTruthy();
    expect(screen.getByTestId("language-fr").props.accessibilityState.selected).toBe(true);
  });
});
