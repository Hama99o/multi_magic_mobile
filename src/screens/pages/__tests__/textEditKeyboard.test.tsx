/**
 * EDITING A TEXT FILE, WITH THE KEYBOARD UP (parity #49).
 *
 * Measured 2026-11-21 on qa_phone (flow 33): with the keyboard open, Save
 * and Cancel were under it and could not be tapped. The editor sat in a
 * `KeyboardAvoidingView behavior="height"`, which on Android leans on the
 * window resizing for the IME, and an edge-to-edge window is not resized
 * (docs/TESTING.md §5). The app's answer to that is `KeyboardPadding`, so
 * Save has to be inside it.
 */
import { fireEvent, render, screen, within } from "@testing-library/react-native";
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
jest.mock("expo-router", () => ({
  // TextFile listens for beforeRemove (unsaved edit, review 88 P4).
  useNavigation: () => ({ addListener: () => () => undefined, dispatch: jest.fn() }),
  useLocalSearchParams: () => ({ spaceId: "400", nodeId: "5" }),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
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
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => "line one\n" })) as unknown as typeof fetch;
});

it("Save and Cancel rise with the keyboard (inside KeyboardPadding)", async () => {
  const { KeyboardPadding } = jest.requireActual("@/components/KeyboardPadding");
  render(
    <QueryClientProvider client={testQueryClient()}>
      <Viewer />
    </QueryClientProvider>,
  );
  fireEvent.press(await screen.findByTestId("pages-text-edit"));
  const lifted = screen.UNSAFE_getByType(KeyboardPadding);
  expect(within(lifted).getByTestId("pages-text-editor")).toBeTruthy();
  expect(within(lifted).getByTestId("pages-text-save")).toBeTruthy();
  expect(within(lifted).getByTestId("pages-text-cancel")).toBeTruthy();
});
