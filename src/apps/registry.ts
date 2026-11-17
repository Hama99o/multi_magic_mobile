/**
 * EVERY APP, ONCE — the one list behind Home, the app switcher and the Profile
 * menu (docs/design/app-shell/SPEC.md §D4). Before it, Home had its own hand-
 * written tiles and the Profile sheet one lone "Pages" row, so the three could
 * disagree; now none of them lists an app itself.
 *
 * The order is the web's (`multi_magic` `lib/apps.ts` `APP_REGISTRY`), keeping
 * the apps mobile has, with Home first so it is one tap away in the switcher,
 * and the two mobile-only places (Notifications, past Conversations) last.
 * FlowApp, Doc Tools and Tables have no mobile app (owner, 2026-11-17: LATER).
 */
import { router, type Href } from "expo-router";
import {
  Bell,
  BookUser,
  CalendarDays,
  FolderOpen,
  House,
  ListChecks,
  MessageSquareText,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "@/components/icons";
import type { HomeApp } from "@/theme/appColors";

export type AppKey = "home" | HomeApp;

export interface AppEntry {
  key: AppKey;
  /** Where the app's root lives. */
  route: Href;
  icon: LucideIcon;
  /** The app's name, as Home has always called it. */
  labelKey: string;
  /** Its one line (Home's tile, the switcher's search). */
  lineKey: string;
  /** Presented OVER the current screen (a modal), so it is pushed, never swapped in. */
  modal?: boolean;
}

export const APP_REGISTRY: readonly AppEntry[] = [
  { key: "home", route: "/home", icon: House, labelKey: "shell.home", lineKey: "shell.homeBody" },
  { key: "safezone", route: "/safezone", icon: ShieldCheck, labelKey: "safezone.title", lineKey: "home.safezoneBody" },
  { key: "notes", route: "/notes", icon: NotebookPen, labelKey: "notes.title", lineKey: "home.notesBody" },
  { key: "todos", route: "/todos", icon: ListChecks, labelKey: "todos.title", lineKey: "home.todosBody" },
  { key: "pages", route: "/pages", icon: FolderOpen, labelKey: "pages.title", lineKey: "home.pagesBody" },
  { key: "finance", route: "/finance", icon: Wallet, labelKey: "finance.title", lineKey: "home.financeBody" },
  { key: "chats", route: "/chats", icon: Users, labelKey: "chats.title", lineKey: "home.chatsBody" },
  { key: "contacts", route: "/contacts", icon: BookUser, labelKey: "contacts.title", lineKey: "home.contactsBody" },
  { key: "calendar", route: "/calendar", icon: CalendarDays, labelKey: "chat.calendar", lineKey: "home.calendarBody" },
  { key: "assistant", route: "/chat", icon: Sparkles, labelKey: "chat.title", lineKey: "home.aiBody", modal: true },
  { key: "notifications", route: "/notifications", icon: Bell, labelKey: "notifications.title", lineKey: "home.notificationsBody" },
  { key: "conversations", route: { pathname: "/chat", params: { sessions: "1" } }, icon: MessageSquareText, labelKey: "chat.conversations", lineKey: "home.conversationsBody", modal: true },
];

export function appEntry(key: AppKey): AppEntry {
  const found = APP_REGISTRY.find((a) => a.key === key);
  if (!found) throw new Error(`no app "${key}"`);
  return found;
}

/**
 * A badge's text, capped the way the web caps it (chats 9+, notifications
 * 99+), or null when there is nothing to say: a "0" is a permanent red dot
 * that teaches people to ignore the badge, and an unknown count (offline, an
 * error) is not zero either.
 */
export function capBadge(count: number | undefined | null, cap: number): string | null {
  if (!count || count <= 0) return null;
  return count > cap ? `${cap}+` : String(count);
}

/** Home, from anywhere: down the stack to it, or in its place when nothing is behind (a link). */
export function goHomeFromApp(): void {
  if (router.canGoBack()) router.dismissTo("/home");
  else router.replace("/home");
}

/**
 * Open another app (SPEC §C3). Back must never cycle through every app
 * visited, and Home stays at the bottom of the stack:
 * - from Home itself, the app opens on top of it;
 * - from an app's root, the other app takes its place;
 * - from inside an app (a list, a loan), down to Home first, then the app on top;
 * - the assistant and past conversations are modals: they open over whatever is there.
 */
export function openApp(key: AppKey, from: { current: AppKey; subScreen: boolean }): void {
  const target = appEntry(key);
  if (key === from.current) {
    if (from.subScreen) router.dismissTo(target.route);
    return;
  }
  if (key === "home") return goHomeFromApp();
  if (target.modal || from.current === "home") return router.push(target.route);
  if (from.subScreen) {
    router.dismissTo("/home");
    router.push(target.route);
    return;
  }
  router.replace(target.route);
}
