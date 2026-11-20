/**
 * FLOW, the project board (`docs/design/flow/SPEC.md`).
 *
 * Every call the web's `pages/flow_app/api/flow_app.api.ts` makes, against
 * `Api::V1::FlowApp::*Controller`, read 2026-11-20 at multi_magic 0041bc0b.
 * The inventory with file:line for each is
 * `mm-parity-audit/docs/parity/flow.md`. Custom fields go through
 * `./fields.ts`, which Tables shares.
 *
 * ── WHAT THE SERVER DOES THAT A SCREEN MUST KNOW ─────────────────────────
 * - Projects come `updated_at desc`, 20 a page; `?search=` works since
 *   8fc40eea. Each row carries `my_role` (owner | admin | member | viewer).
 * - The board (`GET …/board?sprint_id=`) is one unpaged answer: the project,
 *   sprints, columns, field definitions, labels by category, the people on
 *   the board and the cards with their field values. With NO sprint it holds
 *   only the cards that have no sprint (`Card.for_board` → `backlog`).
 * - A move between columns goes through `PUT …/move`, which writes history;
 *   `PUT …/reorder` writes none, so it is used for order inside a column only.
 * - A new project is seeded with six columns, six fields and four labels.
 */
import { http } from "./http";
import { arr, bool, id, obj, optStr, readable, readableRows, str } from "./parse";
import { parseDefinitions, parseFieldValues, parseTag, type FieldDefinition, type FieldValues, type Tag } from "./fields";

const BASE = "/api/v1/flow_app";

