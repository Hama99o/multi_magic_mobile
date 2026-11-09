/**
 * EVERY ACTION, IN BOTH VIEWS — the owner: "both are important, make sure
 * every option works very well, nothing should break". `NodeCollection` is
 * the one component behind every list and grid in Pages, so each action is
 * driven here through the UI, the way a person would, once per view:
 * open, ⋯ → star / rename / move / details / trash, long-press multi-select
 * with star-all and trash-all, and the toggle, kept across a restart.
 */
import { Alert, Text } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { testQueryClient } from "@/__tests__/queryClient";
import type { PageNode } from "@/api/pages";

const mockApi = {
  update: jest.fn(async () => ({})),
  move: jest.fn(async () => ({})),
  trash: jest.fn(async () => undefined),
  restore: jest.fn(async () => undefined),
  spaces: jest.fn(async () => ({ rows: [{ id: 315, title: "QA Pages", icon: "🧪" }], hasMore: false, unreadable: 0, total: 1 })),
  children: jest.fn(async () => ({ rows: [{ id: 900, title: "Archive 2025", kind: "folder" }], hasMore: false, unreadable: 0, total: 1 })),
  space: jest.fn(async () => ({ id: 315, title: "QA Pages", icon: "🧪" })),
  node: jest.fn(async () => ({ id: 3355, title: "2026-11-06", kind: "folder", ancestors: [{ id: 3300, title: "Vlogs" }] })),
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: {
    update: (...a: unknown[]) => mockApi.update(...(a as [])),
    move: (...a: unknown[]) => mockApi.move(...(a as [])),
    trash: (...a: unknown[]) => mockApi.trash(...(a as [])),
    restore: (...a: unknown[]) => mockApi.restore(...(a as [])),
    spaces: (...a: unknown[]) => mockApi.spaces(...(a as [])),
    children: (...a: unknown[]) => mockApi.children(...(a as [])),
    space: (...a: unknown[]) => mockApi.space(...(a as [])),
    node: (...a: unknown[]) => mockApi.node(...(a as [])),
  },
  downloadToCache: jest.fn(async () => "file:///cache/x"),
}));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn(async () => undefined) }));
const mockDownloadMany = jest.fn();
jest.mock("../downloadMany", () => ({ downloadMany: (...a: unknown[]) => mockDownloadMany(...a) }));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));

/* eslint-disable import/first */
import { NodeCollection } from "../drive/NodeCollection";
import { useViewPrefs, SortRow } from "../drive/ui";

const base = {
  spaceId: 315,
  parentId: 3355,
  starred: false,
  childrenCount: 0,
  thumbnailUrl: null,
  ownerName: "Qa MOBILE",
  updatedAt: "2026-11-06T10:00:00Z",
  createdAt: "2026-11-06T09:00:00Z",
  deletedAt: null,
  space: { id: 315, title: "QA Pages", icon: "🧪" },
  html: null,
  ancestors: [],
};
const clip: PageNode = { ...base, id: 1, title: "vlog-a.mp4", kind: "file", mimeType: "video/mp4", fileSize: 283314295, attachmentUrl: "http://x/clip" };
const photo: PageNode = { ...base, id: 2, title: "photo-1.jpg", kind: "file", mimeType: "image/jpeg", fileSize: 699230, attachmentUrl: "http://x/photo" };

const onOpen = jest.fn();

function renderIt() {
  const client = testQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <NodeCollection
        testID="list"
        nodes={[clip, photo]}
        top={<Text>top</Text>}
        header={<SortRow label="Name" ascending />}
        empty={null}
        refreshing={false}
        onRefresh={() => {}}
        onOpen={onOpen}
        locationOf={() => "QA Pages / 2026-11-06"}
      />
    </QueryClientProvider>,
  );
}

/** The row's (list) or card's (grid) ⋯ for the first file. */
function more(mode: "list" | "grid") {
  return screen.getAllByTestId(mode === "list" ? "pages-more-file" : "pages-card-more-file")[0];
}

