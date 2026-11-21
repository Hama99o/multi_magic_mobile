/**
 * AUTOSAVES GO ONE AT A TIME, IN ORDER (review 88, S3, 2026-11-21).
 *
 * `saveNow` started a new save while the previous one was still on its way. On a phone
 * network the older one can reach the server last, and then the older body is what the
 * page keeps. A save now waits for the one before it.
 */
import { act, render, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockEngineErrors: { listeners: ((e: unknown) => void)[] } = { listeners: [] };
const mockEngine: { props: Record<string, any> | null; init: any; doc: any; refuse: boolean; rejectSet: boolean; rejectAfter: boolean; mounts: { editable: unknown }[]; holds: "all" | "nothing" | "part"; calls: unknown[][]; selections: unknown[] } = { props: null, init: null, doc: null, refuse: false, rejectSet: false, rejectAfter: false, mounts: [], holds: "all", calls: [], selections: [] };
jest.mock("@apollohg/react-native-rich-text-editor", () => {
  const ReactActual = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    defineSchema: (s: unknown) => ({ nodes: [], spec: s }),
    defineAtomNode: (c: Record<string, unknown>) => ({ ...c, nodeSpec: { name: c.name } }),
    withAtomsSchema: (s: unknown) => s,
    withTablesSchema: (s: unknown) => s,
    createNativeEditorDocumentHandle: (config: { initialization: { json: unknown } }) => {
      if (mockEngine.refuse) throw new Error("invalid localJson initialization");
      mockEngine.init = JSON.parse(JSON.stringify(config.initialization.json));
      mockEngine.doc = null;
      return {
        destroy: () => undefined,
        bridge: {
          getState: () => ({ documentRevision: "7" }),
          // What B really holds after accepting the document (device,
          // 2026-11-13: a 900 KB note was accepted and shown EMPTY).
          getDocumentIsEmpty: () => mockEngine.holds === "nothing",
          addErrorListener: (fn: (e: unknown) => void) => {
            mockEngineErrors.listeners.push(fn);
            return () => void (mockEngineErrors.listeners = mockEngineErrors.listeners.filter((l) => l !== fn));
          },
          getDocumentJson: () =>
            mockEngine.holds === "all"
              ? JSON.parse(JSON.stringify(mockEngine.init))
              : mockEngine.holds === "part"
                ? { ...mockEngine.init, content: mockEngine.init.content.slice(0, 1) }
                : { type: "doc", content: [{ type: "paragraph" }] },
          setSelection: (req: any) => {
            mockEngine.selections.push(req);
            // B (Yrs) cannot hold "after" at the end of a block (device, 2026-11-14).
            if (mockEngine.rejectAfter && req.selection.anchor.affinity === "after") throw new Error("selection cannot be represented with the requested Yrs affinity");
          },
        },
      };
    },
    // The ref records every command the screen sends to the engine.
    RichTextEditor: ReactActual.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      mockEngine.props = props;
      // Each native view mounted, and whether it was editable from its first render.
      ReactActual.useEffect(() => void mockEngine.mounts.push({ editable: props.editable }), []);
      ReactActual.useImperativeHandle(ref, () =>
        new Proxy({}, {
          get: (_t: unknown, name: string) => (...args: unknown[]) => {
            if (name === "getContentJson") return JSON.parse(JSON.stringify(mockEngine.doc ?? mockEngine.init));
            mockEngine.calls.push([name, ...args]);
            // B validates a whole-document replace against its schema and throws.
            if (name === "setContentJson" && mockEngine.rejectSet) throw new Error("node 'taskItem' content [codeBlock] does not match its content expression");
            if (name === "setContentJson") mockEngine.doc = JSON.parse(JSON.stringify(args[0]));
            return Promise.resolve();
          },
        }),
      );
      return ReactActual.createElement(View, { testID: "engine-b" });
    }),
  };
});


const mockNav: { listener: ((e: any) => void) | null; dispatch: jest.Mock } = { listener: null, dispatch: jest.fn() };
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ spaceId: "3", nodeId: "9", title: "QA page" }),
  useNavigation: () => ({
    addListener: (_name: string, fn: (e: any) => void) => {
      mockNav.listener = fn;
      return () => undefined;
    },
    dispatch: mockNav.dispatch,
  }),
}));
const mockPage = {
  id: 9, spaceId: 3, parentId: null, title: "QA page", kind: "page", starred: false, childrenCount: 0, attachmentUrl: null, thumbnailUrl: null,
  mimeType: null, fileSize: null, durationSeconds: null, ownerName: null, updatedAt: "2026-11-21T10:00:00Z", createdAt: null, deletedAt: null,
  space: null, html: "<p>Hello</p>", ancestors: [],
};
const mockSave = jest.fn();
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: { ...jest.requireActual("@/api/pages").pagesApi, node: jest.fn(async () => mockPage), savePage: (...a: unknown[]) => mockSave(...a) },
}));

/* eslint-disable import/first */
import PageEdit from "../pages/edit";

function typed(text: string) {
  const doc = JSON.parse(JSON.stringify(mockEngine.init));
  const p = doc.content.find((n: { type: string }) => n.type === "paragraph");
  p.content = [...(p.content ?? []), { type: "text", text }];
  mockEngine.doc = doc;
  mockEngine.props!.onDocumentChange({});
}


it("a second save is not sent while the first is still on its way, and the last one sent is the newest", async () => {
  const pending: ((v: unknown) => void)[] = [];
  mockSave.mockImplementation((_s: number, _n: number, html: string) => new Promise((r) => pending.push(() => r({ ...mockPage, html }))));
  render(
    <QueryClientProvider client={testQueryClient()}>
      <PageEdit />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mockEngine.props).not.toBeNull());
  act(() => typed(" one"));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 1200)); // past the autosave delay
  });
  expect(mockSave).toHaveBeenCalledTimes(1);
  act(() => typed(" two"));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 1200));
  });
  // The first is still on its way: the second waits.
  expect(mockSave).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending[0]?.(undefined);
    await new Promise((r) => setTimeout(r, 50));
  });
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
  expect(String(mockSave.mock.calls[1][2])).toContain("two");
});
