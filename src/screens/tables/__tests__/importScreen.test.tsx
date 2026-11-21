/**
 * Import (increment 7) on screen: a paste read on the phone while the preview
 * is not deployed, mapped, refused values said, then started with the CSV;
 * the same through the server's preview with its upload id; and the banner.
 */
import MockAdapter from "axios-mock-adapter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { testQueryClient } from "@/__tests__/queryClient";
import { router as mockedRouter } from "expo-router";

const mockParams: { current: Record<string, string> } = { current: { table: "10" } };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
  useNavigation: () => ({ addListener: jest.fn(() => () => undefined), dispatch: jest.fn() }),
}));
jest.mock("expo-file-system", () => {
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = `file:///cache/${parts.map((p) => (typeof p === "string" ? p : "")).filter(Boolean).join("/")}`;
    }
    create() {}
    write() {}
    async text() {
      return "";
    }
  }
  return { File, Paths: { cache: {} } };
});

const B = "/api/v1/table_app";
let mock: MockAdapter;
const router = mockedRouter as unknown as { back: jest.Mock };
const field = (id: number, name: string, field_type: string) => ({ id, name, key: `f${id}`, field_type, record_class: null, core_tag_category_id: null, position: id, required: false, config: {}, owner_type: "TableApp::Table", owner_id: 10 });
const view = { id: 70, table_id: 10, name: "Grid", view_type: "grid", position: 0, config: {} };
const tableBody = { table: { id: 10, base_id: 3, name: "Items", icon: null, color: null, description: null, position: 0, updated_at: "x", fields: [field(1, "Name", "text"), field(2, "Price", "decimal")], relations: {}, primary_field_id: 1, view, views: [view] } };
const bases = { bases: [{ id: 3, name: "Shop", description: null, icon: null, color: null, created_at: "x", updated_at: "x", owner: { id: 1, name: "QA" }, role: "editor", tables: [{ id: 10, name: "Items", position: 0, base_id: 3, icon: null, color: null, description: null, updated_at: "x" }], record_counts: {} }] };

function renderScreen(element: ReactElement) {
  return render(<QueryClientProvider client={testQueryClient()}>{element}</QueryClientProvider>);
}

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  router.back.mockClear();
  await AsyncStorage.clear();
  await i18n.changeLanguage("en");
  mock.onGet(`${B}/tables/10`).reply(200, tableBody);
  mock.onGet(`${B}/bases`).reply(200, bases);
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

/** A step's button once the table and the person's role are loaded (it waits for them, as the person does). */
async function enabled(testID: string) {
  const button = await screen.findByTestId(testID);
  await waitFor(() => expect(screen.getByTestId(testID).props.accessibilityState?.disabled).toBeFalsy());
  return button;
}

const Import = () => {
  const Screen = jest.requireActual<typeof import("../../../../app/tables/import")>("../../../../app/tables/import").default;
  return <Screen />;
};

it("a paste, with the preview not deployed: read on the phone, mapped by name, a refusal said, started as a CSV", async () => {
  mock.onPost(`${B}/tables/10/imports/preview`).reply(404);
  mock.onPost(`${B}/tables/10/imports`).reply(201, { import: { id: 4, table_id: 10, status: "queued", filename: "paste.csv", processed_rows: 0, percent: 0 } });
  renderScreen(<Import />);
  fireEvent.press(await enabled("tables-import-paste"));
  fireEvent.changeText(screen.getByTestId("tables-import-text"), "Name\tPrice\nScarf\t12\nHat\tfree");
  fireEvent.press(screen.getByTestId("tables-import-read"));
  expect(await screen.findByTestId("tables-import-summary")).toBeTruthy();
  expect(screen.getByTestId("tables-import-summary").props.children).toBe("2 rows · 2 of 2 columns imported");
  // "Price" matches the table's number column, and "free" would be refused there.
  expect(screen.getByTestId("tables-import-column-1-field-2").props.accessibilityState.selected).toBe(true);
  expect(screen.getByTestId("tables-import-column-1-refused").props.children).toBe("1 value would be refused (first: free)");
  fireEvent.press(screen.getByTestId("tables-import-start"));
  await waitFor(() => expect(router.back).toHaveBeenCalled());
  expect(mock.history.post.map((r) => r.url)).toEqual([`${B}/tables/10/imports/preview`, `${B}/tables/10/imports`]);
});

it("through the server's preview: its sheets, and the import sent with its upload id", async () => {
  mock.onPost(`${B}/tables/10/imports/preview`).reply(200, {
    upload: "signed-1", filename: "stock.xlsx", sheets: [{ index: 0, name: "Stock" }], sheet: 0,
    headers: ["Name", "Colour"], unnamed: [false, false], row_count: 1834, truncated: false,
    sample: [["Scarf", "Blue"]],
    guesses: [
      { type: "text", fill_rate: 1, samples: ["Scarf"], options: [], refused: {} },
      { type: "single_select", fill_rate: 1, samples: ["Blue", "Red"], options: ["Blue", "Red"], refused: {} },
    ],
  });
  mock.onPost(`${B}/tables/10/imports`).reply(201, { import: { id: 5, table_id: 10, status: "queued", filename: "stock.xlsx" } });
  const appended: [string, unknown][] = [];
  const original = FormData.prototype.append;
  jest.spyOn(FormData.prototype, "append").mockImplementation(function (this: FormData, f: string, part: unknown) {
    appended.push([f, part]);
    return original.call(this, f, String(part) as unknown as Blob);
  });
  const files = jest.requireActual<typeof import("@/screens/pages/addFiles")>("@/screens/pages/addFiles");
  jest.spyOn(files, "pickDocuments").mockResolvedValue({ files: [{ uri: "file:///docs/stock.xlsx", name: "stock.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 9000 }] });
  renderScreen(<Import />);
  fireEvent.press(await enabled("tables-import-file"));
  expect(await screen.findByTestId("tables-import-summary")).toBeTruthy();
  expect(screen.getByTestId("tables-import-summary").props.children).toBe("1834 rows · 2 of 2 columns imported");
  expect(screen.getByTestId("tables-import-column-1-new-single_select").props.accessibilityState.selected).toBe(true); // a new select, the server's guess
  fireEvent.press(screen.getByTestId("tables-import-start"));
  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const sent = appended.filter(([f]) => f !== "file");
  expect(sent.find(([f]) => f === "upload")).toEqual(["upload", "signed-1"]);
  expect(JSON.parse(String(sent.find(([f]) => f === "columns")?.[1]))).toEqual([{ field_id: 1 }, { new_field_name: "Colour", new_field_type: "single_select", options: ["Blue", "Red"] }]);
  expect(appended.filter(([f]) => f === "file")).toHaveLength(1); // once, to the preview; never again
});

it("an Excel file while the preview is not deployed says to use CSV or the web", async () => {
  mock.onPost(`${B}/tables/10/imports/preview`).reply(404);
  const files = jest.requireActual<typeof import("@/screens/pages/addFiles")>("@/screens/pages/addFiles");
  jest.spyOn(files, "pickDocuments").mockResolvedValue({ files: [{ uri: "file:///docs/stock.xlsx", name: "stock.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 9000 }] });
  renderScreen(<Import />);
  fireEvent.press(await enabled("tables-import-file"));
  expect((await screen.findByTestId("tables-import-message")).props.children).toBe("An Excel file is read on the web for now. Save it as CSV, or import it from the web.");
  expect(mock.history.post.filter((r) => r.url === `${B}/tables/10/imports`)).toHaveLength(0);
});
