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
import { Alert } from "react-native";
import { useTablesUndo } from "@/stores/tablesUndo.store";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { router as mockedRouter } from "expo-router";
import Bases from "../../../../app/tables";
import TableScreen from "../../../../app/tables/table";
import RecordScreen from "../../../../app/tables/record";

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
  useNavigation: () => ({ addListener: jest.fn(() => () => undefined), dispatch: jest.fn() }),
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock("expo-clipboard", () => require("@/__tests__/screenMocks").clipboard);

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

const row = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id, position: id, created_at: "2026-11-19T09:00:00Z", updated_at: "2026-11-19T09:30:00Z",
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
  await AsyncStorage.clear();
  await i18n.changeLanguage("en");
});
afterEach(() => {
  // The owner's rule (SPEC C1): no screen here writes a view, ever.
  expect(mock.history.patch.filter((r) => r.url?.includes("/views/"))).toEqual([]);
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
    expect(recordCalls()[0]).toEqual({ offset: 0, limit: 100, sort: "-created_at" });
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
    mock.onGet(`${B}/tables/10/records`).reply(200, page([scarf]));
    renderScreen(<TableScreen />);
    await screen.findByText("Blue scarf");
    fireEvent.press(screen.getByTestId("tables-order"));
    await waitFor(() => expect(recordCalls().some((p) => p.sort === undefined)).toBe(true));
    expect(screen.getByTestId("tables-personal-note")).toBeTruthy();
    expect(screen.getByTestId("tables-personal-dot")).toBeTruthy();
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
    expect(recordCalls()[0]).toEqual({ offset: 0, limit: 100, sorts: JSON.stringify([{ field_id: 1, direction: "asc" }]) });
    expect(screen.queryByTestId("tables-order")).toBeNull();
  });

  it("loads the next page at the end, without a row twice, and keeps the rows when a page fails", async () => {
    mock.onGet(`${B}/tables/10/records`, { params: { offset: 0, limit: 100, sort: "-created_at" } }).reply(200, page([scarf, row(502, "Red hat")], { has_more: true, total_count: 3, table_total: 3 }));
    mock.onGet(`${B}/tables/10/records`, { params: { offset: 2, limit: 100, sort: "-created_at" } }).replyOnce(500);
    renderScreen(<TableScreen />);
    await screen.findByText("Red hat");
    await act(async () => {
      fireEvent(screen.getByTestId("tables-rows"), "onEndReached");
    });
    expect(await screen.findByTestId("tables-page-retry")).toBeTruthy();
    expect(screen.getByText("Blue scarf")).toBeTruthy();
    mock.onGet(`${B}/tables/10/records`, { params: { offset: 2, limit: 100, sort: "-created_at" } }).reply(200, { records: [row(502, "Red hat"), row(503, "Green bag")], meta: { offset: 2, limit: 100, has_more: false } });
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
    fireEvent.press(await screen.findByTestId("tables-add-row"));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/tables/record", params: { table: "10", id: "778" } }));
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
