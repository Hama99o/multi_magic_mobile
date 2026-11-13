/**
 * The local draft (SPEC §C11, "a slow network never loses text"; §G2 conflicts).
 * Every change is written here BEFORE the network save; the draft goes away only
 * when the server holds the same content; a web edit made meanwhile is never
 * overwritten.
 */
import { conflictCopyTitle, createNoteDrafts, decideOnOpen, memoryDraftStorage, type NoteDraft } from "../noteDrafts.store";

const draft = (over: Partial<NoteDraft> = {}): NoteDraft => ({
  noteId: 7,
  title: "Plan",
  html: "<p>mine</p>",
  baseUpdatedAt: "2026-11-12T10:00:00Z",
  savedAt: 1,
  ...over,
});

describe("the draft store", () => {
  it("keeps a draft across a restart (a new store over the same storage)", async () => {
    const storage = memoryDraftStorage();
    await createNoteDrafts(storage).put(draft());
    expect(await createNoteDrafts(storage).get(7)).toEqual(draft());
  });

  it("clears the draft only when the server saved that same content", async () => {
    const drafts = createNoteDrafts(memoryDraftStorage());
    await drafts.put(draft({ html: "<p>v2</p>" }));
    await drafts.settled(7, { title: "Plan", html: "<p>v1</p>" }); // an older save came back: v2 is still unsent
    expect((await drafts.get(7))?.html).toBe("<p>v2</p>");
    await drafts.settled(7, { title: "Plan", html: "<p>v2</p>" });
    expect(await drafts.get(7)).toBeNull();
  });

  it("an unsent title keeps the draft even when the body was saved", async () => {
    const drafts = createNoteDrafts(memoryDraftStorage());
    await drafts.put(draft({ title: "Plan v2" }));
    await drafts.settled(7, { title: "Plan", html: "<p>mine</p>" });
    expect((await drafts.get(7))?.title).toBe("Plan v2");
  });

  it("a storage that fails to read gives no draft rather than an error", async () => {
    const broken = { read: async () => { throw new Error("disk"); }, write: async () => undefined, remove: async () => undefined };
    expect(await createNoteDrafts(broken).get(7)).toBeNull();
  });

  it("a stored draft that is not a draft is ignored", async () => {
    const storage = memoryDraftStorage();
    await storage.write("7", "{not json");
    expect(await createNoteDrafts(storage).get(7)).toBeNull();
    await storage.write("7", JSON.stringify({ noteId: 7 }));
    expect(await createNoteDrafts(storage).get(7)).toBeNull();
  });

  it("a draft too large for one note is still kept (914 KB notes exist)", async () => {
    const drafts = createNoteDrafts(memoryDraftStorage());
    const big = `<p>${"x".repeat(1_200_000)}</p>`;
    await drafts.put(draft({ html: big }));
    expect((await drafts.get(7))?.html.length).toBe(big.length);
  });
});

describe("decideOnOpen", () => {
  const server = { title: "Plan", html: "<p>server</p>", updatedAt: "2026-11-12T10:00:00Z" };

  it("no draft: the server's copy", () => {
    expect(decideOnOpen(null, server)).toEqual({ kind: "server" });
  });

  it("a draft equal to the server's copy is already saved", () => {
    expect(decideOnOpen(draft({ html: server.html }), server)).toEqual({ kind: "server", discardDraft: true });
  });

  it("an unsent draft on the server version it was based on is restored", () => {
    const d = draft();
    expect(decideOnOpen(d, server)).toEqual({ kind: "restore", draft: d });
  });

  it("an unsent draft whose base moved (a web edit meanwhile) is a conflict, never an overwrite", () => {
    const d = draft({ baseUpdatedAt: "2026-11-12T09:00:00Z" });
    expect(decideOnOpen(d, server)).toEqual({ kind: "conflict", draft: d });
  });

  it("a title-only change in the draft is restored too", () => {
    const d = draft({ html: server.html, title: "Plan v2" });
    expect(decideOnOpen(d, server)).toEqual({ kind: "restore", draft: d });
  });
});

describe("conflictCopyTitle", () => {
  it("names the copy as the owner chose: '… (conflict 12 Nov 15:40)'", () => {
    expect(conflictCopyTitle("Plan", new Date(2026, 10, 12, 15, 40), "en")).toBe("Plan (conflict 12 Nov 15:40)");
  });

  it("an untitled note still gets a readable copy title", () => {
    expect(conflictCopyTitle("", new Date(2026, 10, 12, 9, 5), "en", "Untitled")).toBe("Untitled (conflict 12 Nov 09:05)");
  });
});
