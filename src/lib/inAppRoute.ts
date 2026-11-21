/**
 * Where a reply's link goes ON THIS DEVICE.
 *
 * His request: *"when there is no ai model token it should not redirect to web
 * but mobile page."* The missing-key reply attaches
 * `FrontendRoutes.link('ai_keys', …)` (`rag_chat_job.rb:91`), mobile turned its
 * `path` into `API_URL + path` and opened a BROWSER — sending somebody out of
 * the app to do something the app already has a screen for.
 *
 * ── WHY THIS NEEDS NO BACKEND CHANGE ─────────────────────────────────────
 * He also said the endpoint should "know the mobile" address. It does not have
 * to, and it is better that it does not: `FrontendRoutes.link` stores only
 * `{ key, params }` and NO path — the path is added at presentation. So the
 * ROUTE KEY has always been on the wire, and `MessageLink.key` already carries
 * it. The key is the semantic fact ("this points at the AI keys page"); the
 * path is one client's spelling of it.
 *
 * Teaching the server mobile's routes would make a phone release require a
 * server deploy to stay correct, and would put mobile's navigation in a table
 * mobile does not own. Reading the key it already sends costs nothing and
 * keeps each side owning its own addresses.
 *
 * ── AND WHICH KEYS HAVE A SCREEN HERE ─────────────────────────────────────
 * The app now has Notes, Contacts, an event screen, Pages and threads with
 * people, so `note`, `contact`, `calendar_event`, `conversation`, `page_space`
 * and `page_node` open those screens (audit P1 #13, 2026-11-16). The record's
 * id is read from the link's `path`, whose shape `frontend_routes.rb` owns.
 * `todos` and `todo_group` open the Todo app (2026-11-16).
 * `expenses`, `incomes`, `loan`, the flow and table keys still return
 * null: this app has no screen for them, so they open the preview sheet and
 * from there the web. **Adding a key here is a claim that this app has that
 * screen.**
 *
 * `routeForWebPath` is the same table read by PATH alone, for what carries no
 * key: a notification's `path` (audit P0 #3; the web's bell navigates to it,
 * `NotificationBell.tsx:118-129`).
 */

import type { router } from "expo-router";

/**
 * Exactly what `router.push` accepts — expo-router generates a union of this
 * app's real routes into `.expo/types/router.d.ts`, so **`tsc` checks the
 * claim below**: a screen named here that does not exist fails `npm run
 * typecheck`, and a screen that gets renamed fails at the rename. Derived from
 * `push` rather than imported, because this version of expo-router does not
 * export `Href` from its index.
 */
type AppRoute = Parameters<typeof router.push>[0];

/** Route keys whose screen needs no id. */
const SCREENS = {
  // The one he asked about: "add your own API key" is `app/ai-keys.tsx`.
  ai_keys: "/ai-keys",
  ai: "/chat",
  notes: "/notes",
  contacts: "/contacts",
  todos: "/todos",
} as const satisfies Record<string, AppRoute>;

/** Keys whose record is read from the path; the list screen when the path has no id. */
const BY_PATH: Record<string, AppRoute> = {
  note: "/notes",
  contact: "/contacts",
  calendar_event: "/calendar",
  conversation: "/chats",
  page_space: "/pages",
  page_node: "/pages",
  todo_group: "/todos",
};

const DIGITS = /^\d+$/;

/**
 * The in-app route for a web path, or null when only the web has that page.
 * `label` titles a Pages screen (the folder header reads it before its own
 * load). A path that does not parse returns null rather than guessing.
 */
