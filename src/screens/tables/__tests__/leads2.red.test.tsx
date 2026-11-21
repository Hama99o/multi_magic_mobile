/**
 * LEADS, ROUND 2 (ee's review of feat/tables, 2026-11-21): red tests, one block per lead.
 *
 * M1: the kanban column's "+" and the calendar's "+" create with no guard: a double tap makes two rows.
 * M2: (a) the base's delete sheet counts rows from a bases list nothing refreshes after a row is added;
 *     (b) an import that made new columns does not show them until a refresh (the table is not re-read).
 * M3: the form builder saves the whole questions array from the cache, so two quick edits overwrite each other.
 */
import MockAdapter from "axios-mock-adapter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { configure, act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useTablesUndo } from "@/stores/tablesUndo.store";
import TableScreen from "../../../../app/tables/table";
import FormScreen from "../../../../app/tables/form";

configure({ asyncUtilTimeout: 5_000 });

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
  useNavigation: () => ({ addListener: jest.fn(() => () => undefined), dispatch: jest.fn() }),
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock("expo-clipboard", () => require("@/__tests__/screenMocks").clipboard);
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));

const B = "/api/v1/table_app";
let mock: MockAdapter;

/** Two taps in the same frame, before any re-render: what a double tap is. */
const doubleTap = (el: Parameters<typeof fireEvent.press>[0]) => {
  fireEvent.press(el);
  fireEvent.press(el);
};

const base = (rows: number, role = "owner") => ({
  bases: [
    {
      id: 3, name: "[qa] Shop", description: null, icon: null, color: "#10b981", created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-19T10:00:00Z", owner: { id: 1, name: "QA" }, role,
      tables: [
        { id: 10, name: "Items", position: 0 },
        { id: 11, name: "Orders", position: 1 },
      ].map((t) => ({ ...t, base_id: 3, icon: null, color: null, description: null, updated_at: "2026-11-19T10:00:00Z" })),
      record_counts: { "10": rows },
    },
  ],
});
const field = (id: number, name: string, field_type: string, config: Record<string, unknown> = {}) => ({
  id, name, key: `f${id}`, field_type, record_class: null, core_tag_category_id: null, position: id, required: false, config, owner_type: "TableApp::Table", owner_id: 10,
});
const view = (id: number, name: string, view_type: string, config: Record<string, unknown> = {}) => ({ id, table_id: 10, name, view_type, position: 0, config });
const status = field(2, "Status", "single_select", { options: [{ value: "in", label: "In stock", color: "#10b981" }, { value: "out", label: "Sold out", color: "#ef4444" }] });
const tableBody = (views = [view(70, "Grid", "grid")], extra: unknown[] = []) => ({
  table: { id: 10, base_id: 3, name: "Items", icon: null, color: null, description: null, position: 0, updated_at: "2026-11-18T10:00:00Z", fields: [field(1, "Name", "text"), status, field(6, "Due", "date"), ...extra], relations: {}, primary_field_id: 1, view: views[0], views },
});
const row = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id, position: id, created_at: new Date(Date.UTC(2026, 10, 19, 9, 0, id % 60)).toISOString(), updated_at: "2026-11-19T09:30:00Z",
  values: { "1": { scalar_value: name }, ...extra },
});
const page = (records: unknown[], meta: Record<string, unknown> = {}) => ({ records, meta: { offset: 0, limit: 100, has_more: false, total_count: records.length, table_total: records.length, ...meta } });
const scarf = row(501, "Blue scarf", { "2": { scalar_value: "in" } });

const mount = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <TableScreen />
    </QueryClientProvider>,
  );
const tableReads = () => mock.history.get.filter((r) => r.url === `${B}/tables/10`).length;

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mockParams.current = { id: "10", base: "3" };
  jest.spyOn(require("react-native"), "useWindowDimensions").mockReturnValue({ width: 411, height: 900, scale: 2, fontScale: 1 });
  useTablesUndo.getState().clear();
  await AsyncStorage.clear();
  await i18n.changeLanguage("en");
  mock.onGet(`${B}/bases`).reply(200, base(1));
  mock.onGet(`${B}/tables/10`).reply(200, tableBody());
  mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
  mock.onGet(`${B}/tables/10/imports/latest`).reply(200, { import: null });
  mock.onPost(`${B}/tables/10/records`).reply(201, { record: row(779, "") });
});
afterEach(() => {
  jest.restoreAllMocks();
  mock.restore();
});

