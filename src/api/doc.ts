/**
 * DOC TOOLS — the phone's client for `/api/v1/doc_app/*`.
 *
 * The web does merge, pages, sign and convert in the browser with pdf-lib and
 * pdf.js; a phone has neither, so every tool here is one server call
 * (multi_magic `docs/doc_app/MOBILE_ENDPOINTS.md`, parity audit G1–G10).
 *
 * ── Every call is stateless and multipart ────────────────────────────────
 * The file is sent again with each call. `{uri,name,type}` in React Native's
 * FormData streams it from disk natively, so a 50 MB PDF is never held as a
 * JS string on the way UP. On the way DOWN a result is raw bytes
 * (`responseType: "arraybuffer"`) written straight into the cache
 * (`writeResult`), never base64 inside JSON (G9: `compress` with `raw=1`).
 *
 * ── Through `http`, not `fetch` ──────────────────────────────────────────
 * The shared axios instance carries the token, the fingerprint and the
 * language, and its 401 path ends a dead session the same way as every other
 * screen. Axios also gives the two things a slow tool needs: upload progress
 * (`onUploadProgress`) and a cancel (`signal`).
 *
 * ── One error shape, with a reason to branch on ──────────────────────────
 * `{ message, reason }` (`locked`, `damaged`, `empty`, `too_large`, …). With
 * `responseType: "arraybuffer"` the body of a refusal arrives as bytes too,
 * so `docError` decodes it before reading the reason.
 *
 * ── Page numbers are 0-based everywhere ──────────────────────────────────
 * As on the server. Screens show `index + 1`.
 */
import axios, { type AxiosProgressEvent, type AxiosResponse } from "axios";
import { Directory, File, Paths } from "expo-file-system";
import { absoluteUrl } from "./conversations";
import { http } from "./http";
import { arr, id, num, obj, optStr, readableRows, str } from "./parse";

/** The server's limits (`DocAppUploads::MAX_FILE_SIZE`, merge caps). */
export const DOC_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const DOC_MAX_MERGE_BYTES = 150 * 1024 * 1024;
export const DOC_MAX_MERGE_FILES = 30;
/** Past this many pages, "one file per page" is one zip rather than N calls. */
export const DOC_PER_PAGE_LIMIT = 20;

/** A slow tool: poppler has 20 s for one page plus 1–3 s per extra page. */
export const DOC_TOOL_TIMEOUT_MS = 180_000;
const TOOL_TIMEOUT_MS = DOC_TOOL_TIMEOUT_MS;

/** A file the phone holds: picked, photographed, or a previous result. */
export interface DocFile {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
}

/** A file a tool made, already written into the cache. */
export interface DocResult extends DocFile {
  mimeType: string;
  size: number;
}

export type DocReason =
  | "no_file"
  | "too_large"
  | "too_many_files"
  | "not_pdf"
  | "locked"
  | "damaged"
  | "empty"
  | "unreadable_image"
  | "no_signature"
  | "invalid"
  | "rate_limited"
  /** 503: the server's one-at-a-time lock waited too long (Hello, 2026-11-21). Retry is offered. */
  | "busy"
  /** Phone-side only: BMP, ICO, JPEG 2000, SVG, refused by the server on purpose. */
  | "unsupported_format"
  | "offline"
  | "cancelled"
  | "unknown";

const REASONS: readonly DocReason[] = [
  "no_file",
  "too_large",
  "too_many_files",
  "not_pdf",
  "locked",
  "damaged",
  "empty",
  "unreadable_image",
  "no_signature",
  "invalid",
];

export class DocError extends Error {
  constructor(
    readonly reason: DocReason,
    /** The server's own sentence (it names the file), when it sent one. */
    readonly serverMessage: string | null = null,
    /** Seconds the server asked us to wait (Retry-After), when it said a number. */
    readonly retryAfter: number | null = null,
  ) {
    super(serverMessage ?? reason);
    this.name = "DocError";
  }
}

export interface Progress {
  /** 0–1 while uploading; null when the size is unknown. */
  sent: number | null;
  /** The upload is done and the server is working. */
  working: boolean;
}

export interface CallOptions {
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
  /** Save the result under this name instead of the server's (one file per page). */
  as?: string;
}

/* ───────────────────────────── bytes and names ───────────────────────────── */

