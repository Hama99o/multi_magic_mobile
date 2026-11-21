/**
 * PAGES PARITY, REVIEW FINDINGS (feat/pages-parity 790401a), written RED.
 *
 * Each test names a behaviour a person meets and fails on the branch as it
 * stands. They prove the bugs; they do not fix them.
 *
 *  1. app/pages/edit.tsx:306 — the header back runs
 *     `saveNow().finally(() => router.back())`, and saveNow swallows its own
 *     failure (:131). A failed save still leaves, and the typing is lost
 *     with no word said.
 *  2. app/pages/folder.tsx:212 — createPage invalidates nothing, so the
 *     folder list does not show the page just made until a manual refresh
 *     (owner rule: a record just created is visible at once).
 *  3. app/pages/edit.tsx:67 — the editor opens on the cached body and never
 *     takes the fresher one the background fetch brings, so an autosave
 *     writes the stale body over a newer web edit.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { testQueryClient } from "@/__tests__/queryClient";
import { pagesKeys } from "@/api/keys";
import type { DocNode } from "@/screens/notes/editor/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockEngine: { props: Record<string, any> | null; init: any; doc: any } = { props: null, init: null, doc: null };
jest.mock("@apollohg/react-native-rich-text-editor", () => {
  const ReactActual = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    defineSchema: (s: unknown) => ({ nodes: [], spec: s }),
    defineAtomNode: (c: Record<string, unknown>) => ({ ...c, nodeSpec: { name: c.name } }),
    withAtomsSchema: (s: unknown) => s,
    withTablesSchema: (s: unknown) => s,
    createNativeEditorDocumentHandle: (config: { initialization: { json: unknown } }) => {
      mockEngine.init = JSON.parse(JSON.stringify(config.initialization.json));
      mockEngine.doc = null;
      return {
        destroy: () => undefined,
        bridge: {
          getState: () => ({ documentRevision: "7" }),
          getDocumentIsEmpty: () => false,
          addErrorListener: () => () => undefined,
          getDocumentJson: () => JSON.parse(JSON.stringify(mockEngine.init)),
          setSelection: () => undefined,
        },
      };
    },
    RichTextEditor: ReactActual.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      mockEngine.props = props;
      ReactActual.useImperativeHandle(ref, () =>
        new Proxy({}, {
          get: (_t: unknown, name: string) => () => {
            if (name === "getContentJson") return JSON.parse(JSON.stringify(mockEngine.doc ?? mockEngine.init));
            return Promise.resolve();
          },
        }),
      );
      return ReactActual.createElement(View, { testID: "engine-b" });
    }),
  };
});

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams.current,
  useNavigation: () => ({ addListener: () => () => undefined }),
}));

const node = (over: Record<string, unknown>) => ({
  id: 9, spaceId: 3, parentId: null, title: "QA page", kind: "page", starred: false, childrenCount: 0, attachmentUrl: null, thumbnailUrl: null,
  mimeType: null, fileSize: null, durationSeconds: null, ownerName: null, updatedAt: "2026-11-21T10:00:00Z", createdAt: null, deletedAt: null,
  space: null, html: null, ancestors: [], ...over,
});
const listPage = (rows: unknown[]) => ({ rows, hasMore: false, unreadable: 0, total: rows.length });

const mockApi: Record<string, jest.Mock> = {
  node: jest.fn(),
  savePage: jest.fn(),
  space: jest.fn(),
  children: jest.fn(),
  createPage: jest.fn(),
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: new Proxy({}, { get: (_t, key: string) => (...a: unknown[]) => mockApi[key](...a) }),
}));

/* eslint-disable import/first */
import PageEdit from "../pages/edit";
import Folder from "../pages/folder";
import { router } from "expo-router";

function wrap(ui: React.ReactElement, client: QueryClient = testQueryClient()) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** The person typed `text` at the end of the first paragraph. */
function typed(text: string) {
  const doc = JSON.parse(JSON.stringify(mockEngine.init)) as DocNode;
  const p = doc.content!.find((n) => n.type === "paragraph")!;
  p.content = [...(p.content ?? []), { type: "text", text }];
  mockEngine.doc = doc;
  mockEngine.props!.onDocumentChange({});
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEngine.props = null;
  mockEngine.init = null;
  mockEngine.doc = null;
});

