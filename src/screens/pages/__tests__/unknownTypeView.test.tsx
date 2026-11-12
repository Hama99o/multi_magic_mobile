/**
 * A file stored before the server read types from the bytes may still say
 * application/octet-stream (or nothing) — the owner's "IMG_2041" and
 * "1000017023", 2026-11-12. The viewer then asks what the file IS (its first
 * bytes, `probeRemoteType`) and shows it as that: a photo, a video, a voice
 * note that plays inline. Never decided from the title.
 */
import { render, screen } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

const mockPlayer = { duration: 12, currentTime: 0, play: jest.fn(), pause: jest.fn(), addListener: () => ({ remove: jest.fn() }) };
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({ spaceId: "315", nodeId: "7" }), router: { back: jest.fn() } }));
jest.mock("expo-video", () => ({ useVideoPlayer: () => mockPlayer, VideoView: () => null }));
jest.mock("react-native-webview", () => ({ WebView: () => null }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
const mockNode: Record<string, unknown> = {
  id: 7, spaceId: 315, parentId: null, title: "1000017023", kind: "file", starred: false, childrenCount: 0,
  attachmentUrl: "http://x/1000017023", thumbnailUrl: null, mimeType: "application/octet-stream", fileSize: 33_000,
  ownerName: null, updatedAt: "2026-11-07T10:00:00Z", createdAt: null, deletedAt: null, space: null, html: null, ancestors: [],
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: { node: jest.fn(async () => mockNode), children: jest.fn(async () => ({ rows: [], hasMore: false })) },
}));
const mockProbe = jest.fn();
jest.mock("@/lib/probeMimeType", () => ({ probeRemoteType: (url: string) => mockProbe(url) }));

/* eslint-disable import/first */
import Viewer from "../../../../app/pages/view";

function open() {
  render(
    <QueryClientProvider client={testQueryClient()}>
      <Viewer />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockProbe.mockReset();
  mockNode.mimeType = "application/octet-stream";
});

it("a voice note stored as octet-stream plays inline as audio", async () => {
  mockProbe.mockResolvedValue("audio/ogg");
  open();
  expect(await screen.findByTestId("pages-view-audio")).toBeTruthy();
  expect(mockProbe).toHaveBeenCalledWith("http://x/1000017023");
});

it("a photo stored with no type at all opens in the photo viewer", async () => {
  mockNode.mimeType = null;
  mockProbe.mockResolvedValue("image/jpeg");
  open();
  expect(await screen.findByTestId("pages-view-image")).toBeTruthy();
});

it("bytes that say nothing: the card with Share, as before", async () => {
  mockProbe.mockResolvedValue(null);
  open();
  expect(await screen.findByTestId("pages-view-card")).toBeTruthy();
});

it("a file the server already typed is never probed", async () => {
  mockNode.mimeType = "audio/mpeg";
  open();
  expect(await screen.findByTestId("pages-view-audio")).toBeTruthy();
  expect(mockProbe).not.toHaveBeenCalled();
});
