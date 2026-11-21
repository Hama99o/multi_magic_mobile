/**
 * Every Flow write, through `useOptimistic` (`src/lib/optimistic.ts`): what the
 * person sees changes on tap, a refusal puts it back, and the keys the write
 * touched are refetched.
 *
 * A card lives in TWO caches: the board(s) of its project (one per sprint
 * scope, each paged) and its own detail. `editCards` changes it in every
 * board of the project at once; `editCard` in its detail.
 *
 * Not optimistic, on purpose: creating a project, a sprint, a column or a
 * field definition, and adding a member. Each is a record whose id (and for
 * a project, six seeded columns) the server decides.
 */
import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import { flowKeys, fieldKeys } from "@/api/keys";
import {
  CARD_RECORD_TYPE,
  flowApi,
  PROJECT_OWNER_TYPE,
  type AssignableRole,
  type Board,
  type Card,
  type CardInput,
  type Column,
  type ColumnInput,
  type Comment,
  type Member,
  type NoteLink,
  type Project,
  type ProjectInput,
  type ProjectsPage,
  type SprintInput,
} from "@/api/flow";
import { fieldsApi, type DefinitionInput, type FieldDefinition, type FieldValues } from "@/api/fields";
import type { FieldTarget } from "@/components/fields/useFieldWrites";
import { useOptimistic } from "@/lib/optimistic";
import { orderOf, placeCard } from "./logic";

type OnError = (error: unknown) => void;

// ── Cache edits ──────────────────────────────────────────────────────────

/** Every board of the project, every page: the cards edited as one list. */
export function editCards(client: QueryClient, projectId: number, edit: (cards: Card[]) => Card[]) {
  client.setQueriesData<InfiniteData<Board>>({ queryKey: flowKeys.boards(projectId) }, (data) => {
    if (!data?.pages?.length) return data;
    // Edited as ONE list (a move crosses pages), then put back on the first
    // page: the refetch after the write restores the server's paging.
    const all = edit(data.pages.flatMap((p) => p.cards));
    return { ...data, pages: data.pages.map((p, i) => ({ ...p, cards: i === 0 ? all : [] })) };
  });
}

/** The board's own parts (columns, sprints, the project), in every board of the project. */
export function editBoards(client: QueryClient, projectId: number, edit: (board: Board) => Board) {
  client.setQueriesData<InfiniteData<Board>>({ queryKey: flowKeys.boards(projectId) }, (data) =>
    data?.pages?.length ? { ...data, pages: data.pages.map((p) => edit(p)) } : data,
  );
}

function editCard(client: QueryClient, projectId: number, cardId: number, edit: (card: Card) => Card) {
  client.setQueryData<Card>(flowKeys.card(projectId, cardId), (c) => (c ? edit(c) : c));
  editCards(client, projectId, (cards) => cards.map((c) => (c.id === cardId ? edit(c) : c)));
}

function editProjectRows(client: QueryClient, edit: (rows: Project[]) => Project[]) {
  client.setQueriesData<InfiniteData<ProjectsPage>>({ queryKey: flowKeys.projectLists() }, (data) =>
    data?.pages ? { ...data, pages: data.pages.map((p) => ({ ...p, rows: edit(p.rows) })) } : data,
  );
}

const cardKeys = (projectId: number, cardId: number): QueryKey[] => [flowKeys.boards(projectId), flowKeys.card(projectId, cardId)];

/** A card as a field target, for the shared field editors (`useFieldWrites`). */
export function cardFieldTarget(projectId: number, cardId: number): FieldTarget {
  return {
    record: { type: CARD_RECORD_TYPE, id: cardId },
    touched: cardKeys(projectId, cardId),
    edit: (client, change: (values: FieldValues) => FieldValues) => editCard(client, projectId, cardId, (c) => ({ ...c, fieldValues: change(c.fieldValues) })),
  };
}

// ── Projects ─────────────────────────────────────────────────────────────

