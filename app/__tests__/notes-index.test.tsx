/**
 * THE NOTES GRID (owner, 2026-11-13: "Google Keep's UX"; layout from his Keep
 * screenshots, not stored). At the level a person meets it: the real screen
 * and notes API against a fake server (MockAdapter). Seeded, invented notes
 * only — never real content.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

/* eslint-disable import/first */
import NotesScreen from "../notes/index";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useAuthStore } from "@/stores/auth.store";
import { useNotesView } from "@/stores/notesView.store";

const note = (id: number, over: Record<string, unknown> = {}) => ({
  id, title: `Seeded ${id}`, description: `<p>line one of ${id}</p><p>line two</p>`, data: {}, status: "published",
  pinned: false, created_at: "2026-11-01T10:00:00Z", deleted_at: null, updated_at: "2026-11-12T09:00:00Z",
  is_shared: false, role: "owner", shared_users: [], shared_count: 0, tags: [], color: null, ...over,
});

let mock: MockAdapter;
let server: ReturnType<typeof note>[];

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mockPush.mockClear();
  await AsyncStorage.clear();
  useNotesView.setState({ layout: "grid", userId: null });
  useAuthStore.setState({ user: { id: 1, email: "qa@example.com", fullName: "QA" } as never });
  server = [
    note(1, { pinned: true, title: "Pinned seed", color: "orange" }),
    note(2, { tags: [{ id: 3, name: "dev-stuff", color: "teal" }] }),
    note(3),
    note(4, { description: '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>buy milk</p></div></li></ul>' }),
  ];
  mock.onGet("/api/v1/note_app/notes").reply((cfg) => {
    const q = (cfg.params?.search as string | undefined)?.toLowerCase();
    const rows = q ? server.filter((n) => n.title.toLowerCase().includes(q)) : server;
    return [200, { notes: rows, meta: { pagy: { page: 1, pages: 1 }, total_count: rows.length } }];
  });
});
afterEach(() => mock.restore());

const open = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <NotesScreen />
    </QueryClientProvider>,
  );

it("is a 2-column grid by default, Pinned first then Others", async () => {
  open();
  await screen.findByText("Pinned seed");
  expect(screen.getByTestId("notes-grid-pinned-col-0")).toBeTruthy();
  expect(screen.getByTestId("notes-grid-others-col-1")).toBeTruthy();
  expect(screen.getByText("Pinned")).toBeTruthy();
  expect(screen.getByText("Others")).toBeTruthy();
});

it("a card shows the title, several preview lines, the labels, and fills with the note's colour", async () => {
  open();
  const card = await screen.findByTestId("note-card-2");
  expect(within(card).getByText("Seeded 2")).toBeTruthy();
  expect(within(card).getByText("line one of 2\nline two")).toBeTruthy();
  expect(within(card).getByText("dev-stuff")).toBeTruthy();
  expect(screen.getByTestId("note-card-1").props.style).toEqual(expect.objectContaining({ borderWidth: 1 }));
  const orange = screen.getByTestId("note-card-1");
  expect(orange).not.toHaveStyle({ backgroundColor: "transparent" });
  expect(within(screen.getByTestId("note-card-4")).getByText("☐ buy milk")).toBeTruthy();
});

it("the layout key switches to one column, and the choice is kept", async () => {
  open();
  await screen.findByText("Pinned seed");
  fireEvent.press(screen.getByTestId("notes-layout-toggle"));
  expect(screen.queryByTestId("notes-grid-others-col-1")).toBeNull();
  expect(screen.getByTestId("notes-grid-others-col-0")).toBeTruthy();
  await waitFor(async () => expect(await AsyncStorage.getItem("mm-notes-layout:1")).toBe("list"));
});

it("search asks the server, after a pause, and says when nothing matches", async () => {
  open();
  await screen.findByText("Pinned seed");
  fireEvent.changeText(screen.getByTestId("notes-search"), "zzz");
  await waitFor(() => expect(mock.history.get.some((r) => r.params?.search === "zzz")).toBe(true), { timeout: 2000 });
  expect(await screen.findByTestId("notes-search-empty")).toBeTruthy();
});

it("a tap opens the note", async () => {
  open();
  fireEvent.press(await screen.findByTestId("note-card-3"));
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: { id: "3" } }));
});

