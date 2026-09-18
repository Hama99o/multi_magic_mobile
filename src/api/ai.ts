/**
 * The assistant's API surface.
 *
 * ── THE CORRECTION THAT SHAPES THIS FILE ──────────────────────────────────
 * `GET /api/v1/ai/conversation` DOES NOT RETURN THE TRANSCRIPT. It returns
 * `{ id: <number> }` and nothing else — which session to open by default
 * (`ai_controller.rb:13-16`). `GET /api/v1/ai/sessions` does not return it
 * either: `AiSessionSerializer` carries `message_count` and `document_count`,
 * but no messages.
 *
 * The transcript lives at `GET /api/v1/conversations/:id/messages`, and that is
 * what the web re-reads on every socket reconnect (`AiChat.tsx:332` →
 * `messagesApi.latest`). Resyncing against `ai/conversation` instead would
 * "work" — one integer, no error, and an empty conversation after every tunnel.
 *
 * ── KEYS ARE snake_case, BOTH WAYS ────────────────────────────────────────
 * multi_magic's Rails side does no key transformation at all; its WEB client
 * camelizes responses and decamelizes requests inside its own axios layer
 * (`services/http.service.ts:18-51`). This app does NOT copy that. A blanket
 * key transform rewrites keys inside payload DATA as well as in envelopes, and
 * it hides exactly the shape drift `parse.ts` exists to catch. So requests send
 * `conversation_id` and `before_id`, responses are read as `has_more` and
 * `message_count`, and the mapping to camelCase happens once, here, explicitly.
 */
import { http } from "./http";
import { arr, bool, id, num, obj, optStr, str } from "./parse";

export type MessageRole = "user" | "assistant" | "system";

/**
 * A record the assistant drew on, or created. `MessageSerializer` resolves both
 * through `FrontendRoutes.present`, so `path` is a WEB route — this app has no
 * note or loan screen to open, which is why a chip's primary action is a
 * preview sheet and "open in MultiMagic" is secondary.
 */
export interface MessageLink {
  label: string | null;
  path: string | null;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

/**
 * ONE message — the assistant's and a person's are the same row.
 *
 * `Conversation` is a single model separated by an `is_ai` boolean, and both
 * kinds of thread are read from the same endpoint with the same serializer. So
 * this type is NOT narrowed to the fields the assistant happens to use: the
 * assistant reads a subset, and narrowing here would mean re-parsing the same
 * payload a second way the moment people chat arrives.
 */
export interface ChatMessage {
  id: number;
  conversationId: number;
  role: MessageRole;
  body: string | null;
  createdAt: string;
  deleted: boolean;
  /** Who wrote it. Null for the assistant, which has no user row. */
  userId: number | null;
  /**
   * WHICH SIDE THE BUBBLE SITS ON — answered by the server, not computed here.
   * `MessageSerializer` derives it from the requesting user, so the client
   * comparing ids would be a second implementation of a question already
   * answered, and the two would disagree the first time an id arrived as a
   * string.
   */
  sentByMe: boolean;
  editedAt: string | null;
  /** Everyone else has read it — what a double tick means. Null otherwise. */
  readAt: string | null;
  reactions: MessageReaction[];
  /** Records this reply CREATED. */
  links: MessageLink[];
  /**
   * Records this reply ANSWERED FROM — the receipt under the claim.
   *
   * Already on the wire (`message_serializer.rb:55`) and easy to never render.
   * This app's whole claim is that it answers from his own data; an answer with
   * no receipt under it is indistinguishable from any chat app he could install
   * instead. Empty array means no row at all — never an empty "Sources" heading.
   */
  sources: MessageLink[];
}

export interface AiSession {
  id: number;
  title: string;
  messageCount: number;
  documentCount: number;
  updatedAt: string;
  createdAt: string;
  instructions: string | null;
}

export interface AiDocument {
  id: number;
  filename: string;
  contentType: string | null;
  byteSize: number | null;
  status: "pending" | "ready" | "failed";
}

export interface MessagePage {
  /** Oldest first, ready to render. */
  messages: ChatMessage[];
  hasMore: boolean;
}

/** Server limits, mirrored so the app can refuse before the round trip. */
export const LIMITS = {
  /** `AiDocument::MAX_BYTES` */
  maxFileBytes: 10 * 1024 * 1024,
  /** `AiDocument::MAX_PER_CONVERSATION` */
  maxFilesPerSession: 20,
  /** `Ai::Sessions::MAX_PER_USER` */
  maxSessions: 50,
  /** `Ai::Sessions::TITLE_LIMIT` */
  titleLimit: 60,
} as const;

/**
 * What the upload endpoint ACCEPTS — `AiDocument::ALLOWED_EXTENSIONS`.
 *
 * NOT `Ai::FileExtractor`'s list, which is the permissive end: the extractor
 * also reads .docx, .xlsx and text/*, but `AiDocument#file_is_readable` rejects
 * them, so offering one produces a file that the picker accepted and the server
 * 422s. The two lists disagree on purpose and this is the one that is enforced.
 */
export const ALLOWED_UPLOAD_EXTENSIONS = [
  "pdf", "png", "jpg", "jpeg", "webp", "gif", "heic", "heif", "csv",
] as const;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/png", "image/jpeg", "image/jpg", "image/webp",
  "image/gif", "image/heic", "image/heif",
  "text/csv", "application/csv",
] as const;

