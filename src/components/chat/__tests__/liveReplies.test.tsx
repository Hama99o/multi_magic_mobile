/**
 * WHAT THE ASSISTANT SENDS SINCE TONIGHT'S BACKEND CHANGES, RENDERED
 * (2026-09-25).
 *
 * multi_magic changed what a reply carries: it cites only the records it used
 * (cdbd007, ffae489), states an absence before offering a near thing
 * (bcf1922), and reduces a link the model made up to its label (101b907).
 * `liveReplies.json` holds four replies CAPTURED from the local backend
 * running those commits, as the QA account, in English and French. The only
 * value replaced is the file link's signed blob token, which gets a fake of
 * the same shape.
 *
 * The claim: each renders as sentences. No markdown syntax survives, a real
 * file link is its label and opens the server's absolute URL, and nothing is
 * cut short. What it cannot see: whether it FITS at 360 dp in French. That
 * is a device's, and docs/design/chat/SPEC.md records the shot.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AnswerMarkdown } from "../AnswerMarkdown";
import replies from "./liveReplies.json";

/** Every string leaf of the rendered HOST tree, in order: what is on screen. */
function shown(): string {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === "string") return void out.push(node);
    if (Array.isArray(node)) return node.forEach(walk);
    walk((node as { children?: unknown }).children);
  };
  walk(screen.toJSON());
  return out.join("");
}

describe.each(Object.entries(replies))("the captured %s reply", (_name, body) => {
  it("renders as sentences: no markdown syntax survives", () => {
    render(<AnswerMarkdown content={body} onOpenLink={() => undefined} />);
    const text = shown();
    expect(text).not.toMatch(/\*\*|\]\(|\[[^\]]*\]|\(\/rails\//);
    expect(text.length).toBeGreaterThan(40);
  });
});

it("a real file link is its label, and opens the server's absolute URL", () => {
  const open = jest.fn();
  render(<AnswerMarkdown content={replies["en-lookup"]} onOpenLink={open} />);
  fireEvent.press(screen.getByText("qa-invoice.pdf"));
  expect(open).toHaveBeenCalledWith(
    expect.objectContaining({ label: "qa-invoice.pdf", url: expect.stringMatching(/^https?:\/\/[^/]+\/rails\/active_storage\/blobs\/redirect\//) }),
  );
});

it.each([
  ["en-absence", "Would you like to add your sister to your contacts?"],
  ["fr-absence", "Souhaitez-vous ajouter votre sœur à vos contacts ?"],
])("the %s answer arrives whole: absence first, then the offer", (name, offer) => {
  render(<AnswerMarkdown content={replies[name as keyof typeof replies]} />);
  const text = shown();
  expect(text).toContain(offer);
  // Absence FIRST (bcf1922): the not-found sentence comes before the offer.
  expect(text.search(/couldn't find|n'ai pas pu trouver/)).toBeLessThan(text.indexOf(offer));
});

it.each(["en-lookup", "fr-lookup"])("the captured %s reply is spoken as words, not as a URL", (name) => {
  // As the app renders an answer: with a speaker, whose name goes on the
  // first block that can carry it. A block holding a link gets NO label on
  // purpose, so TalkBack reads its children and the link stays reachable;
  // those children are what `shown()` checks above.
  render(<AnswerMarkdown content={replies[name as keyof typeof replies]} onOpenLink={() => undefined} speaker="MultiMagic" />);
  const labels = screen.UNSAFE_root
    .findAll((n: { props: Record<string, unknown> }) => typeof n.props.accessibilityLabel === "string")
    .map((n: { props: Record<string, unknown> }) => n.props.accessibilityLabel as string);
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) expect(label).not.toMatch(/\]\(|\/rails\/|\*\*/);
  expect(screen.getByText("qa-invoice.pdf").props.accessibilityRole).toBe("link");
});
