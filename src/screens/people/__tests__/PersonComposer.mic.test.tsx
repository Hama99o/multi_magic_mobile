/**
 * DICTATION IN A THREAD WITH A PERSON.
 *
 * His words: *"there should be speech to text also."* This file used to argue
 * the opposite — that dictation "belongs to asking a question rather than to
 * texting somebody" — and he overruled it. What matters now is that the two
 * composers cannot drift: one hook, one language preference, one set of
 * strings, and the same "absent, not disabled" rule when a device has no
 * recogniser.
 *
 * The recogniser itself is not tested here. `useSpeechToText.test.ts` owns
 * which sentence is chosen for which failure; this owns what the thread's
 * composer does with it.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";

// `mock`-prefixed because jest.mock() factories are hoisted above the imports
// and may not touch any other out-of-scope variable.
const mockSpeech = {
  available: true, status: "idle", listening: false, interim: "",
  lang: "fr-FR", setLang: jest.fn(), start: jest.fn(), stop: jest.fn(),
  cancel: jest.fn(), refused: false, problem: null as string | null,
};
let mockOnFinalCapture: ((text: string) => void) | null = null;

jest.mock("@/hooks/useSpeechToText", () => ({
  LANGUAGES: [
    { code: "fr-FR", label: "Français" },
    { code: "en-US", label: "English" },
  ],
  DEFAULT_LANG: "fr-FR",
  useSpeechToText: (onFinal: (t: string) => void) => {
    mockOnFinalCapture = onFinal;
    return mockSpeech;
  },
}));

/* eslint-disable import/first */
import { PersonComposer } from "../PersonComposer";

const noop = () => {};

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockSpeech, {
    available: true, listening: false, interim: "", refused: false, lang: "fr-FR", problem: null,
  });
  mockOnFinalCapture = null;
});

describe("the mic is here now", () => {
  it("is offered beside the field", () => {
    render(<PersonComposer value="" onChange={noop} onSend={noop} />);
    expect(screen.getByTestId("people-composer-mic")).toBeTruthy();
  });

  // The assistant's rule, and it is a real state on a cheap Android: a
  // disabled mic invites a tap that can never work and gives no reason.
  it("is not rendered at all when the device cannot dictate", () => {
    mockSpeech.available = false;
    render(<PersonComposer value="" onChange={noop} onSend={noop} />);
    expect(screen.queryByTestId("people-composer-mic")).toBeNull();
  });

  it("starts listening when pressed, and stops when pressed again", () => {
    const { rerender } = render(<PersonComposer value="" onChange={noop} onSend={noop} />);
    fireEvent.press(screen.getByTestId("people-composer-mic"));
    expect(mockSpeech.start).toHaveBeenCalled();

    mockSpeech.listening = true;
    rerender(<PersonComposer value="" onChange={noop} onSend={noop} />);
    fireEvent.press(screen.getByTestId("people-composer-mic"));
    expect(mockSpeech.stop).toHaveBeenCalled();
  });
});

describe("what it does with the words", () => {
  /**
   * APPENDED, NEVER REPLACING. Somebody who typed half a message and dictated
   * the rest must keep both halves — the failure here silently eats what they
   * had already written, which is the worst kind because it looks like the
   * recogniser working.
   */
  it("adds dictated words to what was already typed", () => {
    const onChange = jest.fn();
    render(<PersonComposer value="see you at" onChange={onChange} onSend={noop} />);
    mockOnFinalCapture?.("six o'clock");
    expect(onChange).toHaveBeenCalledWith("see you at six o'clock");
  });

  it("uses the dictated words alone when the field was empty", () => {
    const onChange = jest.fn();
    render(<PersonComposer value="" onChange={onChange} onSend={noop} />);
    mockOnFinalCapture?.("on my way");
    expect(onChange).toHaveBeenCalledWith("on my way");
  });
});

describe("while it is listening", () => {
  it("shows the interim words, which are not yet in the message", () => {
    mockSpeech.listening = true;
    mockSpeech.interim = "i am on my";
    const onChange = jest.fn();
    render(<PersonComposer value="" onChange={onChange} onSend={noop} />);

    expect(screen.getByTestId("people-composer-listening")).toBeTruthy();
    expect(screen.getByText("i am on my")).toBeTruthy();
    // Interim is proof it is hearing, not text anybody has committed to.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("can be cancelled without sending anything", () => {
    mockSpeech.listening = true;
    render(<PersonComposer value="" onChange={noop} onSend={noop} />);
    fireEvent.press(screen.getByTestId("people-composer-dictation-cancel"));
    expect(mockSpeech.cancel).toHaveBeenCalled();
  });
});

describe("when it cannot work, it says so", () => {
  it("explains a refusal rather than doing nothing", () => {
    mockSpeech.refused = true;
    render(<PersonComposer value="" onChange={noop} onSend={noop} />);
    expect(screen.getByTestId("people-composer-mic-refused")).toBeTruthy();
  });

  it("passes the recogniser's own sentence through for a problem", () => {
    mockSpeech.problem = "The microphone is busy or unavailable. You can still type.";
    render(<PersonComposer value="" onChange={noop} onSend={noop} />);
    expect(
      screen.getByText("The microphone is busy or unavailable. You can still type."),
    ).toBeTruthy();
  });
});

describe("one preference, not two", () => {
  /**
   * The language lives in `mm-stt-lang`, which the assistant's composer writes
   * too. Two recognisers with two settings is the drift the shared
   * `ScrollToBottom` exists to avoid.
   */
  it("switches language on a long press, through the shared hook", () => {
    render(<PersonComposer value="" onChange={noop} onSend={noop} />);
    fireEvent(screen.getByTestId("people-composer-mic"), "longPress");
    expect(mockSpeech.setLang).toHaveBeenCalledWith("en-US");
  });

  it("names the language it will dictate in, so it is never a mystery", () => {
    render(<PersonComposer value="" onChange={noop} onSend={noop} />);
    const mic = screen.getByTestId("people-composer-mic");
    // An accessibility string is a user-facing string: it comes from t().
    expect(mic.props.accessibilityLabel).toContain("Français");
  });
});
