/**
 * Tables increment 1, screen by screen, at the HTTP layer: the real API
 * functions and parsers run, and what the phone ASKS is asserted by its
 * parameters (`docs/design/tables/inc-1/MANIFEST.md`).
 *
 * The owner's rule (SPEC C1) is a test here: nothing the person does on these
 * screens sends a PATCH to a view.
 *
 * What this cannot see: a pixel, a French string at 360 dp, the list's
 * scrolling. Those are the device's.
 */
import MockAdapter from "axios-mock-adapter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { Alert, StyleSheet } from "react-native";
import { useTablesUndo } from "@/stores/tablesUndo.store";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { tablesKeys } from "@/api/keys";
import { a11yFindings } from "@/__tests__/a11ySweep";

import { router as mockedRouter } from "expo-router";
import Bases from "../../../../app/tables";
import TableScreen from "../../../../app/tables/table";
import RecordScreen from "../../../../app/tables/record";

/** Two taps in the same frame, before any re-render: what a double tap is. A guard that is only `disabled={isPending}` lets both through. */
const doubleTap = (el: Parameters<typeof fireEvent.press>[0]) => {
  fireEvent.press(el);
  fireEvent.press(el);
};

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
  useNavigation: () => ({ addListener: jest.fn(() => () => undefined), dispatch: jest.fn() }),
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock("expo-clipboard", () => require("@/__tests__/screenMocks").clipboard);
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));

const router = mockedRouter as unknown as { push: jest.Mock; setParams: jest.Mock; back: jest.Mock };
const B = "/api/v1/table_app";
let mock: MockAdapter;

function renderScreen(element: ReactElement) {
  return render(<QueryClientProvider client={testQueryClient()}>{element}</QueryClientProvider>);
}

const base = (id: number, name: string, tables: { id: number; name: string; position: number }[], counts: Record<string, number> = {}) => ({
  id,
  name,
  description: null,
  icon: null,
  color: "#10b981",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-19T10:00:00Z",
  owner: { id: 1, name: "QA" },
  role: "owner",
  tables: tables.map((t) => ({ ...t, base_id: id, icon: null, color: null, description: null, updated_at: "2026-11-19T10:00:00Z" })),
  record_counts: counts,
});

const field = (id: number, name: string, field_type: string, config: Record<string, unknown> = {}) => ({
  id, name, key: `f${id}`, field_type, record_class: field_type === "multi_record" ? "TableApp::Record" : null, core_tag_category_id: null, position: id, required: false, config, owner_type: "TableApp::Table", owner_id: 10,
});
const view = (id: number, name: string, view_type: string, config: Record<string, unknown> = {}) => ({ id, table_id: 10, name, view_type, position: id - 70, config });

const tableBody = (views = [view(70, "Grid", "grid", { row_height: "tall" }), view(71, "Pictures", "gallery", { cover_field_id: 4 })]) => ({
  table: {
    id: 10, base_id: 3, name: "Items", icon: null, color: null, description: "What we sell", position: 0, updated_at: "2026-11-18T10:00:00Z",
    fields: [
      field(1, "Name", "text"),
      field(2, "Status", "single_select", { options: [{ value: "in", label: "In stock", color: "#10b981" }] }),
      field(3, "Supplier", "multi_record", { table_id: 12 }),
      field(4, "Photos", "attachments"),
      field(5, "Phone", "phone"),
    ],
    relations: { "3": "many_to_one" },
    primary_field_id: 1,
    view: views[0],
    views,
  },
});

// A higher id is a newer row, as on the server.
const row = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id, position: id, created_at: new Date(Date.UTC(2026, 10, 19, 9, 0, id % 60)).toISOString(), updated_at: "2026-11-19T09:30:00Z",
  values: { "1": { scalar_value: name }, ...extra },
});
const scarf = row(501, "Blue scarf", {
  "2": { scalar_value: "in" },
  "3": { selected_ids: [900], selected_count: 1, selected_records: [{ selection_id: 1, linked_record_id: 900, linked_record_type: "TableApp::Record", label: "Kabul office" }] },
  "5": { scalar_value: "+93 70 123 4567" },
});
const page = (records: unknown[], meta: Record<string, unknown> = {}) => ({ records, meta: { offset: 0, limit: 100, has_more: false, total_count: records.length, table_total: records.length, ...meta } });
const recordCalls = () => mock.history.get.filter((r) => r.url === `${B}/tables/10/records`).map((r) => r.params as Record<string, unknown>);

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mockParams.current = {};
  router.push.mockClear();
  router.setParams.mockClear();
  // A phone, unless a test says otherwise: Jest's window is 750 wide, past the tablet grid's 720 (increment 9).
  jest.spyOn(require("react-native"), "useWindowDimensions").mockReturnValue({ width: 411, height: 900, scale: 2, fontScale: 1 });
  await AsyncStorage.clear();
  await i18n.changeLanguage("en");
});
afterEach(() => {
  // The owner's rule (SPEC C1): no screen here writes a view's SETTINGS, ever. The one PATCH
  // to a view is an editor's deliberate rename on the views sheet (4b, Hello 2026-11-20), and
  // it carries the name and nothing else.
  const viewWrites = mock.history.patch.filter((r) => r.url?.includes("/views/")).map((r) => JSON.parse(String(r.data)));
  expect(viewWrites.filter((b) => JSON.stringify(Object.keys(b.view ?? {})) !== '["name"]' || Object.keys(b).length !== 1)).toEqual([]);
  mock.restore();
});

describe("the bases (B1, B2)", () => {
  it("lists the bases in the server's order with their tables and rows, and opens the first table", async () => {
    mock.onGet(`${B}/bases`).reply(200, { bases: [base(4, "[qa] Newest", [{ id: 20, name: "Leads", position: 0 }]), base(3, "[qa] Shop", [{ id: 11, name: "Orders", position: 1 }, { id: 10, name: "Items", position: 0 }], { "10": 1204, "11": 7 })] });
    renderScreen(<Bases />);
    expect(await screen.findByText("[qa] Newest")).toBeTruthy();
    expect(within(screen.getByTestId("tables-base-1")).getByText("2 tables · 1,211 rows")).toBeTruthy();
    // Newest first is the server's default: nothing is sent for it.
    expect(mock.history.get[0].params).toBeUndefined();
    fireEvent.press(screen.getByTestId("tables-base-1"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/tables/table", params: { id: "10", base: "3" } });
  });

  it("the sort chip asks the server for another order", async () => {
    mock.onGet(`${B}/bases`).reply(200, { bases: [] });
    renderScreen(<Bases />);
    await screen.findByTestId("tables-empty");
    fireEvent.press(screen.getByTestId("tables-bases-sort-name_asc"));
    await waitFor(() => expect(mock.history.get.some((r) => (r.params as { sort?: string } | undefined)?.sort === "name_asc")).toBe(true));
  });

  it("search finds a base by one of its tables' names, accent-blind", async () => {
    mock.onGet(`${B}/bases`).reply(200, { bases: [base(3, "[qa] Shop", [{ id: 10, name: "Clients réguliers", position: 0 }]), base(4, "[qa] Other", [])] });
    renderScreen(<Bases />);
    await screen.findByText("[qa] Shop");
    fireEvent.press(screen.getByTestId("tables-search-toggle"));
    fireEvent.changeText(screen.getByTestId("tables-search"), "reguliers");
    expect(screen.queryByText("[qa] Other")).toBeNull();
    expect(screen.getByText("[qa] Shop")).toBeTruthy();
  });

  it("a failed load says so and offers to try again; nothing loaded is not 'no bases'", async () => {
    mock.onGet(`${B}/bases`).reply(500);
    renderScreen(<Bases />);
    expect(await screen.findByTestId("tables-load-failed")).toBeTruthy();
    expect(screen.queryByTestId("tables-empty")).toBeNull();
  });
});

describe("a table (T1–T6)", () => {
  beforeEach(() => {
    mockParams.current = { id: "10", base: "3" };
    mock.onGet(`${B}/bases`).reply(200, { bases: [base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }, { id: 11, name: "Orders", position: 1 }], { "10": 2, "11": 0 })] });
    mock.onGet(`${B}/tables/10`).reply(200, tableBody());
  });

  it("asks newest first for a view nobody sorted, and draws each row as a card", async () => {
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf, row(502, "Red hat")], { total_count: 2, table_total: 2 }));
    renderScreen(<TableScreen />);
    expect(await screen.findByText("Blue scarf")).toBeTruthy();
    // field_ids: only the columns a card draws (title, then Status, Supplier, Photos at a tall row height).
    expect(recordCalls()[0]).toEqual({ offset: 0, limit: 100, sort: "-created_at", field_ids: [1, 2, 3, 4] });
    // A tall row height: three fields under the title, label above value.
    const card = screen.getByTestId("tables-card-0");
    expect(within(card).getByText("Status")).toBeTruthy();
    expect(within(card).getByText("In stock")).toBeTruthy();
    expect(within(card).getByText("Kabul office")).toBeTruthy();
    expect(screen.getByTestId("tables-count").props.children).toBe("2 rows");
    expect(screen.getByTestId("tables-description").props.children).toBe("What we sell");
    expect(screen.getByTestId("tables-tab-1")).toBeTruthy();
  });

  it("'Table order' is personal: the next query drops newest first, and the phone says so", async () => {
    mock.onGet(`${B}/tables/10/records`).reply(200, page([row(503, "Grey coat"), row(502, "Red hat"), scarf]));
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    fireEvent.press(screen.getByTestId("tables-order"));
    await waitFor(() => expect(recordCalls().some((p) => p.sort === undefined)).toBe(true));
    expect(screen.getByTestId("tables-personal-note")).toBeTruthy();
    expect(screen.getByTestId("tables-personal-dot")).toBeTruthy();
  });

  it("an older server that ignores the sort: the rows come oldest first, and the phone claims nothing", async () => {
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf, row(502, "Red hat")]));
    renderScreen(<TableScreen />);
    await screen.findByText("Red hat");
    expect(recordCalls()[0].sort).toBe("-created_at");
    expect(screen.queryByTestId("tables-order")).toBeNull();
    expect(screen.queryByText("Newest first")).toBeNull();
  });

  it("a server that sorts: newest first is proven by the rows, and said", async () => {
    mock.onGet(`${B}/tables/10/records`).reply(200, page([row(502, "Red hat"), scarf]));
    renderScreen(<TableScreen />);
    await screen.findByText("Red hat");
    // At a phone's 411 dp the chip is its icon, and the sentence is its name (`compactToolbar`).
    expect(await screen.findByLabelText("Newest first")).toBeTruthy();
  });

  it("search goes to the server as a parameter, never into the view", async () => {
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    fireEvent.press(screen.getByTestId("tables-search-toggle"));
    fireEvent.changeText(screen.getByTestId("tables-row-search"), "scarf");
    await waitFor(() => expect(recordCalls().some((p) => p.search === "scarf")).toBe(true), { timeout: 2000 });
  });

  it("a view with its own sort keeps it, and newest first is not offered over it", async () => {
    mock.onGet(`${B}/tables/10`).reply(200, tableBody([view(70, "By name", "grid", { sorts: [{ field_id: 1, direction: "asc" }] })]));
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    // A short row draws one column under the title: field_ids [title, Status].
    expect(recordCalls()[0]).toEqual({ offset: 0, limit: 100, sorts: JSON.stringify([{ field_id: 1, direction: "asc" }]), field_ids: [1, 2] });
    expect(screen.queryByTestId("tables-order")).toBeNull();
  });

  it("loads the next page at the end, without a row twice, and keeps the rows when a page fails", async () => {
    mock.onGet(`${B}/tables/10/records`, { params: { offset: 0, limit: 100, sort: "-created_at", field_ids: [1, 2, 3, 4] } }).reply(200, page([scarf, row(502, "Red hat")], { has_more: true, total_count: 3, table_total: 3 }));
    mock.onGet(`${B}/tables/10/records`, { params: { offset: 2, limit: 100, sort: "-created_at", field_ids: [1, 2, 3, 4] } }).replyOnce(500);
    renderScreen(<TableScreen />);
    await screen.findByText("Red hat");
    await act(async () => {
      fireEvent(screen.getByTestId("tables-rows"), "onEndReached");
    });
    expect(await screen.findByTestId("tables-page-retry")).toBeTruthy();
    expect(screen.getByText("Blue scarf")).toBeTruthy();
    mock.onGet(`${B}/tables/10/records`, { params: { offset: 2, limit: 100, sort: "-created_at", field_ids: [1, 2, 3, 4] } }).reply(200, { records: [row(502, "Red hat"), row(503, "Green bag")], meta: { offset: 2, limit: 100, has_more: false } });
    fireEvent.press(screen.getByTestId("tables-page-retry"));
    expect(await screen.findByText("Green bag")).toBeTruthy();
    expect(screen.getAllByText("Red hat")).toHaveLength(1);
  });

  it("switching to another shared view changes nothing for anybody: it only picks it", async () => {
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    fireEvent.press(screen.getByTestId("tables-view-switch"));
    fireEvent.press(await screen.findByText("Pictures"));
    expect(router.setParams).toHaveBeenCalledWith({ view: "71" });
  });

  it("an empty table names its columns; a row opens its page with the screen's query", async () => {
    mock.onGet(`${B}/tables/10/records`).reply(200, page([]));
    renderScreen(<TableScreen />);
    expect(await screen.findByTestId("tables-rows-empty")).toBeTruthy();
    expect(screen.getByText(/Name, Status, Supplier, Photos/)).toBeTruthy();
  });

  it("opens a row on its page", async () => {
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    renderScreen(<TableScreen />);
    fireEvent.press(await screen.findByTestId("tables-card-0"));
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/tables/record", params: expect.objectContaining({ table: "10", id: "501" }) }));
  });
});

