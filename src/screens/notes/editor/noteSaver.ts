/**
 * THE EDITOR'S AUTOSAVE (SPEC §C11 "a slow network never loses text", §G2
 * conflicts). No React, no engine: the screen calls `change` on every edit.
 *
 * - The local draft is written at once; the server 500 ms after the last
 *   change (`flush` sends at once, e.g. when leaving).
 * - Each write carries the version we edited from (`expected_updated_at`):
 *   a server with the version check answers 409 on a web edit meanwhile
 *   (StaleNoteError) and the person is asked. Until that server change is
 *   live (multi_magic branch notes-update-version-check, owner's merge), the
 *   saver also reads the note just before writing and asks if it moved.
 * - Offline or a server error: the draft stays, the header says "On this
 *   phone only", and it tries again by itself, 2 s, 4 s, 8 s… then every
 *   30 s, until it is saved (device, 2026-11-13: back online, nothing was
 *   sent until the next keystroke). A change or `flush` tries at once.
 */
import { StaleNoteError } from "@/lib/staleNote";
import { conflictCopyTitle, type NoteDrafts } from "@/stores/noteDrafts.store";

export { StaleNoteError };

export type Content = { title: string; html: string };
export type ServerNote = Content & { updatedAt: string };

export interface SaverApi {
  get(noteId: number): Promise<ServerNote>;
  /** `expectedUpdatedAt`: the version edited from; a server with the check throws StaleNoteError (409). */
  update(noteId: number, body: Content, expectedUpdatedAt: string): Promise<ServerNote>;
  create(body: Content): Promise<ServerNote & { id: number }>;
}

export type SaverState =
  | { kind: "saved" }
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "local" }
  | { kind: "conflict"; web: ServerNote };

export type ConflictChoice = "mine" | "web" | "both";

export interface NoteSaver {
  change(content: Content): void;
  flush(): Promise<void>;
  resolve(choice: ConflictChoice): Promise<{ reload: ServerNote | null; copyId?: number }>;
  /**
   * The note as a non-content write returned it (reminder, lock, pin, colour,
   * archive, labels): same body, new updated_at. Taken as the new base; a copy
   * with a different body is a web edit and is ignored (the check must see it).
   */
  rebase(note: ServerNote): void;
  /** The content the server last confirmed (what we sent and it accepted, or the opened copy): the header's "Saved" is checked against it. */
  lastSaved(): Content;
  dispose(): void;
}

export interface NoteSaverOptions {
  noteId: number;
  /** The server's copy the editor opened (or the version a restored draft was based on). */
  base: ServerNote;
  api: SaverApi;
  drafts: NoteDrafts;
  onState(state: SaverState): void;
  now?: () => Date;
  locale?: string;
  untitled?: string;
  delayMs?: number;
}

const same = (a: Content, b: Content) => a.title === b.title && a.html === b.html;

export function createNoteSaver(o: NoteSaverOptions): NoteSaver {
  const delay = o.delayMs ?? 500;
  let base: ServerNote = { ...o.base };
  let confirmed: Content = { title: o.base.title, html: o.base.html };
  let pending: Content | null = null;
  let conflict: ServerNote | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let retryMs = 2_000;
  let disposed = false;
  const stopRetry = () => {
    if (retry) clearTimeout(retry);
    retry = null;
  };
  let draftWrite: Promise<void> = Promise.resolve();
  let chain: Promise<void> = Promise.resolve();

  const writeDraft = (c: Content) => {
    const draft = { noteId: o.noteId, ...c, baseUpdatedAt: base.updatedAt, savedAt: Date.now() };
    draftWrite = draftWrite.then(() => o.drafts.put(draft)).catch(() => undefined);
  };

  const send = async () => {
    const c = pending;
    if (!c || conflict) return;
    await draftWrite;
    o.onState({ kind: "saving" });
    try {
      const server = await o.api.get(o.noteId);
      // A new updated_at with the base's body is a metadata write (reminder,
      // lock…), not a web edit: take it as the base (integration server,
      // 2026-11-14: a false "changed on the web" after a reminder).
      if (server.updatedAt !== base.updatedAt && same(server, base)) base = server;
      if (server.updatedAt !== base.updatedAt) {
        conflict = server;
        o.onState({ kind: "conflict", web: server });
        return;
      }
      try {
        base = same(server, c) ? server : await o.api.update(o.noteId, c, base.updatedAt);
      } catch (e) {
        // A metadata write between our check and our write: same body, so save again on its version.
        if (!(e instanceof StaleNoteError) || !same(e.current, base)) throw e;
        base = e.current as ServerNote;
        base = await o.api.update(o.noteId, c, base.updatedAt);
      }
      confirmed = { title: c.title, html: c.html };
      if (pending === c) pending = null;
      await draftWrite;
      await o.drafts.settled(o.noteId, c).catch(() => undefined);
      retryMs = 2_000;
      o.onState(pending ? { kind: "unsaved" } : { kind: "saved" });
    } catch (e) {
      if (e instanceof StaleNoteError) {
        conflict = e.current as ServerNote;
        o.onState({ kind: "conflict", web: conflict });
        return;
      }
      o.onState({ kind: "local" });
      if (!disposed && !retry && !timer) {
        retry = setTimeout(() => {
          retry = null;
          void flush();
        }, retryMs);
        retryMs = Math.min(retryMs * 2, 30_000);
      }
    }
  };

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    stopRetry();
    if (!pending || conflict) return chain;
    chain = chain.then(send);
    return chain;
  };

  const settleOnWeb = async (web: ServerNote) => {
    base = web;
    conflict = null;
    pending = null;
    await draftWrite;
    await o.drafts.discard(o.noteId).catch(() => undefined);
    o.onState({ kind: "saved" });
  };

  const rebase = (note: ServerNote) => {
    if (same(note, base) && note.updatedAt !== base.updatedAt) base = { ...note };
  };

  return {
    rebase,
    lastSaved: () => ({ ...confirmed }),
    change(content) {
      pending = { ...content };
      writeDraft(pending);
      if (conflict) return; // the question is open: stay local
      o.onState({ kind: "unsaved" });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), delay);
    },
    flush,
    async resolve(choice) {
      const web = conflict;
      if (!web) return { reload: null };
      if (choice === "mine") {
        base = web;
        conflict = null;
        if (pending) writeDraft(pending); // re-based on the web's version
        await flush();
        return { reload: null };
      }
      if (choice === "both" && pending) {
        const at = (o.now ?? (() => new Date()))();
        const copy = await o.api.create({
          title: conflictCopyTitle(pending.title, at, o.locale ?? "en", o.untitled),
          html: pending.html,
        });
        await settleOnWeb(web);
        return { reload: web, copyId: copy.id };
      }
      await settleOnWeb(web);
      return { reload: web };
    },
    dispose() {
      disposed = true;
      stopRetry();
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
