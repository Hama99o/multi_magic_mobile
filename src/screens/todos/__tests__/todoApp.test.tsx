/**
 * The Todo app, screen by screen, at the HTTP layer: the real API functions
 * and parsers run, and every write is asserted by the body it sends, in the
 * server's names (`todo_params`, `todo_group_params`, `template_params`).
 *
 * What this cannot see: a pixel, a swipe or a drag (PanResponder physics),
 * the native modal, and whether a French string fits 360 dp. Those are the
 * device sweep's.
 */
import MockAdapter from "axios-mock-adapter";
import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useTodoUndo } from "@/stores/todoUndo.store";
import { addDays, todayKey } from "@/screens/calendar/dates";
import { router as mockedRouter } from "expo-router";
import Todos from "../../../../app/todos";
import TodoList from "../../../../app/todos/list";
import Due from "../../../../app/todos/due";
import Templates from "../../../../app/todos/templates";
import TemplateForm from "../../../../app/todos/template";

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams.current,
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock("@/screens/notes/reminderNotifications", () => ({
  ensureReminderPermission: jest.fn(async () => true),
  resyncTodoReminders: jest.fn(async () => undefined),
}));

const router = mockedRouter as unknown as { push: jest.Mock; back: jest.Mock; replace: jest.Mock };
const B = "/api/v1/todo_app";
const TODAY = todayKey();
let mock: MockAdapter;
/** A row that leaves plays its exit animation first (Reanimated runs it in jest too). */
const EXIT = { timeout: 3000 };

function renderScreen(element: ReactElement) {
  return render(<QueryClientProvider client={testQueryClient()}>{element}</QueryClientProvider>);
}

const todo = (id: number, over: Record<string, unknown> = {}) => ({
  id, todo_group_id: 4, title: `Task ${id}`, notes: null, completed: false, position: id, due_date: null, priority: "none", overdue: false,
  created_at: "2026-11-16T09:00:00Z", updated_at: "2026-11-16T09:00:00Z", ...over,
});
const group = (over: Record<string, unknown> = {}) => ({
  id: 4, name: "[qa] Groceries", position: 1, todos_count: 3, completed_count: 1, pending_count: 2, overdue_count: 0,
  created_at: "x", updated_at: "x", preview_todos: [todo(1, { title: "Milk" }), todo(2, { title: "Bread" })], ...over,
});
const fullGroup = (todos: unknown[]) => ({ todo_group: { ...group(), preview_todos: undefined, todos } });
const bodies = (method: "post" | "put" | "delete", url: string) =>
  mock.history[method].filter((r) => r.url === url).map((r) => (r.data ? JSON.parse(r.data) : null));

type Row = ReturnType<typeof todo>;
/**
 * A tiny server for one list: every write changes `db`, and every read answers
 * from it, so the refetch after a write sees what the write did (a static
 * fixture would put the old list back and hide the change).
 */
function serveList(todos: Row[], name = "[qa] Groceries") {
  const db = { name, todos: [...todos], nextId: 100 };
  const id = (url?: string) => Number(url?.match(/todos\/(\d+)/)?.[1]);
  mock.onGet(`${B}/todo_groups/4`).reply(() => [200, { todo_group: { ...group({ name: db.name }), preview_todos: undefined, todos: db.todos } }]);
  mock.onGet(`${B}/todos`).reply(() => [200, { todos: db.todos.filter((t) => !t.completed) }]);
  mock.onPut(`${B}/todos/reorder`).reply((cfg) => {
    const order: number[] = JSON.parse(cfg.data).todo_ids;
    db.todos.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return [200, {}];
  });
  mock.onPut(new RegExp(`${B}/todos/\\d+/toggle`)).reply((cfg) => {
    const t = db.todos.find((x) => x.id === id(cfg.url))!;
    t.completed = !t.completed;
    return [200, { todo: t }];
  });
  mock.onPut(new RegExp(`${B}/todos/\\d+$`)).reply((cfg) => {
    const t = db.todos.find((x) => x.id === id(cfg.url))!;
    Object.assign(t, JSON.parse(cfg.data).todo);
    return [200, { todo: t }];
  });
  mock.onPost(`${B}/todos`).reply((cfg) => {
    const t = todo(db.nextId++, { position: db.todos.length + 1, ...JSON.parse(cfg.data).todo });
    db.todos.push(t);
    return [201, { todo: t }];
  });
  mock.onDelete(new RegExp(`${B}/todos/\\d+$`)).reply((cfg) => {
    db.todos = db.todos.filter((x) => x.id !== id(cfg.url));
    return [200, {}];
  });
  mock.onPut(`${B}/todo_groups/4`).reply((cfg) => {
    db.name = JSON.parse(cfg.data).todo_group.name;
    return [200, { todo_group: group({ name: db.name }) }];
  });
  mock.onDelete(`${B}/todo_groups/4/clear_completed`).reply(() => {
    db.todos = db.todos.filter((x) => !x.completed);
    return [200, { todo_group: { ...group(), todos: db.todos } }];
  });
  return db;
}

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mockParams.current = {};
  router.push.mockClear();
  router.back.mockClear();
  router.replace.mockClear();
  useTodoUndo.getState().clear();
  await i18n.changeLanguage("en");
});
afterEach(() => mock.restore());

