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
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { Alert, Share } from "react-native";

const mockEngine: { props: Record<string, any> | null; init: any; refuse: boolean; calls: unknown[][] } = { props: null, init: null, refuse: false, calls: [] };
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
    // The ref records every command the screen sends to the engine.
    RichTextEditor: ReactActual.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      mockEngine.props = props;
      ReactActual.useImperativeHandle(ref, () =>
        new Proxy({}, { get: (_t: unknown, name: string) => (...args: unknown[]) => { mockEngine.calls.push([name, ...args]); return Promise.resolve(); } }),
      );
      return ReactActual.createElement(View, { testID: "engine-b" });
    }),
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
  mockEngine.calls = [];
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
  expect(mockEngine.init.content.map((n: DocNode) => n.type)).toEqual(["paragraph", READ_ONLY_ATOM, "codeBlock", "paragraph", "paragraph"]);
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

describe("our toolbar (owner, 2026-11-13: full editing from a bar on the keyboard)", () => {
  it("replaces the engine's own toolbar and sits under the body", async () => {
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    expect(mockEngine.props!.showToolbar).toBe(false);
    expect(screen.getByTestId("note-toolbar")).toBeTruthy();
    expect(screen.getByTestId("tb-undo")).toBeTruthy();
  });

  it("follows the engine's selection: a selection shows the marks, an active mark is selected", async () => {
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    act(() => {
      mockEngine.props!.onSelectionChange({ type: "text", anchor: 2, head: 6 });
      mockEngine.props!.onActiveStateChange({ marks: { bold: true }, markAttrs: {}, nodes: { paragraph: true }, commands: {}, allowedMarks: [], insertableNodes: [] });
    });
    expect(screen.getByTestId("tb-bold").props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByTestId("tb-italic"));
    expect(mockEngine.calls).toContainEqual(["toggleMark", "italic"]);
  });

  it("undo follows the engine's history and runs the engine's undo", async () => {
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    expect(screen.getByTestId("tb-undo").props.accessibilityState).toMatchObject({ disabled: true });
    act(() => mockEngine.props!.onHistoryStateChange({ canUndo: true, canRedo: false }));
    fireEvent.press(screen.getByTestId("tb-undo"));
    expect(mockEngine.calls).toContainEqual(["undo"]);
  });

  it("A (dimmed until the caret is in the body) opens the Format panel; a colour from it is the web's colour string", async () => {
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    act(() => mockEngine.props!.onFocus());
    fireEvent.press(screen.getByTestId("tb-format"));
    expect(screen.getByTestId("tb-align:center")).toBeTruthy();
    fireEvent.press(screen.getByTestId("tb-textColor"));
    fireEvent.press(screen.getByTestId("tb-textColor:blue"));
    expect(mockEngine.calls).toContainEqual(["setMark", "fgColor", { color: "hsl(202, 64%, 52%)" }]);
  });

  it("Link asks for the address and sets it", async () => {
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    act(() => mockEngine.props!.onSelectionChange({ type: "text", anchor: 0, head: 5 }));
    fireEvent.press(screen.getByTestId("tb-link"));
    fireEvent.changeText(screen.getByTestId("note-link-input"), "https://example.com");
    fireEvent.press(screen.getByTestId("note-link-save"));
    expect(mockEngine.calls).toContainEqual(["setLink", "https://example.com"]);
  });
});