export function useCreateProject(opts: { onDone?: (project: Project) => void; onError?: OnError } = {}) {
  return useOptimistic({
    run: (input: ProjectInput & { title: string }) => flowApi.createProject(input),
    touched: () => [flowKeys.projectLists()],
    onDone: (project) => opts.onDone?.(project),
    onError: opts.onError,
  });
}

export function useUpdateProject(projectId: number, opts: { onDone?: () => void; onError?: OnError } = {}) {
  return useOptimistic({
    run: (input: ProjectInput) => flowApi.updateProject(projectId, input),
    touched: () => [flowKeys.projectLists(), flowKeys.project(projectId), flowKeys.boards(projectId)],
    apply: (client, input) => {
      const patch = (p: Project): Project => ({ ...p, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) });
      editProjectRows(client, (rows) => rows.map((p) => (p.id === projectId ? patch(p) : p)));
      client.setQueryData<Project>(flowKeys.project(projectId), (p) => (p ? patch(p) : p));
      editBoards(client, projectId, (b) => ({ ...b, project: patch(b.project) }));
    },
    onDone: () => opts.onDone?.(),
    onError: opts.onError,
  });
}

export function useDeleteProject(opts: { onDone?: () => void; onError?: OnError } = {}) {
  return useOptimistic({
    run: (projectId: number) => flowApi.removeProject(projectId),
    touched: () => [flowKeys.projectLists()],
    apply: (client, projectId) => editProjectRows(client, (rows) => rows.filter((p) => p.id !== projectId)),
    done: (client, _r, projectId) => {
      client.removeQueries({ queryKey: flowKeys.boards(projectId) });
      client.removeQueries({ queryKey: flowKeys.project(projectId) });
    },
    onDone: () => opts.onDone?.(),
    onError: opts.onError,
  });
}

// ── Cards ────────────────────────────────────────────────────────────────

/**
 * A placeholder card's id until the server answers: negative, so it never
 * meets a real one, and unique even for two adds in one millisecond (two
 * `-Date.now()` guesses once shared a list key on the device).
 */
let guessSeq = 0;
const nextGuessId = () => -(Date.now() * 1000 + (guessSeq++ % 1000));

export function useCreateCard(projectId: number, opts: { onError?: (e: unknown, title: string) => void } = {}) {
  return useOptimistic({
    run: (input: { title: string; columnId: number; sprintId: number | null }) => flowApi.createCard(projectId, input),
    touched: () => [flowKeys.boards(projectId), flowKeys.projectLists()],
    apply: (client, { title, columnId, sprintId }) =>
      editCards(client, projectId, (cards) => {
        const last = Math.max(0, ...cards.filter((c) => c.columnId === columnId).map((c) => c.position));
        const guess: Card = {
          id: nextGuessId(), projectId, columnId, sprintId, title, description: null, position: last + 1, dueDate: null,
          creator: { id: 0, name: "" }, commentsCount: 0, fieldValues: {}, createdAt: "", updatedAt: "",
        };
        return [...cards, guess];
      }),
    done: (client, made, { title, columnId }) =>
      editCards(client, projectId, (cards) => {
        // The guess is the newest negative id with this title in this column.
        const guess = cards.filter((c) => c.id < 0 && c.title === title && c.columnId === columnId).sort((a, b) => a.id - b.id)[0];
        return cards.map((c) => (c === guess ? made : c));
      }),
    onError: (e, v) => opts.onError?.(e, v.title),
  });
}

export function useUpdateCard(projectId: number, cardId: number, opts: { onError?: OnError } = {}) {
  return useOptimistic({
    run: (input: CardInput) => flowApi.updateCard(projectId, cardId, input),
    touched: () => cardKeys(projectId, cardId),
    apply: (client, input) =>
      editCard(client, projectId, cardId, (c) => ({
        ...c,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.sprintId !== undefined ? { sprintId: input.sprintId } : {}),
        ...(input.columnId !== undefined ? { columnId: input.columnId } : {}),
      })),
    done: (client, card) => client.setQueryData(flowKeys.card(projectId, cardId), card),
    onError: opts.onError,
  });
}

export interface MoveVars {
  card: Card;
  toColumn: number;
  /** 0-based place in the target column, among ALL its cards (not only the filtered ones). */
  index: number;
  /** Sprint to put it in; omitted = stays where it is. */
  sprintId?: number | null;
}

