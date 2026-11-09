/**
 * The photo gallery (QA_DEEP #10) and the Android PDF view (QA_DEEP #11).
 * Jest has no touch screen, so the pinch itself is its arithmetic plus a
 * device check (QA_DEEP.md); what is driven here is which photo is shown,
 * what the header is told, and what the PDF page loads.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PageNode } from "@/api/pages";

jest.mock("react-native-webview", () => ({ WebView: () => null }));
jest.mock("@/api/pages", () => ({ ...jest.requireActual("@/api/pages"), downloadToCache: jest.fn(async () => "file:///cache/x.pdf") }));

/* eslint-disable import/first */
import { ImageGallery, clampScale, touchDistance } from "../ImageGallery";
import { MAX_BYTES, PdfView, pdfDocument } from "../PdfView";

const photo = (id: number, title: string): PageNode => ({
  id,
  title,
  spaceId: 315,
  parentId: 1,
  kind: "file",
  starred: false,
  childrenCount: 0,
  attachmentUrl: `http://x/${id}`,
  thumbnailUrl: null,
  mimeType: "image/jpeg",
  fileSize: 100_000,
  ownerName: null,
  updatedAt: "2026-11-07T10:00:00Z",
  createdAt: null,
  deletedAt: null,
  space: null,
  html: null,
  ancestors: [],
});

describe("pinch arithmetic", () => {
  it("distance between two fingers", () => {
    expect(touchDistance([{ pageX: 0, pageY: 0 }, { pageX: 3, pageY: 4 }])).toBe(5);
    expect(touchDistance([{ pageX: 1, pageY: 1 }])).toBe(0);
  });
  it("zoom stays between 1× and 4×", () => {
    expect(clampScale(0.3)).toBe(1);
    expect(clampScale(2.2)).toBe(2.2);
    expect(clampScale(9)).toBe(4);
  });
});

describe("ImageGallery", () => {
  const images = [photo(1, "a.jpg"), photo(2, "b.jpg"), photo(3, "c.jpg")];

  it("starts on the photo that was tapped and says where it is", () => {
    render(<ImageGallery images={images} startId={2} onShown={() => {}} />);
    fireEvent(screen.getByTestId("pages-gallery"), "layout", { nativeEvent: { layout: { width: 360, height: 600 } } });
    expect(screen.getByText("2 of 3")).toBeTruthy();
  });

  it("a swipe to the next photo tells the header which one is shown", () => {
    const onShown = jest.fn();
    render(<ImageGallery images={images} startId={1} onShown={onShown} />);
    fireEvent(screen.getByTestId("pages-gallery"), "layout", { nativeEvent: { layout: { width: 360, height: 600 } } });
    fireEvent(screen.getByTestId("pages-gallery-strip"), "momentumScrollEnd", { nativeEvent: { contentOffset: { x: 720, y: 0 } } });
    expect(onShown).toHaveBeenCalledWith(images[2]);
    expect(screen.getByText("3 of 3")).toBeTruthy();
  });

  it("one photo: no position badge", () => {
    render(<ImageGallery images={[images[0]]} startId={1} onShown={() => {}} />);
    fireEvent(screen.getByTestId("pages-gallery"), "layout", { nativeEvent: { layout: { width: 360, height: 600 } } });
    expect(screen.queryByTestId("pages-gallery-position")).toBeNull();
  });
});

describe("PdfView (Android)", () => {
  it("loads a pinned pdf.js and hands it the file", () => {
    const html = pdfDocument("JVBERi0=", "#fff");
    expect(html).toContain("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
    expect(html).toContain('atob("JVBERi0=")');
  });

  it("a PDF too big to hand over as text goes to Share, said on screen", () => {
    const big = { ...photo(9, "big.pdf"), mimeType: "application/pdf", fileSize: MAX_BYTES + 1 };
    render(<PdfView node={big} onShare={() => {}} sharing={false} />);
    expect(screen.getByTestId("pages-view-pdf-fallback")).toBeTruthy();
    expect(screen.getByTestId("pages-view-share-button")).toBeTruthy();
  });
});