describe("a row (R1, R2)", () => {
  beforeEach(() => {
    mockParams.current = { table: "10", id: "501" };
    mock.onGet(`${B}/tables/10`).reply(200, tableBody());
    mock.onGet(`${B}/records/501`).reply(200, { record: scarf });
  });

  it("opened from a list that loaded only some columns: the rest says it is loading, never Empty, until the row arrives", async () => {
    const client = testQueryClient();
    // The list's copy: title and Status only (field_ids [1, 2]); Phone (5) was never asked for.
    const partial = { id: 501, position: 501, createdAt: "2026-11-19T09:00:21.000Z", updatedAt: "x", values: { 1: { kind: "scalar", value: "Blue scarf" }, 2: { kind: "scalar", value: "in" } }, linkLabels: {}, linkCounts: {}, loadedFieldIds: [1, 2] };
    client.setQueryData(tablesKeys.records(10, "QK"), { pages: [{ rows: [partial], unreadable: 0, offset: 0, hasMore: false, totalCount: 1, tableTotal: 1, groups: null }], pageParams: [0] });
    mockParams.current = { table: "10", id: "501", q: "QK" };
    let arrive: (v: [number, unknown]) => void = () => undefined;
    mock.onGet(`${B}/records/501`).reply(() => new Promise((r) => (arrive = r)));
    render(<QueryClientProvider client={client}><RecordScreen /></QueryClientProvider>);
    expect(await screen.findByTestId("tables-record-loading-rest")).toBeTruthy();
    expect(screen.getByTestId("tables-field-2")).toBeTruthy();
    expect(screen.queryByTestId("tables-field-5")).toBeNull(); // not shown as an empty Phone
    await act(async () => arrive([200, { record: scarf }]));
    expect(await screen.findByTestId("tables-field-5")).toBeTruthy();
    expect(screen.queryByTestId("tables-record-loading-rest")).toBeNull();
  });

  it("shows the title and every column; a blank reads as a dash, never as nothing", async () => {
    renderScreen(<RecordScreen />);
    expect(await screen.findByTestId("tables-record-title")).toBeTruthy();
    expect(screen.getByTestId("tables-record-title").props.children).toBe("Blue scarf");
    for (const id of [1, 2, 3, 4, 5]) expect(screen.getByTestId(`tables-field-${id}`)).toBeTruthy();
    expect(screen.getByText("In stock")).toBeTruthy();
  });

  it("a phone can be called or written to on WhatsApp; a linked row opens", async () => {
    const { Linking } = jest.requireActual<typeof import("react-native")>("react-native");
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    renderScreen(<RecordScreen />);
    await screen.findByTestId("tables-record-title");
    fireEvent.press(screen.getByTestId("tables-field-5-call"));
    expect(open).toHaveBeenCalledWith("tel:+93701234567");
    fireEvent.press(screen.getByTestId("tables-field-5-whatsapp"));
    expect(open).toHaveBeenCalledWith("https://wa.me/93701234567");
    fireEvent.press(screen.getByTestId("tables-field-3-link-0"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/tables/record", params: { table: "12", id: "900" } });
    open.mockRestore();
  });

  it("links past the first 12 come from the relations call, each one opening its row", async () => {
    mock.onGet(`${B}/records/501/relations`).reply(200, { relations: [{ field_id: 3, field_name: "Supplier", table: { id: 12, name: "Offices", base_id: 3 }, limit: null, count: 13, records: Array.from({ length: 13 }, (_, i) => ({ id: 900 + i, title: `Office ${i + 1}`, fields: [] })) }] });
    renderScreen(<RecordScreen />);
    expect(await screen.findByText("Office 13")).toBeTruthy();
    fireEvent.press(screen.getByTestId("tables-field-3-link-12"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/tables/record", params: { table: "12", id: "912" } });
  });

  it("a row that will not load says so, and offers to try again", async () => {
    mock.onGet(`${B}/records/501`).reply(404);
    renderScreen(<RecordScreen />);
    expect(await screen.findByTestId("tables-record-failed")).toBeTruthy();
  });
});

describe("editing rows (increment 2)", () => {
  const baseAs = (role: string) => ({ bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }], { "10": 1 }), role }] });
  /** Press the confirming button of the next Alert. */
  const confirmAlert = (label: string) =>
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.text === label)?.onPress?.());

  beforeEach(() => {
    router.back.mockClear();
    useTablesUndo.getState().clear();
    mock.onGet(`${B}/tables/10`).reply(200, tableBody());
    mock.onGet(`${B}/records/501`).reply(200, { record: scarf });
  });
  afterEach(() => jest.restoreAllMocks());

  it("an editor changes a value through the row's own endpoint, never core's", async () => {
    mockParams.current = { table: "10", id: "501" };
    mock.onGet(`${B}/bases`).reply(200, baseAs("editor"));
    mock.onPatch(`${B}/records/501`).reply(200, { record: row(501, "Blue scarf, wool") });
    renderScreen(<RecordScreen />);
    await screen.findByTestId("tables-record-title");
    await waitFor(() => expect(screen.getByTestId("tables-field-1").props.accessibilityState?.disabled).toBeFalsy());
    fireEvent.press(screen.getByTestId("tables-field-1"));
    fireEvent.changeText(await screen.findByTestId("tables-field-1-sheet-input"), "Blue scarf, wool");
    fireEvent.press(screen.getByTestId("tables-field-1-sheet-save"));
    await waitFor(() => expect(mock.history.patch.map((r) => r.url)).toEqual([`${B}/records/501`]));
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ record: { values: { "1": "Blue scarf, wool" } } });
  });

  it("a viewer reads: no editor opens, no add button, and the menu only copies the link", async () => {
    mockParams.current = { table: "10", id: "501" };
    mock.onGet(`${B}/bases`).reply(200, baseAs("viewer"));
    renderScreen(<RecordScreen />);
    await screen.findByTestId("tables-record-title");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent.press(screen.getByTestId("tables-field-1"));
    expect(screen.queryByTestId("tables-field-1-sheet-input")).toBeNull();
    fireEvent.press(screen.getByTestId("tables-record-menu"));
    expect(screen.getByText("Copy the row's link")).toBeTruthy();
    expect(screen.queryByText("Delete the row")).toBeNull();
  });

  it("deletes to the trash after a confirm, goes back, and Undo restores the row", async () => {
    mockParams.current = { table: "10", id: "501" };
    mock.onGet(`${B}/bases`).reply(200, baseAs("owner"));
    mock.onDelete(`${B}/records/501`).reply(204);
    mock.onPost(`${B}/tables/10/records/restore`).reply(200, {});
    confirmAlert("Delete");
    renderScreen(<RecordScreen />);
    await screen.findByTestId("tables-record-title");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent.press(screen.getByTestId("tables-record-menu"));
    fireEvent.press(await screen.findByText("Delete the row"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(mock.history.delete.map((r) => r.url)).toEqual([`${B}/records/501`]);
    const offer = useTablesUndo.getState().offer;
    expect(offer?.message).toBe("Row deleted");
    await act(async () => offer?.undo?.());
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ ids: [501] });
  });

  it("duplicates the row and shows the copy", async () => {
    mockParams.current = { table: "10", id: "501" };
    mock.onGet(`${B}/bases`).reply(200, baseAs("editor"));
    mock.onPost(`${B}/records/501/duplicate`).reply(201, { record: row(777, "Blue scarf") });
    renderScreen(<RecordScreen />);
    await screen.findByTestId("tables-record-title");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent.press(screen.getByTestId("tables-record-menu"));
    fireEvent.press(await screen.findByText("Duplicate the row"));
    await waitFor(() => expect(router.setParams).toHaveBeenCalledWith({ id: "777" }));
  });

  it("the add button makes an empty row and opens it at once; a viewer has no button", async () => {
    mockParams.current = { id: "10", base: "3" };
    mock.onGet(`${B}/bases`).reply(200, baseAs("editor"));
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    mock.onPost(`${B}/tables/10/records`).reply(201, { record: row(778, "") });
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    doubleTap(await screen.findByTestId("tables-add-row"));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/tables/record", params: { table: "10", id: "778" } }));
    expect(mock.history.post).toHaveLength(1); // a double tap makes one row
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ record: { values: {} } });
  });

  it("a viewer's table has no add button", async () => {
    mockParams.current = { id: "10", base: "3" };
    mock.onGet(`${B}/bases`).reply(200, baseAs("viewer"));
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    expect(screen.queryByTestId("tables-add-row")).toBeNull();
  });
});

