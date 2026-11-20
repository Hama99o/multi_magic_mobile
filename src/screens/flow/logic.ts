/**
 * Flow's rules as pure functions: who may do what, what a card shows, how a
 * column is filtered and ordered, and where a moved card lands. Kept apart
 * from the screens so each rule is one tested function
 * (`__tests__/logic.test.ts`), not a condition repeated in four places.
 */
import type { Card, Comment, FlowRole, Person, Project } from "@/api/flow";
import type { FieldDefinition, SelectOption, Tag } from "@/api/fields";

// ── Permissions ──────────────────────────────────────────────────────────
// From the server's policies (`app/policies/flow_app/*.rb`, multi_magic
// 0041bc0b). The server still decides; these only hide what it would refuse.

export interface Powers {
  /** Title, description, colour; sprints, columns, fields and members. */
  manage: boolean;
  /** Only the owner deletes a project. */
  deleteProject: boolean;
  /** Create, edit, move and reorder cards; set their fields. */
  editCards: boolean;
  /** Everybody on the board comments, viewers included. */
  comment: boolean;
}

export function powersOf(role: FlowRole): Powers {
  const manage = role === "owner" || role === "admin";
  return { manage, deleteProject: role === "owner", editCards: manage || role === "member", comment: true };
}

/**
 * The caller's role. `my_role` came with multi_magic 8fc40eea; before that
 * deploy it is absent, and the owner is still recognisable by id. Anybody
 * else is taken as a member: the web shows them every control and lets the
 * server refuse, which is the behaviour an older server can still give.
 */
export function roleIn(project: Pick<Project, "myRole" | "owner">, meId: number | null | undefined): FlowRole {
  if (project.myRole) return project.myRole;
  if (meId != null && project.owner.id === meId) return "owner";
  return "member";
}

/** `CardPolicy#destroy?`: owner, admin, or whoever made the card. */
export function canDeleteCard(role: FlowRole, meId: number | null | undefined, card: Pick<Card, "creator">): boolean {
  return role === "owner" || role === "admin" || (meId != null && card.creator.id === meId);
}

/** `CommentPolicy`: the author edits; the author, the owner or an admin deletes. */
export function canEditComment(meId: number | null | undefined, comment: Pick<Comment, "user">): boolean {
  return meId != null && comment.user.id === meId;
}
export function canDeleteComment(role: FlowRole, meId: number | null | undefined, comment: Pick<Comment, "user">): boolean {
  return canEditComment(meId, comment) || role === "owner" || role === "admin";
}

// ── What a card shows ────────────────────────────────────────────────────

export const fieldByKey = (fields: FieldDefinition[], key: string) => fields.find((f) => f.key === key);

export function scalarOf(card: Pick<Card, "fieldValues">, field: FieldDefinition | undefined): unknown {
  if (!field) return null;
  const v = card.fieldValues[field.id];
  return v && v.kind === "scalar" ? v.value : null;
}

export function linkedIds(card: Pick<Card, "fieldValues">, field: FieldDefinition | undefined): number[] {
  if (!field) return [];
  const v = card.fieldValues[field.id];
  return v && v.kind === "records" ? v.selections.map((s) => s.recordId) : [];
}

/** The card's priority option; null for "none" or no priority field, so a tile shows no badge. */
export function priorityOf(card: Pick<Card, "fieldValues">, fields: FieldDefinition[]): SelectOption | null {
  const field = fieldByKey(fields, "priority");
  const value = scalarOf(card, field);
  if (typeof value !== "string" || value === "none") return null;
  return field?.config.options.find((o) => o.value === value) ?? null;
}

/**
 * The due date a person set: the "Due Date" field, else the card's own column
 * (which the AI writes). The web's tile shows the column only, so a date
 * edited on the card never reached the board (parity audit, web bug).
 */
export function dueOf(card: Pick<Card, "fieldValues" | "dueDate">, fields: FieldDefinition[]): string | null {
  const value = scalarOf(card, fieldByKey(fields, "due_date"));
  return typeof value === "string" && value ? value.slice(0, 10) : card.dueDate;
}

/** Strictly before today, by the local calendar day (`BoardCard.tsx` `isPastDue`). */
export const isOverdue = (due: string | null, today: string) => Boolean(due) && (due as string) < today;

export function labelsOf(card: Pick<Card, "fieldValues">, fields: FieldDefinition[], tagsByCategory: Record<number, Tag[]>): Tag[] {
  const field = fieldByKey(fields, "labels");
  if (!field?.tagCategoryId) return [];
  const tags = tagsByCategory[field.tagCategoryId] ?? [];
  return linkedIds(card, field).flatMap((tagId) => tags.filter((t) => t.id === tagId));
}

export function assigneesOf(card: Pick<Card, "fieldValues">, fields: FieldDefinition[], people: Person[]): Person[] {
  return linkedIds(card, fieldByKey(fields, "assignees")).flatMap((userId) => people.filter((p) => p.id === userId));
}

