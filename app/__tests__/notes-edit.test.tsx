/**
 * THE NOTE EDITOR SCREEN (phase 3), open → edit → save, at the level a person
 * meets it: the real screen, codec, glue, saver and notes API, a fake server
 * (MockAdapter), drafts in memory. Engine B is native, so it is replaced by a
 * stand-in that hands back JSON the way B does (onContentChangeJSON).
 *
 * What it proves:
 *  - an edit reaches the server as HTML the codec round-trips;
 *  - tables, code, comments and sub/sup are read-only atoms and go back
 *    byte for byte;
 *  - when B refuses the document, the read view shows and nothing is sent;
 *  - a change that cannot become valid HTML is never sent;
 *  - a web edit made meanwhile asks, and "Keep both" saves a copy.
 */
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { Alert } from "react-native";

const mockEngine: { props: Record<string, any> | null; init: any; refuse: boolean } = { props: null, init: null, refuse: false };
jest.mock("@apollohg/react-native-rich-text-editor", () => {
  const ReactActual = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    defineSchema: (s: unknown) => ({ nodes: [], spec: s }),
    defineAtomNode: (c: Record<string, unknown>) => ({ ...c, nodeSpec: { name: c.name } }),
    withAtomsSchema: (s: unknown) => s,
    createNativeEditorDocumentHandle: (config: { initialization: { json: unknown } }) => {
      if (mockEngine.refuse) throw new Error("invalid localJson initialization");
      mockEngine.init = JSON.parse(JSON.stringify(config.initialization.json));
      return { destroy: () => undefined };
    },
    RichTextEditor: (props: Record<string, unknown>) => {
      mockEngine.props = props;
      return ReactActual.createElement(View, { testID: "engine-b" });
    },
  };
});
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: "7" }),
}));
jest.mock("expo-image", () => {
  const { View } = jest.requireActual("react-native");
  const ReactActual = jest.requireActual("react");
  return { Image: (props: Record<string, unknown>) => ReactActual.createElement(View, props) };
});
jest.mock("@/stores/noteDrafts.files", () => {
  const { createNoteDrafts, memoryDraftStorage } = jest.requireActual("@/stores/noteDrafts.store");
  return { noteDrafts: createNoteDrafts(memoryDraftStorage()) };
});

/* eslint-disable import/first */
import NoteEditScreen from "../notes/edit";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { fromHTML, toHTML, type DocNode } from "@/vendor/tiptop-schema";
import { READ_ONLY_ATOM } from "@/screens/notes/editor/engineGlue";

const TABLE = '<table style="min-width: 50px"><colgroup><col><col></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>A</p></th><th colspan="1" rowspan="1"><p>B</p></th></tr></tbody></table>';
const CODE = '<pre><code class="language-ruby">def x\n  1\nend</code></pre>';
const CHEM = "<p>H<sub>2</sub>O</p>";
const COMMENT = '<p>see <span data-comment-id="c-1" class="comment">this</span></p>';
const STORED = `<p>hello</p>${TABLE}${CODE}${CHEM}${COMMENT}`;

const note = (over: Record<string, unknown> = {}) => ({
  id: 7, title: "Plan", description: STORED, data: {}, status: "published", pinned: false,
  created_at: "2026-11-01T10:00:00Z", deleted_at: null, updated_at: "2026-11-12T09:00:00Z",
  is_shared: false, role: "owner", shared_users: [], shared_count: 0, tags: [], ...over,
});

let mock: MockAdapter;
let server: Record<string, unknown>;

beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mockEngine.props = null;
  mockEngine.refuse = false;
  server = note();
  mock.onGet("/api/v1/note_app/notes/7").reply(() => [200, { note: server }]);
  mock.onPut("/api/v1/note_app/notes/7").reply((cfg) => {
    const body = JSON.parse(cfg.data);
    server = { ...server, title: body.title, description: body.description, updated_at: "2026-11-13T10:00:00Z" };
    return [200, { note: server }];
  });
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

const open = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <NoteEditScreen />
    </QueryClientProvider>,
  );

/** What B would hand back after the person typed `text` at the end of the first paragraph. */
function typed(text: string): DocNode {
  const doc = JSON.parse(JSON.stringify(mockEngine.init)) as DocNode;
  const p = doc.content!.find((n) => n.type === "paragraph")!;
  p.content = [...(p.content ?? []), { type: "text", text }];
  return doc;
}

