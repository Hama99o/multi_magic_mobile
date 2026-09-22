/**
 * CHOOSING WHAT THE MICROPHONE LISTENS IN.
 *
 * His words: *"speech to text we should be able to choose french or english,
 * and if there is pashto possible add that also, for ai assistant speech to
 * text."*
 *
 * Two languages already existed and the only way to move between them was a
 * long press on the mic — nothing on screen said the gesture was there or
 * which language was current.
 *
 * The case worth the most care is the one that is easy to get backwards:
 * `getSupportedLocales()` returns an EMPTY array on Android 12 and below
 * rather than an error, so reading empty as "no languages" would grey out
 * every option on a phone where dictation works.
 */
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react-native";

/** Let the locale query resolve AND its state land, so an assertion about
 *  support is about an answer rather than about the moment before one. */
async function settled() {
  await waitFor(() => expect(mockGetSupportedLocales).toHaveBeenCalled());
  await act(async () => {});
}

const mockGetSupportedLocales = jest.fn();
jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    getSupportedLocales: (...a: unknown[]) => mockGetSupportedLocales(...a),
    getSpeechRecognitionServices: () => ["com.google.android.as"],
    isRecognitionAvailable: () => true,
  },
  useSpeechRecognitionEvent: () => {},
}));

/* eslint-disable import/first */
import { DictationRow } from "../DictationRow";

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSupportedLocales.mockResolvedValue({ locales: [], installedLocales: [] });
});

const noop = () => {};

describe("the three languages", () => {
  it("offers French, English and Pashto", async () => {
    render(<DictationRow lang="fr-FR" onChange={noop} />);

    expect(screen.getByTestId("dictation-fr-FR")).toBeTruthy();
    expect(screen.getByTestId("dictation-en-US")).toBeTruthy();
    // His request. `Ai::RagChat` already answers in Pashto; only the mic could not.
    expect(screen.getByTestId("dictation-ps-AF")).toBeTruthy();
  });

  it("changes the language when one is chosen", async () => {
    const onChange = jest.fn();
    render(<DictationRow lang="fr-FR" onChange={onChange} />);

    fireEvent.press(screen.getByTestId("dictation-en-US"));
    expect(onChange).toHaveBeenCalledWith("en-US");
  });
});

describe("when the phone says which languages it has", () => {
  it("disables one it cannot hear, rather than hiding it", async () => {
    mockGetSupportedLocales.mockResolvedValue({
      locales: ["fr_FR", "en_US"],
      installedLocales: ["en_US"],
    });
    const onChange = jest.fn();
    render(<DictationRow lang="fr-FR" onChange={onChange} />);

    await settled();
    expect(screen.getByTestId("dictation-ps-AF").props.accessibilityState.disabled).toBe(true);
    // Hiding it would make his request look ignored; offering it would fail at
    // the mic instead of here.
    fireEvent.press(screen.getByTestId("dictation-ps-AF"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("says why, once, rather than beside every row", async () => {
    mockGetSupportedLocales.mockResolvedValue({
      locales: ["fr_FR", "en_US"],
      installedLocales: [],
    });
    render(<DictationRow lang="fr-FR" onChange={noop} />);

    await waitFor(() => expect(screen.getByTestId("dictation-unavailable")).toBeTruthy());
  });

  /**
   * Android reports `fr_CA` with an underscore and a different region. A phone
   * that can hear French can hear French spoken at it, so the comparison is on
   * the language subtag.
   */
  it("matches on the language, not the region or the separator", async () => {
    mockGetSupportedLocales.mockResolvedValue({
      locales: ["fr_CA", "en_GB"],
      installedLocales: [],
    });
    render(<DictationRow lang="fr-FR" onChange={noop} />);
    // `settled()` rather than `waitFor` on the assertion: the row starts
    // enabled, so a waitFor would pass on the state BEFORE the query resolves
    // and prove nothing about the matching.
    await settled();

    expect(screen.getByTestId("dictation-fr-FR").props.accessibilityState.disabled).toBe(false);
  });
});

describe("when the phone cannot say", () => {
  /**
   * THE ONE THAT MATTERS. `getSupportedLocales` returns an empty array on
   * Android 12 and below rather than an error. Treating that as "supports
   * nothing" would disable every language on a phone where dictation works
   * perfectly — so an unknown answer offers everything, and a language that
   * then fails says so through the mic's own `problem` line.
   */
  it("offers everything when the list comes back empty", async () => {
    mockGetSupportedLocales.mockResolvedValue({ locales: [], installedLocales: [] });
    const onChange = jest.fn();
    render(<DictationRow lang="fr-FR" onChange={onChange} />);
    // WAIT FOR THE ANSWER. Asserting before the query resolves makes this pass
    // whatever the code does — the first version of this test did exactly that
    // and survived a plant that treated an empty list as "supports nothing".
    await settled();

    expect(screen.getByTestId("dictation-ps-AF").props.accessibilityState.disabled).toBe(false);
    fireEvent.press(screen.getByTestId("dictation-ps-AF"));
    expect(onChange).toHaveBeenCalledWith("ps-AF");
    expect(screen.queryByTestId("dictation-unavailable")).toBeNull();
  });

  it("offers everything when asking throws", async () => {
    mockGetSupportedLocales.mockRejectedValue(new Error("package_not_found"));
    const onChange = jest.fn();
    render(<DictationRow lang="fr-FR" onChange={onChange} />);
    await settled();

    expect(screen.getByTestId("dictation-ps-AF").props.accessibilityState.disabled).toBe(false);
    fireEvent.press(screen.getByTestId("dictation-ps-AF"));
    expect(onChange).toHaveBeenCalledWith("ps-AF");
  });
});