/**
 * A move. Another column or sprint goes through `move` (it writes history,
 * `reorder` does not), and the order of the column(s) is then sent whole, so
 * the place picked is the place kept: `move` alone sets one card's position
 * and renumbers nobody.
 */
export function useMoveCard(projectId: number, opts: { onError?: OnError } = {}) {
  return useOptimistic({
    run: async ({ card, toColumn, index, sprintId }: MoveVars, client) => {
      const changesSprint = sprintId !== undefined && sprintId !== card.sprintId;
      if (toColumn !== card.columnId || changesSprint) {
        await flowApi.moveCard(projectId, card.id, { columnId: toColumn, sprintId: changesSprint ? (sprintId ?? null) : card.sprintId, position: index + 1 });
      }
      // The order as the guess left it in the cache (onMutate runs first), real ids only.
      const cards = client.getQueriesData<InfiniteData<Board>>({ queryKey: flowKeys.boards(projectId) }).find(([, d]) => d?.pages?.length)?.[1]?.pages.flatMap((p) => p.cards) ?? [];
      const order = (col: number) => orderOf(cards, col);
      const columns = [toColumn, ...(toColumn !== card.columnId ? [card.columnId] : [])].map((col) => ({ columnId: col, ids: order(col).filter((cid) => cid > 0) }));
      await flowApi.reorderCards(projectId, columns);
    },
    touched: ({ card }) => cardKeys(projectId, card.id),
    apply: (client, { card, toColumn, index, sprintId }) => {
      editCards(client, projectId, (cards) => placeCard(cards, card.id, toColumn, index).map((c) => (c.id === card.id && sprintId !== undefined ? { ...c, sprintId } : c)));
      client.setQueryData<Card>(flowKeys.card(projectId, card.id), (c) => (c ? { ...c, columnId: toColumn, ...(sprintId !== undefined ? { sprintId } : {}) } : c));
    },
    onError: opts.onError,
  });
}

/** A column's whole new order, from a drag or ▲ ▼ in Reorder mode (`cards/reorder`, no history: nothing changes column). */
export function useReorderCards(projectId: number, opts: { onError?: OnError } = {}) {
  return useOptimistic({
    run: ({ columnId, ids }: { columnId: number; ids: number[] }) => flowApi.reorderCards(projectId, [{ columnId, ids: ids.filter((cid) => cid > 0) }]),
    touched: () => [flowKeys.boards(projectId)],
    apply: (client, { columnId, ids }) => {
      const at = new Map(ids.map((cid, i) => [cid, i + 1]));
      editCards(client, projectId, (cards) => cards.map((c) => (c.columnId === columnId && at.has(c.id) ? { ...c, position: at.get(c.id) as number } : c)));
    },
    onError: opts.onError,
  });
}

export function useDeleteCard(projectId: number, opts: { onDone?: () => void; onError?: OnError } = {}) {
  return useOptimistic({
    run: (card: Card) => flowApi.removeCard(projectId, card.id),
    touched: (card) => [...cardKeys(projectId, card.id), flowKeys.projectLists()],
    apply: (client, card) => editCards(client, projectId, (cards) => cards.filter((c) => c.id !== card.id)),
    done: (client, _r, card) => client.removeQueries({ queryKey: flowKeys.cardAll(projectId, card.id) }),
    onDone: () => opts.onDone?.(),
    onError: opts.onError,
  });
}

// ── Comments and linked notes ────────────────────────────────────────────

export function useAddComment(projectId: number, cardId: number, me: { id: number; name: string }, opts: { onError?: (e: unknown, text: string) => void } = {}) {
  return useOptimistic({
    run: (content: string) => flowApi.addComment(projectId, cardId, content),
    touched: () => [flowKeys.comments(projectId, cardId), flowKeys.history(projectId, cardId), ...cardKeys(projectId, cardId)],
    apply: (client, content) => {
      client.setQueryData<Comment[]>(flowKeys.comments(projectId, cardId), (rows) => [
        ...(rows ?? []),
        { id: nextGuessId(), content, user: me, createdAt: new Date().toISOString(), updatedAt: "" },
      ]);
      editCard(client, projectId, cardId, (c) => ({ ...c, commentsCount: c.commentsCount + 1 }));
    },
    done: (client, made) => client.setQueryData<Comment[]>(flowKeys.comments(projectId, cardId), (rows) => (rows ?? []).map((r) => (r.id < 0 && r.content === made.content ? made : r))),
    onError: (e, text) => opts.onError?.(e, text),
  });
}

