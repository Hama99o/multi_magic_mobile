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
 * That decision used to be ONE REGEX against the URL. Since 2026-11-12 (the
 * owner: photos named "IMG_2041", with no extension, were never shown) it is
 * the file's TYPE: the server's Content-Type, or its first bytes when that
 * says nothing (`probeRemoteType`). A URL's extension decides nothing either
 * way: "…/IMG_2041?sig=…" is a photo, and "…/roof.jpg" holding a PDF is not.
 * Audio and video now play inline too.
 */
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Linking } from "react-native";

const mockProbe = jest.fn();
jest.mock("@/lib/probeMimeType", () => ({ probeRemoteType: (url: string) => mockProbe(url) }));
jest.mock("expo-video", () => ({ useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn() }), VideoView: () => null }));

/* eslint-disable import/first */
import { FilePreview } from "../FilePreview";

const SIGNED = "https://mm.test/rails/active_storage/blobs/abc/payslip.pdf?expires=1&sig=xyz";
const NAMELESS = "https://mm.test/rails/active_storage/blobs/abc/IMG_2041?expires=1&sig=xyz";

beforeEach(() => mockProbe.mockReset().mockResolvedValue("application/pdf"));
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
    expect(mockProbe).not.toHaveBeenCalled();
  });

  it("names the file and says where it came from", () => {
    render(<FilePreview link={{ label: "payslip.pdf", url: SIGNED }} onClose={jest.fn()} />);
    expect(screen.getByText("From your files")).toBeTruthy();
    expect(screen.getByText("payslip.pdf")).toBeTruthy();
  });

  it("hands a document to the device rather than pretending to render it", async () => {
    render(<FilePreview link={{ label: "payslip.pdf", url: SIGNED }} onClose={jest.fn()} />);
    expect(await screen.findByText(/opens outside MultiMagic/)).toBeTruthy();
    expect(screen.queryByTestId("file-preview-image")).toBeNull();
    expect(screen.getByTestId("file-preview-open")).toHaveAccessibleName("Open file");
  });

  it("asks what the file is from the URL it was given", () => {
    render(<FilePreview link={{ label: "payslip.pdf", url: SIGNED }} onClose={jest.fn()} />);
    expect(mockProbe).toHaveBeenCalledWith(SIGNED);
  });

  it("shows an image INLINE, and offers it full size instead", async () => {
    mockProbe.mockResolvedValue("image/jpeg");
    render(<FilePreview link={{ label: "roof.jpg", url: "https://mm.test/roof.jpg" }} onClose={jest.fn()} />);
    expect(await screen.findByTestId("file-preview-image")).toBeTruthy();
    expect(screen.queryByText(/opens outside MultiMagic/)).toBeNull();
    expect(screen.getByTestId("file-preview-open")).toHaveAccessibleName("Open full size");
  });

  it("knows a photo whose name has NO extension, from its type", async () => {
    // The owner's case, 2026-11-12: "IMG_2041", stored without ".jpg".
    mockProbe.mockResolvedValue("image/jpeg");
    render(<FilePreview link={{ label: "IMG_2041", url: NAMELESS }} onClose={jest.fn()} />);
    expect(await screen.findByTestId("file-preview-image")).toBeTruthy();
  });

  it("is not fooled by a photo's extension on something that is not a photo", async () => {
    mockProbe.mockResolvedValue("application/pdf");
    render(<FilePreview link={{ label: "roof.jpg", url: "https://mm.test/roof.jpg" }} onClose={jest.fn()} />);
    expect(await screen.findByText(/opens outside MultiMagic/)).toBeTruthy();
    expect(screen.queryByTestId("file-preview-image")).toBeNull();
  });

  it("plays a voice note inline", async () => {
    mockProbe.mockResolvedValue("audio/ogg");
    render(<FilePreview link={{ label: "1000017023", url: NAMELESS }} onClose={jest.fn()} />);
    expect(await screen.findByTestId("file-preview-audio")).toBeTruthy();
    expect(screen.queryByText(/opens outside MultiMagic/)).toBeNull();
  });

  it("plays a video inline", async () => {
    mockProbe.mockResolvedValue("video/mp4");
    render(<FilePreview link={{ label: "1000017023", url: NAMELESS }} onClose={jest.fn()} />);
    expect(await screen.findByTestId("file-preview-video")).toBeTruthy();
  });

  it("a type it cannot learn (offline) is offered to the device, not left spinning", async () => {
    mockProbe.mockRejectedValue(new Error("offline"));
    render(<FilePreview link={{ label: "IMG_2041", url: NAMELESS }} onClose={jest.fn()} />);
    expect(await screen.findByText(/opens outside MultiMagic/)).toBeTruthy();
  });

  it("gives the image the file's own name, not 'image'", async () => {
    mockProbe.mockResolvedValue("image/png");
    render(<FilePreview link={{ label: "roof.jpg", url: "https://mm.test/roof.jpg" }} onClose={jest.fn()} />);
    expect(await screen.findByTestId("file-preview-image")).toHaveAccessibleName("roof.jpg");
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
