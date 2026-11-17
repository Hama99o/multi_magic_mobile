/**
 * A SHARED ROW SHOWS WHAT IT IS (audit P2, 2026-11-16): the Shared tab drew
 * 📄 for every shared item, a folder too, and the drive's Shared view drew a
 * folder for every shared item, a PDF too. A whole space keeps its icon.
 */
import { render, screen, within } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

const shares = [
  { id: 1, permission: "viewer", space: { id: 400, title: "Family", icon: "🏠" }, node: { id: 10, title: "Trips", kind: "folder", parentId: null } },
  { id: 2, permission: "viewer", space: { id: 400, title: "Family", icon: "🏠" }, node: { id: 11, title: "plan.pdf", kind: "file", parentId: null } },
  { id: 3, permission: "editor", space: { id: 401, title: "Work", icon: "🛠️" }, node: null },
];
const mockApi = {
  sharedWithMe: jest.fn(async () => ({ rows: shares, hasMore: false, unreadable: 0, total: 3 })),
  drive: jest.fn(async () => ({ rows: [], hasMore: false, unreadable: 0, total: 0 })),
  spaces: jest.fn(async () => ({ rows: [], hasMore: false, unreadable: 0, total: 0 })),
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: new Proxy({}, { get: (_t, key: string) => (...a: unknown[]) => (mockApi as Record<string, (...x: unknown[]) => unknown>)[key](...a) }),
}));
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams.current,
}));

/* eslint-disable import/first */
import PagesHome from "../../../../app/pages/index";
import Drive from "../../../../app/pages/drive";

function expectRightGlyphs() {
  const rows = screen.getAllByTestId("pages-shared-row");
  expect(rows).toHaveLength(3);
  expect(within(rows[0]).getByTestId("pages-shared-glyph-folder")).toBeTruthy();
  expect(within(rows[1]).getByTestId("pages-shared-glyph-pdf")).toBeTruthy();
  expect(within(rows[2]).getByText("🛠️")).toBeTruthy();
  expect(screen.queryByText("📄")).toBeNull();
}

function wrap(node: React.ReactElement) {
  return render(<QueryClientProvider client={testQueryClient()}>{node}</QueryClientProvider>);
}

it("the Shared tab", async () => {
  mockParams.current = { tab: "shared" };
  wrap(<PagesHome />);
  await screen.findByText("plan.pdf");
  expectRightGlyphs();
});

it("the drive's Shared view", async () => {
  mockParams.current = { view: "shared" };
  wrap(<Drive />);
  await screen.findByText("plan.pdf");
  expectRightGlyphs();
});
