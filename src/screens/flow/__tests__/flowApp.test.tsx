/**
 * Flow, screen by screen, at the HTTP layer: the real API functions and
 * parsers run, and every write is asserted by the body it sends, in the
 * server's names.
 *
 * Each role's controls are checked against the server's policies
 * (`app/policies/flow_app/*.rb`): a viewer is shown a board with nothing to
 * change it with, and that is a test, not a hope.
 *
 * What this cannot see: a pixel, the pager's snapping, a drag, whether a
 * French string fits 360 dp. Those are the device sweep's (SPEC §QA).
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
import { router as mockedRouter } from "expo-router";
import board from "@/api/__tests__/fixtures/flow_board.json";
import Flow from "../../../../app/flow";
import Board from "../../../../app/flow/board";
import CardScreen from "../../../../app/flow/card";
import Columns from "../../../../app/flow/columns";
import Fields from "../../../../app/flow/fields";

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
  useNavigation: () => ({ addListener: jest.fn(() => () => undefined), dispatch: jest.fn() }),
  Link: ({ children }: { children: unknown }) => children,
}));

jest.mock("expo-clipboard", () => require("@/__tests__/screenMocks").clipboard);

const router = mockedRouter as unknown as { push: jest.Mock; back: jest.Mock };
const B = "/api/v1/flow_app";
let mock: MockAdapter;

function renderScreen(element: ReactElement) {
  return render(<QueryClientProvider client={testQueryClient()}>{element}</QueryClientProvider>);
}

type Role = "owner" | "admin" | "member" | "viewer";
const cardsOnly = board.cards.filter((c) => typeof c.id === "number");
const boardAs = (role: Role, over: Record<string, unknown> = {}) => ({ ...board, cards: cardsOnly, project: { ...board.project, my_role: role }, page: { page: 1, limit: 100, total: cardsOnly.length, has_more: false, next_page: null }, ...over });
const project = (id: number, title: string, role: Role = "owner") => ({ ...board.project, id, title, my_role: role });
const bodies = (method: "post" | "put" | "patch" | "delete", url: string) => mock.history[method].filter((r) => r.url === url).map((r) => (r.data ? JSON.parse(r.data) : null));

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mockParams.current = {};
  router.push.mockClear();
  await i18n.changeLanguage("en");
});
afterEach(() => mock.restore());

describe("the projects list", () => {
  it("shows projects in the server's order (newest first), with their counts and a role that is not the owner's", async () => {
    mock.onGet(`${B}/projects`).reply(200, { projects: [project(9, "[qa] Newest", "viewer"), project(7, "[qa] Launch")], meta: { pagy: { page: 1, pages: 1 } } });
    renderScreen(<Flow />);
    expect(await screen.findByText("[qa] Newest")).toBeTruthy();
    const rows = screen.getAllByTestId("flow-project-row");
    expect(rows.map((r) => within(r).queryByText(/\[qa\]/)?.props.children)).toEqual(["[qa] Newest", "[qa] Launch"]);
    // members_count 2 + the owner = 3 people.
    expect(screen.getAllByText("3 cards · 1 sprint · 3 people")).toHaveLength(2);
    expect(screen.getByTestId("role-viewer")).toBeTruthy();
  });

  it("says so when there is nothing, and offers to create the first", async () => {
    mock.onGet(`${B}/projects`).reply(200, { projects: [], meta: { pagy: { page: 1, pages: 1 } } });
    renderScreen(<Flow />);
    expect(await screen.findByTestId("flow-empty")).toBeTruthy();
    // One way to create here, not two (device, 2026-11-20).
    expect(screen.queryByTestId("flow-new-project")).toBeNull();
    fireEvent.press(screen.getByTestId("flow-empty-create"));
    expect(screen.getByTestId("flow-project-sheet")).toBeTruthy();
  });

  it("creates a project with a title and a colour, refuses an empty title, and opens the new board", async () => {
    mock.onGet(`${B}/projects`).reply(200, { projects: [], meta: { pagy: { page: 1, pages: 1 } } });
    mock.onPost(`${B}/projects`).reply(201, { project: project(12, "[qa] Made") });
    renderScreen(<Flow />);
    await screen.findByTestId("flow-empty");
    fireEvent.press(screen.getByTestId("flow-empty-create"));
    fireEvent.press(screen.getByTestId("flow-project-save"));
    expect(screen.getByTestId("flow-project-title-error")).toBeTruthy();
    expect(mock.history.post).toHaveLength(0);
    fireEvent.changeText(screen.getByTestId("flow-project-title"), "[qa] Made");
    fireEvent.press(screen.getByTestId("flow-project-color-green"));
    fireEvent.press(screen.getByTestId("flow-project-save"));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/flow/board", params: { id: "12" } }));
    expect(bodies("post", `${B}/projects`)).toEqual([{ project: { title: "[qa] Made", description: null, color: "green" } }]);
  });

  it("offers Delete only to the owner, and asks first, naming the project", async () => {
    mock.onGet(`${B}/projects`).reply(200, { projects: [project(7, "[qa] Mine"), project(8, "[qa] Theirs", "admin")], meta: { pagy: { page: 1, pages: 1 } } });
    mock.onDelete(`${B}/projects/7`).reply(204);
    const alert = jest.spyOn(Alert, "alert");
    renderScreen(<Flow />);
    await screen.findByText("[qa] Theirs");
    fireEvent.press(screen.getAllByTestId("flow-project-more")[1]);
    expect(screen.queryByText("Delete project")).toBeNull();
    expect(screen.getByText("Edit project")).toBeTruthy();
    // The scrim closes the sheet (ActionSheet's "Close" sibling).
    fireEvent.press(screen.getAllByLabelText(i18n.t("common.close"))[0]);
    fireEvent.press(screen.getAllByTestId("flow-project-more")[0]);
    fireEvent.press(screen.getByText("Delete project"));
    expect(alert.mock.calls[0][0]).toBe("Delete “[qa] Mine”?");
    const destroy = alert.mock.calls[0][2]?.find((b) => b.style === "destructive");
    destroy?.onPress?.();
    await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toEqual([`${B}/projects/7`]));
    alert.mockRestore();
  });
});

describe("the board", () => {
  beforeEach(() => {
    mockParams.current = { id: "7" };
  });

  it("asks for every card (sprint=all), shows the columns in order with their counts, and the tiles' facts", async () => {
    mock.onGet(`${B}/projects/7/board`).reply(200, boardAs("member"));
    renderScreen(<Board />);
    expect(await screen.findByText("Write the brief")).toBeTruthy();
    expect(mock.history.get.find((r) => r.url === `${B}/projects/7/board`)?.params).toEqual({ sprint: "all", page: 1, limit: 100 });
    expect(screen.getByTestId("flow-chip-0")).toBeTruthy();
    expect(screen.getByText("To Do 2")).toBeTruthy();
    // The tile shows the Due Date FIELD (2026-11-25), not the card's own column, and its priority.
    const tile = screen.getAllByTestId("flow-card")[0];
    expect(tile.props.accessibilityLabel).toContain("Priority High");
    expect(tile.props.accessibilityLabel).toMatch(/Nov/);
    expect(tile.props.accessibilityLabel).toContain("Assigned to Member Person");
  });

  it("gives a viewer no way to change the board", async () => {
    mock.onGet(`${B}/projects/7/board`).reply(200, boardAs("viewer"));
    renderScreen(<Board />);
    await screen.findByText("Write the brief");
    expect(screen.queryByTestId("flow-column-1-add")).toBeNull();
    expect(screen.queryByTestId("flow-column-1-menu")).toBeNull();
    fireEvent(screen.getAllByTestId("flow-card")[0], "longPress");
    const menu = screen.getByTestId("flow-card-menu");
    expect(within(menu).getByText("Open")).toBeTruthy();
    expect(within(menu).queryByText("Move to…")).toBeNull();
    expect(within(menu).queryByText("Delete card")).toBeNull();
  });

  it("adds a card at once, in the column AND the sprint being shown", async () => {
    let hold!: () => void;
    const held = new Promise<void>((r) => (hold = r));
    mock.onGet(`${B}/projects/7/board`).reply(200, boardAs("member"));
    mock.onPost(`${B}/projects/7/cards`).reply(async () => {
      await held;
      return [201, { card: { ...cardsOnly[0], id: 950, title: "[qa] New", position: 3, field_values: {} } }];
    });
    mockParams.current = { id: "7", sprint: "30" };
    renderScreen(<Board />);
    await screen.findByTestId("flow-column-1");
    fireEvent.press(screen.getByTestId("flow-column-1-add"));
    fireEvent.changeText(screen.getByTestId("flow-quick-add-input"), "[qa] New");
    fireEvent.press(screen.getByTestId("flow-quick-add-submit"));
    expect(await screen.findByText("[qa] New")).toBeTruthy();
    expect(bodies("post", `${B}/projects/7/cards`)).toEqual([{ card: { title: "[qa] New", flow_app_column_id: 11, flow_app_sprint_id: 30 } }]);
    hold();
  });

  // Device, 2026-11-20 (qa_phone3): one Enter on Android fired
  // onSubmitEditing twice and the server got the same card twice; the two
  // guesses also shared `-Date.now()` as their id, a duplicate list key.
  it("sends a card ONCE when one Enter fires submit twice, and two quick adds in one millisecond keep distinct rows", async () => {
    let hold!: () => void;
    const held = new Promise<void>((r) => (hold = r));
    mock.onGet(`${B}/projects/7/board`).reply(200, boardAs("member"));
    let n = 0;
    mock.onPost(`${B}/projects/7/cards`).reply(async (cfg) => {
      await held;
      const title = JSON.parse(cfg.data).card.title;
      return [201, { card: { ...cardsOnly[0], id: 960 + n++, title, position: 9, field_values: {} } }];
    });
    const now = jest.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const errors = jest.spyOn(console, "error");
    try {
      renderScreen(<Board />);
      await screen.findByTestId("flow-column-1");
      fireEvent.press(screen.getByTestId("flow-column-1-add"));
      const input = screen.getByTestId("flow-quick-add-input");
      fireEvent.changeText(input, "[qa] Once");
      // Both events in one batch, as the device delivers them: no re-render between.
      act(() => {
        input.props.onSubmitEditing();
        input.props.onSubmitEditing();
      });
      fireEvent.changeText(input, "[qa] Twice");
      fireEvent(input, "submitEditing");
      expect(await screen.findByText("[qa] Twice")).toBeTruthy();
      expect(screen.getAllByText("[qa] Once")).toHaveLength(1);
      expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
      expect(bodies("post", `${B}/projects/7/cards`).map((b) => (b as { card: { title: string } }).card.title)).toEqual(["[qa] Once", "[qa] Twice"]);
    } finally {
      now.mockRestore();
      errors.mockRestore();
      hold();
    }
  });

  it("moves a card to the next column through `move`, then sends both columns' order", async () => {
    mock.onGet(`${B}/projects/7/board`).reply(200, boardAs("member"));
    mock.onPut(`${B}/projects/7/cards/900/move`).reply(200, { card: { ...cardsOnly[0], flow_app_column_id: 15 } });
    mock.onPut(`${B}/projects/7/cards/reorder`).reply(204);
    renderScreen(<Board />);
    await screen.findByText("Write the brief");
    fireEvent(screen.getAllByTestId("flow-card")[0], "longPress");
    fireEvent.press(within(screen.getByTestId("flow-card-menu")).getByText("Move to Done"));
    await waitFor(() => expect(bodies("put", `${B}/projects/7/cards/reorder`)).toHaveLength(1));
    expect(bodies("put", `${B}/projects/7/cards/900/move`)).toEqual([{ card: { flow_app_column_id: 15, flow_app_sprint_id: null, position: 1 } }]);
    expect(bodies("put", `${B}/projects/7/cards/reorder`)[0]).toEqual({ columns: [{ column_id: 15, ordered_ids: [900] }, { column_id: 11, ordered_ids: [901] }] });
  });

  it("puts the card back where it was when the server refuses the move, and says why", async () => {
    mock.onGet(`${B}/projects/7/board`).reply(200, boardAs("member"));
    mock.onPut(`${B}/projects/7/cards/900/move`).reply(403, {});
    renderScreen(<Board />);
    await screen.findByText("Write the brief");
    fireEvent(screen.getAllByTestId("flow-card")[0], "longPress");
    fireEvent.press(within(screen.getByTestId("flow-card-menu")).getByText("Move to Done"));
    expect(await screen.findByTestId("flow-board-failure")).toBeTruthy();
    expect(screen.getByText("To Do 2")).toBeTruthy();
  });

  it("filters by priority, counting what is shown against the column's whole", async () => {
    mock.onGet(`${B}/projects/7/board`).reply(200, boardAs("member"));
    renderScreen(<Board />);
    await screen.findByText("Write the brief");
    fireEvent.press(screen.getByTestId("flow-filter-button"));
    fireEvent.press(screen.getByTestId("flow-filter-priority-high"));
    fireEvent.press(screen.getByTestId("flow-filter-done"));
    expect(screen.queryByText("Second")).toBeNull();
    expect(screen.getByTestId("flow-column-1-count").props.children).toBe("1 of 2");
  });

  it("follows the next page until the server says there is no more", async () => {
    mock.onGet(`${B}/projects/7/board`, { params: { sprint: "all", page: 1, limit: 100 } }).reply(200, boardAs("member", { cards: [cardsOnly[0]], page: { page: 1, total: 2, has_more: true, next_page: 2 } }));
    mock.onGet(`${B}/projects/7/board`, { params: { sprint: "all", page: 2, limit: 100 } }).reply(200, boardAs("member", { cards: [cardsOnly[1]], page: { page: 2, total: 2, has_more: false, next_page: null } }));
    renderScreen(<Board />);
    expect(await screen.findByText("Second")).toBeTruthy();
    expect(screen.getByText("Write the brief")).toBeTruthy();
  });

  it("reads an older server's whole board, and does not offer every sprint it cannot give", async () => {
    mock.onGet(`${B}/projects/7/board`).reply(200, { ...board, cards: cardsOnly });
    renderScreen(<Board />);
    await screen.findByText("Write the brief");
    expect(screen.getByTestId("flow-sprint-chip").props.accessibilityLabel).toContain("Not in a sprint");
    fireEvent.press(screen.getByTestId("flow-sprint-chip"));
    expect(screen.queryByTestId("flow-scope-all")).toBeNull();
  });
});

describe("a card", () => {
  /**
   * A tiny server for one card: writes change `db` and reads answer from it,
   * so the refetch after a write sees what the write did (a static fixture
   * would put the old value back and hide the change).
   */
  let db: { card: (typeof cardsOnly)[number] & { field_values: Record<string, unknown> }; comments: unknown[] };
  beforeEach(() => {
    mockParams.current = { projectId: "7", id: "900" };
    db = {
      card: JSON.parse(JSON.stringify(cardsOnly[0])),
      comments: [{ id: 1, content: "Looks good", user: { id: 2, name: "Member Person" }, created_at: "2026-11-19T10:00:00Z", updated_at: "" }],
    };
    mock.onGet(`${B}/projects/7/board`).reply(200, boardAs("member"));
    mock.onGet(`${B}/projects/7/cards/900`).reply(() => [200, { card: db.card }]);
    mock.onGet(`${B}/projects/7/cards/900/comments`).reply(() => [200, { comments: db.comments }]);
    mock.onPatch("/api/v1/core/field_values/batch_update").reply((cfg) => {
      const { values } = JSON.parse(cfg.data) as { values: Record<string, unknown> };
      for (const [k, v] of Object.entries(values)) db.card.field_values[k] = { scalar_value: v };
      return [200, { field_values: {} }];
    });
    mock.onPost(`${B}/projects/7/cards/900/comments`).reply((cfg) => {
      const made = { id: 2, content: JSON.parse(cfg.data).comment.content, user: { id: 1, name: "Owner Person" }, created_at: "2026-11-20T10:00:00Z", updated_at: "" };
      db.comments.push(made);
      return [201, { comment: made }];
    });
  });

  it("shows every field by type, and comment authors by name", async () => {
    renderScreen(<CardScreen />);
    expect(await screen.findByText("Write the brief")).toBeTruthy();
    expect(await screen.findByTestId("flow-field-priority")).toBeTruthy();
    expect(screen.getByTestId("flow-field-story_points-value").props.children).toBe("5");
    expect(screen.getByTestId("flow-field-labels").props.accessibilityLabel).toBe("Labels: Bug");
    expect(screen.getByTestId("flow-field-spec").props.accessibilityLabel).toBe("Spec: spec.pdf");
    expect(await screen.findByText("Looks good")).toBeTruthy();
    // The author by name (the web shows an id); the same person is also the card's assignee.
    expect(screen.getAllByText("Member Person").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("2")).toBeNull();
  });

  it("saves a number field in the batch, refusing one over the field's maximum", async () => {
    renderScreen(<CardScreen />);
    fireEvent.press(await screen.findByTestId("flow-field-story_points"));
    fireEvent.changeText(screen.getByTestId("flow-field-story_points-sheet-input"), "1000");
    fireEvent.press(screen.getByTestId("flow-field-story_points-sheet-save"));
    expect(screen.getByTestId("flow-field-story_points-sheet-error").props.children).toBe("At most 999.");
    fireEvent.changeText(screen.getByTestId("flow-field-story_points-sheet-input"), "8");
    fireEvent.press(screen.getByTestId("flow-field-story_points-sheet-save"));
    await waitFor(() => expect(bodies("patch", "/api/v1/core/field_values/batch_update")).toEqual([{ record_type: "FlowApp::Card", record_id: 900, values: { 102: 8 } }]));
    await waitFor(() => expect(screen.getByTestId("flow-field-story_points-value").props.children).toBe("8"));
  });

  it("sets a priority with one tap", async () => {
    renderScreen(<CardScreen />);
    fireEvent.press(await screen.findByTestId("flow-field-priority"));
    fireEvent.press(screen.getByTestId("flow-field-priority-sheet-critical"));
    await waitFor(() => expect(bodies("patch", "/api/v1/core/field_values/batch_update")).toEqual([{ record_type: "FlowApp::Card", record_id: 900, values: { 101: "critical" } }]));
  });

  it("adds a comment at once, as the person writing it", async () => {
    renderScreen(<CardScreen />);
    await screen.findByText("Looks good");
    fireEvent.changeText(screen.getByTestId("flow-comment-input"), "[qa] Done");
    fireEvent.press(screen.getByTestId("flow-comment-send"));
    expect(await screen.findByText("[qa] Done")).toBeTruthy();
    expect(bodies("post", `${B}/projects/7/cards/900/comments`)).toEqual([{ comment: { content: "[qa] Done" } }]);
  });

  it("shows history as sentences that name the columns", async () => {
    mock.onGet(`${B}/projects/7/cards/900/histories`).reply(200, {
      card_histories: [{ id: 1, event_type: "column_changed", payload: { from: 10, to: 11 }, created_at: "2026-11-19T10:00:00Z", user: { id: 1, name: "Owner Person" } }],
      meta: { pagy: { page: 1, pages: 1 } },
    });
    renderScreen(<CardScreen />);
    await screen.findByText("Write the brief");
    fireEvent.press(screen.getByTestId("flow-card-tabs-history"));
    expect(await screen.findByText(/moved it from Backlog to To Do/)).toBeTruthy();
  });

  it("gives a viewer the card to read and comment on, and nothing to edit", async () => {
    mock.onGet(`${B}/projects/7/board`).reply(200, boardAs("viewer"));
    renderScreen(<CardScreen />);
    await screen.findByTestId("flow-field-priority");
    expect(screen.getByTestId("flow-field-priority").props.accessibilityRole).toBeUndefined();
    expect(screen.getByTestId("flow-card-title").props.accessibilityRole).toBe("header");
    expect(screen.getByTestId("flow-comment-input")).toBeTruthy();
  });
});

