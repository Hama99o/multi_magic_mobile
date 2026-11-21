/**
 * Table imports (increment 7) against multi-magic-83's draft preview
 * contract (2026-11-21): its sample response, its refusal reasons, and the
 * import sent with the preview's upload instead of the file.
 */
import MockAdapter from "axios-mock-adapter";
import { http } from "@/api/http";
import { parsePreview, previewRefusal, tableImportsApi } from "../tableImports";

const B = "/api/v1/table_app";
let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

const zero = { count: 0, first: null };
const contractSample = {
  upload: "signed-1",
  filename: "vendeurs.xlsx",
  sheets: [{ index: 0, name: "Vendeurs" }, { index: 1, name: "Archive" }],
  sheet: 0,
  headers: ["Nom", "Ville", "Column 3"],
  unnamed: [false, false, true],
  row_count: 1834,
  truncated: false,
  sample: [["Ahmad", "Kabul", ""]],
  guesses: [
    { type: "text", fill_rate: 1, samples: ["Ahmad"], options: [], refused: { text: zero, long_text: zero, decimal: { count: 1834, first: "Ahmad" }, integer: { count: 1834, first: "Ahmad" }, phone: zero, email: zero, url: zero, single_select: zero, date: { count: 1834, first: "Ahmad" }, boolean: { count: 1834, first: "Ahmad" } } },
    { type: "single_select", fill_rate: 0.97, samples: ["Kabul", "Herat"], options: ["Kabul", "Herat"], refused: {} },
    { type: "text", fill_rate: 0, samples: [], options: [], refused: {} },
  ],
};

it("reads the preview into the mapping screen's Sheet, every refusal key present", () => {
  const sheet = parsePreview(contractSample);
  expect(sheet.source).toEqual({ kind: "upload", upload: "signed-1", filename: "vendeurs.xlsx" });
  expect(sheet.sheets.map((s) => s.name)).toEqual(["Vendeurs", "Archive"]);
  expect(sheet.unnamed).toEqual([false, false, true]);
  expect(sheet.rowCount).toBe(1834);
  expect(sheet.guesses[0].refused.decimal).toEqual({ count: 1834, first: "Ahmad" });
  expect(sheet.guesses[1].refused.date).toEqual(zero); // a missing entry reads as nothing refused
  expect(sheet.guesses[1].options).toEqual(["Kabul", "Herat"]);
});

it("names why a preview was refused, and a 404 as not deployed yet (the phone then reads CSV itself)", () => {
  const err = (status: number, reason?: string) => ({ response: { status, data: reason ? { reason } : {} } });
  expect(previewRefusal(err(404))).toBe("missing");
  expect(previewRefusal(err(413))).toBe("too_large");
  expect(previewRefusal(err(422, "unreadable"))).toBe("unreadable");
  expect(previewRefusal(err(422, "no_sheet"))).toBe("no_sheet");
  expect(previewRefusal(new Error("offline"))).toBe("other");
});

it("starts the import with the preview's upload, not the file again", async () => {
  const appended: [string, unknown][] = [];
  const original = FormData.prototype.append;
  jest.spyOn(FormData.prototype, "append").mockImplementation(function (this: FormData, field: string, part: unknown) {
    appended.push([field, part]);
    return original.call(this, field, String(part) as unknown as Blob);
  });
  mock.onPost(`${B}/tables/10/imports`).reply(201, { import: { id: 4, table_id: 10, status: "queued", filename: "vendeurs.xlsx", processed_rows: 0, percent: 0, has_errors: false } });
  const started = await tablesImport();
  expect(appended).toEqual([
    ["upload", "signed-1"],
    ["columns", JSON.stringify([{ field_id: 1 }, {}])],
    ["upsert_on", "1"],
    ["idempotency_key", "k1"],
  ]);
  expect(started).toMatchObject({ id: 4, status: "queued", percent: 0 });
});

const tablesImport = () => tableImportsApi.create(10, { upload: "signed-1" }, [{ field_id: 1 }, {}], { upsertOn: 1, idempotencyKey: "k1" });

it("the banner's import: latest, or none", async () => {
  mock.onGet(`${B}/tables/10/imports/latest`).reply(200, { import: null });
  expect(await tableImportsApi.latest(10)).toBeNull();
});