describe("find and personal views (increment 3)", () => {
  beforeEach(() => {
    mockParams.current = { id: "10", base: "3" };
    mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }], { "10": 2 }), role: "editor" }] });
    mock.onGet(`${B}/tables/10`).reply(200, tableBody());
  });

  it("a filter from the sheet becomes the query, the button says how many, and the view is never written", async () => {
    mock.onGet(`${B}/tables/10/records`).reply((config) => {
      const p = config.params as Record<string, unknown>;
      if (p.limit === 1) return [200, page([], { total_count: 1, table_total: 2 })];
      return [200, p.filters ? page([scarf], { total_count: 1, table_total: 2 }) : page([scarf, row(502, "Red hat")])];
    });
    renderScreen(<TableScreen />);
    await screen.findByText("Red hat");
    fireEvent.press(screen.getByTestId("tables-find-open"));
    fireEvent.press(await screen.findByTestId("tables-filter-add"));
    fireEvent.press(screen.getByTestId("tables-filter-pick-2"));
    fireEvent.press(screen.getByTestId("tables-filter-0-value-in"));
    await waitFor(() => expect(screen.getByTestId("tables-find-apply")).toHaveTextContent("Show 1 row"), { timeout: 3000 });
    fireEvent.press(screen.getByTestId("tables-find-apply"));
    await waitFor(() => expect(screen.queryByText("Red hat")).toBeNull());
    const last = recordCalls().filter((p) => p.limit === 100).pop();
    expect(last?.filters).toBe(JSON.stringify([{ field_id: 2, op: "any_of", value: ["in"] }]));
    expect(screen.getByTestId("tables-personal-note")).toBeTruthy();
  });

  it("a date filter is picked, never typed: Today sends today's day, and the month grid picks another", async () => {
    const withDate = tableBody();
    withDate.table.fields.push(field(6, "Delivered", "date"));
    mock.onGet(`${B}/tables/10`).reply(200, withDate);
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    const { todayKey } = jest.requireActual<typeof import("@/screens/calendar/dates")>("@/screens/calendar/dates");
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    fireEvent.press(screen.getByTestId("tables-find-open"));
    fireEvent.press(await screen.findByTestId("tables-filter-add"));
    fireEvent.press(screen.getByTestId("tables-filter-pick-6"));
    // No text box for a date: the picker is open at once.
    expect(screen.getByTestId("tables-filter-0-value-month")).toBeTruthy();
    fireEvent.press(screen.getByTestId("tables-filter-0-value-today"));
    fireEvent.press(screen.getByTestId("tables-find-apply"));
    await waitFor(() => expect(recordCalls().some((p) => p.filters === JSON.stringify([{ field_id: 6, op: "is", value: todayKey() }]))).toBe(true));
  });

  it("grouping draws a header per group with the server's counts, and a header folds its rows", async () => {
    mock.onGet(`${B}/tables/10`).reply(200, tableBody([view(70, "Grid", "grid", { group_by_field_id: 2, row_height: "short" })]));
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf, row(503, "Grey coat")], { total_count: 2, table_total: 2, groups: [{ value: "in", count: 1 }, { value: null, count: 1 }] }));
    renderScreen(<TableScreen />);
    expect(await screen.findByTestId("tables-group-in")).toBeTruthy();
    expect(screen.getByTestId("tables-group-none")).toBeTruthy();
    expect(recordCalls()[0].group_by).toBe(2);
    fireEvent.press(screen.getByTestId("tables-group-in"));
    expect(screen.queryByText("Blue scarf")).toBeNull();
    expect(screen.getByText("Grey coat")).toBeTruthy();
  });

  it("no match offers to clear the filters", async () => {
    mock.onGet(`${B}/tables/10`).reply(200, tableBody([view(70, "Grid", "grid", { filters: [{ field_id: 2, op: "any_of", value: ["out"] }] })]));
    mock.onGet(`${B}/tables/10/records`).reply((config) => [200, (config.params as Record<string, unknown>).filters ? page([]) : page([scarf])]);
    renderScreen(<TableScreen />);
    fireEvent.press(await screen.findByTestId("tables-clear-filters"));
    expect(await screen.findByText("Blue scarf")).toBeTruthy();
  });

  it("'Save as a new view' makes a NEW view from this one, says who sees it, and opens it", async () => {
    mock.onGet(`${B}/tables/10/records`).reply(200, page([row(503, "Grey coat"), scarf]));
    mock.onPost(`${B}/tables/10/views`).reply(201, { view: view(72, "Mine", "grid") });
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    fireEvent.press(screen.getByTestId("tables-order"));
    await screen.findByTestId("tables-personal-note");
    fireEvent.press(screen.getByTestId("tables-menu"));
    fireEvent.press(await screen.findByText("Save as a new view…"));
    expect(await screen.findByText(/everyone on this base sees/)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("tables-save-view-name"), "Mine");
    fireEvent.press(screen.getByTestId("tables-save-view-save"));
    await waitFor(() => expect(router.setParams).toHaveBeenCalledWith({ view: "72" }));
    expect(JSON.parse(mock.history.post[0].data)).toMatchObject({ from_view_id: 70, view: { name: "Mine", view_type: "grid" } });
  });

  it("hiding a field takes it off the cards, for this person only", async () => {
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    renderScreen(<TableScreen />);
    const card = await screen.findByTestId("tables-card-0");
    expect(within(card).getByText("Status")).toBeTruthy();
    fireEvent.press(screen.getByTestId("tables-menu"));
    fireEvent.press(await screen.findByText("Fields and cards"));
    fireEvent(await screen.findByTestId("tables-fields-2-shown"), "valueChange", false);
    await waitFor(() => expect(within(screen.getByTestId("tables-card-0")).queryByText("Status")).toBeNull());
  });
});

