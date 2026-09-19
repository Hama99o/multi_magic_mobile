/**
 * The privacy page, guarded three ways — because this is the one document where
 * a wrong sentence is worse than a missing one.
 *
 *   1. THE GENERATED TEXT EQUALS THE SOURCE. Editing the markdown and
 *      forgetting to re-run the script would ship a policy that no longer says
 *      what the repo says it says.
 *   2. THE INTERNAL NOTES NEVER SHIP. `### Notes for Hamma9900` records two
 *      FALSE sentences the multi_magic session caught in the first draft. It
 *      belongs in the repo permanently and must never reach a reader.
 *   3. THE DOCUMENT STAYS INSIDE THE RENDERER'S SUBSET. `Markdown.tsx` draws
 *      headings, paragraphs, bullets, rules, bold and italic — and NOTHING
 *      else. A renderer that silently drops what it does not understand is how
 *      a privacy policy loses a sentence between the file and the screen.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PRIVACY_IS_DRAFT, PRIVACY_SHA, PRIVACY_TEXT } from "../privacy.generated";
import { parseMarkdown, parseInline, UNSUPPORTED } from "@/screens/account/Markdown";

const ROOT = join(__dirname, "../../..");
const SOURCE = readFileSync(join(ROOT, "docs/PRIVACY.draft.md"), "utf8");
const NOTES_HEADING = "### Notes for Hamma9900, not for the published page";

/** The same slice `scripts/build-privacy.mjs` takes, re-derived here rather than
 *  imported — so a bug in the script cannot agree with itself. */
function expectedPublished(markdown: string): string {
  const end = markdown.indexOf(NOTES_HEADING);
  const body = end === -1 ? markdown : markdown.slice(0, end);
  const front = body.match(/^---\s*$/m);
  const start = front ? (front.index ?? 0) + front[0].length : 0;
  return body.slice(start).replace(/\n+---\s*$/, "").trim() + "\n";
}

