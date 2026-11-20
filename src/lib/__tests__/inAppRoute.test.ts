/**
 * Where a reply's link opens ON THIS DEVICE (`src/lib/inAppRoute.ts`).
 *
 * The app gained Pages on 2026-11-06, and the server already sends Pages
 * links: `page_space` → `/pages/:space_id`, `page_node` → `/pages/:space_id
 * ?node=:node_id` (multi_magic `app/services/frontend_routes.rb`). Until now
 * those opened the browser, the old answer for "the app has no such screen"
 * (docs/QA_FULL.md F3).
 */
import { inAppRoute, routeForWebPath } from "../inAppRoute";

describe("inAppRoute", () => {
  it("keeps the screens it always had", () => {
    expect(inAppRoute({ key: "ai_keys", path: "/settings/ai-keys", label: null })).toBe("/ai-keys");
    // An event link whose path carries no id still lands on the calendar.
    expect(inAppRoute({ key: "calendar_event", path: "/calendar", label: null })).toBe("/calendar");
  });

  it("a whole space opens its folder screen, titled with the link's label", () => {
    expect(inAppRoute({ key: "page_space", path: "/pages/315", label: "QA Pages" })).toEqual({
      pathname: "/pages/folder",
      params: { spaceId: "315", title: "QA Pages" },
    });
  });

  it("a page or a file opens in the viewer (which sends a folder on to the folder screen)", () => {
    expect(inAppRoute({ key: "page_node", path: "/pages/315?node=900", label: "Itinerary.pdf" })).toEqual({
      pathname: "/pages/view",
      params: { spaceId: "315", nodeId: "900", title: "Itinerary.pdf" },
    });
  });

  it("a Pages link whose path cannot be read stays on the web (no guessing)", () => {
    expect(inAppRoute({ key: "page_node", path: "/pages/abc", label: null })).toBeNull();
    expect(inAppRoute({ key: "page_space", path: null, label: null })).toBeNull();
  });

  it("records the app has no screen for stay on the web", () => {
    expect(inAppRoute({ key: "table_app_record", path: "/tables/2/5?record=9", label: null })).toBeNull();
    expect(inAppRoute({ key: null, path: null, label: null })).toBeNull();
  });

  // Finance (2026-11-20, parity F-X3). Paths per `frontend_routes.rb`:
  // `expense` → /finance/expenses?expense=, `income` → /finance/income?income=,
  // `loan` → /finance/loans?loan=.
  it("an expense or an income opens on its own sheet, a loan on its screen", () => {
    expect(inAppRoute({ key: "expense", path: "/finance/expenses?expense=12", label: null })).toEqual({ pathname: "/finance", params: { tab: "expenses", entry: "12" } });
    expect(inAppRoute({ key: "income", path: "/finance/income?income=7", label: null })).toEqual({ pathname: "/finance", params: { tab: "income", entry: "7" } });
    expect(inAppRoute({ key: "loan", path: "/finance/loans?loan=4", label: null })).toEqual({ pathname: "/finance/loan", params: { id: "4" } });
  });

  it("a Finance list opens on its tab, and a damaged id falls back to it", () => {
    expect(inAppRoute({ key: "expenses", path: "/finance/expenses", label: null })).toEqual({ pathname: "/finance", params: { tab: "expenses" } });
    expect(inAppRoute({ key: "incomes", path: "/finance/income", label: null })).toEqual({ pathname: "/finance", params: { tab: "income" } });
    expect(routeForWebPath("/finance/loans")).toEqual({ pathname: "/finance", params: { tab: "loans" } });
    expect(routeForWebPath("/finance/dashboard")).toBe("/finance");
    expect(routeForWebPath("/finance/expenses?expense=abc")).toBeNull();
    expect(inAppRoute({ key: "expense", path: "/finance/expenses?expense=abc", label: null })).toBe("/finance");
  });

  // The Todo app (2026-11-16). Paths per `frontend_routes.rb` and
  // `search/sources.rb` (`/todos?group=&task=`).
  it("a todo list opens the list, and a task opens on that task", () => {
    expect(inAppRoute({ key: "todo_group", path: "/todos?group=2", label: null })).toEqual({ pathname: "/todos/list", params: { id: "2" } });
    expect(routeForWebPath("/todos?group=2&task=9")).toEqual({ pathname: "/todos/list", params: { id: "2", task: "9" } });
    expect(inAppRoute({ key: "todos", path: "/todos", label: null })).toBe("/todos");
    expect(routeForWebPath("/todos")).toBe("/todos");
  });

  // Flow (2026-11-20). Paths per `frontend_routes.rb:40-41`; the web's board
  // opens a card as a drawer (`/flow/7?card=12`).
  it("a Flow project opens its board and a Flow card opens the card", () => {
    expect(inAppRoute({ key: "flow_project", path: "/flow/7", label: null })).toEqual({ pathname: "/flow/board", params: { id: "7" } });
    expect(inAppRoute({ key: "flow_card", path: "/flow/7/cards/12", label: null })).toEqual({ pathname: "/flow/card", params: { projectId: "7", id: "12" } });
    expect(routeForWebPath("/flow/7?card=12")).toEqual({ pathname: "/flow/card", params: { projectId: "7", id: "12" } });
    expect(routeForWebPath("/flow")).toBe("/flow");
    expect(routeForWebPath("/flow/backlog")).toEqual({ pathname: "/flow", params: { tab: "backlog" } });
  });

  it("a Flow link that cannot be read is not guessed", () => {
    expect(routeForWebPath("/flow/7?card=x")).toBeNull();
    expect(inAppRoute({ key: "flow_card", path: "/flow/x/cards/1", label: null })).toBe("/flow");
  });

  it("a todo link whose list id cannot be read is not guessed", () => {
    expect(routeForWebPath("/todos?group=abc")).toBeNull();
    expect(inAppRoute({ key: "todo_group", path: "/todos?group=abc", label: null })).toBe("/todos");
  });

  // Audit P1 #13 (2026-11-16): the app has had Notes, Contacts, an event
  // screen and a thread screen for a while, and these four still went to the
  // web or to a list. Paths per multi_magic `frontend_routes.rb`.
  it("a note opens in the note editor", () => {
    expect(inAppRoute({ key: "note", path: "/notes/4", label: "Groceries" })).toEqual({
      pathname: "/notes/edit",
      params: { id: "4" },
    });
  });

  it("a contact opens its card", () => {
    expect(inAppRoute({ key: "contact", path: "/contacts?contact=12", label: null })).toEqual({
      pathname: "/contacts/contact",
      params: { id: "12" },
    });
  });

  it("an event opens the event screen with its id", () => {
    expect(inAppRoute({ key: "calendar_event", path: "/calendar?event=55", label: null })).toEqual({
      pathname: "/calendar/event",
      params: { id: "55" },
    });
  });

  it("a conversation opens that thread", () => {
    expect(inAppRoute({ key: "conversation", path: "/conversations?conversation_id=8", label: null })).toEqual({
      pathname: "/chat/[id]",
      params: { id: "8" },
    });
  });
});

