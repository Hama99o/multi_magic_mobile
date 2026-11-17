/**
 * WHAT MAY BE REOPENED (CLAUDE.md "Reopening the app"; MANIFEST M11–M13).
 * The screen the person was on becomes a saved place; a form, an editor, a
 * modal, SafeZone's items and Home never do; a saved place from an older
 * version still reopens its app.
 */
import { parsePlace, placeFor, rootHref } from "../lastPlace";

describe("placeFor: what the current screen saves", () => {
  it.each([
    ["/notes", {}, { app: "notes", root: "/notes" }],
    ["/todos", {}, { app: "todos", root: "/todos" }],
    ["/finance", { tab: "loans" }, { app: "finance", root: "/finance?tab=loans" }],
    ["/finance", { tab: "nonsense" }, { app: "finance", root: "/finance" }],
    ["/calendar", {}, { app: "calendar", root: "/calendar" }],
    ["/contacts", {}, { app: "contacts", root: "/contacts" }],
    ["/safezone", {}, { app: "safezone", root: "/safezone" }],
    ["/pages", {}, { app: "pages", root: "/pages" }],
    ["/chats", {}, { app: "chats", root: "/chats" }],
    ["/notifications", {}, { app: "notifications", root: "/notifications" }],
  ])("%s %j is that app's root", (path, params, expected) => {
    expect(placeFor(path, params)).toEqual(expected);
  });

  it("a Tasks list, a loan and an event are saved as records to re-open", () => {
    expect(placeFor("/todos/list", { id: "12" })).toEqual({ app: "todos", root: "/todos", sub: { kind: "list", id: 12 } });
    expect(placeFor("/finance/loan", { id: "7" })).toEqual({ app: "finance", root: "/finance?tab=loans", sub: { kind: "loan", id: 7 } });
    expect(placeFor("/calendar/event", { id: "5", on: "2026-11-20" })).toEqual({ app: "calendar", root: "/calendar", sub: { kind: "event", id: 5, on: "2026-11-20" } });
  });

  it("Finance's own lists are screens to re-open", () => {
    expect(placeFor("/finance/recurring", {})).toEqual({ app: "finance", root: "/finance", sub: { kind: "screen", path: "/finance/recurring" } });
    expect(placeFor("/finance/reports", {})).toEqual({ app: "finance", root: "/finance", sub: { kind: "screen", path: "/finance/reports" } });
  });

  it.each([
    ["/finance/entry", {}, "finance"],
    ["/finance/loan-edit", { id: "7" }, "finance"],
    ["/finance/recurring-edit", {}, "finance"],
    ["/todos/template", {}, "todos"],
    ["/calendar/edit", { id: "5" }, "calendar"],
    ["/contacts/edit", { id: "3" }, "contacts"],
    ["/notes/edit", { id: "9" }, "notes"],
    ["/notes/note", { id: "9" }, "notes"],
    ["/safezone/item", { kind: "passwords", id: "4" }, "safezone"],
    ["/safezone/edit", {}, "safezone"],
    ["/pages/view", { nodeId: "1" }, "pages"],
    ["/chat/266", { id: "266" }, "chats"],
  ])("a form, an editor or a secret (%s) saves only its app's root", (path, params, app) => {
    const place = placeFor(path, params);
    expect(place?.app).toBe(app);
    expect(place?.sub).toBeUndefined();
  });

  it("a record with no usable id saves the root", () => {
    expect(placeFor("/todos/list", {})).toEqual({ app: "todos", root: "/todos" });
    expect(placeFor("/finance/loan", { id: "abc" })).toEqual({ app: "finance", root: "/finance?tab=loans" });
  });

  it.each(["/home", "/chat", "/profile", "/account", "/sign-in", "/share", "/", "/somewhere-new"])(
    "%s is not a place: it leaves the last app as it was",
    (path) => {
      expect(placeFor(path, {})).toBeNull();
    },
  );
});

describe("parsePlace: reading what an earlier run saved", () => {
  it("reads what placeFor wrote", () => {
    const saved = { v: 2, app: "todos", root: "/todos", sub: { kind: "list", id: 12 }, userId: 7 };
    expect(parsePlace(JSON.stringify(saved))).toEqual(saved);
  });

  it("an older or partial save still reopens its app, at its root (after an update)", () => {
    expect(parsePlace(JSON.stringify({ app: "finance" }))).toEqual({ v: 2, app: "finance", root: "/finance", userId: null });
    expect(parsePlace(JSON.stringify({ v: 1, app: "calendar", path: "/calendar/whatever" }))).toEqual({ v: 2, app: "calendar", root: "/calendar", userId: null });
  });

  it("a root that is not that app's own is replaced by the app's root", () => {
    expect(parsePlace(JSON.stringify({ v: 2, app: "todos", root: "/finance", userId: 1 }))?.root).toBe("/todos");
  });

  it("a broken record is dropped, the app kept", () => {
    expect(parsePlace(JSON.stringify({ v: 2, app: "todos", root: "/todos", sub: { kind: "list", id: "x" }, userId: 1 }))).toEqual({ v: 2, app: "todos", root: "/todos", userId: 1 });
  });

  it.each([null, "", "not json", JSON.stringify({ app: "home" }), JSON.stringify({ app: "assistant" }), JSON.stringify({ app: "nope" }), JSON.stringify(42)])(
    "nothing usable (%j) is no place",
    (raw) => {
      expect(parsePlace(raw)).toBeNull();
    },
  );
});

describe("rootHref", () => {
  it("is the saved root", () => {
    expect(rootHref({ v: 2, app: "finance", root: "/finance?tab=loans", userId: null })).toBe("/finance?tab=loans");
  });
});