describe("kanban and calendar (increment 4)", () => {
  const withDue = () => {
    const body = tableBody([view(73, "Board", "kanban", { kanban_field_id: 2 }), view(74, "When", "calendar", { calendar_field_id: 6 })]);
    body.table.fields.push(field(6, "Due", "date"));
    body.table.fields[1] = field(2, "Status", "single_select", { options: [{ value: "in", label: "In stock", color: "#10b981" }, { value: "out", label: "Sold out", color: "#ef4444" }] });
    return body;
  };
  beforeEach(() => {
    mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }], { "10": 2 }), role: "editor" }] });
    mock.onGet(`${B}/tables/10`).reply(200, withDue());
    useTablesUndo.getState().clear();
  });

  it("a board asks rows grouped by its column, shows one column per option plus No value, with counts", async () => {
    mockParams.current = { id: "10", base: "3", view: "73" };
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf, row(502, "Red hat", { "2": { scalar_value: "out" } }), row(503, "Grey coat")], { groups: [{ value: "in", count: 1 }, { value: "out", count: 1 }, { value: null, count: 1 }] }));
    renderScreen(<TableScreen />);
    expect(await screen.findByText("Red hat")).toBeTruthy();
    expect(recordCalls()[0].group_by).toBe(2);
    expect(screen.getByTestId("tables-kanban-chip-0").props.accessibilityLabel).toBe("In stock, 1 cards");
    expect(screen.getByTestId("tables-kanban-chip-2").props.accessibilityLabel).toBe("No value, 1 cards");
    expect(within(screen.getByTestId("tables-kanban-column-1")).getByText("Red hat")).toBeTruthy();
  });

  it("a long press moves a card through the row's endpoint, and Undo puts it back", async () => {
    mockParams.current = { id: "10", base: "3", view: "73" };
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf], { groups: [{ value: "in", count: 1 }] }));
    mock.onPatch(`${B}/records/501`).reply(200, { record: scarf });
    renderScreen(<TableScreen />);
    fireEvent(await screen.findByTestId("tables-kanban-0-card-0"), "longPress");
    fireEvent.press(await within(await screen.findByTestId("tables-kanban-move")).findByText("Sold out"));
    await waitFor(() => expect(mock.history.patch.length).toBe(1));
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ record: { values: { "2": "out" } } });
    await waitFor(() => expect(useTablesUndo.getState().offer?.message).toBe("Moved"));
    await act(async () => useTablesUndo.getState().offer?.undo?.());
    await waitFor(() => expect(mock.history.patch.length).toBe(2));
    expect(JSON.parse(mock.history.patch[1].data)).toEqual({ record: { values: { "2": "in" } } });
  });

  it("4b: with newest first (a sort) the long press offers no reorder, only other columns", async () => {
    mockParams.current = { id: "10", base: "3", view: "73" };
    const inStock = { "2": { scalar_value: "in" } };
    mock.onGet(`${B}/tables/10/records`).reply(200, page([row(503, "Grey coat", inStock), row(502, "Red hat", inStock), scarf], { groups: [{ value: "in", count: 3 }] }));
    mock.onPost(`${B}/tables/10/records/reorder`).reply(200, { ids: [502, 503, 501] });
    renderScreen(<TableScreen />);
    // Newest first is a sort: the sheet offers no reorder, as the web reorders only a board with no sort.
    fireEvent(await screen.findByTestId("tables-kanban-0-card-0"), "longPress");
    const sheet = await screen.findByTestId("tables-kanban-move");
    expect(within(sheet).queryByText("Move down")).toBeNull();
    expect(within(sheet).getByText("Sold out")).toBeTruthy(); // moving to another column still works
  });

  it("4b: Table order on, the first card moves down, and the top one offers no Move up", async () => {
    mockParams.current = { id: "10", base: "3", view: "73" };
    const inStock = { "2": { scalar_value: "in" } };
    mock.onGet(`${B}/tables/10/records`).reply(200, page([row(503, "Grey coat", inStock), row(502, "Red hat", inStock), scarf], { groups: [{ value: "in", count: 3 }] }));
    mock.onPost(`${B}/tables/10/records/reorder`).reply(200, { ids: [502, 503, 501] });
    renderScreen(<TableScreen />);
    await screen.findByTestId("tables-kanban-0-card-0");
    fireEvent.press(await screen.findByTestId("tables-order"));
    await waitFor(() => expect(recordCalls().some((p) => p.sort === undefined)).toBe(true));
    fireEvent(await screen.findByTestId("tables-kanban-0-card-0"), "longPress");
    const sheet = await screen.findByTestId("tables-kanban-move");
    expect(within(sheet).queryByText("Move up")).toBeNull();
    expect(within(sheet).queryByText("Move to the top of this column")).toBeNull();
    fireEvent.press(within(sheet).getByText("Move down"));
    await waitFor(() => expect(mock.history.post.filter((r) => r.url === `${B}/tables/10/records/reorder`)).toHaveLength(1));
    expect(JSON.parse(mock.history.post.find((r) => r.url === `${B}/tables/10/records/reorder`)!.data)).toEqual({ ids: [502, 503, 501] });
  });

  it("a board with two columns still shows Newest first, so Table order and Move up are reachable (qa_phone, 2026-11-21)", async () => {
    mockParams.current = { id: "10", base: "3", view: "73" };
    const inStock = { "2": { scalar_value: "in" } };
    // Grouped by column, newest first within each: In stock [503, 501], Sold out [502].
    mock.onGet(`${B}/tables/10/records`).reply(200, page([row(503, "Grey coat", inStock), scarf, row(502, "Red hat", { "2": { scalar_value: "out" } })], { groups: [{ value: "in", count: 2 }, { value: "out", count: 1 }] }));
    renderScreen(<TableScreen />);
    expect(await screen.findByTestId("tables-order")).toBeTruthy();
  });

  it("the table strip and the board's chips never shrink under the list (their pills were cut at 411 dp, qa_phone 2026-11-21)", async () => {
    mockParams.current = { id: "10", base: "3", view: "73" };
    mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }, { id: 11, name: "Offices", position: 1 }], { "10": 2 }), role: "editor" }] });
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf], { groups: [{ value: "in", count: 1 }] }));
    renderScreen(<TableScreen />);
    for (const id of ["tables-table-strip", "tables-kanban-strip"]) {
      const style = StyleSheet.flatten((await screen.findByTestId(id)).props.style) as { flexShrink?: number };
      expect([id, style.flexShrink]).toEqual([id, 0]);
    }
  });

  it("4b: a folded column leaves the pages, stays as a dimmed chip, writes no view, and its chip brings it back", async () => {
    mockParams.current = { id: "10", base: "3", view: "73" };
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf, row(502, "Red hat", { "2": { scalar_value: "out" } })], { groups: [{ value: "in", count: 1 }, { value: "out", count: 1 }] }));
    renderScreen(<TableScreen />);
    await screen.findByText("Red hat");
    fireEvent.press(screen.getByTestId("tables-kanban-fold-0"));
    await waitFor(() => expect(screen.queryByText("Blue scarf")).toBeNull());
    expect(screen.getByTestId("tables-kanban-chip-0").props.accessibilityHint).toBe("Folded. Tap to unfold it and go there.");
    // Kept on the phone: this suite has no signed-in user, so the layer lives for the visit only
    // (usePersonalLayer); the stored round trip is personalView.test.ts's.
    expect(mock.history.patch).toHaveLength(0); // personal: no view is written
    expect(screen.queryByTestId("tables-personal-note")).toBeNull(); // and a fold is not a difference from the shared view
    fireEvent.press(screen.getByTestId("tables-kanban-chip-0"));
    expect(await screen.findByText("Blue scarf")).toBeTruthy();
    expect(screen.getByTestId("tables-kanban-chip-0").props.accessibilityHint).toBeUndefined();
  });

  it("+ at a column's foot adds a row already in that column", async () => {
    mockParams.current = { id: "10", base: "3", view: "73" };
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    mock.onPost(`${B}/tables/10/records`).reply(201, { record: row(779, "") });
    renderScreen(<TableScreen />);
    fireEvent.press(await screen.findByTestId("tables-kanban-add-1"));
    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ record: { values: { "2": "out" } } });
  });

  it("a calendar asks for the month on screen, lists the chosen day's rows, and No date asks for the rest", async () => {
    const { todayKey } = jest.requireActual<typeof import("@/screens/calendar/dates")>("@/screens/calendar/dates");
    const today = todayKey();
    mockParams.current = { id: "10", base: "3", view: "74" };
    mock.onGet(`${B}/tables/10/records`).reply((config) => {
      const p = config.params as Record<string, unknown>;
      const filters = JSON.parse(String(p.filters ?? "[]")) as { op: string }[];
      if (filters.some((f) => f.op === "empty")) return [200, page([row(504, "No-date scarf")])];
      return [200, page([row(505, "Due today", { "6": { scalar_value: today } })])];
    });
    renderScreen(<TableScreen />);
    expect(await screen.findByText("Due today")).toBeTruthy();
    const first = JSON.parse(String(recordCalls()[0].filters)) as { field_id: number; op: string }[];
    expect(first.map((f) => [f.field_id, f.op])).toEqual([[6, "on_or_after"], [6, "on_or_before"]]);
    fireEvent.press(screen.getByTestId("tables-calendar-undated"));
    expect(await screen.findByText("No-date scarf")).toBeTruthy();
  });
});

describe("a personal field order (the owner, 2026-11-20)", () => {
  beforeEach(() => {
    mockParams.current = { id: "10", base: "3" };
    mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }], { "10": 1 }), role: "editor" }] });
    mock.onGet(`${B}/tables/10`).reply(200, tableBody());
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
  });

  it("moving a field up changes the cards, for this person only; Back to the shared view undoes it", async () => {
    renderScreen(<TableScreen />);
    const card = await screen.findByTestId("tables-card-0");
    expect(within(card).getAllByText(/^(Status|Supplier|Photos)$/).map((n) => n.props.children)).toEqual(["Status", "Supplier", "Photos"]);
    fireEvent.press(screen.getByTestId("tables-menu"));
    fireEvent.press(await screen.findByText("Fields and cards"));
    fireEvent.press(await screen.findByTestId("tables-fields-3-up"));
    await waitFor(() => expect(within(screen.getByTestId("tables-card-0")).getAllByText(/^(Status|Supplier|Photos)$/).map((n) => n.props.children)).toEqual(["Supplier", "Status", "Photos"]));
    expect(screen.getByTestId("tables-personal-note")).toBeTruthy();
    fireEvent.press(screen.getByTestId("tables-menu"));
    fireEvent.press(await screen.findByText("Back to the shared view"));
    await waitFor(() => expect(within(screen.getByTestId("tables-card-0")).getAllByText(/^(Status|Supplier|Photos)$/).map((n) => n.props.children)).toEqual(["Status", "Supplier", "Photos"]));
  });

  it("Save as a new view carries the personal order into the new view", async () => {
    mock.onPost(`${B}/tables/10/views`).reply(201, { view: view(72, "Mine", "grid") });
    renderScreen(<TableScreen />);
    await screen.findByTestId("tables-card-0");
    fireEvent.press(screen.getByTestId("tables-menu"));
    fireEvent.press(await screen.findByText("Fields and cards"));
    fireEvent.press(await screen.findByTestId("tables-fields-3-up"));
    await screen.findByTestId("tables-personal-note");
    fireEvent.press(screen.getByTestId("tables-menu"));
    fireEvent.press(await screen.findByText("Save as a new view…"));
    fireEvent.press(await screen.findByTestId("tables-save-view-save"));
    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(JSON.parse(mock.history.post[0].data).view.config.field_order).toEqual([1, 3, 2, 4, 5]);
  });
});

describe("manage the table's views (4b; the web's ViewSwitcher)", () => {
  const made = (id: number, name: string, view_type = "grid", config: Record<string, unknown> = {}) => ({ view: view(id, name, view_type, config) });
  const asRole = (role: string) => mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }]), role }] });
  beforeEach(() => {
    mockParams.current = { id: "10", base: "3" };
    mock.onGet(`${B}/tables/10`).reply(200, tableBody());
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
  });
  afterEach(() => jest.restoreAllMocks());
  const openViews = async () => {
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent.press(screen.getByTestId("tables-view-switch"));
    return screen.findByTestId("tables-views-open-70");
  };

  it("a new KANBAN view is posted from the view on screen with its select column, then opens", async () => {
    asRole("editor");
    mock.onPost(`${B}/tables/10/views`).reply(201, made(80, "By status", "kanban", { kanban_field_id: 2 }));
    await openViews();
    fireEvent.press(screen.getByTestId("tables-views-new"));
    fireEvent.changeText(await screen.findByTestId("tables-views-name"), "By status");
    fireEvent.press(screen.getByTestId("tables-views-type-kanban"));
    expect(screen.getByTestId("tables-views-column-2").props.accessibilityState.selected).toBe(true); // the only select, chosen for them
    doubleTap(screen.getByTestId("tables-views-save"));
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ from_view_id: 70, view: { name: "By status", view_type: "kanban", config: { kanban_field_id: 2 } } });
    await waitFor(() => expect(router.setParams).toHaveBeenCalledWith({ view: "80" }));
  });

  it("a calendar cannot be made on a table with no date column: it says why and Create stays off", async () => {
    asRole("editor");
    await openViews();
    fireEvent.press(screen.getByTestId("tables-views-new"));
    fireEvent.changeText(await screen.findByTestId("tables-views-name"), "Dates");
    fireEvent.press(screen.getByTestId("tables-views-type-calendar"));
    expect(screen.getByTestId("tables-views-no-column")).toBeTruthy();
    expect(screen.getByTestId("tables-views-save").props.accessibilityState.disabled).toBe(true);
  });

  it("rename sends the name alone; duplicate opens the copy; delete asks, then opens another view", async () => {
    asRole("editor");
    mock.onPatch(`${B}/views/70`).reply(200, made(70, "Everything"));
    mock.onPost(`${B}/views/70/duplicate`).reply(201, made(81, "Grid (copie)"));
    mock.onDelete(`${B}/views/70`).reply(204);
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === "destructive")?.onPress?.());
    await openViews();
    fireEvent.press(screen.getByTestId("tables-views-manage-70"));
    fireEvent.press(screen.getByTestId("tables-views-rename-70"));
    fireEvent.changeText(await screen.findByTestId("tables-views-name"), "Everything");
    fireEvent.press(screen.getByTestId("tables-views-save"));
    await waitFor(() => expect(mock.history.patch.map((r) => JSON.parse(r.data))).toEqual([{ view: { name: "Everything" } }]));

    fireEvent.press(await screen.findByTestId("tables-views-manage-70"));
    fireEvent.press(screen.getByTestId("tables-views-duplicate-70"));
    await waitFor(() => expect(router.setParams).toHaveBeenCalledWith({ view: "81" }));

    fireEvent.press(screen.getByTestId("tables-view-switch"));
    fireEvent.press(await screen.findByTestId("tables-views-manage-70"));
    fireEvent.press(screen.getByTestId("tables-views-delete-70"));
    expect(alert.mock.calls[0][0]).toBe('Delete the view "Grid"?');
    expect(alert.mock.calls[0][1]).toBe("It is gone for everyone on the base. The rows stay.");
    await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toEqual([`${B}/views/70`]));
    await waitFor(() => expect(router.setParams).toHaveBeenLastCalledWith({ view: "71" }));
  });

  it("a viewer switches views and manages nothing", async () => {
    asRole("viewer");
    await openViews();
    expect(screen.queryByTestId("tables-views-new")).toBeNull();
    expect(screen.queryByTestId("tables-views-manage-70")).toBeNull();
  });

  it("the last view offers no delete (the server keeps one)", async () => {
    asRole("editor");
    mock.onGet(`${B}/tables/10`).reply(200, tableBody([view(70, "Grid", "grid")]));
    await openViews();
    fireEvent.press(screen.getByTestId("tables-views-manage-70"));
    expect(screen.getByTestId("tables-views-rename-70")).toBeTruthy();
    expect(screen.queryByTestId("tables-views-delete-70")).toBeNull();
  });
});

