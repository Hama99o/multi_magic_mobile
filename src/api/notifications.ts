/**
 * The bell — `docs/design/notifications/SPEC.md`.
 *
 * ── WHY A NOTIFICATION DOES NOT OPEN A RECORD ─────────────────────────────
 * `path` is a **web** route (`notification_serializer.rb:6`), and this app has
 * no note screen, no loan screen and no contact screen. Building them would
 * turn four screens into forty. So `path` is parsed and never navigated to:
 * tapping a row opens the assistant with a question composed and NOT sent.
 * That is his own instruction, and it generalises — the assistant is the single
 * destination of the whole app.
 *
 * ── SIX ENDPOINTS, NOT THREE ──────────────────────────────────────────────
 * `routes.rb:197-203` adds `unread_count`, `read_all` and `clear` to the usual
 * three, and each earns its place:
 *
 *   GET  unread_count   the badge, without paying for a page of bodies
 *   POST read_all       "mark all as read"
 *   DEL  clear          deletes ONLY what is already read
 *
 * The first matters most. `index` is paginated at **20**
 * (`notifications_controller.rb:12`), so a badge counted from `index.length`
 * would cap at 20 and cost a page of rows to draw one number — which is
 * precisely what the endpoint's own comment says it exists to avoid.
 *
 * ── AND THE SCOPE HAS A FLOOR ─────────────────────────────────────────────
 * `notification.rb:46` — `scope :recent, ->(since = 90.days.ago)`. Nothing
 * older than 90 days is served at all, so "Earlier" is bounded and there is no
 * infinite history to build paging for beyond the page size.
 */
import { http } from "./http";
import { absoluteUrl } from "./conversations";
import { arr, id, num, obj, optStr, str } from "./parse";

export interface NotificationActor {
  id: number;
  name: string;
  /**
   * Absolute by the time it leaves here. The server sends a RELATIVE path —
   * `rails_blob_path(..., only_path: true)` at `notification_serializer.rb:25`
   * — and `<Image source={{ uri: "/rails/..." }}>` renders nothing and reports
   * nothing, which looks for an afternoon like "the avatars are broken".
   */
  avatar: string | null;
}

export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  /**
   * The WEB route this refers to. Kept because it is the only machine-readable
   * statement of what the notification is about — and never navigated to; see
   * this file's header.
   */
  path: string | null;
  readAt: string | null;
  createdAt: string;
  subjectType: string | null;
  subjectId: number | null;
  /** Null when the app itself caused it — a reminder falling due has no actor. */
  actor: NotificationActor | null;
}

export interface NotificationPage {
  notifications: AppNotification[];
  unreadCount: number;
  hasMore: boolean;
}

function parseActor(payload: unknown): NotificationActor | null {
  if (payload == null) return null;
  const record = obj(payload, "notification.actor");
  return {
    id: id(record.id, "notification.actor.id"),
    name: optStr(record.name) ?? "Someone",
    avatar: absoluteUrl(optStr(record.avatar)),
  };
}

function parseNotification(payload: unknown): AppNotification {
  const record = obj(payload, "notification");
  return {
    id: id(record.id, "notification.id"),
    kind: optStr(record.kind) ?? "",
    // A notification with no title has nothing to show, but it is the server's
    // to get right — an empty string renders as an empty row rather than
    // throwing away the whole page.
    title: optStr(record.title) ?? "",
    body: optStr(record.body),
    path: optStr(record.path),
    readAt: optStr(record.read_at),
    createdAt: str(record.created_at, "notification.created_at"),
    subjectType: optStr(record.subject_type),
    subjectId: typeof record.subject_id === "number" ? record.subject_id : null,
    actor: parseActor(record.actor),
  };
}

export const notificationsApi = {
  /**
   * Newest first, 20 a page, with the unread count already in `meta` — so a
   * cold open draws the badge without a second request.
   */
  list: async (page = 1): Promise<NotificationPage> => {
    const res = await http.get("/api/v1/notifications", { params: { page } });
    const record = obj(res.data, "notifications");
    const meta = obj(record.meta, "notifications.meta");
    const pagy = obj(meta.pagy, "notifications.meta.pagy");
    return {
      notifications: arr(record.notifications, "notifications.notifications").map(
        parseNotification,
      ),
      unreadCount: typeof meta.unread_count === "number" ? meta.unread_count : 0,
      hasMore: num(pagy.pages, "notifications.meta.pagy.pages") > page,
    };
  },

  /** Just the number. See this file's header. */
  unreadCount: async (): Promise<number> => {
    const res = await http.get("/api/v1/notifications/unread_count");
    return num(obj(res.data, "unread").unread_count, "unread.unread_count");
  },

  /** On TAP, not on scroll-past: scrolling past something is not reading it. */
  markRead: async (notificationId: number): Promise<AppNotification> => {
    const res = await http.patch(`/api/v1/notifications/${notificationId}`);
    return parseNotification(obj(res.data, "notification").notification);
  },

  /** Mesh's "Dismiss All Items". Returns the new unread count, which is zero. */
  markAllRead: async (): Promise<void> => {
    await http.post("/api/v1/notifications/read_all");
  },

  /**
   * One row, gone. No confirm: a notification is a copy of something that
   * happened, and the thing itself is untouched. Answers with the new unread
   * count, so the badge corrects from the response rather than a refetch.
   */
  remove: async (notificationId: number): Promise<number> => {
    const res = await http.delete(`/api/v1/notifications/${notificationId}`);
    return num(obj(res.data, "unread").unread_count, "unread.unread_count");
  },

  /**
   * Deletes **only what is already read** (`notifications_controller.rb:41`).
   * That scope is the whole safety of the action and it belongs in the label
   * too — a "Clear" that ate an unread row would be the opposite.
   */
  clearRead: async (): Promise<number> => {
    const res = await http.delete("/api/v1/notifications/clear");
    return num(obj(res.data, "cleared").unread_count, "cleared.unread_count");
  },
};

/**
 * What `NotificationChannel` pushes — `notifications/deliver.rb:63-66`.
 *
 * Note the WRAPPER KEY, unlike `ConversationChannel`'s bare message hash: the
 * frame is `{ notification: {...}, unread_count: N }`, so one frame carries
 * both the new row and the corrected badge.
 */
export interface NotificationEvent {
  notification?: unknown;
  unread_count?: number;
}

export function parseNotificationEvent(
  payload: NotificationEvent,
): { notification: AppNotification | null; unreadCount: number | null } {
  return {
    notification: payload?.notification ? parseNotification(payload.notification) : null,
    unreadCount: typeof payload?.unread_count === "number" ? payload.unread_count : null,
  };
}

export const __parse = { parseNotification };