/** UTF-8 bytes → string, without TextDecoder (not every Hermes has it). */
export function utf8(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) cp = b;
    else if (b < 0xe0) cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    else if (b < 0xf0) cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    out += String.fromCodePoint(cp);
  }
  return out;
}

/** `attachment; filename="a.pdf"; filename*=UTF-8''%C3%A9.pdf` → the name. */
export function dispositionName(header: unknown): string | null {
  if (typeof header !== "string") return null;
  const star = header.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through to the plain name */
    }
  }
  const plain = header.match(/filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/);
  const name = (plain?.[1] ?? plain?.[2])?.trim();
  return name || null;
}

/** "Contract.final.pdf" → "Contract.final". */
export function baseName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** A name the cache (and Android's SAF) accepts. */
export function safeName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return cleaned || "document";
}

/** Each result in its own folder, so two "merged.pdf" never overwrite each other. */
function resultDir(): Directory {
  const dir = new Directory(Paths.cache, "doc", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Bytes from the server → a file in the cache. */
export function writeResult(bytes: Uint8Array, name: string, mimeType: string): DocResult {
  const file = new File(resultDir(), safeName(name));
  file.create({ overwrite: true });
  file.write(bytes);
  return { uri: file.uri, name: file.name, mimeType, size: bytes.length };
}

/* ───────────────────────────── the request ──────────────────────────────── */

type Field = string | DocFile | DocFile[];

function form(fields: Record<string, Field | undefined>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (typeof value === "string") data.append(key, value);
    else if (Array.isArray(value)) for (const f of value) data.append(key, part(f));
    else data.append(key, part(value));
  }
  return data;
}

// React Native's FormData takes {uri,name,type} rather than a Blob.
const part = (f: DocFile) =>
  ({ uri: f.uri, name: f.name, type: f.mimeType ?? "application/octet-stream" }) as unknown as Blob;

function progressHandler(opts: CallOptions | undefined) {
  if (!opts?.onProgress) return undefined;
  const report = opts.onProgress;
  return (e: AxiosProgressEvent) => {
    const sent = e.total ? Math.min(1, e.loaded / e.total) : null;
    report({ sent, working: sent === 1 });
  };
}

/** Any failure → a DocError with a reason a screen can say. */
export function docError(error: unknown): DocError {
  if (error instanceof DocError) return error;
  if (axios.isCancel(error) || (error as { name?: string })?.name === "CanceledError" || (error as { name?: string })?.name === "AbortError")
    return new DocError("cancelled");
  const response = (error as { response?: { status?: number; data?: unknown } })?.response;
  if (!response) return new DocError("offline");
  if (response.status === 429) return new DocError("rate_limited");
  if (response.status === 503) {
    // Any 503, the lock's {reason:"busy"} or a proxy's bare page: "busy, try again" is true of both.
    const raw = (response as { headers?: Record<string, unknown> }).headers?.["retry-after"];
    const seconds = typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : typeof raw === "number" ? raw : null;
    return new DocError("busy", null, seconds);
  }
  let body: unknown = response.data;
  if (body instanceof ArrayBuffer) body = utf8(new Uint8Array(body));
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  const record = (typeof body === "object" && body !== null ? body : {}) as { reason?: unknown; message?: unknown; error?: unknown };
  const message = typeof record.message === "string" ? record.message : typeof record.error === "string" ? record.error : null;
  const reason = REASONS.find((r) => r === record.reason) ?? (response.status === 413 ? "too_large" : "unknown");
  return new DocError(reason, message);
}

async function post<T>(path: string, data: FormData, opts: CallOptions | undefined, binary: boolean): Promise<AxiosResponse<T>> {
  // Our own clock as well as axios's: on qa_phone3 a connection the server
  // dropped mid-request (a killed worker) left the phone "working" for over
  // four minutes, past the 180 s timeout. Whatever the transport does, the
  // call ends here, said as "stopped answering" (reason `offline`).
  const guard = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    guard.abort();
  }, TOOL_TIMEOUT_MS);
  const relay = () => guard.abort();
  opts?.signal?.addEventListener("abort", relay);
  try {
    const res = await http.post<T>(`/api/v1/doc_app/${path}`, data, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: TOOL_TIMEOUT_MS,
      signal: guard.signal,
      onUploadProgress: progressHandler(opts),
      ...(binary ? { responseType: "arraybuffer" as const } : {}),
    });
    opts?.onProgress?.({ sent: 1, working: false });
    return res;
  } catch (error) {
    throw timedOut ? new DocError("offline") : docError(error);
  } finally {
    clearTimeout(timer);
    opts?.signal?.removeEventListener("abort", relay);
  }
}