export function useEditComment(projectId: number, cardId: number, opts: { onError?: OnError } = {}) {
  return useOptimistic({
    run: ({ commentId, content }: { commentId: number; content: string }) => flowApi.updateComment(projectId, cardId, commentId, content),
    touched: () => [flowKeys.comments(projectId, cardId)],
    apply: (client, { commentId, content }) =>
      client.setQueryData<Comment[]>(flowKeys.comments(projectId, cardId), (rows) => rows?.map((r) => (r.id === commentId ? { ...r, content } : r))),
    onError: opts.onError,
  });
}

export function useDeleteComment(projectId: number, cardId: number, opts: { onError?: OnError } = {}) {
  return useOptimistic({
    run: (commentId: number) => flowApi.removeComment(projectId, cardId, commentId),
    touched: () => [flowKeys.comments(projectId, cardId), ...cardKeys(projectId, cardId)],
    apply: (client, commentId) => {
      client.setQueryData<Comment[]>(flowKeys.comments(projectId, cardId), (rows) => rows?.filter((r) => r.id !== commentId));
      editCard(client, projectId, cardId, (c) => ({ ...c, commentsCount: Math.max(0, c.commentsCount - 1) }));
    },
    onError: opts.onError,
  });
}

export function useLinkNote(projectId: number, cardId: number, opts: { onError?: OnError } = {}) {
  return useOptimistic({
    run: (note: { id: number; title: string }) => flowApi.linkNote(projectId, cardId, note.id),
    touched: () => [flowKeys.noteLinks(projectId, cardId)],
    apply: (client, note) =>
      client.setQueryData<NoteLink[]>(flowKeys.noteLinks(projectId, cardId), (rows) => [...(rows ?? []), { id: -note.id, noteId: note.id, title: note.title, createdAt: "" }]),
    done: (client, made) => client.setQueryData<NoteLink[]>(flowKeys.noteLinks(projectId, cardId), (rows) => (rows ?? []).map((r) => (r.id === -made.noteId ? made : r))),
    onError: opts.onError,
  });
}

export function useUnlinkNote(projectId: number, cardId: number, opts: { onError?: OnError } = {}) {
  return useOptimistic({
    run: (linkId: number) => flowApi.unlinkNote(projectId, cardId, linkId),
    touched: () => [flowKeys.noteLinks(projectId, cardId)],
    apply: (client, linkId) => client.setQueryData<NoteLink[]>(flowKeys.noteLinks(projectId, cardId), (rows) => rows?.filter((r) => r.id !== linkId)),
    onError: opts.onError,
  });
}

// ── Sprints ──────────────────────────────────────────────────────────────

const sprintKeys = (projectId: number): QueryKey[] => [flowKeys.boards(projectId), flowKeys.projectLists()];

export function useSaveSprint(projectId: number, opts: { onDone?: () => void; onError?: OnError } = {}) {
  return useOptimistic({
    run: ({ sprintId, input }: { sprintId: number | null; input: SprintInput }) =>
      sprintId == null ? flowApi.createSprint(projectId, input) : flowApi.updateSprint(projectId, sprintId, input),
    touched: () => sprintKeys(projectId),
    onDone: () => opts.onDone?.(),
    onError: opts.onError,
  });
}

