/**
 * THE MOVE SHEET PAGES (audit #19, 2026-11-16): it showed the first 25
 * folders (one page of `children`) and the first page of spaces, and nothing
 * past them could be chosen.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";
import type { PageNode } from "@/api/pages";

const folder = (id: number, title: string) => ({ id, title, kind: "folder", spaceId: 315, parentId: null, icon: null });
const mockApi = {
  space: jest.fn(async () => ({ id: 315, title: "QA Pages", icon: "🧪" })),
  children: jest.fn(async (_s: number, _p: number | null, pageNo: number) =>
    pageNo === 1 ? { rows: [folder(900, "Folder 1")], hasMore: true, unreadable: 0, total: 26 } : { rows: [folder(926, "Folder 26")], hasMore: false, unreadable: 0, total: 26 },
  ),
  spaces: jest.fn(async (pageNo: number) =>
    pageNo === 1 ? { rows: [{ id: 315, title: "QA Pages", icon: "🧪" }], hasMore: true, unreadable: 0, total: 2 } : { rows: [{ id: 316, title: "Space 51", icon: null }], hasMore: false, unreadable: 0, total: 2 },
  ),
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: new Proxy({}, { get: (_t, key: string) => (...a: unknown[]) => (mockApi as Record<string, (...x: unknown[]) => unknown>)[key](...a) }),
}));

/* eslint-disable import/first */
import { MoveSheet } from "../drive/sheets";

const clip = { id: 1, title: "clip.mp4", kind: "file", spaceId: 315, parentId: null, space: null } as unknown as PageNode;

function wrap() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <MoveSheet nodes={[clip]} onClose={() => {}} onMove={async () => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

it("folders past the first page load at the end of the list", async () => {
  wrap();
  await screen.findByText("Folder 1");
  fireEvent(screen.getByTestId("pages-move-list"), "endReached");
  expect(await screen.findByText("Folder 26")).toBeTruthy();
  expect(mockApi.children).toHaveBeenLastCalledWith(315, null, 2, expect.objectContaining({ kind: "folder" }));
});

it("spaces past the first page load too", async () => {
  wrap();
  await screen.findByText("Folder 1");
  fireEvent.press(screen.getByTestId("pages-move-crumb-root"));
  await waitFor(() => expect(screen.getAllByTestId("pages-move-space").length).toBe(1));
  fireEvent(screen.getByTestId("pages-move-list"), "endReached");
  expect(await screen.findByText("Space 51")).toBeTruthy();
});