describe("code blocks are edited on the phone (owner, 2026-11-13)", () => {
  const lastSetJson = () => {
    const call = [...mockEngine.calls].reverse().find((c) => c[0] === "setContentJson");
    return call?.[1] as DocNode | undefined;
  };

  it("the code block reaches the engine as an editable block, with its language", async () => {
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    const block = mockEngine.init.content.find((n: DocNode) => n.type === "codeBlock");
    expect(block.attrs.language).toBe("ruby");
  });

  it("a paragraph becomes a code block from the toolbar, and back", async () => {
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    act(() => {
      mockEngine.props!.onSelectionChange({ type: "text", anchor: 3, head: 3 }); // in "hello"
      mockEngine.props!.onFocus();
    });
    fireEvent.press(screen.getByTestId("tb-format"));
    fireEvent.press(screen.getByTestId("tb-block:codeBlock"));
    expect(lastSetJson()!.content![0]).toEqual({ type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "hello" }] });
    act(() => {
      mockEngine.props!.onContentChangeJSON(lastSetJson());
      mockEngine.props!.onActiveStateChange({ marks: {}, markAttrs: {}, nodes: { codeBlock: true }, commands: {}, allowedMarks: [], insertableNodes: [] });
    });
    fireEvent.press(screen.getByTestId("tb-block:paragraph"));
    expect(lastSetJson()!.content![0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "hello" }] });
  });

  it("the language chip opens a searchable sheet; picking a language sets it", async () => {
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    const codeAt = (() => {
      // the position inside the code block: after the paragraph and the table atom
      const doc = mockEngine.init as DocNode;
      const { nodeSize } = jest.requireActual("@/screens/notes/editor/blockEdits");
      return nodeSize(doc.content![0]) + nodeSize(doc.content![1]) + 2;
    })();
    act(() => {
      mockEngine.props!.onSelectionChange({ type: "text", anchor: codeAt, head: codeAt });
      mockEngine.props!.onActiveStateChange({ marks: {}, markAttrs: {}, nodes: { codeBlock: true }, commands: {}, allowedMarks: [], insertableNodes: [] });
    });
    expect(screen.getByTestId("tb-codeLanguage")).toHaveTextContent("Ruby");
    fireEvent.press(screen.getByTestId("tb-codeLanguage"));
    fireEvent.changeText(screen.getByTestId("note-code-language-search"), "pyth");
    fireEvent.press(screen.getByTestId("note-code-language-python"));
    const block = lastSetJson()!.content!.find((n) => n.type === "codeBlock")!;
    expect(block.attrs).toMatchObject({ language: "python" });
  });

  it("the code block's sheet deletes the block", async () => {
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    const doc = mockEngine.init as DocNode;
    const { nodeSize } = jest.requireActual("@/screens/notes/editor/blockEdits");
    const codeAt = nodeSize(doc.content![0]) + nodeSize(doc.content![1]) + 2;
    act(() => {
      mockEngine.props!.onSelectionChange({ type: "text", anchor: codeAt, head: codeAt });
      mockEngine.props!.onActiveStateChange({ marks: {}, markAttrs: {}, nodes: { codeBlock: true }, commands: {}, allowedMarks: [], insertableNodes: [] });
    });
    fireEvent.press(screen.getByTestId("tb-codeLanguage"));
    fireEvent.press(screen.getByTestId("note-code-delete"));
    expect(lastSetJson()!.content!.some((n) => n.type === "codeBlock")).toBe(false);
  });

  it("autocorrect and capitalisation are off while the caret is in code", async () => {
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    expect(mockEngine.props!.autoCorrect).toBe(true);
    act(() => mockEngine.props!.onActiveStateChange({ marks: {}, markAttrs: {}, nodes: { codeBlock: true }, commands: {}, allowedMarks: [], insertableNodes: [] }));
    expect(mockEngine.props!.autoCorrect).toBe(false);
    expect(mockEngine.props!.autoCapitalize).toBe("none");
  });
});