describe("table and base admin (increment 6a; the web's tab menu and BaseForm)", () => {
  const twoTables = (role: string) => mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }, { id: 11, name: "Orders", position: 1 }]), role }] });
  beforeEach(() => {
    mockParams.current = { id: "10", base: "3" };
    mock.onGet(`${B}/tables/10`).reply(200, tableBody());
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    useTablesUndo.getState().clear();
  });
  afterEach(() => jest.restoreAllMocks());
  const openMenu = async () => {
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent.press(screen.getByTestId("tables-menu"));
    return screen.findByTestId("tables-options");
  };

  it("rename and describe the table: one PATCH with both", async () => {
    twoTables("editor");
    mock.onPatch(`${B}/tables/10`).reply(200, tableBody());
    fireEvent.press(await within(await openMenu()).findByText("Rename or describe the table"));
    fireEvent.changeText(await screen.findByTestId("tables-rename-name"), "Stock");
    fireEvent.changeText(screen.getByTestId("tables-rename-description"), "What is on the shelf");
    doubleTap(screen.getByTestId("tables-rename-save"));
    await waitFor(() => expect(mock.history.patch.map((r) => JSON.parse(r.data))).toEqual([{ table: { name: "Stock", description: "What is on the shelf" } }]));
  });

  it("duplicate with columns only opens the copy", async () => {
    twoTables("editor");
    const copy = tableBody();
    copy.table.id = 12;
    mock.onPost(`${B}/tables/10/duplicate`).reply(201, copy);
    fireEvent.press(await within(await openMenu()).findByText("Duplicate the table"));
    fireEvent.press(await within(await screen.findByTestId("tables-duplicate")).findByText("Columns only, no rows"));
    await waitFor(() => expect(mock.history.post.map((r) => JSON.parse(r.data))).toEqual([{ with_rows: false }]));
    await waitFor(() => expect(router.setParams).toHaveBeenCalledWith({ id: "12", view: undefined }));
  });

  it("clear the data asks first, sends every row to the trash, and Undo restores THAT batch", async () => {
    twoTables("editor");
    mock.onPost(`${B}/tables/10/clear`).reply(200, { deleted: 25, trashed_at: "2026-11-20T23:40:00.123456Z" });
    mock.onPost(`${B}/tables/10/records/restore`).reply(200, { restored: 25 });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === "destructive")?.onPress?.());
    fireEvent.press(await within(await openMenu()).findByText("Clear the data…"));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][0]).toBe("Clear every row of Items?");
    await waitFor(() => expect(useTablesUndo.getState().offer?.message).toBe("25 rows cleared"));
    await act(async () => useTablesUndo.getState().offer?.undo?.());
    expect(JSON.parse(mock.history.post.find((r) => r.url === `${B}/tables/10/records/restore`)!.data)).toEqual({ trashed_at: "2026-11-20T23:40:00.123456Z" });
  });

  it("a new table is made in this base and opens", async () => {
    twoTables("editor");
    const made = tableBody();
    made.table.id = 13;
    mock.onPost(`${B}/bases/3/tables`).reply(201, made);
    fireEvent.press(await within(await openMenu()).findByText("New table"));
    fireEvent.changeText(await screen.findByTestId("tables-new-table-name"), "Suppliers");
    doubleTap(screen.getByTestId("tables-new-table-save"));
    await waitFor(() => expect(router.setParams).toHaveBeenCalledWith({ id: "13", view: undefined }));
    expect(mock.history.post).toHaveLength(1);
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ table: { name: "Suppliers" } });
  });

  it("order the tables: move one later and save, in one call", async () => {
    twoTables("editor");
    mock.onPost(`${B}/bases/3/tables/reorder`).reply(200, { ids: [11, 10] });
    fireEvent.press(await within(await openMenu()).findByText("Order the tables"));
    expect((await screen.findByTestId("tables-manage-save")).props.accessibilityState.disabled).toBe(true); // nothing moved yet
    fireEvent.press(await screen.findByTestId("tables-manage-down-10"));
    fireEvent.press(screen.getByTestId("tables-manage-save"));
    await waitFor(() => expect(mock.history.post.map((r) => JSON.parse(r.data))).toEqual([{ ids: [11, 10] }]));
  });

  it("edit the base: its name, description and colour", async () => {
    twoTables("editor");
    mock.onPatch(`${B}/bases/3`).reply(200, { base: base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }]) });
    fireEvent.press(await within(await openMenu()).findByText("Edit the base"));
    fireEvent.press(await screen.findByTestId("tables-edit-base-color-6"));
    fireEvent.press(screen.getByTestId("tables-edit-base-save"));
    await waitFor(() => expect(mock.history.patch.map((r) => JSON.parse(r.data))).toEqual([{ base: { name: "[qa] Shop", description: null, color: "#ef4444" } }]));
  });

  it("a viewer is offered none of it", async () => {
    twoTables("viewer");
    const menu = await openMenu();
    for (const label of ["Rename or describe the table", "Duplicate the table", "Clear the data…", "New table", "Order the tables", "Edit the base"]) expect(within(menu).queryByText(label)).toBeNull();
  });

  it("the bases list: + makes a new base (green by default, as the web) and opens its first table", async () => {
    mock.onGet(`${B}/bases`).reply(200, { bases: [] });
    mock.onPost(`${B}/bases`).reply(201, { base: base(9, "Family budget", [{ id: 90, name: "Table 1", position: 0 }]) });
    renderScreen(<Bases />);
    fireEvent.press(await screen.findByTestId("tables-new-base"));
    fireEvent.changeText(await screen.findByTestId("tables-new-base-sheet-name"), "Family budget");
    doubleTap(screen.getByTestId("tables-new-base-sheet-save"));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/tables/table", params: { id: "90", base: "9" } }));
    expect(mock.history.post.filter((r) => r.url === `${B}/bases`)).toHaveLength(1);
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ base: { name: "Family budget", color: "#10b981" } });
  });
});

describe("the table's columns (increment 6b; the web's column menu)", () => {
  const editorBase = (role = "editor") => mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }]), role }] });
  beforeEach(() => {
    mockParams.current = { id: "10", base: "3" };
    mock.onGet(`${B}/tables/10`).reply(200, tableBody());
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    mock.onGet(`${B}/tables/10/fields/trashed`).reply(200, { fields: [{ id: 8, name: "Price", field_type: "decimal", deleted_at: "2026-11-20T10:00:00Z", purge_at: null, filled_count: 12 }] });
  });
  afterEach(() => jest.restoreAllMocks());
  const openColumns = async () => {
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent.press(screen.getByTestId("tables-menu"));
    fireEvent.press(await within(await screen.findByTestId("tables-options")).findByText("Columns"));
    return screen.findByTestId("tables-columns");
  };

  it("delete says how many rows hold a value and the link's other side, then sends the column to the trash", async () => {
    editorBase();
    mock.onGet(`${B}/fields/3/usage`).reply(200, { usage: { filled_count: 7, row_count: 25, link: true, inverse: { name: "Items", table_name: "Offices" }, title_shown_in: [] } });
    mock.onDelete(`${B}/fields/3`).reply(204);
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === "destructive")?.onPress?.());
    await openColumns();
    fireEvent.press(screen.getByTestId("tables-columns-3-menu"));
    fireEvent.press(screen.getByTestId("tables-columns-3-delete"));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][0]).toBe("Delete the column Supplier?");
    expect(alert.mock.calls[0][1]).toBe("7 of 25 rows have a value in it.\n\nIts other side goes too: Items in Offices.\n\nIt goes to the column trash, and can be restored from there.");
    await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toEqual([`${B}/fields/3`]));
  });

  it("use as title names where the row titles show; the title column offers neither title nor delete", async () => {
    editorBase();
    mock.onGet(`${B}/fields/5/usage`).reply(200, { usage: { filled_count: 1, row_count: 1, link: false, inverse: null, title_shown_in: [{ column: "Items", table: "Offices" }] } });
    mock.onPost(`${B}/fields/5/primary`).reply(200, { field: field(5, "Phone", "phone") });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.text === "Use as title")?.onPress?.());
    await openColumns();
    fireEvent.press(screen.getByTestId("tables-columns-1-menu"));
    expect(screen.queryByTestId("tables-columns-1-title")).toBeNull();
    expect(screen.queryByTestId("tables-columns-1-delete")).toBeNull();
    fireEvent.press(screen.getByTestId("tables-columns-5-menu"));
    fireEvent.press(screen.getByTestId("tables-columns-5-title"));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(String(alert.mock.calls[0][1])).toContain("In Offices, column Items");
    await waitFor(() => expect(mock.history.post.map((r) => r.url)).toEqual([`${B}/fields/5/primary`]));
  });

  it("duplicate asks with or without values; a deleted column comes back from the trash", async () => {
    editorBase();
    mock.onPost(`${B}/fields/2/duplicate`).reply(201, { field: field(9, "Status (copie)", "single_select") });
    mock.onPost(`${B}/fields/8/restore`).reply(200, {});
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.text === "With its values")?.onPress?.());
    await openColumns();
    fireEvent.press(screen.getByTestId("tables-columns-2-menu"));
    fireEvent.press(screen.getByTestId("tables-columns-2-duplicate"));
    await waitFor(() => expect(mock.history.post.map((r) => JSON.parse(r.data ?? "{}"))).toEqual([{ with_values: true }]));
    fireEvent.press(await screen.findByTestId("tables-columns-restore-8"));
    await waitFor(() => expect(mock.history.post.map((r) => r.url)).toContain(`${B}/fields/8/restore`));
  });

  it("6c: add a single-choice column with two options and a default, posted in the server's names", async () => {
    editorBase();
    mock.onPost(`${B}/tables/10/fields`).reply(201, { field: field(9, "Size", "single_select") });
    await openColumns();
    fireEvent.press(screen.getByTestId("tables-columns-add"));
    const name = await screen.findByTestId("tables-field-editor-name");
    expect(screen.getByTestId("tables-field-editor-blocked").props.children).toBe("Give the column a name."); // why Save is off, said
    fireEvent.changeText(name, "Size");
    expect(screen.queryByTestId("tables-field-editor-blocked")).toBeNull();
    fireEvent.press(screen.getByTestId("tables-field-editor-type-single_select"));
    expect(screen.getByTestId("tables-field-editor-save").props.accessibilityState.disabled).toBe(true); // a select needs an option
    fireEvent.press(screen.getByTestId("tables-field-editor-option-add"));
    fireEvent.changeText(screen.getByTestId("tables-field-editor-option-0-label"), "Small");
    fireEvent.press(screen.getByTestId("tables-field-editor-option-add"));
    fireEvent.changeText(screen.getByTestId("tables-field-editor-option-1-label"), "Large");
    fireEvent.press(screen.getByTestId("tables-field-editor-option-1-up"));
    fireEvent.press(screen.getByText("Large", { exact: true }));
    doubleTap(screen.getByTestId("tables-field-editor-save"));
    await waitFor(() => expect(mock.history.post.filter((r) => r.url === `${B}/tables/10/fields`)).toHaveLength(1));
    const body = JSON.parse(mock.history.post.find((r) => r.url === `${B}/tables/10/fields`)!.data);
    expect(body.field).toMatchObject({ name: "Size", description: "", field_type: "single_select", default_value: "Large" });
    expect(body.field.options.map((o: { label: string }) => o.label)).toEqual(["Large", "Small"]);
    expect(body.field.options.every((o: { value?: string }) => o.value === undefined)).toBe(true); // new options: the server names them
  });

  it("6c: editing a column's type warns that its values convert, and sends the new type", async () => {
    editorBase();
    mock.onPatch(`${B}/fields/5`).reply(200, { field: field(5, "Phone", "text") });
    await openColumns();
    fireEvent.press(screen.getByTestId("tables-columns-5-menu"));
    fireEvent.press(screen.getByTestId("tables-columns-5-edit"));
    expect(await screen.findByTestId("tables-field-editor-name")).toBeTruthy();
    expect(screen.queryByTestId("tables-field-editor-type-warning")).toBeNull();
    fireEvent.press(screen.getByTestId("tables-field-editor-type-text"));
    expect(screen.getByTestId("tables-field-editor-type-warning")).toBeTruthy();
    fireEvent.press(screen.getByTestId("tables-field-editor-save"));
    await waitFor(() => expect(mock.history.patch.map((r) => JSON.parse(r.data))).toEqual([{ field: { name: "Phone", description: "", field_type: "text", default_value: null } }]));
  });

  it("a viewer has no Columns entry", async () => {
    editorBase("viewer");
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent.press(screen.getByTestId("tables-menu"));
    expect(within(await screen.findByTestId("tables-options")).queryByText("Columns")).toBeNull();
  });
});

