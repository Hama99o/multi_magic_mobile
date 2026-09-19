/**
 * Dictation, at the level a user meets it.
 *
 * The three behaviours carried from the web hook are the ones asserted here,
 * because each is easy to get subtly wrong in a way that only shows up with a
 * half-typed question in the field.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";

// `mock`-prefixed because jest.mock() factories are hoisted above the imports
// and may not touch any other out-of-scope variable.
const mockSpeech = {
  available: true, status: "idle", listening: false, interim: "",
  lang: "fr-FR", setLang: jest.fn(), start: jest.fn(), stop: jest.fn(),
  cancel: jest.fn(), refused: false, problem: null,
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
import { Composer } from "../Composer";

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockSpeech, {
    available: true, listening: false, interim: "", refused: false, lang: "fr-FR", problem: null,
  });
  mockOnFinalCapture = null;
});

describe("the mic", () => {
  // ── ABSENT, NOT DISABLED ──────────────────────────────────────────────────
  //
  // A disabled mic invites a tap that can never work and gives no reason. On a
  // cheap Android with no recogniser installed this is a real state.
  it("is not rendered at all when the device cannot dictate", () => {
    mockSpeech.available = false;
    render(<Composer value="" onChange={jest.fn()} onSend={jest.fn()} />);

    expect(screen.queryByTestId("composer-mic")).toBeNull();
  });

  it("is rendered when the device can", () => {
    render(<Composer value="" onChange={jest.fn()} onSend={jest.fn()} />);

    expect(screen.getByTestId("composer-mic")).toBeTruthy();
  });

  // A refusal is fixable, so it degrades to the keyboard WITH a reason rather
  // than hiding the button from someone who can grant it in Settings.
  it("explains a refused permission instead of going silent", () => {
    mockSpeech.refused = true;
    render(<Composer value="" onChange={jest.fn()} onSend={jest.fn()} />);

    expect(screen.getByTestId("composer-mic-refused")).toBeTruthy();
    expect(screen.getByTestId("composer-mic")).toBeTruthy();
  });

  it("switches language on a long press and remembers it", () => {
    render(<Composer value="" onChange={jest.fn()} onSend={jest.fn()} />);

    fireEvent(screen.getByTestId("composer-mic"), "longPress");

    expect(mockSpeech.setLang).toHaveBeenCalledWith("en-US");
  });
});

describe("while listening", () => {
  it("shows interim words, and a way to throw them away", () => {
    mockSpeech.listening = true;
    mockSpeech.interim = "combien je dois";
    render(<Composer value="" onChange={jest.fn()} onSend={jest.fn()} />);

    // Proof it is hearing them — and NOT committed text yet.
    expect(screen.getByText("combien je dois")).toBeTruthy();
    expect(screen.getByTestId("composer-dictation-cancel")).toBeTruthy();
  });

  it("recording happens IN the pill — the field is still there", () => {
    mockSpeech.listening = true;
    render(<Composer value="" onChange={jest.fn()} onSend={jest.fn()} />);

    // Alan's rule: the screen never becomes a recording screen.
    expect(screen.getByTestId("composer-input")).toBeTruthy();
    expect(screen.getByTestId("composer-send")).toBeTruthy();
  });
});

// ── APPENDED, NEVER REPLACING ───────────────────────────────────────────────
describe("the final transcript", () => {
  it("is appended to what is already typed", () => {
    const onChange = jest.fn();
    render(<Composer value="How much do I owe" onChange={onChange} onSend={jest.fn()} />);

    mockOnFinalCapture?.("Ahmad?");

    // Someone who typed half a question and dictated the rest keeps both.
    expect(onChange).toHaveBeenCalledWith("How much do I owe Ahmad?");
  });

  it("is used as-is when the field was empty", () => {
    const onChange = jest.fn();
    render(<Composer value="" onChange={onChange} onSend={jest.fn()} />);

    mockOnFinalCapture?.("Do I owe anyone?");

    expect(onChange).toHaveBeenCalledWith("Do I owe anyone?");
  });
});

describe("offline", () => {
  it("says so, keeps the field, and holds send and attach", () => {
    render(<Composer value="a question" onChange={jest.fn()} onSend={jest.fn()} onAttach={jest.fn()} offline />);

    expect(screen.getByTestId("composer-offline")).toBeTruthy();
    expect(screen.getByTestId("composer-input").props.value).toBe("a question");
    expect(screen.getByTestId("composer-send").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId("composer-attach").props.accessibilityState.disabled).toBe(true);
  });

  it("is silent when the server answers", () => {
    render(<Composer value="a question" onChange={jest.fn()} onSend={jest.fn()} onAttach={jest.fn()} />);

    expect(screen.queryByTestId("composer-offline")).toBeNull();
    expect(screen.getByTestId("composer-send").props.accessibilityState.disabled).toBe(false);
  });
});

describe("sending", () => {
  it("will not send whitespace", () => {
    const onSend = jest.fn();
    render(<Composer value="   " onChange={jest.fn()} onSend={onSend} />);

    expect(screen.getByTestId("composer-send").props.accessibilityState.disabled).toBe(true);
  });

  it("clears the draft from inside the field", () => {
    const onChange = jest.fn();
    render(<Composer value="something" onChange={onChange} onSend={jest.fn()} />);

    fireEvent.press(screen.getByTestId("composer-clear"));

    expect(onChange).toHaveBeenCalledWith("");
  });
});
