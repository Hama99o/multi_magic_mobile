/**
 * The control under an answer: absent behind the flag, absent without a
 * voice, and — when present — one button that becomes three only for the
 * server voice, with the device voice named.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";

/**
 * The flag is a `const`, so it is mocked as a GETTER over a global rather than
 * a captured object: a `jest.mock` factory is hoisted above every `import`,
 * and a binding it closes over is still in its temporal dead zone when the
 * module under test is first required — which reads as `undefined`, not as an
 * error. `globalThis` is on the hoist plugin's allowlist and is always there.
 */
declare global {
  // eslint-disable-next-line no-var
  var __readAloudEnabled: boolean | undefined;
}

jest.mock("@/config/features", () => ({
  __esModule: true,
  get READ_ALOUD_ENABLED() {
    return globalThis.__readAloudEnabled !== false;
  },
}));

/* eslint-disable import/first */
import { ReadAloudButtons, ReadAloudNotice } from "../ReadAloud";
import { useReadAloud } from "@/stores/readAloud.store";

const ANSWER = { id: 12, body: "You lent Ahmad 500.", deleted: false };

beforeEach(() => {
  globalThis.__readAloudEnabled = true;
  useReadAloud.setState({
    supported: true,
    speakingId: null,
    loadingId: null,
    voice: null,
    paused: false,
    notice: null,
    toggle: jest.fn(async () => {}),
    pause: jest.fn(),
    resume: jest.fn(),
    restart: jest.fn(),
    stop: jest.fn(),
  });
});

describe("absence", () => {
  it("renders nothing while the flag is off", () => {
    globalThis.__readAloudEnabled = false;
    render(<ReadAloudButtons message={ANSWER} />);

    expect(screen.queryByTestId("answer-read")).toBeNull();
  });

  it("renders nothing when the phone has no voice at all — absent, not broken", () => {
    useReadAloud.setState({ supported: false });
    render(<ReadAloudButtons message={ANSWER} />);

    expect(screen.queryByTestId("answer-read")).toBeNull();
  });

  it("renders nothing for a deleted or empty message", () => {
    render(<ReadAloudButtons message={{ id: 1, body: null, deleted: true }} />);

    expect(screen.queryByTestId("answer-read")).toBeNull();
  });
});

describe("idle", () => {
  it("offers one button and nothing else", () => {
    render(<ReadAloudButtons message={ANSWER} />);

    expect(screen.getByTestId("answer-read").props.accessibilityLabel).toBe("Read aloud");
    expect(screen.queryByTestId("answer-read-pause")).toBeNull();
    expect(screen.queryByTestId("answer-read-restart")).toBeNull();
    expect(screen.queryByTestId("answer-read-device-voice")).toBeNull();
  });

  it("hands the message to the store on press", () => {
    render(<ReadAloudButtons message={ANSWER} />);

    fireEvent.press(screen.getByTestId("answer-read"));

    expect(useReadAloud.getState().toggle).toHaveBeenCalledWith(ANSWER);
  });
});

describe("loading", () => {
  it("is busy and cannot be pressed twice", () => {
    useReadAloud.setState({ loadingId: 12 });
    render(<ReadAloudButtons message={ANSWER} />);

    expect(screen.getByTestId("answer-read").props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  });
});

describe("speaking with the server's voice", () => {
  it("offers stop, pause and restart", () => {
    useReadAloud.setState({ speakingId: 12, voice: "server" });
    render(<ReadAloudButtons message={ANSWER} />);

    expect(screen.getByTestId("answer-read").props.accessibilityLabel).toBe("Stop reading");
    fireEvent.press(screen.getByTestId("answer-read-pause"));
    fireEvent.press(screen.getByTestId("answer-read-restart"));

    expect(useReadAloud.getState().pause).toHaveBeenCalled();
    expect(useReadAloud.getState().restart).toHaveBeenCalled();
    expect(screen.queryByTestId("answer-read-device-voice")).toBeNull();
  });

  it("offers resume once paused", () => {
    useReadAloud.setState({ speakingId: 12, voice: "server", paused: true });
    render(<ReadAloudButtons message={ANSWER} />);

    fireEvent.press(screen.getByTestId("answer-read-resume"));

    expect(useReadAloud.getState().resume).toHaveBeenCalled();
    expect(screen.queryByTestId("answer-read-pause")).toBeNull();
  });

  it("draws nothing extra on ANOTHER answer's row", () => {
    useReadAloud.setState({ speakingId: 99, voice: "server" });
    render(<ReadAloudButtons message={ANSWER} />);

    expect(screen.getByTestId("answer-read").props.accessibilityLabel).toBe("Read aloud");
    expect(screen.queryByTestId("answer-read-pause")).toBeNull();
  });
});

describe("speaking with the phone's voice", () => {
  // Pause and restart are not exact there, so they are not offered — and the
  // listener is TOLD which voice this is.
  it("says so, and offers only stop", () => {
    useReadAloud.setState({ speakingId: 12, voice: "device" });
    render(<ReadAloudButtons message={ANSWER} />);

    expect(screen.getByTestId("answer-read-device-voice")).toBeTruthy();
    expect(screen.queryByTestId("answer-read-pause")).toBeNull();
    expect(screen.queryByTestId("answer-read-restart")).toBeNull();
  });
});

describe("the notice", () => {
  it("is drawn under the answer it is about, and no other", () => {
    useReadAloud.setState({ notice: { messageId: 12, text: "MultiMagic's voice is busy." } });

    render(<ReadAloudNotice message={ANSWER} />);
    expect(screen.getByTestId("answer-read-notice")).toHaveTextContent("MultiMagic's voice is busy.");

    screen.unmount();
    render(<ReadAloudNotice message={{ id: 13, body: "other" }} />);
    expect(screen.queryByTestId("answer-read-notice")).toBeNull();
  });

  it("is absent behind the flag", () => {
    globalThis.__readAloudEnabled = false;
    useReadAloud.setState({ notice: { messageId: 12, text: "x" } });
    render(<ReadAloudNotice message={ANSWER} />);

    expect(screen.queryByTestId("answer-read-notice")).toBeNull();
  });
});
