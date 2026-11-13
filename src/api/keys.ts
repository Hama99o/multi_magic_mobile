/**
 * EVERY REACT QUERY KEY, ONE FACTORY PER APP (`docs/DATA_LAYER.md`).
 *
 * A key is an address in a shared cache. Written as a literal at each call
 * site, two screens can name one thing twice (Home and the chat header read
 * the unread count under `["notifications","unread"]` and
 * `["notifications","unreadCount"]`: two requests, and two numbers that could
 * disagree), and an invalidation can miss the copy it was meant for. Here
 * each thing has ONE name, and `all` is the prefix that invalidates a whole
 * app.
 *
 * Parameters are GENERIC so a literal argument keeps its literal type:
 * `calendarKeys.upcoming(7)` is typed `readonly ["calendar","upcoming",7]`,
 * which is what lets `src/__tests__/queryKeys.test.ts` see that the calendar
 * and the assistant's suggestions share that one key (its reason to exist).
 *
 * Shapes are hierarchical on purpose: `contactsKeys.all` is a prefix of every
 * contacts key, so `invalidateQueries({ queryKey: contactsKeys.all })` reaches
 * the list, the detail and the trash at once, while
 * `contactsKeys.detail(7)` reaches one contact only.
 *
 * Notes keeps its own (`notes` session, 2026-11-13), and SafeZone's lives
 * beside its API (`src/api/safezone.ts`, on its branch), because its rule
 * (no detail key, ever: secrets) belongs with the code that strips them.
 */
export const profileKeys = {
  all: ["profile"] as const,
  me: () => ["profile"] as const,
  summary: () => ["me", "summary"] as const,
  aiKeys: () => ["aiKeys"] as const,
};

export const aiKeys = {
  all: ["ai"] as const,
  currentSession: () => ["ai", "currentSession"] as const,
  sessions: () => ["ai", "sessions"] as const,
  documents: <C extends number | null>(conversationId: C) => ["ai", "documents", conversationId] as const,
};

export const conversationKeys = {
  all: ["conversations"] as const,
  list: () => ["conversations", "list"] as const,
  unreadCount: () => ["conversations", "unreadCount"] as const,
  thread: <C extends number>(conversationId: C) => ["conversation", conversationId] as const,
};

export const notificationKeys = {
  all: ["notifications"] as const,
  list: () => ["notifications", "list"] as const,
  /** ONE name for the unread count (Home and the chat header both read it). */
  unreadCount: () => ["notifications", "unreadCount"] as const,
};

export const calendarKeys = {
  all: ["calendar"] as const,
  /** Every month window and every agenda page, as prefixes (a write can move an event in any of them). */
  allOccurrences: () => ["calendar", "occurrences"] as const,
  allUpcoming: () => ["calendar", "upcoming"] as const,
  occurrences: <F extends string, T extends string>(from: F, to: T) => ["calendar", "occurrences", from, to] as const,
  upcoming: <D extends number>(days: D) => ["calendar", "upcoming", days] as const,
  event: <E extends number>(eventId: E) => ["calendar", "event", eventId] as const,
  shares: <E extends number>(eventId: E) => ["calendar", "event", eventId, "shares"] as const,
};

export const contactsKeys = {
  all: ["contacts"] as const,
  list: () => ["contacts", "list"] as const,
  /** Every search's results, as one prefix (a write can change any of them). */
  searches: () => ["contacts", "search"] as const,
  search: <S extends string>(term: S) => ["contacts", "search", term] as const,
  detail: <C extends number>(contactId: C) => ["contacts", "contact", contactId] as const,
  trash: () => ["contacts", "trash"] as const,
  allBirthdays: () => ["contacts", "birthdays"] as const,
  birthdays: <D extends number>(days: D) => ["contacts", "birthdays", days] as const,
  duplicates: () => ["contacts", "duplicates"] as const,
};

export const pagesKeys = {
  all: ["pages"] as const,
  spaces: () => ["pages", "spaces"] as const,
  spacesFor: <P extends "move" | "picker">(purpose: P) => ["pages", "spaces", purpose] as const,
  shared: () => ["pages", "shared"] as const,
  node: <S extends number, N extends number>(spaceId: S, nodeId: N) => ["pages", "node", spaceId, nodeId] as const,
  children: <S extends number, P extends number | null, B extends string, D extends string, T extends string | null | undefined>(spaceId: S, parentId: P, sortBy: B, sortDir: D, type: T) =>
    ["pages", "children", spaceId, parentId, sortBy, sortDir, type] as const,
  drive: <V extends string, Q extends string>(view: V, query: Q) => ["pages", "drive", view, query] as const,
  driveSearch: <Q extends string, T extends string | null | undefined>(query: Q, type: T) => ["pages", "drive", "search", query, type] as const,
  folderSearch: <Q extends string>(query: Q) => ["pages", "folder-search", query] as const,
  folders: <S extends number | undefined, P extends number | null>(spaceId: S, parentId: P) => ["pages", "folders", spaceId, parentId] as const,
  moveFolders: <S extends number | undefined, P extends number | null>(spaceId: S, parentId: P) => ["pages", "folders", "move", spaceId, parentId] as const,
  moveStart: <N extends number>(nodeId: N) => ["pages", "moveStart", nodeId] as const,
  gallery: <S extends number, P extends number | null>(spaceId: S, parentId: P) => ["pages", "gallery", spaceId, parentId] as const,
  text: <U extends string>(uri: U) => ["pages", "text", uri] as const,
};