describe("the Todo home", () => {
  beforeEach(() => {
    mock.onGet(`${B}/todo_groups`).reply(200, { todo_groups: [group(), group({ id: 5, name: "[qa] Trip", todos_count: 0, completed_count: 0, pending_count: 0, preview_todos: [] })], meta: { pagy: { page: 1, pages: 1 } } });
    mock.onGet(`${B}/todos`, { params: { completed: false } }).reply(200, {
      todos: [todo(1, { due_date: TODAY }), todo(2, { due_date: addDays(TODAY, -2), overdue: true }), todo(3, { due_date: addDays(TODAY, 3) }), todo(6)],
    });
  });

  it("shows each list with its progress and its next tasks, newest first as the server sends them", async () => {
    renderScreen(<Todos />);
    expect(await screen.findByText("[qa] Groceries")).toBeTruthy();
    expect(screen.getByText("1 of 3 done")).toBeTruthy();
    expect(screen.getByText("Milk")).toBeTruthy();
    expect(screen.getByText("[qa] Trip")).toBeTruthy();
    expect(screen.getByText("No tasks yet")).toBeTruthy();
    const ids = screen.getAllByTestId(/^todos-list-\d+$/).map((n) => n.props.testID);
    expect(ids).toEqual(["todos-list-4", "todos-list-5"]);
  });

  it("counts what is due today, upcoming and overdue across every list, and opens that view", async () => {
    renderScreen(<Todos />);
    await waitFor(() => expect(screen.getByTestId("todos-due-today-count")).toHaveTextContent("1"));
    expect(screen.getByTestId("todos-due-upcoming-count")).toHaveTextContent("1");
    expect(screen.getByTestId("todos-due-overdue-count")).toHaveTextContent("1");
    fireEvent.press(screen.getByTestId("todos-due-overdue"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/todos/due", params: { view: "overdue" } });
  });

  it("ticks a task straight from a list's card", async () => {
    mock.onPut(`${B}/todos/1/toggle`).reply(200, { todo: todo(1, { completed: true }) });
    renderScreen(<Todos />);
    fireEvent.press(await screen.findByTestId("todos-preview-check-1"));
    await waitFor(() => expect(mock.history.put.some((r) => r.url === `${B}/todos/1/toggle`)).toBe(true));
  });

  it("makes a new list and opens it", async () => {
    mock.onPost(`${B}/todo_groups`).reply(201, { todo_group: group({ id: 12, name: "Weekend" }) });
    renderScreen(<Todos />);
    fireEvent.press(await screen.findByTestId("todos-new-list"));
    fireEvent.changeText(screen.getByTestId("pages-name-input"), "Weekend");
    fireEvent.press(screen.getByTestId("pages-name-confirm"));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/todos/list", params: { id: "12" } }));
    expect(bodies("post", `${B}/todo_groups`)).toEqual([{ todo_group: { name: "Weekend" } }]);
  });

  it("searches list names and tasks at once", async () => {
    mock.onGet(`${B}/todo_groups`, { params: { page: 1, search: "milk" } }).reply(200, { todo_groups: [], meta: { pagy: { page: 1, pages: 1 } } });
    mock.onGet(`${B}/todos`, { params: { search: "milk" } }).reply(200, { todos: [todo(1, { title: "Oat milk" })] });
    renderScreen(<Todos />);
    await screen.findByText("[qa] Groceries");
    fireEvent.press(screen.getByTestId("todos-search-toggle"));
    fireEvent.changeText(screen.getByTestId("todos-search"), "milk");
    expect(await screen.findByText("Oat milk")).toBeTruthy();
    expect(screen.getByTestId("todos-task-hits")).toBeTruthy();
    fireEvent.press(screen.getByTestId("todo-row-1"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/todos/list", params: { id: "4", task: "1" } });
  });

  it("with no list yet, says how to start", async () => {
    mock.onGet(`${B}/todo_groups`).reply(200, { todo_groups: [], meta: { pagy: { page: 1, pages: 1 } } });
    renderScreen(<Todos />);
    expect(await screen.findByText("Make your first list")).toBeTruthy();
    expect(screen.getByTestId("todos-empty-create")).toBeTruthy();
  });
});

describe("a finished list's card", () => {
  beforeEach(() => {
    mock.onGet(`${B}/todo_groups`).reply(200, { todo_groups: [group({ id: 6, name: "[qa] Packed", todos_count: 2, completed_count: 2, pending_count: 0, preview_todos: [] }), group()], meta: { pagy: { page: 1, pages: 1 } } });
    mock.onGet(`${B}/todos`, { params: { completed: false } }).reply(200, { todos: [] });
  });

  it("says All done, as the web's card does, and only on the list whose every task is ticked", async () => {
    renderScreen(<Todos />);
    expect(await screen.findByText("[qa] Packed")).toBeTruthy();
    expect(screen.getByTestId("todos-list-6-done")).toHaveTextContent("All done");
    expect(screen.queryByTestId("todos-list-4-done")).toBeNull();
  });
});

describe("a list", () => {
  beforeEach(() => {
    mockParams.current = { id: "4" };
  });
  const standard = () => serveList([todo(1, { title: "Milk", due_date: TODAY }), todo(2, { title: "Bread", priority: "high" }), todo(3, { title: "Eggs", completed: true })]);

  it("shows the open tasks in order, the done ones folded under Done (n)", async () => {
    standard();
    renderScreen(<TodoList />);
    expect(await screen.findByText("Milk")).toBeTruthy();
    expect(screen.getByText("Bread")).toBeTruthy();
    expect(screen.queryByText("Eggs")).toBeNull();
    expect(screen.getByText("1 of 3 done")).toBeTruthy();
    expect(within(screen.getByTestId("todo-due-1")).getByText("Today")).toBeTruthy();
    expect(screen.getAllByTestId("todo-flag-2").length).toBeGreaterThan(0);
    fireEvent.press(screen.getByTestId("todo-done-toggle"));
    expect(await screen.findByText("Eggs")).toBeTruthy();
  });

  it("adds a task with a date and a priority from the quick-add chips, and keeps the field ready", async () => {
    standard();
    renderScreen(<TodoList />);
    await screen.findByText("Milk");
    fireEvent(screen.getByTestId("todo-quick-input"), "focus");
    fireEvent.changeText(screen.getByTestId("todo-quick-input"), "Butter");
    fireEvent.press(screen.getByTestId("todo-quick-tomorrow"));
    fireEvent.press(screen.getByTestId("todo-quick-priority"));
    fireEvent(screen.getByTestId("todo-quick-input"), "submitEditing");
    expect(await screen.findByText("Butter")).toBeTruthy();
    await waitFor(() => expect(bodies("post", `${B}/todos`)).toEqual([{ todo_group_id: 4, todo: { title: "Butter", due_date: addDays(TODAY, 1), priority: "high" } }]));
    expect(screen.getByTestId("todo-quick-input").props.value).toBe("");
  });

  it("ticks a task", async () => {
    standard();
    renderScreen(<TodoList />);
    fireEvent.press(await screen.findByTestId("todo-check-1"));
    await waitFor(() => expect(mock.history.put.map((r) => r.url)).toContain(`${B}/todos/1/toggle`));
  });

  it("opens a task and changes its priority, date and title, each saved as it is made", async () => {
    standard();
    renderScreen(<TodoList />);
    fireEvent.press(await screen.findByTestId("todo-row-2"));
    expect(screen.getByTestId("todo-sheet")).toBeTruthy();
    expect(screen.getByTestId("todo-sheet-list")).toHaveTextContent("[qa] Groceries");
    fireEvent.press(screen.getByTestId("todo-sheet-priority-low"));
    fireEvent.press(screen.getByTestId("todo-sheet-due-tomorrow"));
    fireEvent.changeText(screen.getByTestId("todo-sheet-title"), "Rye bread");
    fireEvent(screen.getByTestId("todo-sheet-title"), "blur");
    await waitFor(() =>
      expect(bodies("put", `${B}/todos/2`)).toEqual([{ todo: { priority: "low" } }, { todo: { due_date: addDays(TODAY, 1) } }, { todo: { title: "Rye bread" } }]),
    );
  });

  it("hides the reminder while the server keeps none, and offers it once it does", async () => {
    standard();
    renderScreen(<TodoList />);
    fireEvent.press(await screen.findByTestId("todo-row-1"));
    expect(screen.queryByTestId("todo-sheet-reminder-set")).toBeNull();
  });

  it("deletes a task from its sheet, with Undo that makes it again in its place", async () => {
    standard();
    renderScreen(<TodoList />);
    fireEvent.press(await screen.findByTestId("todo-row-2"));
    fireEvent.press(screen.getByTestId("todo-sheet-delete"));
    // Gone, and the five-second Undo offered: checked together, so a slow
    // machine cannot spend the five seconds on the first check.
    await waitFor(() => {
      expect(screen.queryByText("Bread")).toBeNull();
      expect(screen.getByText("Task deleted")).toBeTruthy();
    }, EXIT);
    fireEvent.press(screen.getByTestId("todo-undo-button"));
    await waitFor(() => expect(bodies("post", `${B}/todos`)).toEqual([{ todo_group_id: 4, todo: { title: "Bread", priority: "high" } }]));
    await waitFor(() => expect(bodies("put", `${B}/todos/reorder`)).toEqual([{ todo_group_id: 4, todo_ids: [1, 100, 3] }]));
  });

  it("clears the done tasks after asking", async () => {
    standard();
    const alert = jest.spyOn(Alert, "alert");
    renderScreen(<TodoList />);
    await screen.findByText("Milk");
    fireEvent.press(screen.getByTestId("todo-list-menu"));
    fireEvent.press(screen.getByTestId("todo-list-actions-clear"));
    expect(alert.mock.calls[0][0]).toBe("Clear completed tasks?");
    expect(alert.mock.calls[0][1]).toBe("1 done task will be deleted.");
    act(() => alert.mock.calls[0][2]!.find((b) => b.style === "destructive")!.onPress!());
    await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toContain(`${B}/todo_groups/4/clear_completed`));
    alert.mockRestore();
  });

  it("deletes the list after naming it and its tasks, and goes back", async () => {
    standard();
    const alert = jest.spyOn(Alert, "alert");
    mock.onDelete(`${B}/todo_groups/4`).reply(200, {});
    renderScreen(<TodoList />);
    await screen.findByText("Milk");
    fireEvent.press(screen.getByTestId("todo-list-menu"));
    fireEvent.press(screen.getByTestId("todo-list-actions-delete"));
    expect(alert.mock.calls[0][0]).toBe("Delete “[qa] Groceries”?");
    expect(alert.mock.calls[0][1]).toBe("Its 3 tasks go with it. This cannot be undone.");
    act(() => alert.mock.calls[0][2]!.find((b) => b.style === "destructive")!.onPress!());
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    alert.mockRestore();
  });

  it("renames the list from its menu", async () => {
    standard();
    renderScreen(<TodoList />);
    await screen.findByText("Milk");
    fireEvent.press(screen.getByTestId("todo-list-menu"));
    fireEvent.press(screen.getByTestId("todo-list-actions-rename"));
    fireEvent.changeText(screen.getByTestId("pages-name-input"), "Shop");
    fireEvent.press(screen.getByTestId("pages-name-confirm"));
    expect(await screen.findByText("Shop")).toBeTruthy();
    await waitFor(() => expect(bodies("put", `${B}/todo_groups/4`)).toEqual([{ todo_group: { name: "Shop" } }]));
  });

  it("duplicates and saves as a template from the menu", async () => {
    standard();
    mock.onPost(`${B}/todo_groups/4/duplicate`).reply(201, { todo_group: group({ id: 13, name: "[qa] Groceries (Copy)" }) });
    mock.onPost(`${B}/todo_groups/4/save_as_template`).reply(201, { template: { id: 2, name: "[qa] Groceries", items: [], items_count: 0, frequency: "none", interval_count: 1 } });
    renderScreen(<TodoList />);
    await screen.findByText("Milk");
    fireEvent.press(screen.getByTestId("todo-list-menu"));
    fireEvent.press(screen.getByTestId("todo-list-actions-template"));
    expect(await screen.findByText("Saved as a template")).toBeTruthy();
    fireEvent.press(screen.getByTestId("todo-list-menu"));
    fireEvent.press(screen.getByTestId("todo-list-actions-duplicate"));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: "/todos/list", params: { id: "13" } }));
  });

  it("a search hit opens its task", async () => {
    standard();
    mockParams.current = { id: "4", task: "2" };
    renderScreen(<TodoList />);
    expect(await screen.findByTestId("todo-sheet")).toBeTruthy();
    expect(screen.getByTestId("todo-sheet-title").props.value).toBe("Bread");
  });

  it("with no task yet, says so and the quick add is ready", async () => {
    serveList([]);
    renderScreen(<TodoList />);
    expect(await screen.findByText("Nothing here yet")).toBeTruthy();
    expect(screen.getByTestId("todo-quick-input")).toBeTruthy();
  });
});

