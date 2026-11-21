/**
 * An XLSX or ODS file in the viewer (parity #46): the server reads it, the
 * phone draws the table, with a tab per sheet when there is more than one.
 * Invented values only.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { http } from "@/api/http";
import { testQueryClient } from "@/__tests__/queryClient";
import { WorkbookView } from "../WorkbookView";

const URL = "/api/v1/page_app/nodes/7/spreadsheet_preview";
const SHEETS = [{ index: 0, name: "Trips" }, { index: 1, name: "Notes" }];
let mock: MockAdapter;
beforeEach(() => (mock = new MockAdapter(http)));
afterEach(() => mock.restore());

const show = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <WorkbookView nodeId={7} />
    </QueryClientProvider>,
  );

it("draws the first sheet, and a tab opens another sheet", async () => {
  mock.onGet(URL, { params: { sheet: 0 } }).reply(200, { filename: "Budget.xlsx", sheets: SHEETS, sheet: 0, rows: [["Place", "Cost"], ["Lyon", "40.5"]], truncated: false });
  mock.onGet(URL, { params: { sheet: 1 } }).reply(200, { filename: "Budget.xlsx", sheets: SHEETS, sheet: 1, rows: [["Note"], ["Bring a charger"]], truncated: false });
  show();
  expect(await screen.findByText("Lyon")).toBeTruthy();
  expect(screen.queryByTestId("pages-sheet-truncated")).toBeNull();
  fireEvent.press(screen.getByTestId("pages-workbook-sheet-1"));
  expect(await screen.findByText("Bring a charger")).toBeTruthy();
});

it("one sheet: no tabs; a cut table says where it stops", async () => {
  mock.onGet(URL).reply(200, { filename: "Big.ods", sheets: [{ index: 0, name: "S" }], sheet: 0, rows: [["a"]], truncated: true });
  show();
  expect(await screen.findByTestId("pages-sheet-truncated")).toBeTruthy();
  expect(screen.queryByTestId("pages-workbook-sheet-0")).toBeNull();
});

it("a refusal is said in the server's own sentence (it is in the reader's language)", async () => {
  mock.onGet(URL).reply(422, { message: "Ce fichier est endommagé.", reason: "unreadable" });
  show();
  await waitFor(() => expect(screen.getByText("Ce fichier est endommagé.")).toBeTruthy());
});
