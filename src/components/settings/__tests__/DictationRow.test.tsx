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

describe("the two languages", () => {
  it("offers French and English, and nothing else", async () => {
    render(<DictationRow lang="fr-FR" onChange={noop} />);

    expect(screen.getByTestId("dictation-fr-FR")).toBeTruthy();
    expect(screen.getByTestId("dictation-en-US")).toBeTruthy();
    // Pashto was offered until 2026-09-24 and was removed — see LANGUAGES in
    // useSpeechToText.ts for why, and for what the long press needs if it ever
    // comes back. Asserted ABSENT rather than simply dropped, so that putting
    // it back without reading that note fails here first.
    expect(screen.queryByTestId("dictation-ps-AF")).toBeNull();
  });

  it("changes the language when one is chosen", async () => {
    const onChange = jest.fn();
    render(<DictationRow lang="fr-FR" onChange={onChange} />);

    fireEvent.press(screen.getByTestId("dictation-en-US"));
    expect(onChange).toHaveBeenCalledWith("en-US");
  });
});

describe("when the phone says which languages it has", () => {
  it("still offers one it did not list — nothing here is a gate", async () => {
    // The phone answers, and LEAVES ENGLISH OUT. That is the case this test
    // exists for; listing both would assert nothing.
    mockGetSupportedLocales.mockResolvedValue({
      locales: ["fr_FR"],
      installedLocales: ["fr_FR"],
    });
    const onChange = jest.fn();
    render(<DictationRow lang="fr-FR" onChange={onChange} />);

    await settled();
    // This asserted `disabled: true` until 2026-09-24. It blocked on an oracle
    // that is wrong often enough to matter — an empty array on Android 12, a
    // service that refuses, a recogniser that lists less than it can do. The
    // phone answers at the microphone now, through `problemSentence`.
    expect(screen.getByTestId("dictation-en-US").props.accessibilityState.disabled).toBeUndefined();
    fireEvent.press(screen.getByTestId("dictation-en-US"));
    expect(onChange).toHaveBeenCalledWith("en-US");
  });

  it("says why, once, rather than beside every row", async () => {
    mockGetSupportedLocales.mockResolvedValue({
      locales: ["fr_FR"],
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
    // All three are covered here by a DIFFERENT region, so the advisory note
    // appearing would mean the subtag comparison had failed. That note is the
    // only consumer of the matching left, now that nothing is disabled.
    mockGetSupportedLocales.mockResolvedValue({
      locales: ["fr_CA", "en_GB"],
      installedLocales: [],
    });
    render(<DictationRow lang="fr-FR" onChange={noop} />);
    // `settled()` rather than `waitFor`: the note is absent before the query
    // resolves too, so a waitFor would pass on the state BEFORE the answer and
    // prove nothing about the matching.
    await settled();

    expect(screen.queryByTestId("dictation-unavailable")).toBeNull();
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

    expect(screen.getByTestId("dictation-en-US").props.accessibilityState.disabled).toBeUndefined();
    fireEvent.press(screen.getByTestId("dictation-en-US"));
    expect(onChange).toHaveBeenCalledWith("en-US");
    expect(screen.queryByTestId("dictation-unavailable")).toBeNull();
  });

  it("offers everything when asking throws", async () => {
    mockGetSupportedLocales.mockRejectedValue(new Error("package_not_found"));
    const onChange = jest.fn();
    render(<DictationRow lang="fr-FR" onChange={onChange} />);
    await settled();

    expect(screen.getByTestId("dictation-en-US").props.accessibilityState.disabled).toBeUndefined();
    fireEvent.press(screen.getByTestId("dictation-en-US"));
    expect(onChange).toHaveBeenCalledWith("en-US");
  });
});
