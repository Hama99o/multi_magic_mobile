/**
 * Doc Tools client (multi_magic `docs/doc_app/MOBILE_ENDPOINTS.md`): the
 * paths and fields each endpoint takes, bytes written to the cache under the
 * server's file name, and every refusal turned into a reason a screen can
 * say — including a refusal whose body arrives as BYTES, because a binary
 * call asks for an arraybuffer and gets one even for the JSON error.
 * Invented values only.
 */
import axios from "axios";
import MockAdapter from "axios-mock-adapter";

import { DOC_TOOL_TIMEOUT_MS, docApi, DocError, dispositionName, docError, safeName, utf8 } from "../doc";
import { http } from "../http";

const written: { uri: string; bytes: Uint8Array }[] = [];
jest.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
    }
    create() {}
  }
  class File {
    uri: string;
    name: string;
    constructor(dir: { uri: string } | string, name?: string) {
      this.uri = typeof dir === "string" ? dir : `${dir.uri}/${name}`;
      this.name = name ?? this.uri.split("/").pop() ?? "";
    }
    create() {}
    write(bytes: Uint8Array) {
      written.push({ uri: this.uri, bytes });
    }
  }
  return { Directory, File, Paths: { cache: "file:///cache" } };
});

const pdf = { uri: "file:///cache/Contract.pdf", name: "Contract.pdf", mimeType: "application/pdf", size: 1200 };
const photo = { uri: "file:///cache/IMG_1.heic", name: "IMG_1.heic", mimeType: "image/heic", size: 3000 };
const bytes = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0))).buffer;
const json = (o: unknown) => new Uint8Array([...JSON.stringify(o)].map((c) => c.charCodeAt(0))).buffer;
const reasonOf = (p: Promise<unknown>) => p.then(() => "resolved", (e: DocError) => e.reason);
const keysOf = (data: unknown) => [...(data as FormData).keys()];
const valueOf = (data: unknown, key: string) => (data as FormData).get(key);

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
  written.length = 0;
});
afterEach(() => mock.restore());

describe("binary tools", () => {
  it("merge sends files[] in order and writes merged.pdf under the server's name", async () => {
    mock.onPost("/api/v1/doc_app/pdf/merge").reply(200, bytes("%PDF-1.7"), { "content-type": "application/pdf", "content-disposition": 'attachment; filename="merged.pdf"' });
    const result = await docApi.merge([pdf, photo]);
    const req = mock.history.post[0];
    expect(req.responseType).toBe("arraybuffer");
    expect(keysOf(req.data)).toEqual(["files[]", "files[]"]);
    expect(result.name).toBe("merged.pdf");
    expect(result.mimeType).toBe("application/pdf");
    expect(result.size).toBe(8);
    expect(written[0].uri).toMatch(/^file:\/\/\/cache\/doc\/.+\/merged\.pdf$/);
  });

  it("pages sends the 0-based entries with rotation, and split=true for one file per page", async () => {
    mock.onPost("/api/v1/doc_app/pdf/pages").reply(200, bytes("PK"), { "content-type": "application/zip", "content-disposition": "attachment; filename=\"Contract-pages.zip\"" });
    const result = await docApi.pages(pdf, [{ source: 2, rotation: 90 }, { source: 0 }], true);
    const req = mock.history.post[0];
    expect(JSON.parse(String(valueOf(req.data, "pages")))).toEqual([{ source: 2, rotation: 90 }, { source: 0, rotation: 0 }]);
    expect(valueOf(req.data, "split")).toBe("true");
    expect(result.name).toBe("Contract-pages.zip");
  });

  it("sign sends placements as ratios, the signature id and the output", async () => {
    mock.onPost("/api/v1/doc_app/sign").reply(200, bytes("jpg"), { "content-type": "image/jpeg", "content-disposition": "attachment; filename=\"IMG_1-signed.jpg\"" });
    await docApi.sign(photo, [{ page: 0, x: 0.5, y: 0.8, width: 0.22, rotation: 15 }], 7, "pdf");
    const req = mock.history.post[0];
    expect(JSON.parse(String(valueOf(req.data, "placements")))).toEqual([{ page: 0, x: 0.5, y: 0.8, width: 0.22, rotation: 15 }]);
    expect(valueOf(req.data, "signature_id")).toBe("7");
    expect(valueOf(req.data, "output")).toBe("pdf");
  });

  it("compress asks for raw bytes and reads both sizes from the headers", async () => {
    mock.onPost("/api/v1/doc_app/compress").reply(200, bytes("small"), { "content-type": "application/pdf", "x-original-size": "1200", "x-compressed-size": "5", "content-disposition": "attachment; filename=\"Contract_compressed.pdf\"" });
    const out = await docApi.compress(pdf, "custom", 0.5);
    const req = mock.history.post[0];
    expect(valueOf(req.data, "raw")).toBe("1");
    expect(valueOf(req.data, "mode")).toBe("custom");
    expect(valueOf(req.data, "target_mb")).toBe("0.5");
    expect(out).toMatchObject({ originalSize: 1200, compressedSize: 5 });
    expect(out.result.name).toBe("Contract_compressed.pdf");
  });

  it("a mode other than custom sends no target", async () => {
    mock.onPost("/api/v1/doc_app/compress").reply(200, bytes("x"), { "content-type": "application/pdf" });
    await docApi.compress(pdf, "basic", 3);
    expect(keysOf(mock.history.post[0].data)).not.toContain("target_mb");
  });

  it("image → PDF is images/convert with to=pdf; PDF → pictures takes `to`, not `format`, and a 0-based page", async () => {
    mock.onPost("/api/v1/doc_app/images/convert").reply(200, bytes("%PDF"), { "content-type": "application/pdf" });
    mock.onPost("/api/v1/doc_app/pdf/images").reply(200, bytes("png"), { "content-type": "image/png", "x-page-count": "4" });
    const a = await docApi.convertImage(photo, "pdf");
    expect(valueOf(mock.history.post[0].data, "to")).toBe("pdf");
    expect(a.name).toBe("IMG_1.pdf"); // the fallback when no disposition: named after the original
    const b = await docApi.pdfToImages(pdf, "png", 2);
    expect(valueOf(mock.history.post[1].data, "to")).toBe("png");
    expect(valueOf(mock.history.post[1].data, "page")).toBe("2");
    expect(keysOf(mock.history.post[1].data)).not.toContain("format");
    expect(b.pageCount).toBe(4);
    expect(b.result.name).toBe("Contract_page_3.png");
  });
});

