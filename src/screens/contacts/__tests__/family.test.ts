/**
 * The words for a family tie (audit #25): the web's role table
 * (`familyRoles.ts`) and the server's labels (`ContactApp::Family::LABELS`,
 * `QUALIFIED`), translated, with the relative's gender.
 */
import i18n from "@/i18n";
import type { Relation } from "@/api/contacts";
import { ALL_ROLES, groupRelations, qualifiersFor, relationWord, roleFor, roleLabel } from "../family";

const t = i18n.t.bind(i18n);

function tie(over: Partial<Relation> & { gender?: Relation["relative"]["gender"] } = {}): Relation {
  const { gender = "unknown", ...rest } = over;
  return {
    id: 1, kind: "parent", qualifier: "biological", status: "current", label: "parent",
    relative: { id: 9, name: "Wali Safi", gender, age: null, deceased: false, isSelf: false },
    ...rest,
  };
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("relationWord", () => {
  // ContactCard.tsx:344 used to draw "parent" for a father.
  it("is gendered by the relative, never overwritten by the neutral kind", () => {
    expect(relationWord(t, tie({ gender: "male" }))).toBe("father");
    expect(relationWord(t, tie({ kind: "sibling", gender: "female" }))).toBe("sister");
    expect(relationWord(t, tie({ kind: "spouse", gender: "female" }))).toBe("wife");
    expect(relationWord(t, tie({ kind: "child", gender: "other" }))).toBe("child");
  });

  it("says step, half and adoptive as the server's QUALIFIED does", () => {
    expect(relationWord(t, tie({ qualifier: "step", gender: "female" }))).toBe("stepmother");
    expect(relationWord(t, tie({ kind: "sibling", qualifier: "half", gender: "male" }))).toBe("half-brother");
    expect(relationWord(t, tie({ kind: "child", qualifier: "adoptive", gender: "female" }))).toBe("adopted daughter");
  });

  it("says former for an ended tie", () => {
    expect(relationWord(t, tie({ kind: "spouse", status: "former", gender: "male" }))).toBe("former husband");
  });

  it("falls back to the server's own word for a tie it has no translation for", () => {
    expect(relationWord(t, tie({ qualifier: "in_law", label: "father-in-law", gender: "male" }))).toBe("father-in-law");
  });

  it("names the social ties by their kind", () => {
    expect(relationWord(t, tie({ kind: "colleague", gender: "male" }))).toBe("colleague");
  });

  it("speaks French", async () => {
    await i18n.changeLanguage("fr");
    expect(relationWord(t, tie({ gender: "female" }))).toBe("mère");
    expect(relationWord(t, tie({ kind: "sibling", qualifier: "half", gender: "female" }))).toBe("demi-sœur");
    expect(relationWord(t, tie({ kind: "spouse", status: "former", gender: "female" }))).toBe("ex-épouse");
  });
});

describe("roles", () => {
  it("are the web's ALL_ROLES, in its order", () => {
    expect(ALL_ROLES.map((r) => r.key)).toEqual([
      "father", "mother", "husband", "wife", "son", "daughter", "brother", "sister", "partner",
      "parent", "child", "sibling", "friend", "colleague", "neighbour",
    ]);
  });

  it("a stored tie reads as the role of its kind and the relative's gender", () => {
    expect(roleFor("parent", "female")?.key).toBe("mother");
    expect(roleFor("spouse", "unknown")?.key).toBe("partner");
    expect(roleFor("sibling", "other")?.key).toBe("sibling");
  });

  it("have a word each", () => {
    expect(ALL_ROLES.map((r) => roleLabel(t, r))).toEqual([
      "father", "mother", "husband", "wife", "son", "daughter", "brother", "sister", "spouse",
      "parent", "child", "brother or sister", "friend", "colleague", "neighbour",
    ]);
  });

  it("only parent, child and sibling ties take a qualifier; half only for a sibling", () => {
    expect(qualifiersFor("parent")).toEqual(["biological", "step", "adoptive"]);
    expect(qualifiersFor("sibling")).toEqual(["biological", "step", "half", "adoptive"]);
    expect(qualifiersFor("spouse")).toEqual([]);
    expect(qualifiersFor("friend")).toEqual([]);
  });
});

describe("groupRelations", () => {
  it("orders ties the way the web's FamilySection does: parents, spouse, siblings, children, then the rest", () => {
    const ties = [
      tie({ id: 1, kind: "friend" }), tie({ id: 2, kind: "child" }), tie({ id: 3, kind: "spouse" }),
      tie({ id: 4, kind: "parent" }), tie({ id: 5, kind: "sibling" }), tie({ id: 6, kind: "parent" }),
    ];
    expect(groupRelations(ties).map((r) => r.id)).toEqual([4, 6, 3, 5, 2, 1]);
  });
});
