/**
 * Local matching for apps and commands, the web's `components/search/rank.ts`
 * tiers, so a local row and a server record that match equally well sort
 * together (Search::Global uses the same numbers).
 */
import { CONTAINS, EXACT, PREFIX, SUBSEQUENCE, WORD_PREFIX, fold, score } from "../rank";

it("the tiers, best first", () => {
  expect(score("Notes", "notes")).toBe(EXACT);
  expect(score("Notes", "no")).toBe(PREFIX);
  expect(score("Payment cards", "car")).toBe(WORD_PREFIX);
  expect(score("Finance", "nan")).toBe(CONTAINS);
  expect(score("Payment cards", "pc")).toBe(WORD_PREFIX - 1);
  expect(score("Calendar", "cln")).toBe(SUBSEQUENCE);
  expect(score("Calendar", "zz")).toBeNull();
});

it("an alias matches, a tier below the same match on the title", () => {
  expect(score("Expenses", "fin", ["Finance"])).toBe(WORD_PREFIX - 2);
});

it("accents and case do not matter (fr: “tâches” typed as “taches”)", () => {
  expect(fold("Tâches")).toBe("taches");
  expect(score("Tâches", "taches")).toBe(EXACT);
  expect(score("Dépenses", "depen")).toBe(PREFIX);
});

it("an empty query matches everything at 0", () => {
  expect(score("Notes", "  ")).toBe(0);
});
