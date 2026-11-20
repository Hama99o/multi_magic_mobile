/**
 * WHERE THE APP REOPENS (owner, 2026-11-17: "if I close the app while in one
 * app, when I open it again it should open in the same app", then "not home
 * page, it's very important"). The rules are in CLAUDE.md, "Reopening the
 * app"; this file says WHAT may be reopened and how.
 *
 * A place is an app's root (with Finance's tab), plus at most one screen to
 * re-open over it:
 *   - a record (a Tasks list, a loan, an event): pushed only once it has been
 *     fetched again, so one deleted since, or a phone offline, leaves the
 *     app's root on screen, never Home;
 *   - a people-chat thread;
 *   - one of Finance's own lists (recurring, categories, reports, trash).
 * Home is a place (left on Home → Home). Forms, editors, viewers, SafeZone's
 * items, the assistant and the account screens are not places at all, so
 * opening one keeps the screen under it saved.
 */
import { router } from "expo-router";
import type { QueryClient } from "@tanstack/react-query";
import { calendarKeys, conversationKeys, financeKeys, flowKeys, todoKeys } from "@/api/keys";
import { flowApi } from "@/api/flow";
import { conversationsApi } from "@/api/conversations";
import { todoGroupsApi } from "@/api/todos";
import { financeApi } from "@/api/finance";
import { calendarApi } from "@/api/calendar";
import { FINANCE_TABS } from "@/screens/finance/tabs/names";
import type { AppKey } from "./registry";

/** The apps a place can be in: every app with a root of its own, and Home (left on Home → Home). */
export const PLACE_APPS = ["home", "safezone", "notes", "todos", "pages", "finance", "chats", "contacts", "calendar", "notifications", "flow"] as const;
export type PlaceApp = (typeof PLACE_APPS)[number];

const ROOTS: Record<PlaceApp, string> = {
  home: "/home",
  safezone: "/safezone",
  notes: "/notes",
  todos: "/todos",
  pages: "/pages",
  finance: "/finance",
  chats: "/chats",
  contacts: "/contacts",
  calendar: "/calendar",
  notifications: "/notifications",
  flow: "/flow",
};

/**
 * Forms, editors, viewers and SafeZone's secrets are not places: opening one
 * leaves the screen under it saved, so a kill there reopens that screen and
 * never the half-filled form (src/components/shell/CLAUDE.md).
 */
const NOT_PLACES = [
  "/finance/entry", "/finance/loan-edit", "/finance/recurring-edit", "/todos/template", "/calendar/edit",
  "/contacts/edit", "/notes/edit", "/notes/note", "/safezone/item", "/safezone/edit", "/pages/view", "/pages/save",
  "/flow/card",
] as const;
const PAGES_TABS = ["starred", "shared", "files"] as const;
const pagesRoot = (tab: string | undefined) => ((PAGES_TABS as readonly string[]).includes(tab ?? "") ? `/pages?tab=${tab}` : "/pages");

const flowRoot = (tab: string | undefined) => (tab === "backlog" ? "/flow?tab=backlog" : "/flow");

const FINANCE_SCREENS = ["/finance/recurring", "/finance/categories", "/finance/reports", "/finance/trash"] as const;

export type PlaceSub =
  | { kind: "list"; id: number }
  | { kind: "loan"; id: number }
  | { kind: "event"; id: number; on?: string }
  | { kind: "thread"; id: number }
  | { kind: "board"; id: number }
  | { kind: "screen"; path: (typeof FINANCE_SCREENS)[number] };

export interface Place {
  v: 2;
  app: PlaceApp;
  /** The app's root, as an href ("/finance?tab=loans"). */
  root: string;
  sub?: PlaceSub;
  /** Who it belongs to: never reopened for another account. */
  userId: number | null;
}

export type PlaceDraft = Omit<Place, "v" | "userId">;

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const idOf = (v: string | string[] | undefined) => {
  const s = one(v);
  return s && /^\d+$/.test(s) ? Number(s) : null;
};
const isPlaceApp = (v: unknown): v is PlaceApp => typeof v === "string" && (PLACE_APPS as readonly string[]).includes(v);
const financeRoot = (tab: string | undefined) => ((FINANCE_TABS as readonly string[]).includes(tab ?? "") && tab !== "overview" ? `/finance?tab=${tab}` : "/finance");