describe("the page editor", () => {
  beforeEach(() => {
    mockParams.current = { spaceId: "3", nodeId: "9", title: "QA page" };
  });

  it("does not leave, losing the typing, when the save fails on the way out", async () => {
    mockApi.node.mockResolvedValue(node({ html: "<p>Hello</p>" }));
    mockApi.savePage.mockRejectedValue(new Error("Network Error"));
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    wrap(<PageEdit />);
    await screen.findByTestId("engine-b");
    act(() => typed(" and more"));
    fireEvent.press(screen.getByTestId("pages-back"));
    await waitFor(() => expect(mockApi.savePage).toHaveBeenCalled());
    // Let the rejected save and its .finally settle.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // Either stay on the page, or at least ask before throwing the text away.
    const warned = alert.mock.calls.length > 0;
    expect({ left: (router.back as jest.Mock).mock.calls.length > 0, warned }).not.toEqual({ left: true, warned: false });
    alert.mockRestore();
  });

  it("opens on the page as the server has it now, not on an older cached copy", async () => {
    const client = testQueryClient();
    // The viewer cached this body earlier; the page was edited on the web since.
    client.setQueryData(pagesKeys.node(3, 9), node({ html: "<p>Old cached body</p>" }));
    let answer: (v: unknown) => void = () => undefined;
    mockApi.node.mockImplementation(() => new Promise((r) => (answer = r)));
    mockApi.savePage.mockImplementation(async (_s: number, _n: number, html: string) => node({ html }));
    wrap(<PageEdit />, client);
    // (ee, 2026-11-21) The fix waits for this fetch before opening the editor
    // at all, so the editor is looked for after the answer, not before it.
    await waitFor(() => expect(mockApi.node).toHaveBeenCalled());
    await act(async () => {
      answer(node({ html: "<p>Newer web edit</p>" }));
      await new Promise((r) => setTimeout(r, 20));
    });
    await screen.findByTestId("engine-b");
    await waitFor(() => expect(client.getQueryData<{ html: string }>(pagesKeys.node(3, 9))?.html).toBe("<p>Newer web edit</p>"));
    // He types, and the autosave goes out: it must not put the old body back.
    act(() => typed(" typed"));
    fireEvent.press(screen.getByTestId("pages-back"));
    await waitFor(() => expect(mockApi.savePage).toHaveBeenCalled());
    const sent = String(mockApi.savePage.mock.calls[0][2]);
    expect(sent).toContain("Newer web edit");
    expect(sent).not.toContain("Old cached body");
  });
});

describe("a folder", () => {
  beforeEach(() => {
    mockParams.current = { spaceId: "3", title: "QA Pages" };
    mockApi.space.mockImplementation(async (id: number) => ({ id, title: "QA Pages", icon: null, permission: "owner" }));
  });

  it("shows a page it just created in its list at once, without a refresh", async () => {
    const existing = node({ id: 1, kind: "file", title: "existing.pdf", mimeType: "application/pdf", fileSize: 1000, attachmentUrl: "http://x/f" });
    const made = node({ id: 77, title: "Fresh page", html: "" });
    const rows: unknown[] = [existing];
    mockApi.children.mockImplementation(async () => listPage([...rows]));
    mockApi.createPage.mockImplementation(async () => {
      rows.unshift(made); // the server has it from now on
      return made;
    });
    wrap(<Folder />);
    await screen.findByText("existing.pdf");
    fireEvent.press(await screen.findByTestId("pages-add"));
    fireEvent.press(await screen.findByTestId("pages-new-page"));
    fireEvent.changeText(await screen.findByTestId("pages-name-input", {}, { timeout: 2000 }), "Fresh page");
    fireEvent.press(screen.getByTestId("pages-name-confirm"));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(mockApi.createPage).toHaveBeenCalledWith(3, null, "Fresh page");
    // Back on the folder (it stays mounted under the editor): the page is there.
    expect(await screen.findByText("Fresh page", {}, { timeout: 1500 })).toBeTruthy();
  });
});