/** The pressable for a node, by its accessible name. */
function item(title: string) {
  return screen.getAllByRole("button").find((b) => String(b.props.accessibilityLabel ?? "").startsWith(`${title},`))!;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe.each(["list", "grid"] as const)("in the %s view", (mode) => {
  beforeEach(() => {
    act(() => useViewPrefs.setState({ mode }));
  });

  it("opens an item on a tap", () => {
    renderIt();
    fireEvent(screen.getByTestId("list-root"), "layout", { nativeEvent: { layout: { width: 360, height: 800 } } });
    fireEvent.press(item("vlog-a.mp4"));
    expect(onOpen).toHaveBeenCalledWith(clip);
  });

  it("⋯ → Add to starred stars it", async () => {
    renderIt();
    fireEvent(screen.getByTestId("list-root"), "layout", { nativeEvent: { layout: { width: 360, height: 800 } } });
    fireEvent.press(more(mode));
    fireEvent.press(await screen.findByTestId("pages-action-star"));
    await waitFor(() => expect(mockApi.update).toHaveBeenCalledWith(315, 1, { starred: true }));
  });

  it("⋯ → Rename starts from the current name and saves the new one", async () => {
    renderIt();
    fireEvent(screen.getByTestId("list-root"), "layout", { nativeEvent: { layout: { width: 360, height: 800 } } });
    fireEvent.press(more(mode));
    fireEvent.press(await screen.findByTestId("pages-action-rename"));
    const input = await screen.findByTestId("pages-name-input");
    expect(input.props.value).toBe("vlog-a.mp4");
    fireEvent.changeText(input, "Day 1 - beach.mp4");
    fireEvent.press(screen.getByTestId("pages-name-confirm"));
    await waitFor(() => expect(mockApi.update).toHaveBeenCalledWith(315, 1, { title: "Day 1 - beach.mp4" }));
  });

  it("⋯ → Move opens in its space, goes into a folder, and moves it there", async () => {
    renderIt();
    fireEvent(screen.getByTestId("list-root"), "layout", { nativeEvent: { layout: { width: 360, height: 800 } } });
    fireEvent.press(more(mode));
    fireEvent.press(await screen.findByTestId("pages-action-move"));
    fireEvent.press(await screen.findByTestId("pages-move-folder"));
    await waitFor(() => expect(mockApi.children).toHaveBeenLastCalledWith(315, 900, 1, expect.objectContaining({ kind: "folder" })));
    fireEvent.press(screen.getByTestId("pages-move-here"));
    await waitFor(() => expect(mockApi.move).toHaveBeenCalledWith(315, 1, { spaceId: 315, parentId: 900 }));
  });

  it("⋯ → Details names the type, the size and where it is", async () => {
    renderIt();
    fireEvent(screen.getByTestId("list-root"), "layout", { nativeEvent: { layout: { width: 360, height: 800 } } });
    fireEvent.press(more(mode));
    fireEvent.press(await screen.findByTestId("pages-action-details"));
    expect(await screen.findByText("Video (video/mp4)")).toBeTruthy();
    expect(screen.getByText("283 MB")).toBeTruthy();
    expect(screen.getByText("QA Pages / 2026-11-06")).toBeTruthy();
  });

  // As Drive does (docs/QA_FULL.md top-10 #7): it goes at once, and a bar
  // offers Undo; no "are you sure" in the way, and a mistake costs one tap.
  it("⋯ → Move to trash moves it at once and offers Undo, which brings it back", async () => {
    renderIt();
    fireEvent(screen.getByTestId("list-root"), "layout", { nativeEvent: { layout: { width: 360, height: 800 } } });
    fireEvent.press(more(mode));
    fireEvent.press(await screen.findByTestId("pages-action-trash"));
    await waitFor(() => expect(mockApi.trash).toHaveBeenCalledWith(315, 1));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(await screen.findByText("“vlog-a.mp4” moved to the trash")).toBeTruthy();
    fireEvent.press(screen.getByTestId("pages-undo"));
    await waitFor(() => expect(mockApi.restore).toHaveBeenCalledWith(315, 1));
  });

  it("long-press selects; taps then toggle instead of opening; star-all and trash-all act on the selection", async () => {
    renderIt();
    fireEvent(screen.getByTestId("list-root"), "layout", { nativeEvent: { layout: { width: 360, height: 800 } } });
    fireEvent(item("vlog-a.mp4"), "longPress");
    expect(await screen.findByTestId("pages-selection-bar")).toBeTruthy();
    fireEvent.press(item("photo-1.jpg"));
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.press(screen.getByTestId("pages-select-star"));
    await waitFor(() => expect(mockApi.update).toHaveBeenCalledTimes(2));
    fireEvent.press(screen.getByTestId("pages-select-trash"));
    await waitFor(() => expect(mockApi.trash).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("2 items moved to the trash")).toBeTruthy();
    fireEvent.press(screen.getByTestId("pages-undo"));
    await waitFor(() => expect(mockApi.restore).toHaveBeenCalledTimes(2));
  });
});

// docs/MISSING_FEATURES.md #1: "with 2+ items selected, the top bar has only
// star / move / delete". The order, skipping and counting live in
// downloadMany.test.ts; this pins the button, what it is given, and what the
// person is told at the end.
describe("multi-select Download", () => {
  async function selectBoth() {
    renderIt();
    fireEvent(screen.getByTestId("list-root"), "layout", { nativeEvent: { layout: { width: 360, height: 800 } } });
    fireEvent(item("vlog-a.mp4"), "longPress");
    await screen.findByTestId("pages-selection-bar");
    fireEvent.press(item("photo-1.jpg"));
  }

  it("hands every selected item to the downloader and says what was saved", async () => {
    mockDownloadMany.mockResolvedValue({ saved: 2, failed: 0, skipped: 0 });
    await selectBoth();
    fireEvent.press(screen.getByTestId("pages-select-download"));
    await waitFor(() => expect(mockDownloadMany).toHaveBeenCalled());
    expect(mockDownloadMany.mock.calls[0][0].map((n: PageNode) => n.id).sort()).toEqual([1, 2]);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Download", "2 files saved"));
  });

  it("says what failed and what was skipped, each on its own line", async () => {
    mockDownloadMany.mockResolvedValue({ saved: 1, failed: 1, skipped: 2 });
    await selectBoth();
    fireEvent.press(screen.getByTestId("pages-select-download"));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Download",
        "1 file saved\n1 file could not be saved\n2 pages or folders skipped: only files can be downloaded",
      ),
    );
  });

  it("a cancelled folder picker says nothing", async () => {
    mockDownloadMany.mockResolvedValue(null);
    await selectBoth();
    fireEvent.press(screen.getByTestId("pages-select-download"));
    await waitFor(() => expect(mockDownloadMany).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("with only pages or folders chosen, says only files can be downloaded", async () => {
    mockDownloadMany.mockResolvedValue({ saved: 0, failed: 0, skipped: 2 });
    await selectBoth();
    fireEvent.press(screen.getByTestId("pages-select-download"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Download", "Only files can be downloaded, not pages or folders."));
  });

  it("shows 'n of total' while it runs", async () => {
    let finish: (v: unknown) => void = () => {};
    mockDownloadMany.mockImplementation((_nodes: unknown, _deps: unknown, onProgress: (n: number, t: number) => void) => {
      onProgress(1, 2);
      return new Promise((r) => { finish = r; });
    });
    await selectBoth();
    fireEvent.press(screen.getByTestId("pages-select-download"));
    expect(await screen.findByText("Downloading 1 of 2…")).toBeTruthy();
    await act(async () => finish({ saved: 2, failed: 0, skipped: 0 }));
    await waitFor(() => expect(screen.queryByTestId("pages-download-progress")).toBeNull());
  });
});

describe("Move opens where the file lives (Drive), from a FOLDER listing", () => {
  // Measured 2026-11-07 on qa_phone: in a folder, Move opened on the list of
  // spaces. A folder listing sends `space: null` (only drive-wide lists send
  // it, `with_space`); the fixtures above carried a space, so the test passed
  // on data a folder screen never receives.
  it("starts in the file's own folder, with the real path, from a row without `space`", async () => {
    act(() => useViewPrefs.setState({ mode: "list" }));
    const inFolder: PageNode = { ...clip, space: null };
    render(
      <QueryClientProvider client={testQueryClient()}>
        <NodeCollection testID="list" nodes={[inFolder]} top={null} empty={null} refreshing={false} onRefresh={() => {}} onOpen={onOpen} locationOf={() => ""} />
      </QueryClientProvider>,
    );
    fireEvent(screen.getByTestId("list-root"), "layout", { nativeEvent: { layout: { width: 360, height: 800 } } });
    fireEvent.press(screen.getAllByTestId("pages-more-file")[0]);
    fireEvent.press(await screen.findByTestId("pages-action-move"));
    await waitFor(() => expect(mockApi.children).toHaveBeenLastCalledWith(315, 3355, 1, expect.objectContaining({ kind: "folder" })));
    // The breadcrumb: Spaces › QA Pages › Vlogs › 2026-11-06.
    expect(await screen.findByText("QA Pages")).toBeTruthy();
    expect(screen.getByText("Vlogs")).toBeTruthy();
    expect(screen.getByText("2026-11-06")).toBeTruthy();
    // Already there: Drive offers no "Move" until another place is chosen.
    expect(screen.getByTestId("pages-move-here").props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(await screen.findByTestId("pages-move-folder"));
    await waitFor(() => expect(screen.getByTestId("pages-move-here").props.accessibilityState).toMatchObject({ disabled: false }));
  });
});

describe("the + button, hidden while selecting (as Drive does)", () => {
  it("is told when a selection starts and when it is closed", async () => {
    const onSelectingChange = jest.fn();
    render(
      <QueryClientProvider client={testQueryClient()}>
        <NodeCollection testID="list" nodes={[clip, photo]} top={null} empty={null} refreshing={false} onRefresh={() => {}} onOpen={onOpen} locationOf={() => ""} onSelectingChange={onSelectingChange} />
      </QueryClientProvider>,
    );
    fireEvent(screen.getByTestId("list-root"), "layout", { nativeEvent: { layout: { width: 360, height: 800 } } });
    expect(onSelectingChange).toHaveBeenLastCalledWith(false);
    fireEvent(item("vlog-a.mp4"), "longPress");
    await waitFor(() => expect(onSelectingChange).toHaveBeenLastCalledWith(true));
    fireEvent.press(screen.getByTestId("pages-select-clear"));
    await waitFor(() => expect(onSelectingChange).toHaveBeenLastCalledWith(false));
  });
});

describe("the grid keeps folders and files apart (Drive's grid)", () => {
  const folder = (id: number, title: string): PageNode => ({ ...base, id, title, kind: "folder", mimeType: null, fileSize: null, attachmentUrl: null, childrenCount: 1 });
  function grid(nodes: PageNode[]) {
    act(() => useViewPrefs.setState({ mode: "grid" }));
    render(
      <QueryClientProvider client={testQueryClient()}>
        <NodeCollection testID="list" nodes={nodes} top={null} empty={null} refreshing={false} onRefresh={() => {}} onOpen={onOpen} locationOf={() => ""} />
      </QueryClientProvider>,
    );
    fireEvent(screen.getByTestId("list-root"), "layout", { nativeEvent: { layout: { width: 360, height: 800 } } });
  }

  it("an odd number of folders: the last folder's row is closed, files start on a new row", () => {
    grid([folder(10, "Vlog 2026"), clip, photo]);
    expect(screen.getAllByTestId("pages-grid-spacer")).toHaveLength(1);
  });
  it("an even number, or no folders: nothing to close", () => {
    grid([folder(10, "A"), folder(11, "B"), clip]);
    expect(screen.queryByTestId("pages-grid-spacer")).toBeNull();
  });
  it("only folders: nothing to close either", () => {
    grid([folder(10, "A")]);
    expect(screen.queryByTestId("pages-grid-spacer")).toBeNull();
  });
});

describe("the list/grid toggle", () => {
  it("switches the view and keeps the choice across a restart", async () => {
    act(() => useViewPrefs.setState({ mode: "list" }));
    renderIt();
    fireEvent.press(screen.getByTestId("pages-view-toggle"));
    expect(useViewPrefs.getState().mode).toBe("grid");
    await waitFor(async () => expect(await AsyncStorage.getItem("mm-pages-view-mode")).toBe("grid"));
    act(() => useViewPrefs.setState({ mode: "list" }));
    await act(async () => useViewPrefs.getState().hydrate());
    expect(useViewPrefs.getState().mode).toBe("grid");
  });
});