function parseLink(payload: unknown): MessageLink {
  const record = obj(payload, "link");
  return { label: optStr(record.label), path: optStr(record.path) };
}

function parseReaction(payload: unknown): MessageReaction {
  const record = obj(payload, "reaction");
  return {
    emoji: str(record.emoji, "reaction.emoji"),
    count: num(record.count, "reaction.count"),
    mine: typeof record.mine === "boolean" ? record.mine : false,
  };
}

/**
 * Optional collections are tolerated as missing, not demanded.
 *
 * `links`, `sources` and `reactions` are empty for most messages and the
 * serializer may stop sending a key rather than send `[]`. Throwing on absence
 * would make an ordinary message a shape error; the strictness that earns its
 * keep is on ids, which is where drift actually breaks something.
 */
function optArr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseMessage(payload: unknown): ChatMessage {
  const record = obj(payload, "message");
  const role = str(record.role, "message.role");
  return {
    id: id(record.id, "message.id"),
    conversationId: id(record.conversation_id, "message.conversation_id"),
    role: (role === "assistant" || role === "system" ? role : "user") as MessageRole,
    // A deleted message keeps its place in the thread but not its words, so
    // `body` is legitimately null — not a shape error.
    body: optStr(record.body),
    createdAt: str(record.created_at, "message.created_at"),
    deleted: typeof record.deleted === "boolean" ? record.deleted : false,
    userId: typeof record.user_id === "number" ? record.user_id : null,
    sentByMe: typeof record.sent_by_me === "boolean" ? record.sent_by_me : false,
    editedAt: optStr(record.edited_at),
    readAt: optStr(record.read_at),
    reactions: optArr(record.reactions).map(parseReaction),
    links: optArr(record.links).map(parseLink),
    sources: optArr(record.sources).map(parseLink),
  };
}

function parseSession(payload: unknown): AiSession {
  const record = obj(payload, "session");
  return {
    id: id(record.id, "session.id"),
    title: str(record.title, "session.title"),
    messageCount: num(record.message_count, "session.message_count"),
    documentCount: num(record.document_count, "session.document_count"),
    createdAt: str(record.created_at, "session.created_at"),
    updatedAt: str(record.updated_at, "session.updated_at"),
    instructions: optStr(record.instructions),
  };
}

function parseDocument(payload: unknown): AiDocument {
  const record = obj(payload, "document");
  const status = str(record.status, "document.status");
  return {
    id: id(record.id, "document.id"),
    filename: str(record.filename, "document.filename"),
    contentType: optStr(record.content_type),
    byteSize: typeof record.byte_size === "number" ? record.byte_size : null,
    status: (status === "ready" || status === "failed" ? status : "pending") as AiDocument["status"],
  };
}

export const aiApi = {
  /**
   * Which session to open at launch. One integer — see this file's header.
   * The server creates one if the user has none, so this never returns nothing.
   */
  currentSessionId: async (): Promise<number> => {
    const res = await http.get("/api/v1/ai/conversation");
    return id(obj(res.data, "conversation").id, "conversation.id");
  },

  /**
   * Post a question. Returns 202: the question is SAVED, and the answer arrives
   * later over MessageChannel. Nothing about the reply is in this response.
   *
   * `conversation_id` is required — `ai_controller.rb:41-45` renders 400
   * without it. So the app can never post before it has a session id, which is
   * why the boot sequence resolves one first.
   */
  ask: async (params: { conversationId: number; body: string }): Promise<{
    conversationId: number;
    userMessageId: number;
  }> => {
    const res = await http.post("/api/v1/ai/show", {
      conversation_id: params.conversationId,
      body: params.body,
    });
    const record = obj(res.data, "ask");
    return {
      conversationId: id(record.conversation_id, "ask.conversation_id"),
      userMessageId: id(record.user_message_id, "ask.user_message_id"),
    };
  },
};

