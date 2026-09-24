/**
 * THE FILE PREVIEW — a real screen no flow can ever reach.
 *
 * `qa/UNWALKED.md` §2, and e0's split put it here rather than on the device for
 * a reason worth stating: `05-upload` stops at the attach sheet because the
 * system file picker is outside the app and driving it is a separate and flaky
 * problem, so **no flow will ever open this preview.** That is not "unreachable
 * by the rig, therefore fine" — it is a real feature with a real screen whose
 * only possible home is a component test.
 *
 * ── WHAT THE SCREEN DECIDES ───────────────────────────────────────────────
 * `Ai::Actions::FindFiles` answers "the PDF of last month's payslip" with the
 * document and a link. On a phone that link has to become something openable,
 * and this component makes one decision: **an image opens inline, anything else
 * is handed to the device.** Expo Go carries no PDF viewer, so pretending to
 * render one would be a blank sheet with a spinner.
 *
 * That decision is made by ONE REGEX against the URL, and the URL is an Active
 * Storage signed path — which carries a query string. An extension test
 * anchored at `$` would call every signed image a document, and the preview
 * would silently degrade to "this opens outside MultiMagic" for exactly the
 * files it was built to show. That is the assertion this file exists for.
 */
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Linking } from "react-native";
import { FilePreview } from "../FilePreview";

const SIGNED = "https://mm.test/rails/active_storage/blobs/abc/payslip.pdf?expires=1&sig=xyz";

afterEach(() => jest.restoreAllMocks());

describe("a file the assistant handed back", () => {
  // A tap outside the sheet closes it — the same fix as the conversations
  // sheet, owner's report 2026-09-24.
  it("closes on a tap outside the sheet", () => {
    const onClose = jest.fn();
    render(<FilePreview link={{ label: "payslip.pdf", url: SIGNED }} onClose={onClose} />);
    fireEvent.press(screen.getByTestId("file-preview-scrim"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is not a screen at all until there is a link", () => {
    render(<FilePreview link={null} onClose={jest.fn()} />);
    expect(screen.queryByTestId("file-preview")).toBeNull();
  });

  it("names the file and says where it came from", () => {
    render(<FilePreview link={{ label: "payslip.pdf", url: SIGNED }} onClose={jest.fn()} />);
    expect(screen.getByText("From your files")).toBeTruthy();
    expect(screen.getByText("payslip.pdf")).toBeTruthy();
  });

  it("hands a document to the device rather than pretending to render it", () => {
    render(<FilePreview link={{ label: "payslip.pdf", url: SIGNED }} onClose={jest.fn()} />);
    expect(screen.queryByTestId("file-preview-image")).toBeNull();
    expect(screen.getByText(/opens outside MultiMagic/)).toBeTruthy();
    expect(screen.getByTestId("file-preview-open")).toHaveAccessibleName("Open file");
  });

  it("shows an image INLINE, and offers it full size instead", () => {
    render(
      <FilePreview link={{ label: "roof.jpg", url: "https://mm.test/roof.jpg" }} onClose={jest.fn()} />,
    );
    expect(screen.getByTestId("file-preview-image")).toBeTruthy();
    expect(screen.queryByText(/opens outside MultiMagic/)).toBeNull();
    expect(screen.getByTestId("file-preview-open")).toHaveAccessibleName("Open full size");
  });

  it("still knows an image when the signed URL carries a query string", () => {
    // The whole point. Active Storage signs its blob paths, so every real image
    // arrives as `…/roof.jpg?expires=…&sig=…`. Anchoring the extension test at
    // `$` would call every one of them a document.
    render(
      <FilePreview
        link={{ label: "roof.jpg", url: "https://mm.test/rails/active_storage/blobs/abc/roof.jpg?expires=1&sig=xyz" }}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId("file-preview-image")).toBeTruthy();
  });

  it("is not fooled by an extension in the MIDDLE of a name", () => {
    render(
      <FilePreview link={{ label: "scan", url: "https://mm.test/report.png.pdf" }} onClose={jest.fn()} />,
    );
    expect(screen.queryByTestId("file-preview-image")).toBeNull();
  });

  it("gives the image the file's own name, not 'image'", () => {
    render(
      <FilePreview link={{ label: "roof.jpg", url: "https://mm.test/roof.jpg" }} onClose={jest.fn()} />,
    );
    expect(screen.getByTestId("file-preview-image")).toHaveAccessibleName("roof.jpg");
  });

  it("opens the URL it was given, untouched", () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    render(<FilePreview link={{ label: "payslip.pdf", url: SIGNED }} onClose={jest.fn()} />);

    fireEvent.press(screen.getByTestId("file-preview-open"));

    // The signature is part of the path's permission to exist. Anything that
    // rewrites or strips it opens a browser that is not signed in.
    expect(open).toHaveBeenCalledWith(SIGNED);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("closes when asked", () => {
    const onClose = jest.fn();
    render(<FilePreview link={{ label: "payslip.pdf", url: SIGNED }} onClose={onClose} />);
    fireEvent.press(screen.getByTestId("file-preview-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
