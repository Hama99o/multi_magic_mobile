/**
 * The type of a file the app only has a URL or a local path for, when no
 * `mime_type` came with it (or it came as octet-stream): see `mediaKind.ts`.
 *
 * Remote: one ranged GET of the first 4 KB. The server's own Content-Type is
 * used when it says something (since the server fix it is read from the
 * bytes at upload); otherwise the bytes are sniffed here. Never the URL's
 * extension: "…/IMG_2041?sig=…" says nothing, and "…/scan.pdf" may be a photo.
 */
import { File, FileMode } from "expo-file-system";
import { effectiveType, isUnknownType, sniffMimeType } from "./mediaKind";

export const PROBE_BYTES = 4096;

type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  headers: { get: (name: string) => string | null };
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

export async function probeRemoteType(url: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<string | null> {
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const response = await fetchImpl(url, { headers: { Range: `bytes=0-${PROBE_BYTES - 1}` }, signal: controller?.signal });
  if (!response.ok) return null;
  const declared = response.headers.get("content-type");
  if (!isUnknownType(declared)) {
    // The answer is in the header; a server that ignored Range must not send
    // the whole file for nothing.
    controller?.abort();
    return effectiveType(declared);
  }
  const head = new Uint8Array(await response.arrayBuffer()).subarray(0, PROBE_BYTES);
  return sniffMimeType(head);
}

/** The first bytes of a file already on the phone, sniffed. */
export function sniffLocalFile(uri: string): string | null {
  const handle = new File(uri).open(FileMode.ReadOnly);
  try {
    return sniffMimeType(handle.readBytes(PROBE_BYTES));
  } finally {
    handle.close();
  }
}