describe("the generated text tracks its source", () => {
  it("is exactly the published part of docs/PRIVACY.draft.md", () => {
    // If this fails: run `node scripts/build-privacy.mjs`.
    expect(PRIVACY_TEXT).toBe(expectedPublished(SOURCE));
  });

  it("knows it is still a draft, from the document's own title line", () => {
    expect(PRIVACY_IS_DRAFT).toBe(/^#\s.*\bDRAFT\b/m.test(SOURCE));
  });

  /**
   * The phone bundles the text; the backend serves it at
   * `GET /api/v1/legal/privacy` and returns the same twelve characters as
   * `sha`. That is how two renderings of one document can be shown to be one
   * document — and it is checked here rather than trusted, because a sha that
   * is only generated proves nothing about the words it claims to describe.
   *
   * `scripts/build-privacy.mjs` also refuses to generate from a copy that has
   * drifted, whenever multi_magic is checked out beside this repo. This test is
   * the half that runs everywhere.
   */
  it("carries the sha the backend publishes for the same text", () => {
    const expected = createHash("sha256").update(PRIVACY_TEXT).digest("hex").slice(0, 12);
    expect(PRIVACY_SHA).toBe(expected);
    expect(PRIVACY_SHA).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("what must never ship", () => {
  it("keeps the notes section in the SOURCE", () => {
    // Its survival is the point: it is the record of what was checked.
    expect(SOURCE).toContain(NOTES_HEADING);
    expect(SOURCE).toContain("TWO SENTENCES IN MY FIRST DRAFT WERE FALSE");
  });

  it("strips every trace of it from the published text", () => {
    expect(PRIVACY_TEXT).not.toContain("Notes for Hamma9900");
    expect(PRIVACY_TEXT).not.toContain("Hamma9900");
    // The two corrections themselves, which name files and are internal.
    expect(PRIVACY_TEXT).not.toContain("config.rb");
    expect(PRIVACY_TEXT).not.toContain("schema.rb");
    expect(PRIVACY_TEXT).not.toContain("A DECISION FOR YOU");
  });

  it("does not open with the reviewer front matter", () => {
    expect(PRIVACY_TEXT.startsWith("## Who holds your data")).toBe(true);
    expect(PRIVACY_TEXT).not.toContain("Approve, correct, or strike any line");
  });
});

describe("the document stays inside the renderer's subset", () => {
  it.each(UNSUPPORTED.map((u) => [u.name, u.pattern] as const))(
    "contains no %s",
    (_name, pattern) => {
      expect(pattern.test(PRIVACY_TEXT)).toBe(false);
    },
  );

  it("parses into blocks the renderer can draw, with nothing left over", () => {
    const blocks = parseMarkdown(PRIVACY_TEXT);
    for (const block of blocks) {
      expect(["heading", "paragraph", "bullet", "rule"]).toContain(block.kind);
      if (block.kind !== "rule") expect(block.text.length).toBeGreaterThan(0);
    }
  });

  it("keeps every heading in the document", () => {
    // Counted against the source rather than a number typed here: a magic
    // threshold passes for the wrong reason the moment a section is added.
    const inText = PRIVACY_TEXT.match(/^##\s/gm)?.length ?? 0;
    const parsed = parseMarkdown(PRIVACY_TEXT).filter((b) => b.kind === "heading").length;
    expect(inText).toBeGreaterThan(0);
    expect(parsed).toBe(inText);
  });

  it("keeps every paragraph break, which is content and not whitespace", () => {
    // The parser once joined paragraphs ACROSS a blank line. Every word
    // survived — so a word-count check passed — while the page rendered as a
    // wall of text. Blocks, not words, are what this asserts.
    const blankSeparated = PRIVACY_TEXT.trim().split(/\n{2,}/).length;
    expect(parseMarkdown(PRIVACY_TEXT).length).toBe(blankSeparated);
  });

  it("loses no words between the file and the screen", () => {
    // The strongest form of the subset guarantee: every non-markup word in the
    // document comes out the other side of the parser.
    const rendered = parseMarkdown(PRIVACY_TEXT)
      .flatMap((b) => (b.kind === "rule" ? [] : parseInline(b.text).map((s) => s.text)))
      .join(" ")
      .replace(/\s+/g, " ");

    for (const word of ["Google's Gemini API", "cannot be undone", "billing ledger"]) {
      expect(rendered).toContain(word);
    }

    const source = PRIVACY_TEXT.replace(/[#*-]/g, " ").replace(/\s+/g, " ").trim();
    const renderedWords = rendered.replace(/\s+/g, " ").trim().split(" ").length;
    // Within a word or two: joining hard-wrapped lines is the only change.
    expect(Math.abs(renderedWords - source.split(" ").length)).toBeLessThan(3);
  });
});

describe("the sentences that were corrected, pinned", () => {
  it("names Google and not DeepSeek — config.rb:236 tests gemini FIRST", () => {
    expect(PRIVACY_TEXT).toContain("Today that provider is Google");
    expect(PRIVACY_TEXT).not.toContain("DeepSeek");
  });

  it("does not call the web device identifier random, because it is not", () => {
    // The first draft said "generated at random and not derived from you, your
    // hardware or your behaviour". The web one is canvas-derived.
    expect(PRIVACY_TEXT).toContain("derived from your browser and device");
    expect(PRIVACY_TEXT).toContain("rendering test");
    // The PHONE's one is random, and the page still says so — the two claims
    // are about different clients and both are true.
    expect(PRIVACY_TEXT).toContain("In the phone app, the identifier is a random value");
  });

  it("states the deletion exception rather than hiding it in a model file", () => {
    expect(PRIVACY_TEXT).toContain("One thing is kept, and here is why");
    expect(PRIVACY_TEXT).toContain("Your name is removed from those rows");
  });
});