export function useSprintStatus(projectId: number, opts: { onError?: OnError } = {}) {
  return useOptimistic({
    run: ({ sprintId, to }: { sprintId: number; to: "active" | "completed" }) =>
      to === "active" ? flowApi.activateSprint(projectId, sprintId) : flowApi.completeSprint(projectId, sprintId),
    touched: () => sprintKeys(projectId),
    apply: (client, { sprintId, to }) =>
      editBoards(client, projectId, (b) => ({
        ...b,
        // Activating one puts any other active sprint back to planning (`sprints_controller.rb#activate`).
        sprints: b.sprints.map((s) => (s.id === sprintId ? { ...s, status: to } : to === "active" && s.status === "active" ? { ...s, status: "planning" } : s)),
      })),
    onError: opts.onError,
  });
}

export function useDeleteSprint(projectId: number, opts: { onDone?: (sprintId: number) => void; onError?: OnError } = {}) {
  return useOptimistic({
    run: (sprintId: number) => flowApi.removeSprint(projectId, sprintId),
    touched: () => sprintKeys(projectId),
    apply: (client, sprintId) => editBoards(client, projectId, (b) => ({ ...b, sprints: b.sprints.filter((s) => s.id !== sprintId) })),
    onDone: (_r, sprintId) => opts.onDone?.(sprintId),
    onError: opts.onError,
  });
}

// ── Columns ──────────────────────────────────────────────────────────────

const columnKeys = (projectId: number): QueryKey[] => [flowKeys.columns(projectId), flowKeys.boards(projectId)];

function editColumns(client: QueryClient, projectId: number, edit: (columns: Column[]) => Column[]) {
  client.setQueryData<Column[]>(flowKeys.columns(projectId), (cols) => (cols ? edit(cols) : cols));
  editBoards(client, projectId, (b) => ({ ...b, columns: edit(b.columns) }));
}

export function useCreateColumn(projectId: number, opts: { onError?: OnError } = {}) {
  return useOptimistic({
    run: (input: ColumnInput & { title: string; position: number }) => flowApi.createColumn(projectId, input),
    touched: () => columnKeys(projectId),
    done: (client, made) => editColumns(client, projectId, (cols) => [...cols.filter((c) => c.id !== made.id), made].sort((a, b) => a.position - b.position)),
    onError: opts.onError,
  });
}

export function useUpdateColumn(projectId: number, opts: { onError?: OnError } = {}) {
  return useOptimistic({
    run: ({ columnId, input }: { columnId: number; input: ColumnInput }) => flowApi.updateColumn(projectId, columnId, input),
    touched: () => columnKeys(projectId),
    apply: (client, { columnId, input }) =>
      editColumns(client, projectId, (cols) =>
        cols.map((c) =>
          c.id === columnId
            ? { ...c, ...(input.title !== undefined ? { title: input.title } : {}), ...(input.color !== undefined ? { color: input.color } : {}), ...(input.isFinal !== undefined ? { isFinal: input.isFinal } : {}) }
            : c,
        ),
      ),
    onError: opts.onError,
  });
}

export function useDeleteColumn(projectId: number, opts: { onError?: OnError } = {}) {
  return useOptimistic({
    run: (columnId: number) => flowApi.removeColumn(projectId, columnId),
    touched: () => columnKeys(projectId),
    apply: (client, columnId) => {
      // The server moves the cards to the first other column (`column.rb`); so does the guess.
      const cols = client.getQueryData<Column[]>(flowKeys.columns(projectId));
      const target = cols?.filter((c) => c.id !== columnId).sort((a, b) => a.position - b.position)[0];
      editColumns(client, projectId, (all) => all.filter((c) => c.id !== columnId));
      if (target) editCards(client, projectId, (cards) => cards.map((c) => (c.columnId === columnId ? { ...c, columnId: target.id } : c)));
    },
    onError: opts.onError,
  });
}

export function useReorderColumns(projectId: number, opts: { onError?: OnError } = {}) {
  return useOptimistic({
    run: (ids: number[]) => flowApi.reorderColumns(projectId, ids),
    touched: () => columnKeys(projectId),
    apply: (client, ids) =>
      editColumns(client, projectId, (cols) =>
        ids.flatMap((columnId, position) => cols.filter((c) => c.id === columnId).map((c) => ({ ...c, position }))),
      ),
    onError: opts.onError,
  });
}

// ── Members ──────────────────────────────────────────────────────────────

