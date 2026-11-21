/**
 * Pasting a table to import it (increment 7): Excel/Sheets (tabs), a CSV
 * text, a WhatsApp list, and the first line taken as names only when it
 * looks like names. Ported from the web's pasteImport.test.ts, case for case.
 */
import { looksLikeHeader, pastedGrid, toCsv } from "../importGrid";

describe("pastedGrid", () => {
  it("reads cells copied from Excel, quotes and line breaks included", () => {
    expect(pastedGrid('Nom\tNote\r\nAhmad\t"deux\nlignes"\r\nBilal\t12\r\n')).toEqual([
      ["Nom", "Note"],
      ["Ahmad", "deux\nlignes"],
      ["Bilal", "12"],
    ]);
  });

  it("reads a CSV text, with commas or semicolons, quotes and doubled quotes", () => {
    expect(pastedGrid('Nom,Ville\nAhmad,"Kabul, centre"\nBilal,Herat')).toEqual([
      ["Nom", "Ville"],
      ["Ahmad", "Kabul, centre"],
      ["Bilal", "Herat"],
    ]);
    expect(pastedGrid("Nom;Prix\nAhmad;1 250,5\nBilal;12")).toEqual([
      ["Nom", "Prix"],
      ["Ahmad", "1 250,5"],
      ["Bilal", "12"],
    ]);
    expect(pastedGrid('Nom,Note\nAhmad,"dit ""oui"""\nBilal,ok')).toEqual([
      ["Nom", "Note"],
      ["Ahmad", 'dit "oui"'],
      ["Bilal", "ok"],
    ]);
  });

  it("reads a WhatsApp list as one column, bullets dropped, blank lines skipped", () => {
    expect(pastedGrid("- Ahmad\n\n- Bilal\n- Zahir, Kabul")).toEqual([["Ahmad"], ["Bilal"], ["Zahir, Kabul"]]);
  });

  it("a number alone is not a bullet; a byte-order mark is dropped", () => {
    expect(pastedGrid("-5\n12")).toEqual([["-5"], ["12"]]);
    expect(pastedGrid("﻿Nom\tVille\nAhmad\tKabul")[0]).toEqual(["Nom", "Ville"]);
  });

  it("gives nothing for blank text", () => {
    expect(pastedGrid(" \n\t\n")).toEqual([]);
  });
});

describe("looksLikeHeader", () => {
  it("takes words as names, not data", () => {
    expect(looksLikeHeader([["Nom", "Ville"], ["Ahmad", "Kabul"]])).toBe(true);
    expect(looksLikeHeader([["Ahmad", "12"], ["Bilal", "14"]])).toBe(false);
    expect(looksLikeHeader([["Nom", ""], ["Ahmad", "Kabul"]])).toBe(false);
    expect(looksLikeHeader([["Nom", "nom"], ["Ahmad", "Kabul"]])).toBe(false);
    expect(looksLikeHeader([["Nom", "Ville"]])).toBe(false);
  });

  it("takes a single column's first line as a name only when the table has that column", () => {
    expect(looksLikeHeader([["Ahmad"], ["Bilal"]], ["Nom"])).toBe(false);
    expect(looksLikeHeader([["nom"], ["Bilal"]], ["Nom"])).toBe(true);
  });
});

describe("toCsv", () => {
  it("writes a CSV, quoting what needs it, and names columns when there is no header", () => {
    expect(toCsv([["Ahmad", "Kabul, centre"], ["Bilal"]], false, (n) => `Colonne ${n}`)).toBe('Colonne 1,Colonne 2\nAhmad,"Kabul, centre"\nBilal,\n');
  });

  it("keeps the first line when it holds the names", () => {
    expect(toCsv([["Nom", "Note"], ["Ahmad", 'dit "oui"']], true, (n) => `C${n}`)).toBe('Nom,Note\nAhmad,"dit ""oui"""\n');
  });

  // A quoted line break inside a CSV cell is the one thing this does not read back: the separator
  // count is taken line by line (the web's csvSeparator, same limit). Excel's tab paste keeps it.
  it("round-trips: what toCsv writes, pastedGrid reads back", () => {
    const rows = [["Nom", "Note"], ["Ahmad", 'dit "oui", puis non'], ["Bilal", "12"]];
    expect(pastedGrid(toCsv(rows, true, String))).toEqual(rows);
  });
});
