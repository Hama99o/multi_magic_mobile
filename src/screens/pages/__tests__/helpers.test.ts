/**
 * The small decisions Pages makes without a screen: which viewer, what a
 * shared path becomes, where the extension's link goes, how big is big.
 */
import i18n from "@/i18n";
import { modeFor, pageDocument } from "../viewerModes";
import { asFileUri } from "../ShareIntentBridge";
import { formatBytes } from "../parts";
import { friendlyName } from "../addFiles";
import { redirectSystemPath } from "../../../../app/+native-intent";

const node = (kind: "folder" | "page" | "file", mimeType: string | null, title = "x") => ({ kind, mimeType, title });

describe("modeFor — the web's NodeViewer, by type", () => {
  it.each([
    [node("page", null), "ios", "page"],
    [node("file", "image/heic"), "ios", "image"],
    [node("file", "video/quicktime"), "android", "media"],
    [node("file", "audio/mpeg"), "ios", "media"],
    [node("file", "text/markdown"), "ios", "markdown"],
    [node("file", "application/octet-stream", "notes.md"), "android", "markdown"],
    [node("file", "text/csv"), "android", "text"],
    [node("file", "application/zip"), "ios", "other"],
  ] as const)("%o on %s is %s", (n, os, mode) => {
    expect(modeFor(n, os)).toBe(mode);
  });

  // Android's WebView renders neither a PDF nor an Office file. Claiming it
  // could would put a blank white screen where the document should be. A PDF
  // there is drawn by pdf.js instead (`PdfView.tsx`, QA_DEEP #11); Office
  // still goes to the phone's own apps.
  it("shows a PDF inline on both: iOS natively, Android through pdf.js", () => {
    expect(modeFor(node("file", "application/pdf"), "ios")).toBe("document");
    expect(modeFor(node("file", "application/pdf"), "android")).toBe("pdf");
    expect(
      modeFor(node("file", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "android"),
    ).toBe("other");
  });
});

describe("pageDocument", () => {
  it("wraps the page's html with a phone viewport and the app's colours", () => {
    const doc = pageDocument("<p>hi</p>", { ground: "#111", ink: "#eee", inkMuted: "#999", accent: "#0aa", border: "#333" });
    expect(doc).toContain('name="viewport"');
    expect(doc).toContain("background:#111");
    expect(doc).toContain("<body><p>hi</p></body>");
  });
});

describe("asFileUri — the extension hands over paths, the uploader wants uris", () => {
  it("adds file:// to a bare path", () => expect(asFileUri("/var/mobile/a.mov")).toBe("file:///var/mobile/a.mov"));
  it("leaves a uri alone", () => {
    expect(asFileUri("file:///a.mov")).toBe("file:///a.mov");
    expect(asFileUri("content://media/1")).toBe("content://media/1");
  });
});

describe("redirectSystemPath — the share extension's link is not a route", () => {
  it("sends the extension's link to Save to Pages", () => {
    expect(redirectSystemPath({ path: "multimagic://dataUrl=multimagicShareKey#media", initial: true })).toBe("/pages/save");
  });
  it("leaves every other link where it was going", () => {
    expect(redirectSystemPath({ path: "/chat", initial: false })).toBe("/chat");
  });
});

describe("formatBytes", () => {
  // The phone counts in thousands (1 KB = 1000 bytes), and that is the number
  // he compares against. Measured 2026-11-07: Android's Files app showed
  // IMG_2041.jpg (107,247 bytes) as "107 kB" while Pages said "105 KB".
  // Apple's Files and Photos count the same way since iOS 10.
  const t = i18n.t.bind(i18n);
  afterAll(() => i18n.changeLanguage("en"));
  it("counts like the phone: in thousands", async () => {
    await i18n.changeLanguage("en");
    expect(formatBytes(70, t, "en")).toBe("70 B");
    expect(formatBytes(107_247, t, "en")).toBe("107 KB");
    expect(formatBytes(1_004, t, "en")).toBe("1 KB");
    expect(formatBytes(283_314_295, t, "en")).toBe("283 MB");
    expect(formatBytes(3_600_000, t, "en")).toBe("3.6 MB");
    expect(formatBytes(1_800_000_000, t, "en")).toBe("1.8 GB");
  });
  it("never says 1000 of a unit: that is the next unit", async () => {
    await i18n.changeLanguage("en");
    expect(formatBytes(999_999, t, "en")).toBe("1 MB");
    expect(formatBytes(999, t, "en")).toBe("999 B");
  });
  it("in French units and decimals", async () => {
    await i18n.changeLanguage("fr");
    expect(formatBytes(1_800_000_000, t, "fr")).toBe("1,8 Go");
  });
});

describe("friendlyName: Android's photo picker hides the real name", () => {
  // Measured 2026-11-07 on qa_phone: qa_offline_24.jpg came back from the
  // system photo picker as "1000017023.jpg", its media id (the picker keeps
  // names private). Such a name is replaced the way a camera names a file.
  const now = new Date(2026, 10, 7, 13, 12, 5);
  it("a media-id name becomes IMG_date_time, from the photo's own date when it has one", () => {
    expect(friendlyName("1000017023.jpg", "image/jpeg", "2026:11:06 19:30:00", now)).toBe("IMG_20261106_193000.jpg");
  });
  it("without a date, the time it was picked", () => {
    expect(friendlyName("1000017026.mp4", "video/mp4", null, now)).toBe("VID_20261107_131205.mp4");
  });
  it("a real name is kept as it is", () => {
    expect(friendlyName("IMG_0042.HEIC", "image/heic", null, now)).toBe("IMG_0042.HEIC");
    expect(friendlyName("2026 budget.pdf", "application/pdf", null, now)).toBe("2026 budget.pdf");
  });
  it("the camera's cache name (a UUID) is not a name either", () => {
    // Measured 2026-11-07: a camera photo arrived as "12cd5e03-9e01-425e-b4c0-0d6877773bfe.jpeg".
    expect(friendlyName("12cd5e03-9e01-425e-b4c0-0d6877773bfe.jpeg", "image/jpeg", null, now)).toBe("IMG_20261107_131205.jpeg");
  });
  it("no name at all: the extension comes from the type", () => {
    expect(friendlyName(null, "image/png", null, now)).toBe("IMG_20261107_131205.png");
  });
});