async function postFile(path: string, data: FormData, fallbackName: string, opts?: CallOptions): Promise<{ result: DocResult; headers: Record<string, unknown> }> {
  const res = await post<ArrayBuffer>(path, data, opts, true);
  const headers = (res.headers ?? {}) as Record<string, unknown>;
  const mimeType = String(headers["content-type"] ?? "application/octet-stream").split(";")[0].trim();
  const name = opts?.as ?? dispositionName(headers["content-disposition"]) ?? fallbackName;
  return { result: writeResult(new Uint8Array(res.data), name, mimeType), headers };
}

const headerNum = (headers: Record<string, unknown>, key: string): number | null => {
  const n = Number(headers[key]);
  return Number.isFinite(n) && headers[key] !== undefined && headers[key] !== null ? n : null;
};

/* ───────────────────────────── shapes ───────────────────────────────────── */

export interface PdfInspection {
  pdf: boolean;
  pages: number;
  encrypted: boolean;
  reason: "locked" | "damaged" | "empty" | "not_pdf" | null;
  /** Page sizes as shown (a page turned 90° has width and height swapped). */
  sizes: { width: number; height: number; rotation: number }[];
}

export function parseInspection(raw: unknown): PdfInspection {
  const o = obj(raw, "inspect");
  const reason = optStr(o.reason);
  return {
    pdf: o.pdf === true,
    pages: typeof o.pages === "number" ? o.pages : 0,
    encrypted: o.encrypted === true,
    reason: reason === "locked" || reason === "damaged" || reason === "empty" || reason === "not_pdf" ? reason : null,
    sizes: Array.isArray(o.sizes)
      ? o.sizes.map((s) => {
          const r = obj(s, "size");
          return { width: num(r.width, "width"), height: num(r.height, "height"), rotation: typeof r.rotation === "number" ? r.rotation : 0 };
        })
      : [],
  };
}

export interface Thumb {
  index: number;
  width: number;
  height: number;
  /** A data: URI, ready for <Image>. */
  uri: string;
}

export interface Thumbnails {
  pageCount: number;
  truncated: boolean;
  pages: Thumb[];
}

export function parseThumbnails(raw: unknown): Thumbnails {
  const o = obj(raw, "thumbnails");
  return {
    pageCount: num(o.page_count, "page_count"),
    truncated: o.truncated === true,
    pages: arr(o.pages, "pages").map((p) => {
      const r = obj(p, "page");
      return { index: num(r.index, "index"), width: num(r.width, "width"), height: num(r.height, "height"), uri: `data:image/jpeg;base64,${str(r.data, "data")}` };
    }),
  };
}

export type SignatureKind = "draw" | "type";
export type Point = [number, number, number];
export interface Stroke {
  color: string;
  size: number;
  brush: "pen" | "pencil";
  points: Point[];
}

export interface Signature {
  id: number;
  name: string;
  kind: SignatureKind;
  strokes: Stroke[];
  width: number;
  height: number;
  bgColor: string;
  text: string | null;
  font: string | null;
  color: string | null;
  fontSize: number | null;
  active: boolean;
  imageUrl: string | null;
  updatedAt: string;
}

function parseStroke(raw: unknown): Stroke {
  const s = obj(raw, "stroke");
  return {
    color: typeof s.color === "string" ? s.color : "#0f172a",
    size: typeof s.size === "number" ? s.size : Number(s.size) || 3,
    brush: s.brush === "pencil" ? "pencil" : "pen",
    points: Array.isArray(s.points)
      ? s.points.filter((p): p is number[] => Array.isArray(p) && p.length >= 2).map((p) => [Number(p[0]), Number(p[1]), Number(p[2] ?? 0.5)] as Point)
      : [],
  };
}