/** Two letters for an avatar: first and last word, or the first two letters. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// ── Filter and order ─────────────────────────────────────────────────────

export interface BoardFilter {
  q: string;
  /** Option values; "none" picks cards with no priority. Empty = all. */
  priorities: string[];
  assigneeIds: number[];
  labelIds: number[];
}

export const NO_FILTER: BoardFilter = { q: "", priorities: [], assigneeIds: [], labelIds: [] };

export const activeFilters = (f: BoardFilter) => f.priorities.length + f.assigneeIds.length + f.labelIds.length + (f.q.trim() ? 1 : 0);

export function matches(card: Card, filter: BoardFilter, fields: FieldDefinition[]): boolean {
  const q = filter.q.trim().toLowerCase();
  if (q && !card.title.toLowerCase().includes(q)) return false;
  if (filter.priorities.length) {
    const value = scalarOf(card, fieldByKey(fields, "priority"));
    const p = typeof value === "string" && value ? value : "none";
    if (!filter.priorities.includes(p)) return false;
  }
  if (filter.assigneeIds.length) {
    const ids = linkedIds(card, fieldByKey(fields, "assignees"));
    if (!filter.assigneeIds.some((a) => ids.includes(a))) return false;
  }
  if (filter.labelIds.length) {
    const ids = linkedIds(card, fieldByKey(fields, "labels"));
    if (!filter.labelIds.some((l) => ids.includes(l))) return false;
  }
  return true;
}

export type BoardSort = "manual" | "priority";

/**
 * One column's cards. "manual" is the board's own order (`position`), the
 * one a drag changes. "priority" puts the most urgent on top (the option
 * list's LAST entry is the most urgent in the seeded field, Critical), then
 * keeps the manual order inside each priority.
 */
export function columnCards(cards: Card[], columnId: number, fields: FieldDefinition[], sort: BoardSort = "manual"): Card[] {
  const inColumn = cards.filter((c) => c.columnId === columnId);
  if (sort === "manual") return inColumn.sort((a, b) => a.position - b.position || a.id - b.id);
  const field = fieldByKey(fields, "priority");
  const rank = new Map((field?.config.options ?? []).map((o, i) => [o.value, i]));
  const rankOf = (c: Card) => {
    const v = scalarOf(c, field);
    return typeof v === "string" && rank.has(v) ? (rank.get(v) as number) : -1;
  };
  return inColumn.sort((a, b) => rankOf(b) - rankOf(a) || a.position - b.position || a.id - b.id);
}

/**
 * Where a moved card lands, as the server will store it: out of its column,
 * into `toColumn` at `index` (0-based), and both columns renumbered from 1
 * (`reorder_action.rb` numbers `each.with_index(1)`).
 */
export function placeCard(cards: Card[], cardId: number, toColumn: number, index: number): Card[] {
  const card = cards.find((c) => c.id === cardId);
  if (!card) return cards;
  const fromColumn = card.columnId;
  const target = cards.filter((c) => c.columnId === toColumn && c.id !== cardId).sort((a, b) => a.position - b.position || a.id - b.id);
  const at = Math.max(0, Math.min(index, target.length));
  target.splice(at, 0, { ...card, columnId: toColumn });
  const renumbered = new Map(target.map((c, i) => [c.id, { ...c, position: i + 1 }]));
  if (fromColumn !== toColumn) {
    cards
      .filter((c) => c.columnId === fromColumn && c.id !== cardId)
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .forEach((c, i) => renumbered.set(c.id, { ...c, position: i + 1 }));
  }
  return cards.map((c) => renumbered.get(c.id) ?? c);
}

/** A column's ids in order, for `cards/reorder`. */
export const orderOf = (cards: Card[], columnId: number) =>
  cards
    .filter((c) => c.columnId === columnId)
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map((c) => c.id);

// ── Colours ──────────────────────────────────────────────────────────────
// DATA, not theme: stored on the record and shared with the web, so a colour
// picked on either device is the same colour.

/** A project's colour is stored as a NAME (`ProjectDrawer.tsx` COLORS); its hex is the web board's `COLOR_HEX`. */
export const PROJECT_COLORS = [
  { key: "blue", hex: "#3b82f6" },
  { key: "green", hex: "#22c55e" },
  { key: "red", hex: "#ef4444" },
  { key: "yellow", hex: "#eab308" },
  { key: "purple", hex: "#a855f7" },
  { key: "pink", hex: "#ec4899" },
  { key: "orange", hex: "#f97316" },
] as const;

/** A column's colour is stored as a hex, from these ten (`ProjectColumns.tsx` COLUMN_COLORS). */
export const COLUMN_COLORS = ["#3b82f6", "#22c55e", "#ef4444", "#eab308", "#a855f7", "#ec4899", "#f97316", "#6366f1", "#14b8a6", "#64748b"] as const;

/** Either spelling as a hex; null for none or a name nobody knows. */
export function colorHex(color: string | null | undefined): string | null {
  if (!color) return null;
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  return PROJECT_COLORS.find((c) => c.key === color)?.hex ?? null;
}
