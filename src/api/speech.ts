/**
 * The audio for one answer — `GET /api/v1/ai/messages/:id/speech`.
 *
 * ── THE CONTRACT, AS AGREED AND AS LANDED ─────────────────────────────────
 * Agreed with the backend session by message before either side committed
 * (`speech_controller.rb`'s header records the argument), and read again from
 * the landed controller rather than from memory:
 *
 *   200 { url, voice, mime_type, byte_size, duration_ms | null, cached }
 *   404 { error }   not this person's, or not an assistant message
 *   409 { error }   the message has no text (deleted, empty)
 *   413 { error }   over the 4,000-character cap — the count is in the sentence
 *   422 { error }   the provider refused, in its own words
 *   502 { error }   the provider could not be reached
 *   429 { error }   30 a minute; no Retry-After (Rails' rate_limit `with:`)
 *
 * `url` is a signed ActiveStorage URL — the same shape `FindFiles` hands out
 * for documents — so a native player can be given it directly. The text is
 * the STORED message's, never the client's: the web and the phone cannot read
 * different words.
 *
 * ── `mime_type` IS READ, NOT ASSUMED ──────────────────────────────────────
 * WAV today (`audio/x-wav` as ActiveStorage stores it; Gemini answers raw PCM
 * and there is no encoder in the image), MP3 the day ffmpeg lands. Both play
 * natively in expo-audio. The type travels through so nothing here has to
 * change on that day, and so a log can say which one a device was handed.
 */
import { http, isNetworkFailure, isRateLimited } from "./http";
import { bool, obj, optStr, str } from "./parse";

export interface SpeechPayload {
  url: string;
  /** The server-side voice name. Displayed nowhere; kept for a log line. */
  voice: string | null;
  mimeType: string;
  byteSize: number | null;
  /** Null unless the provider gives one — an honest absence, not a guess. */
  durationMs: number | null;
  /** True on a replay: no synthesis happened and no wait is warranted. */
  cached: boolean;
}

/**
 * Why the server's voice is not available for this answer, sorted by what the
 * listener should get next. The web player collapses the first three into one
 * fallback; the kind is kept here because the SENTENCE differs, and because a
 * 429 is a wait rather than a fallback.
 */
export type SpeechUnavailableKind =
  | "too_long"
  | "refused"
  | "unreachable"
  | "no_text"
  | "not_found"
  | "rate_limited";

export class SpeechUnavailable extends Error {
  readonly kind: SpeechUnavailableKind;
  constructor(kind: SpeechUnavailableKind, message: string) {
    super(message);
    this.name = "SpeechUnavailable";
    this.kind = kind;
  }
  /** The device voice can stand in for these; for the rest there is nothing to read. */
  get fallsBackToDevice(): boolean {
    return this.kind === "too_long" || this.kind === "refused" || this.kind === "unreachable";
  }
}

function parseSpeech(payload: unknown): SpeechPayload {
  const record = obj(payload, "speech");
  return {
    url: str(record.url, "speech.url"),
    voice: optStr(record.voice),
    mimeType: str(record.mime_type, "speech.mime_type"),
    byteSize: typeof record.byte_size === "number" ? record.byte_size : null,
    durationMs: typeof record.duration_ms === "number" ? record.duration_ms : null,
    cached: bool(record.cached, "speech.cached"),
  };
}

function unavailableFrom(error: unknown): SpeechUnavailable | null {
  if (isNetworkFailure(error)) {
    return new SpeechUnavailable("unreachable", "MultiMagic could not be reached.");
  }
  if (isRateLimited(error)) {
    return new SpeechUnavailable("rate_limited", "Too many read-alouds in a minute.");
  }
  const response = (error as { response?: { status?: number; data?: unknown } })?.response;
  const body = response?.data as { error?: unknown } | undefined;
  const sentence = typeof body?.error === "string" ? body.error : null;
  switch (response?.status) {
    case 413:
      return new SpeechUnavailable("too_long", sentence ?? "This answer is too long to read aloud.");
    case 422:
      return new SpeechUnavailable("refused", sentence ?? "The voice service refused this answer.");
    case 502:
      return new SpeechUnavailable("unreachable", sentence ?? "The voice service could not be reached.");
    case 409:
      return new SpeechUnavailable("no_text", sentence ?? "This message has no text to read.");
    case 404:
      return new SpeechUnavailable("not_found", sentence ?? "This answer cannot be read aloud.");
    default:
      return null;
  }
}

export const speechApi = {
  /**
   * The audio for one assistant message. The FIRST play of an answer waits on
   * synthesis (seconds); every later one is instant, because the server
   * caches by message id — `cached` says which this was.
   */
  forMessage: async (messageId: number): Promise<SpeechPayload> => {
    try {
      const res = await http.get(`/api/v1/ai/messages/${messageId}/speech`);
      return parseSpeech(res.data);
    } catch (error) {
      throw unavailableFrom(error) ?? error;
    }
  },
};

/** For the tests, which assert the sorting by status. */
export const __parse = { parseSpeech, unavailableFrom };
