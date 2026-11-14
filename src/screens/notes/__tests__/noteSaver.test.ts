/**
 * The editor's autosave (SPEC §C11, §G2):
 *  - every change goes to the local draft at once, the network 500 ms later;
 *  - the header says Saving… / Saved / On this phone only;
 *  - a web edit made meanwhile is never overwritten: the save stops and asks;
 *  - keep mine / keep the web's / keep both, "keep both" saves a copy.
 * The server has no version check on update, so the saver reads the note's
 * updated_at just before each write.
 */
import { createNoteDrafts, memoryDraftStorage } from "@/stores/noteDrafts.store";
import { StaleNoteError, createNoteSaver, type SaverApi, type SaverState } from "../editor/noteSaver";

type Server = { title: string; html: string; updatedAt: string };

function rig(initial: Server = { title: "Plan", html: "<p>a</p>", updatedAt: "t1" }) {
  let server = { ...initial };
  let tick = 1;
  const calls: string[] = [];
  let offline = false;
  const api: SaverApi = {
    get: jest.fn(async () => {
      calls.push("get");
      if (offline) throw new Error("Network Error");
      return { ...server };
    }),
    update: jest.fn(async (_id, body) => {
      calls.push(`update:${body.html}`);
      if (offline) throw new Error("Network Error");
      server = { ...body, updatedAt: `t${++tick}` };
      return { ...server };
    }),
    create: jest.fn(async (body) => {
      calls.push(`create:${body.title}`);
      return { id: 99, ...body, updatedAt: "c1" };
    }),
  };
  const drafts = createNoteDrafts(memoryDraftStorage());
  const states: SaverState[] = [];
  const saver = createNoteSaver({
    noteId: 7,
    base: initial,
    api,
    drafts,
    now: () => new Date(2026, 10, 12, 15, 40),
    locale: "en",
    onState: (s) => states.push(s),
  });
  return {
    saver, api, drafts, states, calls,
    webEdits: (html: string) => { server = { ...server, html, updatedAt: `t${++tick}` }; },
    /** A reminder, lock, pin, colour, archive or label write: same body, new updated_at. */
    metadataWrite: () => { server = { ...server, updatedAt: `t${++tick}` }; return { ...server }; },
    setOffline: (v: boolean) => { offline = v; },
    server: () => server,
  };
}