export const messagesApi = {
  /**
   * One message, parsed at the boundary.
   *
   * Exposed because a SOCKET frame carries the same serializer's output as the
   * HTTP payload does, and parsing it the same way is the difference between a
   * bad shape being caught here and it reaching component state.
   */
  parseOne: parseMessage,

  /**
   * The newest page of the transcript, oldest-first and ready to render.
   *
   * This is the resync call. The server returns newest-first; reversing here
   * rather than in a screen means every caller gets render order and no screen
   * has to remember which way round it arrived.
   */
  latest: async (conversationId: number): Promise<MessagePage> => {
    const res = await http.get(`/api/v1/conversations/${conversationId}/messages`);
    const record = obj(res.data, "messages");
    const rows = arr(record.messages, "messages.messages").map(parseMessage);
    const meta = obj(record.meta, "messages.meta");
    const pagy = obj(meta.pagy, "messages.meta.pagy");
    return {
      messages: rows.reverse(),
      hasMore: num(pagy.pages, "messages.meta.pagy.pages") > 1,
    };
  },

  /**
   * The page just before `beforeId`. A CURSOR, not a page number.
   *
   * multi_magic's own controller comment explains why, and it applies here for
   * the same reason: a conversation grows while you read it, so every arriving
   * reply shifts a page boundary by one, and a page-2 fetch after a reply skips
   * whatever slid across it. That is precisely how messages went missing on
   * scroll-up in the web app. An id cannot shift.
   */
  before: async (conversationId: number, beforeId: number): Promise<MessagePage> => {
    const res = await http.get(`/api/v1/conversations/${conversationId}/messages`, {
      params: { before_id: beforeId },
    });
    const record = obj(res.data, "messages");
    const rows = arr(record.messages, "messages.messages").map(parseMessage);
    const meta = obj(record.meta, "messages.meta");
    return {
      messages: rows.reverse(),
      hasMore: bool(meta.has_more, "messages.meta.has_more"),
    };
  },
};

export const sessionsApi = {
  list: async (): Promise<AiSession[]> => {
    const res = await http.get("/api/v1/ai/sessions");
    return arr(obj(res.data, "sessions").sessions, "sessions.sessions").map(parseSession);
  },

  create: async (title?: string): Promise<AiSession> => {
    const res = await http.post("/api/v1/ai/sessions", { title });
    return parseSession(obj(res.data, "session").session);
  },

  rename: async (sessionId: number, title: string): Promise<AiSession> => {
    const res = await http.patch(`/api/v1/ai/sessions/${sessionId}`, { title });
    return parseSession(obj(res.data, "session").session);
  },

  /** Empties the transcript. The session and ITS FILES stay — the safe one. */
  clear: async (sessionId: number): Promise<AiSession> => {
    const res = await http.post(`/api/v1/ai/sessions/${sessionId}/clear`);
    return parseSession(obj(res.data, "session").session);
  },

  /**
   * Deletes the session, its transcript and its files.
   *
   * Returns the session to fall back to — the server never leaves the user with
   * nowhere to talk (`sessions_controller.rb:47`), so the caller does not have
   * to create one.
   *
   * What this CANNOT touch is app data. `Ai::Sessions.destroy` deletes
   * `AiChunk.where(conversation_id: ...)`, and a chunk made from a Note, Loan or
   * Contact carries no `conversation_id` — the column is nullable while
   * `source_type`/`source_id` are not. The guarantee is by scoping, which is the
   * kind that cannot drift. The confirm dialog says so in words.
   */
  destroy: async (sessionId: number): Promise<AiSession> => {
    const res = await http.delete(`/api/v1/ai/sessions/${sessionId}`);
    return parseSession(obj(res.data, "session").session);
  },
};

export const documentsApi = {
  list: async (sessionId: number): Promise<AiDocument[]> => {
    const res = await http.get(`/api/v1/ai/sessions/${sessionId}/documents`);
    return arr(obj(res.data, "documents").documents, "documents.documents").map(parseDocument);
  },

  upload: async (
    sessionId: number,
    file: { uri: string; name: string; mimeType: string },
  ): Promise<AiDocument> => {
    const form = new FormData();
    // React Native's FormData takes this {uri,name,type} shape rather than a
    // Blob; the web's `File` has no equivalent here.
    form.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    } as unknown as Blob);

    const res = await http.post(`/api/v1/ai/sessions/${sessionId}/documents`, form, {
      // Let axios set the multipart boundary. The instance default is
      // application/json, and leaving it in place produces a request Rails
      // parses as an empty body — "file is required" on a file that was there.
      headers: { "Content-Type": "multipart/form-data" },
    });
    return parseDocument(obj(res.data, "document").document);
  },

  remove: async (sessionId: number, documentId: number): Promise<void> => {
    await http.delete(`/api/v1/ai/sessions/${sessionId}/documents/${documentId}`);
  },
};
