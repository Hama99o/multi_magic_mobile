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
 * ── AND MOST KEYS DELIBERATELY HAVE NO SCREEN ────────────────────────────
 * `docs/design/README.md`: this app has no note, loan, contact or event
 * screen — wherever something would open a record it composes a question
 * instead. So `notes`, `todos`, `contacts`, `expenses`, `incomes`, `loan` and
 * the flow keys return null here on purpose, and those links still open on the
 * web, which is the only place they exist. **Adding a key here is a claim that
 * this app has that screen.**
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

/** The four route keys this app actually has a screen for. */
const SCREENS = {
  // The one he asked about: "add your own API key" is `app/ai-keys.tsx`.
  ai_keys: "/ai-keys",
  ai: "/chat",
  calendar_event: "/calendar",
  conversation: "/chats",
} as const satisfies Record<string, AppRoute>;

/**
 * PAGES, since 2026-11-06 a screen this app has. The server's keys carry ids
 * in the path (`frontend_routes.rb`: `page_space` → `/pages/:space_id`,
 * `page_node` → `/pages/:space_id?node=:node_id`), so they are read from it.
 * A path that does not parse stays on the web rather than guessing.
 */
function pagesRoute(link: { key: string; path: string | null; label: string | null }): AppRoute | null {
  const match = link.path?.match(/^\/pages\/(\d+)(?:\?(?:.*&)?node=(\d+))?/);
  if (!match) return null;
  const [, spaceId, nodeId] = match;
  const title = link.label ?? "";
  if (link.key === "page_space") return { pathname: "/pages/folder", params: { spaceId, title } };
  if (link.key === "page_node" && nodeId) return { pathname: "/pages/view", params: { spaceId, nodeId, title } };
  return null;
}

/** The in-app route for a link, or null when only the web has it. */
export function inAppRoute(link: { key: string | null | undefined; path: string | null; label: string | null }): AppRoute | null {
  if (!link.key) return null;
  if (link.key === "page_space" || link.key === "page_node") return pagesRoute({ key: link.key, path: link.path, label: link.label });
  return (SCREENS as Record<string, AppRoute>)[link.key] ?? null;
}
