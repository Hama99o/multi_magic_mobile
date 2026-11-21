/**
 * Flow's API boundary: what the server sends is parsed, not cast, and what we
 * send uses the server's own names (`docs/design/flow/SPEC.md` §A).
 *
 * The board fixture is shaped from the serializers at multi_magic 0041bc0b
 * (`projects_controller.rb#board_payload`, `card_serializer.rb`,
 * `field_value_service.rb#values_for_records`), not from a device capture:
 * the owner's real board is not a fixture (CLAUDE.md, "This repo is PUBLIC").
 */
import MockAdapter from "axios-mock-adapter";
import { http } from "../http";
import { flowApi } from "../flow";
import board from "./fixtures/flow_board.json";

const BASE = "/api/v1/flow_app";
let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
});
afterEach(() => mock.restore());

describe("board", () => {
  it("reads every part of the board, columns in their order", async () => {
    mock.onGet(`${BASE}/projects/7/board`).reply(200, board);
    const b = await flowApi.board(7, "backlog");
    expect(b.project).toMatchObject({ id: 7, title: "Launch", color: "#3b82f6", owner: { id: 1, name: "Owner Person" }, myRole: null });
    expect(b.columns.map((c) => c.title)).toEqual(["Backlog", "To Do", "Done"]);
    expect(b.columns[2].isFinal).toBe(true);
    expect(b.sprints[0]).toMatchObject({ id: 30, status: "active", startDate: "2026-11-16" });
    expect(b.people).toEqual([{ id: 1, name: "Owner Person" }, { id: 2, name: "Member Person" }]);
    expect(b.tagsByCategory[50].map((t) => t.label)).toEqual(["Frontend", "Bug"]);
  });

  it("asks for one page of a sprint, of the backlog, or of every card", async () => {
    mock.onGet(`${BASE}/projects/7/board`, { params: { sprint_id: 30, page: 2, limit: 100 } }).reply(200, board);
    await expect(flowApi.board(7, 30, 2)).resolves.toBeTruthy();
    mock.reset();
    mock.onGet(`${BASE}/projects/7/board`, { params: { sprint: "backlog", page: 1, limit: 100 } }).reply(200, board);
    await expect(flowApi.board(7, "backlog")).resolves.toBeTruthy();
    mock.reset();
    mock.onGet(`${BASE}/projects/7/board`, { params: { sprint: "all", page: 1, limit: 100 } }).reply(200, board);
    await expect(flowApi.board(7, "all")).resolves.toBeTruthy();
  });

  it("reads an older server's unpaged answer as one complete page", async () => {
    mock.onGet(`${BASE}/projects/7/board`).reply(200, board);
    expect((await flowApi.board(7, "backlog")).paging).toEqual({ paged: false, page: 1, nextPage: null, total: null });
  });

  it("reads the paged server's page block, and no next page past the end", async () => {
    mock.onGet(`${BASE}/projects/7/board`).replyOnce(200, { ...board, page: { page: 1, limit: 100, total: 268, has_more: true, next_page: 2, filters: {} } });
    expect((await flowApi.board(7, "all")).paging).toEqual({ paged: true, page: 1, nextPage: 2, total: 268 });
    mock.onGet(`${BASE}/projects/7/board`).replyOnce(200, { ...board, cards: [], page: { page: 4, limit: 100, total: 268, has_more: false, next_page: null } });
    expect((await flowApi.board(7, "all", 4)).paging).toEqual({ paged: true, page: 4, nextPage: null, total: 268 });
  });

  it("keeps a field type it does not know OUT of the fields, without failing the board", async () => {
    mock.onGet(`${BASE}/projects/7/board`).reply(200, board);
    const b = await flowApi.board(7, "backlog");
    expect(b.fields.map((f) => f.key)).toEqual(["priority", "story_points", "labels", "assignees", "reviewer", "due_date", "spec"]);
  });

  it("counts an unreadable card instead of failing the board", async () => {
    mock.onGet(`${BASE}/projects/7/board`).reply(200, board);
    const b = await flowApi.board(7, "backlog");
    expect(b.cards.map((c) => c.id)).toEqual([900, 901]);
    expect(b.unreadable).toBe(1);
  });

  it("reads each field value by its kind, keyed by definition id", async () => {
    mock.onGet(`${BASE}/projects/7/board`).reply(200, board);
    const card = (await flowApi.board(7, "backlog")).cards[0];
    expect(card.fieldValues[101]).toEqual({ kind: "scalar", value: "high" });
    expect(card.fieldValues[103]).toEqual({ kind: "records", selections: [{ selectionId: 7001, recordId: 503, recordType: "Core::Tag" }] });
    expect(card.fieldValues[105]).toEqual({ kind: "records", selections: [] });
    const files = card.fieldValues[107];
    expect(files.kind).toBe("files");
    // A relative blob path is made absolute, or <Image> draws nothing.
    if (files.kind === "files") expect(files.files[0].url).toMatch(/^https?:\/\/.+\/rails\/active_storage\/blobs\/redirect\/abc\/spec\.pdf$/);
  });
});

