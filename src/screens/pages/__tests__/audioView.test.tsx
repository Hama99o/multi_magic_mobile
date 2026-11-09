/**
 * Audio is a music card with its own controls (QA_DEEP #17, seen on qa_phone
 * 2026-11-07 with song-intro.mp3): first an empty screen-high video frame,
 * then, in a short box, Android's native controls with no seek bar while
 * paused. The controls are now drawn by the app and driven by the player's
 * events, which is what is checked here.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

type Handler = (e: Record<string, unknown>) => void;
const mockHandlers: Record<string, Handler> = {};
const mockPlayer = {
  duration: 240,
  currentTime: 30,
  play: jest.fn(),
  pause: jest.fn(),
  seekBy: jest.fn(),
  replay: jest.fn(),
  addListener: (name: string, fn: Handler) => {
    mockHandlers[name] = fn;
    return { remove: jest.fn() };
  },
};
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({ spaceId: "315", nodeId: "5" }), router: { back: jest.fn() } }));
jest.mock("expo-video", () => ({ useVideoPlayer: () => mockPlayer, VideoView: () => null }));
jest.mock("react-native-webview", () => ({ WebView: () => null }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
const mockNode = {
  id: 5, spaceId: 315, parentId: null, title: "song-intro.mp3", kind: "file", starred: false, childrenCount: 0,
  attachmentUrl: "http://x/song.mp3", thumbnailUrl: null, mimeType: "audio/mpeg", fileSize: 33_000, ownerName: null,
  updatedAt: "2026-11-07T10:00:00Z", createdAt: null, deletedAt: null, space: null, html: null, ancestors: [],
};
jest.mock("@/api/pages", () => ({ ...jest.requireActual("@/api/pages"), pagesApi: { node: jest.fn(async () => mockNode), children: jest.fn() } }));

/* eslint-disable import/first */
import Viewer, { clock } from "../../../../app/pages/view";

async function open() {
  render(
    <QueryClientProvider client={testQueryClient()}>
      <Viewer />
    </QueryClientProvider>,
  );
  return screen.findByTestId("pages-view-audio");
}

it("an audio file opens as a music card with its own controls", async () => {
  await open();
  expect(screen.getByTestId("pages-audio-seek")).toBeTruthy();
  expect(screen.getByText("4:00")).toBeTruthy(); // the length, while paused
});

it("Play plays, and the clock follows the player", async () => {
  await open();
  fireEvent.press(screen.getByTestId("pages-audio-play"));
  expect(mockPlayer.play).toHaveBeenCalled();
  act(() => mockHandlers.timeUpdate({ currentTime: 65 }));
  expect(screen.getByTestId("pages-audio-time").props.children).toBe("1:05");
  act(() => mockHandlers.playingChange({ isPlaying: true }));
  fireEvent.press(screen.getByTestId("pages-audio-play"));
  expect(mockPlayer.pause).toHaveBeenCalled();
});

it("Play after the end starts it again", async () => {
  await open();
  act(() => mockHandlers.timeUpdate({ currentTime: 240 }));
  fireEvent.press(screen.getByTestId("pages-audio-play"));
  expect(mockPlayer.replay).toHaveBeenCalled();
});

it("a tap on the bar seeks there", async () => {
  await open();
  const bar = screen.getByTestId("pages-audio-seek");
  fireEvent(bar, "layout", { nativeEvent: { layout: { width: 300, height: 24 } } });
  fireEvent.press(bar, { nativeEvent: { locationX: 150 } });
  expect(mockPlayer.seekBy).toHaveBeenCalledWith(120 - 30); // to the middle of 4:00, from 0:30
});

it("clock", () => {
  expect(clock(7)).toBe("0:07");
  expect(clock(225)).toBe("3:45");
  expect(clock(3723)).toBe("1:02:03");
  expect(clock(Number.NaN)).toBe("0:00");
});
