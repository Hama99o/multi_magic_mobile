/**
 * THE PAGE EDITOR'S TOOLBAR STAYS ABOVE THE KEYBOARD (Pages M7/M8).
 *
 * Measured 2026-11-21 on qa_phone (flow 36): with text selected and the
 * keyboard up, the toolbar (`tb-link`) was not on screen. The note editor is
 * `<Screen avoidKeyboard>` (app/notes/edit.tsx); the page editor was not, so
 * nothing lifted its toolbar over the keyboard. This pins the lift between
 * the toolbar and the screen: KeyboardPadding (Android) or
 * KeyboardAvoidingView (iOS), whichever ScreenContainer chooses.
 */
import { render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { KeyboardAvoidingView } from "react-native";
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

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ spaceId: "3", nodeId: "9", title: "QA page" }),
  useNavigation: () => ({ addListener: () => () => undefined }),
}));
const mockPage = {
  id: 9, spaceId: 3, parentId: null, title: "QA page", kind: "page", starred: false, childrenCount: 0, attachmentUrl: null, thumbnailUrl: null,
  mimeType: null, fileSize: null, durationSeconds: null, ownerName: null, updatedAt: "2026-11-21T10:00:00Z", createdAt: null, deletedAt: null,
  space: null, html: "<p>Hello</p>", ancestors: [],
};
jest.mock("@/api/pages", () => ({
  ...jest.requireActual("@/api/pages"),
  pagesApi: { ...jest.requireActual("@/api/pages").pagesApi, node: jest.fn(async () => mockPage), savePage: jest.fn(async () => mockPage) },
}));

/* eslint-disable import/first */
import PageEdit from "../pages/edit";
import { KeyboardPadding } from "@/components/KeyboardPadding";

it("the toolbar has a keyboard lift between it and the screen", async () => {
  render(
    <QueryClientProvider client={testQueryClient()}>
      <PageEdit />
    </QueryClientProvider>,
  );
  const toolbar = await screen.findByTestId("note-toolbar");
  await waitFor(() => expect(mockEngine.props).not.toBeNull());
  let lifted = false;
  for (let node = toolbar.parent; node; node = node.parent) {
    if (node.type === KeyboardPadding || node.type === KeyboardAvoidingView) lifted = true;
  }
  expect(lifted).toBe(true);
});