describe("projects", () => {
  it("pages, searches, and reads the caller's role", async () => {
    mock.onGet(`${BASE}/projects`, { params: { page: 2, search: "lau" } }).reply(200, {
      projects: [{ ...board.project, my_role: "admin" }],
      meta: { pagy: { page: 2, pages: 3 } },
    });
    const page = await flowApi.projects({ page: 2, search: " lau " });
    expect(page).toMatchObject({ page: 2, pages: 3, unreadable: 0 });
    expect(page.rows[0]).toMatchObject({ myRole: "admin", cardsCount: 3, membersCount: 2 });
  });

  it("sends a project under `project`, colour included", async () => {
    mock.onPost(`${BASE}/projects`).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ project: { title: "New", description: null, color: "#10b981" } });
      return [201, { project: { ...board.project, title: "New" } }];
    });
    await expect(flowApi.createProject({ title: "New", description: null, color: "#10b981" })).resolves.toMatchObject({ title: "New" });
  });
});

describe("cards", () => {
  it("moves through `move` with the server's names and a 1-based position", async () => {
    mock.onPut(`${BASE}/projects/7/cards/900/move`).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ card: { flow_app_column_id: 15, flow_app_sprint_id: null, position: 1 } });
      return [200, { card: { ...board.cards[0], flow_app_column_id: 15 } }];
    });
    await expect(flowApi.moveCard(7, 900, { columnId: 15, sprintId: null, position: 1 })).resolves.toMatchObject({ columnId: 15 });
  });

  it("reorders a column with its ordered ids", async () => {
    mock.onPut(`${BASE}/projects/7/cards/reorder`).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ columns: [{ column_id: 11, ordered_ids: [901, 900] }] });
      return [204];
    });
    await flowApi.reorderCards(7, [{ columnId: 11, ids: [901, 900] }]);
  });

  it("creates a card in a column AND a sprint (the web drops the sprint)", async () => {
    mock.onPost(`${BASE}/projects/7/cards`).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ card: { title: "T", flow_app_column_id: 11, flow_app_sprint_id: 30 } });
      return [201, { card: { ...board.cards[0], flow_app_sprint_id: 30 } }];
    });
    await expect(flowApi.createCard(7, { title: "T", columnId: 11, sprintId: 30 })).resolves.toMatchObject({ sprintId: 30 });
  });
});

describe("comments, history, members", () => {
  it("reads a comment's author from `user.name` (the web shows the id)", async () => {
    mock.onGet(`${BASE}/projects/7/cards/900/comments`).reply(200, {
      comments: [{ id: 1, content: "Hi", flow_app_card_id: 900, created_at: "2026-11-19T10:00:00Z", updated_at: "", user: { id: 2, name: "Member Person" } }],
    });
    expect((await flowApi.comments(7, 900))[0].user).toEqual({ id: 2, name: "Member Person" });
  });

  it("keeps an unknown history event as raw, and a system row with no user", async () => {
    mock.onGet(`${BASE}/projects/7/cards/900/histories`, { params: { page: 1 } }).reply(200, {
      card_histories: [
        { id: 1, event_type: "column_changed", payload: { from: 10, to: 11 }, flow_app_card_id: 900, created_at: "", user: { id: 1, name: "Owner Person" } },
        { id: 2, event_type: "archived", payload: null, flow_app_card_id: 900, created_at: "", user: null },
      ],
      meta: { pagy: { page: 1, pages: 2 } },
    });
    const page = await flowApi.history(7, 900, 1);
    expect(page.pages).toBe(2);
    expect(page.rows[0]).toMatchObject({ event: "column_changed", payload: { from: 10, to: 11 } });
    expect(page.rows[1]).toMatchObject({ event: null, rawEvent: "archived", user: null, payload: {} });
  });

  it("adds a member by email or by account", async () => {
    const member = { id: 5, role: "member", flow_app_project_id: 7, user_id: null, created_at: "", invited_email: "a@b.co", invited_at: "", pending: true, user: { id: null, name: null } };
    mock.onPost(`${BASE}/projects/7/members`).replyOnce((config) => {
      expect(JSON.parse(config.data)).toEqual({ member: { email: "a@b.co", role: "member" } });
      return [201, { member, state: "invited" }];
    });
    await expect(flowApi.addMember(7, { email: "a@b.co" }, "member")).resolves.toMatchObject({ pending: true, invitedEmail: "a@b.co", userId: null });
    mock.onPost(`${BASE}/projects/7/members`).replyOnce((config) => {
      expect(JSON.parse(config.data)).toEqual({ member: { user_id: 9, role: "viewer" } });
      return [201, { member: { ...member, user_id: 9, pending: false, role: "viewer", user: { id: 9, name: "Nine" } } }];
    });
    await expect(flowApi.addMember(7, { userId: 9 }, "viewer")).resolves.toMatchObject({ name: "Nine", role: "viewer" });
  });

  it("reorders columns as positions from 0", async () => {
    mock.onPut(`${BASE}/projects/7/columns/reorder`).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ positions: [{ id: 15, position: 0 }, { id: 10, position: 1 }] });
      return [200, { columns: board.columns }];
    });
    await flowApi.reorderColumns(7, [15, 10]);
  });
});
