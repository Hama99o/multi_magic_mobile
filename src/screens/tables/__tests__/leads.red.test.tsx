/**
 * LEADS (ee's review of feat/tables, 2026-11-21): red tests, one block per lead.
 *
 * L1: an Undo that fails is silent: the toast goes and nothing says the rows are still gone.
 * L2: the selection outlives a table switch (`router.setParams`), so a bulk action on table B
 *     would send table A's row ids. The web resets it on the table only (`TableScreen.tsx:406`).
 * L3: bulk edit says "N rows changed" while the server's `result.failed` names rows it refused.
 * L4: undoing a kanban move offers a second Undo whose "before" is null: tapping it clears the field.
 */
import MockAdapter from "axios-mock-adapter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { configure, act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { Alert } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useTablesUndo } from "@/stores/tablesUndo.store";
import TableScreen from "../../../../app/tables/table";
import RecordScreen from "../../../../app/tables/record";

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

const base = (role = "editor") => ({
  bases: [
    {
      id: 3, name: "[qa] Shop", description: null, icon: null, color: "#10b981", created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-19T10:00:00Z", owner: { id: 1, name: "QA" }, role,
      tables: [
        { id: 10, name: "Items", position: 0 },
        { id: 11, name: "Orders", position: 1 },
      ].map((t) => ({ ...t, base_id: 3, icon: null, color: null, description: null, updated_at: "2026-11-19T10:00:00Z" })),
      record_counts: {},
    },
  ],
});
const field = (id: number, name: string, field_type: string, config: Record<string, unknown> = {}) => ({
  id, name, key: `f${id}`, field_type, record_class: null, core_tag_category_id: null, position: id, required: false, config, owner_type: "TableApp::Table", owner_id: 10,
});
const view = (id: number, tableId: number, name: string, view_type: string, config: Record<string, unknown> = {}) => ({ id, table_id: tableId, name, view_type, position: 0, config });
const status = field(2, "Status", "single_select", { options: [{ value: "in", label: "In stock", color: "#10b981" }, { value: "out", label: "Sold out", color: "#ef4444" }] });
const tableBody = (id: number, name: string, views = [view(70 + id, id, "Grid", "grid")]) => ({
  table: { id, base_id: 3, name, icon: null, color: null, description: null, position: 0, updated_at: "2026-11-18T10:00:00Z", fields: [field(1, "Name", "text"), status], relations: {}, primary_field_id: 1, view: views[0], views },
});
const row = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id, position: id, created_at: new Date(Date.UTC(2026, 10, 19, 9, 0, id % 60)).toISOString(), updated_at: "2026-11-19T09:30:00Z",
  values: { "1": { scalar_value: name }, ...extra },
});
const page = (records: unknown[], meta: Record<string, unknown> = {}) => ({ records, meta: { offset: 0, limit: 100, has_more: false, total_count: records.length, table_total: records.length, ...meta } });
const hat = row(502, "Red hat", { "2": { scalar_value: "out" } });
const scarf = row(501, "Blue scarf", { "2": { scalar_value: "in" } });

/** One client for the whole test, so a re-render after a param change is the SAME mounted screen. */
function mount() {
  const client = testQueryClient();
  const tree = () => (
    <QueryClientProvider client={client}>
      <TableScreen />
    </QueryClientProvider>
  );
  const out = render(tree());
  return { ...out, again: () => out.rerender(tree()) };
}