const settle = async (ms = 500) => {
  await jest.advanceTimersByTimeAsync(ms);
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it("writes the draft at once and the server after a 500 ms pause", async () => {
  const r = rig();
  r.saver.change({ title: "Plan", html: "<p>ab</p>" });
  await Promise.resolve();
  expect((await r.drafts.get(7))?.html).toBe("<p>ab</p>");
  expect(r.api.update).not.toHaveBeenCalled();
  await settle(499);
  expect(r.api.update).not.toHaveBeenCalled();
  await settle(1);
  expect(r.server().html).toBe("<p>ab</p>");
  expect(await r.drafts.get(7)).toBeNull();
  expect(r.states.at(-1)).toEqual({ kind: "saved" });
});

it("typing keeps pushing the save back; only the last content is sent", async () => {
  const r = rig();
  r.saver.change({ title: "Plan", html: "<p>a1</p>" });
  await settle(300);
  r.saver.change({ title: "Plan", html: "<p>a12</p>" });
  await settle(300);
  r.saver.change({ title: "Plan", html: "<p>a123</p>" });
  await settle(500);
  expect(r.calls.filter((c) => c.startsWith("update"))).toEqual(["update:<p>a123</p>"]);
});

it("says Saving… while the write is in flight", async () => {
  const r = rig();
  r.saver.change({ title: "Plan", html: "<p>x</p>" });
  expect(r.states).toContainEqual({ kind: "unsaved" });
  await settle();
  expect(r.states).toContainEqual({ kind: "saving" });
});

it("offline: keeps the draft, says 'On this phone only', and sends it when asked again", async () => {
  const r = rig();
  r.setOffline(true);
  r.saver.change({ title: "Plan", html: "<p>offline</p>" });
  await settle();
  expect(r.states.at(-1)).toEqual({ kind: "local" });
  expect((await r.drafts.get(7))?.html).toBe("<p>offline</p>");
  r.setOffline(false);
  await r.saver.flush();
  expect(r.server().html).toBe("<p>offline</p>");
  expect(await r.drafts.get(7)).toBeNull();
});

it("back online, it saves by itself, once, with no new keystroke (device, 2026-11-13)", async () => {
  const r = rig();
  r.setOffline(true);
  r.saver.change({ title: "Plan", html: "<p>typed offline</p>" });
  await settle();
  expect(r.states.at(-1)).toEqual({ kind: "local" });
  // Still offline: it keeps trying, backing off, and stays local.
  await settle(2_000);
  await settle(4_000);
  expect(r.states.at(-1)).toEqual({ kind: "local" });
  const tries = (r.api.get as jest.Mock).mock.calls.length;
  expect(tries).toBeGreaterThanOrEqual(3);
  r.setOffline(false);
  await settle(30_000);
  expect(r.server().html).toBe("<p>typed offline</p>");
  expect((r.api.update as jest.Mock).mock.calls.filter((c) => c[1].html === "<p>typed offline</p>")).toHaveLength(1);
  expect(r.states.at(-1)).toEqual({ kind: "saved" });
  expect(await r.drafts.get(7)).toBeNull();
  // Saved: no more tries.
  const after = (r.api.get as jest.Mock).mock.calls.length;
  await settle(120_000);
  expect((r.api.get as jest.Mock).mock.calls.length).toBe(after);
});

it("the retry never runs after dispose", async () => {
  const r = rig();
  r.setOffline(true);
  r.saver.change({ title: "Plan", html: "<p>x</p>" });
  await settle();
  r.saver.dispose();
  const before = (r.api.get as jest.Mock).mock.calls.length;
  r.setOffline(false);
  await settle(120_000);
  expect((r.api.get as jest.Mock).mock.calls.length).toBe(before);
});

it("a web edit made meanwhile stops the save and asks; nothing is overwritten", async () => {
  const r = rig();
  r.webEdits("<p>from the web</p>");
  r.saver.change({ title: "Plan", html: "<p>mine</p>" });
  await settle();
  expect(r.api.update).not.toHaveBeenCalled();
  expect(r.server().html).toBe("<p>from the web</p>");
  expect(r.states.at(-1)).toEqual({ kind: "conflict", web: expect.objectContaining({ html: "<p>from the web</p>" }) });
  expect((await r.drafts.get(7))?.html).toBe("<p>mine</p>");
  // further typing while the question is open stays local
  r.saver.change({ title: "Plan", html: "<p>mine2</p>" });
  await settle();
  expect(r.api.update).not.toHaveBeenCalled();
});

it("our own earlier save is not mistaken for a web edit", async () => {
  const r = rig();
  r.saver.change({ title: "Plan", html: "<p>1</p>" });
  await settle();
  r.saver.change({ title: "Plan", html: "<p>2</p>" });
  await settle();
  expect(r.calls.filter((c) => c.startsWith("update"))).toEqual(["update:<p>1</p>", "update:<p>2</p>"]);
  expect(r.states.at(-1)).toEqual({ kind: "saved" });
});

it("keep mine: writes the phone's version over the web's, then carries on", async () => {
  const r = rig();
  r.webEdits("<p>web</p>");
  r.saver.change({ title: "Plan", html: "<p>mine</p>" });
  await settle();
  const after = await r.saver.resolve("mine");
  expect(r.server().html).toBe("<p>mine</p>");
  expect(after).toEqual({ reload: null });
  r.saver.change({ title: "Plan", html: "<p>mine+</p>" });
  await settle();
  expect(r.server().html).toBe("<p>mine+</p>");
});

it("keep the web's: drops the draft and hands the web's version to reload", async () => {
  const r = rig();
  r.webEdits("<p>web</p>");
  r.saver.change({ title: "Plan", html: "<p>mine</p>" });
  await settle();
  const after = await r.saver.resolve("web");
  expect(after.reload?.html).toBe("<p>web</p>");
  expect(await r.drafts.get(7)).toBeNull();
  expect(r.api.update).not.toHaveBeenCalled();
});

it("keep both (the default): saves mine as a dated copy, the note keeps the web's", async () => {
  const r = rig();
  r.webEdits("<p>web</p>");
  r.saver.change({ title: "Plan", html: "<p>mine</p>" });
  await settle();
  const after = await r.saver.resolve("both");
  expect(r.api.create).toHaveBeenCalledWith({ title: "Plan (conflict 12 Nov 15:40)", html: "<p>mine</p>" });
  expect(r.server().html).toBe("<p>web</p>");
  expect(after).toEqual({ reload: expect.objectContaining({ html: "<p>web</p>" }), copyId: 99 });
  expect(await r.drafts.get(7)).toBeNull();
});

it("nothing changed: leaving does not write", async () => {
  const r = rig();
  await r.saver.flush();
  expect(r.api.get).not.toHaveBeenCalled();
  expect(r.api.update).not.toHaveBeenCalled();
});

it("flush on leave sends a pending change at once", async () => {
  const r = rig();
  r.saver.change({ title: "Plan", html: "<p>leaving</p>" });
  await r.saver.flush();
  expect(r.server().html).toBe("<p>leaving</p>");
});

describe("with the server's version check (409)", () => {
  it("sends the version it edited from with every write", async () => {
    const r = rig();
    r.saver.change({ title: "Plan", html: "<p>x</p>" });
    await settle();
    expect(r.api.update).toHaveBeenCalledWith(7, { title: "Plan", html: "<p>x</p>" }, "t1");
  });

  it("a 409 (a web edit between the read and the write) asks, and nothing is overwritten", async () => {
    const r = rig();
    let web = r.server();
    (r.api.update as jest.Mock).mockImplementationOnce(async () => {
      r.webEdits("<p>web, just now</p>"); // the web saved between our read and our write
      web = r.server();
      throw new StaleNoteError(web);
    });
    r.saver.change({ title: "Plan", html: "<p>mine</p>" });
    await settle();
    expect(r.states.at(-1)).toEqual({ kind: "conflict", web });
    expect((await r.drafts.get(7))?.html).toBe("<p>mine</p>");
    await r.saver.resolve("mine");
    expect(r.api.update).toHaveBeenLastCalledWith(7, { title: "Plan", html: "<p>mine</p>" }, web.updatedAt);
    expect(r.server().html).toBe("<p>mine</p>");
  });
});

// Integration server, 2026-11-14 (SafeZone, all MM server PRs merged): after
// a reminder or lock/unlock, typing in the same note showed a FALSE "This note
// changed on the web". Those writes bump updated_at; the saver's base only
// moved on its own body saves, so the next check saw a new version.
describe("a metadata write is not a web edit", () => {
  it("between two body edits, with rebase(note) from the write: no conflict, the edit is saved", async () => {
    const r = rig();
    r.saver.change({ title: "Plan", html: "<p>b</p>" });
    await settle();
    r.saver.rebase(r.metadataWrite());
    r.saver.change({ title: "Plan", html: "<p>c</p>" });
    await settle();
    expect(r.states.some((s) => s.kind === "conflict")).toBe(false);
    expect(r.server().html).toBe("<p>c</p>");
  });

  it("even without rebase: same body on the server, only a new updated_at, is no conflict", async () => {
    const r = rig();
    r.saver.change({ title: "Plan", html: "<p>b</p>" });
    await settle();
    r.metadataWrite();
    r.saver.change({ title: "Plan", html: "<p>c</p>" });
    await settle();
    expect(r.states.some((s) => s.kind === "conflict")).toBe(false);
    expect(r.server().html).toBe("<p>c</p>");
  });

  it("a 409 whose current copy has the same body (a metadata write in between) saves again instead of asking", async () => {
    const r = rig();
    let first = true;
    (r.api.update as jest.Mock).mockImplementationOnce(async () => {
      first = false;
      throw new StaleNoteError({ ...r.metadataWrite() });
    });
    r.saver.change({ title: "Plan", html: "<p>b</p>" });
    await settle();
    await settle(100);
    expect(first).toBe(false);
    expect(r.states.some((s) => s.kind === "conflict")).toBe(false);
    expect(r.server().html).toBe("<p>b</p>");
  });

  it("a real web edit of the body still asks", async () => {
    const r = rig();
    r.saver.change({ title: "Plan", html: "<p>b</p>" });
    await settle();
    r.webEdits("<p>from the web</p>");
    r.saver.change({ title: "Plan", html: "<p>c</p>" });
    await settle();
    expect(r.states.at(-1)).toEqual({ kind: "conflict", web: expect.objectContaining({ html: "<p>from the web</p>" }) });
    expect(r.server().html).toBe("<p>from the web</p>");
  });

  it("rebase ignores a copy whose body differs (that is a web edit, the check must still see it)", async () => {
    const r = rig();
    r.webEdits("<p>from the web</p>");
    r.saver.rebase(r.server());
    r.saver.change({ title: "Plan", html: "<p>c</p>" });
    await settle();
    expect(r.states.at(-1)?.kind).toBe("conflict");
  });
});