describe("refusals", () => {
  it("a JSON refusal that arrives as bytes is decoded and its reason kept", async () => {
    mock.onPost("/api/v1/doc_app/pdf/merge").reply(422, json({ message: "Contract.pdf needs a password to open.", reason: "locked" }));
    const error = await docApi.merge([pdf]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DocError);
    expect((error as DocError).reason).toBe("locked");
    expect((error as DocError).serverMessage).toBe("Contract.pdf needs a password to open.");
  });

  it("413 without a body is too_large; 429 is rate_limited; no answer is offline", async () => {
    mock.onPost("/api/v1/doc_app/pdf/merge").replyOnce(413).onPost("/api/v1/doc_app/pdf/merge").replyOnce(429).onPost("/api/v1/doc_app/pdf/merge").networkErrorOnce();
    expect(await reasonOf(docApi.merge([pdf]))).toBe("too_large");
    expect(await reasonOf(docApi.merge([pdf]))).toBe("rate_limited");
    expect(await reasonOf(docApi.merge([pdf]))).toBe("offline");
  });

  it("an aborted call is `cancelled`, never an error to show", async () => {
    const controller = new AbortController();
    mock.onPost("/api/v1/doc_app/pdf/merge").reply(() => new Promise(() => {}));
    const pending = reasonOf(docApi.merge([pdf], { signal: controller.signal }));
    controller.abort();
    expect(await pending).toBe("cancelled");
  });

  it("a call that never answers is given up after the tool timeout, by our own clock (measured: a dropped connection kept the phone busy 4+ minutes)", async () => {
    jest.useFakeTimers();
    try {
      // A server that never answers, behind a transport that honours the abort
      // signal as React Native's XHR adapter does (axios-mock-adapter does not
      // listen to it once a request is dispatched).
      mock.onPost("/api/v1/doc_app/compress").reply(
        (config) =>
          new Promise((_, reject) => {
            config.signal?.addEventListener?.("abort", () => reject(new axios.CanceledError("aborted")));
          }),
      );
      const pending = reasonOf(docApi.compress(pdf, "basic"));
      await jest.advanceTimersByTimeAsync(DOC_TOOL_TIMEOUT_MS + 10);
      expect(await pending).toBe("offline");
    } finally {
      jest.useRealTimers();
    }
  });

  it("503 is busy, with the server's Retry-After in seconds when it sends one (Hello, 2026-11-21: the global lock answers 503 {reason:'busy'})", () => {
    const e = docError({ response: { status: 503, data: { reason: "busy", message: "Another document is being processed." }, headers: { "retry-after": "7" } } });
    expect(e.reason).toBe("busy");
    expect(e.retryAfter).toBe(7);
    // A 503 from anything in front of the server (no body, no header) is still "busy, try again".
    const bare = docError({ response: { status: 503, data: "" } });
    expect(bare.reason).toBe("busy");
    expect(bare.retryAfter).toBeNull();
    // A Retry-After that is an HTTP date, or nonsense, is not a number of seconds.
    expect(docError({ response: { status: 503, data: {}, headers: { "retry-after": "soon" } } }).retryAfter).toBeNull();
  });

  it("an unknown reason stays unknown, with the server's sentence", () => {
    const e = docError({ response: { status: 422, data: { message: "pages: entry 4 is past the end", reason: "invalid" } } });
    expect(e.reason).toBe("invalid");
    expect(docError({ response: { status: 500, data: "<html>" } }).reason).toBe("unknown");
  });
});