describe("a task with a reminder (server with multi_magic PR #27)", () => {
  it("shows the Reminder row and sets one for a day and time", async () => {
    mockParams.current = { id: "4" };
    serveList([{ ...todo(1, { title: "Call" }), remind_at: null } as Row]);
    renderScreen(<TodoList />);
    fireEvent.press(await screen.findByTestId("todo-row-1"));
    fireEvent.press(screen.getByTestId("todo-sheet-reminder-set"));
    fireEvent.press(screen.getByTestId(`todo-sheet-reminder-day-${addDays(TODAY, 1)}`));
    fireEvent.press(screen.getByTestId("todo-sheet-reminder-save"));
    await waitFor(() => expect(bodies("put", `${B}/todos/1`)).toHaveLength(1));
    const sent = new Date(bodies("put", `${B}/todos/1`)[0].todo.remind_at);
    expect([sent.getHours(), sent.getMinutes()]).toEqual([9, 0]);
    expect(sent.toDateString()).toBe(new Date(`${addDays(TODAY, 1)}T12:00:00`).toDateString());
  });
});

describe("Today / Upcoming / Overdue", () => {
  let pending: Row[];
  beforeEach(() => {
    pending = [todo(1, { title: "Pay rent", due_date: TODAY }), todo(2, { title: "Return book", due_date: addDays(TODAY, -3), overdue: true, todo_group_id: 5 }), todo(3, { title: "Dentist", due_date: addDays(TODAY, 4) })];
    mock.onPut(`${B}/todos/2/toggle`).reply(() => {
      pending = pending.filter((t) => t.id !== 2);
      return [200, { todo: todo(2, { completed: true, todo_group_id: 5 }) }];
    });
    mock.onGet(`${B}/todos`, { params: { completed: false } }).reply(() => [200, { todos: pending }]);
    mock.onGet(`${B}/todo_groups/4`).reply(200, fullGroup([]));
    mock.onGet(`${B}/todo_groups/5`).reply(200, { todo_group: { ...group({ id: 5, name: "[qa] Errands" }), todos: [] } });
  });

  it("Today: overdue first, then today, each task naming its list", async () => {
    mockParams.current = { view: "today" };
    renderScreen(<Due />);
    expect(await screen.findByText("Return book")).toBeTruthy();
    expect(screen.getByText("Pay rent")).toBeTruthy();
    expect(screen.queryByText("Dentist")).toBeNull();
    expect(screen.getByTestId("todo-due-section-overdue")).toBeTruthy();
    expect(await screen.findByText("[qa] Errands")).toBeTruthy();
  });

  it("Upcoming: the days ahead", async () => {
    mockParams.current = { view: "today" };
    renderScreen(<Due />);
    await screen.findByText("Pay rent");
    fireEvent.press(screen.getByTestId("todo-due-tab-upcoming"));
    expect(await screen.findByText("Dentist")).toBeTruthy();
    expect(screen.queryByText("Pay rent")).toBeNull();
  });

  it("ticks there, and the task leaves the view, with Undo", async () => {
    mockParams.current = { view: "overdue" };
    renderScreen(<Due />);
    fireEvent.press(await screen.findByTestId("todo-check-2"));
    await waitFor(() => {
      expect(screen.queryByText("Return book")).toBeNull();
      expect(screen.getByText("Task done")).toBeTruthy();
    }, EXIT);
  });

  it("says when nothing is due", async () => {
    pending = [];
    mockParams.current = { view: "today" };
    renderScreen(<Due />);
    expect(await screen.findByText("Nothing due today")).toBeTruthy();
  });
});

