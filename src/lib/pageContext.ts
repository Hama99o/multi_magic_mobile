/**
 * THE SCREEN A QUESTION WAS ASKED FROM (audit #35, 2026-11-16).
 *
 * The web sends `context: { app, path, record_id?, workspace? }` with every
 * question (`lib/ai/usePageContext.ts`, `AiChat.tsx` handleSend), so "this
 * note" and "what can I do here?" mean something. `Ai::PageContext` puts it
 * in the prompt as "Current screen".
 *
 * The phone's assistant is a MODAL over whatever screen was open
 * (`AiButton.tsx`, `app/_layout.tsx`), as the web's floating chat opens over
 * a page, so the screen under it in the root stack is where it was asked.
 * That route is spelled here as the WEB page showing the same thing, and the
 * web's own rules then apply: the app from the path's prefix
 * (`resolveAppFromPath`), the record from the path's last number, else the
 * first numeric query value (`recordIdFrom`).
 *
 * Left out: `workspace` (the web's side-by-side panes have no phone
 * equivalent), and SafeZone record ids (the app is named, never the item).
 * A screen with no web page, or the assistant opened on its own, is the
 * assistant itself: `{ app: "ai", path: "/ai" }`.
 */
import type { AiPageContext } from "@/api/ai";

export interface StackRoute {
  name: string;
  params?: Record<string, unknown> | object;
}

/** The web's `APP_REGISTRY` match prefixes (`lib/apps.ts`), longest wins. */
const APP_PREFIXES: [string, string][] = [
  ["/safezone", "safezone"],
  ["/notes", "notes"],
  ["/todos", "todos"],
  ["/explorer", "page_app"],
  ["/pages", "page_app"],
  ["/finance", "finance"],
  ["/flow", "flow"],
  ["/conversations", "conversations"],
  ["/doc", "doc"],
  ["/contacts", "contacts"],
  ["/calendar", "calendar"],
  ["/tables", "tables"],
  ["/ai", "ai"],
];

const ASSISTANT = "/ai";
const DIGITS = /^\d+$/;

function appFor(path: string): string | null {
  let best: string | null = null;
  let length = -1;
  for (const [prefix, key] of APP_PREFIXES) {
    if ((path === prefix || path.startsWith(`${prefix}/`)) && prefix.length > length) {
      best = key;
      length = prefix.length;
    }
  }
  return best;
}

/** A numeric id param, or undefined: "new" and the like are not records. */
function idOf(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && DIGITS.test(value) ? value : undefined;
}

/** The web URL (path, query) showing what this phone route shows. */
function webUrlFor(route: StackRoute | undefined): { path: string; query: (string | undefined)[] } {
  if (!route) return { path: ASSISTANT, query: [] };
  const params = (route.params ?? {}) as Record<string, unknown>;
  const id = idOf(params, "id");
  switch (route.name) {
    case "home":
      return { path: "/", query: [] };
    case "notes/index":
      return { path: "/notes", query: [] };
    case "notes/edit":
    case "notes/note":
      return { path: id ? `/notes/${id}` : "/notes", query: [] };
    // The web opens a contact as `/contacts?contact=9`, an event as
    // `/calendar?event=5`, a thread as `/conversations?conversation_id=31`.
    case "contacts/index":
    case "contacts/duplicates":
    case "contacts/import":
    case "contacts/shared":
    case "contacts/trash":
      return { path: "/contacts", query: [] };
    case "contacts/contact":
    case "contacts/edit":
    case "contacts/family":
      return { path: "/contacts", query: [id] };
    case "contacts/document":
      return { path: "/contacts", query: [idOf(params, "contactId")] };
    case "calendar/index":
      return { path: "/calendar", query: [] };
    case "calendar/event":
    case "calendar/edit":
      return { path: "/calendar", query: [id] };
    case "chats":
      return { path: "/conversations", query: [] };
    case "chat/[id]":
      return { path: "/conversations", query: [id] };
    case "pages/index":
    case "pages/drive":
    case "pages/uploads":
    case "pages/save":
      return { path: "/pages", query: [] };
    case "pages/folder":
    case "pages/view": {
      const space = idOf(params, "spaceId");
      return { path: space ? `/pages/${space}` : "/pages", query: [idOf(params, "nodeId")] };
    }
    default:
      // SafeZone: the app, never which item (see the header).
      if (route.name.startsWith("safezone/")) return { path: "/safezone/passwords", query: [] };
      return { path: ASSISTANT, query: [] };
  }
}

/** `{ app, path, record_id? }` for the screen under the assistant. */
export function pageContextFor(route: StackRoute | undefined): AiPageContext {
  const { path, query } = webUrlFor(route);
  // The web's `recordIdFrom`: the path's last number first, then the query's.
  const recordId = path.match(/\/(\d+)\/?$/)?.[1] ?? query.find((value) => value !== undefined);
  return { app: appFor(path), path, ...(recordId ? { record_id: recordId } : {}) };
}

/** The route under the top of a stack state (the assistant), if any. */
export function screenUnder(state: { index?: number; routes?: StackRoute[] } | undefined): StackRoute | undefined {
  if (!state?.routes?.length) return undefined;
  const top = state.index ?? state.routes.length - 1;
  return top > 0 ? state.routes[top - 1] : undefined;
}