/** The place the screen at `pathname` saves, or null when it is not a place (it then leaves the last one as it was). */
export function placeFor(pathname: string, params: Params): PlaceDraft | null {
  if ((NOT_PLACES as readonly string[]).includes(pathname)) return null;
  if (pathname.startsWith("/chat/")) {
    const id = idOf(params.id) ?? idOf(pathname.slice("/chat/".length));
    return id == null ? { app: "chats", root: ROOTS.chats } : { app: "chats", root: ROOTS.chats, sub: { kind: "thread", id } };
  }
  const app = (Object.keys(ROOTS) as PlaceApp[]).find((a) => pathname === ROOTS[a] || pathname.startsWith(`${ROOTS[a]}/`));
  if (!app) return null;
  if (pathname === "/pages") return { app, root: pagesRoot(one(params.tab)) };
  if (pathname === "/flow") return { app, root: flowRoot(one(params.tab)) };
  if (app === "flow" && pathname === "/flow/board") {
    const id = idOf(params.id);
    return id == null ? { app, root: ROOTS.flow } : { app, root: ROOTS.flow, sub: { kind: "board", id } };
  }

  if (app === "finance") {
    if (pathname === "/finance") return { app, root: financeRoot(one(params.tab)) };
    if (pathname === "/finance/loan") {
      const id = idOf(params.id);
      return id == null ? { app, root: financeRoot("loans") } : { app, root: financeRoot("loans"), sub: { kind: "loan", id } };
    }
    const screen = FINANCE_SCREENS.find((p) => p === pathname);
    return screen ? { app, root: ROOTS.finance, sub: { kind: "screen", path: screen } } : { app, root: ROOTS.finance };
  }
  if (app === "todos" && pathname === "/todos/list") {
    const id = idOf(params.id);
    return id == null ? { app, root: ROOTS.todos } : { app, root: ROOTS.todos, sub: { kind: "list", id } };
  }
  if (app === "calendar" && pathname === "/calendar/event") {
    const id = idOf(params.id);
    const on = one(params.on);
    if (id == null) return { app, root: ROOTS.calendar };
    return { app, root: ROOTS.calendar, sub: on && /^\d{4}-\d{2}-\d{2}$/.test(on) ? { kind: "event", id, on } : { kind: "event", id } };
  }
  // Any other screen inside an app (a folder, the trash, settings…) reopens
  // that app's root.
  return { app, root: ROOTS[app] };
}

function parseSub(raw: unknown): PlaceSub | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "number" && Number.isInteger(r.id) && r.id > 0 ? r.id : null;
  if ((r.kind === "list" || r.kind === "loan" || r.kind === "thread" || r.kind === "board") && id != null) return { kind: r.kind, id };
  if (r.kind === "event" && id != null) return typeof r.on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.on) ? { kind: "event", id, on: r.on } : { kind: "event", id };
  if (r.kind === "screen") {
    const path = FINANCE_SCREENS.find((p) => p === r.path);
    if (path) return { kind: "screen", path };
  }
  return undefined;
}

/**
 * What an earlier run saved, read as forgivingly as possible: any save that
 * names a known app reopens that app, whatever version wrote it, so an
 * update never sends someone back to Home. Only an unknown app is no place.
 */
export function parsePlace(raw: string | null): Place | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
  if (!isPlaceApp(r.app)) return null;
  const app = r.app;
  const ownRoot = typeof r.root === "string" && (r.root === ROOTS[app] || r.root.startsWith(`${ROOTS[app]}?`));
  const tab = ownRoot ? (new URLSearchParams((r.root as string).split("?")[1] ?? "").get("tab") ?? undefined) : undefined;
  const root = app === "finance" ? financeRoot(tab) : app === "pages" ? pagesRoot(tab) : app === "flow" ? flowRoot(tab) : ROOTS[app];
  const sub = parseSub(r.sub);
  const userId = typeof r.userId === "number" ? r.userId : null;
  return sub ? { v: 2, app, root, sub, userId } : { v: 2, app, root, userId };
}

export function rootHref(place: Place): string {
  return place.root;
}

/** For tests: the AppKey a place is in (Places are always apps with a root). */
export function placeAppKey(place: Place): AppKey {
  return place.app;
}

let restored = false;
/** Tests only: allow another restore in the same process. */
export function __resetRestore(): void {
  restored = false;
}

/**
 * Re-open the saved screen over the app's root, once per launch. A record is
 * fetched first (into the cache its screen reads, so it opens filled); if it
 * is gone or unreachable, nothing is pushed and the root stays.
 */
export async function restoreSub(place: Place, queryClient: QueryClient): Promise<void> {
  if (restored) return;
  restored = true;
  const sub = place.sub;
  if (!sub) return;
  try {
    if (sub.kind === "screen") {
      router.push(sub.path);
      return;
    }
    if (sub.kind === "list") {
      await queryClient.fetchQuery({ queryKey: todoKeys.group(sub.id), queryFn: () => todoGroupsApi.show(sub.id) });
      router.push({ pathname: "/todos/list", params: { id: String(sub.id) } });
      return;
    }
    if (sub.kind === "loan") {
      await queryClient.fetchQuery({ queryKey: financeKeys.loan(sub.id), queryFn: () => financeApi.loans.show(sub.id) });
      router.push({ pathname: "/finance/loan", params: { id: String(sub.id) } });
      return;
    }
    if (sub.kind === "board") {
      // The board fetches itself (its first page); only the project is checked here, so a gone board stays on Flow.
      await queryClient.fetchQuery({ queryKey: flowKeys.project(sub.id), queryFn: () => flowApi.project(sub.id) });
      router.push({ pathname: "/flow/board", params: { id: String(sub.id) } });
      return;
    }
    if (sub.kind === "thread") {
      const thread = await queryClient.fetchQuery({ queryKey: conversationKeys.thread(sub.id), queryFn: () => conversationsApi.show(sub.id) });
      router.push({ pathname: "/chat/[id]", params: { id: String(sub.id), name: thread.displayName, isGroup: thread.isGroup ? "1" : "0" } });
      return;
    }
    await queryClient.fetchQuery({ queryKey: calendarKeys.event(sub.id), queryFn: () => calendarApi.show(sub.id) });
    router.push({ pathname: "/calendar/event", params: sub.on ? { id: String(sub.id), on: sub.on } : { id: String(sub.id) } });
  } catch {
    // Gone, forbidden or offline: the app's root is already on screen, and
    // stays. Never Home (CLAUDE.md, "Reopening the app").
  }
}