describe("multi-select (long-press)", () => {
  it("long-press selects; the bar counts and can pin the selection", async () => {
    mock.onPut(/\/api\/v1\/note_app\/notes\/\d+/).reply((cfg) => {
      const id = Number(cfg.url!.split("/").pop());
      const body = JSON.parse(cfg.data);
      server = server.map((n) => (n.id === id ? { ...n, ...body } : n));
      return [200, { note: server.find((n) => n.id === id) }];
    });
    open();
    fireEvent(await screen.findByTestId("note-card-2"), "longPress");
    fireEvent.press(screen.getByTestId("note-card-3"));
    expect(screen.getByTestId("notes-selection-count")).toHaveTextContent("2 selected");
    fireEvent.press(screen.getByTestId("notes-selection-pin"));
    await waitFor(() => expect(mock.history.put).toHaveLength(2));
    expect(mock.history.put.map((r) => JSON.parse(r.data))).toEqual([{ pinned: true }, { pinned: true }]);
  });

  it("colours the selection with one of the web's ten colours", async () => {
    mock.onPut(/\/api\/v1\/note_app\/notes\/\d+/).reply((cfg) => [200, { note: note(Number(cfg.url!.split("/").pop()), JSON.parse(cfg.data)) }]);
    open();
    fireEvent(await screen.findByTestId("note-card-2"), "longPress");
    fireEvent.press(screen.getByTestId("notes-selection-color"));
    fireEvent.press(screen.getByTestId("note-color-teal"));
    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ color: "teal" });
  });

  it("deletes the selection to the trash, after a confirm", async () => {
    mock.onDelete(/\/api\/v1\/note_app\/notes\/\d+/).reply(200, {});
    open();
    fireEvent(await screen.findByTestId("note-card-3"), "longPress");
    fireEvent.press(screen.getByTestId("notes-selection-delete"));
    fireEvent.press(screen.getByTestId("notes-delete-confirm"));
    await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toEqual(["/api/v1/note_app/notes/3"]));
  });

  it("the close key leaves selection", async () => {
    open();
    fireEvent(await screen.findByTestId("note-card-3"), "longPress");
    fireEvent.press(screen.getByTestId("notes-selection-close"));
    expect(screen.queryByTestId("notes-selection-count")).toBeNull();
  });
});

describe("creating (the bottom bar)", () => {
  beforeEach(() => {
    mock.onPost("/api/v1/note_app/notes").reply((cfg) => [200, { note: note(99, JSON.parse(cfg.data)) }]);
  });

  it("+ creates an empty note and opens it in the editor", async () => {
    open();
    await screen.findByText("Pinned seed");
    await act(async () => fireEvent.press(screen.getByTestId("notes-new")));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ title: "", description: "" });
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/notes/edit", params: { id: "99" } });
  });

  it("the checklist key creates a note that starts with one to-do, as the web writes it", async () => {
    open();
    await screen.findByText("Pinned seed");
    await act(async () => fireEvent.press(screen.getByTestId("notes-new-checklist")));
    expect(JSON.parse(mock.history.post[0].data).description).toBe(
      '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p></p></div></li></ul>',
    );
  });
});

it("an empty account says so in one line", async () => {
  server = [];
  open();
  expect(await screen.findByTestId("notes-empty")).toBeTruthy();
});

