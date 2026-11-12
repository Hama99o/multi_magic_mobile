/**
 * WHAT A FILE IS, FROM ITS TYPE AND ITS BYTES — NEVER FROM ITS NAME.
 *
 * The owner, 2026-11-12: photos, videos and voice notes named "IMG_2041" or
 * "1000017023" (no extension) were not treated as media. No "Save to
 * Gallery", no photo viewer, no player; he renamed files by hand. Every media
 * decision in the app now goes through `mediaKind(mimeType)`, where the type
 * is the server's (`mime_type`, read from the bytes on upload since the
 * server fix) or, when that is missing or `application/octet-stream`, the
 * type `sniffMimeType` reads from the file's first bytes.
 *
 * Pure: no device, no network, so every rule here is a Jest test.
 */

export type MediaKind = "image" | "video" | "audio";

const BINARY = new Set(["application/octet-stream", "binary/octet-stream", "application/x-binary"]);

/** "image/jpeg; charset=…" → "image/jpeg"; null for nothing. */
export function baseType(mimeType: string | null | undefined): string | null {
  const type = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  return type.length > 0 ? type : null;
}

/** True when the type says nothing about the content: none, or octet-stream. */
export function isUnknownType(mimeType: string | null | undefined): boolean {
  const type = baseType(mimeType);
  return type === null || BINARY.has(type);
}

export function mediaKind(mimeType: string | null | undefined): MediaKind | null {
  const type = baseType(mimeType);
  if (!type) return null;
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return null;
}

/** The phone's photo library takes photos and videos (not audio). */
export function isGalleryMedia(mimeType: string | null | undefined): boolean {
  const kind = mediaKind(mimeType);
  return kind === "image" || kind === "video";
}

/** The known type when there is one, else the one the bytes say (if any). */
export function effectiveType(mimeType: string | null | undefined, head?: Uint8Array | null): string | null {
  if (!isUnknownType(mimeType)) return baseType(mimeType);
  return (head ? sniffMimeType(head) : null) ?? baseType(mimeType);
}

const ascii = (bytes: Uint8Array, from: number, length: number): string =>
  String.fromCharCode(...Array.from(bytes.subarray(from, from + length)));

const startsWith = (bytes: Uint8Array, signature: number[], at = 0): boolean =>
  bytes.length >= at + signature.length && signature.every((b, i) => bytes[at + i] === b);

/** ISO base media (MP4, MOV, M4A, HEIC, 3GP): the brand after "ftyp". */
function isoBrand(brand: string): string {
  const b = brand.trim().toLowerCase();
  if (["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(b)) return "image/heic";
  if (["mif1", "msf1", "heif"].includes(b)) return "image/heif";
  if (b === "avif" || b === "avis") return "image/avif";
  if (b === "qt") return "video/quicktime";
  if (b === "m4a" || b === "m4b" || b === "m4p") return "audio/mp4";
  if (b.startsWith("3gp") || b.startsWith("3g2")) return "video/3gpp";
  return "video/mp4";
}

/**
 * The type the first bytes of a file say, or null. 64 bytes are enough for
 * every signature here; give more if you have them.
 */
export function sniffMimeType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(bytes, 0, 4) === "GIF8") return "image/gif";
  if (startsWith(bytes, [0x42, 0x4d]) && bytes.length >= 14 && bytes[6] === 0 && bytes[7] === 0) return "image/bmp";
  if (ascii(bytes, 0, 4) === "RIFF") {
    const form = ascii(bytes, 8, 4);
    if (form === "WEBP") return "image/webp";
    if (form === "WAVE") return "audio/wav";
    if (form === "AVI ") return "video/x-msvideo";
  }
  if (ascii(bytes, 4, 4) === "ftyp") return isoBrand(ascii(bytes, 8, 4));
  if (ascii(bytes, 0, 4) === "OggS") {
    const codec = ascii(bytes, 28, 8);
    if (codec.includes("theora")) return "video/ogg";
    return codec.startsWith("OpusHead") ? "audio/opus" : "audio/ogg";
  }
  if (ascii(bytes, 0, 4) === "fLaC") return "audio/flac";
  if (ascii(bytes, 0, 5) === "#!AMR") return "audio/amr";
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return ascii(bytes, 0, 64).includes("webm") ? "video/webm" : "video/x-matroska";
  if (ascii(bytes, 0, 3) === "ID3") return "audio/mpeg";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return "audio/aac";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && ((bytes[1] >> 1) & 0x03) !== 0) return "audio/mpeg";
  if (ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "video/3gpp": "3gp",
  "video/x-msvideo": "avi",
  "video/ogg": "ogv",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
  "audio/amr": "amr",
  "application/pdf": "pdf",
};

/** Extensions that name the same kind, so "voice.opus" (audio/ogg) is left alone. */
const SAME_KIND_EXTENSIONS: Record<MediaKind, string[]> = {
  image: ["jpg", "jpeg", "jpe", "png", "gif", "webp", "heic", "heif", "avif", "bmp", "dng"],
  video: ["mp4", "m4v", "mov", "qt", "webm", "mkv", "3gp", "3g2", "avi", "ogv"],
  audio: ["mp3", "m4a", "aac", "ogg", "oga", "opus", "wav", "flac", "amr", "weba"],
};

export function extensionFor(mimeType: string | null | undefined): string | null {
  const type = baseType(mimeType);
  return type ? (EXTENSION[type] ?? null) : null;
}

/**
 * The name a file is saved under on the phone. Android's gallery and the
 * Files app decide what a file is from its extension, so a photo titled
 * "IMG_2041" is saved as "IMG_2041.jpg". A name whose extension already says
 * the same kind of thing is kept as it is ("clip.MOV" stays, even for
 * video/mp4); a wrong one gets the right one added ("scan.pdf" holding a JPEG
 * becomes "scan.pdf.jpg").
 */
export function withExtension(name: string, mimeType: string | null | undefined): string {
  const extension = extensionFor(mimeType);
  if (!extension) return name;
  const current = name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1]?.toLowerCase() ?? null;
  if (current === extension) return name;
  const kind = mediaKind(mimeType);
  if (current && kind && SAME_KIND_EXTENSIONS[kind].includes(current)) return name;
  return `${name}.${extension}`;
}
