/**
 * A file the app has only a URL for (a link from the assistant, a node whose
 * mime_type is missing or octet-stream): its type comes from the server's
 * Content-Type or, when that says nothing, from its first bytes. Never from
 * the URL's extension.
 */
jest.mock("expo-file-system", () => ({ File: jest.fn(), FileMode: { ReadOnly: "r" } }));

/* eslint-disable import/first */
import { PROBE_BYTES, probeRemoteType } from "../probeMimeType";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

function respond(contentType: string | null, body: Uint8Array = new Uint8Array(), ok = true) {
  return jest.fn(async (_url: string, _init?: { headers?: Record<string, string> }) => ({
    ok,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: jest.fn(async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)),
  }));
}

it("asks for the first bytes only", async () => {
  const fetchImpl = respond("image/jpeg");
  await probeRemoteType("https://mm.test/f/1", fetchImpl);
  expect(fetchImpl.mock.calls[0][1]?.headers).toEqual({ Range: `bytes=0-${PROBE_BYTES - 1}` });
});

it("trusts a Content-Type that says something, without reading the body", async () => {
  const fetchImpl = respond("video/quicktime; charset=binary");
  expect(await probeRemoteType("https://mm.test/f/IMG_2041", fetchImpl)).toBe("video/quicktime");
});

it("sniffs the bytes when the server says octet-stream", async () => {
  expect(await probeRemoteType("https://mm.test/f/1000017023", respond("application/octet-stream", JPEG))).toBe("image/jpeg");
});

it("sniffs the bytes when the server says nothing", async () => {
  expect(await probeRemoteType("https://mm.test/f/1000017023", respond(null, JPEG))).toBe("image/jpeg");
});

it("is not fooled by the URL's extension", async () => {
  expect(await probeRemoteType("https://mm.test/f/photo.jpg", respond("application/pdf"))).toBe("application/pdf");
});

it("null when the server refuses", async () => {
  expect(await probeRemoteType("https://mm.test/f/1", respond(null, JPEG, false))).toBeNull();
});