describe("JSON tools", () => {
  it("inspect reads pages, sizes as shown and the reason", async () => {
    mock.onPost("/api/v1/doc_app/pdf/inspect").reply(200, { pdf: true, pages: 2, encrypted: false, reason: null, sizes: [{ width: 612, height: 792, rotation: 0 }, { width: 792, height: 612, rotation: 90 }] });
    const info = await docApi.inspect(pdf);
    expect(info).toEqual({ pdf: true, pages: 2, encrypted: false, reason: null, sizes: [{ width: 612, height: 792, rotation: 0 }, { width: 792, height: 612, rotation: 90 }] });
  });

  it("thumbnails become data URIs, one upload for every page", async () => {
    mock.onPost("/api/v1/doc_app/pdf/thumbnails").reply(200, { page_count: 1, truncated: false, pages: [{ index: 0, width: 200, height: 259, data: "AAAA" }] });
    const out = await docApi.thumbnails(pdf, 200);
    expect(valueOf(mock.history.post[0].data, "width")).toBe("200");
    expect(out.pages[0].uri).toBe("data:image/jpeg;base64,AAAA");
  });

  it("signatures: every page is read (the web reads only the first ten)", async () => {
    const sig = (id: number) => ({ id, name: `Signature ${id}`, kind: "draw", strokes: [], width: 300, height: 120, bg_color: "transparent", active: id === 1, image_url: `https://files.example.test/${id}.png`, updated_at: "2026-11-20T10:00:00Z" });
    mock.onGet("/api/v1/doc_app/signatures", { params: { page: 1 } }).reply(200, { signatures: Array.from({ length: 10 }, (_, i) => sig(i + 1)), meta: { pagy: { page: 1, last: 2 } } });
    mock.onGet("/api/v1/doc_app/signatures", { params: { page: 2 } }).reply(200, { signatures: [sig(11)], meta: { pagy: { page: 2, last: 2 } } });
    const { rows } = await docApi.signatures.list();
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(rows[0]).toMatchObject({ active: true, bgColor: "transparent", imageUrl: "https://files.example.test/1.png" });
  });

  it("a signature's picture on a loopback host is fetched from the host the app used (measured: the emulator showed a blank card)", async () => {
    mock.onGet("/api/v1/doc_app/signatures").reply(200, { signatures: [{ id: 3, name: "Signature 1", kind: "draw", strokes: [], image_url: "http://localhost:3020/rails/active_storage/blobs/proxy/abc/signature-1.png" }], meta: { pagy: { page: 1, last: 1 } } });
    const { rows } = await docApi.signatures.list();
    const base = (http.defaults.baseURL ?? "").replace(/\/$/, "");
    expect(rows[0].imageUrl).toBe(`${base}/rails/active_storage/blobs/proxy/abc/signature-1.png`);
  });

  it("a signature is saved without a PNG: the server draws it (G7)", async () => {
    mock.onPost("/api/v1/doc_app/signatures").reply(201, { signature: { id: 3, name: "Signature 1", kind: "type", text: "Ada", font: "'Caveat', cursive", color: "#0f172a", font_size: 72, bg_color: "transparent", active: false, image_url: null } });
    await docApi.signatures.create({ name: "Signature 1", kind: "type", text: "Ada", font: "'Caveat', cursive", bgColor: "transparent" });
    const body = JSON.parse(mock.history.post[0].data);
    expect(body).toEqual({ name: "Signature 1", kind: "type", bg_color: "transparent", text: "Ada", font: "'Caveat', cursive", color: "#0f172a", font_size: 72 });
    expect(body).not.toHaveProperty("data_url");
  });
});

describe("helpers", () => {
  it("reads both forms of Content-Disposition, the UTF-8 one first", () => {
    expect(dispositionName('attachment; filename="a.pdf"')).toBe("a.pdf");
    expect(dispositionName("attachment; filename=\"Cafe.pdf\"; filename*=UTF-8''Caf%C3%A9.pdf")).toBe("Café.pdf");
    expect(dispositionName(undefined)).toBeNull();
  });

  it("decodes UTF-8 without TextDecoder", () => {
    expect(utf8(new Uint8Array([0x43, 0x61, 0x66, 0xc3, 0xa9, 0x20, 0xe2, 0x82, 0xac]))).toBe("Café €");
  });

  it("keeps a name the file system takes", () => {
    expect(safeName("a/b:c?.pdf")).toBe("a_b_c_.pdf");
    expect(safeName("   ")).toBe("document");
  });
});