export function parseSignature(raw: unknown): Signature {
  const s = obj(raw, "signature");
  return {
    id: id(s.id, "id"),
    name: str(s.name, "name"),
    kind: s.kind === "type" ? "type" : "draw",
    strokes: Array.isArray(s.strokes) ? s.strokes.map(parseStroke) : [],
    width: typeof s.width === "number" ? s.width : 0,
    height: typeof s.height === "number" ? s.height : 0,
    bgColor: optStr(s.bg_color) ?? "#ffffff",
    text: optStr(s.text),
    font: optStr(s.font),
    color: optStr(s.color),
    fontSize: typeof s.font_size === "number" ? s.font_size : null,
    active: s.active === true,
    // The server names its own host; "localhost" from a phone is the phone.
    imageUrl: absoluteUrl(optStr(s.image_url)),
    updatedAt: optStr(s.updated_at) ?? "",
  };
}

export interface SignatureInput {
  name: string;
  kind: SignatureKind;
  strokes?: Stroke[];
  width?: number;
  height?: number;
  bgColor: string;
  text?: string;
  font?: string;
  color?: string;
  fontSize?: number;
  active?: boolean;
}

function signatureBody(input: SignatureInput): Record<string, unknown> {
  // No data_url: the phone has no canvas, the server draws the PNG (G7).
  return {
    name: input.name,
    kind: input.kind,
    bg_color: input.bgColor,
    ...(input.kind === "draw"
      ? { strokes: input.strokes ?? [], width: Math.round(input.width ?? 0), height: Math.round(input.height ?? 0) }
      : { text: input.text ?? "", font: input.font ?? "", color: input.color ?? "#0f172a", font_size: input.fontSize ?? 72 }),
    ...(input.active === undefined ? {} : { active: input.active }),
  };
}

export interface Placement {
  page: number;
  /** Centre, 0–1 from the top-left of the page as shown. */
  x: number;
  y: number;
  /** Share of the page width; height follows the signature. */
  width: number;
  rotation: number;
}

export interface PageEntry {
  source: number;
  rotation?: number;
}

export type CompressMode = "basic" | "strong" | "custom";

export interface Compressed {
  result: DocResult;
  originalSize: number;
  compressedSize: number;
}

/* ───────────────────────────── the API ──────────────────────────────────── */