describe("the tablet grid (increment 9)", () => {
  const tablet = () => jest.spyOn(require("react-native"), "useWindowDimensions").mockReturnValue({ width: 1024, height: 768, scale: 2, fontScale: 1 });
  beforeEach(() => {
    mockParams.current = { id: "10", base: "3" };
    mock.onGet(`${B}/tables/10`).reply(200, tableBody());
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf, row(502, "Red hat")]));
    mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }]), role: "editor" }] });
    mock.onGet(`${B}/tables/10/records/summary`).reply(200, { summary: { "1": { filled: 2 }, "3": 1 } });
  });

  it("a tablet shows a grid view as a grid: the title column held, the summary under it", async () => {
    tablet();
    renderScreen(<TableScreen />);
    expect(await screen.findByTestId("tables-grid")).toBeTruthy();
    expect(screen.queryByTestId("tables-rows")).toBeNull();
    expect(within(screen.getByTestId("tables-grid-titles")).getByText("Red hat")).toBeTruthy();
    expect((await screen.findByTestId("tables-grid-summary-rows")).props.children).toBe("2 rows");
    expect(screen.getByTestId("tables-grid-summary-3").props.children).toBe("1 filled");
    // Every control in the grid has a name a screen reader can say (the runtime sweep).
    expect(a11yFindings()).toEqual([]);
    fireEvent.press(screen.getByTestId("tables-grid-row-1"));
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/tables/record", params: expect.objectContaining({ id: "502" }) }));
  });

  it("the + button never covers the grid's summary bar: the grid stops above it (qa_phone at 800 dp, 2026-11-21)", async () => {
    tablet();
    renderScreen(<TableScreen />);
    const grid = await screen.findByTestId("tables-grid");
    expect(screen.getByTestId("tables-add-row")).toBeTruthy();
    expect((StyleSheet.flatten(grid.props.style) as { marginBottom?: number }).marginBottom).toBeGreaterThanOrEqual(56 + 16);
  });

  it("an empty grid view on a tablet says it is empty, as the cards do, rather than drawing an empty grid", async () => {
    tablet();
    mock.onGet(`${B}/tables/10/records`).reply(200, page([]));
    renderScreen(<TableScreen />);
    expect(await screen.findByTestId("tables-rows-empty")).toBeTruthy();
    expect(screen.queryByTestId("tables-grid")).toBeNull();
  });

  it("a phone keeps the cards, and asks for no summary", async () => {
    renderScreen(<TableScreen />);
    expect(await screen.findByTestId("tables-rows")).toBeTruthy();
    expect(screen.queryByTestId("tables-grid")).toBeNull();
    expect(mock.history.get.some((r) => r.url === `${B}/tables/10/records/summary`)).toBe(false);
  });
});

describe("the import banner (increment 7)", () => {
  const imp = (over: Record<string, unknown>) => ({ import: { id: 4, table_id: 10, status: "running", filename: "stock.csv", total_rows: 200, processed_rows: 50, created_count: 0, updated_count: 0, error_count: 0, error_message: null, cancel_requested: false, percent: 25, has_errors: false, dismissed_at: null, ...over } });
  beforeEach(() => {
    mockParams.current = { id: "10", base: "3" };
    mock.onGet(`${B}/tables/10`).reply(200, tableBody());
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }]), role: "editor" }] });
  });

  it("a running import shows its progress, and an editor can stop it", async () => {
    mock.onGet(`${B}/tables/10/imports/latest`).reply(200, imp({}));
    mock.onPost(`${B}/imports/4/cancel`).reply(200, imp({ cancel_requested: true }));
    renderScreen(<TableScreen />);
    expect((await screen.findByTestId("tables-import-banner-line")).props.children).toBe("Importing stock.csv: 50 / 200 rows (25 %)");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent.press(await screen.findByTestId("tables-import-banner-stop"));
    await waitFor(() => expect(mock.history.post.map((r) => r.url)).toEqual([`${B}/imports/4/cancel`]));
  });

  it("a finished import says its counts; Close hides it for every device", async () => {
    mock.onGet(`${B}/tables/10/imports/latest`).reply(200, imp({ status: "done", processed_rows: 200, created_count: 190, updated_count: 8, error_count: 2, percent: 100, has_errors: true }));
    mock.onPost(`${B}/imports/4/dismiss`).reply(200, imp({ status: "done", dismissed_at: "now" }));
    renderScreen(<TableScreen />);
    expect((await screen.findByTestId("tables-import-banner-counts")).props.children).toBe("190 added · 8 updated · 2 refused");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent.press(await screen.findByTestId("tables-import-banner-close"));
    await waitFor(() => expect(mock.history.post.map((r) => r.url)).toEqual([`${B}/imports/4/dismiss`]));
  });
});

describe("export (increment 7)", () => {
  beforeEach(() => {
    mockParams.current = { id: "10", base: "3" };
    mock.onGet(`${B}/tables/10`).reply(200, tableBody());
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }]), role: "viewer" }] });
  });
  afterEach(() => jest.restoreAllMocks());

  it("a VIEWER exports the view as Excel; the ready file goes to the share sheet", async () => {
    const api = jest.requireActual<typeof import("@/api/tables")>("@/api/tables").tablesApi;
    const download = jest.spyOn(api, "downloadExport").mockResolvedValue("file:///cache/Items.xlsx");
    const Sharing = jest.requireMock<{ shareAsync: jest.Mock }>("expo-sharing");
    mock.onPost(`${B}/tables/10/exports`).reply(201, { export: { id: 7, table_id: 10, status: "done", format: "xlsx", filename: "Items.xlsx", ready: true } });
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent.press(screen.getByTestId("tables-menu"));
    fireEvent.press(await within(await screen.findByTestId("tables-options")).findByText("Export…"));
    fireEvent.press(await within(await screen.findByTestId("tables-export")).findByText("Excel (.xlsx)"));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/Items.xlsx", { dialogTitle: "Items.xlsx" }));
    expect(JSON.parse(mock.history.post[0].data).format_type).toBe("xlsx");
    expect(download).toHaveBeenCalledTimes(1);
  });
});