export function routeForWebPath(path: string | null | undefined, label?: string | null): AppRoute | null {
  if (!path) return null;
  const [pathname, search = ""] = path.split("?", 2);
  const query = new Map<string, string>();
  for (const pair of search.split("&")) {
    const [k, v] = pair.split("=", 2);
    if (!k) continue;
    try {
      query.set(k, decodeURIComponent(v ?? ""));
    } catch {
      // A damaged escape: the value is unreadable, never a crash on tap.
    }
  }
  const id = (name: string) => {
    const value = query.get(name);
    return value && DIGITS.test(value) ? value : null;
  };

  if (pathname === "/conversations") {
    if (!query.has("conversation_id")) return "/chats";
    const conversation = id("conversation_id");
    return conversation ? { pathname: "/chat/[id]", params: { id: conversation } } : null;
  }
  if (pathname === "/calendar") {
    if (!query.has("event")) return "/calendar";
    const event = id("event");
    if (!event) return null;
    const on = query.get("on");
    return { pathname: "/calendar/event", params: on && /^\d{4}-\d{2}-\d{2}$/.test(on) ? { id: event, on } : { id: event } };
  }
  const page = pathname.match(/^\/pages\/(\d+)$/);
  if (page) {
    const spaceId = page[1];
    const title = label ?? "";
    // `?preview=` from a share notification, `?node=` from `frontend_routes.rb`.
    const nodeId = id("preview") ?? id("node");
    if (nodeId) return { pathname: "/pages/view", params: { spaceId, nodeId, title } };
    if (query.has("preview") || query.has("node")) return null;
    return { pathname: "/pages/folder", params: { spaceId, title } };
  }
  const note = pathname.match(/^\/notes\/(\d+)$/);
  if (note) return { pathname: "/notes/edit", params: { id: note[1] } };
  if (pathname === "/notes") return "/notes";
  if (pathname === "/contacts") {
    if (!query.has("contact")) return "/contacts";
    const contact = id("contact");
    return contact ? { pathname: "/contacts/contact", params: { id: contact } } : null;
  }
  if (pathname === "/todos") {
    if (!query.has("group")) return "/todos";
    const group = id("group");
    if (!group) return null;
    const task = id("task");
    return { pathname: "/todos/list", params: task ? { id: group, task } : { id: group } };
  }
  // Global search hits (multi_magic services/search/sources.rb).
  const financeTab: Record<string, { tab: "expenses" | "income" | "loans"; param: string }> = {
    "/finance/expenses": { tab: "expenses", param: "expense" },
    "/finance/income": { tab: "income", param: "income" },
    "/finance/loans": { tab: "loans", param: "loan" },
  };
  const finance = financeTab[pathname];
  if (finance) {
    if (!query.has(finance.param)) return { pathname: "/finance", params: { tab: finance.tab } };
    const record = id(finance.param);
    if (!record) return null;
    if (finance.tab === "loans") return { pathname: "/finance/loan", params: { id: record } };
    return { pathname: "/finance/entry", params: { kind: finance.tab === "income" ? "income" : "expense", id: record } };
  }
  const safe: Record<string, { kind: "passwords" | "payment_cards" | "identities"; param: string }> = {
    "/safezone/passwords": { kind: "passwords", param: "password" },
    "/safezone/payment-cards": { kind: "payment_cards", param: "card" },
    "/safezone/identities": { kind: "identities", param: "identity" },
  };
  const vault = safe[pathname];
  if (vault) {
    if (!query.has(vault.param)) return "/safezone";
    const record = id(vault.param);
    return record ? { pathname: "/safezone/item", params: { kind: vault.kind, id: record } } : null;
  }
  if (pathname === "/profile/me/api-keys") return "/ai-keys";
  if (pathname === "/ai") return "/chat";
  return null;
}

/** The in-app route for a link, or null when only the web has it. */
export function inAppRoute(link: { key: string | null | undefined; path: string | null; label: string | null }): AppRoute | null {
  if (!link.key) return null;
  if (link.key in BY_PATH) {
    const route = routeForWebPath(link.path, link.label);
    if (route) return route;
    // A Pages link that does not parse stays on the web (no guessing); the
    // others fall back to their list, which is where the record lives.
    if (link.key === "page_space" || link.key === "page_node") return null;
    return BY_PATH[link.key];
  }
  return (SCREENS as Record<string, AppRoute>)[link.key] ?? null;
}
