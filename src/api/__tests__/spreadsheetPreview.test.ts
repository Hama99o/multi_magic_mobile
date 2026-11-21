/**
 * A spreadsheet read by the server for the viewer (parity #46; multi-magic-83,
 * GET /api/v1/page_app/nodes/:id/spreadsheet_preview). Shapes from a live
 * call on :3020 with an invented two-sheet workbook.
 */
import MockAdapter from "axios-mock-adapter";
import { http } from "../http";
import { pagesApi } from "../pages";

let mock: MockAdapter;
beforeEach(() => (mock = new MockAdapter(http)));
afterEach(() => mock.restore());

it("reads the sheets, the chosen sheet and its rows (header row included)", async () => {
  mock.onGet("/api/v1/page_app/nodes/7/spreadsheet_preview").reply(200, {
    filename: "Budget.xlsx",
    sheets: [{ index: 0, name: "Trips" }, { index: 1, name: "Notes" }],
    sheet: 1,
    rows: [["Note"], ["Bring a charger"]],
    truncated: false,
  });
  const out = await pagesApi.spreadsheetPreview(7, 1);
  expect(mock.history.get[0].params).toEqual({ sheet: 1 });
  expect(out).toEqual({ filename: "Budget.xlsx", sheets: [{ index: 0, name: "Trips" }, { index: 1, name: "Notes" }], sheet: 1, rows: [["Note"], ["Bring a charger"]], truncated: false });
});

it("a cell that is not text becomes text, and a ragged row is kept as sent", async () => {
  mock.onGet("/api/v1/page_app/nodes/7/spreadsheet_preview").reply(200, { filename: "x.ods", sheets: [{ index: 0, name: "S" }], sheet: 0, rows: [["a", 2, null], ["b"]], truncated: true });
  const out = await pagesApi.spreadsheetPreview(7, 0);
  expect(out.rows).toEqual([["a", "2", ""], ["b"]]);
  expect(out.truncated).toBe(true);
});

it("the server's refusal arrives with its reason and its sentence (no_sheet, 422)", async () => {
  mock.onGet("/api/v1/page_app/nodes/7/spreadsheet_preview").reply(422, { message: "Cette feuille n'existe pas dans le fichier.", reason: "no_sheet" });
  await expect(pagesApi.spreadsheetPreview(7, 9)).rejects.toMatchObject({ response: { status: 422, data: { reason: "no_sheet" } } });
});
