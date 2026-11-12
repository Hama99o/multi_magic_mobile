/**
 * The A–Z list (SPEC §C.1): favourites first, then letters, then `#`;
 * sorted the way a person scans — accents and case ignored, first name then
 * last name.
 */
import { sectionsOf, sortKey, letterOf, initials } from "../sections";
import type { Contact } from "@/api/contacts";

function c(id: number, firstname: string, lastname = "", favorite = false): Contact {
  return {
    id, firstname, lastname, favorite, nickname: null, company: null, jobTitle: null, birthDate: null, age: null,
    photoUrl: null, phones: [], emails: [], addresses: [], website: null, notes: null, relations: [],
    documentsCount: 0, isSelf: false,
  };
}

describe("letterOf", () => {
  it.each([
    ["Ali", "A"],
    ["ali", "A"],
    ["Élodie", "E"],
    ["Øystein", "O"],
    ["Ömer", "O"],
    ["Çelik", "C"],
    ["علی", "#"],
    ["7-Eleven", "#"],
    ["", "#"],
  ])("%s → %s", (name, letter) => {
    expect(letterOf(name)).toBe(letter);
  });
});

describe("sortKey", () => {
  it("ignores accents and case, first name then last name", () => {
    const names = [c(1, "élodie"), c(2, "Eric"), c(3, "Ali", "Zed"), c(4, "ali", "Baba"), c(5, "Emma")];
    const sorted = [...names].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    expect(sorted.map((x) => x.id)).toEqual([4, 3, 1, 5, 2]);
  });

  it("files a contact with no name under its company", () => {
    const acme = { ...c(1, ""), company: "Acme" };
    expect(letterOf(sortKey(acme))).toBe("A");
  });
});

describe("sectionsOf", () => {
  const book = [c(1, "Zara"), c(2, "Ali", "", true), c(3, "Bilal"), c(4, "ali", "khan"), c(5, "علی"), c(6, "Émile", "", true)];

  it("puts favourites first, then each letter in order, then #", () => {
    const sections = sectionsOf(book);
    expect(sections.map((s) => s.key)).toEqual(["★", "A", "B", "E", "Z", "#"]);
    expect(sections[0].data.map((x) => x.id)).toEqual([2, 6]);
  });

  it("keeps a favourite under its letter too, so the index still finds it", () => {
    const sections = sectionsOf(book);
    expect(sections.find((s) => s.key === "A")?.data.map((x) => x.id)).toEqual([2, 4]);
  });

  it("has no favourites section when there are none, and nothing at all for an empty book", () => {
    expect(sectionsOf([c(1, "Ali")]).map((s) => s.key)).toEqual(["A"]);
    expect(sectionsOf([])).toEqual([]);
  });

  it("does not repeat a contact listed twice", () => {
    expect(sectionsOf([c(1, "Ali"), c(1, "Ali")])[0].data).toHaveLength(1);
  });
});

describe("initials", () => {
  it.each([
    [c(1, "Jamil", "Safi"), "JS"],
    [c(1, "jamil"), "J"],
    [c(1, "Élodie", "rené"), "ÉR"],
    [{ ...c(1, ""), company: "acme" }, "A"],
    [c(1, "علی", "رضا"), "عر"],
    [c(1, ""), "?"],
  ])("%o → %s", (contact, expected) => {
    expect(initials(contact)).toBe(expected);
  });
});
