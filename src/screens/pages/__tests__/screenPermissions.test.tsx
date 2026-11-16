/**
 * PERMISSIONS ON EVERY PAGES SCREEN (audit P0 #2, 2026-11-16), driven
 * through the screens: a folder reads its space's permission (`show`'s
 * `current_user_permission`); Recent, Starred and Search grant writes on the
 * caller's own spaces only, as the web's `canWriteNode` does.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

const base = {
  parentId: null,
  starred: false,
  childrenCount: 0,
  thumbnailUrl: null,
  ownerName: "Qa MOBILE",
  updatedAt: "2026-11-06T10:00:00Z",
  createdAt: null,
  deletedAt: null,
  html: null,
  ancestors: [],
  kind: "file",
  mimeType: "application/pdf",
  fileSize: 1000,
  attachmentUrl: "http://x/f",
};
const page = (rows: unknown[]) => ({ rows, hasMore: false, unreadable: 0, total: rows.length });
// 315 is his; 400 is a space shared with him.
const mine = { ...base, id: 1, spaceId: 315, title: "mine.pdf", space: { id: 315, title: "QA Pages", icon: "🧪" } };
const theirs = { ...base, id: 2, spaceId: 400, title: "theirs.pdf", space: { id: 400, title: "Family", icon: "🏠" } };

const mockApi = {
  spaces: jest.fn(async () => page([{ id: 315, title: "QA Pages", icon: "🧪", nodesCount: 1, permission: null }])),
  space: jest.fn(async (id: number) => ({ id, title: "Family", icon: null, permission: "viewer" })),
  children: jest.fn(async () => page([theirs])),
  drive: jest.fn(async () => page([mine, theirs])),
  sharedWithMe: jest.fn(async () => page([])),
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: new Proxy({}, { get: (_t, key: string) => (...a: unknown[]) => (mockApi as Record<string, (...x: unknown[]) => unknown>)[key](...a) }),
}));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams.current,
}));

/* eslint-disable import/first */
import Folder from "../../../../app/pages/folder";
import Drive from "../../../../app/pages/drive";
import PagesHome from "../../../../app/pages/index";
import { SearchView } from "../drive/SearchView";

function wrap(node: React.ReactElement) {
  return render(<QueryClientProvider client={testQueryClient()}>{node}</QueryClientProvider>);
}
const layout = (id: string) => fireEvent(screen.getByTestId(id), "layout", { nativeEvent: { layout: { width: 360, height: 800 } } });
/** The ⋯ of the row titled `title`. */
const moreOf = (title: string) => screen.getAllByTestId("pages-more-file").find((b) => String(b.props.accessibilityLabel).includes(title))!;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("a folder in a space shared with him", () => {
  beforeEach(() => {
    mockParams.current = { spaceId: "400", title: "Family" };
    mockApi.space.mockImplementation(async (id: number) => ({ id, title: "Family", icon: null, permission: "viewer" }));
  });

  it("as a viewer: no '+', and ⋯ offers nothing that writes", async () => {
    wrap(<Folder />);
    await screen.findByText("theirs.pdf");
    await waitFor(() => expect(mockApi.space).toHaveBeenCalledWith(400));
    expect(screen.queryByTestId("pages-add")).toBeNull();
    fireEvent.press(moreOf("theirs.pdf"));
    expect(await screen.findByTestId("pages-action-details")).toBeTruthy();
    for (const id of ["pages-action-star", "pages-action-rename", "pages-action-move", "pages-action-trash"]) expect(screen.queryByTestId(id)).toBeNull();
  });

  it("as an editor: '+' and Rename, but no Move or Trash", async () => {
    mockApi.space.mockImplementation(async (id: number) => ({ id, title: "Family", icon: null, permission: "editor" }));
    wrap(<Folder />);
    await screen.findByText("theirs.pdf");
    expect(await screen.findByTestId("pages-add")).toBeTruthy();
    fireEvent.press(moreOf("theirs.pdf"));
    expect(await screen.findByTestId("pages-action-rename")).toBeTruthy();
    expect(screen.queryByTestId("pages-action-move")).toBeNull();
    expect(screen.queryByTestId("pages-action-trash")).toBeNull();
  });
});

/** In a drive-wide list: his item has Rename, the shared one has not. */
async function onlyHisItemIsWritable() {
  await screen.findByText("theirs.pdf");
  await waitFor(() => expect(mockApi.spaces).toHaveBeenCalled());
  fireEvent.press(moreOf("theirs.pdf"));
  expect(await screen.findByTestId("pages-action-details")).toBeTruthy();
  expect(screen.queryByTestId("pages-action-rename")).toBeNull();
  expect(screen.queryByTestId("pages-action-trash")).toBeNull();
  fireEvent.press(screen.getByTestId("pages-action-details"));
  fireEvent.press(moreOf("mine.pdf"));
  expect(await screen.findByTestId("pages-action-rename")).toBeTruthy();
  expect(screen.getByTestId("pages-action-trash")).toBeTruthy();
}

it("Recent (the Pages home): writes on his own spaces only", async () => {
  mockParams.current = {};
  wrap(<PagesHome />);
  layout("pages-home-list-root");
  await onlyHisItemIsWritable();
});

it("Starred: writes on his own spaces only", async () => {
  mockParams.current = { view: "starred" };
  wrap(<Drive />);
  layout("pages-drive-list-root");
  await onlyHisItemIsWritable();
});

it("Search: writes on his own spaces only", async () => {
  wrap(<SearchView />);
  await act(async () => fireEvent.changeText(screen.getByTestId("pages-search-input"), "pdf"));
  layout("pages-drive-list-root");
  await onlyHisItemIsWritable();
});