describe("the note screen in Keep's style (owner, 2026-11-13)", () => {
  const mockRouter = (jest.requireMock("expo-router") as { router: Record<string, jest.Mock> }).router;
  // The page colour in whichever theme the test renders in.
  const fills = (key: string) => {
    const { noteColor } = jest.requireActual("@/screens/notes/editor/noteColors");
    return [noteColor(key, "dark").fill, noteColor(key, "light").fill];
  };
  const pageColor = () => (screen.getByTestId("note-edit-page").props.style as { backgroundColor: string }).backgroundColor;
  beforeEach(() => {
    mockRouter.back.mockClear();
    mockRouter.replace.mockClear();
  });

  it("the page takes the note's colour, and the title is large and light", async () => {
    server = note({ color: "orange" });
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    expect(fills("orange")).toContain(pageColor());
    expect(screen.getByTestId("note-edit-title")).toHaveStyle({ fontSize: 28, fontWeight: "400" });
  });

  it("the pin in the header pins the note on the server", async () => {
    mock.onPut("/api/v1/note_app/notes/7").reply((cfg) => {
      server = { ...server, ...JSON.parse(cfg.data) };
      return [200, { note: server }];
    });
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    fireEvent.press(screen.getByTestId("note-edit-pin"));
    await waitFor(() => expect(mock.history.put.some((r) => JSON.parse(r.data).pinned === true)).toBe(true));
    await waitFor(() => expect(screen.getByTestId("note-edit-pin").props.accessibilityState).toMatchObject({ selected: true }));
  });

  it("the palette colours the note on the server and the page follows", async () => {
    mock.onPut("/api/v1/note_app/notes/7").reply((cfg) => {
      server = { ...server, ...JSON.parse(cfg.data) };
      return [200, { note: server }];
    });
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    fireEvent.press(screen.getByTestId("tb-noteColor"));
    fireEvent.press(screen.getByTestId("note-color-teal"));
    await waitFor(() => expect(mock.history.put.some((r) => JSON.parse(r.data).color === "teal")).toBe(true));
    await waitFor(() => expect(fills("teal")).toContain(pageColor()));
  });

  it("⋮ opens a sheet that says when the note was edited", async () => {
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    fireEvent.press(screen.getByTestId("tb-more"));
    expect(screen.getByTestId("note-more-edited")).toHaveTextContent(/^Edited /);
  });

  it("⋮ Delete moves the note to the trash after a confirm, and leaves the note", async () => {
    mock.onDelete("/api/v1/note_app/notes/7").reply(200, {});
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    fireEvent.press(screen.getByTestId("tb-more"));
    fireEvent.press(screen.getByTestId("note-more-delete"));
    fireEvent.press(screen.getByTestId("note-more-delete-confirm"));
    await waitFor(() => expect(mock.history.delete).toHaveLength(1));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });

  it("⋮ Make a copy asks the server for its copy and opens it", async () => {
    mock.onPost("/api/v1/note_app/notes/7/duplicate").reply(201, { note: note({ id: 70, title: "Plan (copy)" }) });
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    fireEvent.press(screen.getByTestId("tb-more"));
    fireEvent.press(screen.getByTestId("note-more-copy"));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: "/notes/edit", params: { id: "70" } }));
  });

  it("⋮ Send shares the note as plain text (title, then the body's lines)", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    fireEvent.press(screen.getByTestId("tb-more"));
    fireEvent.press(screen.getByTestId("note-more-send"));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const message = (share.mock.calls[0][0] as { message: string }).message;
    expect(message.startsWith("Plan\n\nhello")).toBe(true);
    expect(message).not.toMatch(/</);
  });
});

