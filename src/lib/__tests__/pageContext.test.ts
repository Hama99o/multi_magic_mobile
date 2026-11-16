/**
 * THE SCREEN A QUESTION WAS ASKED FROM (audit #35, 2026-11-16).
 *
 * The web sends `{ app, path, record_id?, workspace? }` with every question
 * (`lib/ai/usePageContext.ts`), so "this note" and "what can I do here?" mean
 * something. The phone's assistant opens as a modal OVER a screen, as the
 * web's floating chat opens over a page, so the screen underneath is the one
 * it was asked from. These pin the phone route → web shape mapping.
 */
import { pageContextFor } from "../pageContext";

describe("pageContextFor", () => {
  it("a note open under the assistant is that note, as the web's /notes/42", () => {
    expect(pageContextFor({ name: "notes/edit", params: { id: "42" } })).toEqual({
      app: "notes", path: "/notes/42", record_id: "42",
    });
    expect(pageContextFor({ name: "notes/note", params: { id: "7" } })).toEqual({
      app: "notes", path: "/notes/7", record_id: "7",
    });
  });

  it("a list has no record", () => {
    expect(pageContextFor({ name: "notes/index" })).toEqual({ app: "notes", path: "/notes" });
    expect(pageContextFor({ name: "contacts/index" })).toEqual({ app: "contacts", path: "/contacts" });
    expect(pageContextFor({ name: "calendar/index" })).toEqual({ app: "calendar", path: "/calendar" });
    expect(pageContextFor({ name: "pages/index" })).toEqual({ app: "page_app", path: "/pages" });
    expect(pageContextFor({ name: "chats" })).toEqual({ app: "conversations", path: "/conversations" });
  });

  it("a record the web keeps in the query string still names its id, path only", () => {
    // Web: /contacts?contact=9 and /calendar?event=5&on=… → path + record_id.
    expect(pageContextFor({ name: "contacts/contact", params: { id: "9" } })).toEqual({
      app: "contacts", path: "/contacts", record_id: "9",
    });
    expect(pageContextFor({ name: "calendar/event", params: { id: "5", on: "2026-11-16" } })).toEqual({
      app: "calendar", path: "/calendar", record_id: "5",
    });
    expect(pageContextFor({ name: "chat/[id]", params: { id: "31" } })).toEqual({
      app: "conversations", path: "/conversations", record_id: "31",
    });
  });

  it("a Pages folder or file is its space, as the web's /pages/12", () => {
    expect(pageContextFor({ name: "pages/folder", params: { spaceId: "12", title: "Taxes" } })).toEqual({
      app: "page_app", path: "/pages/12", record_id: "12",
    });
    expect(pageContextFor({ name: "pages/view", params: { spaceId: "12", nodeId: "55" } })).toEqual({
      app: "page_app", path: "/pages/12", record_id: "12",
    });
  });

  it("SafeZone names the app and nothing of what is in it", () => {
    expect(pageContextFor({ name: "safezone/item", params: { kind: "password", id: "3" } })).toEqual({
      app: "safezone", path: "/safezone/passwords",
    });
  });

  it("Home is the web's home: a path and no app", () => {
    expect(pageContextFor({ name: "home" })).toEqual({ app: null, path: "/" });
  });

  it("opened on its own, or over a screen with no web page, it is the assistant", () => {
    expect(pageContextFor(undefined)).toEqual({ app: "ai", path: "/ai" });
    expect(pageContextFor({ name: "notifications" })).toEqual({ app: "ai", path: "/ai" });
  });

  it("an id that is not a number is not sent", () => {
    expect(pageContextFor({ name: "notes/edit", params: { id: "new" } })).toEqual({ app: "notes", path: "/notes" });
  });
});
