/**
 * The Todo app at the HTTP layer, in the server's own shapes
 * (`TodoApp::TodoGroupSerializer`, `TodoSerializer`, `TemplateSerializer`,
 * `todo_group_params`, `todo_params`, `template_params`), read 2026-11-16 at
 * multi_magic 0986d1e4. Invented data only: this repo is public.
 */
import MockAdapter from "axios-mock-adapter";
import { todoGroupsApi, todosApi, todoTemplatesApi, __parse } from "../todos";
import { ApiShapeError } from "../parse";
import { __resetTokenCache, http } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
});
afterEach(() => mock.restore());

const milk = {
  id: 31,
  title: "Buy milk",
  notes: null,
  completed: false,
  position: 1,
  todo_group_id: 4,
  due_date: "2026-11-20",
  priority: "high",
  created_at: "2026-11-16T09:00:00Z",
  updated_at: "2026-11-16T09:00:00Z",
  overdue: false,
};
const bread = { ...milk, id: 32, title: "Bread", completed: true, position: 2, due_date: null, priority: "none", notes: "wholemeal" };

const groupRow = {
  id: 4,
  name: "[qa] Groceries",
  position: 1,
  created_at: "2026-11-16T08:00:00Z",
  updated_at: "2026-11-16T09:00:00Z",
  todos_count: 2,
  completed_count: 1,
  pending_count: 1,
  overdue_count: 0,
  preview_todos: [milk],
};

describe("todoGroupsApi", () => {
  it("lists one page of lists with counts, previews and the pager", async () => {
    mock.onGet("/api/v1/todo_app/todo_groups", { params: { page: 2, search: "gro" } }).reply(200, {
      todo_groups: [groupRow],
      meta: { pagy: { page: 2, pages: 3, count: 41 } },
    });
    const page = await todoGroupsApi.list({ page: 2, search: " gro " });
    expect(page.page).toBe(2);
    expect(page.pages).toBe(3);
    expect(page.unreadable).toBe(0);
    expect(page.rows[0]).toMatchObject({
      id: 4,
      name: "[qa] Groceries",
      todosCount: 2,
      completedCount: 1,
      pendingCount: 1,
      overdueCount: 0,
      updatedAt: "2026-11-16T09:00:00Z",
    });
    expect(page.rows[0].previewTodos[0]).toMatchObject({ id: 31, title: "Buy milk", dueDate: "2026-11-20", priority: "high", todoGroupId: 4 });
  });

  it("sends no search when the term is blank, and counts a row it cannot read", async () => {
    mock.onGet("/api/v1/todo_app/todo_groups", { params: { page: 1 } }).reply(200, {
      todo_groups: [groupRow, { id: "x" }],
      meta: { pagy: { page: 1, pages: 1 } },
    });
    const page = await todoGroupsApi.list({ page: 1, search: "  " });
    expect(page.rows).toHaveLength(1);
    expect(page.unreadable).toBe(1);
  });

  it("shows one list with every task in position order", async () => {
    mock.onGet("/api/v1/todo_app/todo_groups/4").reply(200, { todo_group: { ...groupRow, preview_todos: undefined, todos: [milk, bread] } });
    const g = await todoGroupsApi.show(4);
    expect(g.todos.map((t) => t.id)).toEqual([31, 32]);
    expect(g.todos[1]).toMatchObject({ completed: true, notes: "wholemeal", priority: "none", dueDate: null });
  });

  it("creates and renames under todo_group", async () => {
    mock.onPost("/api/v1/todo_app/todo_groups").reply((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({ todo_group: { name: "Trip" } });
      return [201, { todo_group: { ...groupRow, id: 9, name: "Trip", preview_todos: undefined } }];
    });
    expect((await todoGroupsApi.create("Trip")).id).toBe(9);

    mock.onPut("/api/v1/todo_app/todo_groups/9").reply((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({ todo_group: { name: "Trip 2" } });
      return [200, { todo_group: { ...groupRow, id: 9, name: "Trip 2" } }];
    });
    expect((await todoGroupsApi.rename(9, "Trip 2")).name).toBe("Trip 2");
  });

  it("deletes, clears completed, resets, duplicates and saves as a template", async () => {
    mock.onDelete("/api/v1/todo_app/todo_groups/4").reply(200, { message: "ok" });
    await todoGroupsApi.remove(4);

    mock.onDelete("/api/v1/todo_app/todo_groups/4/clear_completed").reply(200, { todo_group: { ...groupRow, todos: [milk] } });
    expect((await todoGroupsApi.clearCompleted(4)).todos).toHaveLength(1);

    mock.onPost("/api/v1/todo_app/todo_groups/4/reset").reply(200, { todo_group: { ...groupRow, todos: [milk, { ...bread, completed: false }] } });
    expect((await todoGroupsApi.reset(4)).todos.every((t) => !t.completed)).toBe(true);

    mock.onPost("/api/v1/todo_app/todo_groups/4/duplicate").reply(201, { todo_group: { ...groupRow, id: 12, name: "[qa] Groceries (Copy)" } });
    expect((await todoGroupsApi.duplicate(4)).id).toBe(12);

    mock.onPost("/api/v1/todo_app/todo_groups/4/save_as_template").reply((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({});
      return [201, { template: { id: 2, name: "[qa] Groceries", position: 1, frequency: "none", interval_count: 1, next_occurrence_on: null, items: [{ title: "Buy milk", notes: null }], items_count: 1, created_at: "x", updated_at: "x" } }];
    });
    expect((await todoGroupsApi.saveAsTemplate(4)).itemsCount).toBe(1);
  });
});

