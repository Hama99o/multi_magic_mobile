/**
 * The renderer, and above all the case it was built for: a file link inside an
 * answer has to become something a finger can open.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, Text as RNText } from "react-native";
import { AnswerMarkdown, absoluteUrl, isFileLink } from "../AnswerMarkdown";
import { FONTS } from "@/theme/fonts";

describe("a file the assistant found", () => {
  // `Ai::Actions::FindFiles` puts the download link in the ANSWER, precisely so
  // "a model that only repeats what it was told still hands the user something
  // clickable". Printed as text it is a filename in brackets and a path.
  it("renders as a tappable link, not as literal markdown", () => {
    const onOpenLink = jest.fn();
    render(
      <AnswerMarkdown
        content="Here it is: [payslip.pdf](/rails/active_storage/blobs/abc/payslip.pdf) — 240 KB"
        onOpenLink={onOpenLink}
      />,
    );

    expect(screen.queryByText(/\[payslip\.pdf\]/)).toBeNull();
    fireEvent.press(screen.getByText("payslip.pdf"));
    expect(onOpenLink).toHaveBeenCalledWith(
      expect.objectContaining({ label: "payslip.pdf" }),
    );
  });

  // The server returns a path, not a URL — deliberately, so it needs no host
  // configured. Correct for a browser on that origin, useless on a phone.
  it("joins a server-relative path to the API host", () => {
    expect(absoluteUrl("/rails/active_storage/x")).toMatch(/^http.*\/rails\/active_storage\/x$/);
    expect(absoluteUrl("https://example.test/a.pdf")).toBe("https://example.test/a.pdf");
  });

  it("knows a stored file from a page link", () => {
    expect(isFileLink("/rails/active_storage/blobs/abc/x.pdf")).toBe(true);
    expect(isFileLink("/notes/42")).toBe(false);
  });
});

describe("the subset it claims", () => {
  it("renders bold, italic and inline code without their syntax", () => {
    render(<AnswerMarkdown content="You owe **500 EUR** to *Ahmad* per `loans`" />);

    expect(screen.getByText("500 EUR")).toBeTruthy();
    expect(screen.getByText("Ahmad")).toBeTruthy();
    expect(screen.getByText("loans")).toBeTruthy();
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it("renders bullets and numbers as list rows", () => {
    render(<AnswerMarkdown content={"Groceries:\n- bread\n- milk\n\n1. first\n2. second"} />);

    expect(screen.getByText("bread")).toBeTruthy();
    expect(screen.getByText("second")).toBeTruthy();
    expect(screen.getAllByText("•").length).toBe(2);
  });

  // A paragraph break is CONTENT, not whitespace: two paragraphs merged into
  // one keeps every word and still renders as a wall of text.
  it("keeps paragraphs apart", () => {
    render(<AnswerMarkdown content={"First paragraph.\n\nSecond paragraph."} />);

    expect(screen.getByText("First paragraph.")).toBeTruthy();
    expect(screen.getByText("Second paragraph.")).toBeTruthy();
  });

  it("keeps a code block whole", () => {
    render(<AnswerMarkdown content={"Try:\n```\nbin/rails ai:reindex_all\n```"} />);

    expect(screen.getByText("bin/rails ai:reindex_all")).toBeTruthy();
  });

  // Ugly and honest beats silent: an unterminated fence must still show its
  // content rather than swallow it.
  it("shows the content of an unterminated code fence", () => {
    render(<AnswerMarkdown content={"Try:\n```\nbin/rails console"} />);

    expect(screen.getByText("bin/rails console")).toBeTruthy();
  });

  it("renders a plain answer unchanged", () => {
    render(<AnswerMarkdown content="You lent Ahmad 500 EUR in March." />);

    expect(screen.getByText("You lent Ahmad 500 EUR in March.")).toBeTruthy();
  });
});

describe("the code face", () => {
  // "monospace" is a font on Android and a warning on iOS — where it rendered
  // in San Francisco. Every node that names a family here must name the
  // platform's own.
  it("uses the platform's monospace for inline and fenced code", () => {
    render(<AnswerMarkdown content={"Run `rails db:migrate` then:\n```\nbin/rails s\n```"} />);

    const families = screen
      .UNSAFE_getAllByType(RNText)
      .map((node) => (StyleSheet.flatten(node.props.style) as { fontFamily?: string }).fontFamily)
      .filter((family): family is string => Boolean(family));

    // Two code nodes in the platform's monospace; the prose around them is the
    // answer serif. Nothing anywhere names a generic family.
    expect(families.filter((family) => family === FONTS.mono).length).toBeGreaterThanOrEqual(2);
    expect(new Set(families)).toEqual(new Set([FONTS.mono, FONTS.serif]));
    expect(families).not.toContain("monospace");
    expect(families).not.toContain("serif");
    expect(FONTS.mono).toBe("Menlo");
  });
});