export const docApi = {
  inspect: async (file: DocFile, opts?: CallOptions): Promise<PdfInspection> => {
    const res = await post<unknown>("pdf/inspect", form({ file }), opts, false);
    return parseInspection(res.data);
  },

  thumbnails: async (file: DocFile, width = 200, opts?: CallOptions) => {
    const res = await post<unknown>("pdf/thumbnails", form({ file, width: String(width) }), opts, false);
    return parseThumbnails(res.data);
  },

  /** G1: PDFs and images, in order → one A4 PDF. One image alone is image → PDF. */
  merge: async (files: DocFile[], opts?: CallOptions): Promise<DocResult> =>
    (await postFile("pdf/merge", form({ "files[]": files }), "merged.pdf", opts)).result,

  /** G2: reorder, rotate, delete, extract — or split (a zip). */
  pages: async (file: DocFile, entries: PageEntry[], split = false, opts?: CallOptions): Promise<DocResult> =>
    (
      await postFile(
        "pdf/pages",
        form({ file, pages: JSON.stringify(entries.map((e) => ({ source: e.source, rotation: e.rotation ?? 0 }))), ...(split ? { split: "true" } : {}) }),
        `${baseName(file.name)}-${split ? "pages" : "edited"}.${split ? "zip" : "pdf"}`,
        opts,
      )
    ).result,

  /** G3: stamp a saved signature at ratio placements. */
  sign: async (file: DocFile, placements: Placement[], signatureId: number, output: "same" | "pdf" = "same", opts?: CallOptions): Promise<DocResult> =>
    (
      await postFile(
        "sign",
        form({ file, placements: JSON.stringify(placements), signature_id: String(signatureId), output }),
        `${baseName(file.name)}-signed${output === "pdf" ? ".pdf" : ""}`,
        opts,
      )
    ).result,

  /** Image → image (jpg/png/webp) or → A4 PDF (G4a); also decodes HEIC/AVIF/TIFF for display. */
  convertImage: async (file: DocFile, to: "pdf" | "jpg" | "png" | "webp" | "auto", opts?: CallOptions & { max?: number }): Promise<DocResult> =>
    (
      await postFile(
        "images/convert",
        form({ file, to, ...(opts?.max ? { max: String(opts.max) } : {}) }),
        `${baseName(file.name)}.${to === "auto" ? "jpg" : to}`,
        opts,
      )
    ).result,

  /** G4b: one page → a picture; every page → a zip. */
  pdfToImages: async (file: DocFile, to: "jpg" | "png", page?: number, opts?: CallOptions): Promise<{ result: DocResult; pageCount: number | null }> => {
    const { result, headers } = await postFile(
      "pdf/images",
      form({ file, to, ...(page === undefined ? {} : { page: String(page) }) }),
      page === undefined ? `${baseName(file.name)}_pages.zip` : `${baseName(file.name)}_page_${page + 1}.${to}`,
      opts,
    );
    return { result, pageCount: headerNum(headers, "x-page-count") };
  },

  /** G9: compress, bytes back with both sizes in headers. Never bigger than the original. */
  compress: async (file: DocFile, mode: CompressMode, targetMb?: number, opts?: CallOptions): Promise<Compressed> => {
    const { result, headers } = await postFile(
      "compress",
      form({ file, mode, raw: "1", ...(mode === "custom" && targetMb ? { target_mb: String(targetMb) } : {}) }),
      `${baseName(file.name)}_compressed`,
      opts,
    );
    return {
      result,
      originalSize: headerNum(headers, "x-original-size") ?? file.size ?? 0,
      compressedSize: headerNum(headers, "x-compressed-size") ?? result.size,
    };
  },

  /** Text editor: every run on a page (or every page). Shape read by `screens/doc/textRuns.ts`. */
  pdfText: async (file: DocFile, page?: number, opts?: CallOptions): Promise<unknown> =>
    (await post<unknown>("pdf/text", form({ file, ...(page === undefined ? {} : { page: String(page) }) }), opts, false)).data,

  /** A page drawn by poppler, as a PNG in the cache. */
  pdfPage: async (file: DocFile, page: number, width: number, opts?: CallOptions): Promise<DocResult> =>
    (await postFile("pdf/page", form({ file, page: String(page), width: String(Math.round(Math.min(2400, Math.max(320, width)))) }), `page-${page + 1}.png`, opts)).result,

  /** Text editor save: the PDF back, and what happened in `X-Edit-Report`. */
  pdfEdit: async (file: DocFile, edits: unknown[], opts?: CallOptions): Promise<{ result: DocResult; report: unknown }> => {
    const { result, headers } = await postFile("pdf/edit", form({ file, edits: JSON.stringify(edits) }), `${baseName(file.name)}-edited.pdf`, opts);
    let report: unknown = null;
    const raw = headers["x-edit-report"];
    if (typeof raw === "string") {
      try {
        report = JSON.parse(raw);
      } catch {
        report = null;
      }
    }
    return { result, report };
  },

  signatures: {
    /** Active first, then newest (the server's order). */
    /**
     * Every page of them: the server pages by 10 and the web reads only the
     * first, so an eleventh signature vanished there. Capped at 20 pages.
     */
    list: async (): Promise<{ rows: Signature[]; unreadable: number }> => {
      const rows: Signature[] = [];
      let unreadable = 0;
      for (let page = 1; page <= 20; page++) {
        const res = await http.get("/api/v1/doc_app/signatures", { params: { page } });
        const body = obj(res.data, "signatures");
        const read = readableRows(arr(body.signatures, "signatures"), parseSignature);
        rows.push(...read.rows);
        unreadable += read.unreadable;
        const pagy = (body.meta as { pagy?: { last?: unknown; pages?: unknown } } | undefined)?.pagy;
        const last = Number(pagy?.last ?? pagy?.pages ?? page);
        if (!Number.isFinite(last) || page >= last) break;
      }
      return { rows, unreadable };
    },
    create: async (input: SignatureInput): Promise<Signature> => {
      const res = await http.post("/api/v1/doc_app/signatures", signatureBody(input));
      return parseSignature(obj(res.data, "create").signature);
    },
    update: async (signatureId: number, input: SignatureInput): Promise<Signature> => {
      const res = await http.patch(`/api/v1/doc_app/signatures/${signatureId}`, signatureBody(input));
      return parseSignature(obj(res.data, "update").signature);
    },
    remove: async (signatureId: number): Promise<void> => {
      await http.delete(`/api/v1/doc_app/signatures/${signatureId}`);
    },
  },
};