describe("templates", () => {
  const tpl = { id: 2, name: "Weekly shop", items: [{ title: "Milk" }, { title: "Bread" }], items_count: 2, frequency: "weekly", interval_count: 1, next_occurrence_on: "2026-11-23" };

  it("lists them with their tasks and repeat; Use makes a list and opens it", async () => {
    mock.onGet(`${B}/templates`).reply(200, { templates: [tpl] });
    mock.onPost(`${B}/templates/2/apply`).reply(201, { todo_group: group({ id: 30, name: "Weekly shop" }) });
    renderScreen(<Templates />);
    expect(await screen.findByText("Weekly shop")).toBeTruthy();
    expect(screen.getByText("Milk · Bread")).toBeTruthy();
    expect(screen.getByText(/Every week · next/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("todo-template-use-2"));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: "/todos/list", params: { id: "30" } }));
  });

  it("makes a new one: a name, one task per line, a repeat every 2 weeks", async () => {
    mock.onPost(`${B}/templates`).reply(201, { template: tpl });
    renderScreen(<TemplateForm />);
    fireEvent.changeText(screen.getByTestId("todo-template-name"), "Weekly shop");
    fireEvent.changeText(screen.getByTestId("todo-template-items"), "Milk\n\n Bread \n");
    expect(screen.getByText("2 tasks")).toBeTruthy();
    fireEvent.press(screen.getByTestId("todo-template-repeat"));
    fireEvent.press(screen.getByTestId("todo-template-frequency-weekly"));
    fireEvent.press(screen.getByTestId("todo-template-interval-plus"));
    expect(screen.getByTestId("todo-template-interval")).toHaveTextContent("Every 2 weeks");
    fireEvent.press(screen.getByTestId("todo-template-save"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(bodies("post", `${B}/templates`)).toEqual([{ template: { name: "Weekly shop", items: [{ title: "Milk" }, { title: "Bread" }], frequency: "weekly", interval_count: 2 } }]);
  });

  it("deletes one after asking, and says lists made from it stay", async () => {
    const alert = jest.spyOn(Alert, "alert");
    let templates = [tpl];
    mock.onGet(`${B}/templates`).reply(() => [200, { templates }]);
    mock.onDelete(`${B}/templates/2`).reply(() => {
      templates = [];
      return [200, {}];
    });
    renderScreen(<Templates />);
    fireEvent.press(await screen.findByTestId("todo-template-delete-2"));
    expect(alert.mock.calls[0][1]).toBe("Lists already made from it stay.");
    act(() => alert.mock.calls[0][2]!.find((b) => b.style === "destructive")!.onPress!());
    await waitFor(() => expect(screen.queryByText("Weekly shop")).toBeNull(), EXIT);
    alert.mockRestore();
  });
});

describe("in French", () => {
  it("the home speaks French", async () => {
    await i18n.changeLanguage("fr");
    mock.onGet(`${B}/todo_groups`).reply(200, { todo_groups: [group()], meta: { pagy: { page: 1, pages: 1 } } });
    mock.onGet(`${B}/todos`).reply(200, { todos: [] });
    renderScreen(<Todos />);
    expect(await screen.findByText("1 sur 3 faites")).toBeTruthy();
    expect(screen.getByText("Mes listes")).toBeTruthy();
    expect(screen.getByText("Aujourd’hui")).toBeTruthy();
  });
});