describe("todosApi", () => {
  it("creates a task in a list: the list id beside the todo, never inside it", async () => {
    mock.onPost("/api/v1/todo_app/todos").reply((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({ todo_group_id: 4, todo: { title: "Eggs" } });
      return [201, { todo: { ...milk, id: 40, title: "Eggs" } }];
    });
    expect((await todosApi.create(4, { title: "Eggs" })).id).toBe(40);
  });

  it("updates title, notes, due date and priority in the server's names", async () => {
    mock.onPut("/api/v1/todo_app/todos/31").reply((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({ todo: { title: "Oat milk", notes: "2 L", due_date: null, priority: "low" } });
      return [200, { todo: { ...milk, title: "Oat milk", notes: "2 L", due_date: null, priority: "low" } }];
    });
    const t = await todosApi.update(31, { title: "Oat milk", notes: "2 L", dueDate: null, priority: "low" });
    expect(t).toMatchObject({ title: "Oat milk", dueDate: null, priority: "low" });
  });

  it("toggles, deletes and reorders", async () => {
    mock.onPut("/api/v1/todo_app/todos/31/toggle").reply(200, { todo: { ...milk, completed: true } });
    expect((await todosApi.toggle(31)).completed).toBe(true);

    mock.onDelete("/api/v1/todo_app/todos/31").reply(200, { message: "ok" });
    await todosApi.remove(31);

    mock.onPut("/api/v1/todo_app/todos/reorder").reply((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({ todo_group_id: 4, todo_ids: [32, 31] });
      return [200, { message: "ok" }];
    });
    await todosApi.reorder(4, [32, 31]);
  });
});

