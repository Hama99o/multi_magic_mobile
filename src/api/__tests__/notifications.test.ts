/**
 * The bell at the boundary.
 *
 * Two of these pin things that would have shipped quietly: a badge counted from
 * a paginated page (capping at 20, silently, for anyone with more), and an
 * avatar path that renders nothing and reports nothing.
 */
import MockAdapter from "axios-mock-adapter";
import { notificationsApi, parseNotificationEvent } from "../notifications";
import { __resetTokenCache, http } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

let mock: MockAdapter;

function row(id: number, extra: object = {}) {
  return {
    id,
    kind: "loan_due",
    title: "Anisa's loan is due",
    body: "500 due on 20 September",
    // A WEB route. Parsed, never navigated to.
    path: "/loans/31",
    read_at: null,
    created_at: "2026-09-18T08:00:00Z",
    subject_type: "Loan",
    subject_id: 31,
    actor: null,
    ...extra,
  };
}

beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
});

afterEach(() => mock.restore());

// ── THE CORRECTION, PINNED ──────────────────────────────────────────────────
//
// `index` is paginated at 20. A badge counted from its rows caps at 20 for
// anybody who has more — with no error, on a number nobody double-checks.
describe("the badge", () => {
  it("has its own endpoint, and it is not a row count", async () => {
    mock.onGet("/api/v1/notifications/unread_count").reply(200, { unread_count: 47 });

    await expect(notificationsApi.unreadCount()).resolves.toBe(47);
  });

  it("also arrives in `index`'s meta, so a cold open pays for one request", async () => {
    mock.onGet("/api/v1/notifications").reply(200, {
      notifications: [row(1), row(2)],
      meta: { pagy: { pages: 3 }, total_count: 47, unread_count: 47 },
    });

    const page = await notificationsApi.list();

    // Two rows on the page, forty-seven unread. The two numbers are not the
    // same number and must never be derived from each other.
    expect(page.notifications).toHaveLength(2);
    expect(page.unreadCount).toBe(47);
    expect(page.hasMore).toBe(true);
  });
});

describe("the actor's avatar", () => {
  it("is absolutised — the server sends a RELATIVE Active Storage path", async () => {
    mock.onGet("/api/v1/notifications").reply(200, {
      notifications: [
        row(1, {
          actor: { id: 2, name: "Anisa", avatar: "/rails/active_storage/blobs/x/p.jpg" },
        }),
      ],
      meta: { pagy: { pages: 1 }, total_count: 1, unread_count: 1 },
    });

    const page = await notificationsApi.list();

    // `<Image source={{ uri: "/rails/..." }}>` renders nothing and says nothing
    // about why — which looks for an afternoon like "the avatars are broken".
    expect(page.notifications[0].actor?.avatar).toBe(
      `${http.defaults.baseURL}/rails/active_storage/blobs/x/p.jpg`,
    );
  });

  it("is null when the app itself caused the notification", async () => {
    mock.onGet("/api/v1/notifications").reply(200, {
      notifications: [row(1)],
      meta: { pagy: { pages: 1 }, total_count: 1, unread_count: 1 },
    });

    const page = await notificationsApi.list();

    // A reminder falling due has no actor, and an avatar invented for one
    // would claim a person was involved.
    expect(page.notifications[0].actor).toBeNull();
  });
});

describe("`path`", () => {
  it("is parsed and kept, because it is the only machine-readable subject", async () => {
    mock.onGet("/api/v1/notifications").reply(200, {
      notifications: [row(1)],
      meta: { pagy: { pages: 1 }, total_count: 1, unread_count: 1 },
    });

    const page = await notificationsApi.list();

    expect(page.notifications[0].path).toBe("/loans/31");
    expect(page.notifications[0].subjectType).toBe("Loan");
    expect(page.notifications[0].subjectId).toBe(31);
  });
});

describe("the three endpoints the first draft did not know about", () => {
  it("marks one read with PATCH", async () => {
    mock.onPatch("/api/v1/notifications/1").reply(200, {
      notification: row(1, { read_at: "2026-09-18T11:00:00Z" }),
    });

    const updated = await notificationsApi.markRead(1);

    expect(updated.readAt).toBe("2026-09-18T11:00:00Z");
  });

  it("marks all read with POST read_all", async () => {
    mock.onPost("/api/v1/notifications/read_all").reply(200, { read_count: 14, unread_count: 0 });

    await notificationsApi.markAllRead();

    expect(mock.history.post[0].url).toBe("/api/v1/notifications/read_all");
  });

  it("clears ONLY what is already read, and returns the surviving unread count", async () => {
    mock
      .onDelete("/api/v1/notifications/clear")
      .reply(200, { deleted_count: 9, unread_count: 3 });

    // Three still unread, and they are still there. That scope is the whole
    // safety of the action, so the confirm says it in words too.
    await expect(notificationsApi.clearRead()).resolves.toBe(3);
  });

  it("returns the corrected badge from a single delete", async () => {
    mock.onDelete("/api/v1/notifications/1").reply(200, { unread_count: 46 });

    await expect(notificationsApi.remove(1)).resolves.toBe(46);
  });
});

describe("the live frame", () => {
  it("is WRAPPED — {notification, unread_count} — unlike ConversationChannel's", () => {
    const parsed = parseNotificationEvent({ notification: row(9), unread_count: 5 });

    expect(parsed.notification?.id).toBe(9);
    expect(parsed.unreadCount).toBe(5);
  });

  it("tolerates a frame with only the count", () => {
    expect(parseNotificationEvent({ unread_count: 0 })).toEqual({
      notification: null,
      unreadCount: 0,
    });
  });
});