const memberKeys = (projectId: number): QueryKey[] => [flowKeys.members(projectId), flowKeys.boards(projectId), flowKeys.projectLists()];

export function useAddMember(projectId: number, opts: { onDone?: (m: Member) => void; onError?: OnError } = {}) {
  return useOptimistic({
    run: ({ who, role }: { who: { userId: number } | { email: string }; role: AssignableRole }) => flowApi.addMember(projectId, who, role),
    touched: () => memberKeys(projectId),
    onDone: (m) => opts.onDone?.(m),
    onError: opts.onError,
  });
}

export function useMemberRole(projectId: number, opts: { onError?: OnError } = {}) {
  return useOptimistic({
    run: ({ memberId, role }: { memberId: number; role: AssignableRole }) => flowApi.updateMemberRole(projectId, memberId, role),
    touched: () => [flowKeys.members(projectId)],
    apply: (client, { memberId, role }) =>
      client.setQueryData<Member[]>(flowKeys.members(projectId), (rows) => rows?.map((m) => (m.id === memberId ? { ...m, role } : m))),
    onError: opts.onError,
  });
}

export function useRemoveMember(projectId: number, opts: { onDone?: () => void; onError?: OnError } = {}) {
  return useOptimistic({
    run: (memberId: number) => flowApi.removeMember(projectId, memberId),
    touched: () => memberKeys(projectId),
    apply: (client, memberId) => client.setQueryData<Member[]>(flowKeys.members(projectId), (rows) => rows?.filter((m) => m.id !== memberId)),
    onDone: () => opts.onDone?.(),
    onError: opts.onError,
  });
}

export function useResendInvite(projectId: number, opts: { onDone?: () => void; onError?: OnError } = {}) {
  return useOptimistic({
    run: (memberId: number) => flowApi.resendInvite(projectId, memberId),
    touched: () => [flowKeys.members(projectId)],
    onDone: () => opts.onDone?.(),
    onError: opts.onError,
  });
}

// ── Field definitions and labels (the project's fields screen) ───────────

const definitionKeys = (projectId: number): QueryKey[] => [fieldKeys.definitions(PROJECT_OWNER_TYPE, projectId), fieldKeys.tagCategories(PROJECT_OWNER_TYPE, projectId), flowKeys.boards(projectId)];

export function useSaveDefinition(projectId: number, opts: { onDone?: () => void; onError?: OnError } = {}) {
  return useOptimistic({
    run: ({ definitionId, input }: { definitionId: number | null; input: DefinitionInput }) =>
      definitionId == null ? fieldsApi.createDefinition(PROJECT_OWNER_TYPE, projectId, input) : fieldsApi.updateDefinition(definitionId, input),
    touched: () => definitionKeys(projectId),
    onDone: () => opts.onDone?.(),
    onError: opts.onError,
  });
}

export function useDeleteDefinition(projectId: number, opts: { onError?: OnError } = {}) {
  return useOptimistic({
    run: (definitionId: number) => fieldsApi.removeDefinition(definitionId),
    touched: () => definitionKeys(projectId),
    apply: (client, definitionId) => {
      client.setQueryData<FieldDefinition[]>(fieldKeys.definitions(PROJECT_OWNER_TYPE, projectId), (rows) => rows?.filter((d) => d.id !== definitionId));
      editBoards(client, projectId, (b) => ({ ...b, fields: b.fields.filter((d) => d.id !== definitionId) }));
    },
    onError: opts.onError,
  });
}

export function useTagWrites(projectId: number, opts: { onError?: OnError } = {}) {
  const add = useOptimistic({
    run: ({ categoryId, label, color }: { categoryId: number; label: string; color: string | null }) => fieldsApi.createTag(categoryId, label, color),
    touched: () => definitionKeys(projectId),
    onError: opts.onError,
  });
  const remove = useOptimistic({
    run: ({ categoryId, tagId }: { categoryId: number; tagId: number }) => fieldsApi.removeTag(categoryId, tagId),
    touched: () => definitionKeys(projectId),
    onError: opts.onError,
  });
  return { add, remove };
}