describe("todoTemplatesApi", () => {
  const tpl = {
    id: 2, name: "Weekly shop", position: 1, frequency: "weekly", interval_count: 1, next_occurrence_on: "2026-11-23",
    items: [{ title: "Milk", notes: null }, { title: "Bread" }], items_count: 2, created_at: "x", updated_at: "x",
  };

  it("lists templates with their items and schedule", async () => {
    mock.onGet("/api/v1/todo_app/templates").reply(200, { templates: [tpl] });
    const [t] = await todoTemplatesApi.list();
    expect(t).toMatchObject({ id: 2, frequency: "weekly", intervalCount: 1, nextOccurrenceOn: "2026-11-23", itemsCount: 2 });
    expect(t.items.map((i) => i.title)).toEqual(["Milk", "Bread"]);
  });

  it("creates and updates under template with items and interval_count", async () => {
    mock.onPost("/api/v1/todo_app/templates").reply((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({ template: { name: "Weekly shop", items: [{ title: "Milk" }], frequency: "weekly", interval_count: 2 } });
      return [201, { template: tpl }];
    });
    await todoTemplatesApi.create({ name: "Weekly shop", items: [{ title: "Milk" }], frequency: "weekly", intervalCount: 2 });

    mock.onPut("/api/v1/todo_app/templates/2").reply((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({ template: { name: "Shop", items: [], frequency: "none", interval_count: 1 } });
      return [200, { template: { ...tpl, name: "Shop" } }];
    });
    expect((await todoTemplatesApi.update(2, { name: "Shop", items: [], frequency: "none", intervalCount: 1 })).name).toBe("Shop");
  });

  it("deletes and applies (a new list)", async () => {
    mock.onDelete("/api/v1/todo_app/templates/2").reply(200, { message: "ok" });
    await todoTemplatesApi.remove(2);
    mock.onPost("/api/v1/todo_app/templates/2/apply").reply(201, { todo_group: { ...groupRow, id: 15, name: "Weekly shop" } });
    expect((await todoTemplatesApi.apply(2)).id).toBe(15);
  });
});

describe("parsers", () => {
  it("refuses a task whose id is not a number", () => {
    expect(() => __parse.parseTodo({ ...milk, id: "31" })).toThrow(ApiShapeError);
  });

  it("reads an unknown priority as none and an unknown frequency as none", () => {
    expect(__parse.parseTodo({ ...milk, priority: "urgent" }).priority).toBe("none");
    expect(__parse.parseTemplate({ id: 1, name: "x", frequency: "yearly" }).frequency).toBe("none");
  });

  it("works out overdue from the server's flag", () => {
    expect(__parse.parseTodo({ ...milk, overdue: true }).overdue).toBe(true);
    expect(__parse.parseTodo({ ...milk, overdue: undefined }).overdue).toBe(false);
  });
});

describe("across lists, and the reminder", () => {
  it("reads every pending task (the Today / Upcoming / Overdue views)", async () => {
    mock.onGet("/api/v1/todo_app/todos", { params: { completed: false } }).reply(200, { todos: [milk, { ...milk, id: 33, todo_group_id: 5 }] });
    const rows = await todosApi.pending();
    expect(rows.map((t) => [t.id, t.todoGroupId])).toEqual([[31, 4], [33, 5]]);
  });

  it("searches tasks (titles, notes and list names), trimmed", async () => {
    mock.onGet("/api/v1/todo_app/todos", { params: { search: "milk" } }).reply(200, { todos: [milk] });
    expect((await todosApi.search(" milk ")).map((t) => t.id)).toEqual([31]);
  });

  it("knows whether the server keeps a reminder: the key is there, even null", () => {
    expect(__parse.parseTodo({ ...milk, remind_at: null })).toMatchObject({ remindAt: null, remindSupported: true });
    expect(__parse.parseTodo({ ...milk, remind_at: "2026-12-01T09:30:00.000Z" })).toMatchObject({ remindAt: "2026-12-01T09:30:00.000Z", remindSupported: true });
    expect(__parse.parseTodo(milk)).toMatchObject({ remindAt: null, remindSupported: false });
  });

  it("sends remind_at only when given", async () => {
    mock.onPut("/api/v1/todo_app/todos/31").reply((cfg) => {
      expect(JSON.parse(cfg.data)).toEqual({ todo: { remind_at: "2026-12-01T09:30:00.000Z" } });
      return [200, { todo: { ...milk, remind_at: "2026-12-01T09:30:00.000Z" } }];
    });
    await todosApi.update(31, { remindAt: "2026-12-01T09:30:00.000Z" });
  });
});
