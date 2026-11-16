/**
 * EDIT AND DELETE A SPACE (audit #15), the web's space menu (`Drive.tsx`
 * `spaceMenu`): "Edit space" opens the same form as New space, filled in;
 * "Delete space" asks first ("This cannot be undone", the web's words).
 * Offered on the caller's own spaces only, as the web's `owned` and the
 * server's `SpacePolicy#update?` / `#destroy?` (owner only).
 */
import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

const space = (id: number, title: string, permission: string | null = null) => ({
  id, title, icon: "🚀", description: "Summer", color: "teal", nodesCount: 2, ownerName: null, permission, totalFileSize: null, updatedAt: "2026-11-16T10:00:00Z",
});
const mockRows: { current: unknown[] } = { current: [] };
const mockApi = {
  spaces: jest.fn(async () => ({ rows: mockRows.current, hasMore: false, unreadable: 0, total: mockRows.current.length })),
  drive: jest.fn(async () => ({ rows: [], hasMore: false, unreadable: 0, total: 0 })),
  sharedWithMe: jest.fn(async () => ({ rows: [], hasMore: false, unreadable: 0, total: 0 })),
  updateSpace: jest.fn(async (id: number, fields: Record<string, string>) => ({ ...space(id, fields.title), ...fields })),
  deleteSpace: jest.fn(async () => undefined),
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: new Proxy({}, { get: (_t, key: string) => (...a: unknown[]) => (mockApi as Record<string, (...x: unknown[]) => unknown>)[key](...a) }),
}));
jest.mock("@/api/pageShares", () => ({
  ...jest.requireActual("@/api/pageShares"),
  sharesApi: { list: jest.fn(async () => []) },
  shareLinksApi: { list: jest.fn(async () => []) },
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ tab: "files" }),
}));

/* eslint-disable import/first */
import PagesHome from "../../../../app/pages/index";

function wrap() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <PagesHome />
    </QueryClientProvider>,
  );
}
const lastButtons = () => (Alert.alert as jest.Mock).mock.calls.at(-1)![2] as { style?: string; onPress?: () => void }[];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  mockRows.current = [space(315, "Trips")];
});

it("Edit space opens the form filled in, and saves the four fields", async () => {
  wrap();
  await screen.findByText("Trips");
  fireEvent.press(screen.getByTestId("pages-space-more"));
  fireEvent.press(await screen.findByTestId("pages-space-edit"));
  expect(screen.getByTestId("pages-space-title").props.value).toBe("Trips");
  expect(screen.getByTestId("pages-space-description").props.value).toBe("Summer");
  expect(screen.getByText("Edit space")).toBeTruthy();
  fireEvent.changeText(screen.getByTestId("pages-space-title"), "Holidays");
  fireEvent.press(screen.getByTestId("pages-space-icon-🏠"));
  fireEvent.press(screen.getByTestId("pages-space-color-none"));
  await act(async () => fireEvent.press(screen.getByTestId("pages-space-create")));
  expect(mockApi.updateSpace).toHaveBeenCalledWith(315, { title: "Holidays", description: "Summer", icon: "🏠", color: "" });
  await waitFor(() => expect(screen.queryByTestId("pages-space-form")).toBeNull());
});

it("Delete space asks first, then deletes and the row goes", async () => {
  wrap();
  await screen.findByText("Trips");
  fireEvent.press(screen.getByTestId("pages-space-more"));
  fireEvent.press(await screen.findByTestId("pages-space-delete"));
  expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe("Delete “Trips”?");
  expect(mockApi.deleteSpace).not.toHaveBeenCalled();
  mockRows.current = [];
  await act(async () => lastButtons().find((b) => b.style === "destructive")!.onPress!());
  expect(mockApi.deleteSpace).toHaveBeenCalledWith(315);
  await waitFor(() => expect(screen.queryByText("Trips")).toBeNull());
});

it("a space shared with him (not his) has no menu", async () => {
  mockRows.current = [space(400, "Family", "editor")];
  wrap();
  await screen.findByText("Family");
  expect(screen.queryByTestId("pages-space-more")).toBeNull();
});

it("the form rises with the keyboard", async () => {
  const { KeyboardPadding } = jest.requireActual("@/components/KeyboardPadding");
  wrap();
  await screen.findByText("Trips");
  fireEvent.press(screen.getByTestId("pages-space-more"));
  fireEvent.press(await screen.findByTestId("pages-space-edit"));
  expect(screen.UNSAFE_getByType(KeyboardPadding)).toBeTruthy();
});

// Audit #14: the web's "Share space" (`Drive.tsx` `spaceMenu`, owner only).
it("Share space opens the Share sheet for the space", async () => {
  wrap();
  await screen.findByText("Trips");
  fireEvent.press(screen.getByTestId("pages-space-more"));
  fireEvent.press(await screen.findByTestId("pages-space-share"));
  expect(await screen.findByTestId("pages-share-sheet")).toBeTruthy();
  const { sharesApi } = jest.requireMock("@/api/pageShares") as { sharesApi: { list: jest.Mock } };
  await waitFor(() => expect(sharesApi.list).toHaveBeenCalledWith({ spaceId: 315, nodeId: null }));
});
