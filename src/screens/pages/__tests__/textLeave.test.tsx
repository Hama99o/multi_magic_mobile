/**
 * A TEXT FILE'S UNSAVED EDIT IS NOT DROPPED ON THE WAY OUT (review 88, P4, 2026-11-21).
 *
 * Editing a text or Markdown file, then Prev/Next (router.replace), the hardware back or a
 * swipe, threw the draft away without a word. Every one of those removes the screen, so
 * react-navigation's `beforeRemove` sees them all: with an unsaved draft it stops and asks.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

jest.mock("react-native-webview", () => ({ WebView: () => null }));
jest.mock("expo-video", () => ({ useVideoPlayer: () => ({}), VideoView: () => null }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("@/api/pageShares", () => ({
  ...jest.requireActual("@/api/pageShares"),
  sharesApi: { list: jest.fn(async () => []) },
  shareLinksApi: { list: jest.fn(async () => []) },
}));
const mockNav: { listener: ((e: any) => void) | null; dispatch: jest.Mock } = { listener: null, dispatch: jest.fn() };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ spaceId: "400", nodeId: "5" }),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useNavigation: () => ({
    addListener: (_n: string, fn: (e: any) => void) => {
      mockNav.listener = fn;
      return () => {
        if (mockNav.listener === fn) mockNav.listener = null;
      };
    },
    dispatch: mockNav.dispatch,
  }),
}));

const mockNode = {
  id: 5, spaceId: 400, parentId: null, title: "a-notes.txt", kind: "file", starred: false, childrenCount: 0,
  attachmentUrl: "http://x/a-notes.txt", thumbnailUrl: null, mimeType: "text/plain", fileSize: 17, ownerName: null,
  updatedAt: "2026-11-21T10:00:00Z", createdAt: null, deletedAt: null, space: null, html: null, ancestors: [],
};
const mockApi = {
  node: jest.fn(async () => mockNode),
  children: jest.fn(async () => ({ rows: [], hasMore: false, unreadable: 0, total: 0 })),
  space: jest.fn(async (id: number) => ({ id, title: "QA", icon: null, permission: "owner" })),
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: new Proxy({}, { get: (_t, key: string) => (...a: unknown[]) => (mockApi as Record<string, (...x: unknown[]) => unknown>)[key](...a) }),
}));

/* eslint-disable import/first */
import Viewer from "../../../../app/pages/view";

beforeEach(() => {
  mockNav.dispatch.mockReset();
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => "line one\n" })) as unknown as typeof fetch;
});

const open = async () => {
  render(
    <QueryClientProvider client={testQueryClient()}>
      <Viewer />
    </QueryClientProvider>,
  );
  fireEvent.press(await screen.findByTestId("pages-text-edit"));
};
const leave = async () => {
  const event = { preventDefault: jest.fn(), data: { action: { type: "REPLACE" } } };
  await act(async () => {
    mockNav.listener?.(event);
  });
  return event;
};

it("with an unsaved edit, leaving (Prev/Next, back, swipe) stops and asks; Discard leaves", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  await open();
  fireEvent.changeText(screen.getByTestId("pages-text-editor"), "line one, changed");
  const event = await leave();
  expect(event.preventDefault).toHaveBeenCalled();
  expect(alert).toHaveBeenCalledTimes(1);
  const buttons = alert.mock.calls[0][2] as { style?: string; onPress?: () => void }[];
  act(() => buttons.find((b) => b.style === "destructive")!.onPress!());
  expect(mockNav.dispatch).toHaveBeenCalledWith({ type: "REPLACE" });
  alert.mockRestore();
});

it("with nothing changed, leaving is not stopped", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  await open();
  const event = await leave();
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
  alert.mockRestore();
});
