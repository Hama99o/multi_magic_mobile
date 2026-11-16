/**
 * THE SPACES LIST (audit #20, 2026-11-16): it was oldest first and stopped
 * at 50. The owner's rule (2026-11-09): every list starts with the newest,
 * and the person may pick another sort. The server sorts spaces by name,
 * updated_at or created_at (`VALID_SPACE_SORT_COLUMNS`).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

const space = (id: number, title: string) => ({ id, title, icon: "📁", description: null, color: null, nodesCount: 0, ownerName: null, permission: null, totalFileSize: null, updatedAt: "2026-11-16T10:00:00Z" });
const mockApi = {
  spaces: jest.fn(async (pageNo: number) =>
    pageNo === 1 ? { rows: [space(2, "Newest"), space(1, "Older")], hasMore: true, unreadable: 0, total: 3 } : { rows: [space(0, "Oldest")], hasMore: false, unreadable: 0, total: 3 },
  ),
  drive: jest.fn(async () => ({ rows: [], hasMore: false, unreadable: 0, total: 0 })),
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: new Proxy({}, { get: (_t, key: string) => (...a: unknown[]) => (mockApi as Record<string, (...x: unknown[]) => unknown>)[key](...a) }),
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

beforeEach(() => jest.clearAllMocks());

it("asks for the newest first, and says so", async () => {
  wrap();
  await screen.findByText("Newest");
  expect(mockApi.spaces).toHaveBeenCalledWith(1, { sortBy: "created_at", sortDir: "desc" });
  expect(screen.getByTestId("pages-sort").props.accessibilityLabel).toBe("Sorted by Date created, Descending. Change the sort");
});

it("loads the next page at the end of the list", async () => {
  wrap();
  await screen.findByText("Older");
  fireEvent(screen.getByTestId("pages-spaces-list"), "endReached");
  expect(await screen.findByText("Oldest")).toBeTruthy();
  expect(mockApi.spaces).toHaveBeenLastCalledWith(2, { sortBy: "created_at", sortDir: "desc" });
});

it("another sort can be picked: Name, A to Z", async () => {
  wrap();
  await screen.findByText("Newest");
  fireEvent.press(screen.getByTestId("pages-sort"));
  fireEvent.press(await screen.findByTestId("pages-sort-name"));
  await waitFor(() => expect(mockApi.spaces).toHaveBeenLastCalledWith(1, { sortBy: "name", sortDir: "asc" }));
});