// Audit P0 #3: a notification's `path` (a web route) to this app's screen,
// as the web's bell navigates to it (NotificationBell.tsx:118-129). Every
// path the server writes today (Notifications::Deliver callers at 6de97a32).
describe("routeForWebPath", () => {
  it("a chat message opens its thread", () => {
    expect(routeForWebPath("/conversations?conversation_id=31")).toEqual({ pathname: "/chat/[id]", params: { id: "31" } });
  });

  it("a reminder opens the event, on the occurrence it is about", () => {
    expect(routeForWebPath("/calendar?event=7&on=2026-11-20")).toEqual({
      pathname: "/calendar/event",
      params: { id: "7", on: "2026-11-20" },
    });
  });

  it("a share or an invite answer opens the event", () => {
    expect(routeForWebPath("/calendar?event=7")).toEqual({ pathname: "/calendar/event", params: { id: "7" } });
  });

  it("the morning brief opens the calendar", () => {
    expect(routeForWebPath("/calendar")).toBe("/calendar");
  });

  it("a shared file opens in the viewer, a shared space in its folder", () => {
    expect(routeForWebPath("/pages/3?preview=90", "Plan.pdf")).toEqual({
      pathname: "/pages/view",
      params: { spaceId: "3", nodeId: "90", title: "Plan.pdf" },
    });
    expect(routeForWebPath("/pages/3", "Trip")).toEqual({ pathname: "/pages/folder", params: { spaceId: "3", title: "Trip" } });
  });

  it("a note, a contact, the AI keys", () => {
    expect(routeForWebPath("/notes/4")).toEqual({ pathname: "/notes/edit", params: { id: "4" } });
    expect(routeForWebPath("/contacts?contact=12")).toEqual({ pathname: "/contacts/contact", params: { id: "12" } });
    expect(routeForWebPath("/profile/me/api-keys")).toBe("/ai-keys");
  });

  it("Tables, forms and anything unknown have no screen here", () => {
    expect(routeForWebPath("/tables/2/5?export=9")).toBeNull();
    expect(routeForWebPath("/tables/2")).toBeNull();
    expect(routeForWebPath("/f/abc?invite=tok")).toBeNull();
    expect(routeForWebPath("/conversations?conversation_id=abc")).toBeNull();
    expect(routeForWebPath(null)).toBeNull();
    expect(routeForWebPath("")).toBeNull();
  });
});

describe("routeForWebPath never throws on a damaged path", () => {
  it("a malformed %-escape reads as no route, not a crash on tap", () => {
    expect(() => routeForWebPath("/calendar?event=1&on=%E0%A4%A")).not.toThrow();
    expect(routeForWebPath("/calendar?event=1&on=%E0%A4%A")).toEqual({ pathname: "/calendar/event", params: { id: "1" } });
  });
});
