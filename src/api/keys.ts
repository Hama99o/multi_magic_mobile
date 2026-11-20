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
  /** `GET /ai_usage?period=` — one entry per period. */
  aiUsage: (period: string) => ["aiUsage", period] as const,
  /** Signed-in devices, trusted devices, sign-in history (`app/security.tsx`). */
  sessions: () => ["security", "sessions"] as const,
  trustedDevices: () => ["security", "trustedDevices"] as const,
  loginHistory: () => ["security", "loginHistory"] as const,
  /** Personal API keys: the LIST only. A new key's token is never cached. */
  apiKeys: () => ["apiKeys"] as const,
  mcp: () => ["mcp", "connections"] as const,
  follows: (kind: "followers" | "following") => ["follows", kind] as const,
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
  /** The list searched for a term (the web's search field). Under `all`, so the
   *  socket's and the thread's invalidations refresh it too. */
  search: <Q extends string>(term: Q) => ["conversations", "search", term] as const,
  unreadCount: () => ["conversations", "unreadCount"] as const,
  /** The people-finder's results for a search, when starting a conversation. */
  people: <Q extends string>(term: Q) => ["conversations", "people", term] as const,
  thread: <C extends number>(conversationId: C) => ["conversation", conversationId] as const,
  /** One thread's messages matching a term (ThreadSearch). */
  threadSearch: <C extends number, Q extends string>(conversationId: C, term: Q) => ["conversation", conversationId, "search", term] as const,
  /** A transcript (useConversation): the messages, assistant's or a thread's.
   *  Its own root, so refetching a conversation's details does not re-read it. */
  transcript: <C extends number | null>(conversationId: C) => ["messages", conversationId] as const,
  /** One page of history before a message, read on scroll (merged into the transcript). */
  olderPage: <C extends number, B extends number>(conversationId: C, before: B) => ["messages", conversationId, "before", before] as const,
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
  /** The web's My Family tab: under `all`, so marking who you are refreshes it. */
  familyMembers: () => ["contacts", "familyMembers"] as const,
  allBirthdays: () => ["contacts", "birthdays"] as const,
  birthdays: <D extends number>(days: D) => ["contacts", "birthdays", days] as const,
  duplicates: () => ["contacts", "duplicates"] as const,
  /** Every family tree, as one prefix (a tie changes several). */
  families: () => ["contacts", "family"] as const,
  family: <C extends number>(contactId: C) => ["contacts", "family", contactId] as const,
};

export const pagesKeys = {
  all: ["pages"] as const,
  spaces: () => ["pages", "spaces"] as const,
  /** The Files tab's list, in the order picked. */
  spacesSorted: <B extends string, D extends string>(sortBy: B, sortDir: D) => ["pages", "spaces", "list", sortBy, sortDir] as const,
  spacesFor: <P extends "move" | "picker" | "owned">(purpose: P) => ["pages", "spaces", purpose] as const,
  /** One space's detail: the only answer that carries the caller's permission. */
  space: <S extends number>(spaceId: S) => ["pages", "space", spaceId] as const,
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
  /** Who a space (node null) or a node is shared with, and its links (audit #14);
   *  `sharing` is the prefix of both, invalidated after every change. */
  sharing: <S extends number, N extends number | null>(spaceId: S, nodeId: N) => ["pages", "sharing", spaceId, nodeId] as const,
  shares: <S extends number, N extends number | null>(spaceId: S, nodeId: N) => ["pages", "sharing", spaceId, nodeId, "people"] as const,
  shareLinks: <S extends number, N extends number | null>(spaceId: S, nodeId: N) => ["pages", "sharing", spaceId, nodeId, "links"] as const,
};

export const todoKeys = {
  all: ["todos"] as const,
  /** Every page of every search of the lists, as one prefix (a write can change any of them). */
  lists: () => ["todos", "lists"] as const,
  /** The lists for one search term ("" = all), paged (useInfiniteQuery). */
  listSearch: <Q extends string>(term: Q) => ["todos", "lists", term] as const,
  /** One list with every task (show). */
  group: <G extends number>(groupId: G) => ["todos", "group", groupId] as const,
  templates: () => ["todos", "templates"] as const,
  /** Every pending task across the lists (Today / Upcoming / Overdue). */
  pending: () => ["todos", "pending"] as const,
  /** Every task search's results, as one prefix. */
  taskSearches: () => ["todos", "taskSearch"] as const,
  /** Tasks matching a search term. */
  taskSearch: <Q extends string>(term: Q) => ["todos", "taskSearch", term] as const,
};

/**
 * Finance. Nearly every write moves several numbers at once (a new expense
 * changes its list, the month's totals, the charts and the budgets), so a
 * write settles by invalidating `all`; the optimistic part names the lists
 * it edits by their prefixes.
 */