describe("delete a table or a base by its exact name (the owner, 2026-11-20)", () => {
  const qaTable = () => {
    const b = tableBody();
    b.table.name = "QA table";
    return b;
  };
  beforeEach(() => {
    mockParams.current = { id: "10", base: "3" };
    mock.onGet(`${B}/tables/10`).reply(200, qaTable());
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    mock.onGet(`${B}/tables/10/impact`).reply(200, { rows: 25, fields: 4, links_from: [{ table: "Offices", field: "Items", links: 1 }] });
    useTablesUndo.getState().clear();
  });

  const openDelete = async () => {
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    fireEvent.press(screen.getByTestId("tables-menu"));
    fireEvent.press(await screen.findByText("Delete this table…"));
    return screen.findByTestId("tables-delete-table-input");
  };

  it("refuses 'qa table' and 'QA table ' (case and a trailing space count); says what goes with it", async () => {
    mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "QA table", position: 0 }, { id: 11, name: "Orders", position: 1 }]), role: "editor" }] });
    const input = await openDelete();
    expect(await screen.findByText(/25 rows and 4 columns are deleted/)).toBeTruthy();
    expect(screen.getByText(/The column “Items” of “Offices” goes too/)).toBeTruthy();
    // One of each reads in the singular (seen on a device as "1 columns", 2026-11-20).
    expect(i18n.t("tables.remove.tableImpact", { rows: i18n.t("tables.remove.rowsN", { count: 1 }), fields: i18n.t("tables.remove.columnsN", { count: 1 }) })).toBe("Its 1 row and 1 column are deleted, and its views.");
    for (const wrong of ["qa table", "QA table ", " QA table", "QA  table"]) {
      fireEvent.changeText(input, wrong);
      expect(screen.getByTestId("tables-delete-table-confirm").props.accessibilityState?.disabled).toBe(true);
      fireEvent.press(screen.getByTestId("tables-delete-table-confirm"));
    }
    expect(mock.history.delete).toHaveLength(0);
  });

  it("the exact name deletes it, says so, and moves to the base's next table", async () => {
    mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "QA table", position: 0 }, { id: 11, name: "Orders", position: 1 }]), role: "editor" }] });
    mock.onDelete(`${B}/tables/10`).reply(204);
    const input = await openDelete();
    fireEvent.changeText(input, "QA table");
    doubleTap(screen.getByTestId("tables-delete-table-confirm"));
    await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toEqual([`${B}/tables/10`]));
    await waitFor(() => expect(useTablesUndo.getState().offer?.message).toBe("Table “QA table” deleted"));
    expect(router.setParams).toHaveBeenCalledWith({ id: "11", view: undefined });
  });

  it("a viewer has no delete; only the base's owner may delete the base", async () => {
    mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "QA table", position: 0 }]), role: "viewer" }] });
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent.press(screen.getByTestId("tables-menu"));
    await screen.findByText("Ask about this table");
    expect(screen.queryByText("Delete this table…")).toBeNull();
    expect(screen.queryByText("Delete the whole base…")).toBeNull();
  });

  it("the owner deletes a base from the bases list by its exact name, sent as typed", async () => {
    mock.onGet(`${B}/bases`).reply(200, { bases: [base(3, "Shop", [{ id: 10, name: "QA table", position: 0 }])] });
    mock.onDelete(`${B}/bases/3`).reply(204);
    renderScreen(<Bases />);
    fireEvent(await screen.findByTestId("tables-base-0"), "longPress");
    fireEvent.press(await screen.findByText("Delete the whole base…"));
    const input = await screen.findByTestId("tables-delete-base-input");
    fireEvent.changeText(input, "shop");
    expect(screen.getByTestId("tables-delete-base-confirm").props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(input, "Shop");
    doubleTap(screen.getByTestId("tables-delete-base-confirm"));
    await waitFor(() => expect(mock.history.delete.length).toBe(1));
    expect(JSON.parse(mock.history.delete[0].data)).toEqual({ confirm_name: "Shop" });
  });
});

describe("select rows, then edit or delete them together (increment 5)", () => {
  const two = () => page([row(502, "Red hat", { "2": { scalar_value: "out" } }), scarf]);
  beforeEach(() => {
    mockParams.current = { id: "10", base: "3" };
    mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }]), role: "editor" }] });
    mock.onGet(`${B}/tables/10`).reply(200, tableBody());
    mock.onGet(`${B}/tables/10/records`).reply(200, two());
    useTablesUndo.getState().clear();
  });
  afterEach(() => jest.restoreAllMocks());

  const selectBoth = async () => {
    renderScreen(<TableScreen />);
    await screen.findByText("Red hat");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent(screen.getByTestId("tables-card-0"), "longPress");
    fireEvent.press(screen.getByTestId("tables-card-1"));
    expect(screen.getByTestId("tables-bulk-count").props.children).toBe("2 rows selected");
  };

  it("deletes the selected rows to the trash after a confirm; one Undo restores them all", async () => {
    mock.onPost(`${B}/tables/10/records/bulk_destroy`).reply(200, { deleted: 2, ids: [502, 501] });
    mock.onPost(`${B}/tables/10/records/restore`).reply(200, {});
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.text === "Delete")?.onPress?.());
    await selectBoth();
    doubleTap(screen.getByTestId("tables-bulk-delete"));
    await waitFor(() => expect(useTablesUndo.getState().offer?.message).toBe("2 rows deleted"));
    expect(mock.history.post).toHaveLength(1);
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ ids: [502, 501] });
    expect(screen.queryByTestId("tables-bulk-bar")).toBeNull();
    await act(async () => useTablesUndo.getState().offer?.undo?.());
    expect(JSON.parse(mock.history.post[1].data)).toEqual({ ids: [502, 501] });
  });

  it("a column the list did not load (field_ids): Undo writes back each row's REAL value, read first, never a blank", async () => {
    // A server that projects: the list's rows carry only the asked columns (title, Status, Supplier,
    // Photos), so Phone (5) was never loaded and the old values must come from each row.
    mock.resetHandlers();
    mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }]), role: "editor" }] });
    mock.onGet(`${B}/tables/10`).reply(200, tableBody());
    mock.onGet(`${B}/tables/10/records`).reply(200, page([row(502, "Red hat", { "2": { scalar_value: "out" } }), row(501, "Blue scarf", { "2": { scalar_value: "in" } })]));
    mock.onGet(`${B}/records/502`).reply(200, { record: row(502, "Red hat", { "5": { scalar_value: "+93 70 000 0002" } }) });
    mock.onGet(`${B}/records/501`).reply(200, { record: scarf });
    mock.onPost(`${B}/tables/10/records/bulk_write`).reply(200, { result: { created: 0, updated: 2, ids: [502, 501] }, records: [] });
    await selectBoth();
    fireEvent.press(screen.getByTestId("tables-bulk-edit-open"));
    fireEvent.press(await screen.findByTestId("tables-bulk-field-5"));
    fireEvent.changeText(screen.getByTestId("tables-bulk-value"), "+93 70 999 9999");
    fireEvent.press(screen.getByTestId("tables-bulk-edit-apply"));
    await waitFor(() => expect(useTablesUndo.getState().offer?.message).toBe("2 rows changed"));
    await act(async () => useTablesUndo.getState().offer?.undo?.());
    const undo = JSON.parse(mock.history.post[mock.history.post.length - 1].data);
    expect(undo).toEqual({ rows: [{ id: 502, values: { "5": "+93 70 000 0002" } }, { id: 501, values: { "5": "+93 70 123 4567" } }] });
  });

  it("a server that IGNORES field_ids (prod until the deploy): every column came, so nothing is read again", async () => {
    // The default rows carry Phone (5), a column the list did not ask for: the server sent everything.
    mock.onPost(`${B}/tables/10/records/bulk_write`).reply(200, { result: { created: 0, updated: 2, ids: [502, 501] }, records: [] });
    await selectBoth();
    fireEvent.press(screen.getByTestId("tables-bulk-edit-open"));
    fireEvent.press(await screen.findByTestId("tables-bulk-field-5"));
    fireEvent.changeText(screen.getByTestId("tables-bulk-value"), "+93 70 999 9999");
    fireEvent.press(screen.getByTestId("tables-bulk-edit-apply"));
    await waitFor(() => expect(useTablesUndo.getState().offer?.message).toBe("2 rows changed"));
    expect(mock.history.get.filter((r) => /\/records\/\d+$/.test(r.url ?? ""))).toHaveLength(0); // no extra fetch
    await act(async () => useTablesUndo.getState().offer?.undo?.());
    const undo = JSON.parse(mock.history.post[mock.history.post.length - 1].data);
    expect(undo).toEqual({ rows: [{ id: 502, values: { "5": null } }, { id: 501, values: { "5": "+93 70 123 4567" } }] });
  });

  it("sets one column on every selected row; Undo writes each row's own value back", async () => {
    mock.onPost(`${B}/tables/10/records/bulk_write`).reply(200, { result: { created: 0, updated: 2, ids: [502, 501] }, records: [] });
    await selectBoth();
    fireEvent.press(screen.getByTestId("tables-bulk-edit-open"));
    fireEvent.press(await screen.findByTestId("tables-bulk-field-2"));
    fireEvent.press(screen.getByTestId("tables-bulk-value-in"));
    fireEvent.press(screen.getByTestId("tables-bulk-edit-apply"));
    await waitFor(() => expect(useTablesUndo.getState().offer?.message).toBe("2 rows changed"));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ rows: [{ id: 502, values: { "2": "in" } }, { id: 501, values: { "2": "in" } }] });
    await act(async () => useTablesUndo.getState().offer?.undo?.());
    expect(JSON.parse(mock.history.post[1].data)).toEqual({ rows: [{ id: 502, values: { "2": "out" } }, { id: 501, values: { "2": "in" } }] });
  });

  it("a viewer cannot start selecting", async () => {
    mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }]), role: "viewer" }] });
    renderScreen(<TableScreen />);
    await screen.findByText("Red hat");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent(screen.getByTestId("tables-card-0"), "longPress");
    expect(screen.queryByTestId("tables-bulk-bar")).toBeNull();
  });
});