describe("the drawer and labels (the web's note tags)", () => {
  const tag = (id: number, name: string) => ({ id, name, color: "no_color", created_at: "2026-11-01T10:00:00Z", parent_id: null, position: id, description: null });
  let tags: ReturnType<typeof tag>[];
  beforeEach(() => {
    tags = [tag(3, "dev-stuff"), tag(4, "home")];
    mock.onGet("/api/v1/note_app/tags").reply(() => [200, { tags, meta: { pagy: { page: 1, pages: 1 } } }]);
  });

  it("☰ opens the drawer: Notes (current), then every label", async () => {
    open();
    await screen.findByText("Pinned seed");
    fireEvent.press(screen.getByTestId("notes-menu"));
    expect(await screen.findByTestId("drawer-label-3")).toHaveTextContent("dev-stuff");
    expect(screen.getByTestId("drawer-notes").props.accessibilityState).toMatchObject({ selected: true });
  });

  // Demo video, 2026-11-14: the first open of the drawer showed "LABELS" with
  // no label for half a second (fetched only when it opened). The labels are
  // fetched with the grid, so they are there the moment it opens.
  it("the labels are there the moment the drawer opens (fetched with the grid)", async () => {
    open();
    await screen.findByText("Pinned seed");
    await waitFor(() => expect(mock.history.get.some((c) => c.url === "/api/v1/note_app/tags")).toBe(true));
    await act(async () => undefined);
    fireEvent.press(screen.getByTestId("notes-menu"));
    expect(screen.getByTestId("drawer-label-3")).toHaveTextContent("dev-stuff");
  });

  it("a label filters the grid with the server's tag filter, and can be cleared", async () => {
    open();
    await screen.findByText("Pinned seed");
    fireEvent.press(screen.getByTestId("notes-menu"));
    fireEvent.press(await screen.findByTestId("drawer-label-3"));
    await waitFor(() => expect(mock.history.get.some((r) => r.url === "/api/v1/note_app/notes" && r.params?.tag_id === 3)).toBe(true));
    expect(screen.getByTestId("notes-label-filter")).toHaveTextContent("dev-stuff");
    fireEvent.press(screen.getByTestId("notes-label-filter-clear"));
    expect(screen.queryByTestId("notes-label-filter")).toBeNull();
  });

  it("Edit labels creates, renames and deletes labels in the web's store", async () => {
    mock.onPost("/api/v1/note_app/tags").reply((cfg) => {
      const made = tag(9, JSON.parse(cfg.data).tag.name);
      tags = [...tags, made];
      return [200, { tag: made }];
    });
    mock.onPut("/api/v1/note_app/tags/4").reply((cfg) => [200, { tag: tag(4, JSON.parse(cfg.data).tag.name) }]);
    mock.onDelete("/api/v1/note_app/tags/3").reply(200, {});
    open();
    await screen.findByText("Pinned seed");
    fireEvent.press(screen.getByTestId("notes-menu"));
    fireEvent.press(await screen.findByTestId("drawer-edit-labels"));
    // Above the keyboard, like every notes sheet with a field (device, 2026-11-13).
    const field = await screen.findByTestId("labels-new");
    let lifted = false;
    for (let node = field.parent; node && !lifted; node = node.parent) {
      lifted = node.children.some((c) => typeof c !== "string" && c.props.testID === "keyboard-padding");
      if ("onRequestClose" in node.props && "transparent" in node.props) break;
    }
    expect(lifted).toBe(true);
    fireEvent.changeText(field, "ideas");
    fireEvent.press(screen.getByTestId("labels-create"));
    await waitFor(() => expect(JSON.parse(mock.history.post[0].data)).toEqual({ tag: { name: "ideas" } }));
    fireEvent.changeText(screen.getByTestId("labels-name-4"), "house");
    fireEvent(screen.getByTestId("labels-name-4"), "submitEditing");
    await waitFor(() => expect(JSON.parse(mock.history.put[0].data)).toEqual({ tag: { name: "house" } }));
    fireEvent.press(screen.getByTestId("labels-delete-3"));
    fireEvent.press(await screen.findByTestId("labels-delete-confirm"));
    await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toEqual(["/api/v1/note_app/tags/3"]));
  });
});