describe("columns and fields", () => {
  beforeEach(() => {
    mockParams.current = { id: "7" };
    mock.onGet(`${B}/projects/7`).reply(200, { project: { ...board.project, my_role: "admin" } });
  });

  it("deletes a column only after saying where its cards go", async () => {
    mock.onGet(`${B}/projects/7/columns`).reply(200, { columns: board.columns });
    mock.onDelete(`${B}/projects/7/columns/10`).reply(204);
    const alert = jest.spyOn(Alert, "alert");
    renderScreen(<Columns />);
    await screen.findByText("Backlog");
    fireEvent.press(screen.getAllByTestId("flow-column-delete")[0]);
    expect(alert.mock.calls[0][1]).toBe("Its cards move to “To Do”.");
    expect(mock.history.delete).toHaveLength(0);
    alert.mock.calls[0][2]?.find((b) => b.style === "destructive")?.onPress?.();
    await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toEqual([`${B}/projects/7/columns/10`]));
    alert.mockRestore();
  });

  it("names every field's type in words and adds a select field with its options", async () => {
    mock.onGet("/api/v1/core/field_definitions").reply(200, { field_definitions: board.field_definitions });
    mock.onGet("/api/v1/core/tag_categories").reply(200, { tag_categories: [{ id: 50, name: "Labels", tags: [] }] });
    mock.onPost("/api/v1/core/field_definitions").reply(201, { field_definition: { ...board.field_definitions[0], id: 130, name: "Size", key: "size" } });
    renderScreen(<Fields />);
    expect(await screen.findByText("Single choice")).toBeTruthy();
    expect(screen.getByText("Several links · People")).toBeTruthy();
    fireEvent.press(screen.getByTestId("flow-fields-add"));
    fireEvent.changeText(screen.getByTestId("flow-field-name"), "Size");
    fireEvent.press(screen.getByTestId("flow-field-type"));
    fireEvent.press(screen.getByTestId("flow-field-type-single_select"));
    fireEvent.press(screen.getByTestId("flow-field-save"));
    expect(await screen.findByTestId("flow-field-problem")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("flow-option-new"), "Small");
    fireEvent.press(screen.getByTestId("flow-option-add"));
    fireEvent.press(screen.getByTestId("flow-field-save"));
    await waitFor(() => expect(bodies("post", "/api/v1/core/field_definitions")).toHaveLength(1));
    expect(bodies("post", "/api/v1/core/field_definitions")[0].field_definition).toMatchObject({
      owner_type: "FlowApp::Project", owner_id: 7, name: "Size", field_type: "single_select", record_class: null, required: false,
      config: { options: [{ value: "small", label: "Small", color: "#3b82f6" }] },
    });
  });
});