export const financeKeys = {
  all: ["finance"] as const,
  expenseLists: () => ["finance", "expenses"] as const,
  expenses: <Q extends string, T extends number | null, Y extends number, M extends number, O extends boolean>(search: Q, tagId: T, year: Y, month: M, oneTime: O) =>
    ["finance", "expenses", search, tagId, year, month, oneTime] as const,
  incomeLists: () => ["finance", "incomes"] as const,
  incomes: <Q extends string, T extends number | null, Y extends number, M extends number>(search: Q, tagId: T, year: Y, month: M) => ["finance", "incomes", search, tagId, year, month] as const,
  pendingIncomes: () => ["finance", "pendingIncomes"] as const,
  /** One expense or income, for its detail and its edit form. */
  entry: <K extends "expense" | "income", I extends number>(kind: K, entryId: I) => ["finance", "entry", kind, entryId] as const,
  loanLists: () => ["finance", "loans"] as const,
  loans: <P extends boolean, L extends string, Q extends string, T extends number | null>(paid: P, type: L, search: Q, tagId: T) => ["finance", "loans", paid, type, search, tagId] as const,
  loan: <I extends number>(loanId: I) => ["finance", "loan", loanId] as const,
  outstanding: () => ["finance", "outstanding"] as const,
  /** The Overview's active-loans card: page 1 of unpaid loans, not the Loans tab's infinite list. */
  activeLoans: () => ["finance", "activeLoans"] as const,
  /** The first page of a period's expenses: its count and the latest rows (Overview). */
  expenseGlance: <Y extends number, M extends number>(year: Y, month: M) => ["finance", "expenseGlance", year, month] as const,
  budgets: () => ["finance", "budgets"] as const,
  recurring: <K extends "expense" | "income">(kind: K) => ["finance", "recurring", kind] as const,
  tags: () => ["finance", "tags"] as const,
  byCategory: <Y extends number, M extends number>(year: Y, month: M) => ["finance", "byCategory", year, month] as const,
  bySubcategory: <T extends number, Y extends number, M extends number>(tagId: T, year: Y, month: M) => ["finance", "bySubcategory", tagId, year, month] as const,
  overTime: <K extends string, C extends string>(kind: K, currency: C) => ["finance", "overTime", kind, currency] as const,
  summary: <Y extends number, M extends number>(year: Y, month: M) => ["finance", "summary", year, month] as const,
  cashFlow: <C extends string>(currency: C) => ["finance", "cashFlow", currency] as const,
  trash: <K extends "expenses" | "incomes" | "loans">(kind: K) => ["finance", "trash", kind] as const,
};

/**
 * Flow (`src/api/flow.ts`). The board is ONE answer per project and sprint
 * (an id, "backlog" or "all"), so a card write edits the board(s)
 * holding it in place and then refetches `boards(projectId)`, the prefix of
 * every sprint's board of that project.
 */
export const flowKeys = {
  all: ["flow"] as const,
  /** Every page of every search of the projects, as one prefix. */
  projectLists: () => ["flow", "projects"] as const,
  projects: <Q extends string>(term: Q) => ["flow", "projects", term] as const,
  project: <P extends number>(projectId: P) => ["flow", "project", projectId] as const,
  boards: <P extends number>(projectId: P) => ["flow", "board", projectId] as const,
  /** One sprint scope's board (an id, "backlog" or "all"), paged (useInfiniteQuery). */
  board: <P extends number, S extends number | string>(projectId: P, scope: S) => ["flow", "board", projectId, scope] as const,
  /** Everything about one card: the card, then its comments, history and notes under it. */
  cardAll: <P extends number, C extends number>(projectId: P, cardId: C) => ["flow", "card", projectId, cardId] as const,
  card: <P extends number, C extends number>(projectId: P, cardId: C) => ["flow", "card", projectId, cardId, "card"] as const,
  comments: <P extends number, C extends number>(projectId: P, cardId: C) => ["flow", "card", projectId, cardId, "comments"] as const,
  history: <P extends number, C extends number>(projectId: P, cardId: C) => ["flow", "card", projectId, cardId, "history"] as const,
  noteLinks: <P extends number, C extends number>(projectId: P, cardId: C) => ["flow", "card", projectId, cardId, "notes"] as const,
  members: <P extends number>(projectId: P) => ["flow", "members", projectId] as const,
  columns: <P extends number>(projectId: P) => ["flow", "columns", projectId] as const,
  /** The notes a card can link, searched. */
  noteSearch: <Q extends string>(term: Q) => ["flow", "noteSearch", term] as const,
  /** People to add to a board, searched. */
  peopleSearch: <Q extends string>(term: Q) => ["flow", "peopleSearch", term] as const,
};

/**
 * Custom fields (`src/api/fields.ts`), shared by Flow and Tables: keyed by the
 * OWNER (a project, a table), never by app.
 */
export const fieldKeys = {
  all: ["fields"] as const,
  definitions: <T extends string, O extends number>(ownerType: T, ownerId: O) => ["fields", "definitions", ownerType, ownerId] as const,
  tagCategories: <T extends string, O extends number>(ownerType: T, ownerId: O) => ["fields", "tagCategories", ownerType, ownerId] as const,
  /** A record field's choices for a search term, paged. */
  options: <D extends number, Q extends string>(definitionId: D, term: Q) => ["fields", "options", definitionId, term] as const,
};