describe("Archive and Trash (drawer)", () => {
  beforeEach(() => {
    mock.onGet("/api/v1/note_app/tags").reply(200, { tags: [], meta: { pagy: { page: 1, pages: 1 } } });
    mock.onGet("/api/v1/note_app/notes/archives").reply(200, { notes: [note(20, { title: "Archived seed", status: "archived" })], meta: { pagy: { page: 1, pages: 1 }, total_count: 1 } });
    mock.onGet("/api/v1/note_app/notes/trashes").reply(200, { notes: [note(30, { title: "Trashed seed", status: "trashed" })], meta: { pagy: { page: 1, pages: 1 }, total_count: 1 } });
  });

  const go = async (testID: string) => {
    open();
    await screen.findByText("Pinned seed");
    fireEvent.press(screen.getByTestId("notes-menu"));
    fireEvent.press(await screen.findByTestId(testID));
  };

  it("Archive lists archived notes; selecting one can unarchive it", async () => {
    mock.onPut("/api/v1/note_app/notes/20/unarchive").reply(200, { note: note(20) });
    await go("drawer-archive");
    expect(await screen.findByText("Archived seed")).toBeTruthy();
    expect(screen.getByTestId("notes-view-title")).toHaveTextContent("Archive");
    fireEvent(screen.getByTestId("note-card-20"), "longPress");
    fireEvent.press(screen.getByTestId("notes-selection-unarchive"));
    await waitFor(() => expect(mock.history.put.map((r) => r.url)).toEqual(["/api/v1/note_app/notes/20/unarchive"]));
  });

  it("Trash lists trashed notes; restore, or delete forever after a confirm", async () => {
    mock.onPut("/api/v1/note_app/notes/30/restore").reply(200, note(30));
    mock.onDelete("/api/v1/note_app/notes/30/destroy_permanently").reply(200, {});
    await go("drawer-trash");
    expect(await screen.findByText("Trashed seed")).toBeTruthy();
    fireEvent(screen.getByTestId("note-card-30"), "longPress");
    fireEvent.press(screen.getByTestId("notes-selection-restore"));
    await waitFor(() => expect(mock.history.put.map((r) => r.url)).toEqual(["/api/v1/note_app/notes/30/restore"]));
    fireEvent(screen.getByTestId("note-card-30"), "longPress");
    fireEvent.press(screen.getByTestId("notes-selection-forever"));
    fireEvent.press(await screen.findByTestId("notes-forever-confirm"));
    await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toEqual(["/api/v1/note_app/notes/30/destroy_permanently"]));
  });

  it("no new-note bar in Archive or Trash", async () => {
    await go("drawer-trash");
    await screen.findByText("Trashed seed");
    expect(screen.queryByTestId("notes-new")).toBeNull();
  });
});

describe("selection on the main grid can archive", () => {
  it("archives the selection", async () => {
    mock.onPut("/api/v1/note_app/notes/3/archive").reply(200, { note: note(3, { status: "archived" }) });
    open();
    fireEvent(await screen.findByTestId("note-card-3"), "longPress");
    fireEvent.press(screen.getByTestId("notes-selection-archive"));
    await waitFor(() => expect(mock.history.put.map((r) => r.url)).toEqual(["/api/v1/note_app/notes/3/archive"]));
  });
});

describe("Reminders view and chips", () => {
  beforeEach(() => {
    mock.onGet("/api/v1/note_app/tags").reply(200, { tags: [], meta: { pagy: { page: 1, pages: 1 } } });
  });

  it("a card shows its reminder", async () => {
    server = [note(5, { data: { launch_time: "2030-01-01T08:00:00Z" } })];
    open();
    expect(await screen.findByTestId("note-card-5-reminder")).toBeTruthy();
  });

  it("the drawer's Reminders lists the notes with a reminder (?reminders=true)", async () => {
    open();
    await screen.findByText("Pinned seed");
    fireEvent.press(screen.getByTestId("notes-menu"));
    fireEvent.press(await screen.findByTestId("drawer-reminders"));
    await waitFor(() => expect(mock.history.get.some((r) => r.url === "/api/v1/note_app/notes" && r.params?.reminders === "true")).toBe(true));
    expect(screen.getByTestId("notes-view-title")).toHaveTextContent("Reminders");
  });
});

describe("lock badge", () => {
  it("a locked note shows a lock on its card", async () => {
    server = [note(6, { is_locked: true }), note(7)];
    open();
    expect(await screen.findByTestId("note-card-6-locked")).toBeTruthy();
    expect(screen.queryByTestId("note-card-7-locked")).toBeNull();
  });

  it("in the Trash a tap opens the note to read, not to edit (as the web)", async () => {
    mock.onGet("/api/v1/note_app/tags").reply(200, { tags: [], meta: { pagy: { page: 1, pages: 1 } } });
    mock.onGet("/api/v1/note_app/notes/trashes").reply(200, { notes: [note(30, { status: "trashed" })], meta: { pagy: { page: 1, pages: 1 }, total_count: 1 } });
    open();
    await screen.findByText("Pinned seed");
    fireEvent.press(screen.getByTestId("notes-menu"));
    fireEvent.press(await screen.findByTestId("drawer-trash"));
    fireEvent.press(await screen.findByTestId("note-card-30"));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/notes/note", params: { id: "30" } });
  });
});

describe("a search result opens on the first tap (device, 2026-11-13: the first tap only closed the keyboard)", () => {
  it("the list lets taps through while the keyboard is up", async () => {
    open();
    const list = await screen.findByTestId("notes-list");
    expect(list.props.keyboardShouldPersistTaps).toBe("handled");
  });
});
