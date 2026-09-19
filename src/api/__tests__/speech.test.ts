/**
 * The speech endpoint's answers, sorted by what the listener should get next.
 *
 * Against the landed controller (`speech_controller.rb`, `ai/speech.rb`), not
 * the proposal: every status below is one the server actually sends.
 */
import MockAdapter from "axios-mock-adapter";
import { SpeechUnavailable, speechApi } from "../speech";
import { __resetTokenCache, http, setToken } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { ApiShapeError } from "../parse";

let mock: MockAdapter;

const PAYLOAD = {
  url: "https://www.multimagics.com/rails/active_storage/blobs/redirect/abc/answer-12-charon.wav",
  voice: "Charon",
  mime_type: "audio/x-wav",
  byte_size: 720_044,
  duration_ms: null,
  cached: false,
};

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
  await setToken("Bearer t");
});

afterEach(() => mock.restore());

describe("a 200", () => {
  it("is parsed at the boundary, mime_type included and NOT assumed", async () => {
    mock.onGet("/api/v1/ai/messages/12/speech").reply(200, PAYLOAD);

    const speech = await speechApi.forMessage(12);

    expect(speech).toEqual({
      url: PAYLOAD.url,
      voice: "Charon",
      mimeType: "audio/x-wav",
      byteSize: 720_044,
      durationMs: null,
      cached: false,
    });
  });

  it("carries the session and the fingerprint like every other request", async () => {
    mock.onGet("/api/v1/ai/messages/12/speech").reply(200, PAYLOAD);

    await speechApi.forMessage(12);

    expect(mock.history.get[0].headers?.Authorization).toBe("Bearer t");
    expect(mock.history.get[0].headers?.["X-Device-Fingerprint"]).toBeTruthy();
  });

  it("refuses a payload without a url rather than handing the player nothing", async () => {
    mock.onGet("/api/v1/ai/messages/12/speech").reply(200, { ...PAYLOAD, url: undefined });

    await expect(speechApi.forMessage(12)).rejects.toBeInstanceOf(ApiShapeError);
  });
});

describe("when the server's voice is not available", () => {
  async function failure(status: number, body?: unknown): Promise<SpeechUnavailable> {
    mock.onGet("/api/v1/ai/messages/12/speech").reply(status, body);
    const error = await speechApi.forMessage(12).catch((e) => e);
    expect(error).toBeInstanceOf(SpeechUnavailable);
    return error as SpeechUnavailable;
  }

  // The three the device voice stands in for — the web player's fallback set.
  it("413 is too long, with the server's count, and falls back", async () => {
    const error = await failure(413, { error: "This answer is 4,812 characters; the limit is 4000." });

    expect(error.kind).toBe("too_long");
    expect(error.message).toMatch(/4,812/);
    expect(error.fallsBackToDevice).toBe(true);
  });

  it("422 is the provider refusing, in its own words, and falls back", async () => {
    const error = await failure(422, { error: "Voice 'Charon' is not available for this model." });

    expect(error.kind).toBe("refused");
    expect(error.message).toMatch(/Charon/);
    expect(error.fallsBackToDevice).toBe(true);
  });

  it("502 is the provider unreachable, and falls back", async () => {
    const error = await failure(502, { error: "The voice service could not be reached." });

    expect(error.kind).toBe("unreachable");
    expect(error.fallsBackToDevice).toBe(true);
  });

  it("no response at all is unreachable, and falls back", async () => {
    mock.onGet("/api/v1/ai/messages/12/speech").networkError();

    const error = (await speechApi.forMessage(12).catch((e) => e)) as SpeechUnavailable;

    expect(error).toBeInstanceOf(SpeechUnavailable);
    expect(error.kind).toBe("unreachable");
    expect(error.fallsBackToDevice).toBe(true);
  });

  // The three where there is nothing for a device voice to read INSTEAD.
  it("429 is a WAIT, not a fallback — the chat's own rule for this status", async () => {
    const error = await failure(429, { error: "Too many requests." });

    expect(error.kind).toBe("rate_limited");
    expect(error.fallsBackToDevice).toBe(false);
  });

  it("409 is a message with no text", async () => {
    const error = await failure(409, { error: "This message has no text to read." });

    expect(error.kind).toBe("no_text");
    expect(error.fallsBackToDevice).toBe(false);
  });

  it("404 is not this person's answer, or not an answer at all", async () => {
    const error = await failure(404, { error: "Message not found." });

    expect(error.kind).toBe("not_found");
    expect(error.fallsBackToDevice).toBe(false);
  });

  it("leaves anything else to the caller — a 500 is not a speech decision", async () => {
    mock.onGet("/api/v1/ai/messages/12/speech").reply(500, {});

    const error = await speechApi.forMessage(12).catch((e) => e);

    expect(error).not.toBeInstanceOf(SpeechUnavailable);
  });
});
