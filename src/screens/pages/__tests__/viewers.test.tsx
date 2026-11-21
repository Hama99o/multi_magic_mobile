/**
 * The photo gallery (QA_DEEP #10) and the Android PDF view (QA_DEEP #11).
 * Jest has no touch screen, so the pinch itself is its arithmetic plus a
 * device check (QA_DEEP.md); what is driven here is which photo is shown,
 * what the header is told, and what the PDF page loads.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";
import type { ReactElement } from "react";
import type { PageNode } from "@/api/pages";

jest.mock("react-native-webview", () => ({ WebView: () => null }));
const mockPageImages = jest.fn();
jest.mock("@/api/pages", () => {
  const actual = jest.requireActual("@/api/pages");
  return {
    ...actual,
    downloadToCache: jest.fn(async () => "file:///cache/x.pdf"),
    pagesApi: { ...actual.pagesApi, pageImages: (...a: unknown[]) => mockPageImages(...a) },
  };
});

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
  durationSeconds: null,
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

const withClient = (ui: ReactElement) => render(<QueryClientProvider client={testQueryClient()}>{ui}</QueryClientProvider>);
const pdf = (over: Partial<PageNode> = {}): PageNode => ({ ...photo(9, "big.pdf"), mimeType: "application/pdf", ...over });

describe("PdfView (Android)", () => {
  beforeEach(() => mockPageImages.mockReset());

  // Offline on first open used to fail: pdf.js came from cdnjs. It is shipped
  // in the app now (src/vendor/pdfjs), the worker run on the page's own thread.
  it("loads pdf.js from the app, not from the network, and hands it the file", () => {
    const html = pdfDocument("JVBERi0=", "#fff");
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toContain("cdnjs");
    expect(html).toContain("pdfjsLib");
    expect(html).toContain("pdfjsWorker");
    expect(html).toContain('atob("JVBERi0=")');
    // The inlined library must not end its own <script> early.
    expect(html.match(/<\/script>/g)).toHaveLength(html.match(/<script>/g)!.length);
  });

  // Hermes keeps a string with any non-ASCII character as UTF-16: 43 such
  // characters doubled pdf.js's cost (+2.82 MB measured). SOURCE.md, step 2.
  it("the shipped pdf.js is pure ASCII, so the bundle stores it at 1 byte a character", () => {
    const { PDFJS_LIB, PDFJS_WORKER } = jest.requireActual("@/vendor/pdfjs/pdfjs") as { PDFJS_LIB: string; PDFJS_WORKER: string };
    expect(/[^\x00-\x7f]/.test(PDFJS_LIB)).toBe(false);
    expect(/[^\x00-\x7f]/.test(PDFJS_WORKER)).toBe(false);
    expect(PDFJS_LIB.length).toBeGreaterThan(300_000);
  });

  // Over the hand-off limit, the server draws the pages (page_images).
  it("a PDF too big to hand over is drawn from the server's page images", async () => {
    mockPageImages.mockResolvedValue({ pageCount: 2, pages: [
      { index: 0, url: "https://h/p0?token=a", width: 1200, height: 1600 },
      { index: 1, url: "https://h/p1?token=b", width: 1200, height: 800 },
    ] });
    withClient(<PdfView node={pdf({ fileSize: MAX_BYTES + 1 })} onShare={() => {}} sharing={false} />);
    expect(await screen.findByTestId("pages-pdf-image-0")).toBeTruthy();
    expect(screen.getByTestId("pages-pdf-image-1")).toBeTruthy();
    expect(mockPageImages).toHaveBeenCalledWith(9, 0, 10);
  });

  it("a page whose signed url expired (403) asks for the list again", async () => {
    mockPageImages.mockResolvedValue({ pageCount: 1, pages: [{ index: 0, url: "https://h/p0?token=a", width: 1200, height: 1600 }] });
    withClient(<PdfView node={pdf({ fileSize: MAX_BYTES + 1 })} onShare={() => {}} sharing={false} />);
    const page = await screen.findByTestId("pages-pdf-image-0");
    fireEvent(page, "error", { nativeEvent: { error: "403" } }); // a native event, as expo-image receives it (ExpoImage.tsx withDeprecatedNativeEvent)
    await waitFor(() => expect(mockPageImages).toHaveBeenCalledTimes(2));
  });

  it("when the server cannot draw it either (422), Share is offered, said on screen", async () => {
    mockPageImages.mockRejectedValue(Object.assign(new Error("422"), { response: { status: 422, data: { reason: "damaged" } } }));
    withClient(<PdfView node={pdf({ fileSize: MAX_BYTES + 1 })} onShare={() => {}} sharing={false} />);
    expect(await screen.findByTestId("pages-view-pdf-fallback")).toBeTruthy();
    expect(screen.getByTestId("pages-view-share-button")).toBeTruthy();
  });
});