const selectBoth = async () => {
  const out = mount();
  await screen.findByText("Red hat");
  await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
  fireEvent(screen.getByTestId("tables-card-0"), "longPress");
  fireEvent.press(screen.getByTestId("tables-card-1"));
  expect(screen.getByTestId("tables-bulk-count").props.children).toBe("2 rows selected");
  return out;
};
const bulkEditToIn = async () => {
  fireEvent.press(screen.getByTestId("tables-bulk-edit-open"));
  fireEvent.press(await screen.findByTestId("tables-bulk-field-2"));
  fireEvent.press(screen.getByTestId("tables-bulk-value-in"));
  fireEvent.press(screen.getByTestId("tables-bulk-edit-apply"));
};
const alertMessages = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => c[0]);

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mockParams.current = { id: "10", base: "3" };
  jest.spyOn(require("react-native"), "useWindowDimensions").mockReturnValue({ width: 411, height: 900, scale: 2, fontScale: 1 });
  useTablesUndo.getState().clear();
  await AsyncStorage.clear();
  await i18n.changeLanguage("en");
  mock.onGet(`${B}/bases`).reply(200, base());
  mock.onGet(`${B}/tables/10`).reply(200, tableBody(10, "Items"));
  mock.onGet(`${B}/tables/10/records`).reply(200, page([hat, scarf]));
  mock.onGet(`${B}/tables/10/imports/latest`).reply(200, { import: null });
});
afterEach(() => {
  jest.restoreAllMocks();
  mock.restore();
});

describe("L1: a failed Undo tells the person", () => {
  it("bulk delete: when the restore fails, the screen says the rows could not be brought back", async () => {
    mock.onPost(`${B}/tables/10/records/bulk_destroy`).reply(200, { deleted: 2, ids: [502, 501] });
    mock.onPost(`${B}/tables/10/records/restore`).reply(500);
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.text === "Delete")?.onPress?.());
    await selectBoth();
    fireEvent.press(screen.getByTestId("tables-bulk-delete"));
    await waitFor(() => expect(useTablesUndo.getState().offer?.message).toBe("2 rows deleted"));
    await act(async () => useTablesUndo.getState().offer?.undo?.());
    expect((await screen.findByTestId("tables-failure")).props.accessibilityLabel).toBe("Could not undo. Try again.");
  });

  it("bulk edit: when writing the old values back fails, the screen says so", async () => {
    let calls = 0;
    mock.onPost(`${B}/tables/10/records/bulk_write`).reply(() => (calls++ === 0 ? [200, { result: { created: 0, updated: 2, ids: [502, 501], failed: [] }, records: [] }] : [500]));
    await selectBoth();
    await bulkEditToIn();
    await waitFor(() => expect(useTablesUndo.getState().offer?.message).toBe("2 rows changed"));
    await act(async () => useTablesUndo.getState().offer?.undo?.());
    expect((await screen.findByTestId("tables-failure")).props.accessibilityLabel).toBe("Could not undo. Try again.");
  });

  it("a row's page: the row was deleted and the page left; a failed restore is said in an alert", async () => {
    mockParams.current = { table: "10", id: "501" };
    mock.onGet(`${B}/records/501`).reply(200, { record: scarf });
    mock.onDelete(`${B}/records/501`).reply(204);
    mock.onPost(`${B}/tables/10/records/restore`).reply(500);
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.text === "Delete")?.onPress?.());
    render(
      <QueryClientProvider client={testQueryClient()}>
        <RecordScreen />
      </QueryClientProvider>,
    );
    await screen.findByTestId("tables-record-title");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent.press(screen.getByTestId("tables-record-menu"));
    fireEvent.press(await screen.findByText("Delete the row"));
    await waitFor(() => expect(useTablesUndo.getState().offer?.message).toBe("Row deleted"));
    await act(async () => useTablesUndo.getState().offer?.undo?.());
    await waitFor(() => expect(alertMessages(alert)).toContain("Could not undo. Try again."));
  });

  it("clear the data: a failed restore of the batch is said in an alert", async () => {
    mock.onPost(`${B}/tables/10/clear`).reply(200, { deleted: 25, trashed_at: "2026-11-20T23:40:00.123456Z" });
    mock.onPost(`${B}/tables/10/records/restore`).reply(500);
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === "destructive")?.onPress?.());
    mount();
    await screen.findByText("Red hat");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent.press(screen.getByTestId("tables-menu"));
    fireEvent.press(await within(await screen.findByTestId("tables-options")).findByText("Clear the data…"));
    await waitFor(() => expect(useTablesUndo.getState().offer?.message).toBe("25 rows cleared"));
    await act(async () => useTablesUndo.getState().offer?.undo?.());
    await waitFor(() => expect(alertMessages(alert)).toContain("Could not undo. Try again."));
  });

  it("the import banner: a Stop the server refuses is said, not dropped", async () => {
    const imp = { id: 4, table_id: 10, status: "running", filename: "stock.csv", total_rows: 200, processed_rows: 50, created_count: 0, updated_count: 0, error_count: 0, error_message: null, cancel_requested: false, percent: 25, has_errors: false, dismissed_at: null };
    mock.onGet(`${B}/tables/10/imports/latest`).reply(200, { import: imp });
    mock.onPost(`${B}/imports/4/cancel`).reply(500);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    mount();
    await screen.findByTestId("tables-import-banner-line");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent.press(await screen.findByTestId("tables-import-banner-stop"));
    await waitFor(() => expect(alertMessages(alert)).toContain("That did not go through. Try again."));
  });
});