describe("⋮ Labels (the web's note tags)", () => {
  const tag = (id: number, name: string) => ({ id, name, color: "no_color", created_at: "2026-11-01T10:00:00Z", parent_id: null, position: id, description: null });
  beforeEach(() => {
    mock.onGet("/api/v1/note_app/tags").reply(200, { tags: [tag(3, "dev-stuff"), tag(4, "home")], meta: { pagy: { page: 1, pages: 1 } } });
  });

  it("lists the labels with the note's ones checked, and toggles one on the server", async () => {
    server = note({ tags: [tag(4, "home")] });
    mock.onPut("/api/v1/note_app/notes/7/toggle_tag").reply(200, { note: note({ tags: [tag(4, "home"), tag(3, "dev-stuff")] }) });
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    fireEvent.press(screen.getByTestId("tb-more"));
    fireEvent.press(screen.getByTestId("note-more-labels"));
    expect((await screen.findByTestId("note-label-4")).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByTestId("note-label-3").props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(screen.getByTestId("note-label-3"));
    await waitFor(() => expect(JSON.parse(mock.history.put.find((r) => r.url?.endsWith("toggle_tag"))!.data)).toEqual({ tag_id: 3 }));
    await waitFor(() => expect(screen.getByTestId("note-label-3").props.accessibilityState).toMatchObject({ checked: true }));
  });

  it("typing a new name offers to create it on the note", async () => {
    mock.onPost("/api/v1/note_app/notes/7/create_and_assign_tag").reply(200, { note: note({ tags: [tag(9, "trip")] }) });
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    fireEvent.press(screen.getByTestId("tb-more"));
    fireEvent.press(screen.getByTestId("note-more-labels"));
    fireEvent.changeText(await screen.findByTestId("note-labels-search"), "trip");
    fireEvent.press(screen.getByTestId("note-labels-create"));
    await waitFor(() => expect(JSON.parse(mock.history.post[0].data)).toEqual({ name: "trip" }));
  });
});

describe("archive from the note (the header pill)", () => {
  it("archives the note and goes back to the grid", async () => {
    mock.onPut("/api/v1/note_app/notes/7/archive").reply(200, { note: note({ status: "archived" }) });
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    fireEvent.press(screen.getByTestId("note-edit-archive"));
    await waitFor(() => expect(mock.history.put.some((r) => r.url === "/api/v1/note_app/notes/7/archive")).toBe(true));
    const router = (jest.requireMock("expo-router") as { router: Record<string, jest.Mock> }).router;
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });
});

describe("reminders (Keep's bell; local notifications, Hello 2026-11-13)", () => {
  const resync = jest.fn(async () => undefined);
  // In beforeEach: the file's afterEach restores every spy.
  beforeEach(() => {
    resync.mockClear();
    jest.spyOn(jest.requireActual("@/screens/notes/reminderNotifications"), "resyncReminders").mockImplementation(resync);
    jest.spyOn(jest.requireActual("@/screens/notes/reminderNotifications"), "ensureReminderPermission").mockResolvedValue(true);
  });

  it("the bell opens the reminder sheet; Tomorrow + repeat weekly saves to the server and reschedules", async () => {
    mock.onPut("/api/v1/note_app/notes/7").reply((cfg) => {
      const body = JSON.parse(cfg.data);
      server = { ...server, data: { launch_time: body.launch_time, repeat_frequency: body.repeat_frequency } };
      return [200, { note: server }];
    });
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    fireEvent.press(screen.getByTestId("note-edit-reminder"));
    fireEvent.press(await screen.findByTestId("reminder-quick-tomorrow"));
    fireEvent.press(screen.getByTestId("reminder-repeat-weekly"));
    fireEvent.press(screen.getByTestId("reminder-save"));
    await waitFor(() => expect(mock.history.put.some((r) => JSON.parse(r.data).repeat_frequency === "weekly")).toBe(true));
    const body = JSON.parse(mock.history.put.find((r) => JSON.parse(r.data).launch_time)!.data);
    const at = new Date(body.launch_time);
    expect(at.getHours()).toBe(8);
    await waitFor(() => expect(resync).toHaveBeenCalled());
    expect(await screen.findByTestId("note-edit-reminder-chip")).toBeTruthy();
  });

  it("an existing reminder can be removed", async () => {
    server = note({ data: { launch_time: "2030-01-01T08:00:00Z", repeat_frequency: "daily" } });
    mock.onPut("/api/v1/note_app/notes/7").reply((cfg) => [200, { note: { ...server, data: {} , ...JSON.parse(cfg.data) } }]);
    open();
    await waitFor(() => expect(mockEngine.props).not.toBeNull());
    expect(screen.getByTestId("note-edit-reminder").props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByTestId("note-edit-reminder"));
    fireEvent.press(await screen.findByTestId("reminder-remove"));
    await waitFor(() => expect(mock.history.put.some((r) => JSON.parse(r.data).launch_time === "")).toBe(true));
    await waitFor(() => expect(resync).toHaveBeenCalled());
  });
});
