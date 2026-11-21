/**
 * The import's sheet (increment 7): the web's importGuess rules, ported case
 * for case (its importGuess.test.ts), the refusal counts with every key, the
 * mapping's defaults, and the columns sent to imports#create.
 */
import type { FieldDefinition } from "@/api/fields";
import { defaultTarget, fitsType, guessColumn, importColumns, REFUSAL_KEYS, sheetFromGrid } from "../importSheet";

describe("guessColumn (the web's importGuess.test.ts)", () => {
  it("reads years as numbers and a few repeated words as a select", () => {
    expect(guessColumn(["2011", "2012", "2013"]).type).toBe("decimal");
    expect(guessColumn(["Kabul", "Jalalabad", "Kabul", "Kabul", "Jalalabad", "Kabul"]).type).toBe("single_select");
  });

  it("keeps a column with one non-number as text, so nothing is refused", () => {
    expect(guessColumn([...Array.from({ length: 99 }, (_, i) => String(i * 7)), "C"]).type).toBe("text");
  });

  it("sees dates, emails and phones, and reports how full a column is", () => {
    expect(guessColumn(["2026-10-01", "03/10/2026"]).type).toBe("date");
    expect(guessColumn(["a@b.co", "c@d.org"]).type).toBe("email");
    expect(guessColumn(["+93 700 000 001", "+93 700 000 002"]).type).toBe("phone");
    expect(guessColumn(["x", "", "", ""]).fillRate).toBe(0.25);
  });

  it("a select keeps its options most frequent first", () => {
    expect(guessColumn(["Herat", "Kabul", "Kabul", "Kabul", "Herat", "Mazar", "Kabul"]).options).toEqual(["Kabul", "Herat", "Mazar"]);
  });
});

describe("refusals (the preview's contract: every key, only numbers, yes/no and dates refuse)", () => {
  it("counts what each type would refuse over every value, with the first one; empty cells never count", () => {
    const g = guessColumn(["12", "C", "", "14", "D"]);
    expect(Object.keys(g.refused).sort()).toEqual([...REFUSAL_KEYS].sort());
    expect(g.refused.decimal).toEqual({ count: 2, first: "C" });
    expect(g.refused.integer).toEqual({ count: 2, first: "C" });
    for (const k of ["text", "long_text", "phone", "email", "url", "single_select"] as const) expect(g.refused[k]).toEqual({ count: 0, first: null });
  });

  it("fitsType is the server's Cell: commas and spaces in numbers, the yes/no words, real calendar days", () => {
    expect(fitsType("decimal", "1 250,5")).toBe(true);
    expect(fitsType("boolean", "oui")).toBe(true);
    expect(fitsType("boolean", "maybe")).toBe(false);
    expect(fitsType("date", "31/02/2026")).toBe(false);
    expect(fitsType("date", "29/02/2028")).toBe(true);
    expect(fitsType("date", "46000")).toBe(true); // an Excel day number
  });
});

describe("a paste as a sheet, and its mapping", () => {
  const f = (id: number, name: string, fieldType = "text") => ({ id, name, fieldType }) as unknown as FieldDefinition;
  const rows = [["Nom", "Ville", "Note"], ["Ahmad", "Kabul", ""], ["Bilal", "Herat", ""], ["Zahir", "Kabul", ""]];
  const sheet = sheetFromGrid(rows, { csv: "x", filename: "paste.csv", tableColumnNames: ["Name"], columnName: (n) => `Column ${n}` });

  it("takes a header line as names, counts the data rows, keeps 5 sample rows", () => {
    expect(sheet.headers).toEqual(["Nom", "Ville", "Note"]);
    expect(sheet.rowCount).toBe(3);
    expect(sheet.sample[0]).toEqual(["Ahmad", "Kabul", ""]);
  });

  it("a paste with no header names its columns and imports them", () => {
    const bare = sheetFromGrid([["Ahmad", "12"], ["Bilal", "14"]], { csv: "x", filename: "paste.csv", tableColumnNames: [], columnName: (n) => `Column ${n}` });
    expect(bare.headers).toEqual(["Column 1", "Column 2"]);
    expect(bare.unnamed).toEqual([false, false]);
    expect(bare.rowCount).toBe(2);
  });

  it("a header that names a table column goes there; a new one gets the guessed type; an empty one is skipped; a viewer of the schema adds none", () => {
    const fields = [f(1, "nom"), f(3, "Office", "multi_record")];
    expect(defaultTarget(sheet, 0, fields, true)).toBe("field:1");
    expect(defaultTarget(sheet, 1, fields, true)).toBe("new:text");
    expect(defaultTarget(sheet, 2, fields, true)).toBe("skip");
    expect(defaultTarget(sheet, 1, fields, false)).toBe("skip");
  });

  it("sends imports#create its columns in the server's names, a new select with its options", () => {
    const s = { ...sheet, guesses: sheet.guesses.map((g, i) => (i === 1 ? { ...g, options: ["Kabul", "Herat"] } : g)) };
    expect(importColumns(s, ["field:1", "new:single_select", "skip"])).toEqual([{ field_id: 1 }, { new_field_name: "Ville", new_field_type: "single_select", options: ["Kabul", "Herat"] }, {}]);
  });
});
