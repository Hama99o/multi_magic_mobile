/**
 * The rich-text editor for a server field the web writes as Tiptap HTML
 * (owner, 2026-11-15: "no edit-on-web, everything editable on mobile").
 * First user: a contact's notes. Same codec and engine as Notes, so the
 * formatting round-trips exactly; same guards, so a field B cannot hold opens
 * read-only and nothing is handed back. Invented values only.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockEngine: { init: any; doc: any; refuse: boolean; holds: "all" | "nothing" } = { init: null, doc: null, refuse: false, holds: "all" };
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
      return {
        destroy: () => undefined,
        bridge: {
          getDocumentIsEmpty: () => mockEngine.holds === "nothing",
          getDocumentJson: () => (mockEngine.holds === "all" ? mockEngine.init : { type: "doc", content: [{ type: "paragraph" }] }),
          addErrorListener: () => () => undefined,
        },
      };
    },
    RichTextEditor: ReactActual.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      ReactActual.useImperativeHandle(ref, () => ({
        getContentJson: () => JSON.parse(JSON.stringify(mockEngine.doc ?? mockEngine.init)),
        blur: () => undefined,
      }));
      return ReactActual.createElement(View, { testID: "engine-b", accessibilityState: { busy: props.showToolbar !== true } });
    }),
  };
});
const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
jest.mock("expo-router", () => ({
  router: { back: (...a: unknown[]) => mockRouter.back(...a), push: (...a: unknown[]) => mockRouter.push(...a), replace: (...a: unknown[]) => mockRouter.replace(...a) },
  useLocalSearchParams: () => ({}),
}));

/* eslint-disable import/first */
import RichTextScreen from "../rich-text";
import { useRichTextSession } from "@/stores/richTextSession.store";
import { EDIT_SIZE_LIMIT } from "@/screens/notes/editor/editSession";

beforeEach(() => {
  mockEngine.init = null;
  mockEngine.doc = null;
  mockEngine.refuse = false;
  mockEngine.holds = "all";
  mockRouter.back.mockClear();
  useRichTextSession.getState().clear();
});

const start = (html: string) => {
  const onDone = jest.fn();
  useRichTextSession.getState().start({ html, title: "Notes", onDone });
  render(<RichTextScreen />);
  return onDone;
};

it("opens the field's HTML in engine B with its own toolbar, through the Notes codec", async () => {
  start("<p>Door code is on the <strong>fridge</strong></p>");
  await screen.findByTestId("engine-b");
  expect(screen.getByTestId("engine-b").props.accessibilityState.busy).toBe(false); // showToolbar
  expect(JSON.stringify(mockEngine.init)).toContain("fridge");
});

it("Done hands back the web's HTML of what B holds, then closes", async () => {
  const onDone = start("<p>Door code is on the fridge</p>");
  await screen.findByTestId("engine-b");
  mockEngine.doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Water the plants", marks: [{ type: "bold" }] }] }] };
  fireEvent.press(screen.getByTestId("rich-text-done"));
  await waitFor(() => expect(onDone).toHaveBeenCalledWith("<p><strong>Water the plants</strong></p>"));
  expect(mockRouter.back).toHaveBeenCalled();
  expect(useRichTextSession.getState().session).toBeNull();
});

it("Cancel hands nothing back", async () => {
  const onDone = start("<p>Door code is on the fridge</p>");
  await screen.findByTestId("engine-b");
  fireEvent.press(screen.getByTestId("rich-text-cancel"));
  expect(onDone).not.toHaveBeenCalled();
  expect(mockRouter.back).toHaveBeenCalled();
});

it("a field B refuses opens read-only with a code, and nothing can be handed back", async () => {
  mockEngine.refuse = true;
  const onDone = start("<p>Door code is on the fridge</p>");
  expect(await screen.findByTestId("rich-text-cannot-open")).toHaveTextContent(/NE-CREATE/);
  expect(screen.getByText("Door code is on the fridge")).toBeTruthy();
  expect(screen.queryByTestId("rich-text-done")).toBeNull();
  expect(onDone).not.toHaveBeenCalled();
});

it("a field over the edit limit opens read-only (no engine)", async () => {
  const block = `<p>${"river lantern copper meadow ".repeat(40)}</p>`;
  start(block.repeat(Math.ceil((EDIT_SIZE_LIMIT + 2048) / block.length)));
  expect(await screen.findByTestId("rich-text-cannot-open")).toHaveTextContent(/too long/i);
  expect(screen.queryByTestId("engine-b")).toBeNull();
  expect(mockEngine.init).toBeNull();
});

it("with no session (a stale route) it just goes back", async () => {
  render(<RichTextScreen />);
  await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
});
