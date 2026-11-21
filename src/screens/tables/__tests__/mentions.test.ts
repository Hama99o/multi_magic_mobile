import { addMention, mentionQuery, mentionsIn } from "../mentions";

it("an @ being typed is a query until a space; picking writes @Name and a space", () => {
  expect(mentionQuery("Checked @Am")).toBe("Am");
  expect(mentionQuery("@")).toBe("");
  expect(mentionQuery("Checked @Amina done")).toBeNull();
  expect(mentionQuery("mail me@home")).toBeNull();
  expect(addMention("Checked @Am", "Amina Noori")).toBe("Checked @Amina Noori ");
});

it("only people still named in the text are mentioned", () => {
  const picked = [{ id: 7, name: "Amina" }, { id: 9, name: "Omar" }];
  expect(mentionsIn("Thanks @Amina", picked)).toEqual([7]);
  expect(mentionsIn("Thanks", picked)).toEqual([]);
});
