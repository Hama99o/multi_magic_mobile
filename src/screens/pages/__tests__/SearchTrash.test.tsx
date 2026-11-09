/**
 * Search and Trash as Drive has them (QA_DEEP #8, #9), driven through the
 * screens. The server facts these rest on: a blank search is everything
 * (`PageApp::Node.search_nodes`), `kind` is applied before the content type
 * (`node_sorting.rb`), and a trashed node is gone for good only through
 * `destroy_permanently`.
 */
import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";
import type { PageNode } from "@/api/pages";

const base = {
  spaceId: 315,
  parentId: null,
  starred: false,
  childrenCount: 0,
  thumbnailUrl: null,
  ownerName: "Qa MOBILE",
  updatedAt: "2026-11-06T10:00:00Z",
  createdAt: null,
  deletedAt: "2026-11-07T10:00:00Z",
  space: { id: 315, title: "QA Pages", icon: "🧪" },
  html: null,
  ancestors: [],
};
const old: PageNode = { ...base, id: 7, title: "old.pdf", kind: "file", mimeType: "application/pdf", fileSize: 1000, attachmentUrl: "x" };
const page = (rows: unknown[]) => ({ rows, hasMore: false, unreadable: 0, total: rows.length });

const mockApi = {
  drive: jest.fn(async () => page([old])),
  restore: jest.fn(async () => undefined),
  destroyForever: jest.fn(async () => undefined),
  emptyTrash: jest.fn(async () => 3),
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: new Proxy({}, { get: (_t, key: string) => (...a: unknown[]) => (mockApi as Record<string, (...x: unknown[]) => unknown>)[key](...a) }),
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));

/* eslint-disable import/first */
import { TrashView } from "../drive/TrashView";
import { SearchView, withinModified, withinOwner } from "../drive/SearchView";

function wrap(node: React.ReactElement) {
  return render(<QueryClientProvider client={testQueryClient()}>{node}</QueryClientProvider>);
}
const lastButtons = () => (Alert.alert as jest.Mock).mock.calls.at(-1)![2] as { style?: string; onPress?: () => void }[];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("Trash", () => {
  it("⋯ → Restore brings it back, at once", async () => {
    wrap(<TrashView />);
    fireEvent.press(await screen.findByTestId("pages-more-file"));
    fireEvent.press(await screen.findByTestId("pages-trash-restore"));
    await waitFor(() => expect(mockApi.restore).toHaveBeenCalledWith(315, 7));
  });

  it("⋯ → Delete forever asks first, says it cannot be undone, and deletes only on yes", async () => {
    wrap(<TrashView />);
    fireEvent.press(await screen.findByTestId("pages-more-file"));
    fireEvent.press(await screen.findByTestId("pages-trash-delete"));
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe("Delete “old.pdf” forever?");
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toMatch(/can’t be undone/);
    expect(mockApi.destroyForever).not.toHaveBeenCalled();
    await act(async () => lastButtons().find((b) => b.style === "destructive")!.onPress!());
    expect(mockApi.destroyForever).toHaveBeenCalledWith(315, 7);
  });

  it("Empty trash asks first, then empties and says how many went", async () => {
    wrap(<TrashView />);
    fireEvent.press(await screen.findByTestId("pages-trash-empty"));
    expect(mockApi.emptyTrash).not.toHaveBeenCalled();
    await act(async () => lastButtons().find((b) => b.style === "destructive")!.onPress!());
    expect(mockApi.emptyTrash).toHaveBeenCalled();
    await waitFor(() => expect((Alert.alert as jest.Mock).mock.calls.at(-1)![0]).toBe("3 items deleted forever."));
  });

  it("an empty trash offers no Empty button", async () => {
    mockApi.drive.mockResolvedValueOnce(page([]));
    wrap(<TrashView />);
    expect(await screen.findByTestId("pages-drive-empty")).toBeTruthy();
    expect(screen.queryByTestId("pages-trash-empty")).toBeNull();
  });
});

describe("Search", () => {
  it("nothing asked, nothing fetched: a hint", () => {
    wrap(<SearchView />);
    expect(screen.getByTestId("pages-search-hint")).toBeTruthy();
    expect(mockApi.drive).not.toHaveBeenCalled();
  });

  it("the Type chip alone searches: PDFs, nothing typed, files only", async () => {
    wrap(<SearchView />);
    fireEvent.press(screen.getByTestId("pages-search-chip-type"));
    fireEvent.press(await screen.findByTestId("pages-search-type-pdf"));
    await waitFor(() => expect(mockApi.drive).toHaveBeenCalledWith("search", 1, { search: "", type: "pdf", kind: "file" }));
    expect(await screen.findByText("old.pdf")).toBeTruthy();
  });

  it("typing searches by name, once he stops", async () => {
    jest.useFakeTimers();
    wrap(<SearchView />);
    fireEvent.changeText(screen.getByTestId("pages-search-input"), "trip");
    act(() => jest.advanceTimersByTime(350));
    jest.useRealTimers();
    await waitFor(() => expect(mockApi.drive).toHaveBeenCalledWith("search", 1, { search: "trip" }));
  });

  it("Modified hides what is older than the window", async () => {
    wrap(<SearchView />);
    fireEvent.press(screen.getByTestId("pages-search-chip-modified"));
    fireEvent.press(await screen.findByTestId("pages-search-modified-today"));
    await waitFor(() => expect(mockApi.drive).toHaveBeenCalled());
    expect(await screen.findByTestId("pages-drive-empty")).toBeTruthy(); // old.pdf is from yesterday
  });
});

describe("the phone-side filters", () => {
  const now = new Date("2026-11-07T12:00:00");
  it("Modified windows", () => {
    expect(withinModified("2026-11-07T08:00:00", "today", now)).toBe(true);
    expect(withinModified("2026-11-06T23:00:00", "today", now)).toBe(false);
    expect(withinModified("2026-11-01T12:00:00", "week", now)).toBe(true);
    expect(withinModified("2026-10-30T12:00:00", "week", now)).toBe(false);
    expect(withinModified("2026-10-10T12:00:00", "month", now)).toBe(true);
    expect(withinModified("2025-12-31T12:00:00", "year", now)).toBe(false);
    expect(withinModified("2001-01-01T00:00:00", "any", now)).toBe(true);
  });
  it("Owner, by name, ignoring case", () => {
    expect(withinOwner({ ownerName: "Qa MOBILE" }, "me", "qa mobile")).toBe(true);
    expect(withinOwner({ ownerName: "Someone" }, "me", "Qa MOBILE")).toBe(false);
    expect(withinOwner({ ownerName: "Someone" }, "others", "Qa MOBILE")).toBe(true);
    expect(withinOwner({ ownerName: null }, "anyone", "Qa MOBILE")).toBe(true);
  });
});