it("open → edit → save: the server gets HTML the codec round-trips, read-only blocks byte for byte", async () => {
  open();
  await waitFor(() => expect(mockEngine.props).not.toBeNull());
  expect(mockEngine.init.content.map((n: DocNode) => n.type)).toEqual(["paragraph", READ_ONLY_ATOM, READ_ONLY_ATOM, READ_ONLY_ATOM, READ_ONLY_ATOM]);
  act(() => mockEngine.props!.onContentChangeJSON(typed(" world")));
  await waitFor(() => expect(mock.history.put).toHaveLength(1), { timeout: 2000 });
  const sent = JSON.parse(mock.history.put[0].data).description as string;
  expect(sent).toBe(`<p>hello world</p>${TABLE}${CODE}${CHEM}${COMMENT}`);
  // What the web loads from it and writes back is stable: a second load-and-save changes nothing.
  const once = toHTML(fromHTML(sent, { preserveUnknown: true }), { preserveUnknown: true });
  expect(toHTML(fromHTML(once, { preserveUnknown: true }), { preserveUnknown: true })).toBe(once);
  expect(once).toContain("<p>hello world</p>");
  expect(once).toContain("H<sub>2</sub>O");
  await waitFor(() => expect(screen.getByTestId("note-edit-state")).toHaveTextContent("Saved"));
  expect(screen.queryByTestId("note-edit-web")).toBeNull(); // owner, 2026-11-13: no web link in Notes
});

it("an untouched note is never written", async () => {
  open();
  await waitFor(() => expect(mockEngine.props).not.toBeNull());
  act(() => mockEngine.props!.onContentChangeJSON(JSON.parse(JSON.stringify(mockEngine.init))));
  await new Promise((r) => setTimeout(r, 700));
  expect(mock.history.put).toHaveLength(0);
});

it("when engine B refuses the note, the read view shows and nothing is sent", async () => {
  mockEngine.refuse = true;
  open();
  expect(await screen.findByTestId("note-edit-cannot-open")).toBeTruthy();
  expect(screen.getByText("hello")).toBeTruthy();
  expect(screen.queryByText(/web/i)).toBeNull();
  expect(mock.history.put).toHaveLength(0);
});

it("a change that cannot become valid HTML is never sent, and the screen says so", async () => {
  open();
  await waitFor(() => expect(mockEngine.props).not.toBeNull());
  const damaged = JSON.parse(JSON.stringify(mockEngine.init)) as DocNode;
  damaged.content![1].attrs = { kind: "table", node: "{broken" };
  act(() => mockEngine.props!.onContentChangeJSON(damaged));
  expect(await screen.findByTestId("note-edit-cannot-save")).toBeTruthy();
  expect(screen.queryByText(/web/i)).toBeNull();
  await new Promise((r) => setTimeout(r, 700));
  expect(mock.history.put).toHaveLength(0);
});

it("a web edit meanwhile asks; Keep both saves a dated copy and leaves the web's version", async () => {
  const alert = jest.spyOn(Alert, "alert");
  mock.onPost("/api/v1/note_app/notes").reply((cfg) => [200, { note: note({ id: 99, ...JSON.parse(cfg.data) }) }]);
  open();
  await waitFor(() => expect(mockEngine.props).not.toBeNull());
  server = note({ description: "<p>from the web</p>", updated_at: "2026-11-13T08:00:00Z" });
  act(() => mockEngine.props!.onContentChangeJSON(typed("!")));
  await waitFor(() => expect(alert).toHaveBeenCalled(), { timeout: 2000 });
  expect(mock.history.put).toHaveLength(0);
  const buttons = alert.mock.calls[0][2] as { text: string; onPress: () => Promise<void> }[];
  expect(buttons.map((b) => b.text)).toEqual(["Keep both", "Keep mine", "Keep the web's"]);
  await act(async () => {
    await buttons[0].onPress();
  });
  const copy = JSON.parse(mock.history.post[0].data);
  expect(copy.title).toMatch(/^Plan \(conflict \d+ \w+ \d\d:\d\d\)$/);
  expect(copy.description).toBe(`<p>hello!</p>${TABLE}${CODE}${CHEM}${COMMENT}`);
  expect(server.description).toBe("<p>from the web</p>");
});
