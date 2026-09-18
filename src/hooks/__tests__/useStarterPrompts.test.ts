/**
 * The suggestions are DERIVED. These assert the three rules that keep them
 * honest, and the third is the one that matters.
 */
import { buildPrompts } from "../useStarterPrompts";

const file = (filename: string, status = "ready") => ({ filename, status });

describe("deriving from what the user has", () => {
  it("names the FILE, because a concrete noun beats a category", () => {
    const [first] = buildPrompts([file("payslip-march.pdf")], []);

    // "What does payslip-march.pdf say?" — the noun is his, which is the whole
    // difference between a derived suggestion and an invented one.
    expect(first.text).toBe("What does payslip-march.pdf say?");
    expect(first.source).toBe("file");
  });

  it("ignores a file still being extracted", () => {
    // Asking about a document that is not ready yet produces "I could not find
    // anything" about a file visibly on screen.
    expect(buildPrompts([file("scan.pdf", "pending")], [])).toEqual([]);
  });

  it("suggests the calendar only when there is something on it", () => {
    expect(buildPrompts([], [])).toEqual([]);
    expect(buildPrompts([], [{ title: "Dentist" }])[0].text).toBe("When is Dentist?");
  });

  // Offering "When is Dentist?" AND "What is on my calendar this week?" off a
  // single event is two questions about one fact — padding wearing a
  // derivation's clothes.
  it("does not ask about the week when there is one event in it", () => {
    const prompts = buildPrompts([], [{ title: "Dentist" }]);

    expect(prompts.length).toBe(1);
    expect(prompts.some((p) => p.text.includes("this week"))).toBe(false);
  });

  it("asks about the week once there is a week's worth", () => {
    const prompts = buildPrompts([], [{ title: "A" }, { title: "B" }, { title: "C" }]);

    expect(prompts.some((p) => p.text.includes("this week"))).toBe(true);
  });
});

// ── THE RULE THAT KEEPS IT HONEST ───────────────────────────────────────────
describe("never inventing to reach three", () => {
  it("returns NONE when nothing can be derived", () => {
    // An empty composer under one plain line is honest. Three guesses are not —
    // and one naming an app he has never used misleads, because the answer will
    // be "I could not find anything" to a question the app suggested.
    expect(buildPrompts([], [])).toEqual([]);
  });

  it("returns TWO rather than padding to three", () => {
    const prompts = buildPrompts([file("a.pdf")], [{ title: "Dentist" }]);

    expect(prompts.length).toBe(2);
    expect(prompts.every((p) => p.source === "file" || p.source === "calendar")).toBe(true);
  });

  it("never returns more than three", () => {
    const prompts = buildPrompts(
      [file("a.pdf"), file("b.pdf"), file("c.pdf")],
      [{ title: "Dentist" }, { title: "Standup" }],
    );

    expect(prompts.length).toBeLessThanOrEqual(3);
  });

  // A suggestion that wraps to three lines on a 360 dp row is not a suggestion.
  it("drops one too long to read rather than truncating the question", () => {
    const long = "a-very-long-document-name-that-goes-on-and-on-forever-and-ever.pdf";
    const prompts = buildPrompts([file(long)], []);

    prompts.forEach((p) => expect(p.text.length).toBeLessThanOrEqual(64));
  });
});
