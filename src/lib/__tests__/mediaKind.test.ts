/**
 * WHAT A FILE IS comes from its type and its bytes, never from its name — the
 * owner, 2026-11-12: a photo titled "IMG_2041" or a voice note "1000017023"
 * was not treated as media and he renamed files by hand.
 *
 * The byte heads below are the first 40 bytes of real files made with ffmpeg
 * (the same files as the server's spec/fixtures/files/media), so each
 * signature rule is checked against what a real encoder writes, not against
 * what this file's author believes the format looks like.
 */
import {
  effectiveType,
  extensionFor,
  isGalleryMedia,
  isUnknownType,
  mediaKind,
  sniffMimeType,
  withExtension,
} from "../mediaKind";

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));

export const HEADS: Record<string, [string, string]> = {
  "clip.mov": ["video/quicktime", "00000014667479707174202000000200717420200000000877696465000003026d646174000002ae"],
  "clip.mp4": ["video/mp4", "000000206674797069736f6d0000020069736f6d69736f32617663316d7034310000000866726565"],
  "photo.heic": ["image/heic", "000000186674797068656963000000006d6966316865696300000000"],
  "photo.jpg": ["image/jpeg", "ffd8ffe000104a46494600010200000100010000fffe00104c61766336302e33312e31303200ffdb"],
  "photo.png": ["image/png", "89504e470d0a1a0a0000000d49484452000000100000001008020000009091683600000009704859"],
  "voice.m4a": ["audio/mp4", "0000001c667479704d344120000002004d34412069736f6d69736f32000000086672656500000816"],
  "voice.mp3": ["audio/mpeg", "49443304000000000023545353450000000f0000034c61766636302e31362e313030000000000000"],
  "voice.ogg": ["audio/ogg", "4f676753000200000000000000009e9a2702000000008d373130011e01766f726269730000000001"],
  "voice.opus": ["audio/opus", "4f676753000200000000000000004857a57d00000000ed0dbe0d01134f7075734865616401013801"],
  "voice.wav": ["audio/wav", "524946468601000057415645666d74201000000001000100401f0000803e0000020010004c495354"],
};

describe("sniffMimeType: the type the first bytes say", () => {
  it.each(Object.entries(HEADS))("%s → its real type", (_name, [type, head]) => {
    expect(sniffMimeType(hex(head))).toBe(type);
  });

  it("an MP3 with no ID3 tag (a bare frame) is audio/mpeg", () => {
    expect(sniffMimeType(hex("fffb9064000000000000"))).toBe("audio/mpeg");
  });

  it("an ADTS AAC stream is audio/aac, not mistaken for an MP3", () => {
    expect(sniffMimeType(hex("fff15080000000000000"))).toBe("audio/aac");
  });

  it("GIF, WebP, WebM and PDF", () => {
    expect(sniffMimeType(hex("474946383961"))).toBe("image/gif");
    expect(sniffMimeType(hex("524946460000000057454250"))).toBe("image/webp");
    expect(sniffMimeType(hex("1a45dfa3010000000000001f4282847765626d"))).toBe("video/webm");
    expect(sniffMimeType(hex("255044462d312e34"))).toBe("application/pdf");
  });

  it("says nothing for text, random bytes, or too few bytes", () => {
    expect(sniffMimeType(new TextEncoder().encode("hello world"))).toBeNull();
    expect(sniffMimeType(hex("000102030405060708"))).toBeNull();
    expect(sniffMimeType(new Uint8Array())).toBeNull();
    expect(sniffMimeType(hex("ff"))).toBeNull();
  });
});

describe("mediaKind: decided by the type alone", () => {
  it.each([
    ["image/jpeg", "image"],
    ["IMAGE/HEIC", "image"],
    ["video/quicktime", "video"],
    ["audio/ogg; codecs=opus", "audio"],
    ["audio/x-wav", "audio"],
    ["application/pdf", null],
    ["application/octet-stream", null],
    [null, null],
    ["", null],
  ])("%s → %s", (type, kind) => {
    expect(mediaKind(type)).toBe(kind);
  });

  it("the gallery takes photos and videos, not audio", () => {
    expect([isGalleryMedia("image/png"), isGalleryMedia("video/mp4"), isGalleryMedia("audio/mpeg")]).toEqual([true, true, false]);
  });
});

describe("effectiveType: the server's type, else the bytes'", () => {
  it("octet-stream or none: the bytes decide", () => {
    expect(effectiveType("application/octet-stream", hex(HEADS["photo.jpg"][1]))).toBe("image/jpeg");
    expect(effectiveType(null, hex(HEADS["voice.mp3"][1]))).toBe("audio/mpeg");
  });

  it("a real type is kept as it is", () => {
    expect(effectiveType("video/mp4", hex(HEADS["photo.jpg"][1]))).toBe("video/mp4");
  });

  it("nothing known stays unknown", () => {
    expect(isUnknownType(effectiveType("application/octet-stream", hex("00010203")))).toBe(true);
  });
});

describe("withExtension: the name a file is saved under on the phone", () => {
  it.each([
    ["IMG_2041", "image/jpeg", "IMG_2041.jpg"],
    ["1000017023", "video/mp4", "1000017023.mp4"],
    ["voice note", "audio/ogg", "voice note.ogg"],
    ["recording", "audio/x-wav", "recording.wav"],
    ["IMG_2041.jpg", "image/jpeg", "IMG_2041.jpg"],
    ["IMG_2041.JPEG", "image/jpeg", "IMG_2041.JPEG"],
    ["clip.MOV", "video/mp4", "clip.MOV"],
    ["voice.opus", "audio/ogg", "voice.opus"],
    ["scan.pdf", "image/jpeg", "scan.pdf.jpg"],
    ["Mr. Khan", "image/png", "Mr. Khan.png"],
    ["notes", "application/octet-stream", "notes"],
    ["notes", null, "notes"],
  ])("%s as %s → %s", (name, type, expected) => {
    expect(withExtension(name, type)).toBe(expected);
  });

  it("knows the common extensions", () => {
    expect(["image/heic", "video/quicktime", "audio/mp4", "audio/mpeg"].map(extensionFor)).toEqual(["heic", "mov", "m4a", "mp3"]);
  });
});
