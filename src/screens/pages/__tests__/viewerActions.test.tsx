/**
 * The file viewer's header actions (audit #17), as the web's Lightbox
 * (`drive/components/Lightbox.tsx`: share, details, ⋯ with the item menu):
 * star, rename, move, trash, details and share, through the same sheets and
 * mutations as the drive lists, and the same rights (`permissions.ts`):
 * viewers get nothing that writes, editors no move or trash.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
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

const page = (rows: unknown[]) => ({ rows, hasMore: false, unreadable: 0, total: rows.length });
const mockNode = {
  id: 5, spaceId: 400, parentId: null, title: "notes.zip", kind: "file", starred: false, childrenCount: 0,
  attachmentUrl: "http://x/notes.zip", thumbnailUrl: null, mimeType: "application/zip", fileSize: 33_000, ownerName: null,
  updatedAt: "2026-11-07T10:00:00Z", createdAt: null, deletedAt: null, space: null, html: null, ancestors: [],
};
// The server's copy: a write changes what the next read answers.
const mockServer: { node: typeof mockNode } = { node: mockNode };
const mockPermission: { current: string | null } = { current: "owner" };
const mockApi = {
  node: jest.fn(async () => mockServer.node),
  children: jest.fn(async () => page([])),
  spaces: jest.fn(async () => page([])),
  space: jest.fn(async (id: number) => ({ id, title: "Family", icon: null, permission: mockPermission.current })),
  update: jest.fn(async (_s: number, _n: number, patch: Record<string, unknown>) => (mockServer.node = { ...mockServer.node, ...patch })),
  trash: jest.fn(async () => undefined),
  restore: jest.fn(async () => undefined),
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: new Proxy({}, { get: (_t, key: string) => (...a: unknown[]) => (mockApi as Record<string, (...x: unknown[]) => unknown>)[key](...a) }),
}));

/* eslint-disable import/first */
import Viewer from "../../../../app/pages/view";

const router = jest.requireMock("expo-router").router as { back: jest.Mock };

async function open(permission: string | null) {
  mockPermission.current = permission;
  render(
    <QueryClientProvider client={testQueryClient()}>
      <Viewer />
    </QueryClientProvider>,
  );
  await screen.findByTestId("pages-view-card");
  await waitFor(() => expect(mockApi.space).toHaveBeenCalledWith(400));
  fireEvent.press(screen.getByTestId("pages-view-more"));
  await screen.findByTestId("pages-actions-sheet");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockServer.node = mockNode;
});

it("an owner gets every action: share, star, rename, move, details, trash", async () => {
  await open("owner");
  await waitFor(() => expect(screen.getByTestId("pages-action-trash")).toBeTruthy());
  for (const id of ["share", "star", "rename", "move", "details"]) expect(screen.getByTestId(`pages-action-${id}`)).toBeTruthy();
});

it("an editor stars and renames but neither moves nor trashes", async () => {
  await open("editor");
  await waitFor(() => expect(screen.getByTestId("pages-action-rename")).toBeTruthy());
  expect(screen.getByTestId("pages-action-star")).toBeTruthy();
  expect(screen.queryByTestId("pages-action-move")).toBeNull();
  expect(screen.queryByTestId("pages-action-trash")).toBeNull();
});

it("a viewer gets nothing that writes", async () => {
  await open("viewer");
  expect(screen.getByTestId("pages-action-details")).toBeTruthy();
  expect(screen.getByTestId("pages-action-share")).toBeTruthy();
  for (const id of ["star", "rename", "move", "trash"]) expect(screen.queryByTestId(`pages-action-${id}`)).toBeNull();
});

it("star stars it, and the header shows the star", async () => {
  await open("owner");
  fireEvent.press(await screen.findByTestId("pages-action-star"));
  await waitFor(() => expect(mockApi.update).toHaveBeenCalledWith(400, 5, { starred: true }));
  expect(await screen.findByTestId("pages-view-starred")).toBeTruthy();
});

it("rename asks for the name, saves it, and the header follows", async () => {
  await open("owner");
  fireEvent.press(await screen.findByTestId("pages-action-rename"));
  fireEvent.changeText(screen.getByTestId("pages-name-input"), "archive.zip");
  await act(async () => fireEvent.press(screen.getByTestId("pages-name-confirm")));
  expect(mockApi.update).toHaveBeenCalledWith(400, 5, { title: "archive.zip" });
  await waitFor(() => expect(screen.queryByTestId("pages-name-dialog")).toBeNull());
  expect(screen.getByText("archive.zip")).toBeTruthy();
});

it("details opens the details sheet", async () => {
  await open("owner");
  fireEvent.press(screen.getByTestId("pages-action-details"));
  expect(await screen.findByTestId("pages-details-sheet")).toBeTruthy();
});

it("move opens the move sheet for this file", async () => {
  await open("owner");
  fireEvent.press(await screen.findByTestId("pages-action-move"));
  expect(await screen.findByTestId("pages-move-sheet")).toBeTruthy();
});

it("trash sends it to the trash and leaves the viewer", async () => {
  await open("owner");
  fireEvent.press(await screen.findByTestId("pages-action-trash"));
  await waitFor(() => expect(mockApi.trash).toHaveBeenCalledWith(400, 5));
  await waitFor(() => expect(router.back).toHaveBeenCalled());
});

// Audit #14: Share with people, the space owner's alone (`SharePolicy`).
it("the owner: ⋯ → Share with people opens the Share sheet for this file", async () => {
  await open("owner");
  fireEvent.press(await screen.findByTestId("pages-action-share-with"));
  expect(await screen.findByTestId("pages-share-sheet")).toBeTruthy();
  const { sharesApi } = jest.requireMock("@/api/pageShares") as { sharesApi: { list: jest.Mock } };
  await waitFor(() => expect(sharesApi.list).toHaveBeenCalledWith({ spaceId: 400, nodeId: 5 }));
});

it("an admin is not offered Share with people (the server refuses him)", async () => {
  await open("admin");
  await waitFor(() => expect(screen.getByTestId("pages-action-trash")).toBeTruthy());
  expect(screen.queryByTestId("pages-action-share-with")).toBeNull();
});