describe("L2: the selection belongs to one table", () => {
  it("switching to another table clears the selection, so no bulk action can send the first table's rows", async () => {
    mock.onGet(`${B}/tables/11`).reply(200, tableBody(11, "Orders"));
    mock.onGet(`${B}/tables/11/records`).reply(200, page([row(601, "Order one")]));
    mock.onGet(`${B}/tables/11/imports/latest`).reply(200, { import: null });
    const { again } = await selectBoth();
    expect(screen.getByTestId("tables-bulk-bar")).toBeTruthy();
    // What switchTable's router.setParams does on a device: the same screen, new params.
    mockParams.current = { id: "11", base: "3" };
    again();
    await screen.findByText("Order one");
    expect(screen.queryByTestId("tables-bulk-bar")).toBeNull();
  });
});

describe("L3: bulk edit reports rows the server refused", () => {
  it("some rows refused: the toast says how many changed and how many could not be", async () => {
    mock.onPost(`${B}/tables/10/records/bulk_write`).reply(200, { result: { created: 0, updated: 1, ids: [502], failed: [{ row: 2, error: "not an option" }] }, records: [] });
    await selectBoth();
    await bulkEditToIn();
    await waitFor(() => expect(useTablesUndo.getState().offer?.message).toBe("1 row changed, 1 could not be"));
  });

  it("every row refused: it is an error, the sheet stays open, and no 'changed' is claimed", async () => {
    mock.onPost(`${B}/tables/10/records/bulk_write`).reply(200, { result: { created: 0, updated: 0, ids: [], failed: [{ row: 1, error: "no" }, { row: 2, error: "no" }] }, records: [] });
    await selectBoth();
    await bulkEditToIn();
    expect((await screen.findByTestId("tables-bulk-error")).props.children).toBe("The rows could not be changed.");
    expect(useTablesUndo.getState().offer).toBeNull();
  });
});

describe("L4: undoing a kanban move never clears the field", () => {
  it("Undo puts the card back; a second Undo never writes null", async () => {
    mock.onGet(`${B}/tables/10`).reply(200, tableBody(10, "Items", [view(73, 10, "Board", "kanban", { kanban_field_id: 2 })]));
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf], { groups: [{ value: "in", count: 1 }] }));
    mock.onPatch(`${B}/records/501`).reply(200, { record: scarf });
    mount();
    fireEvent(await screen.findByTestId("tables-kanban-0-card-0"), "longPress");
    fireEvent.press(await within(await screen.findByTestId("tables-kanban-move")).findByText("Sold out"));
    await waitFor(() => expect(mock.history.patch.length).toBe(1));
    await waitFor(() => expect(useTablesUndo.getState().offer?.undo).toBeTruthy());
    const first = useTablesUndo.getState().offer;
    await act(async () => first?.undo?.());
    await waitFor(() => expect(mock.history.patch.length).toBe(2));
    expect(JSON.parse(mock.history.patch[1].data)).toEqual({ record: { values: { "2": "in" } } });
    // Whatever the screen offers after the undo, taking it must not empty the column.
    await act(async () => undefined);
    const second = useTablesUndo.getState().offer;
    if (second && second !== first && second.undo) {
      await act(async () => second.undo?.());
      await waitFor(() => expect(mock.history.patch.length).toBe(3));
    }
    expect(mock.history.patch.map((r) => JSON.parse(r.data).record.values["2"])).not.toContain(null);
  });
});