describe("M1: a double tap on a board's or a calendar's + makes one row", () => {
  it("kanban: the column's + tapped twice in one frame sends one create", async () => {
    mockParams.current = { id: "10", base: "3", view: "73" };
    mock.onGet(`${B}/tables/10`).reply(200, tableBody([view(73, "Board", "kanban", { kanban_field_id: 2 })]));
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf], { groups: [{ value: "in", count: 1 }] }));
    mount();
    doubleTap(await screen.findByTestId("tables-kanban-add-1"));
    await waitFor(() => expect(mock.history.post.length).toBeGreaterThan(0));
    await act(async () => undefined);
    expect(mock.history.post).toHaveLength(1);
  });

  it("calendar: the day's + tapped twice in one frame sends one create", async () => {
    mockParams.current = { id: "10", base: "3", view: "74" };
    mock.onGet(`${B}/tables/10`).reply(200, tableBody([view(74, "When", "calendar", { calendar_field_id: 6 })]));
    mock.onGet(`${B}/tables/10/records`).reply(200, page([]));
    mount();
    doubleTap(await screen.findByTestId("tables-calendar-add"));
    await waitFor(() => expect(mock.history.post.length).toBeGreaterThan(0));
    await act(async () => undefined);
    expect(mock.history.post).toHaveLength(1);
  });
});

describe("M2: what a delete or an import changed is shown without a refresh", () => {
  it("(a) the base's delete sheet counts the row just added", async () => {
    let reads = 0;
    mock.onGet(`${B}/bases`).reply(() => [200, base(reads++ === 0 ? 1 : 2)]);
    mount();
    await screen.findByText("Blue scarf");
    await waitFor(() => expect(reads).toBe(1));
    fireEvent.press(screen.getByTestId("tables-add-row"));
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    fireEvent.press(screen.getByTestId("tables-menu"));
    fireEvent.press(await screen.findByText("Delete the whole base…"));
    await waitFor(() => expect(screen.getByTestId("tables-delete-base-impact").props.children).toBe("Its 2 tables and 2 rows are deleted, for everyone it is shared with."));
  });

  it("(b) an import that finishes re-reads the table, so the columns it made show", async () => {
    const imp = { id: 4, table_id: 10, status: "running", filename: "stock.csv", total_rows: 2, processed_rows: 1, created_count: 0, updated_count: 0, error_count: 0, error_message: null, cancel_requested: false, percent: 50, has_errors: false, dismissed_at: null };
    let polls = 0;
    mock.onGet(`${B}/tables/10/imports/latest`).reply(() => [200, { import: polls++ === 0 ? imp : { ...imp, status: "done", processed_rows: 2, created_count: 2, percent: 100 } }]);
    mock.onGet(`${B}/tables/10`).reply(() => [200, polls > 1 ? tableBody(undefined, [field(9, "Supplier", "text")]) : tableBody()]);
    mount();
    await screen.findByTestId("tables-import-banner-line");
    await waitFor(() => expect(polls).toBe(1));
    const before = tableReads();
    await waitFor(() => expect(polls).toBe(2), { timeout: 6_000 });
    await waitFor(() => expect(tableReads()).toBeGreaterThan(before));
  });
});

describe("M3: two quick edits in the form builder both survive", () => {
  const form = (fields: unknown[]) => ({
    id: 7, table_id: 10, base_id: 3, name: "Orders", slug: "abc123", access_mode: "public", fields,
    settings: {}, accepting: true, allow_multiple: false, closes_at: null, max_submissions: null, submissions_count: 0, closed: false, cover_url: null,
    available_fields: [{ id: 1, name: "Name", field_type: "text", required: true, supported: true }, { id: 2, name: "Phone", field_type: "phone", required: false, supported: true }],
    invites: [],
  });
  const q = (field_id: number, label: string | null) => ({ field_id, label, help: null, placeholder: null, required: field_id === 1, hidden: false });

  it("renaming question 1 then question 2 before the first save returns: the second save carries both", async () => {
    mockParams.current = { id: "7", table: "10" };
    mock.onGet(`${B}/forms/7`).reply(200, { form: form([q(1, null), q(2, null)]) });
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => (release = r));
    let patches = 0;
    // The first save is held open; every save answers with what it was sent, as the server does.
    mock.onPatch(`${B}/forms/7`).reply(async (config) => {
      const sent = JSON.parse(config.data).form.fields;
      if (patches++ === 0) await held;
      return [200, { form: form(sent) }];
    });
    try {
      render(
        <QueryClientProvider client={testQueryClient()}>
          <FormScreen />
        </QueryClientProvider>,
      );
      const first = await screen.findByTestId("tables-form-question-0-label");
      fireEvent.changeText(first, "Your name");
      fireEvent(first, "endEditing");
      await waitFor(() => expect(patches).toBe(1));
      const second = screen.getByTestId("tables-form-question-1-label");
      fireEvent.changeText(second, "Your phone");
      fireEvent(second, "endEditing");
      await act(async () => undefined);
      release();
      await waitFor(() => expect(mock.history.patch).toHaveLength(2));
      const labels = (i: number) => JSON.parse(mock.history.patch[i].data).form.fields.map((f: { label: string }) => f.label);
      expect(labels(1)).toEqual(["Your name", "Your phone"]);
    } finally {
      release();
    }
  });
});
