/**
 * THE LOCAL DRAFT of a note being edited (SPEC §C11: "a slow network never
 * loses text"; §G2: a web edit made meanwhile is never overwritten).
 *
 * - Every change is put here BEFORE the network save.
 * - The draft is removed only when the server answered a save with that same
 *   content (`settled`): an older save coming back leaves the newer draft.
 * - On open, `decideOnOpen` restores an unsent draft, or reports a conflict
 *   when the server's copy moved past the version the draft was based on.
 *
 * The storage is injected: files on the phone (`noteDrafts.files.ts`, no size
 * cap; AsyncStorage rows break near 2 MB on Android and 914 KB notes exist),
 * memory in tests. Reads never throw: a draft we cannot read is no draft, and
 * the server's copy is still there.
 */

export interface NoteDraft {
  noteId: number;
  title: string;
  html: string;
  /** The server's `updated_at` this draft was edited from. */
  baseUpdatedAt: string;
  /** Epoch ms of the last local change. */
  savedAt: number;
}

export interface DraftStorage {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export function memoryDraftStorage(): DraftStorage {
  const rows = new Map<string, string>();
  return {
    read: async (key) => rows.get(key) ?? null,
    write: async (key, value) => void rows.set(key, value),
    remove: async (key) => void rows.delete(key),
  };
}

function asDraft(value: unknown): NoteDraft | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Record<string, unknown>;
  const ok =
    typeof d.noteId === "number" && typeof d.title === "string" && typeof d.html === "string" &&
    typeof d.baseUpdatedAt === "string" && typeof d.savedAt === "number";
  return ok ? (d as unknown as NoteDraft) : null;
}

export interface NoteDrafts {
  put(draft: NoteDraft): Promise<void>;
  get(noteId: number): Promise<NoteDraft | null>;
  /** The server saved this title and body: drop the draft if it holds nothing newer. */
  settled(noteId: number, saved: { title: string; html: string }): Promise<void>;
  discard(noteId: number): Promise<void>;
}

export function createNoteDrafts(storage: DraftStorage): NoteDrafts {
  const get = async (noteId: number): Promise<NoteDraft | null> => {
    try {
      const raw = await storage.read(String(noteId));
      return raw ? asDraft(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  };
  return {
    put: (draft) => storage.write(String(draft.noteId), JSON.stringify(draft)),
    get,
    settled: async (noteId, saved) => {
      const current = await get(noteId);
      if (current && current.html === saved.html && current.title === saved.title) await storage.remove(String(noteId));
    },
    discard: (noteId) => storage.remove(String(noteId)),
  };
}

export type OpenDecision =
  | { kind: "server"; discardDraft?: true }
  | { kind: "restore"; draft: NoteDraft }
  | { kind: "conflict"; draft: NoteDraft };

export function decideOnOpen(draft: NoteDraft | null, server: { title: string; html: string; updatedAt: string }): OpenDecision {
  if (!draft) return { kind: "server" };
  if (draft.html === server.html && draft.title === server.title) return { kind: "server", discardDraft: true };
  if (draft.baseUpdatedAt === server.updatedAt) return { kind: "restore", draft };
  return { kind: "conflict", draft };
}

/** "Plan (conflict 12 Nov 15:40)" — the copy "Keep both" saves (§G2). */
export function conflictCopyTitle(title: string, at: Date, locale: string, untitled = "Untitled"): string {
  const day = at.getDate();
  const month = new Intl.DateTimeFormat(locale, { month: "short" }).format(at).replace(/\.$/, "");
  const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return `${title.trim() || untitled} (conflict ${day} ${month} ${time})`;
}
