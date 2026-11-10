/**
 * WHAT "Copy answer" PUTS ON THE CLIPBOARD (`AnswerActions`).
 *
 * Seen 2026-11-10 on the emulator: copying "I found **Itinerary.pdf** in your
 * Pages…" pasted the markdown itself — the asterisks and
 * `[Itinerary.pdf](/rails/active_storage/blobs/redirect/…)`, a path that
 * means nothing outside the app. Pasted into a message to someone, that reads
 * as broken. The clipboard gets the text a person reads on the screen.
 */
import { markdownToPlainText } from "../plainText";

const answer =
  "I found **Itinerary.pdf** in your Pages. You can download it here: [Itinerary.pdf](/rails/active_storage/blobs/redirect/eyJ--66/Itinerary.pdf).";

it("the answer as it reads on the screen", () => {
  expect(markdownToPlainText(answer)).toBe("I found Itinerary.pdf in your Pages. You can download it here: Itinerary.pdf.");
});

it("a link to the web keeps its address, a link inside the app does not", () => {
  expect(markdownToPlainText("See [the docs](https://expo.dev/x) and [your note](/notes/12).")).toBe(
    "See the docs (https://expo.dev/x) and your note.",
  );
});

it("emphasis, code and headings lose their marks; lists and paragraphs keep their shape", () => {
  const md = "## Loans\n\n- **Ahmad**: 200 €\n- _Sara_: `50 €`\n\n1. first\n2. second";
  expect(markdownToPlainText(md)).toBe("Loans\n\n- Ahmad: 200 €\n- Sara: 50 €\n\n1. first\n2. second");
});

it("leaves plain text and a lone asterisk alone", () => {
  expect(markdownToPlainText("3 * 4 = 12, snake_case_name")).toBe("3 * 4 = 12, snake_case_name");
});