export const FLOW_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type FlowRole = (typeof FLOW_ROLES)[number];
/** Roles that can be GIVEN (the owner is the creator, never assigned). */
export const ASSIGNABLE_ROLES = ["viewer", "member", "admin"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const SPRINT_STATUSES = ["planning", "active", "completed"] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

/** The record type a card's field values are stored under. */
export const CARD_RECORD_TYPE = "FlowApp::Card";
export const PROJECT_OWNER_TYPE = "FlowApp::Project";

export interface Person {
  id: number;
  name: string;
}

export interface Project {
  id: number;
  title: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  /** The caller's own role; null when the server did not say (the board's copy). */
  myRole: FlowRole | null;
  owner: Person;
  membersCount: number;
  sprintsCount: number;
  cardsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsPage {
  rows: Project[];
  unreadable: number;
  page: number;
  pages: number;
}

export interface Column {
  id: number;
  title: string;
  color: string | null;
  position: number;
  isFinal: boolean;
}

export interface Sprint {
  id: number;
  title: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  status: SprintStatus;
  cardsCount: number;
}

export interface Card {
  id: number;
  projectId: number;
  columnId: number;
  sprintId: number | null;
  title: string;
  /** Rich text (HTML), or null. */
  description: string | null;
  position: number;
  /** The card's own `due_date` column (the AI writes it); the editable one is the "Due Date" field. */
  dueDate: string | null;
  creator: Person;
  commentsCount: number;
  fieldValues: FieldValues;
  createdAt: string;
  updatedAt: string;
}

/**
 * Where a board answer sits in the whole (multi_magic feat/flow-rest-paging
 * ca8817d6, `docs/FLOW_APP_API.md`). An older server ignores the paging
 * arguments and answers the whole board with no `page` key: that is read as
 * one complete page, `paged: false`.
 */
export interface BoardPaging {
  paged: boolean;
  page: number;
  nextPage: number | null;
  total: number | null;
}

/** Which cards a board holds: one sprint's, the ones with no sprint, or (paged server only) all. */
export type SprintScope = number | "backlog" | "all";

export interface Board {
  project: Project;
  sprints: Sprint[];
  columns: Column[];
  fields: FieldDefinition[];
  tagsByCategory: Record<number, Tag[]>;
  people: Person[];
  cards: Card[];
  unreadable: number;
  paging: BoardPaging;
}

export interface Comment {
  id: number;
  content: string;
  user: Person;
  createdAt: string;
  updatedAt: string;
}

export const HISTORY_EVENTS = ["created", "column_changed", "sprint_changed", "field_updated", "commented"] as const;
export type HistoryEvent = (typeof HISTORY_EVENTS)[number];

export interface HistoryEntry {
  id: number;
  event: HistoryEvent | null;
  /** The raw event key, for an event this app does not know yet. */
  rawEvent: string;
  payload: Record<string, unknown>;
  user: Person | null;
  createdAt: string;
}

export interface HistoryPage {
  rows: HistoryEntry[];
  page: number;
  pages: number;
}

export interface NoteLink {
  id: number;
  noteId: number;
  title: string;
  createdAt: string;
}

export interface Member {
  id: number;
  userId: number | null;
  name: string | null;
  role: AssignableRole;
  pending: boolean;
  invitedEmail: string | null;
}

export interface ProjectInput {
  title?: string;
  description?: string | null;
  color?: string | null;
}

export interface SprintInput {
  title: string;
  goal?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface ColumnInput {
  title?: string;
  color?: string | null;
  isFinal?: boolean;
}

export interface CardInput {
  title?: string;
  description?: string | null;
  columnId?: number;
  sprintId?: number | null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

const count = (v: unknown) => (typeof v === "number" ? v : 0);

function parsePerson(raw: unknown, where: string): Person {
  const p = obj(raw, where);
  return { id: id(p.id, `${where}.id`), name: optStr(p.name) ?? "" };
}

function parseProject(raw: unknown): Project {
  const p = obj(raw, "project");
  return {
    id: id(p.id, "project.id"),
    title: str(p.title, "project.title"),
    description: optStr(p.description) || null,
    color: optStr(p.color) || null,
    icon: optStr(p.icon) || null,
    myRole: oneOf(p.my_role, FLOW_ROLES),
    owner: parsePerson(p.owner, "project.owner"),
    membersCount: count(p.members_count),
    sprintsCount: count(p.sprints_count),
    cardsCount: count(p.cards_count),
    createdAt: optStr(p.created_at) ?? "",
    updatedAt: optStr(p.updated_at) ?? "",
  };
}

function parseColumn(raw: unknown): Column {
  const c = obj(raw, "column");
  return {
    id: id(c.id, "column.id"),
    title: str(c.title, "column.title"),
    color: optStr(c.color) || null,
    position: count(c.position),
    isFinal: c.is_final === true,
  };
}

function parseSprint(raw: unknown): Sprint {
  const s = obj(raw, "sprint");
  return {
    id: id(s.id, "sprint.id"),
    title: str(s.title, "sprint.title"),
    goal: optStr(s.goal) || null,
    startDate: optStr(s.start_date),
    endDate: optStr(s.end_date),
    status: oneOf(s.status, SPRINT_STATUSES) ?? "planning",
    cardsCount: count(s.cards_count),
  };
}

export function parseCard(raw: unknown): Card {
  const c = obj(raw, "card");
  return {
    id: id(c.id, "card.id"),
    projectId: id(c.flow_app_project_id, "card.flow_app_project_id"),
    columnId: id(c.flow_app_column_id, "card.flow_app_column_id"),
    sprintId: typeof c.flow_app_sprint_id === "number" ? c.flow_app_sprint_id : null,
    title: str(c.title, "card.title"),
    description: optStr(c.description) || null,
    position: count(c.position),
    dueDate: optStr(c.due_date),
    creator: c.creator ? parsePerson(c.creator, "card.creator") : { id: 0, name: "" },
    commentsCount: count(c.comments_count),
    fieldValues: parseFieldValues(c.field_values),
    createdAt: optStr(c.created_at) ?? "",
    updatedAt: optStr(c.updated_at) ?? "",
  };
}

function parseComment(raw: unknown): Comment {
  const c = obj(raw, "comment");
  return {
    id: id(c.id, "comment.id"),
    content: optStr(c.content) ?? "",
    // The serializer sends `{id, name}`; the web reads `username` and shows an id (web bug).
    user: c.user ? parsePerson(c.user, "comment.user") : { id: 0, name: "" },
    createdAt: optStr(c.created_at) ?? "",
    updatedAt: optStr(c.updated_at) ?? "",
  };
}

function parseHistory(raw: unknown): HistoryEntry {
  const h = obj(raw, "card_history");
  const rawEvent = optStr(h.event_type) ?? "";
  return {
    id: id(h.id, "card_history.id"),
    event: oneOf(rawEvent, HISTORY_EVENTS),
    rawEvent,
    payload: h.payload && typeof h.payload === "object" && !Array.isArray(h.payload) ? (h.payload as Record<string, unknown>) : {},
    user: h.user ? parsePerson(h.user, "card_history.user") : null,
    createdAt: optStr(h.created_at) ?? "",
  };
}

function parseNoteLink(raw: unknown): NoteLink {
  const l = obj(raw, "note_link");
  return {
    id: id(l.id, "note_link.id"),
    noteId: id(l.note_id, "note_link.note_id"),
    title: optStr(l.note_title) ?? "",
    createdAt: optStr(l.note_created_at) ?? optStr(l.created_at) ?? "",
  };
}

function parseMember(raw: unknown): Member {
  const m = obj(raw, "member");
  const user = m.user && typeof m.user === "object" ? (m.user as Record<string, unknown>) : {};
  return {
    id: id(m.id, "member.id"),
    userId: typeof m.user_id === "number" ? m.user_id : null,
    name: optStr(user.name) || null,
    role: oneOf(m.role, ASSIGNABLE_ROLES) ?? "viewer",
    pending: bool(m.pending ?? false, "member.pending"),
    invitedEmail: optStr(m.invited_email) || null,
  };
}

function pageOf(body: Record<string, unknown>, asked: number) {
  const pagy = ((body.meta ?? {}) as { pagy?: { page?: unknown; pages?: unknown } }).pagy ?? {};
  return { page: typeof pagy.page === "number" ? pagy.page : asked, pages: typeof pagy.pages === "number" ? pagy.pages : 1 };
}

function parseBoard(raw: unknown): Board {
  const b = obj(raw, "board");
  const tagsByCategory: Record<number, Tag[]> = {};
  if (b.tags_by_category && typeof b.tags_by_category === "object") {
    for (const [key, tags] of Object.entries(b.tags_by_category as Record<string, unknown>)) {
      if (Array.isArray(tags)) tagsByCategory[Number(key)] = readable(tags, parseTag);
    }
  }
  const cards = readableRows(arr(b.cards, "board.cards"), parseCard);
  const page = b.page && typeof b.page === "object" ? (b.page as Record<string, unknown>) : null;
  const paging: BoardPaging = page
    ? {
        paged: true,
        page: typeof page.page === "number" ? page.page : 1,
        nextPage: page.has_more === true && typeof page.next_page === "number" ? page.next_page : null,
        total: typeof page.total === "number" ? page.total : null,
      }
    : { paged: false, page: 1, nextPage: null, total: null };
  return {
    paging,
    project: parseProject(b.project),
    sprints: readable(arr(b.sprints ?? [], "board.sprints"), parseSprint),
    columns: readable(arr(b.columns, "board.columns"), parseColumn).sort((x, y) => x.position - y.position),
    fields: parseDefinitions(arr(b.field_definitions ?? [], "board.field_definitions")),
    tagsByCategory,
    people: readable(arr(b.project_members ?? [], "board.project_members"), (p) => parsePerson(p, "board.person")),
    cards: cards.rows,
    unreadable: cards.unreadable,
  };
}

function projectBody(input: ProjectInput) {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.description !== undefined) body.description = input.description;
  if (input.color !== undefined) body.color = input.color;
  return { project: body };
}

function cardBody(input: CardInput) {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.description !== undefined) body.description = input.description;
  if (input.columnId !== undefined) body.flow_app_column_id = input.columnId;
  if (input.sprintId !== undefined) body.flow_app_sprint_id = input.sprintId;
  return { card: body };
}

function columnBody(input: ColumnInput) {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.color !== undefined) body.color = input.color;
  if (input.isFinal !== undefined) body.is_final = input.isFinal;
  return { column: body };
}

const sprintBody = (input: SprintInput) => ({
  sprint: { title: input.title, goal: input.goal ?? null, start_date: input.startDate ?? null, end_date: input.endDate ?? null },
});

/** Cards per board page: the server's maximum for full cards. */
export const BOARD_PAGE = 100;

const P = (projectId: number) => `${BASE}/projects/${projectId}`;
const C = (projectId: number, cardId: number) => `${P(projectId)}/cards/${cardId}`;

export const flowApi = {
  projects: async ({ page, search }: { page: number; search?: string }): Promise<ProjectsPage> => {
    const term = search?.trim();
    const res = await http.get(`${BASE}/projects`, { params: term ? { page, search: term } : { page } });
    const body = obj(res.data, "projects");
    const { rows, unreadable } = readableRows(arr(body.projects, "projects"), parseProject);
    return { rows, unreadable, ...pageOf(body, page) };
  },

  project: async (projectId: number): Promise<Project> => parseProject(obj((await http.get(P(projectId))).data, "project").project),

  createProject: async (input: ProjectInput): Promise<Project> =>
    parseProject(obj((await http.post(`${BASE}/projects`, projectBody(input))).data, "create").project),

  updateProject: async (projectId: number, input: ProjectInput): Promise<Project> =>
    parseProject(obj((await http.patch(P(projectId), projectBody(input))).data, "update").project),

  removeProject: async (projectId: number): Promise<void> => {
    await http.delete(P(projectId));
  },

  /**
   * One page of a board, full cards, 100 a page, ordered by column then
   * position. "backlog" is the cards with no sprint (the web's default);
   * "all" is every card and only a paged server understands it.
   */
  board: async (projectId: number, scope: SprintScope, page = 1): Promise<Board> => {
    const sprint = typeof scope === "number" ? { sprint_id: scope } : scope === "all" ? { sprint: "all" } : { sprint: "backlog" };
    return parseBoard((await http.get(`${P(projectId)}/board`, { params: { ...sprint, page, limit: BOARD_PAGE } })).data);
  },

  // ── Sprints ────────────────────────────────────────────────────────────
  createSprint: async (projectId: number, input: SprintInput): Promise<Sprint> =>
    parseSprint(obj((await http.post(`${P(projectId)}/sprints`, sprintBody(input))).data, "create").sprint),
  updateSprint: async (projectId: number, sprintId: number, input: SprintInput): Promise<Sprint> =>
    parseSprint(obj((await http.patch(`${P(projectId)}/sprints/${sprintId}`, sprintBody(input))).data, "update").sprint),
  removeSprint: async (projectId: number, sprintId: number): Promise<void> => {
    await http.delete(`${P(projectId)}/sprints/${sprintId}`);
  },
  /** The server puts any other active sprint back to planning. */
  activateSprint: async (projectId: number, sprintId: number): Promise<Sprint> =>
    parseSprint(obj((await http.put(`${P(projectId)}/sprints/${sprintId}/activate`)).data, "activate").sprint),
  completeSprint: async (projectId: number, sprintId: number): Promise<Sprint> =>
    parseSprint(obj((await http.put(`${P(projectId)}/sprints/${sprintId}/complete`)).data, "complete").sprint),

  // ── Columns ────────────────────────────────────────────────────────────
  columns: async (projectId: number): Promise<Column[]> =>
    readable(arr(obj((await http.get(`${P(projectId)}/columns`)).data, "columns").columns, "columns"), parseColumn).sort((a, b) => a.position - b.position),
  createColumn: async (projectId: number, input: ColumnInput & { position: number }): Promise<Column> =>
    parseColumn(obj((await http.post(`${P(projectId)}/columns`, { column: { ...columnBody(input).column, position: input.position } })).data, "create").column),
  updateColumn: async (projectId: number, columnId: number, input: ColumnInput): Promise<Column> =>
    parseColumn(obj((await http.patch(`${P(projectId)}/columns/${columnId}`, columnBody(input))).data, "update").column),
  /** The server moves the column's cards to the first other column, and refuses for the last one with cards. */
  removeColumn: async (projectId: number, columnId: number): Promise<void> => {
    await http.delete(`${P(projectId)}/columns/${columnId}`);
  },
  reorderColumns: async (projectId: number, ids: number[]): Promise<Column[]> =>
    readable(
      arr(obj((await http.put(`${P(projectId)}/columns/reorder`, { positions: ids.map((columnId, position) => ({ id: columnId, position })) })).data, "reorder").columns, "columns"),
      parseColumn,
    ).sort((a, b) => a.position - b.position),

  // ── Cards ──────────────────────────────────────────────────────────────
  card: async (projectId: number, cardId: number): Promise<Card> => parseCard(obj((await http.get(C(projectId, cardId))).data, "card").card),
  createCard: async (projectId: number, input: CardInput & { title: string; columnId: number }): Promise<Card> =>
    parseCard(obj((await http.post(`${P(projectId)}/cards`, cardBody(input))).data, "create").card),
  updateCard: async (projectId: number, cardId: number, input: CardInput): Promise<Card> =>
    parseCard(obj((await http.patch(C(projectId, cardId), cardBody(input))).data, "update").card),
  removeCard: async (projectId: number, cardId: number): Promise<void> => {
    await http.delete(C(projectId, cardId));
  },
  /** To another column or sprint, with history. `position` 1-based (top = 1). */
  moveCard: async (projectId: number, cardId: number, to: { columnId: number; sprintId: number | null; position: number }): Promise<Card> =>
    parseCard(
      obj((await http.put(`${C(projectId, cardId)}/move`, { card: { flow_app_column_id: to.columnId, flow_app_sprint_id: to.sprintId, position: to.position } })).data, "move").card,
    ),
  /** A column's whole order (and any card in the list joins that column). */
  reorderCards: async (projectId: number, columns: { columnId: number; ids: number[] }[]): Promise<void> => {
    await http.put(`${P(projectId)}/cards/reorder`, { columns: columns.map((c) => ({ column_id: c.columnId, ordered_ids: c.ids })) });
  },

  // ── Comments, history, linked notes ────────────────────────────────────
  comments: async (projectId: number, cardId: number): Promise<Comment[]> =>
    readable(arr(obj((await http.get(`${C(projectId, cardId)}/comments`)).data, "comments").comments, "comments"), parseComment),
  addComment: async (projectId: number, cardId: number, content: string): Promise<Comment> =>
    parseComment(obj((await http.post(`${C(projectId, cardId)}/comments`, { comment: { content } })).data, "create").comment),
  updateComment: async (projectId: number, cardId: number, commentId: number, content: string): Promise<Comment> =>
    parseComment(obj((await http.patch(`${C(projectId, cardId)}/comments/${commentId}`, { comment: { content } })).data, "update").comment),
  removeComment: async (projectId: number, cardId: number, commentId: number): Promise<void> => {
    await http.delete(`${C(projectId, cardId)}/comments/${commentId}`);
  },
  history: async (projectId: number, cardId: number, page: number): Promise<HistoryPage> => {
    const body = obj((await http.get(`${C(projectId, cardId)}/histories`, { params: { page } })).data, "card_histories");
    return { rows: readable(arr(body.card_histories, "card_histories"), parseHistory), ...pageOf(body, page) };
  },
  noteLinks: async (projectId: number, cardId: number): Promise<NoteLink[]> =>
    readable(arr(obj((await http.get(`${C(projectId, cardId)}/note_links`)).data, "note_links").note_links, "note_links"), parseNoteLink),
  linkNote: async (projectId: number, cardId: number, noteId: number): Promise<NoteLink> =>
    parseNoteLink(obj((await http.post(`${C(projectId, cardId)}/note_links`, { note_link: { note_app_note_id: noteId } })).data, "create").note_link),
  unlinkNote: async (projectId: number, cardId: number, linkId: number): Promise<void> => {
    await http.delete(`${C(projectId, cardId)}/note_links/${linkId}`);
  },

  // ── Members ────────────────────────────────────────────────────────────
  members: async (projectId: number): Promise<Member[]> =>
    readable(arr(obj((await http.get(`${P(projectId)}/members`)).data, "members").members, "members"), parseMember),
  /** By account, or by email: an address with no account gets an invitation email. */
  addMember: async (projectId: number, who: { userId: number } | { email: string }, role: AssignableRole): Promise<Member> => {
    const member = "userId" in who ? { user_id: who.userId, role } : { email: who.email, role };
    return parseMember(obj((await http.post(`${P(projectId)}/members`, { member })).data, "add").member);
  },
  updateMemberRole: async (projectId: number, memberId: number, role: AssignableRole): Promise<Member> =>
    parseMember(obj((await http.patch(`${P(projectId)}/members/${memberId}`, { member: { role } })).data, "update").member),
  removeMember: async (projectId: number, memberId: number): Promise<void> => {
    await http.delete(`${P(projectId)}/members/${memberId}`);
  },
  resendInvite: async (projectId: number, memberId: number): Promise<Member> =>
    parseMember(obj((await http.post(`${P(projectId)}/members/${memberId}/resend`)).data, "resend").member),
};

export const __parse = { parseProject, parseBoard, parseCard, parseComment, parseHistory, parseMember, parseSprint, parseColumn, parseNoteLink };
