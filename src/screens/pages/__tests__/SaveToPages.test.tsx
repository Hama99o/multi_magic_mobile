/**
 * SAVE TO PAGES, driven the way he uses it from the share sheet: the owner
 * (2026-11-06) wants "all spaces and folders, tap, it saves", with shared
 * spaces too, and view-only places refused BEFORE the upload rather than
 * after it. Each test goes through the screen, by its controls.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { testQueryClient } from "@/__tests__/queryClient";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), canGoBack: () => true } }));

const base = { starred: false, childrenCount: 0, attachmentUrl: null, thumbnailUrl: null, mimeType: null, fileSize: null, ownerName: null, updatedAt: "2026-11-06T10:00:00Z", createdAt: null, deletedAt: null, html: null, ancestors: [] };
const mine = { id: 315, title: "QA Pages", icon: "🧪", description: null, color: null, nodesCount: 1, ownerName: null, permission: null, totalFileSize: null, updatedAt: "2026-11-06T10:00:00Z" };
const page = (rows: unknown[]) => ({ rows, hasMore: false, unreadable: 0, total: rows.length });

const mockApi = {
  spaces: jest.fn(async () => page([mine])),
  sharedWithMe: jest.fn(async () =>
    page([
      { id: 1, permission: "editor", space: { id: 400, title: "Family", icon: "🏠" }, node: null },
      { id: 2, permission: "viewer", space: { id: 401, title: "Archive", icon: null }, node: null },
    ]),
  ),
  children: jest.fn(async () => page([{ ...base, id: 900, spaceId: 315, parentId: null, title: "Vlogs", kind: "folder", space: null }])),
  drive: jest.fn(async () =>
    page([
      { ...base, id: 950, spaceId: 400, parentId: 920, title: "Trip 2026", kind: "folder", space: { id: 400, title: "Family", icon: "🏠" } },
      { ...base, id: 951, spaceId: 401, parentId: null, title: "Trip old", kind: "folder", space: { id: 401, title: "Archive", icon: null } },
    ]),
  ),
  node: jest.fn(async () => ({ ...base, id: 950, spaceId: 400, parentId: 920, title: "Trip 2026", kind: "folder", space: null, ancestors: [{ id: 920, title: "Holidays" }] })),
  createFolder: jest.fn(),
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: new Proxy({}, { get: (_t, key: string) => (...a: unknown[]) => (mockApi as Record<string, (...x: unknown[]) => unknown>)[key](...a) }),
}));

const mockEnqueue = jest.fn(async () => 1);
jest.mock("@/stores/uploads.store", () => ({
  ...jest.requireActual("@/stores/uploads.store"),
  useUploads: (pick: (s: { enqueue: typeof mockEnqueue }) => unknown) => pick({ enqueue: mockEnqueue }),
}));

/* eslint-disable import/first */
import SaveToPages from "../../../../app/pages/save";
import { usePendingImport } from "../addFiles";
import { loadRecentDestinations } from "@/stores/uploads.store";

function renderIt() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <SaveToPages />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  usePendingImport.setState({ files: [{ uri: "file:///cache/IMG_0042.MOV", name: "IMG_0042.MOV", mimeType: "video/quicktime", size: 1_932_735_283 }] });
});

it("lists his spaces AND the shared ones, and a view-only space cannot be chosen", async () => {
  renderIt();
  expect(await screen.findByText("QA Pages")).toBeTruthy();
  expect(await screen.findByText("Family")).toBeTruthy();
  const archive = screen.getByTestId("pages-save-shared-readonly");
  expect(archive.props.accessibilityState).toEqual({ disabled: true });
  expect(screen.getByText("View only. Ask the owner for edit access to save here.")).toBeTruthy();
  fireEvent.press(archive);
  expect(screen.queryByTestId("pages-save-crumb-root")).toBeNull(); // did not go in
  expect(screen.getByTestId("pages-save-here").props.accessibilityState).toMatchObject({ disabled: true });
});

it("a shared space he can edit: in, into a folder, upload — to THAT space and folder", async () => {
  renderIt();
  fireEvent.press(await screen.findByTestId("pages-save-shared"));
  await waitFor(() => expect(mockApi.children).toHaveBeenLastCalledWith(400, null, 1, expect.objectContaining({ kind: "folder" })));
  fireEvent.press(await screen.findByTestId("pages-save-folder"));
  await act(async () => fireEvent.press(screen.getByTestId("pages-save-here")));
  expect(mockEnqueue).toHaveBeenCalledWith(expect.any(Array), { spaceId: 400, parentId: 900, label: "Family / Vlogs" });
  expect(mockReplace).toHaveBeenCalledWith("/pages/uploads");
});

it("search finds a folder in any space, opens it with its real path, and remembers it as a recent", async () => {
  renderIt();
  fireEvent.changeText(await screen.findByTestId("pages-save-search"), "trip");
  await waitFor(() => expect(mockApi.drive).toHaveBeenCalledWith("search", 1, { search: "trip", kind: "folder" }));
  // The one in a view-only space is shown but refused.
  expect(await screen.findByTestId("pages-save-result-readonly")).toBeTruthy();
  await act(async () => fireEvent.press(screen.getAllByTestId("pages-save-result")[0]));
  expect(mockApi.node).toHaveBeenCalledWith(400, 950);
  expect(await screen.findByText("Saving to Family / Holidays / Trip 2026")).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByTestId("pages-save-here")));
  expect(mockEnqueue).toHaveBeenCalledWith(expect.any(Array), { spaceId: 400, parentId: 950, label: "Family / Holidays / Trip 2026" });
  expect((await loadRecentDestinations())[0].label).toBe("Family / Holidays / Trip 2026");
});

it("opens where the last upload went, and offers the recent places first", async () => {
  const place = { space: { id: 315, title: "QA Pages", icon: "🧪" }, path: [{ id: 900, title: "Vlogs" }], floor: 0 };
  await AsyncStorage.setItem("mm-pages-last-destination", JSON.stringify({ spaceId: 315, parentId: 900, label: "QA Pages / Vlogs", place }));
  await AsyncStorage.setItem("mm-pages-recent-destinations", JSON.stringify([{ spaceId: 315, parentId: 900, label: "QA Pages / Vlogs", place }]));
  renderIt();
  expect(await screen.findByText("Saving to QA Pages / Vlogs")).toBeTruthy();
  fireEvent.press(screen.getByTestId("pages-save-crumb-root"));
  expect(await screen.findByTestId("pages-save-recent-title")).toBeTruthy();
  expect(screen.getByTestId("pages-save-recent")).toBeTruthy();
});