describe("comments and history (increment 5)", () => {
  // Rendered here so a missing screen fails red.
  const Activity = jest.requireActual<typeof import("../../../../app/tables/activity")>("../../../../app/tables/activity").default;
  const comment = (id: number, body: string, mine = true) => ({ id, body, edited_at: null, created_at: "2026-11-20T10:00:00Z", user: { id: mine ? 1 : 2, name: mine ? "QA" : "Omar" }, mine, can_delete: mine, files: [] });
  beforeEach(() => {
    mockParams.current = { table: "10", record: "501" };
    mock.onGet(`${B}/tables/10`).reply(200, tableBody());
    mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }]), role: "editor" }] });
    mock.onGet(`${B}/bases/3/members`).reply(200, { owner: { id: 1, name: "QA", email: "qa@example.test" }, members: [{ id: 5, role: "editor", pending: false, email: "o@example.test", name: "Omar", user_id: 42, invited_at: null }] });
  });
  afterEach(() => jest.restoreAllMocks());

  it("lists the row's comments and sends one with a mention, by the person's ACCOUNT id", async () => {
    mock.onGet(`${B}/tables/10/comments`).reply(200, { comments: [comment(9, "First look")], next_before: null });
    mock.onPost(`${B}/tables/10/comments`).reply(201, { comment: comment(10, "x") });
    renderScreen(<Activity />);
    expect(await screen.findByText("First look")).toBeTruthy();
    expect(mock.history.get.find((r) => r.url === `${B}/tables/10/comments`)?.params).toEqual({ record_id: 501 });
    fireEvent.changeText(screen.getByTestId("tables-comment-input"), "Can you check @Om");
    fireEvent.press(await screen.findByTestId("tables-mention-42"));
    doubleTap(screen.getByTestId("tables-comment-send"));
    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ comment: { body: "Can you check @Omar", record_id: 501, mention_ids: [42] } });
  });

  it("edits and deletes one's own comment from a long press", async () => {
    mock.onGet(`${B}/tables/10/comments`).reply(200, { comments: [comment(9, "Typo here")], next_before: null });
    mock.onPatch(`${B}/comments/9`).reply(200, { comment: comment(9, "Fixed") });
    mock.onDelete(`${B}/comments/9`).reply(204);
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.text === "Delete")?.onPress?.());
    renderScreen(<Activity />);
    fireEvent(await screen.findByTestId("tables-comment-0"), "longPress");
    fireEvent.press(await screen.findByText("Edit"));
    fireEvent.changeText(screen.getByTestId("tables-comment-input"), "Fixed");
    fireEvent.press(screen.getByTestId("tables-comment-send"));
    await waitFor(() => expect(JSON.parse(mock.history.patch[0].data)).toEqual({ comment: { body: "Fixed" } }));
    fireEvent(screen.getByTestId("tables-comment-0"), "longPress");
    fireEvent.press(await screen.findByText("Delete"));
    await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toEqual([`${B}/comments/9`]));
  });

  it("joins files: a refused video is said, a chip can be removed, and files alone can be sent (the web's `CommentsFeed.tsx`)", async () => {
    const pickers = jest.requireActual<typeof import("@/screens/contacts/documents")>("@/screens/contacts/documents");
    const api = jest.requireActual<typeof import("@/api/tables")>("@/api/tables").tablesApi;
    jest.spyOn(pickers, "pickPhotos").mockResolvedValue({
      files: [
        { uri: "file:///shop.jpg", name: "shop.jpg", mimeType: "image/jpeg", size: 2048 },
        { uri: "file:///clip.mp4", name: "clip.mp4", mimeType: "video/mp4", size: 2048 },
        { uri: "file:///till.jpg", name: "till.jpg", mimeType: "image/jpeg", size: 4096 },
      ],
    });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const add = jest.spyOn(api, "addComment").mockResolvedValue({ id: 11, body: "", editedAt: null, createdAt: "x", author: { id: 1, name: "QA" }, mine: true, canDelete: true, files: [] });
    mock.onGet(`${B}/tables/10/comments`).reply(200, { comments: [{ ...comment(9, "Receipt"), files: [{ id: 3, filename: "receipt.pdf", content_type: "application/pdf", byte_size: 10, url: "https://example.test/receipt.pdf" }] }], next_before: null });
    renderScreen(<Activity />);
    expect(await screen.findByTestId("tables-comment-0-file-0")).toBeTruthy();
    expect(screen.getByLabelText("Open receipt.pdf")).toBeTruthy();
    expect(screen.getByTestId("tables-comment-send").props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByTestId("tables-comment-attach"));
    fireEvent.press(await screen.findByText("Photos"));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Some files were not joined", "clip.mp4: this kind of file cannot be joined"));
    expect(within(screen.getByTestId("tables-comment-files")).getByText("shop.jpg")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Remove shop.jpg"));
    expect(within(screen.getByTestId("tables-comment-files")).queryByText("shop.jpg")).toBeNull();
    expect(screen.getByTestId("tables-comment-send").props.accessibilityState.disabled).toBe(false);
    fireEvent.press(screen.getByTestId("tables-comment-send"));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add).toHaveBeenCalledWith(10, { body: "", recordId: 501, mentionIds: [], files: [{ uri: "file:///till.jpg", name: "till.jpg", mimeType: "image/jpeg", size: 4096 }] });
    await waitFor(() => expect(screen.queryByTestId("tables-comment-files")).toBeNull());
  });

  it("a comment of files only draws no empty text line (device pass 3, 2026-11-20)", async () => {
    mock.onGet(`${B}/tables/10/comments`).reply(200, { comments: [{ ...comment(9, ""), files: [{ id: 3, filename: "shop.jpg", content_type: "image/jpeg", byte_size: 10, url: "https://example.test/shop.jpg" }] }], next_before: null });
    renderScreen(<Activity />);
    const row = await screen.findByTestId("tables-comment-0");
    const texts = within(row).UNSAFE_queryAllByType(jest.requireActual("react-native").Text);
    expect(texts.filter((n) => n.props.children === "").length).toBe(0);
    expect(within(row).getByText("shop.jpg")).toBeTruthy();
  });

  it("someone else's comment offers nothing to change", async () => {
    mock.onGet(`${B}/tables/10/comments`).reply(200, { comments: [comment(9, "Theirs", false)], next_before: null });
    renderScreen(<Activity />);
    fireEvent(await screen.findByTestId("tables-comment-0"), "longPress");
    expect(screen.queryByText("Edit")).toBeNull();
  });

  it("the table's history reads in words, filters by kind, and restores a deleted column", async () => {
    mockParams.current = { table: "10", tab: "history" };
    mock.onGet(`${B}/tables/10/activities`).reply((config) => [
      200,
      (config.params as { kind?: string }).kind === "columns"
        ? { activities: [{ id: 2, action: "column.deleted", source: "app", details: { column: "Price" }, subject_type: "field_definition", subject_id: 77, user: { id: 1, name: "QA" }, created_at: "2026-11-20T10:00:00Z", updated_at: "x", restorable: true }], next_before: null }
        : { activities: [{ id: 1, action: "row.updated", source: "assistant", details: { fields: ["Status"] }, subject_type: "record", subject_id: 501, user: { id: 1, name: "QA" }, created_at: "2026-11-20T10:00:00Z", updated_at: "x", restorable: false }], next_before: null },
    ]);
    mock.onPost(`${B}/fields/77/restore`).reply(200, {});
    renderScreen(<Activity />);
    expect(await screen.findByText("QA changed a row (Status)")).toBeTruthy();
    expect(screen.getByTestId("tables-history-0-source").props.children).toBe("Assistant");
    fireEvent.press(screen.getByTestId("tables-history-kind-columns"));
    expect(await screen.findByText('QA deleted the column "Price"')).toBeTruthy();
    fireEvent.press(screen.getByTestId("tables-history-0-restore"));
    await waitFor(() => expect(mock.history.post.map((r) => r.url)).toEqual([`${B}/fields/77/restore`]));
  });

  it("filters the table's history by person, by ACCOUNT id, and offers it only with two people (the web's `HistoryFeed.tsx`)", async () => {
    mockParams.current = { table: "10", tab: "history" };
    mock.onGet(`${B}/tables/10/activities`).reply((config) => [
      200,
      (config.params as { user_id?: number }).user_id === 42
        ? { activities: [{ id: 3, action: "row.created", source: "app", details: {}, subject_type: "record", subject_id: 7, user: { id: 42, name: "Omar" }, created_at: "2026-11-20T10:00:00Z", updated_at: "x", restorable: false }], next_before: null }
        : { activities: [], next_before: null },
    ]);
    renderScreen(<Activity />);
    fireEvent.press(await screen.findByTestId("tables-history-person-42"));
    await waitFor(() => expect(mock.history.get.filter((r) => r.url === `${B}/tables/10/activities`).at(-1)?.params).toEqual({ user_id: 42 }));
    expect(screen.getByLabelText("Changes by Omar").props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId("tables-history-person-0"));
    await waitFor(() => expect(mock.history.get.filter((r) => r.url === `${B}/tables/10/activities`).at(-1)?.params).toEqual({}));
  });

  it("a row's history offers no person filter (the row view is the row's own)", async () => {
    mockParams.current = { table: "10", record: "501", tab: "history" };
    mock.onGet(`${B}/tables/10/activities`).reply(200, { activities: [], next_before: null });
    renderScreen(<Activity />);
    expect(await screen.findByTestId("tables-history-empty")).toBeTruthy();
    expect(screen.queryByTestId("tables-history-people")).toBeNull();
  });
});

describe("share the base (increment 5)", () => {
  const people = { owner: { id: 1, name: "QA", email: "qa@example.test" }, members: [{ id: 5, role: "viewer", pending: true, email: "friend@example.test", name: null, user_id: null, invited_at: "t" }] };
  beforeEach(() => {
    mockParams.current = { id: "10", base: "3" };
    mock.onGet(`${B}/tables/10`).reply(200, tableBody());
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    mock.onGet(`${B}/bases/3/members`).reply(200, people);
  });
  afterEach(() => jest.restoreAllMocks());

  const openShare = async (role: string, label: string) => {
    mock.onGet(`${B}/bases`).reply(200, { bases: [{ ...base(3, "[qa] Shop", [{ id: 10, name: "Items", position: 0 }]), role }] });
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    await waitFor(() => expect(mock.history.get.some((r) => r.url === `${B}/bases`)).toBe(true));
    fireEvent.press(screen.getByTestId("tables-menu"));
    fireEvent.press(await screen.findByText(label));
    await screen.findByTestId("tables-share-member-0");
  };

  it("the owner invites by email with a role, after the sheet says an email may go out", async () => {
    mock.onPost(`${B}/bases/3/members`).reply(201, { member: { id: 6, role: "editor", pending: false, email: "e@example.test", name: "E", user_id: 7, invited_at: null }, state: "added" });
    await openShare("owner", "Share the base");
    expect(screen.getByText("Someone without an account gets an invitation email.")).toBeTruthy();
    expect(screen.getByTestId("tables-share-invite").props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(screen.getByTestId("tables-share-email"), "e@example.test");
    fireEvent.press(screen.getByTestId("tables-share-role-editor"));
    fireEvent.press(screen.getByTestId("tables-share-invite"));
    await waitFor(() => expect(mock.history.post.length).toBe(1));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ email: "e@example.test", role: "editor" });
  });

  it("the owner changes a role, resends a pending invitation, and removes after a confirm", async () => {
    mock.onPatch(`${B}/bases/3/members/5`).reply(200, { member: { ...people.members[0], role: "editor" } });
    mock.onPost(`${B}/bases/3/members/5/resend`).reply(200, { member: people.members[0] });
    mock.onDelete(`${B}/bases/3/members/5`).reply(204);
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.text === "Remove")?.onPress?.());
    await openShare("owner", "Share the base");
    fireEvent.press(screen.getByTestId("tables-share-member-0-editor"));
    await waitFor(() => expect(JSON.parse(mock.history.patch[0].data)).toEqual({ role: "editor" }));
    fireEvent.press(screen.getByTestId("tables-share-member-0-resend"));
    await waitFor(() => expect(mock.history.post.map((r) => r.url)).toEqual([`${B}/bases/3/members/5/resend`]));
    fireEvent.press(screen.getByTestId("tables-share-member-0-remove"));
    await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toEqual([`${B}/bases/3/members/5`]));
  });

  it("an editor sees who has access, and nothing to change it with", async () => {
    await openShare("editor", "Who has access");
    expect(screen.queryByTestId("tables-share-email")).toBeNull();
    expect(screen.queryByTestId("tables-share-member-0-remove")).toBeNull();
    expect(screen.getByText("Only the base's owner can share it.")).toBeTruthy();
  });
});
